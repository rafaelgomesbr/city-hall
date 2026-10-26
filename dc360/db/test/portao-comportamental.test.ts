/**
 * As SONDAS da parte 0D (V2-F03-E08): cada lacuna que a auditoria de cobertura
 * da parte 0B achou no portão de isolamento, aberta de propósito num banco só
 * deste arquivo, e a MESMA função que o portão usa gritando por ela.
 *
 * O portão (`isolamento.test.ts`) roda as conferências e a prova
 * comportamental contra o banco de hoje e cobra que não haja problema. Uma
 * conferência que nunca foi vista reprovando pode estar quebrada e dar verde
 * para sempre; este arquivo faz o contrário: abre o buraco, confere que a
 * conferência acusa, e fecha o buraco no `finally`. Os itens numerados são os
 * do relatório da auditoria (1 a 8) e os da correção 2 da ADR 0009 (a, b, c).
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTRIBUICOES_DO_CATALOGO,
  FUNCOES_PRIVILEGIADAS,
  HistoricoDasDefinicoes,
  POLICIES_DO_FORNECEDOR,
  PREPAROS,
  conferirAclDeExtensoes,
  conferirCorpoDasFuncoes,
  conferirDefinicaoInstalada,
  conferirEsquemas,
  conferirFontes,
  conferirGatilhoForaDoAlcance,
  conferirMarcaDeLiberacao,
  conferirModoDasPolicies,
  conferirPoliciesDoFornecedor,
  conferirQuemCitaOrigensDeConta,
  conferirSequenciasETipos,
  conferirVisoes,
  fontesDoRepositorio,
  foraDoModelo,
  juntarCatalogo,
  provarIsolamento,
  provarTabela,
  semear,
  tabelasDaProva,
  type BancoDaProva,
  type ContribuicaoDoCatalogo,
  type FuncaoPrivilegiada,
  type Semeadura,
} from "./catalogo/index.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");
const arquivos = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let db: PGlite;
let a: string;
let b: string;
let semeadura: Semeadura;
const historico = new HistoricoDasDefinicoes();
const prova = () => db as unknown as BancoDaProva;

beforeAll(async () => {
  db = new PGlite();
  for (const arquivo of arquivos) {
    await db.exec(readFileSync(join(pasta, arquivo), "utf8"));
    await historico.registrar(db, arquivo.slice(0, 3));
  }
  const org = async (nome: string) =>
    (
      await db.query<{ id: string }>(
        "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $1, 'MG') RETURNING id",
        [nome],
      )
    ).rows[0]!.id;
  a = await org("Serra Alta");
  b = await org("Vale Fundo");
  semeadura = await semear(prova(), a, b, PREPAROS, []);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function comBuraco<T>(abrir: string, fechar: string, conferir: () => Promise<T>): Promise<T> {
  await db.exec(abrir);
  try {
    return await conferir();
  } finally {
    await db.exec(fechar);
  }
}

/** A prova comportamental de UMA tabela de hoje, com o que a semeadura deixou nela. */
async function provarSo(tabela: string): Promise<string[]> {
  const t = (await tabelasDaProva(db)).find((x) => x.qualificado === tabela)!;
  return [...(await provarTabela(prova(), t, semeadura.linhas.get(tabela)!, { a, b })).problemas];
}

describe("linha de base: o banco de hoje passa por tudo", () => {
  it("a semeadura cobre toda tabela, sem problema", () => {
    expect(semeadura.problemas).toEqual([]);
  });

  it("a prova comportamental inteira não acha nada no banco de hoje", async () => {
    expect((await provarIsolamento(prova(), semeadura, { a, b })).problemas).toEqual([]);
  });
});

