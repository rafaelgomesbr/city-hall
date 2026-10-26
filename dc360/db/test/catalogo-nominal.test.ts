/**
 * As SONDAS do catálogo nominal do portão de isolamento (V2-F03-E08, parte 0B).
 *
 * `isolamento.test.ts` passa a conferir `FUNCOES_PRIVILEGIADAS` e
 * `EXCECOES_AO_ISOLAMENTO` contra o banco, nos dois sentidos. Uma conferência
 * que nunca foi vista reprovando pode estar quebrada e dar verde para sempre
 * (este projeto já teve dois testes assim na mesma semana), então este arquivo
 * faz o contrário do portão: abre cada buraco de propósito num banco só dele,
 * confere que a MESMA função de conferência que o portão usa grita, e fecha o
 * buraco no `finally`.
 *
 * O que as sondas provam, uma por uma:
 *   1. função SECURITY DEFINER no banco fora da lista reprova;
 *   2. sobrecarga de uma função listada (mesmo nome, outros argumentos) reprova;
 *   3. entrada na lista sem a função no banco reprova (e função listada que
 *      deixou de ser SECURITY DEFINER também);
 *   4. EXECUTE a PUBLIC ou a papel não declarado reprova;
 *   5. tabela sem `organizacao_id` fora das exceções reprova;
 *   6. entrada nas exceções que o banco não confirma reprova (tabela que não
 *      existe, ou que não precisa da exceção);
 *   7. a junção das contribuições das etapas recusa a entrada duplicada.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE } from "./catalogo/base.js";
import {
  COLUNAS_COM_UPDATE_DO_APP,
  CONTRIBUICOES_DO_CATALOGO,
  EXCECOES_AO_ISOLAMENTO,
  FUNCOES_PRIVILEGIADAS,
  conferirExcecoes,
  conferirFuncoesPrivilegiadas,
  juntarCatalogo,
  quemExecuta,
  type ExcecaoAoIsolamento,
  type FuncaoPrivilegiada,
} from "./catalogo/index.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const pasta = join(aqui, "..", "migrations");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const arquivo of arquivos) await db.exec(readFileSync(join(pasta, arquivo), "utf8"));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/** Abre o buraco, roda a conferência, fecha o buraco sempre. */
async function comBuraco<T>(abrir: string, fechar: string, conferir: () => Promise<T>): Promise<T> {
  await db.exec(abrir);
  try {
    return await conferir();
  } finally {
    await db.exec(fechar);
  }
}

const funcoes = () => conferirFuncoesPrivilegiadas(db, FUNCOES_PRIVILEGIADAS);
const excecoes = () => conferirExcecoes(db, EXCECOES_AO_ISOLAMENTO);

const FANTASMA: FuncaoPrivilegiada = {
  nome: "funcao_que_nao_existe",
  argumentos: "p_x integer",
  migracao: "999",
  etapa: "sonda",
  executavelPor: ["dc360_app"],
  motivo: "Entrada de sonda: o banco não tem esta função, e a conferência precisa gritar por isso.",
  tenant: "contexto",
  confere: "Entrada de sonda, sem função de verdade por trás dela.",
};

describe("o catálogo de hoje bate com o banco de hoje (a linha de base)", () => {
  it("as funções privilegiadas listadas são exatamente as do banco", async () => {
    expect(await funcoes()).toEqual([]);
  });

  it("as exceções ao isolamento listadas são exatamente as do banco", async () => {
    expect(await excecoes()).toEqual([]);
  });

  it("a lista nominal tem os nomes de hoje, sem teto numérico", () => {
    expect(FUNCOES_PRIVILEGIADAS.map((f) => f.nome).sort()).toEqual([
      "abrir_oficio",
      "abrir_recuperacao",
      "abrir_sessao",
      "concluir_eliminacao",
      "console_agendar_eliminacao",
      "console_cancelar_eliminacao",
      "console_consumir_recuperacao",
      "console_reativar_municipio",
      "console_recuperacao_por_email",
      "console_renovar_codigos",
      "console_suspender_municipio",
      "consumir_recuperacao",
      "credenciais_para_login",
      "dono_do_token",
      "eliminacoes_pendentes",
      "executar_eliminacoes_vencidas",
      "interesse_recente",
      "minimizar_por_prazo",
      "municipios_a_resumir",
      "provisionar_municipio",
      "registrar_tentativa_login",
      "revogar_sessao",
      "revogar_sessoes_do_usuario",
      "sessao_por_token",
      "trocar_senha",
      "varrer_prazos",
      "varrer_tarefas_novas",
    ]);
    expect(EXCECOES_AO_ISOLAMENTO.map((e) => e.tabela).sort()).toEqual([
      "console_codigos_de_recuperacao",
      "console_operadores",
      "interesse_municipio",
      "organizacoes",
    ]);
    expect(COLUNAS_COM_UPDATE_DO_APP).toHaveLength(16);
  });

  it("a dívida de tenant de hoje está declarada, com a etapa que a paga", () => {
    const divida = FUNCOES_PRIVILEGIADAS.filter((f) => f.tenant === "ainda_nao_confere");
    expect(divida.map((f) => f.nome).sort()).toEqual([
      "registrar_tentativa_login",
      "revogar_sessoes_do_usuario",
      "trocar_senha",
    ]);
    for (const f of divida) expect(f.corrigidaEm).toBe("V2-F03-E08");
  });
});

