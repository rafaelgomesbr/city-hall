/**
 * RECUPERAÇÃO DE SENHA DO CONSOLE DO FORNECEDOR (migração 039).
 *
 * "Faz a recuperação de senha para mim, até para eu resetar a minha senha."
 * O dono do console não tem ninguém acima dele que redefina a senha, e o
 * produto não tem provedor de email. A resposta são CÓDIGOS DE RECUPERAÇÃO,
 * no molde dos códigos do segundo fator do município (022): gerados uma vez,
 * mostrados uma vez, guardados como hash, cada um válido uma vez. Usar um
 * código redefine a senha E troca o segundo fator, porque a recuperação existe
 * para o dia em que o telefone foi perdido junto com a senha.
 *
 * Roda em PGlite como o resto de `db/test/`: tudo que simula o console roda
 * com `SET LOCAL ROLE dc360_console` mais a variável `app.console_operador`
 * quando há sessão, e SEM a variável quando não há, que é exatamente a
 * situação de quem perdeu a senha.
 *
 * O bloco final é o mais importante: a função de consumir escreve SEM
 * contexto de operador e como dono das tabelas, em tabelas com RLS forçada e
 * sem policy que a alcance. Com um dono sem `BYPASSRLS`, essa escrita
 * alcançaria zero linha em silêncio (armadilha da 037), e o resultado seria
 * "senha redefinida" com a senha velha no lugar. O bloco prova que a função
 * ESTOURA em vez de fingir.
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

/** Um hash no formato do produto (`scrypt$N$r$p$sal$hash`), fixo no teste. */
const HASH = "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk";
/** Um envelope cifrado no formato de `apps/api/src/auth/cofre.ts`. */
const ENVELOPE = "v1.vetor-de-teste.selo-de-teste.segredo-cifrado-de-teste";

/**
 * Um hash de código de recuperação, distinto por rótulo e no mesmo formato do
 * hash de senha: é assim que o contrato manda guardar (o console reaproveita a
 * mesma conferência de senha, e o banco cobra a mesma forma). Oitenta e quatro
 * caracteres, acima do piso de oitenta que o CHECK exige.
 */
function hashDeTeste(rotulo: string): string {
  const sal = rotulo.padEnd(22, "s").slice(0, 22).replace(/[^A-Za-z0-9_-]/g, "_");
  const resumo = rotulo.padEnd(43, "h").slice(0, 43).replace(/[^A-Za-z0-9_-]/g, "_");
  return `scrypt$131072$8$1$${sal}$${resumo}`;
}

const DONO_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const EMAIL_DO_DONO = "dono@fornecedor.exemplo.com.br";
const EMAIL_DO_OPERADOR = "operador@fornecedor.exemplo.com.br";
const EMAIL_DO_INATIVO = "inativo@fornecedor.exemplo.com.br";
let operadorId = "";
let inativoId = "";

type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

/** Como o console executa: papel dele, e o operador da sessão na variável (ou nenhum). */
async function comoConsole<T>(operador: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_console");
    if (operador) {
      await tx.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
    }
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/** Como a API de um município executa: papel de aplicação, sem município no contexto. */
async function comoApp<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/**
 * O código SQLSTATE e a mensagem do erro, ou vazios quando não houve erro.
 *
 * O contrato com a outra frente é por CÓDIGO (DC361 pedido inválido, DC365
 * estado não permite, 42501 sem contexto onde é exigido), então é o código que
 * se afirma aqui, e não só um pedaço da mensagem.
 */
async function falhaDe(fn: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await fn();
    return { code: "", message: "" };
  } catch (erro) {
    const e = erro as { code?: string; message?: string };
    return { code: e.code ?? "", message: e.message ?? String(erro) };
  }
}

type Operador = {
  senha_hash: string;
  segundo_fator: string;
  falhas_login: number;
  bloqueado_ate: string | null;
  ultimo_passo_totp: string | null;
  papel: string;
  criado_por: string | null;
  criado_em: string;
};

/** A linha do operador, lida como dono. */
async function operador(id: string): Promise<Operador> {
  return (await db.query<Operador>(
    `SELECT senha_hash, segundo_fator, falhas_login, bloqueado_ate::text, ultimo_passo_totp::text,
            papel, criado_por, criado_em::text
       FROM console_operadores WHERE id = $1`,
    [id],
  )).rows[0]!;
}

