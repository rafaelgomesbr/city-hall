/**
 * A varredura de prazo (`varrer_prazos`, 016 com o expurgo da 037) num dono
 * de tabelas SEM `BYPASSRLS`: ela precisa ESTOURAR, e nunca calar.
 *
 * O ACHADO, provado por revisor em 15/09/2026. A 037 criou a policy de DELETE
 * de `notificacoes_enviadas` amarrada em `organizacao_id =
 * app_organizacao_atual()`. `varrer_prazos` roda sem municipio no contexto,
 * entao dentro dela `app_organizacao_atual()` e NULL, a policy nao casa linha
 * nenhuma, e o expurgo apaga ZERO sem erro. O INSERT de `prazo_vencendo` da
 * mesma funcao le `ocorrencias`, `usuarios` e `aparelhos`, todas filtradas
 * pelo contexto que nao existe: zero linhas, zero avisos, zero erro. So
 * funciona em producao porque o dono e `postgres`, que tem BYPASSRLS, e isso e
 * atributo do papel, nao do produto (cabecalho da 037). E a prova que faltava
 * desde a 037: a migracao escreveu a policy e nunca mostrou a funcao rodando
 * num dono que dependesse dela.
 *
 * O QUE ESTE ARQUIVO PROVA, e o que ele recusa provar. Com `SET row_security
 * = off` (045), o Postgres levanta erro em vez de aplicar a policy em silencio,
 * e SO para quem nao e isento de RLS. Entao:
 *
 *   1. num dono sem BYPASSRLS, a funcao ESTOURA nomeando a tabela, e nada e
 *      apagado nem inserido pela metade (o caso que era silencio, e que a
 *      ancora abaixo reproduz numa funcao ingenua da mesma forma);
 *   2. no dono de verdade (o PGlite roda como superusuario, que e isento como
 *      um dono com BYPASSRLS), a funcao ESCREVE: expurga o que passou da
 *      retencao, respeita o piso de trinta dias e reivindica o aviso de
 *      prazo. E a prova de que a 045 nao quebrou o caminho que funciona;
 *   3. o catalogo diz que a opcao esta la, para uma reescrita futura da
 *      funcao (que `CREATE OR REPLACE` faria sem a opcao) reprovar aqui.
 *
 * O que ele NAO prova, e esta escrito para ninguem ler mais do que existe:
 * que a funcao escreve num dono sem BYPASSRLS. Nao escreve, e nenhuma opcao
 * de funcao faz escrever: isso exigiria policy abrindo quatro tabelas sem
 * contexto de municipio, contra a regra numero um do produto. O que o produto
 * exige do dono esta em `docs/COLOCAR-DE-PE.md` (BYPASSRLS no papel de setup),
 * e o que esta migracao garante e que uma instalacao sem isso falha alto na
 * primeira rodada do relogio, no log da API, em vez de avisar ninguem por
 * meses.
 *
 * O cenario e simulado como nos irmaos (`eliminacao-de-municipio.test.ts`,
 * `recuperacao-do-console.test.ts`, `minimizacao-do-relato-e-da-trilha.test.ts`):
 * a funcao passa a pertencer a um papel nao superusuario, sem BYPASSRLS, com
 * privilegio em todas as tabelas, para a unica barreira que sobra ser a RLS.
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
let org = "";
let usuario = "";
let aparelho = "";
let ocorrencia = "";
let donoDeVerdade = "";

const ASSINATURA = "varrer_prazos(interval, interval, integer, integer, interval)";

/** Como o relogio da API chama: papel de aplicacao, SEM municipio no contexto. */
async function comoRelogio<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    return fn(tx);
  }) as Promise<T>;
}

function varrer(tx: any) {
  return tx.query(
    `SELECT notificacao_id, ocorrencia_id, ficha
       FROM varrer_prazos($1::interval, $2::interval, $3, $4, $5::interval)`,
    ["1 hour", "10 minutes", 3, 100, "90 days"],
  );
}

async function mensagemDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

let protocolos = 1;

/**
 * Uma notificacao `tarefa_nova` ja entregue, com a idade pedida, para o expurgo
 * ter alvo. Cada uma nasce sobre uma ocorrencia propria, sem prazo e sem
 * equipe (a unicidade da 016 e por aparelho, ocorrencia e tipo, e uma
 * ocorrencia sem prazo nunca vira alvo do aviso).
 */
