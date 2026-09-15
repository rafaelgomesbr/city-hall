/**
 * A busca com tolerância a erro, do lado do banco (migração 041).
 *
 * O PEDIDO, NA LETRA DE QUEM PAGA: "esse input tem que conseguir indexar
 * praticamente qualquer registro e qualquer funcionalidade dela com tolerância
 * a erro". A metade servidor disso é o que este arquivo cobra.
 *
 * O que ele prova, e por que cada parte precisa de prova própria:
 *
 * 1. A NORMALIZAÇÃO (`normalizar_busca`): caixa baixa, acento fora, pontuação
 *    fora, sem depender da extensão `unaccent`. É a função que a chave de
 *    busca de cada tabela e o termo digitado atravessam, então se ela mudar
 *    de comportamento nos dois lados ao mesmo tempo, ninguém percebe.
 * 2. A TOLERÂNCIA: os quatro exemplos combinados com quem paga, mais a ordem
 *    (exato > prefixo > começo de palavra > substring > parecido).
 * 3. O ISOLAMENTO: a busca de A NUNCA devolve linha de B, mesmo com texto
 *    idêntico nos dois municípios. A tolerância a erro não pode virar uma
 *    porta lateral no RLS: a chave de busca é coluna comum, coberta pela
 *    mesma policy.
 * 4. O ÍNDICE: o EXPLAIN mostra o índice de trigramas atendendo o predicado,
 *    quando a extensão existe.
 *
 * DOIS SABORES, E OS DOIS RODAM AQUI. O PGlite só carrega `pg_trgm` quando o
 * chamador passa a extensão no construtor; o `new PGlite()` de todo outro
 * teste deste repositório (e do painel em modo local, no navegador) não tem a
 * extensão. Por isso a migração 041 tem dois caminhos, e este arquivo roda os
 * mesmos casos nos dois: com `pg_trgm` (que é a produção, Supabase) e sem
 * (que é o navegador e a API sem `DATABASE_URL`). O EXPLAIN só faz sentido
 * com a extensão, e é o único caso que não roda nos dois.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
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

/** O teto por grupo que a rota usa; aqui só para o LIMIT ter o mesmo número. */
const TETO = 8;

/**
 * A FORMA da consulta que a rota escreve, repetida aqui de propósito, no
 * mesmo espírito de `carga.test.ts`: este arquivo prova que a forma acordada
 * está certa e serve de referência do que a rota precisa escrever. Quem
 * fecha a fresta entre os dois é `apps/api/test/busca.test.ts`.
 */
function consultaDeOcorrencias(): string {
  return `SELECT o.id, o.protocolo, o.endereco, pontuar_busca(o.busca, $1) AS pontuacao
            FROM ocorrencias o
           WHERE casa_busca(o.busca, $1)
           ORDER BY pontuacao DESC, o.criado_em DESC, o.id
           LIMIT ${TETO}`;
}

type Sabor = { nome: string; comTrigramas: boolean };
const SABORES: Sabor[] = [
  { nome: "com pg_trgm (producao)", comTrigramas: true },
  { nome: "sem pg_trgm (navegador e API sem DATABASE_URL)", comTrigramas: false },
];

