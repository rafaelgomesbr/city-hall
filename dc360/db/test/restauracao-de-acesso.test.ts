/**
 * O FORNECEDOR RESTAURA O ACESSO DO ADMINISTRADOR DE UM MUNICÍPIO
 * (migração 055, decisão H06 B do Rafael, 26/10/2026).
 *
 * Enquanto a recuperação por email estiver desligada em produção, o
 * administrador único que perde a senha não tem saída pelo painel. O caminho
 * de suporte é uma função do banco que o console do fornecedor chama, e este
 * arquivo cobra a regra dela no banco, sem tela nenhuma no meio:
 *
 *   - só o DONO do console, com operador no contexto;
 *   - motivo escrito obrigatório (dez caracteres) e senha já derivada;
 *   - a conta é procurada DENTRO do município indicado, e só serve se for
 *     de administrador ativo: conta de outro município, de outro papel ou
 *     desativada é recusada com a mesma mensagem, e nada muda;
 *   - município suspenso recusa, e há teto de três por município em 24 h;
 *   - o caminho feliz grava senha provisória de 72 h, encerra todas as
 *     sessões da pessoa (e só dela), mata o link de recuperação pendente e
 *     escreve na trilha do município e no registro do console, sem a senha;
 *   - o registro do console é append-only: o console não insere, não altera
 *     e não apaga por fora da função, operador comum não lê, e o papel de
 *     aplicação não alcança.
 *
 * Cada recusa tem um caso-irmão em que a MESMA conta, com a condição
 * consertada, passa. É isso que prova que a recusa veio da conferência que o
 * caso nomeia, e não de outra que por acaso falhou antes.
 *
 * Roda em PGlite como o resto de `db/test/`: o superusuário ignora RLS, então
 * tudo que simula o console roda com `SET LOCAL ROLE dc360_console` e a
 * variável `app.console_operador`, exatamente como `apps/console/src/banco.ts`
 * abre a transação de escrita.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaDeMigracoes = join(aqui, "..", "migrations");
const migracoes = readdirSync(pastaDeMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(pastaDeMigracoes, f), "utf8"));

let db: PGlite;

/** Dois hashes distintos no formato do produto, montados por rótulo (nada com cara de segredo). */
function hashDeTeste(rotulo: string): string {
  const sal = rotulo.padEnd(22, "s").slice(0, 22).replace(/[^A-Za-z0-9_-]/g, "_");
  const resumo = rotulo.padEnd(43, "h").slice(0, 43).replace(/[^A-Za-z0-9_-]/g, "_");
  return `scrypt$131072$8$1$${sal}$${resumo}`;
}
const HASH_ANTIGO = hashDeTeste("senha-antiga");
const HASH_NOVO = hashDeTeste("senha-temporaria");
const ENVELOPE = "v1.vetor-de-teste.selo-de-teste.segredo-cifrado-de-teste";

const DONO_ID = "aaaaaaaa-0000-4000-8000-000000000055";
const EMAIL_DO_DONO = "dono@fornecedor.exemplo.com.br";
let operadorId = "";

const CHAMADA =
  "SELECT usuario_id, sessoes_encerradas, senha_provisoria_ate FROM console_restaurar_acesso_do_administrador($1, $2, $3, $4)";
const MOTIVO = "Chamado 2026-118: administradora perdeu a senha, identidade conferida por videochamada.";

type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

async function comoConsole<T>(operador: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_console");
    if (operador) {
      await tx.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
    }
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

async function comoApp<T>(orgId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (orgId) await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgId]);
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

type Falha = { code: string; message: string; detail: string };
async function falhaDe(fn: () => Promise<unknown>): Promise<Falha> {
  try {
    await fn();
    return { code: "", message: "", detail: "" };
  } catch (erro) {
    const e = erro as { code?: string; message?: string; detail?: string };
    return { code: e.code ?? "", message: e.message ?? String(erro), detail: e.detail ?? "" };
  }
}

type Resultado = { usuario_id: string; sessoes_encerradas: number; senha_provisoria_ate: string };

function restaurar(
  operador: string | null, org: string, email: string, motivo = MOTIVO, hash = HASH_NOVO,
): Promise<Resultado> {
  return comoConsole(operador, async (tx) =>
    (await tx.query<Resultado>(CHAMADA, [org, email, hash, motivo])).rows[0]!);
}