type Codigo = { id: string; codigo_hash: string; usado_em: string | null };

/** Todos os códigos de um operador, lidos como dono, na ordem de criação. */
async function codigosDe(id: string): Promise<Codigo[]> {
  return (await db.query<Codigo>(
    `SELECT id, codigo_hash, usado_em::text FROM console_codigos_de_recuperacao
      WHERE operador_id = $1 ORDER BY criado_em, id`,
    [id],
  )).rows;
}

/** Gera códigos para um operador, pela função, com ele no contexto. */
async function renovar(quem: string, hashes: string[]): Promise<number> {
  const r = await comoConsole(quem, (tx) =>
    tx.query<{ n: number }>("SELECT console_renovar_codigos($1::text[]) AS n", [hashes]),
  );
  return r.rows[0]!.n;
}

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  /* A primeira conta nasce como o console a semeia na partida (038). */
  await comoConsole(null, (tx) =>
    tx.query(
      `INSERT INTO console_operadores (id, email, senha_hash, segundo_fator, papel)
       VALUES ($1, $2, $3, $4, 'dono')`,
      [DONO_ID, EMAIL_DO_DONO, HASH, ENVELOPE],
    ),
  );
  /* Dois operadores abaixo dele, criados pela porta do console; um é desativado. */
  for (const [email, destino] of [[EMAIL_DO_OPERADOR, "operador"], [EMAIL_DO_INATIVO, "inativo"]] as const) {
    const r = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
         VALUES ($1, $2, $3, 'operador', $4) RETURNING id`,
        [email, HASH, ENVELOPE, DONO_ID],
      ),
    );
    if (destino === "operador") operadorId = r.rows[0]!.id;
    else inativoId = r.rows[0]!.id;
  }
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/* =====================================================================
 * A ÂNCORA. Sem ela, toda recusa abaixo poderia ser ausência: "a função não
 * existe" também estoura, e o arquivo ficaria verde afirmando limites de
 * algo que não está lá.
 * ===================================================================== */
describe("A tabela e as tres funcoes existem, com a forma do contrato", () => {
  it("a tabela existe com as colunas do contrato, nesta ordem, e nada mais", async () => {
    const colunas = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'console_codigos_de_recuperacao'
        ORDER BY ordinal_position`,
    );
    expect(colunas.rows.map((c) => c.column_name)).toEqual([
      "id", "operador_id", "codigo_hash", "criado_em", "usado_em",
    ]);
  });

  it("as tres funcoes existem, sao privilegiadas, fixam o search_path e desligam o row_security", async () => {
    const r = await db.query<{ nome: string; prosecdef: boolean; config: string[] | null }>(
      `SELECT p.proname AS nome, p.prosecdef, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('console_renovar_codigos', 'console_recuperacao_por_email',
                            'console_consumir_recuperacao')
        ORDER BY 1`,
    );
    expect(r.rows.map((f) => f.nome)).toEqual([
      "console_consumir_recuperacao", "console_recuperacao_por_email", "console_renovar_codigos",
    ]);
    for (const f of r.rows) {
      expect(f.prosecdef, `${f.nome} nao e SECURITY DEFINER`).toBe(true);
      expect((f.config ?? []).some((c) => c.startsWith("search_path=")), `${f.nome} sem search_path`).toBe(true);
      /*
        `row_security = off` é a guarda da armadilha do dono sem BYPASSRLS: com
        ela, a escrita que SERIA filtrada por policy vira erro em vez de zero
        em silêncio. O bloco final deste arquivo prova o efeito; este caso
        prova que a guarda está declarada nas três.
      */
      expect((f.config ?? []).includes("row_security=off"), `${f.nome} sem row_security = off`).toBe(true);
    }
  });
});

/* =====================================================================
 * GERAR: o operador autenticado sorteia os próprios códigos, e o console
 * passa só os hashes.
 * ===================================================================== */
