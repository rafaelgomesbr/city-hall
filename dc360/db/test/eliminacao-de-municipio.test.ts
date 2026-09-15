/**
 * SUSPENSÃO, ELIMINAÇÃO COM PRAZO DE ARREPENDIMENTO E OS OPERADORES DO CONSOLE
 * (migração 038).
 *
 * A regra que organiza o desenho inteiro, e que este arquivo cobra caso a
 * caso: o console só escreve INTENÇÃO. Ele suspende, agenda e cancela. Quem
 * executa o irreversível é o relógio da API, guardado pelo estado no banco, e
 * cada fase fica num livro que SOBREVIVE ao apagamento.
 *
 * Roda em PGlite como o resto de `db/test/`: o superusuário ignora RLS, então
 * tudo que simula o console roda com `SET LOCAL ROLE dc360_console` mais a
 * variável `app.console_operador`, e tudo que simula o relógio roda com
 * `SET LOCAL ROLE dc360_app` e sem município no contexto, que é exatamente a
 * situação em que ele roda em produção.
 *
 * O caso mais importante do arquivo é o último bloco: com o dono das tabelas
 * SEM `BYPASSRLS`, uma função privilegiada que apaga linha em tabela com RLS
 * forçada e sem policy de DELETE apaga ZERO em silêncio (migração 037 conta a
 * história em `notificacoes_enviadas`). Um apagamento pela metade e calado é o
 * pior desfecho possível desta feature, e o bloco prova que a função ESTOURA
 * nomeando a tabela em vez de devolver sucesso com linhas sobrando.
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

const DONO_ID = "aaaaaaaa-0000-4000-8000-000000000001";
let operadorId = "";
let outroOperadorId = "";

type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

/** Como o console executa: papel dele, e o operador da sessão na variável. */
async function comoConsole<T>(operador: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_console");
    if (operador) {
      await tx.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
    }
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/** Como a API executa: papel de aplicação, com ou sem município no contexto. */
async function comoApp<T>(orgId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (orgId) {
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgId]);
    }
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/** A mensagem do erro, ou vazio quando não houve erro. */
async function mensagemDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

/** Um município novo, criado como dono, com nome único no arquivo. */
async function criarMunicipio(nome: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $2, 'MG') RETURNING id",
    [`Defesa Civil de ${nome}`, nome],
  );
  return r.rows[0]!.id;
}

/**
 * As tabelas de negócio, perguntadas ao catálogo: toda tabela com a coluna
 * `organizacao_id`, menos o livro, que carrega a coluna sem chave estrangeira
 * justamente para FICAR quando o resto sai. É a mesma pergunta que a função de
 * eliminar faz antes de apagar, e é o que faz uma tabela criada amanhã entrar
 * aqui sozinha.
 */
async function tabelasComMunicipio(): Promise<string[]> {
  const r = await db.query<{ t: string }>(`
    SELECT c.table_name AS t
      FROM information_schema.columns c
      JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
     WHERE c.table_schema = 'public' AND c.column_name = 'organizacao_id'
       AND k.relkind IN ('r', 'p')
       AND c.table_name <> 'eliminacoes_de_municipio'
     ORDER BY 1
  `);
  return r.rows.map((l) => l.t);
}