describe.each(SABORES)("Busca com tolerancia a erro, $nome", ({ comTrigramas }) => {
  let db: PGlite;
  let orgA: string;
  let orgB: string;

  async function comoApp<T>(orgId: string | null, fn: (tx: any) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      if (orgId) {
        await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgId]);
      }
      return fn(tx);
    }) as Promise<T>;
  }

  async function normalizar(texto: string | null): Promise<string | null> {
    const r = await db.query<{ n: string | null }>("SELECT normalizar_busca($1) AS n", [texto]);
    return r.rows[0]!.n;
  }

  async function buscarOcorrencias(org: string, termo: string) {
    const t = await normalizar(termo);
    return comoApp(org, (tx) =>
      tx.query<{ id: string; protocolo: string; endereco: string; pontuacao: number }>(
        consultaDeOcorrencias(), [t],
      ));
  }

  async function buscarEm(org: string, tabela: string, termo: string) {
    const t = await normalizar(termo);
    return comoApp(org, (tx) =>
      tx.query<{ nome: string; pontuacao: number }>(
        `SELECT nome, pontuar_busca(busca, $1) AS pontuacao FROM ${tabela}
          WHERE casa_busca(busca, $1) ORDER BY pontuacao DESC, nome LIMIT ${TETO}`,
        [t],
      ));
  }

  beforeAll(async () => {
    db = comTrigramas ? new PGlite({ extensions: { pg_trgm } }) : new PGlite();
    for (const migracao of migracoes) await db.exec(migracao);

    const a = await db.query<{ id: string }>(
      "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Serra Alta','Serra Alta','MG') RETURNING id",
    );
    const b = await db.query<{ id: string }>(
      "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Vale Fundo','Vale Fundo','MG') RETURNING id",
    );
    orgA = a.rows[0]!.id;
    orgB = b.rows[0]!.id;

    /*
      O MESMO texto nos dois municípios, de propósito: é o caso em que uma
      busca "quase igual" mais tentaria atravessar a parede, e o RLS precisa
      segurar mesmo com o texto idêntico.
    */
    for (const org of [orgA, orgB]) {
      await db.query(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, status, endereco, ponto_referencia,
            solicitante_nome, canal_entrada, descricao)
         VALUES ($1, '000123/2026', 'deslizamento', 'em_campo',
                 'Servidão Boa Esperança, 148', 'Em frente ao bar do Zé',
                 'Joana da Silva Prado', 'telefone', 'Talude cedeu.')`,
        [org],
      );
    }
    // Volume para o planejador ter o que decidir, e para o teto ter o que cortar.
    await db.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
          canal_entrada, descricao, criado_em)
       SELECT $1, lpad((i + 1000)::text, 6, '0') || '/2026', 'alagamento', 'registrada',
              'Rua das Palmeiras, ' || i || ', Jardim Bela Vista', 'Morador ' || i,
              'telefone', 'Água na rua.', now() - (i * interval '1 minute')
         FROM generate_series(1, 300) AS i`,
      [orgA],
    );
    await db.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
          canal_entrada, descricao)
       SELECT $1, lpad((i + 2000)::text, 6, '0') || '/2026', 'vendaval', 'registrada',
              'Avenida Central, ' || i, 'Vizinho ' || i, 'telefone', 'Telhado voou.'
         FROM generate_series(1, 100) AS i`,
      [orgB],
    );

    /*
      Equipes com nomes escolhidos para cada degrau da pontuação, para a
      ORDEM ser conferível e não só a presença.
    */
    for (const nome of ["Equipe Alfa", "Equipe Alfa Norte", "Nova Equipe Alfa", "Subequipe Alfa", "Equipe Alfe", "Bravo"]) {
      await db.query("INSERT INTO equipes (organizacao_id, nome) VALUES ($1, $2)", [orgA, nome]);
    }
    await db.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       VALUES ($1, 'Joana da Silva Prado', '0001', 'joana.prado@serraalta.exemplo.gov.br', 'agente_campo', 'x'),
              ($1, 'Carlos Henrique Mota', '0002', 'carlos.mota@serraalta.exemplo.gov.br', 'operador', 'x')`,
      [orgA],
    );
    await db.query(
      `INSERT INTO orgaos (organizacao_id, nome, sigla)
       VALUES ($1, 'Corpo de Bombeiros Militar', 'CBMMG'),
              ($1, 'Secretaria Municipal de Obras', 'SMO')`,
      [orgA],
    );

    // Sem ANALYZE o planejador chuta, e o EXPLAIN vira leitura da sorte.
    await db.exec("ANALYZE");
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  describe("normalizar_busca", () => {
    it("baixa a caixa, tira acento e cedilha, e reduz pontuação a espaço", async () => {
      expect(await normalizar("Servidão Boa Esperança, 148")).toBe("servidao boa esperanca 148");
      expect(await normalizar("ÁÀÂÃ ÉÊ Í ÓÔÕ Ú Ü Ç")).toBe("aaaa ee i ooo u u c");
      expect(await normalizar("áàâã éê í óôõ ú ü ç")).toBe("aaaa ee i ooo u u c");
      expect(await normalizar("000123/2026")).toBe("000123 2026");
    });

    it("engole os curingas do LIKE, então o termo nunca precisa de escape", async () => {
      expect(await normalizar("  Rua %_\\ X  ")).toBe("rua x");
      expect(await normalizar("100%")).toBe("100");
    });

    it("é nula para entrada nula, e vazia para entrada sem letra nem número", async () => {
      expect(await normalizar(null)).toBeNull();
      expect(await normalizar("!!! ---")).toBe("");
    });

    it("é IMMUTABLE, PARALLEL SAFE e NÃO é SECURITY DEFINER, como as irmãs", async () => {
      const r = await db.query<{ proname: string; provolatile: string; proparallel: string; prosecdef: boolean }>(
        `SELECT p.proname, p.provolatile, p.proparallel, p.prosecdef
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('normalizar_busca', 'casa_busca', 'pontuar_busca')
          ORDER BY p.proname`,
      );
      expect(r.rows.map((f) => f.proname)).toEqual(["casa_busca", "normalizar_busca", "pontuar_busca"]);
      const normalizacao = r.rows.find((f) => f.proname === "normalizar_busca")!;
      // 'i' é IMMUTABLE: é o que permite a coluna gerada e o índice de expressão.
      expect(normalizacao.provolatile).toBe("i");
      expect(normalizacao.proparallel).toBe("s");
      for (const f of r.rows) {
        expect(f.prosecdef, `${f.proname} virou SECURITY DEFINER, e a busca passaria por cima do RLS`).toBe(false);
        expect(f.proparallel, `${f.proname} não é PARALLEL SAFE`).toBe("s");
      }
    });
  });

  describe("a chave de busca de cada tabela", () => {
    it("é gerada pelo banco a partir das colunas buscáveis, já normalizada", async () => {
      const o = await comoApp(orgA, (tx) =>
        tx.query<{ busca: string }>("SELECT busca FROM ocorrencias WHERE protocolo = '000123/2026'"));
      expect(o.rows[0]!.busca).toBe("000123 2026 servidao boa esperanca 148 em frente ao bar do ze joana da silva prado");

      const u = await comoApp(orgA, (tx) =>
        tx.query<{ busca: string }>("SELECT busca FROM usuarios WHERE matricula = '0001'"));
      expect(u.rows[0]!.busca).toBe("joana da silva prado 0001 joana prado serraalta exemplo gov br");

      const g = await comoApp(orgA, (tx) =>
        tx.query<{ busca: string }>("SELECT busca FROM orgaos WHERE sigla = 'CBMMG'"));
      expect(g.rows[0]!.busca).toBe("corpo de bombeiros militar cbmmg");
    });

    it("acompanha a minimização por prazo: o nome removido sai da chave sozinho", async () => {
      const id = (await db.query<{ id: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
            canal_entrada, descricao, encerrado_em, motivo_encerramento)
         VALUES ($1, '000900/2026', 'granizo', 'encerrada', 'Rua do Fim, 1',
                 'Sebastiana Nogueira', 'telefone', 'x', now(), 'Resolvido')
         RETURNING id`,
        [orgA],
      )).rows[0]!.id;
      expect((await buscarOcorrencias(orgA, "sebastiana")).rows.map((r) => r.id)).toContain(id);

      await db.query(
        `UPDATE ocorrencias
            SET solicitante_nome = 'removido por prazo', solicitante_contato = NULL,
                solicitante_removido_em = now()
          WHERE id = $1`,
        [id],
      );
      expect((await buscarOcorrencias(orgA, "sebastiana")).rows.map((r) => r.id)).not.toContain(id);
    });
  });

  describe("tolerância a erro: os quatro exemplos combinados", () => {
    it("'Servidao Boa Esperansa' acha 'Servidão Boa Esperança'", async () => {
      const r = await buscarOcorrencias(orgA, "Servidao Boa Esperansa");
      expect(r.rows.map((x) => x.endereco)).toContain("Servidão Boa Esperança, 148");
    });

    it("'00012' acha '000123/2026', e por prefixo, na frente do que só se parece", async () => {
      const r = await buscarOcorrencias(orgA, "00012");
      expect(r.rows[0]!.protocolo).toBe("000123/2026");
      expect(r.rows[0]!.pontuacao).toBeCloseTo(0.9, 5);
    });

    it("'joana silv' acha 'Joana da Silva Prado' entre os usuários", async () => {
      const r = await buscarEm(orgA, "usuarios", "joana silv");
      expect(r.rows.map((x) => x.nome)).toEqual(["Joana da Silva Prado"]);
    });

    it("'bombeiro' acha 'Corpo de Bombeiros Militar' entre os órgãos", async () => {
      const r = await buscarEm(orgA, "orgaos", "bombeiro");
      expect(r.rows.map((x) => x.nome)).toEqual(["Corpo de Bombeiros Militar"]);
    });

    it("o que não se parece com nada não acha nada", async () => {
      expect((await buscarOcorrencias(orgA, "xqzwvk")).rows).toHaveLength(0);
      expect((await buscarEm(orgA, "equipes", "xqzwvk")).rows).toHaveLength(0);
    });

    it("pontua exato > prefixo > começo de palavra > substring > parecido", async () => {
      const r = await buscarEm(orgA, "equipes", "equipe alfa");
      expect(r.rows.map((x) => x.nome)).toEqual([
        "Equipe Alfa",        // exato
        "Equipe Alfa Norte",  // prefixo
        "Nova Equipe Alfa",   // começo de palavra
        "Subequipe Alfa",     // substring no meio da palavra
        "Equipe Alfe",        // parecido, por trigramas
      ]);
      const [exato, prefixo, palavra, substring, parecido] = r.rows.map((x) => x.pontuacao);
      expect(exato).toBeCloseTo(1.0, 5);
      expect(prefixo).toBeCloseTo(0.9, 5);
      expect(palavra).toBeCloseTo(0.8, 5);
      expect(substring).toBeCloseTo(0.7, 5);
      expect(parecido!).toBeLessThanOrEqual(0.6);
      expect(parecido!).toBeGreaterThan(0);
    });
  });

  describe("isolamento: a tolerância a erro não atravessa o município", () => {
    it("a busca de A nunca devolve linha de B, mesmo com texto idêntico nos dois", async () => {
      const deA = await buscarOcorrencias(orgA, "Servidao Boa Esperansa");
      const deB = await buscarOcorrencias(orgB, "Servidao Boa Esperansa");
      expect(deA.rows).toHaveLength(1);
      expect(deB.rows).toHaveLength(1);
      expect(deA.rows[0]!.id).not.toBe(deB.rows[0]!.id);

      const idsDeB = (await db.query<{ id: string }>(
        "SELECT id FROM ocorrencias WHERE organizacao_id = $1", [orgB],
      )).rows.map((r) => r.id);
      expect(idsDeB).not.toContain(deA.rows[0]!.id);
      expect(idsDeB).toContain(deB.rows[0]!.id);
    });

    it("o protocolo exato do vizinho não acha nada em A, e em B acha por prefixo na frente dos parecidos", async () => {
      // '002050/2026' só existe em B.
      expect((await buscarOcorrencias(orgA, "002050")).rows).toHaveLength(0);
      const deB = await buscarOcorrencias(orgB, "002050");
      expect(deB.rows[0]!.protocolo).toBe("002050/2026");
      expect(deB.rows[0]!.pontuacao).toBeCloseTo(0.9, 5);
      // Os vizinhos de numeração ("002051") podem vir por parecença, sempre atrás.
      for (const r of deB.rows.slice(1)) expect(r.pontuacao).toBeLessThan(0.9);
    });

    it("sem município no contexto, a busca não devolve nada", async () => {
      const r = await comoApp(null, (tx) => tx.query(consultaDeOcorrencias(), ["servidao"]));
      expect(r.rows).toHaveLength(0);
    });

    it("o teto corta e a ordem é estável", async () => {
      const r = await buscarOcorrencias(orgA, "palmeiras");
      expect(r.rows).toHaveLength(TETO);
      const r2 = await buscarOcorrencias(orgA, "palmeiras");
      expect(r2.rows.map((x) => x.id)).toEqual(r.rows.map((x) => x.id));
    });
  });

  describe("registro de consulta", () => {
    it("aceita o recurso 'busca' e continua recusando recurso desconhecido", async () => {
      const oc = await db.query<{ id: string }>(
        "SELECT id FROM ocorrencias WHERE organizacao_id = $1 AND protocolo = '000123/2026'", [orgA],
      );
      const usuario = await db.query<{ id: string }>(
        "SELECT id FROM usuarios WHERE organizacao_id = $1 AND matricula = '0002'", [orgA],
      );
      const inserir = (recurso: string) => comoApp(orgA, (tx) => tx.query(
        `INSERT INTO ocorrencia_consultas
           (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel, recurso, finalidade)
         VALUES ($1, $2, $3, 'Carlos Henrique Mota', 'operador', $4, 'atendimento')`,
        [orgA, oc.rows[0]!.id, usuario.rows[0]!.id, recurso],
      ));
      await expect(inserir("busca")).resolves.toBeDefined();
      await expect(inserir("caminho_cru_da_requisicao")).rejects.toThrow(/check|recurso/i);
    });
  });

  describe("índice de trigramas", () => {
    it.runIf(comTrigramas)("existe sobre a chave de busca das quatro tabelas", async () => {
      const r = await db.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND indexname LIKE '%_busca_idx' ORDER BY indexname`,
      );
      expect(r.rows.map((i) => i.indexname)).toEqual([
        "equipes_busca_idx", "ocorrencias_busca_idx", "orgaos_busca_idx", "usuarios_busca_idx",
      ]);
      for (const i of r.rows) {
        expect(i.indexdef, `${i.indexname} não é GIN de trigramas`).toMatch(/USING gin \(busca gin_trgm_ops\)/);
      }
    });

    it.runIf(!comTrigramas)("sem a extensão, a migração segue sem índice e sem quebrar", async () => {
      const ext = await db.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
      expect(ext.rows).toHaveLength(0);
      const r = await db.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_busca_idx'",
      );
      expect(r.rows).toHaveLength(0);
    });

    it.runIf(comTrigramas)("o EXPLAIN mostra o índice de trigramas atendendo o predicado da busca", async () => {
      /*
        DUAS AFIRMAÇÕES, porque são duas perguntas diferentes.

        (a) Como a aplicação (RLS ligado): o predicado do município entra
        pelo índice de `organizacao_id`, e o banco não varre a tabela. Com
        300 linhas o planejador escolhe o índice do município e filtra o
        resto, e está certo: numa prefeitura, "as linhas do meu município"
        já é um recorte pequeno. O que NÃO pode acontecer é "Seq Scan".

        (b) Como dono das tabelas, sem o predicado do município: a única
        forma de atender `casa_busca(busca, termo)` por índice é o GIN de
        trigramas, então ele precisa aparecer com a chave de busca dentro do
        Index Cond. É isto que prova que a função inlina até os operadores
        `~~` e `<%` que o índice entende: se `casa_busca` deixasse de ser
        inlinável (SECURITY DEFINER, plpgsql, STRICT com OR dentro), o índice
        continuaria existindo e nunca seria usado.
      */
      const sql = `SELECT id FROM ocorrencias o WHERE casa_busca(o.busca, 'servidao boa esperansa')`;

      const comoAplicacao = await comoApp(orgA, async (tx) => {
        await tx.exec("SET LOCAL enable_seqscan = off");
        const r = await tx.query<Record<string, string>>(`EXPLAIN ${sql}`);
        return r.rows.map((l) => l["QUERY PLAN"]).join("\n");
      });
      expect(comoAplicacao, `varredura completa com RLS:\n${comoAplicacao}`).not.toContain("Seq Scan on ocorrencias");
      // Qualquer índice que comece pelo município serve; o que não serve é varrer.
      expect(comoAplicacao).toMatch(/(Index Scan using|Bitmap Index Scan on) ocorrencias_/);
      // E o predicado da busca chegou inlinado até os operadores, e não como chamada de função.
      expect(comoAplicacao, `casa_busca não foi inlinada:\n${comoAplicacao}`).toMatch(/busca ~~ /);
      expect(comoAplicacao).not.toContain("casa_busca(");

      const comoDono = await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL enable_seqscan = off");
        const r = await tx.query<Record<string, string>>(`EXPLAIN ${sql}`);
        return r.rows.map((l) => l["QUERY PLAN"]).join("\n");
      });
      expect(comoDono, `o índice de trigramas não entrou no plano:\n${comoDono}`).toContain("ocorrencias_busca_idx");
      const condicoes = comoDono.split("\n").filter((l) => l.includes("Index Cond:")).join("\n");
      expect(condicoes, `a chave de busca ficou fora do Index Cond:\n${comoDono}`).toContain("busca");
      expect(comoDono, `varredura completa sem RLS:\n${comoDono}`).not.toContain("Seq Scan on ocorrencias");
    });
  });
});