async function semearNotificacao(idade: string): Promise<string> {
  protocolos += 1;
  const outra = (await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada, descricao)
     VALUES ($1, $2, 'alagamento', 'registrada', 'Avenida Central, 900', 'Beltrana de Tal',
             'telefone', 'Agua na soleira.')
     RETURNING id`,
    [org, `${String(protocolos).padStart(6, "0")}/2026`],
  )).rows[0]!.id;
  const r = await db.query<{ id: string }>(
    `INSERT INTO notificacoes_enviadas
       (organizacao_id, aparelho_id, ocorrencia_id, tipo, enviada_em, desfecho)
     VALUES ($1, $2, $3, 'tarefa_nova', now() - $4::interval, 'entregue')
     RETURNING id`,
    [org, aparelho, outra, idade],
  );
  return r.rows[0]!.id;
}

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM (${sql}) q`, params);
  return Number(r.rows[0]!.n);
}

beforeAll(async () => {
  db = new PGlite();
  for (const m of migracoes) await db.exec(m);

  org = (await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Serra Alta','Serra Alta','MG') RETURNING id",
  )).rows[0]!.id;
  const equipe = (await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe Alfa') RETURNING id", [org],
  )).rows[0]!.id;
  usuario = (await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
     VALUES ($1, 'Diego Nakamura Alves', 'SA-0451', 'diego0451@serraalta.exemplo.gov.br', 'agente_campo', $2)
     RETURNING id`,
    [org, equipe],
  )).rows[0]!.id;
  aparelho = (await db.query<{ id: string }>(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
     VALUES ($1, $2, 'ios', 'ficha-do-aparelho-de-diego') RETURNING id`,
    [org, usuario],
  )).rows[0]!.id;
  /* Prazo dentro da janela de uma hora, e despachada para a equipe: e o alvo
     do aviso `prazo_vencendo`. */
  ocorrencia = (await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
        canal_entrada, descricao, equipe_id, prazo_em)
     VALUES ($1, '000001/2026', 'deslizamento', 'em_campo', 'Rua das Acacias, 245',
             'Fulano de Tal', 'telefone', 'Talude com trinca.', $2, now() + interval '30 minutes')
     RETURNING id`,
    [org, equipe],
  )).rows[0]!.id;

  donoDeVerdade = (await db.query<{ o: string }>(
    "SELECT DISTINCT tableowner AS o FROM pg_tables WHERE schemaname = 'public'",
  )).rows[0]!.o;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("O catalogo: a opcao esta na funcao", () => {
  it("varrer_prazos e SECURITY DEFINER, fixa o search_path e desliga o row_security", async () => {
    const r = await db.query<{ prosecdef: boolean; config: string[] | null }>(
      `SELECT p.prosecdef, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'varrer_prazos'`,
    );
    expect(r.rows, "varrer_prazos sumiu, ou ganhou uma segunda assinatura").toHaveLength(1);
    expect(r.rows[0]!.prosecdef).toBe(true);
    const config = r.rows[0]!.config ?? [];
    expect(config.some((c) => c.startsWith("search_path="))).toBe(true);
    /*
      Se esta linha reprovar, alguem reescreveu `varrer_prazos` com
      `CREATE OR REPLACE` e esqueceu o `SET row_security = off` (a opcao nao
      sobrevive a reescrita). A migracao 045 explica por que ela precisa estar
      aqui.
    */
    expect(config, "varrer_prazos sem row_security = off: num dono sem BYPASSRLS ela volta a calar")
      .toContain("row_security=off");
  });
});

describe("No dono de verdade, a varredura escreve: expurga o vencido, respeita o piso, e reivindica o aviso", () => {
  it("expurga a notificacao alem da retencao, deixa a recente, e insere prazo_vencendo para o aparelho vivo", async () => {
    const velha = await semearNotificacao("100 days");
    const recente = await semearNotificacao("10 days");

    const r = await comoRelogio(varrer);

    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [velha]), "o expurgo nao apagou a velha").toBe(0);
    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [recente]), "o expurgo apagou o que esta dentro da retencao").toBe(1);

    expect(r.rows, "a varredura nao reivindicou o aviso de prazo").toHaveLength(1);
    expect(r.rows[0]!.ocorrencia_id).toBe(ocorrencia);
    expect(r.rows[0]!.ficha).toBe("ficha-do-aparelho-de-diego");
    expect(await contar(
      "SELECT 1 FROM notificacoes_enviadas WHERE ocorrencia_id = $1 AND tipo = 'prazo_vencendo' AND desfecho = 'enviando'",
      [ocorrencia],
    )).toBe(1);
  });

  it("o piso de trinta dias da policy (037) nao e o que limita o dono: e o parametro de retencao", async () => {
    /*
      Uma notificacao de quarenta dias esta acima do piso da policy e abaixo
      da retencao de noventa. O dono, isento de RLS, nao passa pela policy;
      quem o segura e o `WHERE enviada_em < now() - p_retencao` da funcao. Se
      esta linha apagar, alguem fez o expurgo apagar pela policy e nao pelo
      parametro.
    */
    const quarentaDias = await semearNotificacao("40 days");
    await comoRelogio(varrer);
    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [quarentaDias])).toBe(1);
  });
});

/* =====================================================================
 * ARMADILHA 1: o dono das tabelas SEM BYPASSRLS.
 * ===================================================================== */
describe("Armadilha 1: com o dono sem BYPASSRLS, a varredura estoura em vez de calar", () => {
  let velha = "";

  beforeAll(async () => {
    velha = await semearNotificacao("200 days");
    /* A notificacao `prazo_vencendo` reivindicada pelo bloco de cima e apagada
       para o INSERT deste bloco ter o que inserir, se ele chegasse a inserir. */
    await db.query("DELETE FROM notificacoes_enviadas WHERE tipo = 'prazo_vencendo'");

    await db.exec(`
      CREATE ROLE dono_sem_bypassrls_045 NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO dono_sem_bypassrls_045;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO dono_sem_bypassrls_045;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dono_sem_bypassrls_045;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dono_sem_bypassrls_045;
    `);
  });

  afterAll(async () => {
    await db.exec(`
      ALTER FUNCTION ${ASSINATURA} OWNER TO ${donoDeVerdade};
      DROP FUNCTION IF EXISTS expurgar_calado(interval);
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM dono_sem_bypassrls_045;
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dono_sem_bypassrls_045;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM dono_sem_bypassrls_045;
      REVOKE USAGE ON SCHEMA public FROM dono_sem_bypassrls_045;
      DROP ROLE dono_sem_bypassrls_045;
    `);
  });

  it("a ancora: o mesmo DELETE da 016, numa funcao ingenua sem a guarda, apaga ZERO em silencio nesse dono", async () => {
    /*
      Sem esta ancora o caso seguinte poderia passar por outro motivo (a
      funcao nao existe, o papel nao executa). Aqui esta o defeito nu, na forma
      exata do expurgo da 016 antes da 045: sucesso, zero linhas, e a
      notificacao de duzentos dias no lugar.
    */
    await db.exec(`
      CREATE FUNCTION expurgar_calado(p_retencao interval) RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      DECLARE n integer;
      BEGIN
        DELETE FROM notificacoes_enviadas WHERE enviada_em < now() - p_retencao;
        GET DIAGNOSTICS n = ROW_COUNT;
        RETURN n;
      END $$;
      REVOKE ALL ON FUNCTION expurgar_calado(interval) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION expurgar_calado(interval) TO dc360_app;
      ALTER FUNCTION expurgar_calado(interval) OWNER TO dono_sem_bypassrls_045;
    `);
    const r = await comoRelogio((tx) =>
      tx.query<{ n: number }>("SELECT expurgar_calado('90 days'::interval) AS n"),
    );
    expect(r.rows[0]!.n, "a ancora nao reproduziu o defeito: o cenario nao e o da armadilha").toBe(0);
    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [velha])).toBe(1);
  });

  it("varrer_prazos ESTOURA nomeando a seguranca em nivel de linha, nao expurga e nao reivindica nada", async () => {
    await db.exec(`ALTER FUNCTION ${ASSINATURA} OWNER TO dono_sem_bypassrls_045`);

    const msg = await mensagemDe(() => comoRelogio(varrer));

    expect(msg, "a varredura devolveu sucesso com o dono sem BYPASSRLS: e o silencio da 037").not.toBe("");
    /* A mensagem crua do Postgres, que e o que `apps/api/src/push/varredor.ts`
       escreve no log. Ela nomeia a tabela, e e isso que manda quem le
       procurar no lugar certo. */
    expect(msg).toMatch(/row-level security/i);
    expect(msg).toMatch(/notificacoes_enviadas|ocorrencias|usuarios|aparelhos/);

    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [velha]), "expurgou pela metade").toBe(1);
    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE tipo = 'prazo_vencendo'"), "reivindicou aviso pela metade").toBe(0);
  });

  it("de volta ao dono de verdade, a mesma chamada escreve: nada ficou preso", async () => {
    await db.exec(`ALTER FUNCTION ${ASSINATURA} OWNER TO ${donoDeVerdade}`);
    const r = await comoRelogio(varrer);
    expect(await contar("SELECT 1 FROM notificacoes_enviadas WHERE id = $1", [velha])).toBe(0);
    expect(r.rows).toHaveLength(1);
  });
});