/** Quantas linhas cada tabela de negócio tem para um município, como dono. */
async function contagens(org: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  for (const t of await tabelasComMunicipio()) {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${t} WHERE organizacao_id = $1`, [org],
    );
    mapa.set(t, Number(r.rows[0]!.n));
  }
  return mapa;
}

/**
 * Semeia UMA LINHA EM CADA TABELA DE NEGÓCIO de um município, como dono.
 *
 * Isto é o que faz o caso de eliminação valer alguma coisa: apagar um
 * município vazio prova que a função roda, não que ela apaga. A ordem aqui é
 * a das chaves estrangeiras na direção de CRIAR (pai antes de filho), que é a
 * inversa da que a função precisa para apagar.
 *
 * O apelido entra em tudo que é único no produto inteiro (email de login, hash
 * de token de sessão, de recuperação e de envio de ofício), porque dois
 * municípios semeados iguais colidiriam nessas unicidades globais.
 */
async function semearMunicipio(org: string, apelido: string): Promise<void> {
  const q = <T = Record<string, unknown>>(sql: string, p: unknown[]) => db.query<T>(sql, p);

  const eq = (await q<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe Alfa') RETURNING id", [org],
  )).rows[0]!.id;
  const u = (await q<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1, 'Servidor Semeado', 'SM-1', $2, 'administrador', $3, $4) RETURNING id`,
    [org, `${apelido}-servidor@exemplo.gov.br`, eq, HASH],
  )).rows[0]!.id;

  const oc = (await q<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada,
        descricao, equipe_id)
     VALUES ($1, '000001/2026', 'deslizamento', 'em_campo', 'Rua das Acácias, 245',
             'Fulano de Tal', 'telefone', 'Relato semeado', $2) RETURNING id`,
    [org, eq],
  )).rows[0]!.id;
  /* A segunda aponta para a primeira: exercita a chave estrangeira da própria
     tabela para ela mesma, que é a única auto-referência do esquema. */
  await q(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada,
        descricao, vinculada_a)
     VALUES ($1, '000002/2026', 'granizo', 'registrada', 'Rua das Acácias, 250',
             'Beltrano', 'telefone', 'Relato vinculado', $2)`,
    [org, oc],
  );
  await q("INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1, 2026, 2)", [org]);

  const v = (await q<{ id: string }>(
    `INSERT INTO vistorias
       (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome, coletada_em,
        idempotency_key, equipe_designada_id, equipe_do_agente_id)
     VALUES ($1, $2, $3, '[]'::jsonb, 'Marilda Souza Prado', now(), gen_random_uuid(), $4, $4)
     RETURNING id`,
    [org, oc, u, eq],
  )).rows[0]!.id;
  /* O gatilho `vistoria_toca_o_sino` (018) acabou de criar o aviso. */
  const aviso = (await q<{ id: string }>(
    "SELECT id FROM avisos WHERE organizacao_id = $1 LIMIT 1", [org],
  )).rows[0]!.id;
  await q(
    "INSERT INTO avisos_lidos (organizacao_id, aviso_id, usuario_id) VALUES ($1, $2, $3)",
    [org, aviso, u],
  );

  const ev = (await q<{ id: string }>(
    `INSERT INTO evidencias
       (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, capturada_em, anexada_por)
     VALUES ($1, $2, $3, $4, now(), $5) RETURNING id`,
    [org, oc, v, `tenant/${org}/ocorrencias/${oc}/foto-semeada.jpg`, u],
  )).rows[0]!.id;
  await q(
    `INSERT INTO vistoria_evidencias_perdidas
       (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em)
     VALUES ($1, $2, 'foto-perdida-semeada', 'foto', now())`,
    [org, v],
  );
  await q(
    `INSERT INTO objetos_orfaos
       (organizacao_id, varredura_id, chave, tamanho_bytes, especie, evidencia_id)
     VALUES ($1, gen_random_uuid(), $2, 1024, 'envio_nunca_confirmado', $3)`,
    [org, `tenant/${org}/ocorrencias/${oc}/orfao.jpg`, ev],
  );

  /* O gatilho `providencia_amarra_no_catalogo` (017) cria o órgão. */
  const prov = (await q<{ id: string; orgao_id: string }>(
    `INSERT INTO providencias
       (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
     VALUES ($1, $2, 'Secretaria de Obras', 'Escorar o talude.', 'Servidor Semeado',
             now() + interval '5 days') RETURNING id, orgao_id`,
    [org, oc],
  )).rows[0]!;
  await q(
    "UPDATE orgaos SET email = $2 WHERE id = $1",
    [prov.orgao_id, `obras@${apelido}.exemplo.gov.br`],
  );
  await q(
    `INSERT INTO vistoria_orgaos_indicados (organizacao_id, vistoria_id, orgao_id, nome)
     VALUES ($1, $2, $3, 'Secretaria de Obras')`,
    [org, v, prov.orgao_id],
  );
  await q("INSERT INTO oficio_sequencias (organizacao_id, ano, ultimo) VALUES ($1, 2026, 1)", [org]);
  const oficio = (await q<{ id: string }>(
    `INSERT INTO oficios
       (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano, emitido_por,
        emitido_por_nome)
     VALUES ($1, $2, $3, $4, '000001/2026', 2026, $5, 'Servidor Semeado') RETURNING id`,
    [org, oc, prov.id, prov.orgao_id, u],
  )).rows[0]!.id;
  const envio = (await q<{ id: string }>(
    `INSERT INTO oficio_envios
       (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash, expira_em,
        solicitado_por, solicitado_por_nome)
     VALUES ($1, $2, 1, $3, $4, now() + interval '3 days', $5, 'Servidor Semeado')
     RETURNING id`,
    [org, oficio, `obras@${apelido}.exemplo.gov.br`, `envio-${apelido}`, u],
  )).rows[0]!.id;
  await q(
    `INSERT INTO oficio_aberturas (organizacao_id, oficio_id, envio_id, resultado)
     VALUES ($1, $2, $3, 'entregue')`,
    [org, oficio, envio],
  );

  await q(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em)
     VALUES ($1, $2, 'registro', $3, 'Servidor Semeado', 'administrador', 'escritorio', now())`,
    [org, oc, u],
  );
  await q(
    `INSERT INTO trilha_administrativa
       (organizacao_id, autor_id, autor_nome, autor_papel, acao, alvo_tipo, alvo_id, alvo_nome)
     VALUES ($1, $2, 'Servidor Semeado', 'administrador', 'usuario_criado', 'usuario', $2,
             'Servidor Semeado')`,
    [org, u],
  );
  await q(
    `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
     VALUES ($1, $2, $3, now() + interval '8 hours')`,
    [org, u, `sessao-${apelido}`],
  );
  await q(
    `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [org, u, `recuperacao-${apelido}`],
  );
  const ap = (await q<{ id: string }>(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
     VALUES ($1, $2, 'android', $3) RETURNING id`,
    [org, u, `ficha-${apelido}`],
  )).rows[0]!.id;
  await q(
    `INSERT INTO notificacoes_enviadas (organizacao_id, aparelho_id, ocorrencia_id, tipo)
     VALUES ($1, $2, $3, 'tarefa_nova')`,
    [org, ap, oc],
  );
  await q(
    `INSERT INTO segundo_fator (organizacao_id, usuario_id, segredo_cifrado, confirmado_em)
     VALUES ($1, $2, $3, now())`,
    [org, u, ENVELOPE],
  );
  await q(
    `INSERT INTO segundo_fator_recuperacao (organizacao_id, usuario_id, codigo_hash)
     VALUES ($1, $2, $3)`,
    [org, u, "c".repeat(43)],
  );
  await q(
    `INSERT INTO exportacoes (organizacao_id, usuario_id, usuario_nome, tipo, total_registros)
     VALUES ($1, $2, 'Servidor Semeado', 'ocorrencias', 2)`,
    [org, u],
  );
  await q(
    `INSERT INTO ocorrencia_consultas
       (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel, recurso, finalidade)
     VALUES ($1, $2, $3, 'Servidor Semeado', 'administrador', 'ocorrencia_detalhe', 'atendimento')`,
    [org, oc, u],
  );
  await q(
    `INSERT INTO devolucoes_de_tarefa
       (organizacao_id, ocorrencia_id, devolvida_por, equipe_id, motivo, prazo_em, decidida_em,
        idempotency_key)
     VALUES ($1, $2, $3, $4, 'acesso_impedido', now() - interval '1 hour', now(),
             gen_random_uuid())`,
    [org, oc, u, eq],
  );
  await q(
    `INSERT INTO saidas_a_campo
       (organizacao_id, ocorrencia_id, agente_id, equipe_id, sozinho, duracao_minutos,
        declarada_em, retorno_previsto_inicial, retorno_previsto_em, idempotency_key)
     VALUES ($1, $2, $3, $4, false, 60, now(), now() + interval '1 hour',
             now() + interval '1 hour', gen_random_uuid())`,
    [org, oc, u, eq],
  );
  await q("INSERT INTO metricas_municipio (organizacao_id, dia) VALUES ($1, current_date)", [org]);
}

/**
 * Empurra o relógio: a eliminação agendada de um município passa a estar
 * vencida. Feito como dono, porque é o único jeito de mudar o tempo num teste
 * sem esperar sete dias. As duas escritas respeitam as restrições da 038: o
 * livro continua com sete dias entre pedido e execução, só que no passado.
 */
async function vencerPrazo(org: string): Promise<void> {
  await db.query(
    `UPDATE eliminacoes_de_municipio
        SET solicitada_em = now() - interval '8 days', executar_em = now() - interval '1 day'
      WHERE organizacao_id = $1 AND cancelada_em IS NULL AND banco_apagado_em IS NULL`,
    [org],
  );
  await db.query(
    `UPDATE organizacoes SET eliminacao_agendada_para = now() - interval '1 day'
      WHERE id = $1 AND eliminacao_agendada_para IS NOT NULL`,
    [org],
  );
}

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  /*
    A primeira conta nasce como o console a semeia na partida: com o papel
    dele, sem operador no contexto e com a tabela VAZIA. É o único ramo da
    policy de INSERT que aceita `dono`, e ele fecha na primeira linha (o caso
    "ninguém cria um segundo dono", abaixo).
  */
  await comoConsole(null, (tx) =>
    tx.query(
      `INSERT INTO console_operadores (id, email, senha_hash, segundo_fator, papel)
       VALUES ($1, 'dono@fornecedor.exemplo.com.br', $2, $3, 'dono')`,
      [DONO_ID, HASH, ENVELOPE],
    ),
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/* =====================================================================
 * OS OPERADORES DO CONSOLE, E O TETO QUE A PRIMEIRA CONTA IMPÕE.
 *
 * "Eles jamais podem ter o poder sobre a primeira conta." A frase vira três
 * policies comando a comando (nunca `FOR ALL`, ver 032) e um gatilho, e este
 * bloco prova cada uma nos DOIS sentidos: o que o dono pode e o operador não,
 * e o que o operador pode consigo mesmo.
 * ===================================================================== */
describe("Os operadores do console, e o teto que a primeira conta impoe", () => {
  it("o dono cria operador pela porta do console, e a linha nasce abaixo dele", async () => {
    const r = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ id: string; papel: string; criado_por: string }>(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
         VALUES ('operador@fornecedor.exemplo.com.br', $1, $2, 'operador', $3)
         RETURNING id, papel, criado_por`,
        [HASH, ENVELOPE, DONO_ID],
      ),
    );
    operadorId = r.rows[0]!.id;
    expect(r.rows[0]!.papel).toBe("operador");
    expect(r.rows[0]!.criado_por).toBe(DONO_ID);

    const r2 = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
         VALUES ('segundo@fornecedor.exemplo.com.br', $1, $2, 'operador', $3) RETURNING id`,
        [HASH, ENVELOPE, DONO_ID],
      ),
    );
    outroOperadorId = r2.rows[0]!.id;
  });

  it("operador nao cria ninguem, e ninguem cria um segundo dono", async () => {
    const peloOperador = await mensagemDe(() =>
      comoConsole(operadorId, (tx) =>
        tx.query(
          `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
           VALUES ('intruso@fornecedor.exemplo.com.br', $1, $2, 'operador', $3)`,
          [HASH, ENVELOPE, operadorId],
        ),
      ),
    );
    expect(peloOperador, "um operador criou outro operador").toMatch(/row-level security/i);

    // Nem sem contexto nenhum, que é a situação de quem ainda não entrou.
    const semNinguem = await mensagemDe(() =>
      comoConsole(null, (tx) =>
        tx.query(
          `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
           VALUES ('intruso2@fornecedor.exemplo.com.br', $1, $2, 'operador', $3)`,
          [HASH, ENVELOPE, DONO_ID],
        ),
      ),
    );
    expect(semNinguem).toMatch(/row-level security/i);

    // Com a tabela povoada, o ramo da semeadura fechou: nem sem contexto...
    const segundaSemeadura = await mensagemDe(() =>
      comoConsole(null, (tx) =>
        tx.query(
          `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
           VALUES ('dono-b@fornecedor.exemplo.com.br', $1, $2, 'dono')`,
          [HASH, ENVELOPE],
        ),
      ),
    );
    expect(segundaSemeadura, "a semeadura do dono aceitou um segundo dono").toMatch(/row-level security/i);

    // ...nem o dono cria outro dono pela porta do console.
    const segundoDonoPeloConsole = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query(
          `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
           VALUES ('dono2@fornecedor.exemplo.com.br', $1, $2, 'dono')`,
          [HASH, ENVELOPE],
        ),
      ),
    );
    expect(segundoDonoPeloConsole).toMatch(/row-level security/i);

    // E nem o dono do BANCO: o índice único parcial é quem diz "exatamente um".
    const segundoDonoComoDonoDoBanco = await mensagemDe(() =>
      db.query(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
         VALUES ('dono3@fornecedor.exemplo.com.br', $1, $2, 'dono')`,
        [HASH, ENVELOPE],
      ),
    );
    expect(segundoDonoComoDonoDoBanco).toMatch(/um_dono|duplicate key|unique/i);

    // O operador nasce assinado por quem o criou: `criado_por` não é valor livre.
    const assinadoPorOutro = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query(
          `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
           VALUES ('assinado@fornecedor.exemplo.com.br', $1, $2, 'operador', $3)`,
          [HASH, ENVELOPE, operadorId],
        ),
      ),
    );
    expect(assinadoPorOutro, "o dono criou um operador assinado por outra pessoa").toMatch(/row-level security/i);
  });

  it("operador nao altera o dono, dono altera operador, operador altera so a si mesmo", async () => {
    const senhaDoDonoAntes = (await db.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [DONO_ID],
    )).rows[0]!.senha_hash;
    const outraSenha = HASH.replace(/.$/, "Z");

    /*
      A NEGATIVA É SILENCIOSA, e é a barreira certa: a policy de UPDATE não
      seleciona a linha do dono para o operador, o comando volta dizendo que
      alterou zero, e a linha continua igual. A conferência é a linha, não a
      mensagem.
    */
    const operadorNoDono = await comoConsole(operadorId, (tx) =>
      tx.query("UPDATE console_operadores SET senha_hash = $1 WHERE id = $2", [outraSenha, DONO_ID]),
    );
    expect((operadorNoDono as { affectedRows?: number }).affectedRows ?? 0).toBe(0);
    const senhaDoDonoDepois = (await db.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [DONO_ID],
    )).rows[0]!.senha_hash;
    expect(senhaDoDonoDepois, "um operador trocou a senha do dono").toBe(senhaDoDonoAntes);

    // Operador não alcança OUTRO operador: só a própria linha.
    await comoConsole(operadorId, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [outroOperadorId]),
    );
    expect((await db.query<{ ativo: boolean }>(
      "SELECT ativo FROM console_operadores WHERE id = $1", [outroOperadorId],
    )).rows[0]!.ativo, "um operador desativou outro operador").toBe(true);

    // Operador altera a si mesmo: é a troca de senha da tela de usuários.
    await comoConsole(operadorId, (tx) =>
      tx.query("UPDATE console_operadores SET senha_hash = $1 WHERE id = $2", [outraSenha, operadorId]),
    );
    expect((await db.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [operadorId],
    )).rows[0]!.senha_hash).toBe(outraSenha);

    // O dono altera o operador: é o "gerenciar usuários" dele.
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET senha_hash = $1 WHERE id = $2", [HASH, operadorId]),
    );
    expect((await db.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [operadorId],
    )).rows[0]!.senha_hash).toBe(HASH);

    // E o dono altera a si mesmo, que é a frase "trocar minha senha".
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET senha_hash = $1 WHERE id = $2", [outraSenha, DONO_ID]),
    );
    expect((await db.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [DONO_ID],
    )).rows[0]!.senha_hash).toBe(outraSenha);
    await db.query("UPDATE console_operadores SET senha_hash = $1 WHERE id = $2", [HASH, DONO_ID]);
  });

  it("papel, criador e data de criacao nao mudam, nem pela mao do dono", async () => {
    /*
      Sem isto, o dono promoveria um operador a dono (e o índice único não
      impediria se ele se rebaixasse antes), ou um operador se promoveria na
      própria linha, que a policy deixa ele editar. O gatilho fecha os dois.
    */
    const promover = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("UPDATE console_operadores SET papel = 'dono' WHERE id = $1", [operadorId]),
      ),
    );
    expect(promover).toMatch(/papel/i);

    const autoPromocao = await mensagemDe(() =>
      comoConsole(operadorId, (tx) =>
        tx.query("UPDATE console_operadores SET papel = 'dono' WHERE id = $1", [operadorId]),
      ),
    );
    expect(autoPromocao).toMatch(/papel/i);

    const rebaixar = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("UPDATE console_operadores SET papel = 'operador' WHERE id = $1", [DONO_ID]),
      ),
    );
    expect(rebaixar).toMatch(/papel/i);

    const trocarCriador = await mensagemDe(() =>
      comoConsole(operadorId, (tx) =>
        tx.query("UPDATE console_operadores SET criado_por = $1 WHERE id = $1", [operadorId]),
      ),
    );
    expect(trocarCriador).toMatch(/criado_por/i);
  });

  it("o dono nao se desativa; operador se desativa e nao se apaga", async () => {
    const desativarDono = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [DONO_ID]),
      ),
    );
    expect(desativarDono, "o console ficaria sem dono ativo").toMatch(/dono_sempre_ativo/);

    // Desativar operador é o "apagar" desta tabela: ele continua no livro.
    await comoConsole(DONO_ID, (tx) =>
      tx.query("UPDATE console_operadores SET ativo = false WHERE id = $1", [outroOperadorId]),
    );
    expect((await db.query<{ ativo: boolean }>(
      "SELECT ativo FROM console_operadores WHERE id = $1", [outroOperadorId],
    )).rows[0]!.ativo).toBe(false);

    // Sem concessão de DELETE: erro.
    const apagar = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("DELETE FROM console_operadores WHERE id = $1", [outroOperadorId]),
      ),
    );
    expect(apagar).toMatch(/permission denied|permissão negada/i);

    /*
      E COM a concessão, zero linha: a ausência de policy de DELETE é a segunda
      barreira, a mesma que as migrações 032 a 034 deram às tabelas de prova.
    */
    await db.exec("GRANT DELETE ON console_operadores TO dc360_console");
    try {
      await comoConsole(DONO_ID, (tx) =>
        tx.query("DELETE FROM console_operadores WHERE id = $1", [outroOperadorId]),
      );
    } finally {
      await db.exec("REVOKE DELETE ON console_operadores FROM dc360_console");
    }
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM console_operadores WHERE id = $1", [outroOperadorId],
    )).rows[0]!.n, "com GRANT DELETE a mais, a linha do operador sumiu").toBe("1");
  });

  it("antes de haver sessao, o console le a linha pelo email e grava a tentativa nela", async () => {
    /*
      O login acontece sem operador no contexto: o console acha a linha pelo
      email, confere a senha e o código, e precisa gravar falha, bloqueio e o
      passo do TOTP já usado (que sai da memória do processo e vem para cá).
      Sem contexto ninguém escreve; com o id da linha achada, a própria linha
      aceita a escrita, e só ela.
    */
    const linha = await comoConsole(null, (tx) =>
      tx.query<{ id: string; senha_hash: string }>(
        "SELECT id, senha_hash FROM console_operadores WHERE lower(email) = $1",
        ["operador@fornecedor.exemplo.com.br"],
      ),
    );
    expect(linha.rows).toHaveLength(1);

    await comoConsole(null, (tx) =>
      tx.query("UPDATE console_operadores SET falhas_login = 9 WHERE id = $1", [operadorId]),
    );
    expect((await db.query<{ falhas_login: number }>(
      "SELECT falhas_login FROM console_operadores WHERE id = $1", [operadorId],
    )).rows[0]!.falhas_login, "sem contexto, a escrita passou").toBe(0);

    await comoConsole(operadorId, (tx) =>
      tx.query(
        "UPDATE console_operadores SET falhas_login = 1, ultimo_passo_totp = 55000000 WHERE id = $1",
        [operadorId],
      ),
    );
    const depois = (await db.query<{ falhas_login: number; ultimo_passo_totp: string }>(
      "SELECT falhas_login, ultimo_passo_totp::text FROM console_operadores WHERE id = $1",
      [operadorId],
    )).rows[0]!;
    expect(depois.falhas_login).toBe(1);
    expect(depois.ultimo_passo_totp).toBe("55000000");
  });

  it("senha em texto claro e segredo de TOTP cru nao entram, nem pela mao do dono do banco", async () => {
    const senhaCrua = await mensagemDe(() =>
      db.query(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
         VALUES ('x@fornecedor.exemplo.com.br', 'senha-digitada', $1, 'operador', $2)`,
        [ENVELOPE, DONO_ID],
      ),
    );
    expect(senhaCrua).toMatch(/senha_chega_derivada/);

    const segredoCru = await mensagemDe(() =>
      db.query(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por)
         VALUES ('y@fornecedor.exemplo.com.br', $1, 'JBSWY3DPEHPK3PXP', 'operador', $2)`,
        [HASH, DONO_ID],
      ),
    );
    expect(segredoCru).toMatch(/segundo_fator_vem_cifrado/);

    // Operador sem criador é operador que ninguém responde por.
    const semCriador = await mensagemDe(() =>
      db.query(
        `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
         VALUES ('z@fornecedor.exemplo.com.br', $1, $2, 'operador')`,
        [HASH, ENVELOPE],
      ),
    );
    expect(semCriador).toMatch(/operador_tem_criador/);
  });
});