describe("item 1: a prova comportamental morde, tabela por tabela", () => {
  it("policy de leitura com OR true (permissiva somada à de contexto): A lê B, e sem contexto lê tudo", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON equipes FOR SELECT USING (organizacao_id = app_organizacao_atual() OR true)",
      "DROP POLICY sonda ON equipes",
      () => provarSo("equipes"),
    );
    expect(p.join("\n")).toMatch(
      /no contexto de A: o papel de aplicação ENXERGA a linha de outro município/,
    );
    expect(p.join("\n")).toMatch(/sem contexto: o papel de aplicação lê 2 linha/);
  });

  it("policy de UPDATE com OR true no USING e no WITH CHECK: altera B às cegas e move a própria linha para B", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON equipes FOR UPDATE USING (organizacao_id = app_organizacao_atual() OR true) " +
        "WITH CHECK (organizacao_id = app_organizacao_atual() OR true)",
      "DROP POLICY sonda ON equipes",
      () => provarSo("equipes"),
    );
    expect(p.join("\n")).toMatch(/ALTERA linha de outro município/);
    expect(p.join("\n")).toMatch(/MOVE a própria linha para o município B/);
  });

  it("USING certo e WITH CHECK (true) no UPDATE: a guarda do USING não esconde o WITH CHECK aberto", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON equipes FOR UPDATE USING (organizacao_id = app_organizacao_atual()) WITH CHECK (true)",
      "DROP POLICY sonda ON equipes",
      () => provarSo("equipes"),
    );
    expect(p).toEqual([expect.stringMatching(/MOVE a própria linha para o município B/)]);
  });

  it("policy de INSERT com OR true: a cópia da linha de B passa pelo RLS e só para na unicidade", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON equipes FOR INSERT WITH CHECK (organizacao_id = app_organizacao_atual() OR true)",
      "DROP POLICY sonda ON equipes",
      () => provarSo("equipes"),
    );
    expect(p.join("\n")).toMatch(/a cópia da linha de B não foi recusada .*23505/);
  });

  it("GRANT DELETE e policy de DELETE com OR true: apaga a linha de B", async () => {
    const p = await comBuraco(
      "GRANT DELETE ON equipes TO dc360_app; " +
        "CREATE POLICY sonda ON equipes FOR DELETE USING (organizacao_id = app_organizacao_atual() OR true)",
      "DROP POLICY sonda ON equipes; REVOKE DELETE ON equipes FROM dc360_app",
      () => provarSo("equipes"),
    );
    expect(p.join("\n")).toMatch(/APAGA linha de outro município/);
  });

  it("a raiz também: OR true na leitura de `organizacoes`", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON organizacoes FOR SELECT USING (id = app_organizacao_atual() OR true)",
      "DROP POLICY sonda ON organizacoes",
      () => provarSo("organizacoes"),
    );
    expect(p.join("\n")).toMatch(/ENXERGA a linha de outro município/);
  });

  it("tabela sem município (exceção nominal) que o papel de aplicação passa a ler", async () => {
    const p = await comBuraco(
      "GRANT SELECT ON console_operadores TO dc360_app; " +
        "CREATE POLICY sonda ON console_operadores FOR SELECT TO dc360_app USING (true)",
      "DROP POLICY sonda ON console_operadores; REVOKE SELECT ON console_operadores FROM dc360_app",
      () => provarSo("console_operadores"),
    );
    expect(p.join("\n")).toMatch(/tabela sem município, e o papel de aplicação lê 1 linha/);
  });

  it("uma tabela NOVA, que nenhuma lista conhece, é descoberta, semeada e reprovada com OR true; com a policy certa, passa", async () => {
    const criar = (policy: string) => `
      CREATE TABLE sonda_nova (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizacao_id uuid NOT NULL REFERENCES organizacoes(id), nome text NOT NULL);
      ALTER TABLE sonda_nova ENABLE ROW LEVEL SECURITY; ALTER TABLE sonda_nova FORCE ROW LEVEL SECURITY;
      CREATE POLICY sonda ON sonda_nova USING (${policy});
      GRANT SELECT, INSERT, UPDATE ON sonda_nova TO dc360_app;`;
    const rodar = async () => {
      const s = await semear(prova(), a, b, PREPAROS, []);
      const t = (await tabelasDaProva(db)).find((x) => x.qualificado === "sonda_nova")!;
      return [...(await provarTabela(prova(), t, s.linhas.get("sonda_nova")!, { a, b })).problemas];
    };
    const errada = await comBuraco(
      criar("organizacao_id = app_organizacao_atual() OR true"),
      "DROP TABLE sonda_nova",
      rodar,
    );
    expect(errada.join("\n")).toMatch(/ENXERGA/);
    expect(errada.join("\n")).toMatch(/ALTERA/);
    expect(errada.join("\n")).toMatch(/MOVE/);
    expect(errada.join("\n")).toMatch(/cópia da linha de B não foi recusada/);
    const certa = await comBuraco(
      criar("organizacao_id = app_organizacao_atual()"),
      "DROP TABLE sonda_nova",
      rodar,
    );
    expect(certa).toEqual([]);
  });

  it("PREPAROS e SEM_PROVA_COMPORTAMENTAL conferem nos dois sentidos", async () => {
    const s = await semear(
      prova(),
      a,
      b,
      [
        ...PREPAROS,
        {
          tabela: "equipes",
          colunas: { nome: "'x'" },
          etapa: "sonda",
          motivo: "Sonda: a fábrica genérica já semeia equipes.",
        },
        {
          tabela: "tabela_que_nao_existe",
          colunas: {},
          etapa: "sonda",
          motivo: "Sonda: a tabela não existe no banco.",
        },
      ],
      [
        {
          tabela: "orgaos",
          etapa: "sonda",
          motivo: "Sonda: a fábrica semeia orgaos, então a isenção sobrou.",
        },
      ],
    );
    expect(s.problemas.join("\n")).toMatch(/equipes tem preparo, mas a fábrica genérica já semeia/);
    expect(s.problemas.join("\n")).toMatch(/tabela_que_nao_existe não existe/);
    expect(s.problemas.join("\n")).toMatch(/orgaos se declara sem prova, mas a fábrica semeia/);
    const semPreparo = await semear(prova(), a, b, [], []);
    expect(semPreparo.problemas.join("\n")).toMatch(/não conseguiu semear oficios/);
  });
});