describe("sonda 1: função SECURITY DEFINER fora da lista reprova", () => {
  it("uma função nova com SECURITY DEFINER e search_path fixo, sem entrada na lista", async () => {
    const problemas = await comBuraco(
      `CREATE FUNCTION sonda_fora_da_lista(p_x integer) RETURNS integer
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT p_x $$;
       REVOKE ALL ON FUNCTION sonda_fora_da_lista(integer) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION sonda_fora_da_lista(integer) TO dc360_app;`,
      "DROP FUNCTION sonda_fora_da_lista(integer)",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /fora de FUNCOES_PRIVILEGIADAS: sonda_fora_da_lista\(p_x integer\)/,
    );
    // Fechado o buraco, volta a bater.
    expect(await funcoes()).toEqual([]);
  });

  it("a função de uma etapa que o catálogo ainda não conhece (nome de função da F03) reprova", async () => {
    const problemas = await comBuraco(
      `CREATE FUNCTION vigencia_da_sessao(p_sid uuid) RETURNS boolean
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT true $$;
       REVOKE ALL ON FUNCTION vigencia_da_sessao(uuid) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION vigencia_da_sessao(uuid) TO dc360_app;`,
      "DROP FUNCTION vigencia_da_sessao(uuid)",
      funcoes,
    );
    expect(problemas.join("\n")).toMatch(/vigencia_da_sessao\(p_sid uuid\)/);
  });
});

describe("sonda 2: sobrecarga de uma função listada reprova", () => {
  it("mesmo nome de `credenciais_para_login`, outros argumentos: a chave é nome e argumentos", async () => {
    const problemas = await comBuraco(
      `CREATE FUNCTION credenciais_para_login(p_sonda integer) RETURNS integer
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT p_sonda $$;
       REVOKE ALL ON FUNCTION credenciais_para_login(integer) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION credenciais_para_login(integer) TO dc360_app;`,
      "DROP FUNCTION credenciais_para_login(integer)",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/credenciais_para_login\(p_sonda integer\)/);
  });
});

describe("sonda 3: entrada na lista que o banco não confirma reprova", () => {
  it("uma função que não existe no banco", async () => {
    const problemas = await conferirFuncoesPrivilegiadas(db, [...FUNCOES_PRIVILEGIADAS, FANTASMA]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /consta em FUNCOES_PRIVILEGIADAS \(sonda\) mas não existe no banco como SECURITY DEFINER: funcao_que_nao_existe/,
    );
  });

  it("uma função listada que deixou de ser SECURITY DEFINER", async () => {
    const problemas = await comBuraco(
      "ALTER FUNCTION interesse_recente(text) SECURITY INVOKER",
      "ALTER FUNCTION interesse_recente(text) SECURITY DEFINER",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /mas não existe no banco como SECURITY DEFINER: interesse_recente\(p_email text\)/,
    );
  });

  it("tirar a função da lista (o caminho inverso) também reprova", async () => {
    const semUma = FUNCOES_PRIVILEGIADAS.filter((f) => f.nome !== "trocar_senha");
    const problemas = await conferirFuncoesPrivilegiadas(db, semUma);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/fora de FUNCOES_PRIVILEGIADAS: trocar_senha\(/);
  });
});