/* =====================================================================
 * SUSPENDER E REATIVAR: o botão "só pra desativar o acesso".
 * ===================================================================== */
describe("Suspender e reativar o acesso de um municipio", () => {
  let orgA = "";
  let orgB = "";
  let usuarioA = "";
  let usuarioB = "";

  beforeAll(async () => {
    orgA = await criarMunicipio("Serra Alta");
    orgB = await criarMunicipio("Vale Fundo");
    for (const [org, apelido] of [[orgA, "serraalta"], [orgB, "valefundo"]] as const) {
      const u = await db.query<{ id: string }>(
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1, 'Servidor', 'S-1', $2, 'administrador') RETURNING id`,
        [org, `${apelido}-suspensao@exemplo.gov.br`],
      );
      if (org === orgA) usuarioA = u.rows[0]!.id; else usuarioB = u.rows[0]!.id;
      for (const n of [1, 2]) {
        await db.query(
          `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
           VALUES ($1, $2, $3, now() + interval '8 hours')`,
          [org, u.rows[0]!.id, `sessao-${apelido}-${n}`],
        );
      }
    }
  });

  it("operador nao suspende, e sem operador no contexto ninguem suspende", async () => {
    for (const [rotulo, quem] of [["operador", operadorId], ["ninguem", null]] as const) {
      const msg = await mensagemDe(() =>
        comoConsole(quem, (tx) =>
          tx.query("SELECT console_suspender_municipio($1, 'teste')", [orgA]),
        ),
      );
      expect(msg, `${rotulo} conseguiu suspender`).toMatch(/dono/i);
    }
    expect((await db.query<{ s: string | null }>(
      "SELECT acesso_suspenso_em::text AS s FROM organizacoes WHERE id = $1", [orgA],
    )).rows[0]!.s).toBeNull();
  });

  it("o dono suspende, e todas as sessoes daquele municipio caem na hora", async () => {
    const r = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ revogadas: number }>(
        "SELECT console_suspender_municipio($1, 'Inadimplência confirmada em 15/09/2026') AS revogadas",
        [orgA],
      ),
    );
    expect(r.rows[0]!.revogadas).toBe(2);

    const org = (await db.query<{ s: string | null; m: string | null }>(
      "SELECT acesso_suspenso_em::text AS s, suspensao_motivo AS m FROM organizacoes WHERE id = $1",
      [orgA],
    )).rows[0]!;
    expect(org.s).not.toBeNull();
    expect(org.m).toBe("Inadimplência confirmada em 15/09/2026");

    const sessoesDeA = await db.query<{ revogada_em: string | null; motivo_revogacao: string | null }>(
      "SELECT revogada_em::text AS revogada_em, motivo_revogacao FROM sessoes WHERE organizacao_id = $1",
      [orgA],
    );
    expect(sessoesDeA.rows).toHaveLength(2);
    for (const s of sessoesDeA.rows) {
      expect(s.revogada_em, "uma sessão do município suspenso continuou viva").not.toBeNull();
      expect(s.motivo_revogacao).toBe("acesso suspenso pelo fornecedor");
    }

    // O vizinho não sentiu nada.
    const vivasDeB = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessoes WHERE organizacao_id = $1 AND revogada_em IS NULL",
      [orgB],
    );
    expect(vivasDeB.rows[0]!.n).toBe("2");

    // E o município lê na própria trilha quem o suspendeu, e por quê.
    const trilha = await comoApp(orgA, (tx) =>
      tx.query<{ acao: string; autor_nome: string; autor_papel: string; depois: { motivo: string } }>(
        "SELECT acao, autor_nome, autor_papel, depois FROM trilha_administrativa WHERE organizacao_id = $1",
        [orgA],
      ),
    );
    expect(trilha.rows).toHaveLength(1);
    expect(trilha.rows[0]!.acao).toBe("acesso_suspenso_pelo_fornecedor");
    expect(trilha.rows[0]!.autor_papel).toBe("operador_da_plataforma");
    expect(trilha.rows[0]!.autor_nome).toBe("dono@fornecedor.exemplo.com.br");
    expect(trilha.rows[0]!.depois.motivo).toBe("Inadimplência confirmada em 15/09/2026");
  });

  it("municipio suspenso nao abre sessao nova, e o vizinho continua abrindo", async () => {
    /*
      Revogar as sessões derruba quem está dentro. Sem esta recusa, quem foi
      derrubado entraria de novo com a senha de sempre, e o botão "desativar o
      acesso" seria só um "faça login de novo". A regra mora no banco, em
      `abrir_sessao`, e não numa condição na rota.
    */
    const suspenso = await mensagemDe(() =>
      comoApp(null, (tx) =>
        tx.query(
          "SELECT abrir_sessao($1, $2, 'token-novo-de-a', interval '1 day', NULL, NULL)",
          [orgA, usuarioA],
        ),
      ),
    );
    expect(suspenso).toMatch(/suspenso/i);
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessoes WHERE organizacao_id = $1 AND revogada_em IS NULL",
      [orgA],
    )).rows[0]!.n).toBe("0");

    await comoApp(null, (tx) =>
      tx.query(
        "SELECT abrir_sessao($1, $2, 'token-novo-de-b', interval '1 day', NULL, NULL)",
        [orgB, usuarioB],
      ),
    );
  });

  it("suspender de novo nao reescreve a data nem estoura: e idempotente", async () => {
    const antes = (await db.query<{ s: string }>(
      "SELECT acesso_suspenso_em::text AS s FROM organizacoes WHERE id = $1", [orgA],
    )).rows[0]!.s;
    await comoConsole(DONO_ID, (tx) =>
      tx.query("SELECT console_suspender_municipio($1, 'Motivo atualizado')", [orgA]),
    );
    const depois = (await db.query<{ s: string; m: string }>(
      "SELECT acesso_suspenso_em::text AS s, suspensao_motivo AS m FROM organizacoes WHERE id = $1",
      [orgA],
    )).rows[0]!;
    expect(depois.s).toBe(antes);
    expect(depois.m).toBe("Motivo atualizado");
  });

  it("o papel de aplicacao nao limpa a propria suspensao, nem toca nas colunas do fornecedor", async () => {
    /*
      `dc360_app` tem UPDATE em `organizacoes` (nome, retenção...). Sem o
      gatilho, um administrador municipal com uma falha de autorização no
      painel escreveria `acesso_suspenso_em = NULL` e voltaria a entrar. O
      gatilho segue o molde de `teto_nao_se_altera_pela_aplicacao` (035).
    */
    for (const coluna of [
      "acesso_suspenso_em = NULL",
      "suspensao_motivo = 'apagado'",
      "eliminacao_agendada_para = now()",
      "eliminada_em = now()",
      "armazenamento_purgado_em = now()",
    ]) {
      const msg = await mensagemDe(() =>
        comoApp(orgA, (tx) => tx.query(`UPDATE organizacoes SET ${coluna} WHERE id = $1`, [orgA])),
      );
      expect(msg, `a aplicação escreveu "${coluna}"`).toMatch(/fornecedor/i);
    }
    // E o que a aplicação sempre pôde continua podendo.
    await comoApp(orgA, (tx) =>
      tx.query("UPDATE organizacoes SET nome = 'Defesa Civil de Serra Alta (renomeada)' WHERE id = $1", [orgA]),
    );
  });

  it("operador nao reativa; o dono reativa, e a sessao volta a abrir", async () => {
    const peloOperador = await mensagemDe(() =>
      comoConsole(operadorId, (tx) => tx.query("SELECT console_reativar_municipio($1)", [orgA])),
    );
    expect(peloOperador).toMatch(/dono/i);

    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_reativar_municipio($1)", [orgA]));
    const org = (await db.query<{ s: string | null; m: string | null }>(
      "SELECT acesso_suspenso_em::text AS s, suspensao_motivo AS m FROM organizacoes WHERE id = $1",
      [orgA],
    )).rows[0]!;
    expect(org.s).toBeNull();
    expect(org.m).toBeNull();

    await comoApp(null, (tx) =>
      tx.query(
        "SELECT abrir_sessao($1, $2, 'token-depois-de-reativar', interval '1 day', NULL, NULL)",
        [orgA, usuarioA],
      ),
    );

    const trilha = await comoApp(orgA, (tx) =>
      tx.query<{ acao: string }>(
        "SELECT acao FROM trilha_administrativa WHERE organizacao_id = $1 ORDER BY registrado_em",
        [orgA],
      ),
    );
    expect(trilha.rows.map((l) => l.acao)).toEqual([
      "acesso_suspenso_pelo_fornecedor",
      "acesso_reativado_pelo_fornecedor",
    ]);
  });

  it("municipio que nao existe e recusado com nome, e nao com silencio", async () => {
    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("SELECT console_suspender_municipio('00000000-0000-4000-8000-000000000000', 'x')"),
      ),
    );
    expect(msg).toMatch(/munic[ií]pio/i);
  });
});

/* =====================================================================
 * AGENDAR, CANCELAR E O PRAZO DE ARREPENDIMENTO.
 * ===================================================================== */
describe("Agendar a eliminacao, e cancelar dentro do prazo", () => {
  let org = "";

  beforeAll(async () => {
    org = await criarMunicipio("Pedra Branca");
    await semearMunicipio(org, "pedrabranca");
  });

  it("operador nao agenda nem cancela", async () => {
    for (const chamada of [
      "SELECT console_agendar_eliminacao($1, 'motivo')",
      "SELECT console_cancelar_eliminacao($1)",
    ]) {
      const msg = await mensagemDe(() =>
        comoConsole(operadorId, (tx) => tx.query(chamada, [org])),
      );
      expect(msg, `operador executou "${chamada}"`).toMatch(/dono/i);
    }
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM eliminacoes_de_municipio WHERE organizacao_id = $1", [org],
    )).rows[0]!.n).toBe("0");
  });

  it("agendar exige motivo", async () => {
    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT console_agendar_eliminacao($1, '   ')", [org])),
    );
    expect(msg).toMatch(/motivo/i);
  });

  it("agendar suspende na hora e escreve no livro com sete dias", async () => {
    const r = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ executar_em: string }>(
        "SELECT console_agendar_eliminacao($1, 'Contrato encerrado sem renovação') AS executar_em",
        [org],
      ),
    );
    expect(r.rows[0]!.executar_em).toBeTruthy();

    const orgLinha = (await db.query<{ s: string | null; e: string | null }>(
      `SELECT acesso_suspenso_em::text AS s, eliminacao_agendada_para::text AS e
         FROM organizacoes WHERE id = $1`, [org],
    )).rows[0]!;
    expect(orgLinha.s, "agendar não suspendeu").not.toBeNull();
    expect(orgLinha.e, "agendar não marcou a organização").not.toBeNull();

    const vivas = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessoes WHERE organizacao_id = $1 AND revogada_em IS NULL", [org],
    );
    expect(vivas.rows[0]!.n).toBe("0");

    const livro = await comoConsole(DONO_ID, (tx) =>
      tx.query<{
        municipio_nome: string; uf: string; motivo: string; solicitada_por_email: string;
        dias: number; cancelada_em: string | null; banco_apagado_em: string | null;
      }>(
        `SELECT municipio_nome, uf, motivo, solicitada_por_email,
                EXTRACT(epoch FROM (executar_em - solicitada_em)) / 86400 AS dias,
                cancelada_em::text, banco_apagado_em::text
           FROM eliminacoes_de_municipio WHERE organizacao_id = $1`,
        [org],
      ),
    );
    expect(livro.rows).toHaveLength(1);
    const l = livro.rows[0]!;
    expect(l.municipio_nome).toBe("Pedra Branca");
    expect(l.uf).toBe("MG");
    expect(l.motivo).toBe("Contrato encerrado sem renovação");
    expect(l.solicitada_por_email).toBe("dono@fornecedor.exemplo.com.br");
    expect(Number(l.dias)).toBeCloseTo(7, 3);
    expect(l.cancelada_em).toBeNull();
    expect(l.banco_apagado_em).toBeNull();

    // A organização aponta para o mesmo instante do livro.
    const bate = await db.query<{ bate: boolean }>(
      `SELECT o.eliminacao_agendada_para = e.executar_em AS bate
         FROM organizacoes o JOIN eliminacoes_de_municipio e ON e.organizacao_id = o.id
        WHERE o.id = $1`, [org],
    );
    expect(bate.rows[0]!.bate).toBe(true);
  });

  it("agendar de novo recusa, e nao escreve segunda linha", async () => {
    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT console_agendar_eliminacao($1, 'de novo')", [org])),
    );
    expect(msg).toMatch(/j[aá] .*agendad/i);
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM eliminacoes_de_municipio WHERE organizacao_id = $1", [org],
    )).rows[0]!.n).toBe("1");

    // E o banco diz a mesma coisa sozinho, por índice, para quem escrever por fora.
    const direto = await mensagemDe(() =>
      db.query(
        `INSERT INTO eliminacoes_de_municipio
           (organizacao_id, municipio_nome, uf, executar_em, solicitada_por_email, motivo)
         VALUES ($1, 'Pedra Branca', 'MG', now() + interval '7 days', 'x@y.z', 'segunda')`,
        [org],
      ),
    );
    expect(direto).toMatch(/uma_ativa_por_municipio|duplicate key|unique/i);
  });

  it("reativar com eliminacao pendente e recusado", async () => {
    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT console_reativar_municipio($1)", [org])),
    );
    expect(msg).toMatch(/elimina/i);
    expect((await db.query<{ s: string | null }>(
      "SELECT acesso_suspenso_em::text AS s FROM organizacoes WHERE id = $1", [org],
    )).rows[0]!.s).not.toBeNull();
  });

  it("executar antes do prazo nao faz nada", async () => {
    const antes = await contagens(org);
    const r = await comoApp(null, (tx) => tx.query("SELECT * FROM executar_eliminacoes_vencidas()"));
    expect(r.rows, "o relógio apagou um município dentro do prazo de arrependimento").toHaveLength(0);
    expect(await contagens(org)).toEqual(antes);
    expect((await db.query<{ e: string | null }>(
      "SELECT eliminada_em::text AS e FROM organizacoes WHERE id = $1", [org],
    )).rows[0]!.e).toBeNull();
  });

  it("cancelar dentro do prazo impede a execucao, e NAO reativa o acesso sozinho", async () => {
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_cancelar_eliminacao($1)", [org]));

    const livro = (await db.query<{ c: string | null; por: string | null }>(
      `SELECT cancelada_em::text AS c, cancelada_por_email AS por
         FROM eliminacoes_de_municipio WHERE organizacao_id = $1`, [org],
    )).rows[0]!;
    expect(livro.c).not.toBeNull();
    expect(livro.por).toBe("dono@fornecedor.exemplo.com.br");

    const orgLinha = (await db.query<{ s: string | null; e: string | null }>(
      `SELECT acesso_suspenso_em::text AS s, eliminacao_agendada_para::text AS e
         FROM organizacoes WHERE id = $1`, [org],
    )).rows[0]!;
    expect(orgLinha.e, "cancelar não limpou a marca da organização").toBeNull();
    expect(orgLinha.s, "cancelar reativou o acesso por conta própria").not.toBeNull();

    // Mesmo com o prazo vencido, cancelada não executa.
    await db.query(
      `UPDATE eliminacoes_de_municipio
          SET solicitada_em = now() - interval '8 days', executar_em = now() - interval '1 day'
        WHERE organizacao_id = $1`, [org],
    );
    const antes = await contagens(org);
    const r = await comoApp(null, (tx) => tx.query("SELECT * FROM executar_eliminacoes_vencidas()"));
    expect(r.rows).toHaveLength(0);
    expect(await contagens(org)).toEqual(antes);

    // Cancelar de novo: não há o que cancelar.
    const nada = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT console_cancelar_eliminacao($1)", [org])),
    );
    expect(nada).toMatch(/n[aã]o h[aá]/i);

    // Reativar agora é permitido: é o ato separado.
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_reativar_municipio($1)", [org]));
    expect((await db.query<{ s: string | null }>(
      "SELECT acesso_suspenso_em::text AS s FROM organizacoes WHERE id = $1", [org],
    )).rows[0]!.s).toBeNull();

    // O livro guarda a história inteira, na ordem.
    const trilha = await comoApp(org, (tx) =>
      tx.query<{ acao: string }>(
        "SELECT acao FROM trilha_administrativa WHERE organizacao_id = $1 ORDER BY registrado_em",
        [org],
      ),
    );
    expect(trilha.rows.map((l) => l.acao)).toEqual([
      "usuario_criado",
      "acesso_suspenso_pelo_fornecedor",
      "eliminacao_agendada_pelo_fornecedor",
      "eliminacao_cancelada_pelo_fornecedor",
      "acesso_reativado_pelo_fornecedor",
    ]);
  });

  it("escrever no livro por fora da funcao nao aciona o relogio: ele exige o estado na organizacao", async () => {
    /*
      O console tem INSERT no livro (contrato da 038), e a policy só deixa o
      dono, com sete dias. Mesmo assim, uma linha escrita por fora não apaga
      nada: o relógio exige que a ORGANIZAÇÃO esteja marcada como agendada e
      suspensa, e essa marca só a função privilegiada escreve. É a frase "quem
      executa o irreversível é o relógio, guardado pelo estado no banco".
    */
    const peloOperador = await mensagemDe(() =>
      comoConsole(operadorId, (tx) =>
        tx.query(
          `INSERT INTO eliminacoes_de_municipio
             (organizacao_id, municipio_nome, uf, executar_em, solicitada_por_email, motivo)
           VALUES ($1, 'Pedra Branca', 'MG', now() + interval '7 days', 'op@x.y', 'por fora')`,
          [org],
        ),
      ),
    );
    expect(peloOperador).toMatch(/row-level security/i);

    const comMenosDeSeteDias = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query(
          `INSERT INTO eliminacoes_de_municipio
             (organizacao_id, municipio_nome, uf, executar_em, solicitada_por_email, motivo)
           VALUES ($1, 'Pedra Branca', 'MG', now() + interval '1 day', 'dono@x.y', 'apressado')`,
          [org],
        ),
      ),
    );
    expect(comMenosDeSeteDias).toMatch(/sete_dias|row-level security/i);

    await comoConsole(DONO_ID, (tx) =>
      tx.query(
        `INSERT INTO eliminacoes_de_municipio
           (organizacao_id, municipio_nome, uf, executar_em, solicitada_por_email, motivo)
         VALUES ($1, 'Pedra Branca', 'MG', now() + interval '7 days', 'dono@x.y', 'por fora')`,
        [org],
      ),
    );
    await db.query(
      `UPDATE eliminacoes_de_municipio
          SET solicitada_em = now() - interval '8 days', executar_em = now() - interval '1 day'
        WHERE organizacao_id = $1 AND motivo = 'por fora'`, [org],
    );

    const antes = await contagens(org);
    const r = await comoApp(null, (tx) => tx.query("SELECT * FROM executar_eliminacoes_vencidas()"));
    expect(r.rows, "uma linha escrita por fora da função acionou o apagamento").toHaveLength(0);
    expect(await contagens(org)).toEqual(antes);

    // A função de cancelar limpa a linha órfã, para o livro não mentir.
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_cancelar_eliminacao($1)", [org]));
    expect((await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM eliminacoes_de_municipio
        WHERE organizacao_id = $1 AND cancelada_em IS NULL`, [org],
    )).rows[0]!.n).toBe("0");
  });

  it("o console so cancela pelo UPDATE direto, e so para o estado cancelado", async () => {
    /*
      A concessão de UPDATE é por COLUNA (as duas de cancelamento), e a policy
      só aceita a linha entrando no estado cancelado. Descancelar por UPDATE
      rearmaria o relógio sem passar por função nenhuma.
    */
    const reescrever = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query("UPDATE eliminacoes_de_municipio SET motivo = 'outro' WHERE organizacao_id = $1", [org]),
      ),
    );
    expect(reescrever).toMatch(/permission denied|permissão negada/i);

    const antes = (await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM eliminacoes_de_municipio
        WHERE organizacao_id = $1 AND cancelada_em IS NOT NULL`, [org],
    )).rows[0]!.n;
    const descancelar = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) =>
        tx.query(
          `UPDATE eliminacoes_de_municipio SET cancelada_em = NULL, cancelada_por_email = NULL
            WHERE organizacao_id = $1`, [org],
        ),
      ),
    );
    expect(descancelar).toMatch(/row-level security|cancelamento_e_inteiro/i);
    expect((await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM eliminacoes_de_municipio
        WHERE organizacao_id = $1 AND cancelada_em IS NOT NULL`, [org],
    )).rows[0]!.n).toBe(antes);
  });

  it("o livro nao tem chave estrangeira para a organizacao, de proposito", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_constraint
        WHERE conrelid = 'eliminacoes_de_municipio'::regclass AND contype = 'f'`,
    );
    expect(
      r.rows[0]!.n,
      "uma chave estrangeira no livro faria o livro sumir junto com a organização, " +
      "ou impediria a organização de sumir",
    ).toBe("0");
  });
});

/* =====================================================================
 * EXECUTAR: apaga TUDO daquele município, e só dele.
 * ===================================================================== */
describe("Executar apaga tudo do municipio, deixa o vizinho intacto e o livro fica", () => {
  let alvo = "";
  let vizinho = "";
  let antesDoAlvo = new Map<string, number>();
  let antesDoVizinho = new Map<string, number>();

  beforeAll(async () => {
    alvo = await criarMunicipio("Agua Limpa");
    vizinho = await criarMunicipio("Serra do Meio");
    await semearMunicipio(alvo, "agualimpa");
    await semearMunicipio(vizinho, "serradomeio");
    await comoConsole(DONO_ID, (tx) =>
      tx.query("SELECT console_agendar_eliminacao($1, 'Município encerrou o contrato')", [alvo]),
    );
    antesDoAlvo = await contagens(alvo);
    antesDoVizinho = await contagens(vizinho);
  });

  it("a semeadura cobre toda tabela de negocio, senao o caso nao prova nada", async () => {
    for (const [tabela, n] of antesDoAlvo) {
      expect(n, `${tabela} está vazia para o município alvo`).toBeGreaterThan(0);
    }
    expect(antesDoAlvo.size).toBeGreaterThanOrEqual(30);
  });

  it("o papel do console nao executa o relogio, e o papel de aplicacao nao executa os atos do console", async () => {
    for (const chamada of ["SELECT * FROM executar_eliminacoes_vencidas()", "SELECT concluir_eliminacao($1)"]) {
      const msg = await mensagemDe(() =>
        comoConsole(DONO_ID, (tx) => tx.query(chamada, chamada.includes("$1") ? [alvo] : undefined)),
      );
      expect(msg, `o console executou "${chamada}"`).toMatch(/permission denied|permissão negada/i);
    }
    for (const chamada of [
      "SELECT console_suspender_municipio($1, 'x')",
      "SELECT console_reativar_municipio($1)",
      "SELECT console_agendar_eliminacao($1, 'x')",
      "SELECT console_cancelar_eliminacao($1)",
    ]) {
      const msg = await mensagemDe(() => comoApp(null, (tx) => tx.query(chamada, [alvo])));
      expect(msg, `a aplicação executou "${chamada}"`).toMatch(/permission denied|permissão negada/i);
    }
  });

  it("a rota de saude conta agendadas e vencidas, so numeros, e o console nao a executa", async () => {
    /*
      `eliminacoes_pendentes()` existe porque o papel de aplicacao nao enxerga
      `organizacoes` sem municipio no contexto, e /saude precisa dizer se o
      relogio tem trabalho. Devolve dois inteiros e nada mais: o catalogo e
      quem garante que nao cabe nome nem id na saida.
    */
    const forma = await db.query<{ argumentos: string; retorno: string }>(
      `SELECT pg_get_function_arguments(p.oid) AS argumentos, pg_get_function_result(p.oid) AS retorno
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'eliminacoes_pendentes'`,
    );
    expect(forma.rows).toHaveLength(1);
    expect(forma.rows[0]!.argumentos).toBe("");
    expect(forma.rows[0]!.retorno).toBe("TABLE(agendadas bigint, vencidas bigint)");

    const antes = await comoApp(null, (tx) =>
      tx.query<{ agendadas: string; vencidas: string }>(
        "SELECT agendadas::text, vencidas::text FROM eliminacoes_pendentes()",
      ),
    );
    expect(Number(antes.rows[0]!.agendadas)).toBeGreaterThanOrEqual(1);
    expect(Number(antes.rows[0]!.vencidas)).toBe(0);

    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT * FROM eliminacoes_pendentes()")),
    );
    expect(msg, "o console executou a funcao de contagem do relogio").toMatch(/permission denied|permissão negada/i);
  });

  it("vencido o prazo, o relogio apaga todas as linhas do municipio e grava as contagens", async () => {
    await vencerPrazo(alvo);

    const vencidas = await comoApp(null, (tx) =>
      tx.query<{ vencidas: string }>("SELECT vencidas::text FROM eliminacoes_pendentes()"),
    );
    expect(Number(vencidas.rows[0]!.vencidas)).toBe(1);

    const r = await comoApp(null, (tx) =>
      tx.query<{ organizacao_id: string; prefixo_do_armazenamento: string }>(
        "SELECT * FROM executar_eliminacoes_vencidas()",
      ),
    );
    /*
      Pelo alvo, e não pelo tamanho da lista: blocos anteriores deste arquivo
      deixaram municípios apagados e nunca concluídos, e a retomada os devolve
      em toda rodada até a purga ser marcada. Isso é o comportamento certo, e
      contar a lista aqui mediria o histórico do arquivo, não a função.
    */
    const linhaDoAlvo = r.rows.filter((l) => l.organizacao_id === alvo);
    expect(linhaDoAlvo).toHaveLength(1);
    expect(linhaDoAlvo[0]!.prefixo_do_armazenamento).toBe(`tenant/${alvo}/`);

    const depoisDoAlvo = await contagens(alvo);
    const sobras = [...depoisDoAlvo].filter(([, n]) => n > 0).map(([t, n]) => `${t}: ${n}`);
    expect(sobras, "restou linha do município eliminado").toEqual([]);

    // O vizinho não perdeu uma linha sequer.
    expect(await contagens(vizinho)).toEqual(antesDoVizinho);

    // A linha da organização FICA, marcada: o armazenamento ainda não foi purgado.
    const org = (await db.query<{ e: string | null; p: string | null }>(
      "SELECT eliminada_em::text AS e, armazenamento_purgado_em::text AS p FROM organizacoes WHERE id = $1",
      [alvo],
    )).rows[0]!;
    expect(org.e).not.toBeNull();
    expect(org.p).toBeNull();

    // O livro registrou a fase, com quantas linhas de cada tabela saíram.
    const livro = (await db.query<{ contagens: Record<string, number>; b: string | null; c: string | null }>(
      `SELECT contagens, banco_apagado_em::text AS b, concluida_em::text AS c
         FROM eliminacoes_de_municipio WHERE organizacao_id = $1`, [alvo],
    )).rows[0]!;
    expect(livro.b).not.toBeNull();
    expect(livro.c).toBeNull();
    expect(livro.contagens).toEqual(Object.fromEntries(antesDoAlvo));
  });

  it("a ordem de apagamento cobre toda tabela com organizacao_id, perguntada ao catalogo", async () => {
    /*
      A lista de tabelas dentro da função é escrita à mão, porque a ordem das
      chaves estrangeiras é. O que impede a lista de envelhecer é isto: as
      contagens gravadas nomeiam exatamente as tabelas que o catálogo tem hoje.
      Uma tabela criada amanhã sem lugar na ordem faz a função RECUSAR antes de
      apagar qualquer coisa (caso seguinte), e faz este caso reprovar.
    */
    const livro = (await db.query<{ contagens: Record<string, number> }>(
      "SELECT contagens FROM eliminacoes_de_municipio WHERE organizacao_id = $1", [alvo],
    )).rows[0]!;
    expect(Object.keys(livro.contagens).sort()).toEqual(await tabelasComMunicipio());
  });

  it("tabela nova sem lugar na ordem faz a funcao recusar ANTES de apagar", async () => {
    const outro = await criarMunicipio("Vila Nova");
    await semearMunicipio(outro, "vilanova");
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_agendar_eliminacao($1, 'x')", [outro]));
    await vencerPrazo(outro);
    const antes = await contagens(outro);

    await db.exec(`
      CREATE TABLE tabela_nova_do_portao (id serial PRIMARY KEY, organizacao_id uuid NOT NULL);
      ALTER TABLE tabela_nova_do_portao ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tabela_nova_do_portao FORCE ROW LEVEL SECURITY;
    `);
    try {
      const msg = await mensagemDe(() =>
        comoApp(null, (tx) => tx.query("SELECT * FROM executar_eliminacoes_vencidas()")),
      );
      expect(msg, "a função apagou com uma tabela fora da ordem").toContain("tabela_nova_do_portao");
      antes.delete("tabela_nova_do_portao");
      const depois = await contagens(outro);
      depois.delete("tabela_nova_do_portao");
      expect(depois, "a recusa veio DEPOIS de apagar alguma coisa").toEqual(antes);
    } finally {
      await db.exec("DROP TABLE tabela_nova_do_portao");
    }
    // Sem a tabela estranha, a mesma eliminação segue normalmente (pelo alvo,
    // e não pelo tamanho: a retomada devolve também os apagados de blocos
    // anteriores que ninguém concluiu).
    const r = await comoApp(null, (tx) =>
      tx.query<{ organizacao_id: string }>("SELECT * FROM executar_eliminacoes_vencidas()"),
    );
    expect(r.rows.filter((l) => l.organizacao_id === outro)).toHaveLength(1);
  });

  it("executar de novo devolve o mesmo municipio ate a purga concluir, sem apagar nada de novo", async () => {
    /*
      RETOMADA DEPOIS DE REINICIO, e o pedido veio da frente da API.

      O relogio faz tres fases: apaga o banco, purga o armazenamento, conclui.
      Se o processo reiniciar entre a primeira e a terceira (deploy, maquina do
      Fly trocada, a OUTRA maquina ter pego a primeira rodada), a purga fica
      pela metade e ninguem lembra dela: a funcao devolvia cada municipio UMA
      vez, e a memoria do processo morreu com ele. O municipio ficaria
      eliminado do banco e com as fotografias no armazenamento para sempre,
      que e dado pessoal sem dono, exatamente o que a varredura de orfaos
      existe para achar.

      Entao a funcao passa a devolver tambem quem ja teve o banco apagado e
      ainda nao teve o armazenamento purgado. E idempotente: nao ha mais nada
      a apagar, o livro nao muda, e o prefixo devolvido e o mesmo.
    */
    const livroAntes = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ banco_apagado_em: string; contagens: unknown }>(
        "SELECT banco_apagado_em::text, contagens FROM eliminacoes_de_municipio WHERE organizacao_id = $1",
        [alvo],
      ),
    );

    const r = await comoApp(null, (tx) =>
      tx.query<{ organizacao_id: string; prefixo_do_armazenamento: string }>(
        "SELECT * FROM executar_eliminacoes_vencidas()",
      ),
    );
    /* Filtra pelo alvo: blocos anteriores deixaram municípios eliminados e
       nunca concluídos, e a retomada os devolve também, que é o ponto. */
    const doAlvo = r.rows.filter((l) => l.organizacao_id === alvo);
    expect(doAlvo, "o alvo não voltou na retomada, ou voltou duas vezes").toHaveLength(1);
    expect(doAlvo[0]!.prefixo_do_armazenamento).toBe(`tenant/${alvo}/`);

    const livroDepois = await comoConsole(DONO_ID, (tx) =>
      tx.query<{ banco_apagado_em: string; contagens: unknown }>(
        "SELECT banco_apagado_em::text, contagens FROM eliminacoes_de_municipio WHERE organizacao_id = $1",
        [alvo],
      ),
    );
    expect(livroDepois.rows[0], "a retomada reescreveu o livro").toEqual(livroAntes.rows[0]);
  });

  it("uma metrica que entra na janela entre as fases nao trava a conclusao", async () => {
    /*
      A CORRIDA COM O RELOGIO DO RESUMO, apontada pela frente da API.

      Entre "banco apagado" e "concluir" passam minutos (a purga do
      armazenamento e pagina a pagina). O relogio do resumo roda a cada 15
      minutos e escreve em `metricas_municipio` para cada organizacao que
      ainda existe, e a organizacao AINDA EXISTE nessa janela. A chave
      estrangeira de `metricas_municipio` e ON DELETE RESTRICT: uma metrica
      escrita ali faria `concluir_eliminacao` bater na chave estrangeira em
      toda rodada, para sempre, com a organizacao eliminada e nao concluida.

      Duas defesas, e este caso prova a segunda: `municipios_a_resumir` deixa
      de devolver quem tem `eliminada_em` (caso abaixo), e `concluir` varre o
      que sobrou de camada 0 antes de apagar a organizacao.
    */
    await db.query(
      `INSERT INTO metricas_municipio (organizacao_id, dia, atualizado_em)
       VALUES ($1, current_date, now())
       ON CONFLICT DO NOTHING`,
      [alvo],
    );
    const sobrou = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM metricas_municipio WHERE organizacao_id = $1", [alvo],
    );
    expect(sobrou.rows[0]!.n, "a metrica de teste nao entrou; o caso nao provaria nada").toBe("1");
  });

  it("o relogio do resumo nao enxerga municipio eliminado", async () => {
    /*
      A primeira defesa da corrida acima, na origem: sem esta linha o resumo
      continuaria escrevendo para uma organizacao cujas ocorrencias ja nao
      existem, e o numero que sairia seria "zero de tudo", que no console e
      indistinguivel de "municipio calado".
    */
    const r = await comoApp(null, (tx) =>
      tx.query<{ id: string }>("SELECT municipios_a_resumir(interval '0 seconds') AS id"),
    );
    expect(r.rows.map((l) => l.id)).not.toContain(alvo);
    expect(r.rows.map((l) => l.id), "o vizinho intacto sumiu do resumo").toContain(vizinho);
  });

  it("cancelar depois do banco apagado e tarde demais", async () => {
    const msg = await mensagemDe(() =>
      comoConsole(DONO_ID, (tx) => tx.query("SELECT console_cancelar_eliminacao($1)", [alvo])),
    );
    expect(msg).toMatch(/apagad|tarde/i);
  });

  it("concluir exige o banco apagado: no vizinho intacto, recusa e nao toca em nada", async () => {
    const msg = await mensagemDe(() =>
      comoApp(null, (tx) => tx.query("SELECT concluir_eliminacao($1)", [vizinho])),
    );
    expect(msg).toMatch(/eliminad|apagad/i);
    expect(await contagens(vizinho)).toEqual(antesDoVizinho);
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes WHERE id = $1", [vizinho],
    )).rows[0]!.n).toBe("1");
  });

  it("concluir apaga a linha da organizacao, e o livro fica com a historia inteira", async () => {
    const pendentesAntes = Number((await comoApp(null, (tx) =>
      tx.query<{ vencidas: string }>("SELECT vencidas::text FROM eliminacoes_pendentes()"),
    )).rows[0]!.vencidas);

    await comoApp(null, (tx) => tx.query("SELECT concluir_eliminacao($1)", [alvo]));

    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes WHERE id = $1", [alvo],
    )).rows[0]!.n, "a linha da organização continuou lá depois de concluir").toBe("0");

    const livro = await comoConsole(DONO_ID, (tx) =>
      tx.query<{
        municipio_nome: string; uf: string; motivo: string;
        banco_apagado_em: string | null; armazenamento_purgado_em: string | null; concluida_em: string | null;
      }>(
        `SELECT municipio_nome, uf, motivo, banco_apagado_em::text, armazenamento_purgado_em::text,
                concluida_em::text
           FROM eliminacoes_de_municipio WHERE organizacao_id = $1`, [alvo],
      ),
    );
    expect(livro.rows, "o livro sumiu junto com a organização").toHaveLength(1);
    expect(livro.rows[0]!.municipio_nome).toBe("Agua Limpa");
    expect(livro.rows[0]!.uf).toBe("MG");
    expect(livro.rows[0]!.banco_apagado_em).not.toBeNull();
    expect(livro.rows[0]!.armazenamento_purgado_em).not.toBeNull();
    expect(livro.rows[0]!.concluida_em).not.toBeNull();

    // Concluir de novo: não há organização eliminada com esse id.
    const denovo = await mensagemDe(() =>
      comoApp(null, (tx) => tx.query("SELECT concluir_eliminacao($1)", [alvo])),
    );
    expect(denovo).toMatch(/eliminad|encontr/i);

    // E a rota de saúde deixa de contar o que concluiu (o que só foi apagado,
    // e ainda espera a purga, continua contando: é trabalho pendente).
    const pendentes = await comoApp(null, (tx) =>
      tx.query<{ vencidas: string }>("SELECT vencidas::text FROM eliminacoes_pendentes()"),
    );
    expect(Number(pendentes.rows[0]!.vencidas)).toBe(pendentesAntes - 1);
  });

  it("o papel de aplicacao continua sem DELETE direto e sem ler o livro", async () => {
    /*
      O caso-irmão da exceção aberta no portão universal: `dc360_app` ganhou
      EXECUTE em duas funções que apagam, e NÃO ganhou DELETE em tabela
      nenhuma. A única concessão de DELETE que ele tem é a de `avisos` (018),
      com a idade dentro da policy.
    */
    const deletes = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'dc360_app' AND privilege_type = 'DELETE' AND table_schema = 'public'
        ORDER BY 1`,
    );
    expect(deletes.rows.map((l) => l.table_name)).toEqual(["avisos"]);

    for (const tabela of ["eliminacoes_de_municipio", "console_operadores"]) {
      const msg = await mensagemDe(() =>
        comoApp(null, (tx) => tx.query(`SELECT * FROM ${tabela} LIMIT 1`)),
      );
      expect(msg, `a aplicação leu ${tabela}`).toMatch(/permission denied|permissão negada/i);
    }
  });
});