describe("Gerar os codigos: console_renovar_codigos", () => {
  it("sem operador no contexto, ninguem gera: 42501, e nada e escrito", async () => {
    const falha = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_renovar_codigos($1::text[])", [[1, 2, 3, 4].map((i) => hashDeTeste(`sem-ctx-${i}`))]),
      ),
    );
    expect(falha.code, "gerar codigo sem sessao passou").toBe("42501");
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM console_codigos_de_recuperacao",
    )).rows[0]!.n).toBe("0");
  });

  it("lista vazia, curta, repetida ou com hash cru e recusada com DC361, e nada e escrito", async () => {
    const quatro = [1, 2, 3, 4].map((i) => hashDeTeste(`ruim-${i}`));
    for (const [rotulo, lista] of [
      ["vazia", []],
      ["nula", null],
      ["tres", quatro.slice(0, 3)],
      ["com hash repetido", [quatro[0], quatro[0], quatro[1], quatro[2]]],
      ["com codigo em texto claro", [...quatro.slice(0, 3), "ABCDE-FGHIJ-KLMNO-PQRST"]],
      ["com hash de outro algoritmo", [...quatro.slice(0, 3), "bcrypt$2b$12$" + "x".repeat(70)]],
      ["com hash curto demais", [...quatro.slice(0, 3), "scrypt$131072$8$1$curto$curto"]],
      ["com nulo dentro", [...quatro.slice(0, 3), null]],
    ] as const) {
      const falha = await falhaDe(() =>
        comoConsole(operadorId, (tx) =>
          tx.query("SELECT console_renovar_codigos($1::text[])", [lista]),
        ),
      );
      expect(falha.code, `a lista ${rotulo} passou (${falha.message})`).toBe("DC361");
    }
    expect(await codigosDe(operadorId)).toEqual([]);
  });

  it("o operador gera os proprios codigos, e a funcao devolve quantos entraram", async () => {
    const hashes = [1, 2, 3, 4, 5].map((i) => hashDeTeste(`op-primeira-${i}`));
    expect(await renovar(operadorId, hashes)).toBe(5);

    /*
      Comparado como conjunto: os cinco entram numa instrução só, com o mesmo
      `criado_em`, e a ordem entre eles é a do uuid. Para o console a ordem não
      importa: ele confere o código digitado contra cada hash vivo.
    */
    const gravados = await codigosDe(operadorId);
    expect(gravados.map((c) => c.codigo_hash).sort()).toEqual([...hashes].sort());
    expect(gravados.every((c) => c.usado_em === null)).toBe(true);
  });

  it("gerar de novo marca os velhos como usados em vez de apaga-los: o livro conta", async () => {
    const velhos = (await codigosDe(operadorId)).map((c) => c.id);
    expect(velhos).toHaveLength(5);

    const novos = [1, 2, 3, 4].map((i) => hashDeTeste(`op-segunda-${i}`));
    expect(await renovar(operadorId, novos)).toBe(4);

    const todos = await codigosDe(operadorId);
    expect(todos, "gerar de novo apagou os velhos").toHaveLength(9);
    for (const c of todos) {
      if (velhos.includes(c.id)) {
        expect(c.usado_em, `o codigo velho ${c.id} continuou vivo depois da renovacao`).not.toBeNull();
      } else {
        expect(c.usado_em).toBeNull();
        expect(novos).toContain(c.codigo_hash);
      }
    }
  });

  it("o dono gera os dele, e os do operador nao sao tocados", async () => {
    const doOperadorAntes = await codigosDe(operadorId);
    expect(await renovar(DONO_ID, [1, 2, 3, 4, 5, 6].map((i) => hashDeTeste(`dono-primeira-${i}`)))).toBe(6);
    expect(await codigosDe(operadorId)).toEqual(doOperadorAntes);
    expect((await codigosDe(DONO_ID)).filter((c) => c.usado_em === null)).toHaveLength(6);
  });

  it("operador inativo no contexto nao gera: 42501", async () => {
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [inativoId]),
    );
    const falha = await falhaDe(() =>
      comoConsole(inativoId, (tx) =>
        tx.query("SELECT console_renovar_codigos($1::text[])", [[1, 2, 3, 4].map((i) => hashDeTeste(`inativo-${i}`))]),
      ),
    );
    expect(falha.code, "operador desativado gerou codigos").toBe("42501");
    expect(await codigosDe(inativoId)).toEqual([]);

    // E um id que nao e de ninguem tambem nao gera.
    const fantasma = await falhaDe(() =>
      comoConsole("aaaaaaaa-0000-4000-8000-00000000ffff", (tx) =>
        tx.query("SELECT console_renovar_codigos($1::text[])", [[1, 2, 3, 4].map((i) => hashDeTeste(`fantasma-${i}`))]),
      ),
    );
    expect(fantasma.code).toBe("42501");
  });
});