let sequencia = 0;
async function criarMunicipio(nome: string): Promise<string> {
  return (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $2, 'MG') RETURNING id",
    [`Defesa Civil de ${nome}`, nome],
  )).rows[0]!.id;
}

async function criarUsuario(
  org: string, papel: string, email: string, ativo = true,
): Promise<string> {
  sequencia += 1;
  return (await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash, ativo,
                           falhas_login, bloqueado_ate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 4, now() + interval '10 minutes') RETURNING id`,
    [org, `Pessoa ${sequencia}`, `M-${sequencia}`, email, papel, HASH_ANTIGO, ativo],
  )).rows[0]!.id;
}

async function abrirSessao(org: string, usuario: string): Promise<string> {
  sequencia += 1;
  return (await db.query<{ id: string }>(
    `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
     VALUES ($1, $2, $3, now() + interval '8 hours') RETURNING id`,
    [org, usuario, `sessao-restauracao-${sequencia}`],
  )).rows[0]!.id;
}

type Conta = {
  senha_hash: string; senha_provisoria_ate: string | null; falhas_login: number;
  bloqueado_ate: string | null; ativo: boolean; papel: string;
};
async function conta(id: string): Promise<Conta> {
  return (await db.query<Conta>(
    `SELECT senha_hash, senha_provisoria_ate::text, falhas_login, bloqueado_ate::text, ativo, papel
       FROM usuarios WHERE id = $1`, [id],
  )).rows[0]!;
}

async function sessoesAbertas(usuario: string): Promise<number> {
  return Number((await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [usuario],
  )).rows[0]!.n);
}

async function trilhaDeRestauracao(org: string): Promise<Array<Record<string, unknown>>> {
  return (await db.query<Record<string, unknown>>(
    `SELECT autor_id, autor_nome, autor_papel, alvo_tipo, alvo_id, depois, depois::text AS depois_texto
       FROM trilha_administrativa
      WHERE organizacao_id = $1 AND acao = 'acesso_do_administrador_restaurado_pelo_fornecedor'
      ORDER BY registrado_em`, [org],
  )).rows;
}

async function registros(org: string): Promise<number> {
  return Number((await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM restauracoes_de_acesso WHERE organizacao_id = $1", [org],
  )).rows[0]!.n);
}

/** Nada mudou na conta, nas sessões, na trilha e no registro: a recusa não escreveu nada. */
async function nadaMudou(org: string, usuario: string, sessoes: number): Promise<void> {
  const c = await conta(usuario);
  expect(c.senha_hash, "a recusa trocou a senha").toBe(HASH_ANTIGO);
  expect(c.senha_provisoria_ate, "a recusa carimbou senha provisória").toBeNull();
  expect(c.falhas_login, "a recusa zerou o castigo de tentativas").toBe(4);
  expect(await sessoesAbertas(usuario), "a recusa derrubou sessão").toBe(sessoes);
  expect(await trilhaDeRestauracao(org), "a recusa escreveu na trilha").toHaveLength(0);
  expect(await registros(org), "a recusa escreveu no registro do console").toBe(0);
}

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  await comoConsole(null, (tx) =>
    tx.query(
      `INSERT INTO console_operadores (id, email, senha_hash, segundo_fator, papel)
       VALUES ($1, $2, $3, $4, 'dono')`,
      [DONO_ID, EMAIL_DO_DONO, HASH_ANTIGO, ENVELOPE],
    ),
  );
  operadorId = await comoConsole(DONO_ID, async (tx) =>
    (await tx.query<{ id: string }>(
      `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
       VALUES ('operador@fornecedor.exemplo.com.br', $1, $2, 'operador', $3) RETURNING id`,
      [HASH_ANTIGO, ENVELOPE, DONO_ID],
    )).rows[0]!.id);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("O caminho feliz", () => {
  it("senha provisória de 72 h, sessões da pessoa encerradas, trilha e registro sem a senha", async () => {
    const org = await criarMunicipio("Pedra Clara");
    const vizinho = await criarMunicipio("Pedra Escura");
    const admin = await criarUsuario(org, "administrador", "rosa@pedraclara.mg.gov.br");
    const colega = await criarUsuario(org, "coordenador", "caio@pedraclara.mg.gov.br");
    const doVizinho = await criarUsuario(vizinho, "administrador", "ana@pedraescura.mg.gov.br");
    await abrirSessao(org, admin);
    await abrirSessao(org, admin);
    await abrirSessao(org, colega);
    await abrirSessao(vizinho, doVizinho);
    await db.query(
      `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, 'recuperacao-pendente-da-rosa', now() + interval '1 hour')`,
      [org, admin],
    );

    const r = await restaurar(DONO_ID, org, "  ROSA@pedraclara.mg.gov.br ");

    expect(r.usuario_id).toBe(admin);
    expect(r.sessoes_encerradas).toBe(2);

    const c = await conta(admin);
    expect(c.senha_hash).toBe(HASH_NOVO);
    expect(c.falhas_login, "o castigo de tentativas não zerou").toBe(0);
    expect(c.bloqueado_ate).toBeNull();
    expect(c.senha_provisoria_ate, "a senha não ficou provisória").not.toBeNull();
    const horas = (new Date(c.senha_provisoria_ate!).getTime() - Date.now()) / 3_600_000;
    expect(horas, "a validade não é a mesma da redefinição pelo painel (72 h)").toBeGreaterThan(71.9);
    expect(horas).toBeLessThanOrEqual(72);
    expect(new Date(r.senha_provisoria_ate).getTime()).toBe(new Date(c.senha_provisoria_ate!).getTime());

    // O login enxerga a senha provisória, e é isso que leva à troca obrigatória na API.
    const login = await comoApp(null, async (tx) => (await tx.query<{ senha_provisoria_ate: string | null }>(
      "SELECT senha_provisoria_ate FROM credenciais_para_login($1)", ["rosa@pedraclara.mg.gov.br"],
    )).rows[0]!);
    expect(login.senha_provisoria_ate).not.toBeNull();

    // Só as sessões da pessoa caíram, com o motivo gravado.
    expect(await sessoesAbertas(admin)).toBe(0);
    expect(await sessoesAbertas(colega), "derrubou a sessão de outra pessoa do município").toBe(1);
    expect(await sessoesAbertas(doVizinho), "derrubou sessão de outro município").toBe(1);
    const motivos = (await db.query<{ motivo_revogacao: string }>(
      "SELECT DISTINCT motivo_revogacao FROM sessoes WHERE usuario_id = $1", [admin],
    )).rows.map((l) => l.motivo_revogacao);
    expect(motivos).toEqual(["acesso restaurado pelo fornecedor"]);

    // O link de recuperação pendente morreu junto (gatilho da 051).
    const link = (await db.query<{ usada_em: string | null }>(
      "SELECT usada_em FROM recuperacoes_senha WHERE token_hash = 'recuperacao-pendente-da-rosa'",
    )).rows[0]!;
    expect(link.usada_em, "o link de recuperação pendente continuou vivo").not.toBeNull();

    // A trilha do município: quem do fornecedor, sobre quem, por que. Nunca a senha.
    const trilha = await trilhaDeRestauracao(org);
    expect(trilha).toHaveLength(1);
    expect(trilha[0]!.autor_id).toBeNull();
    expect(trilha[0]!.autor_nome).toBe(EMAIL_DO_DONO);
    expect(trilha[0]!.autor_papel).toBe("operador_da_plataforma");
    expect(trilha[0]!.alvo_tipo).toBe("usuario");
    expect(trilha[0]!.alvo_id).toBe(admin);
    const depois = trilha[0]!.depois as Record<string, unknown>;
    expect(depois.motivo).toBe(MOTIVO);
    expect(depois.sessoes_encerradas).toBe(2);
    expect(depois.origem).toBe("console_do_fornecedor");
    const texto = String(trilha[0]!.depois_texto);
    expect(texto, "a trilha carregou o hash da senha").not.toContain(HASH_NOVO);
    expect(texto, "a trilha carregou algo com cara de hash").not.toContain("scrypt");
    expect(await trilhaDeRestauracao(vizinho)).toHaveLength(0);

    // O registro do console.
    const linha = (await db.query<Record<string, unknown>>(
      "SELECT * FROM restauracoes_de_acesso WHERE organizacao_id = $1", [org],
    )).rows;
    expect(linha).toHaveLength(1);
    expect(linha[0]!.operador_id).toBe(DONO_ID);
    expect(linha[0]!.operador_email).toBe(EMAIL_DO_DONO);
    expect(linha[0]!.motivo).toBe(MOTIVO);
    expect(linha[0]!.sessoes_encerradas).toBe(2);
    expect(JSON.stringify(linha[0]), "o registro carregou a senha ou o hash").not.toContain("scrypt");
    expect(Object.keys(linha[0]!).sort(), "o registro ganhou coluna sem passar por esta revisão").toEqual([
      "id", "motivo", "operador_email", "operador_id", "organizacao_id", "registrado_em",
      "senha_provisoria_ate", "sessoes_encerradas",
    ]);
  });
});

describe("As recusas, cada uma com o caso-irmão que passa", () => {
  it("operador comum não restaura, e sem operador no contexto ninguém restaura", async () => {
    const org = await criarMunicipio("Lagoa Funda");
    const admin = await criarUsuario(org, "administrador", "lia@lagoafunda.mg.gov.br");
    await abrirSessao(org, admin);

    const doOperador = await falhaDe(() => restaurar(operadorId, org, "lia@lagoafunda.mg.gov.br"));
    expect(doOperador.code).toBe("42501");
    const semNinguem = await falhaDe(() => restaurar(null, org, "lia@lagoafunda.mg.gov.br"));
    expect(semNinguem.code).toBe("42501");
    await nadaMudou(org, admin, 1);

    // O papel de aplicação de um município também não alcança a função.
    const daApp = await falhaDe(() => comoApp(org, (tx) =>
      tx.query(CHAMADA, [org, "lia@lagoafunda.mg.gov.br", HASH_NOVO, MOTIVO])));
    expect(daApp.message.toLowerCase()).toMatch(/permission denied|permissão negada/);
    await nadaMudou(org, admin, 1);

    // Caso-irmão: a mesma conta, pelo dono, passa.
    expect((await restaurar(DONO_ID, org, "lia@lagoafunda.mg.gov.br")).usuario_id).toBe(admin);
  });

  it("sem motivo, com motivo curto ou com a senha em texto claro, recusa e não escreve", async () => {
    const org = await criarMunicipio("Rio Manso");
    const admin = await criarUsuario(org, "administrador", "noe@riomanso.mg.gov.br");
    await abrirSessao(org, admin);

    for (const motivo of ["", "   ", "curto", "   nove   9"]) {
      const f = await falhaDe(() => restaurar(DONO_ID, org, "noe@riomanso.mg.gov.br", motivo));
      expect(f.code, `motivo ${JSON.stringify(motivo)} passou`).toBe("DC361");
    }
    const nulo = await falhaDe(() => comoConsole(DONO_ID, (tx) =>
      tx.query(CHAMADA, [org, "noe@riomanso.mg.gov.br", HASH_NOVO, null])));
    expect(nulo.code).toBe("DC361");
    const claro = await falhaDe(() =>
      restaurar(DONO_ID, org, "noe@riomanso.mg.gov.br", MOTIVO, "senha-em-texto-claro-123"));
    expect(claro.code).toBe("DC361");
    await nadaMudou(org, admin, 1);

    // Caso-irmão: dez caracteres escritos bastam.
    expect((await restaurar(DONO_ID, org, "noe@riomanso.mg.gov.br", "Chamado 42")).usuario_id).toBe(admin);
  });

  it("conta de outro papel no mesmo município: recusa, e não diz o papel", async () => {
    const org = await criarMunicipio("Serra do Vento");
    const admin = await criarUsuario(org, "administrador", "vera@serradovento.mg.gov.br");
    for (const papel of ["coordenador", "operador", "agente_campo"]) {
      const id = await criarUsuario(org, papel, `${papel}@serradovento.mg.gov.br`);
      await abrirSessao(org, id);
      const f = await falhaDe(() => restaurar(DONO_ID, org, `${papel}@serradovento.mg.gov.br`));
      expect(f.code, `${papel} foi restaurado como se fosse administrador`).toBe("DC364");
      expect(f.message).toBe("Nao ha administrador ativo com este email neste municipio.");
      expect(f.message, "a mensagem entregou o papel ao console").not.toContain(papel);
      expect(f.detail).toContain("papel dela nao e administrador");
      await nadaMudou(org, id, 1);
    }
    // Caso-irmão: o administrador do mesmo município passa.
    expect((await restaurar(DONO_ID, org, "vera@serradovento.mg.gov.br")).usuario_id).toBe(admin);
  });

  it("administrador de OUTRO município: recusa como conta inexistente, e nada muda nos dois", async () => {
    const indicado = await criarMunicipio("Campo Alegre");
    const outro = await criarMunicipio("Campo Triste");
    const doIndicado = await criarUsuario(indicado, "administrador", "ivo@campoalegre.mg.gov.br");
    const doOutro = await criarUsuario(outro, "administrador", "eva@campotriste.mg.gov.br");
    await abrirSessao(outro, doOutro);

    const cruzado = await falhaDe(() => restaurar(DONO_ID, indicado, "eva@campotriste.mg.gov.br"));
    const inexistente = await falhaDe(() => restaurar(DONO_ID, indicado, "ninguem@campoalegre.mg.gov.br"));
    expect(cruzado.code).toBe("DC364");
    expect(cruzado.detail).toBe("nenhuma conta com este email neste municipio");
    expect(
      { code: cruzado.code, message: cruzado.message, detail: cruzado.detail },
      "a conta de outro município recebeu resposta diferente da conta que não existe: oráculo de existência",
    ).toEqual({ code: inexistente.code, message: inexistente.message, detail: inexistente.detail });
    await nadaMudou(outro, doOutro, 1);
    expect((await conta(doIndicado)).senha_hash).toBe(HASH_ANTIGO);
    expect(await registros(indicado)).toBe(0);

    // Caso-irmão: a mesma conta, com o município DELA indicado, passa.
    expect((await restaurar(DONO_ID, outro, "eva@campotriste.mg.gov.br")).usuario_id).toBe(doOutro);
  });

  it("administrador desativado: recusa, e reativado passa", async () => {
    const org = await criarMunicipio("Vale Verde");
    await criarUsuario(org, "administrador", "titular@valeverde.mg.gov.br");
    const inativo = await criarUsuario(org, "administrador", "antigo@valeverde.mg.gov.br", false);

    const f = await falhaDe(() => restaurar(DONO_ID, org, "antigo@valeverde.mg.gov.br"));
    expect(f.code).toBe("DC364");
    expect(f.message).toBe("Nao ha administrador ativo com este email neste municipio.");
    expect(f.detail).toBe("a conta de administrador esta desativada");
    await nadaMudou(org, inativo, 0);

    // Caso-irmão: a mesma conta, reativada pelo município, passa.
    await db.query("UPDATE usuarios SET ativo = true WHERE id = $1", [inativo]);
    expect((await restaurar(DONO_ID, org, "antigo@valeverde.mg.gov.br")).usuario_id).toBe(inativo);
  });

  it("município suspenso, eliminado ou inexistente: recusa", async () => {
    const org = await criarMunicipio("Ponte Nova do Sul");
    const admin = await criarUsuario(org, "administrador", "lara@pontenova.mg.gov.br");
    await comoConsole(DONO_ID, (tx) =>
      tx.query("SELECT console_suspender_municipio($1, 'Contrato em revisao')", [org]));

    const suspenso = await falhaDe(() => restaurar(DONO_ID, org, "lara@pontenova.mg.gov.br"));
    expect(suspenso.code).toBe("DC365");
    expect(suspenso.message).toContain("suspenso");
    await nadaMudou(org, admin, 0);

    const inexistente = await falhaDe(() =>
      restaurar(DONO_ID, "00000000-0000-4000-8000-0000000000ff", "lara@pontenova.mg.gov.br"));
    expect(inexistente.code).toBe("DC364");

    // Caso-irmão: reativado, passa.
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_reativar_municipio($1)", [org]));
    expect((await restaurar(DONO_ID, org, "lara@pontenova.mg.gov.br")).usuario_id).toBe(admin);
  });

  it("o teto: três por município em 24 horas, e o vizinho não divide o teto", async () => {
    const org = await criarMunicipio("Boa Esperanca do Norte");
    const vizinho = await criarMunicipio("Boa Esperanca do Sul");
    await criarUsuario(org, "administrador", "joao@boaesperanca-n.mg.gov.br");
    const doVizinho = await criarUsuario(vizinho, "administrador", "jo@boaesperanca-s.mg.gov.br");

    for (let i = 0; i < 3; i += 1) await restaurar(DONO_ID, org, "joao@boaesperanca-n.mg.gov.br");
    const quarta = await falhaDe(() => restaurar(DONO_ID, org, "joao@boaesperanca-n.mg.gov.br"));
    expect(quarta.code).toBe("DC365");
    expect(quarta.message).toContain("3 restauracoes");
    expect(await registros(org)).toBe(3);

    expect((await restaurar(DONO_ID, vizinho, "jo@boaesperanca-s.mg.gov.br")).usuario_id).toBe(doVizinho);

    // Passadas as 24 horas, volta a valer.
    await db.query(
      "UPDATE restauracoes_de_acesso SET registrado_em = now() - interval '25 hours' WHERE organizacao_id = $1",
      [org],
    );
    await restaurar(DONO_ID, org, "joao@boaesperanca-n.mg.gov.br");
  });
});

describe("O registro do console é append-only e só o dono lê", () => {
  it("o console não insere, não altera e não apaga por fora da função", async () => {
    const org = await criarMunicipio("Cachoeira Fria");
    await criarUsuario(org, "administrador", "dora@cachoeirafria.mg.gov.br");
    await restaurar(DONO_ID, org, "dora@cachoeirafria.mg.gov.br");

    const tentativas = [
      ["INSERT", `INSERT INTO restauracoes_de_acesso
                    (organizacao_id, operador_id, operador_email, motivo, sessoes_encerradas, senha_provisoria_ate)
                  VALUES ($1, $2, 'x@y.z', 'motivo inventado por fora', 0, now())`, [org, DONO_ID]],
      ["UPDATE", "UPDATE restauracoes_de_acesso SET motivo = 'reescrito depois do fato' WHERE organizacao_id = $1", [org]],
      ["DELETE", "DELETE FROM restauracoes_de_acesso WHERE organizacao_id = $1", [org]],
    ] as const;
    for (const [comando, sql, params] of tentativas) {
      const f = await falhaDe(() => comoConsole(DONO_ID, (tx) => tx.query(sql, [...params])));
      expect(f.message.toLowerCase(), `o console conseguiu ${comando} no registro`).toMatch(/permission denied|permissão negada/);
    }
    const linhas = (await db.query<{ motivo: string }>(
      "SELECT motivo FROM restauracoes_de_acesso WHERE organizacao_id = $1", [org],
    )).rows;
    expect(linhas.map((l) => l.motivo)).toEqual([MOTIVO]);
  });

  it("o dono lê, o operador comum lê zero linhas, e o papel de aplicação não lê", async () => {
    const org = await criarMunicipio("Morro Azul");
    await criarUsuario(org, "administrador", "rui@morroazul.mg.gov.br");
    await restaurar(DONO_ID, org, "rui@morroazul.mg.gov.br");
    const ler = "SELECT motivo FROM restauracoes_de_acesso WHERE organizacao_id = $1";

    expect((await comoConsole(DONO_ID, (tx) => tx.query(ler, [org]))).rows).toHaveLength(1);
    expect((await comoConsole(operadorId, (tx) => tx.query(ler, [org]))).rows,
      "operador comum leu o registro de restauracoes").toHaveLength(0);
    expect((await comoConsole(null, (tx) => tx.query(ler, [org]))).rows).toHaveLength(0);
    const daApp = await falhaDe(() => comoApp(org, (tx) => tx.query(ler, [org])));
    expect(daApp.message.toLowerCase(), "o papel de aplicação leu o registro do console")
      .toMatch(/permission denied|permissão negada/);
  });

  it("a forma da função no catálogo: definidora, caminho fixo, RLS desligada por dentro, só o console executa", async () => {
    const r = (await db.query<{ prosecdef: boolean; config: string[]; acl: string }>(
      `SELECT p.prosecdef, p.proconfig AS config, array_to_string(p.proacl, ',') AS acl
         FROM pg_proc p WHERE p.proname = 'console_restaurar_acesso_do_administrador'`,
    )).rows;
    expect(r).toHaveLength(1);
    expect(r[0]!.prosecdef).toBe(true);
    expect(r[0]!.config).toEqual(expect.arrayContaining(["search_path=public, pg_temp", "row_security=off"]));
    const quem = r[0]!.acl.split(",").map((e) => e.split("=")[0]).filter((p) => p !== "");
    const dono = (await db.query<{ u: string }>("SELECT current_user AS u")).rows[0]!.u;
    expect(quem.filter((p) => p !== dono).sort(), "a função ficou executável por mais alguém").toEqual(["dc360_console"]);
    expect(r[0]!.acl, "a função ficou executável por PUBLIC").not.toMatch(/(^|,)=X/);
  });
});