describe("item 2: o modo de cada policy, e a composição", () => {
  it("policy RESTRICTIVE fora da lista reprova; declarada e que virou PERMISSIVE reprova", async () => {
    const restrita = await comBuraco(
      "CREATE POLICY sonda ON equipes AS RESTRICTIVE FOR SELECT USING (organizacao_id = app_organizacao_atual())",
      "DROP POLICY sonda ON equipes",
      () => conferirModoDasPolicies(db, []),
    );
    expect(restrita.join("\n")).toMatch(/equipes\.sonda é RESTRICTIVE e não consta/);
    const declarada = {
      tabela: "equipes",
      policy: "sonda",
      etapa: "sonda",
      motivo: "Sonda: restrição de município declarada por nome.",
    };
    const virou = await comBuraco(
      "CREATE POLICY sonda ON equipes FOR SELECT USING (organizacao_id = app_organizacao_atual())",
      "DROP POLICY sonda ON equipes",
      () => conferirModoDasPolicies(db, [declarada]),
    );
    expect(virou.join("\n")).toMatch(/declarada RESTRICTIVE e o banco a tem como PERMISSIVE/);
    expect(await conferirModoDasPolicies(db, [declarada])).toEqual([
      expect.stringMatching(/não existe no banco: equipes\.sonda/),
    ]);
  });

  it("composição: a restrição de município como RESTRICTIVE com uma permissiva aberta isola; a mesma como PERMISSIVE vaza, e a prova mede", async () => {
    const montar = (modo: string) => `
      CREATE TABLE sonda_composta (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizacao_id uuid NOT NULL, nome text NOT NULL);
      ALTER TABLE sonda_composta ENABLE ROW LEVEL SECURITY; ALTER TABLE sonda_composta FORCE ROW LEVEL SECURITY;
      CREATE POLICY aberta ON sonda_composta FOR SELECT USING (true);
      CREATE POLICY municipio ON sonda_composta AS ${modo} FOR SELECT USING (organizacao_id = app_organizacao_atual());
      GRANT SELECT ON sonda_composta TO dc360_app;`;
    const rodar = async () => {
      const s = await semear(prova(), a, b, PREPAROS, []);
      const t = (await tabelasDaProva(db)).find((x) => x.qualificado === "sonda_composta")!;
      return [
        ...(await provarTabela(prova(), t, s.linhas.get("sonda_composta")!, { a, b })).problemas,
      ];
    };
    expect(await comBuraco(montar("RESTRICTIVE"), "DROP TABLE sonda_composta", rodar)).toEqual([]);
    const vaza = await comBuraco(montar("PERMISSIVE"), "DROP TABLE sonda_composta", rodar);
    expect(vaza.join("\n")).toMatch(/ENXERGA a linha de outro município/);
  });
});