/* =====================================================================
 * A TABELA VISTA DO CONSOLE: cada operador só vê e só escreve o que é dele,
 * e o console não marca usado nem apaga por conta própria.
 * ===================================================================== */
describe("A tabela vista do console: cada operador so alcanca os proprios codigos", () => {
  it("operador nao ve codigo de outro, nem pedindo pelo id exato", async () => {
    const doDono = (await codigosDe(DONO_ID))[0]!.id;

    const lista = await comoConsole(operadorId, (tx) =>
      tx.query<{ operador_id: string }>("SELECT operador_id FROM console_codigos_de_recuperacao"),
    );
    expect(lista.rows.length).toBeGreaterThan(0);
    expect(lista.rows.every((c) => c.operador_id === operadorId), "o operador leu codigo do dono").toBe(true);

    const peloId = await comoConsole(operadorId, (tx) =>
      tx.query("SELECT id FROM console_codigos_de_recuperacao WHERE id = $1", [doDono]),
    );
    expect(peloId.rows).toHaveLength(0);

    // Sem contexto, a tabela e vazia: e o que a tela de login veria se olhasse.
    const semNinguem = await comoConsole(null, (tx) =>
      tx.query("SELECT id FROM console_codigos_de_recuperacao"),
    );
    expect(semNinguem.rows).toHaveLength(0);
  });

  it("operador nao insere codigo em nome de outro, e sem contexto ninguem insere", async () => {
    for (const [rotulo, quem, alvo] of [
      ["o operador, para o dono", operadorId, DONO_ID],
      ["o dono, para o operador", DONO_ID, operadorId],
      ["ninguem, para o dono", null, DONO_ID],
    ] as const) {
      const falha = await falhaDe(() =>
        comoConsole(quem, (tx) =>
          tx.query(
            "INSERT INTO console_codigos_de_recuperacao (operador_id, codigo_hash) VALUES ($1, $2)",
            [alvo, hashDeTeste(`intruso-${rotulo}`)],
          ),
        ),
      );
      expect(falha.message, `${rotulo}: inseriu`).toMatch(/row-level security/i);
    }
  });

  it("o console nao marca usado nem apaga por conta propria: so as funcoes escrevem isso", async () => {
    const alvo = (await codigosDe(operadorId)).find((c) => c.usado_em === null)!.id;
    for (const [rotulo, sql] of [
      ["marcar usado", "UPDATE console_codigos_de_recuperacao SET usado_em = now() WHERE id = $1"],
      ["desmarcar", "UPDATE console_codigos_de_recuperacao SET usado_em = NULL WHERE id = $1"],
      ["apagar", "DELETE FROM console_codigos_de_recuperacao WHERE id = $1"],
    ] as const) {
      const falha = await falhaDe(() => comoConsole(operadorId, (tx) => tx.query(sql, [alvo])));
      expect(falha.message.toLowerCase(), `o console conseguiu ${rotulo}`).toMatch(/permission denied|permissão negada/);
    }
  });

  it("hash cru nao entra nem pela mao do dono do banco", async () => {
    for (const cru of ["ABCDE-FGHIJ-KLMNO-PQRST", "sha256$" + "x".repeat(80), "scrypt$131072$8$1$curto$curto"]) {
      const falha = await falhaDe(() =>
        db.query(
          "INSERT INTO console_codigos_de_recuperacao (operador_id, codigo_hash) VALUES ($1, $2)",
          [operadorId, cru],
        ),
      );
      expect(falha.message, `entrou cru: ${cru}`).toMatch(/codigo_chega_derivado/);
    }
  });

  it("operador com codigos nao se apaga: a chave estrangeira e RESTRICT", async () => {
    const falha = await falhaDe(() =>
      db.query("DELETE FROM console_operadores WHERE id = $1", [operadorId]),
    );
    expect(falha.code, "apagar o operador levou os codigos junto").toBe("23503");
  });

  it("o papel de aplicacao de um municipio nao alcanca a tabela nem as funcoes", async () => {
    for (const sql of [
      "SELECT * FROM console_codigos_de_recuperacao",
      "SELECT * FROM console_recuperacao_por_email('dono@fornecedor.exemplo.com.br')",
      "SELECT console_renovar_codigos(ARRAY['a','b','c','d'])",
      "SELECT console_consumir_recuperacao(gen_random_uuid(), 'x', 'y')",
    ]) {
      const falha = await falhaDe(() => comoApp((tx) => tx.query(sql)));
      expect(falha.message.toLowerCase(), `dc360_app executou "${sql}"`).toMatch(/permission denied|permissão negada/);
    }
  });
});