/* =====================================================================
 * ARMADILHA 1: o dono das tabelas SEM BYPASSRLS.
 *
 * `FORCE ROW LEVEL SECURITY` vale para o dono das tabelas, e nenhuma tabela
 * de negócio tem policy de DELETE (032 a 034). Uma função SECURITY DEFINER
 * que apague `ocorrencias` com um dono sem `BYPASSRLS` apaga ZERO linha sem
 * estourar. Em produção o dono é `postgres` e tem, mas isso é atributo do
 * papel, não do produto (cabeçalho da 037).
 *
 * O PGlite roda como superusuário, então o cenário é simulado dando a função
 * a um dono não superusuário e sem `BYPASSRLS`, com privilégio em todas as
 * tabelas (para a barreira que sobra ser SÓ a RLS).
 * ===================================================================== */
describe("Armadilha 1: com o dono sem BYPASSRLS, a funcao estoura em vez de apagar pela metade", () => {
  let org = "";
  let donoDeVerdade = "";

  beforeAll(async () => {
    org = await criarMunicipio("Porto Velho do Sul");
    await semearMunicipio(org, "portovelhodosul");
    await comoConsole(DONO_ID, (tx) => tx.query("SELECT console_agendar_eliminacao($1, 'x')", [org]));
    await vencerPrazo(org);

    donoDeVerdade = (await db.query<{ o: string }>(
      "SELECT DISTINCT tableowner AS o FROM pg_tables WHERE schemaname = 'public'",
    )).rows[0]!.o;

    await db.exec(`
      CREATE ROLE dono_sem_bypassrls NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO dono_sem_bypassrls;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO dono_sem_bypassrls;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dono_sem_bypassrls;
    `);
  });

  afterAll(async () => {
    await db.exec(`
      ALTER FUNCTION executar_eliminacoes_vencidas() OWNER TO ${donoDeVerdade};
      ALTER FUNCTION apagar_calado(uuid) OWNER TO ${donoDeVerdade};
      DROP FUNCTION apagar_calado(uuid);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dono_sem_bypassrls;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM dono_sem_bypassrls;
      REVOKE USAGE ON SCHEMA public FROM dono_sem_bypassrls;
      DROP ROLE dono_sem_bypassrls;
    `);
  });

  it("a ancora: uma funcao privilegiada ingenua apaga ZERO em silencio nesse cenario", async () => {
    /*
      Sem esta âncora, o caso seguinte poderia passar por outro motivo (a
      função não existe, o papel não executa). Aqui está o defeito nu: a mesma
      forma de função, sem a guarda, devolve sucesso com as linhas no lugar.
    */
    await db.exec(`
      CREATE FUNCTION apagar_calado(p_org uuid) RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      DECLARE n integer;
      BEGIN
        DELETE FROM trilha_eventos WHERE organizacao_id = p_org;
        GET DIAGNOSTICS n = ROW_COUNT;
        RETURN n;
      END $$;
      REVOKE ALL ON FUNCTION apagar_calado(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION apagar_calado(uuid) TO dc360_app;
      ALTER FUNCTION apagar_calado(uuid) OWNER TO dono_sem_bypassrls;
    `);
    const r = await comoApp(null, (tx) =>
      tx.query<{ n: number }>("SELECT apagar_calado($1) AS n", [org]),
    );
    expect(r.rows[0]!.n, "a âncora não reproduziu o defeito: o cenário não é o da armadilha").toBe(0);
    expect((await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM trilha_eventos WHERE organizacao_id = $1", [org],
    )).rows[0]!.n).toBe("1");
  });

  it("a funcao de eliminar ESTOURA nomeando a tabela, e nenhuma linha sai", async () => {
    await db.exec("ALTER FUNCTION executar_eliminacoes_vencidas() OWNER TO dono_sem_bypassrls");
    const antes = await contagens(org);

    const msg = await mensagemDe(() =>
      comoApp(null, (tx) => tx.query("SELECT * FROM executar_eliminacoes_vencidas()")),
    );
    expect(msg, "a função devolveu sucesso com o dono sem BYPASSRLS").not.toBe("");
    expect(msg).toMatch(/BYPASSRLS/);
    /* Nomeia a tabela em que parou: sem o nome, quem lê o log procura no lugar
       errado, que foi a lição da 036 e da 037. */
    expect(msg).toMatch(/(eliminacoes_de_municipio|organizacoes|[a-z_]+)\b/);
    expect(msg).toMatch(/tabela/i);

    expect(await contagens(org), "a função apagou pela metade").toEqual(antes);
    expect((await db.query<{ b: string | null }>(
      "SELECT banco_apagado_em::text AS b FROM eliminacoes_de_municipio WHERE organizacao_id = $1", [org],
    )).rows[0]!.b, "o livro diz que apagou, e não apagou").toBeNull();
    expect((await db.query<{ e: string | null }>(
      "SELECT eliminada_em::text AS e FROM organizacoes WHERE id = $1", [org],
    )).rows[0]!.e).toBeNull();
  });
});