describe("item 3: visões", () => {
  it("visão sem security_invoker lida pelo papel de aplicação reprova na conferência e na prova de leitura cruzada", async () => {
    const r = await comBuraco(
      "CREATE VIEW sonda_visao AS SELECT id, organizacao_id FROM equipes; GRANT SELECT ON sonda_visao TO dc360_app",
      "DROP VIEW sonda_visao",
      async () => ({
        conf: await conferirVisoes(db, []),
        prova: (await provarIsolamento(prova(), semeadura, { a, b })).problemas,
      }),
    );
    expect(r.conf.join("\n")).toMatch(
      /visão sonda_visao .* não roda com os privilégios de quem consulta/,
    );
    expect(r.prova.join("\n")).toMatch(
      /visão sonda_visao, no contexto de A: o que o papel de aplicação lê pela visão muda/,
    );
  });

  it("visão que só CONTA (sem identificador nenhum) também é pega pela prova: o número muda quando B some", async () => {
    const p = await comBuraco(
      "CREATE VIEW sonda_visao AS SELECT count(*) AS n FROM equipes; GRANT SELECT ON sonda_visao TO dc360_app",
      "DROP VIEW sonda_visao",
      async () => (await provarIsolamento(prova(), semeadura, { a, b })).problemas,
    );
    expect(p.join("\n")).toMatch(/visão sonda_visao, no contexto de A/);
  });

  it("com security_invoker, a mesma visão passa nas duas", async () => {
    const r = await comBuraco(
      "CREATE VIEW sonda_visao WITH (security_invoker = true) AS SELECT id, organizacao_id FROM equipes; " +
        "GRANT SELECT ON sonda_visao TO dc360_app",
      "DROP VIEW sonda_visao",
      async () => ({
        conf: await conferirVisoes(db, []),
        prova: (await provarIsolamento(prova(), semeadura, { a, b })).problemas,
      }),
    );
    expect(r).toEqual({ conf: [], prova: [] });
  });

  it("visão materializada lida pelo console, e entrada de VISOES_SEM_INVOKER que sobra, reprovam", async () => {
    const r = await comBuraco(
      "CREATE MATERIALIZED VIEW sonda_mat AS SELECT organizacao_id FROM ocorrencias; GRANT SELECT ON sonda_mat TO dc360_console",
      "DROP MATERIALIZED VIEW sonda_mat",
      () =>
        conferirVisoes(db, [
          {
            visao: "console_situacao_dos_municipios",
            etapa: "sonda",
            motivo: "Sonda: esta visão já tem security_invoker.",
          },
        ]),
    );
    expect(r.join("\n")).toMatch(/visão sonda_mat \(lida por dc360_console/);
    expect(r.join("\n")).toMatch(/não precisa .*console_situacao_dos_municipios/);
  });
});

describe("item 4: as policies do fornecedor, cláusula a cláusula", () => {
  const tabelas = [...new Set(POLICIES_DO_FORNECEDOR.map((p) => p.tabela))];

  it("OR true na guarda do dono reprova (o toContain antigo aceitava)", async () => {
    const p = await comBuraco(
      "ALTER POLICY eliminacoes_cancelamento_do_console ON eliminacoes_de_municipio " +
        "USING ((console_operador_e_dono() OR true) AND banco_apagado_em IS NULL)",
      "ALTER POLICY eliminacoes_cancelamento_do_console ON eliminacoes_de_municipio " +
        "USING (console_operador_e_dono() AND banco_apagado_em IS NULL)",
      () => conferirPoliciesDoFornecedor(db, POLICIES_DO_FORNECEDOR, tabelas),
    );
    expect(p).toEqual([expect.stringMatching(/eliminacoes_cancelamento_do_console: o USING é/)]);
  });

  it("WITH CHECK irrestrito atrás de um USING com a guarda reprova, conferido separado", async () => {
    const p = await comBuraco(
      "ALTER POLICY console_operadores_atualizacao ON console_operadores WITH CHECK (true)",
      "ALTER POLICY console_operadores_atualizacao ON console_operadores WITH CHECK " +
        "((id = console_operador_atual()) OR ((papel = 'operador'::text) AND console_operador_e_dono()))",
      () => conferirPoliciesDoFornecedor(db, POLICIES_DO_FORNECEDOR, tabelas),
    );
    expect(p).toEqual([
      expect.stringMatching(/console_operadores_atualizacao: o WITH CHECK é true/),
    ]);
  });

  it("policy nova numa tabela do fornecedor reprova", async () => {
    const p = await comBuraco(
      "CREATE POLICY sonda ON console_codigos_de_recuperacao FOR SELECT TO dc360_console USING (true)",
      "DROP POLICY sonda ON console_codigos_de_recuperacao",
      () => conferirPoliciesDoFornecedor(db, POLICIES_DO_FORNECEDOR, tabelas),
    );
    expect(p).toEqual([
      expect.stringMatching(
        /console_codigos_de_recuperacao\.sonda .* fora de POLICIES_DO_FORNECEDOR/,
      ),
    ]);
  });
});

describe("item 6: sequências, tipos, dono e privilégio padrão", () => {
  it("sequência com USAGE ao papel de aplicação reprova; declarada com o mesmo privilégio, passa", async () => {
    const abrir = "CREATE SEQUENCE sonda_seq; GRANT USAGE ON SEQUENCE sonda_seq TO dc360_app";
    const fechar = "DROP SEQUENCE sonda_seq";
    expect(
      (await comBuraco(abrir, fechar, () => conferirSequenciasETipos(db, [], []))).join("\n"),
    ).toMatch(/sequência sonda_seq: .*a mais: dc360_app:USAGE/);
    const declarada = {
      sequencia: "sonda_seq",
      grants: { dc360_app: ["USAGE"], dc360_console: [], PUBLIC: [] },
      etapa: "sonda",
      motivo: "Sonda: sequência declarada com o privilégio que ela tem.",
    };
    expect(
      await comBuraco(abrir, fechar, () => conferirSequenciasETipos(db, [declarada], [])),
    ).toEqual([]);
  });

  it("enum próprio fora de TIPOS_PROPRIOS reprova, e entrada sem tipo também", async () => {
    const p = await comBuraco(
      "CREATE TYPE sonda_enum AS ENUM ('serra_alta', 'vale_fundo')",
      "DROP TYPE sonda_enum",
      () =>
        conferirSequenciasETipos(
          db,
          [],
          [
            {
              tipo: "tipo_que_nao_existe",
              etapa: "sonda",
              motivo: "Sonda: o tipo não existe no banco.",
            },
          ],
        ),
    );
    expect(p.join("\n")).toMatch(/tipo próprio sonda_enum .* não consta em TIPOS_PROPRIOS/);
    expect(p.join("\n")).toMatch(
      /consta em TIPOS_PROPRIOS \(sonda\) e o tipo não existe: tipo_que_nao_existe/,
    );
  });

  it("objeto de papel do produto e privilégio padrão que concede a ele reprovam", async () => {
    const p = await comBuraco(
      "CREATE TYPE sonda_tipo AS (x int); ALTER TYPE sonda_tipo OWNER TO dc360_app; " +
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dc360_app",
      "DROP TYPE sonda_tipo; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM dc360_app",
      () =>
        conferirSequenciasETipos(
          db,
          [],
          [
            {
              tipo: "sonda_tipo",
              etapa: "sonda",
              motivo: "Sonda: tipo composto declarado com finalidade.",
            },
          ],
        ),
    );
    expect(p.join("\n")).toMatch(/tipo sonda_tipo é de dc360_app/);
    expect(p.join("\n")).toMatch(/privilégio padrão concede SELECT a dc360_app/);
  });
});

describe("item 7: tipos fora de public e o ACL de extensão", () => {
  it("tipo próprio noutro esquema reprova, e esquema com tipo próprio deixa de ser 'só de extensão'", async () => {
    const p = await comBuraco(
      "CREATE SCHEMA sonda_esquema; CREATE TYPE sonda_esquema.t AS ENUM ('x'); GRANT USAGE ON SCHEMA sonda_esquema TO dc360_app",
      "DROP SCHEMA sonda_esquema CASCADE",
      () => conferirEsquemas(db),
    );
    expect(p.join("\n")).toMatch(/objeto fora do esquema public: sonda_esquema\.t \(tipo\)/);
    expect(p.join("\n")).toMatch(/dc360_app tem USAGE no esquema sonda_esquema/);
  });

  describe("com uma extensão de verdade (pg_trgm no esquema extensions, como o PostGIS no provedor)", () => {
    let ext: PGlite;
    beforeAll(async () => {
      ext = new PGlite({ extensions: { pg_trgm } });
      await ext.exec(`
        CREATE ROLE dc360_app NOLOGIN; CREATE ROLE dc360_console NOLOGIN;
        CREATE TABLE organizacoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
        CREATE SCHEMA extensions;
        CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
        GRANT USAGE ON SCHEMA extensions TO dc360_app;
        CREATE TABLE extensions.sonda_ref (srid int);
        ALTER EXTENSION pg_trgm ADD TABLE extensions.sonda_ref;`);
    });
    afterAll(async () => {
      await ext?.close();
    });
    const LEITURA = {
      extensao: "pg_trgm",
      relacao: "extensions.sonda_ref",
      papel: "dc360_app" as const,
      etapa: "sonda",
      motivo: "Sonda: a relação da extensão que o papel de aplicação lê.",
    };

    it("esquema só de extensão (funções, tipos e a relação da extensão) aceita o USAGE do papel de aplicação", async () => {
      expect(await conferirEsquemas(ext)).toEqual([]);
    });

    it("um tipo que NÃO é da extensão no esquema dela tira o 'só de extensão' (antes da 0D, tipo não contava)", async () => {
      await ext.exec("CREATE TYPE extensions.intruso AS ENUM ('x')");
      try {
        const p = await conferirEsquemas(ext);
        expect(p.join("\n")).toMatch(
          /dc360_app tem USAGE no esquema extensions, que não é public nem esquema só de extensão/,
        );
      } finally {
        await ext.exec("DROP TYPE extensions.intruso");
      }
    });

    it("SELECT declarado passa; SELECT declarado que o banco não tem reprova; INSERT nunca", async () => {
      expect((await conferirAclDeExtensoes(ext, [LEITURA])).problemas).toEqual([
        expect.stringMatching(/consta em LEITURAS_DE_EXTENSAO .* e o banco não confirma/),
      ]);
      await ext.exec("GRANT SELECT, INSERT ON extensions.sonda_ref TO dc360_app");
      try {
        const r = await conferirAclDeExtensoes(ext, [LEITURA]);
        expect(r.problemas).toEqual([
          expect.stringMatching(/dc360_app tem INSERT em extensions\.sonda_ref/),
        ]);
        expect(r.naoInstaladas).toEqual([]);
      } finally {
        await ext.exec("REVOKE SELECT, INSERT ON extensions.sonda_ref FROM dc360_app");
      }
    });

    it("EXECUTE com opção de concessão numa função da extensão reprova", async () => {
      await ext.exec(
        "GRANT EXECUTE ON FUNCTION extensions.similarity(text, text) TO dc360_app WITH GRANT OPTION",
      );
      try {
        const r = await conferirAclDeExtensoes(ext, []);
        expect(r.problemas.join("\n")).toMatch(
          /dc360_app tem EXECUTE WITH GRANT OPTION em extensions\.similarity/,
        );
      } finally {
        await ext.exec(
          "REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION extensions.similarity(text, text) FROM dc360_app",
        );
      }
    });

    it("extensão declarada que não está instalada é DITA, e não conferida em silêncio", async () => {
      const r = await conferirAclDeExtensoes(ext, [
        { ...LEITURA, extensao: "postgis", relacao: "extensions.spatial_ref_sys" },
      ]);
      expect(r.naoInstaladas).toEqual(["postgis"]);
    });
  });
});

describe("correção 2 da ADR 0009: corpo, gatilho e a marca da liberação", () => {
  it("(a) o modelo aceita o DELETE e o SELECT montados da 038, e recusa o resto", () => {
    expect(
      foraDoModelo(
        "EXECUTE format('DELETE FROM %I WHERE organizacao_id = $1', v_tabela) USING p_org;",
      ),
    ).toEqual([]);
    expect(foraDoModelo("RETURN QUERY EXECUTE format('SELECT count(*) FROM %I', t);")).toEqual([]);
    expect(foraDoModelo("EXECUTE 'DELETE FROM ' || t;").join()).toMatch(/não é format/);
    expect(foraDoModelo("EXECUTE format('DELETE FROM %s', t);").join()).toMatch(/%s/);
    expect(
      foraDoModelo("EXECUTE format('CREATE OR REPLACE FUNCTION %I() ...', n);").join(),
    ).toMatch(/DDL|não é DML/);
    expect(foraDoModelo("ALTER TABLE usuarios DISABLE TRIGGER ALL;").join()).toMatch(
      /desliga gatilho/,
    );
    expect(
      foraDoModelo("PERFORM set_config('session_replication_role', 'replica', true);").join(),
    ).toMatch(/session_replication_role/);
    expect(foraDoModelo("SELECT 1", ["session_replication_role=replica"]).join()).toMatch(
      /SET session_replication_role/,
    );
    expect(foraDoModelo("-- DROP TABLE x\nSELECT 1 /* CREATE */")).toEqual([]);
  });

  it("(a) função privilegiada com DDL no corpo reprova; declarada com corpoForaDoModelo passa; a declaração que sobra reprova", async () => {
    const abrir = `CREATE FUNCTION sonda_ddl() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
                     AS $$ BEGIN EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', 'usuarios'); END $$;
                   REVOKE ALL ON FUNCTION sonda_ddl() FROM PUBLIC`;
    const entrada: FuncaoPrivilegiada = {
      nome: "sonda_ddl",
      assinatura: "public.sonda_ddl()",
      migracao: "999",
      etapa: "sonda",
      executavelPor: ["dc360_app"],
      motivo: "Sonda: função privilegiada que desliga gatilho por SQL montado.",
      tenant: "relogio",
      confere: "Sonda: não confere nada, existe para a conferência reprovar.",
      semProva: "Sonda: não há teste que a chame, só a conferência do corpo.",
    };
    const fechar = "DROP FUNCTION sonda_ddl()";
    const sem = await comBuraco(abrir, fechar, () =>
      conferirCorpoDasFuncoes(db, [...FUNCOES_PRIVILEGIADAS, entrada]),
    );
    expect(sem.join("\n")).toMatch(/public\.sonda_ddl\(\): o corpo sai do modelo/);
    const com = await comBuraco(abrir, fechar, () =>
      conferirCorpoDasFuncoes(db, [
        ...FUNCOES_PRIVILEGIADAS,
        {
          ...entrada,
          corpoForaDoModelo: "Sonda: justificativa escrita para a lista nominal do corpo.",
        },
      ]),
    );
    expect(com).toEqual([]);
    const sobra = FUNCOES_PRIVILEGIADAS.map((f) =>
      f.nome === "trocar_senha"
        ? { ...f, corpoForaDoModelo: "Sonda: isenção que sobrou numa função sem DDL nenhum." }
        : f,
    );
    expect(await conferirCorpoDasFuncoes(db, sobra)).toEqual([
      expect.stringMatching(/trocar_senha.*isenção que sobrou/),
    ]);
  });

  it("(b) TRIGGER ao papel de aplicação, e SET de session_replication_role a ele, reprovam", async () => {
    const p = await comBuraco(
      "GRANT TRIGGER ON usuarios TO dc360_app; GRANT SET ON PARAMETER session_replication_role TO dc360_app",
      "REVOKE TRIGGER ON usuarios FROM dc360_app; REVOKE SET ON PARAMETER session_replication_role FROM dc360_app",
      () => conferirGatilhoForaDoAlcance(db),
    );
    expect(p.join("\n")).toMatch(/dc360_app tem TRIGGER em usuarios/);
    expect(p.join("\n")).toMatch(/dc360_app pode mudar session_replication_role/);
  });

  it("(c) a forma da marca: antes da liberação a marcada é do papel de aplicação; depois, não; e a redefinição não a tira", () => {
    const credenciais = FUNCOES_PRIVILEGIADAS.find((f) => f.nome === "credenciais_para_login")!;
    const marcada = { ...credenciais, recusadaDepoisDaLiberacao: true as const };
    expect(conferirMarcaDeLiberacao([marcada], false)).toEqual([]);
    expect(conferirMarcaDeLiberacao([marcada], true).join()).toMatch(
      /depois da liberação, função do caminho antigo com EXECUTE/,
    );
    expect(
      conferirMarcaDeLiberacao([{ ...marcada, executavelPor: ["dc360_console"] }], false).join(),
    ).toMatch(/não a executa/);
    const base = CONTRIBUICOES_DO_CATALOGO[0]![1];
    const comMarca: ContribuicaoDoCatalogo = {
      ...base,
      funcoes: base.funcoes.map((f) => (f.nome === "credenciais_para_login" ? marcada : f)),
    };
    const vazia: ContribuicaoDoCatalogo = { funcoes: [], excecoes: [], colunasComUpdate: [] };
    const semMarca: ContribuicaoDoCatalogo = {
      ...vazia,
      funcoes: [{ ...credenciais, migracao: "999", etapa: "V2-F03-E16", redefine: true }],
    };
    expect(() =>
      juntarCatalogo([
        ["base", comMarca],
        ["V2-F03-E16", semMarca],
      ]),
    ).toThrow(/sem a marca/);
  });
});

describe("correção 3 da ADR 0009: quem cita origens_de_conta", () => {
  /*
    A tabela nasce na E15 e ainda não existe; o corpo plpgsql não é validado
    contra o catálogo na criação, então a sonda cria a função que a cita sem
    criar a tabela.
  */
  const criar = (nome: string, definidora: boolean) => `
    CREATE FUNCTION ${nome}(p uuid) RETURNS void LANGUAGE plpgsql
      ${definidora ? "SECURITY DEFINER" : ""} SET search_path = public, pg_temp
      AS $$ BEGIN INSERT INTO origens_de_conta (usuario_id, origem) VALUES (p, 'criador'); END $$;
    REVOKE ALL ON FUNCTION ${nome}(uuid) FROM PUBLIC`;
  const entrada = (nome: string, marca?: "criador" | "aceite"): FuncaoPrivilegiada => ({
    nome,
    assinatura: `public.${nome}(uuid)`,
    migracao: "999",
    etapa: "sonda",
    executavelPor: ["dc360_app"],
    motivo: "Sonda: função que grava a origem da conta, para a conferência do corpo.",
    tenant: "antes_do_tenant",
    confere: "Sonda: não confere nada, existe para a conferência reprovar.",
    semProva: "Sonda: não há teste que a chame, só a conferência de quem cita a tabela.",
    ...(marca ? { gravaOrigemDeConta: marca } : {}),
  });

  it("hoje ninguém cita, e passa", async () => {
    expect(await conferirQuemCitaOrigensDeConta(db, FUNCOES_PRIVILEGIADAS)).toEqual([]);
  });

  it("função privilegiada que cita a tabela sem a marca reprova; com a marca criador, passa", async () => {
    const abrir = criar("sonda_grava_origem", true);
    const fechar = "DROP FUNCTION sonda_grava_origem(uuid)";
    expect(
      await comBuraco(abrir, fechar, () =>
        conferirQuemCitaOrigensDeConta(db, FUNCOES_PRIVILEGIADAS),
      ),
    ).toEqual([expect.stringMatching(/sonda_grava_origem\(uuid\) cita origens_de_conta/)]);
    /*
      Com a marca, a sonda passa como quem grava a origem. Desde a E15 (054) a
      marca `criador` já é de `conta_ganha_pessoa`: a sonda vira a SEGUNDA
      função com a marca, e o único problema que sobra é esse (a marca é de
      uma função só). Antes da 054, nenhum.
    */
    const jaTemCriador = FUNCOES_PRIVILEGIADAS.some((f) => f.gravaOrigemDeConta === "criador");
    expect(
      await comBuraco(abrir, fechar, () =>
        conferirQuemCitaOrigensDeConta(db, [
          ...FUNCOES_PRIVILEGIADAS,
          entrada("sonda_grava_origem", "criador"),
        ]),
      ),
    ).toEqual(
      jaTemCriador
        ? [expect.stringMatching(/a marca criador de origens_de_conta está em mais de uma função/)]
        : [],
    );
  });

  it("função COMUM (não privilegiada) que cita a tabela também reprova: seria o atalho chamado de dentro de uma privilegiada", async () => {
    const p = await comBuraco(
      criar("sonda_ajudante", false),
      "DROP FUNCTION sonda_ajudante(uuid)",
      () => conferirQuemCitaOrigensDeConta(db, FUNCOES_PRIVILEGIADAS),
    );
    expect(p).toEqual([expect.stringMatching(/sonda_ajudante\(uuid\) cita origens_de_conta/)]);
  });

  it("aceite fora de aceitar_convite, marca em duas funções e marca que sobra reprovam; citar só em comentário não conta", async () => {
    const p = await comBuraco(
      `${criar("sonda_um", true)}; ${criar("sonda_dois", true)};
       CREATE FUNCTION sonda_comentario() RETURNS int LANGUAGE plpgsql
         AS $$ BEGIN -- origens_de_conta citada só aqui
           RETURN 1; END $$`,
      "DROP FUNCTION sonda_um(uuid); DROP FUNCTION sonda_dois(uuid); DROP FUNCTION sonda_comentario()",
      () =>
        conferirQuemCitaOrigensDeConta(db, [
          ...FUNCOES_PRIVILEGIADAS,
          entrada("sonda_um", "aceite"),
          entrada("sonda_dois", "aceite"),
          entrada("sonda_sobra", "criador"),
        ]),
    );
    const t = p.join("\n");
    expect(t).toMatch(/a marca aceite de origens_de_conta está em mais de uma função/);
    expect(t).toMatch(
      /sonda_um\(uuid\): a marca aceite de origens_de_conta é só de aceitar_convite/,
    );
    expect(t).toMatch(/sonda_sobra\(uuid\): declara gravaOrigemDeConta e o corpo não cita/);
    expect(t).not.toMatch(/sonda_comentario/);
  });
});

describe("item 5: a função recriada por SQL dinâmico", () => {
  /*
    A sabotagem: uma migração que recria `credenciais_para_login` com o filtro
    de e-mail desligado (`WHERE true OR ...`, devolve toda conta de todo
    município), por `EXECUTE format(...)` com o NOME MONTADO em tempo de
    execução. Assinatura, dono, ACL e search_path ficam os mesmos.
  */
  let RECRIAR = "";
  beforeAll(async () => {
    const def = (
      await db.query<{ d: string }>(
        "SELECT pg_get_functiondef('public.credenciais_para_login(text)'::regprocedure) AS d",
      )
    ).rows[0]!.d;
    const sabotada = def
      .replace("public.credenciais_para_login", "public.%I")
      .replace(/WHERE /i, "WHERE true OR ");
    expect(sabotada).not.toBe(def);
    const literal = sabotada.replace(/%(?!I)/g, "%%").replace(/'/g, "''");
    RECRIAR = `DO $sonda$ BEGIN EXECUTE format('${literal}', 'credenciais' || '_para_login'); END $sonda$`;
  });

  it("o texto da migração não mostra a recriação (é o que a 0B deixava passar)", () => {
    const fontes = fontesDoRepositorio();
    const comSonda = {
      migracoes: new Map([...fontes.migracoes, ["999", RECRIAR]]),
      ler: fontes.ler,
    };
    expect(conferirFontes(CONTRIBUICOES_DO_CATALOGO, comSonda)).toEqual([]);
  });

  it("a definição instalada mostra: a função mudou na 999 e o catálogo diz 046", async () => {
    const h = new HistoricoDasDefinicoes();
    const banco = new PGlite();
    try {
      for (const arquivo of arquivos) {
        await banco.exec(readFileSync(join(pasta, arquivo), "utf8"));
        await h.registrar(banco, arquivo.slice(0, 3));
      }
      expect(conferirDefinicaoInstalada(h, FUNCOES_PRIVILEGIADAS)).toEqual([]);
      await banco.exec(RECRIAR);
      await h.registrar(banco, "999");
      expect(conferirDefinicaoInstalada(h, FUNCOES_PRIVILEGIADAS)).toEqual([
        expect.stringMatching(/credenciais_para_login\(text\): .* mudou por último na 999/),
      ]);
    } finally {
      await banco.close();
    }
  }, 120_000);

  it("e o histórico do banco de hoje bate com o catálogo", () => {
    expect(conferirDefinicaoInstalada(historico, FUNCOES_PRIVILEGIADAS)).toEqual([]);
  });
});