/* =====================================================================
 * ACHAR OS CÓDIGOS PELO EMAIL: a porta de quem NÃO tem sessão.
 * ===================================================================== */
describe("Achar os codigos pelo email: console_recuperacao_por_email", () => {
  it("roda sem operador no contexto e devolve so os codigos vivos do operador ativo daquele email", async () => {
    const r = await comoConsole(null, (tx) =>
      tx.query<{ operador_id: string; codigo_id: string; codigo_hash: string }>(
        "SELECT * FROM console_recuperacao_por_email($1)", [EMAIL_DO_OPERADOR.toUpperCase()],
      ),
    );
    const vivos = (await codigosDe(operadorId)).filter((c) => c.usado_em === null);
    expect(vivos.length, "o cenario precisa de codigos vivos e gastos ao mesmo tempo").toBe(4);
    expect((await codigosDe(operadorId)).length).toBeGreaterThan(vivos.length);

    expect(r.rows.map((l) => l.codigo_id).sort()).toEqual(vivos.map((c) => c.id).sort());
    expect(r.rows.every((l) => l.operador_id === operadorId)).toBe(true);
    expect(r.rows.map((l) => l.codigo_hash).sort()).toEqual(vivos.map((c) => c.codigo_hash).sort());
  });

  it("email inexistente e operador inativo devolvem vazio, sem erro, e com a mesma forma", async () => {
    /*
      O console não pode revelar quem existe: "não achei" e "achei mas está
      inativo" precisam ser indistinguíveis de fora. Dois vazios, nenhum erro.
    */
    for (const [rotulo, email] of [
      ["inexistente", "ninguem@fornecedor.exemplo.com.br"],
      ["inativo", EMAIL_DO_INATIVO],
      ["vazio", ""],
      ["nulo", null],
    ] as const) {
      const r = await comoConsole(null, (tx) =>
        tx.query("SELECT * FROM console_recuperacao_por_email($1)", [email]),
      );
      expect(r.rows, `${rotulo}: devolveu algo`).toEqual([]);
    }
  });

  it("operador ativo SEM codigo vivo tambem devolve vazio, sem erro", async () => {
    // O inativo nunca gerou; reative-o por um instante para provar o outro lado.
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = true WHERE id = $1", [inativoId]),
    );
    const r = await comoConsole(null, (tx) =>
      tx.query("SELECT * FROM console_recuperacao_por_email($1)", [EMAIL_DO_INATIVO]),
    );
    expect(r.rows).toEqual([]);
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [inativoId]),
    );
  });

  it("a saida tem tres colunas e nada mais: nem senha_hash, nem nome, nem papel", async () => {
    /*
      Esta função é a única do banco que devolve hash de credencial SEM
      sessão. O que a mantém estreita é a forma dela no catálogo: o id do
      operador, o id do código e o hash do CÓDIGO. O hash da SENHA fica de fora
      de propósito, e é isso que o caso cobra: uma coluna a mais reprova aqui.
    */
    const r = await db.query<{ saida: string }>(
      `SELECT pg_get_function_result(p.oid) AS saida
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'console_recuperacao_por_email'`,
    );
    expect(r.rows[0]!.saida.replace(/\s+/g, " ")).toBe(
      "TABLE(operador_id uuid, codigo_id uuid, codigo_hash text)",
    );
  });
});

/* =====================================================================
 * CONSUMIR: o código gasto redefine a senha E o segundo fator, sem sessão.
 * ===================================================================== */