describe("sonda 4: o EXECUTE tem de ser exatamente o declarado", () => {
  it("EXECUTE concedido a PUBLIC", async () => {
    const problemas = await comBuraco(
      "GRANT EXECUTE ON FUNCTION interesse_recente(text) TO PUBLIC",
      "REVOKE EXECUTE ON FUNCTION interesse_recente(text) FROM PUBLIC",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /interesse_recente\(p_email text\): o EXECUTE do banco \(PUBLIC, dc360_app\)/,
    );
  });

  it("EXECUTE concedido ao console numa função que só a aplicação executa", async () => {
    const problemas = await comBuraco(
      "GRANT EXECUTE ON FUNCTION sessao_por_token(text) TO dc360_console",
      "REVOKE EXECUTE ON FUNCTION sessao_por_token(text) FROM dc360_console",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /sessao_por_token\(p_token_hash text\): o EXECUTE do banco \(dc360_app, dc360_console\)/,
    );
  });

  it("quemExecuta lê a ACL: dono fora, PUBLIC como PUBLIC, ACL nula como PUBLIC", () => {
    expect(quemExecuta("postgres=X/postgres,dc360_app=X/postgres")).toEqual(["dc360_app"]);
    expect(quemExecuta("postgres=X/postgres,=X/postgres,dc360_app=X/postgres")).toEqual([
      "PUBLIC",
      "dc360_app",
    ]);
    expect(quemExecuta(null)).toEqual(["PUBLIC"]);
  });
});

describe("sonda 5: o que a entrada diz precisa ser verdade e ter dono", () => {
  it("dívida de tenant sem a etapa que a paga", async () => {
    const lista = FUNCOES_PRIVILEGIADAS.map((f) => {
      if (f.nome !== "trocar_senha") return f;
      const { corrigidaEm: _semEtapa, ...resto } = f;
      return resto as FuncaoPrivilegiada;
    });
    const problemas = await conferirFuncoesPrivilegiadas(db, lista);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/dívida de tenant sem a etapa que a paga/);
  });

  it("motivo de enchimento", async () => {
    const lista = FUNCOES_PRIVILEGIADAS.map((f) =>
      f.nome === "varrer_prazos" ? { ...f, motivo: "porque sim" } : f,
    );
    const problemas = await conferirFuncoesPrivilegiadas(db, lista);
    expect(problemas.join("\n")).toMatch(/varrer_prazos.*motivo está curto demais/);
  });
});

describe("sonda 6: tabela sem organizacao_id fora das exceções reprova", () => {
  it("uma tabela nova sem a coluna", async () => {
    const problemas = await comBuraco(
      "CREATE TABLE sonda_sem_tenant (id integer PRIMARY KEY)",
      "DROP TABLE sonda_sem_tenant",
      excecoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /^sonda_sem_tenant não tem organizacao_id obrigatório e não consta em EXCECOES_AO_ISOLAMENTO/,
    );
    expect(await excecoes()).toEqual([]);
  });

  it("uma tabela com `organizacao_id` que aceita nulo conta como sem a coluna", async () => {
    const problemas = await comBuraco(
      "CREATE TABLE sonda_org_nula (id integer PRIMARY KEY, organizacao_id uuid)",
      "DROP TABLE sonda_org_nula",
      excecoes,
    );
    expect(problemas.join("\n")).toMatch(/sonda_org_nula não tem organizacao_id obrigatório/);
  });

  it("declarar a tabela como exceção, com motivo, é o caminho certo e passa", async () => {
    const dela: ExcecaoAoIsolamento = {
      tabela: "sonda_sem_tenant",
      semOrganizacaoId: true,
      semPolicyDeTenant: false,
      etapa: "sonda",
      motivo: "Tabela de sonda: existe só neste teste para provar que a exceção nominal basta.",
      trava: "Nenhuma, é uma sonda; o que vale aqui é a lista nominal reconhecer o nome.",
    };
    const problemas = await comBuraco(
      "CREATE TABLE sonda_sem_tenant (id integer PRIMARY KEY)",
      "DROP TABLE sonda_sem_tenant",
      () => conferirExcecoes(db, [...EXCECOES_AO_ISOLAMENTO, dela]),
    );
    expect(problemas).toEqual([]);
  });

  it("tirar uma exceção de hoje da lista reprova (`interesse_municipio` volta a ser tabela sem a coluna)", async () => {
    const semUma = EXCECOES_AO_ISOLAMENTO.filter((e) => e.tabela !== "interesse_municipio");
    const problemas = await conferirExcecoes(db, semUma);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/^interesse_municipio não tem organizacao_id obrigatório/);
  });
});

describe("sonda 7: exceção que o banco não confirma reprova", () => {
  const base = {
    semPolicyDeTenant: false,
    etapa: "sonda",
    motivo: "Entrada de sonda: o motivo existe só para passar do tamanho mínimo do texto.",
    trava: "Entrada de sonda, sem trava de verdade por trás dela.",
  };

  it("tabela que não existe", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      { ...base, tabela: "tabela_que_nao_existe", semOrganizacaoId: true },
    ]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/mas a tabela não existe no banco: tabela_que_nao_existe/);
  });

  it("tabela que TEM `organizacao_id`: exceção desnecessária (era o caso de `protocolo_sequencias`)", async () => {
    for (const tabela of ["ocorrencias", "protocolo_sequencias"]) {
      const problemas = await conferirExcecoes(db, [
        ...EXCECOES_AO_ISOLAMENTO,
        { ...base, tabela, semOrganizacaoId: true },
      ]);
      expect(problemas, tabela).toHaveLength(1);
      expect(problemas[0], tabela).toMatch(
        new RegExp(`${tabela}: declarada sem organizacao_id, mas a tabela TEM a coluna`),
      );
    }
  });

  it("tabela que TEM policy de tenant: isenção de policy desnecessária", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      { ...base, tabela: "ocorrencias", semOrganizacaoId: false, semPolicyDeTenant: true },
    ]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /ocorrencias: declarada sem policy de tenant, mas a tabela TEM policy/,
    );
  });

  it("entrada que não declara exceção nenhuma", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      { ...base, tabela: "ocorrencias", semOrganizacaoId: false, semPolicyDeTenant: false },
    ]);
    expect(problemas.join("\n")).toMatch(
      /ocorrencias: entrada em EXCECOES_AO_ISOLAMENTO que não declara exceção nenhuma/,
    );
  });
});

describe("sonda 8: a junção das contribuições das etapas", () => {
  const funcao = (extra: Partial<FuncaoPrivilegiada> = {}): FuncaoPrivilegiada => ({
    ...FANTASMA,
    ...extra,
  });
  const vazia = { funcoes: [], excecoes: [], colunasComUpdate: [] } as const;

  it("as 13 etapas da F03 estão no catálogo, vazias, mais a base", () => {
    const nomes = CONTRIBUICOES_DO_CATALOGO.map(([de]) => de).sort();
    expect(nomes).toEqual(
      [
        "base",
        ...[
          "E04",
          "E05",
          "E06",
          "E08",
          "E09",
          "E10",
          "E11",
          "E15",
          "E16",
          "E17",
          "E19",
          "E20",
          "E21",
        ].map((e) => `V2-F03-${e}`),
      ].sort(),
    );
    for (const [de, c] of CONTRIBUICOES_DO_CATALOGO) {
      if (de === "base") continue;
      expect(c, de).toEqual(vazia);
    }
    expect(CONTRIBUICOES_DO_CATALOGO[0]![1]).toBe(BASE);
  });

  it("a mesma função em duas etapas, sem redefine, é erro", () => {
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, funcoes: [funcao()] }],
        ["V2-F03-E09", { ...vazia, funcoes: [funcao()] }],
      ]),
    ).toThrow(
      /funcao_que_nao_existe\(p_x integer\)" aparece duas vezes \(a segunda em V2-F03-E09\) sem redefine: true/,
    );
  });

  it("redefine: true substitui a entrada anterior (a etapa que muda a forma de conferir o tenant)", () => {
    const juntado = juntarCatalogo([
      [
        "base",
        { ...vazia, funcoes: [funcao({ tenant: "ainda_nao_confere", corrigidaEm: "V2-F03-E08" })] },
      ],
      ["V2-F03-E08", { ...vazia, funcoes: [funcao({ tenant: "contexto", redefine: true })] }],
    ]);
    expect(juntado.funcoes).toHaveLength(1);
    expect(juntado.funcoes[0]!.tenant).toBe("contexto");
  });

  it("redefine: true sem entrada anterior é erro (nome errado)", () => {
    expect(() =>
      juntarCatalogo([["V2-F03-E08", { ...vazia, funcoes: [funcao({ redefine: true })] }]]),
    ).toThrow(/declara redefine: true mas não há entrada anterior/);
  });

  it("a mesma exceção ou a mesma coluna em duas etapas é erro", () => {
    const e: ExcecaoAoIsolamento = {
      tabela: "pessoas",
      semOrganizacaoId: true,
      semPolicyDeTenant: false,
      etapa: "sonda",
      motivo: "x",
      trava: "x",
    };
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, excecoes: [e] }],
        ["V2-F03-E11", { ...vazia, excecoes: [e] }],
      ]),
    ).toThrow(/EXCECOES_AO_ISOLAMENTO: "pessoas" aparece duas vezes/);
    const c = { tabela: "t", coluna: "c", migracao: "1", etapa: "sonda", motivo: "x" };
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, colunasComUpdate: [c] }],
        ["V2-F03-E11", { ...vazia, colunasComUpdate: [c] }],
      ]),
    ).toThrow(/COLUNAS_COM_UPDATE_DO_APP: "t.c" aparece duas vezes/);
  });
});