describe("Consumir: console_consumir_recuperacao", () => {
  const SENHA_NOVA = HASH.replace(/.$/, "N");
  const ENVELOPE_NOVO = "v1.vetor-novo.selo-novo.segredo-cifrado-novo";

  it("um codigo vivo troca a senha E o segundo fator, zera o teto e o passo, e fica gasto", async () => {
    // Deixa a conta no pior estado possível: bloqueada, com falhas e com passo queimado.
    await db.query(
      `UPDATE console_operadores
          SET falhas_login = 7, bloqueado_ate = now() + interval '1 hour', ultimo_passo_totp = 55000000
        WHERE id = $1`,
      [operadorId],
    );
    const antes = await operador(operadorId);
    expect(antes.senha_hash).toBe(HASH);
    expect(antes.segundo_fator).toBe(ENVELOPE);

    const codigo = (await codigosDe(operadorId)).find((c) => c.usado_em === null)!;
    await comoConsole(null, (tx) =>
      tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [codigo.id, SENHA_NOVA, ENVELOPE_NOVO]),
    );

    const depois = await operador(operadorId);
    expect(depois.senha_hash, "a senha nao mudou").toBe(SENHA_NOVA);
    expect(depois.segundo_fator, "o segundo fator nao mudou: o telefone perdido continuaria valendo").toBe(ENVELOPE_NOVO);
    expect(depois.falhas_login).toBe(0);
    expect(depois.bloqueado_ate).toBeNull();
    expect(depois.ultimo_passo_totp).toBeNull();

    const gasto = (await codigosDe(operadorId)).find((c) => c.id === codigo.id)!;
    expect(gasto.usado_em, "o codigo continuou vivo depois de usado").not.toBeNull();
  });

  it("consumir marca so aquele codigo: os outros continuam vivos", async () => {
    const vivos = (await codigosDe(operadorId)).filter((c) => c.usado_em === null);
    expect(vivos).toHaveLength(3);
  });

  it("o mesmo codigo de novo e recusado com DC365, e nada muda", async () => {
    const gasto = (await codigosDe(operadorId)).find((c) => c.usado_em !== null)!;
    const antes = await operador(operadorId);

    const falha = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [gasto.id, HASH, ENVELOPE]),
      ),
    );
    expect(falha.code, "o codigo valeu duas vezes").toBe("DC365");
    expect(await operador(operadorId)).toEqual(antes);
  });

  it("codigo inexistente e recusado com DC365, com a mesma mensagem do ja usado", async () => {
    /*
      A mesma mensagem, de propósito: "não existe" e "já foi usado" são a mesma
      resposta para quem está do lado de fora tentando adivinhar.
    */
    const gasto = (await codigosDe(operadorId)).find((c) => c.usado_em !== null)!;
    const jaUsado = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [gasto.id, HASH, ENVELOPE]),
      ),
    );
    const inexistente = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", ["aaaaaaaa-0000-4000-8000-00000000eeee", HASH, ENVELOPE]),
      ),
    );
    expect(inexistente.code).toBe("DC365");
    expect(inexistente.message).toBe(jaUsado.message);
  });

  it("senha em texto claro e segundo fator cru sao recusados com DC361, e o codigo continua vivo", async () => {
    const vivo = (await codigosDe(operadorId)).find((c) => c.usado_em === null)!;
    const antes = await operador(operadorId);

    for (const [rotulo, senha, fator] of [
      ["senha em texto claro", "senha-que-a-pessoa-digitou", ENVELOPE],
      ["hash de outro algoritmo", "bcrypt$2b$12$" + "x".repeat(70), ENVELOPE],
      ["senha nula", null, ENVELOPE],
      ["segredo de TOTP cru", HASH, "JBSWY3DPEHPK3PXP"],
      ["segundo fator nulo", HASH, null],
    ] as const) {
      const falha = await falhaDe(() =>
        comoConsole(null, (tx) =>
          tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [vivo.id, senha, fator]),
        ),
      );
      expect(falha.code, `${rotulo}: passou (${falha.message})`).toBe("DC361");
    }

    expect(await operador(operadorId)).toEqual(antes);
    expect((await codigosDe(operadorId)).find((c) => c.id === vivo.id)!.usado_em, "a recusa gastou o codigo").toBeNull();
  });

  it("codigo de operador inativo e recusado com DC365, e o codigo nao e gasto", async () => {
    /*
      A função por email já não devolve o código do inativo; esta é a segunda
      linha, para o dia em que alguém guardou o id de um código antes de a
      conta ser desativada.
    */
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = true WHERE id = $1", [inativoId]),
    );
    await renovar(inativoId, [1, 2, 3, 4].map((i) => hashDeTeste(`inativo-vivo-${i}`)));
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [inativoId]),
    );
    const codigo = (await codigosDe(inativoId))[0]!;

    const falha = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [codigo.id, SENHA_NOVA, ENVELOPE_NOVO]),
      ),
    );
    expect(falha.code, "conta desativada recuperou a senha").toBe("DC365");
    expect((await operador(inativoId)).senha_hash).toBe(HASH);
    expect((await codigosDe(inativoId))[0]!.usado_em).toBeNull();
  });

  it("papel, criador e data de criacao nao mudam com a recuperacao, e o dono recupera a propria senha", async () => {
    /*
      O gatilho da 038 torna `papel`, `criado_por` e `criado_em` imutáveis, e
      a função escreve por baixo dele como dono das tabelas. Este caso prova
      que ela passa pelo gatilho sem tocar no que ele guarda, e que o pedido do
      dono ("até para eu resetar a minha senha") está atendido.
    */
    const antes = await operador(DONO_ID);
    const codigo = (await codigosDe(DONO_ID)).find((c) => c.usado_em === null)!;
    await comoConsole(null, (tx) =>
      tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [codigo.id, SENHA_NOVA, ENVELOPE_NOVO]),
    );
    const depois = await operador(DONO_ID);
    expect(depois.senha_hash).toBe(SENHA_NOVA);
    expect(depois.segundo_fator).toBe(ENVELOPE_NOVO);
    expect(depois.papel).toBe(antes.papel);
    expect(depois.criado_por).toBe(antes.criado_por);
    expect(depois.criado_em).toBe(antes.criado_em);
    expect(depois.papel).toBe("dono");
  });

  it("depois de usados, os codigos somem da porta por email", async () => {
    const r = await comoConsole(null, (tx) =>
      tx.query<{ codigo_id: string }>("SELECT codigo_id FROM console_recuperacao_por_email($1)", [EMAIL_DO_DONO]),
    );
    const vivos = (await codigosDe(DONO_ID)).filter((c) => c.usado_em === null).map((c) => c.id);
    expect(vivos).toHaveLength(5);
    expect(r.rows.map((l) => l.codigo_id).sort()).toEqual(vivos.sort());
  });
});

/* =====================================================================
 * ARMADILHA 1: o dono das tabelas SEM BYPASSRLS.
 *
 * As três funções escrevem como dono das tabelas, em tabelas com RLS forçada
 * cujas policies são todas `TO dc360_console`. Um dono sem `BYPASSRLS` não
 * casa policy nenhuma e alcança ZERO linha em silêncio (037). Para a
 * recuperação, o desfecho seria "senha redefinida" com a senha velha no lugar
 * e o código ainda vivo, que é o pior dos dois mundos: a pessoa acha que
 * resolveu, e o invasor com a senha velha continua entrando.
 *
 * O PGlite roda como superusuário, então o cenário é simulado dando a função
 * a um dono não superusuário e sem `BYPASSRLS`, com privilégio em todas as
 * tabelas (para a barreira que sobra ser SÓ a RLS).
 * ===================================================================== */
describe("Armadilha 1: com o dono sem BYPASSRLS, as funcoes estouram em vez de gravar zero", () => {
  let donoDeVerdade = "";

  beforeAll(async () => {
    donoDeVerdade = (await db.query<{ o: string }>(
      "SELECT DISTINCT tableowner AS o FROM pg_tables WHERE schemaname = 'public'",
    )).rows[0]!.o;

    /*
      Privilégio em tudo, inclusive nas funções: `console_renovar_codigos`
      chama `console_operador_atual()`, que só o console executa, e sem esta
      concessão a função estouraria por falta de EXECUTE antes de chegar à
      RLS, que é a barreira que este bloco quer isolar.
    */
    await db.exec(`
      CREATE ROLE dono_sem_bypassrls NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO dono_sem_bypassrls;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO dono_sem_bypassrls;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dono_sem_bypassrls;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dono_sem_bypassrls;
    `);
  });

  afterAll(async () => {
    await db.exec(`
      ALTER FUNCTION console_consumir_recuperacao(uuid, text, text) OWNER TO ${donoDeVerdade};
      ALTER FUNCTION console_renovar_codigos(text[]) OWNER TO ${donoDeVerdade};
      ALTER FUNCTION console_recuperacao_por_email(text) OWNER TO ${donoDeVerdade};
      ALTER FUNCTION gastar_calado(uuid) OWNER TO ${donoDeVerdade};
      DROP FUNCTION gastar_calado(uuid);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dono_sem_bypassrls;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM dono_sem_bypassrls;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM dono_sem_bypassrls;
      REVOKE USAGE ON SCHEMA public FROM dono_sem_bypassrls;
      DROP ROLE dono_sem_bypassrls;
    `);
  });

  it("a ancora: uma funcao privilegiada ingenua grava ZERO em silencio nesse cenario", async () => {
    await db.exec(`
      CREATE FUNCTION gastar_calado(p_codigo uuid) RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      DECLARE n integer;
      BEGIN
        UPDATE console_codigos_de_recuperacao SET usado_em = now() WHERE id = p_codigo;
        GET DIAGNOSTICS n = ROW_COUNT;
        RETURN n;
      END $$;
      REVOKE ALL ON FUNCTION gastar_calado(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION gastar_calado(uuid) TO dc360_console;
      ALTER FUNCTION gastar_calado(uuid) OWNER TO dono_sem_bypassrls;
    `);
    const vivo = (await codigosDe(operadorId)).find((c) => c.usado_em === null)!;
    const r = await comoConsole(null, (tx) =>
      tx.query<{ n: number }>("SELECT gastar_calado($1) AS n", [vivo.id]),
    );
    expect(r.rows[0]!.n, "a ancora nao reproduziu o defeito: o cenario nao e o da armadilha").toBe(0);
    expect((await codigosDe(operadorId)).find((c) => c.id === vivo.id)!.usado_em).toBeNull();
  });

  it("consumir ESTOURA nomeando a causa, e senha, segundo fator e codigo ficam como estavam", async () => {
    await db.exec("ALTER FUNCTION console_consumir_recuperacao(uuid, text, text) OWNER TO dono_sem_bypassrls");
    const antes = await operador(operadorId);
    const vivo = (await codigosDe(operadorId)).find((c) => c.usado_em === null)!;

    const falha = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT console_consumir_recuperacao($1, $2, $3)", [vivo.id, HASH.replace(/.$/, "Q"), ENVELOPE]),
      ),
    );
    expect(falha.message, "a funcao devolveu sucesso com o dono sem BYPASSRLS").not.toBe("");
    expect(falha.message).toMatch(/BYPASSRLS/);
    expect(falha.code).toBe("DC362");

    expect(await operador(operadorId), "a funcao escreveu pela metade").toEqual(antes);
    expect((await codigosDe(operadorId)).find((c) => c.id === vivo.id)!.usado_em).toBeNull();
  });

  it("renovar ESTOURA tambem, e nenhum codigo velho e marcado nem novo e gravado", async () => {
    await db.exec("ALTER FUNCTION console_renovar_codigos(text[]) OWNER TO dono_sem_bypassrls");
    const antes = await codigosDe(operadorId);

    const falha = await falhaDe(() =>
      renovar(operadorId, [1, 2, 3, 4].map((i) => hashDeTeste(`armadilha-${i}`))),
    );
    expect(falha.code).toBe("DC362");
    expect(falha.message).toMatch(/BYPASSRLS/);
    expect(await codigosDe(operadorId)).toEqual(antes);
  });

  it("a porta por email ESTOURA em vez de dizer 'nao ha codigos'", async () => {
    /*
      Aqui o silêncio fecharia a porta (sem código, ninguém recupera), então o
      risco não é de segurança, é de diagnóstico: o dono tentaria os oito
      códigos que guardou, ouviria "inválido" oito vezes e nunca saberia que o
      defeito é do papel do banco. Estourar diz onde olhar.
    */
    await db.exec("ALTER FUNCTION console_recuperacao_por_email(text) OWNER TO dono_sem_bypassrls");
    const falha = await falhaDe(() =>
      comoConsole(null, (tx) =>
        tx.query("SELECT * FROM console_recuperacao_por_email($1)", [EMAIL_DO_OPERADOR]),
      ),
    );
    expect(falha.code).toBe("42501");
    expect(falha.message).toMatch(/row-level security/i);
  });
});
