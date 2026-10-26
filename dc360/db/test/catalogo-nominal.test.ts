/**
 * As SONDAS do catálogo nominal do portão de isolamento (V2-F03-E08, parte 0B,
 * e a correção 1 dela).
 *
 * `isolamento.test.ts` confere `FUNCOES_PRIVILEGIADAS` e
 * `EXCECOES_AO_ISOLAMENTO` contra o banco, nos dois sentidos. Uma conferência
 * que nunca foi vista reprovando pode estar quebrada e dar verde para sempre
 * (este projeto já teve dois testes assim na mesma semana), então este arquivo
 * faz o contrário do portão: abre cada buraco de propósito num banco só dele,
 * confere que a MESMA função de conferência que o portão usa grita, e fecha o
 * buraco no `finally`.
 *
 * Cada sabotagem do revisor adversarial da parte 0B que passava pelo portão
 * (S3, S3b, S5a, S8b, S8d, S11, mais a S12, que só a varredura de privilégio
 * pegava) é um caso daqui, com o nome dela no título.
 *
 * O que este arquivo FIXA é só a BASE (`catalogo/base.ts`, o catálogo de
 * hoje, congelado). Das etapas ele confere a FORMA (cada `f03-eNN.ts` está na
 * junção com o rótulo dele, e cada entrada diz a etapa do arquivo), e nunca a
 * lista de nomes: cada parte da F03 (1A, 1B...) edita só o próprio arquivo de
 * etapa, sem colidir com as outras neste.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE } from "./catalogo/base.js";
import {
  CONTRIBUICOES_DO_CATALOGO,
  EXCECOES_AO_ISOLAMENTO,
  FUNCOES_PRIVILEGIADAS,
  INVARIANTES,
  conferirEsquemas,
  conferirExcecoes,
  conferirFontes,
  conferirFuncoesPrivilegiadas,
  fontesDoRepositorio,
  juntarCatalogo,
  quemExecuta,
  type ContribuicaoDoCatalogo,
  type ExcecaoAoIsolamento,
  type FontesDoCatalogo,
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
const esquemas = () => conferirEsquemas(db);

const FANTASMA: FuncaoPrivilegiada = {
  nome: "funcao_que_nao_existe",
  assinatura: "public.funcao_que_nao_existe(integer)",
  migracao: "999",
  etapa: "sonda",
  executavelPor: ["dc360_app"],
  motivo: "Entrada de sonda: o banco não tem esta função, e a conferência precisa gritar por isso.",
  tenant: "contexto",
  confere: "Entrada de sonda, sem função de verdade por trás dela.",
  semProva: "Entrada de sonda: não existe função, então não existe teste que a chame.",
};

const SEM_GRANT = { dc360_app: [], dc360_console: [], PUBLIC: [] } as const;

/** Uma exceção que dispensa a coluna e a policy e mantém o resto: a forma de `pessoas`. */
const excecaoDeSonda = (
  tabela: string,
  extra: Partial<ExcecaoAoIsolamento> = {},
): ExcecaoAoIsolamento => ({
  tabela,
  dispensa: ["organizacao_id", "policy_de_contexto"],
  mantem: ["rls_forcada", "grants_declarados", "fk_com_organizacao", "sem_delete"],
  grants: SEM_GRANT,
  etapa: "sonda",
  motivo: "Entrada de sonda: o motivo existe só para passar do tamanho mínimo do texto.",
  trava: "Entrada de sonda, sem trava de verdade por trás dela.",
  ...extra,
});

const trocarSenhaDaBase = () => BASE.funcoes.find((f) => f.nome === "trocar_senha")!;

/** A sabotagem S5a: apagar a dívida de `trocar_senha` só no catálogo. */
const s5a = (migracao: string): FuncaoPrivilegiada => ({
  ...trocarSenhaDaBase(),
  migracao,
  etapa: "V2-F03-E04",
  tenant: "contexto",
  corrigidaEm: undefined,
  confere: "Sabotagem S5a: declara conferir o contexto sem que o SQL da função mude.",
  redefine: true,
});

const vazia: ContribuicaoDoCatalogo = { funcoes: [], excecoes: [], colunasComUpdate: [] };

describe("o catálogo de hoje bate com o banco de hoje (a linha de base)", () => {
  it("as funções privilegiadas listadas são exatamente as do banco", async () => {
    expect(await funcoes()).toEqual([]);
  });

  it("as exceções ao isolamento listadas são exatamente as do banco, invariante por invariante", async () => {
    expect(await excecoes()).toEqual([]);
  });

  it("nada fora do esquema public, e nenhum papel do produto noutro esquema", async () => {
    expect(await esquemas()).toEqual([]);
  });

  it("a origem de cada função bate com as migrações e com os testes que a provam", () => {
    expect(conferirFontes(CONTRIBUICOES_DO_CATALOGO, fontesDoRepositorio())).toEqual([]);
  });
});

describe("a BASE congelada (só ela é fixada aqui)", () => {
  it("as 27 funções de hoje, pela assinatura completa, sem teto numérico", () => {
    expect(BASE.funcoes.map((f) => f.assinatura).sort()).toEqual([
      "public.abrir_oficio(text,text,text)",
      "public.abrir_recuperacao(text,text,interval,text)",
      "public.abrir_sessao(uuid,uuid,text,interval,text,text,uuid)",
      "public.concluir_eliminacao(uuid)",
      "public.console_agendar_eliminacao(uuid,text)",
      "public.console_cancelar_eliminacao(uuid)",
      "public.console_consumir_recuperacao(uuid,text,text)",
      "public.console_reativar_municipio(uuid)",
      "public.console_recuperacao_por_email(text)",
      "public.console_renovar_codigos(text[])",
      "public.console_suspender_municipio(uuid,text)",
      "public.consumir_recuperacao(text,text)",
      "public.credenciais_para_login(text)",
      "public.dono_do_token(text)",
      "public.eliminacoes_pendentes()",
      "public.executar_eliminacoes_vencidas()",
      "public.interesse_recente(text)",
      "public.minimizar_por_prazo(integer)",
      "public.municipios_a_resumir(interval)",
      "public.provisionar_municipio(text,text,text,text,text,text,text,text)",
      "public.registrar_tentativa_login(uuid,boolean,integer,interval)",
      "public.revogar_sessao(text,text)",
      "public.revogar_sessoes_do_usuario(uuid,text)",
      "public.sessao_por_token(text)",
      "public.trocar_senha(uuid,text,uuid)",
      "public.varrer_prazos(interval,interval,integer,integer,interval)",
      "public.varrer_tarefas_novas(interval,integer,integer)",
    ]);
    for (const f of BASE.funcoes) expect(f.etapa, f.assinatura).toBe("base");
  });

  it("as quatro exceções de hoje, com o que cada uma dispensa e se é do fornecedor", () => {
    expect(
      BASE.excecoes.map((e) => [e.tabela, [...e.dispensa].sort(), e.doFornecedor === true]),
    ).toEqual([
      ["organizacoes", ["organizacao_id"], false],
      ["interesse_municipio", ["organizacao_id", "policy_de_contexto"], false],
      ["console_operadores", ["fk_com_organizacao", "organizacao_id", "policy_de_contexto"], true],
      [
        "console_codigos_de_recuperacao",
        ["fk_com_organizacao", "organizacao_id", "policy_de_contexto"],
        true,
      ],
    ]);
  });

  it("as 16 colunas com UPDATE do papel de aplicação", () => {
    expect(BASE.colunasComUpdate.map((c) => `${c.tabela}.${c.coluna}`).sort()).toEqual([
      "devolucoes_de_tarefa.observacao",
      "devolucoes_de_tarefa.observacao_removida_em",
      "objetos_orfaos.decidido_em",
      "objetos_orfaos.decidido_por",
      "objetos_orfaos.decisao",
      "objetos_orfaos.decisao_motivo",
      "oficio_envios.desfecho",
      "oficio_envios.detalhe",
      "oficio_envios.provedor_id",
      "saidas_a_campo.desfecho",
      "saidas_a_campo.encerrada_em",
      "saidas_a_campo.encerrada_por",
      "saidas_a_campo.observacao",
      "saidas_a_campo.prorrogacao_key",
      "saidas_a_campo.prorrogacoes",
      "saidas_a_campo.retorno_previsto_em",
    ]);
  });

  it("a dívida de tenant da base está declarada, com a etapa que a paga", () => {
    const divida = BASE.funcoes.filter((f) => f.tenant === "ainda_nao_confere");
    expect(divida.map((f) => f.nome).sort()).toEqual([
      "registrar_tentativa_login",
      "revogar_sessoes_do_usuario",
      "trocar_senha",
    ]);
    for (const f of divida) expect(f.corrigidaEm).toBe("V2-F03-E08");
  });
});

describe("a FORMA das contribuições das etapas (e não a lista de nomes)", () => {
  it("a base vem primeiro, e é a BASE", () => {
    expect(CONTRIBUICOES_DO_CATALOGO[0]![0]).toBe("base");
    expect(CONTRIBUICOES_DO_CATALOGO[0]![1]).toBe(BASE);
  });

  it("todo `f03-eNN.ts` da pasta está na junção, com o rótulo da etapa dele, e nada sobra", async () => {
    const arquivos = readdirSync(join(aqui, "catalogo"))
      .filter((f) => /^f03-e\d{2}\.ts$/.test(f))
      .sort();
    expect(arquivos.length).toBeGreaterThan(0);
    const rotulos = CONTRIBUICOES_DO_CATALOGO.slice(1).map(([de]) => de);
    expect([...rotulos].sort()).toEqual(arquivos.map((f) => `V2-F03-E${f.slice(5, 7)}`).sort());
    for (const arquivo of arquivos) {
      const etapa = `V2-F03-E${arquivo.slice(5, 7)}`;
      const modulo = (await import(`./catalogo/${arquivo.replace(/\.ts$/, ".js")}`)) as Record<
        string,
        unknown
      >;
      const exportado = modulo[`CATALOGO_F03_E${arquivo.slice(5, 7)}`];
      const naJuncao = CONTRIBUICOES_DO_CATALOGO.find(([de]) => de === etapa)![1];
      expect(exportado, arquivo).toBe(naJuncao);
    }
  });

  it("cada contribuição tem as três listas, e cada entrada diz a etapa do arquivo de onde veio", () => {
    for (const [de, c] of CONTRIBUICOES_DO_CATALOGO) {
      expect(
        Array.isArray(c.funcoes) && Array.isArray(c.excecoes) && Array.isArray(c.colunasComUpdate),
        de,
      ).toBe(true);
      for (const item of [...c.funcoes, ...c.excecoes, ...c.colunasComUpdate]) {
        expect(item.etapa, de).toBe(de);
      }
    }
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
      /fora de FUNCOES_PRIVILEGIADAS: public\.sonda_fora_da_lista\(integer\)/,
    );
    // Fechado o buraco, volta a bater.
    expect(await funcoes()).toEqual([]);
  });

  it("a função de uma etapa que o catálogo ainda não conhece reprova", async () => {
    // Nome que nenhuma etapa vai usar: a sonda não pode colidir com a função real da etapa.
    const problemas = await comBuraco(
      `CREATE FUNCTION sonda_funcao_de_etapa_futura(p_sid uuid) RETURNS boolean
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT true $$;
       REVOKE ALL ON FUNCTION sonda_funcao_de_etapa_futura(uuid) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION sonda_funcao_de_etapa_futura(uuid) TO dc360_app;`,
      "DROP FUNCTION sonda_funcao_de_etapa_futura(uuid)",
      funcoes,
    );
    expect(problemas.join("\n")).toMatch(/public\.sonda_funcao_de_etapa_futura\(uuid\)/);
  });
});

describe("sonda 2: sobrecarga de uma função listada reprova", () => {
  it("mesmo nome de `credenciais_para_login`, outros argumentos: a chave é a assinatura", async () => {
    const problemas = await comBuraco(
      `CREATE FUNCTION credenciais_para_login(p_sonda integer) RETURNS integer
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT p_sonda $$;
       REVOKE ALL ON FUNCTION credenciais_para_login(integer) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION credenciais_para_login(integer) TO dc360_app;`,
      "DROP FUNCTION credenciais_para_login(integer)",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/public\.credenciais_para_login\(integer\)/);
  });
});

describe("sonda 3: entrada na lista que o banco não confirma reprova", () => {
  it("uma função que não existe no banco", async () => {
    const problemas = await conferirFuncoesPrivilegiadas(db, [...FUNCOES_PRIVILEGIADAS, FANTASMA]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /consta em FUNCOES_PRIVILEGIADAS \(sonda\) mas não existe no banco como SECURITY DEFINER: public\.funcao_que_nao_existe/,
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
      /mas não existe no banco como SECURITY DEFINER: public\.interesse_recente\(text\)/,
    );
  });

  it("tirar a função da lista (o caminho inverso) também reprova", async () => {
    const semUma = FUNCOES_PRIVILEGIADAS.filter((f) => f.nome !== "trocar_senha");
    const problemas = await conferirFuncoesPrivilegiadas(db, semUma);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/fora de FUNCOES_PRIVILEGIADAS: public\.trocar_senha\(/);
  });
});

describe("sonda 4: o EXECUTE e o dono têm de ser exatamente os declarados", () => {
  it("EXECUTE concedido a PUBLIC", async () => {
    const problemas = await comBuraco(
      "GRANT EXECUTE ON FUNCTION interesse_recente(text) TO PUBLIC",
      "REVOKE EXECUTE ON FUNCTION interesse_recente(text) FROM PUBLIC",
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /public\.interesse_recente\(text\): o EXECUTE do banco \(PUBLIC, dc360_app\)/,
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
      /public\.sessao_por_token\(text\): o EXECUTE do banco \(dc360_app, dc360_console\)/,
    );
  });

  it("S11: EXECUTE com opção de concessão reprova (o app repassaria o EXECUTE ao console)", async () => {
    const problemas = await comBuraco(
      "GRANT EXECUTE ON FUNCTION credenciais_para_login(text) TO dc360_app WITH GRANT OPTION",
      `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION credenciais_para_login(text) FROM dc360_app CASCADE`,
      funcoes,
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /public\.credenciais_para_login\(text\): o EXECUTE do banco \(dc360_app WITH GRANT OPTION\) não é o declarado \(dc360_app\)/,
    );
    expect(await funcoes()).toEqual([]);
  });

  it("S12: trocar o dono de uma função privilegiada reprova no catálogo", async () => {
    const dono = (
      await db.query<{ dono: string }>(
        "SELECT pg_get_userbyid(proowner)::text AS dono FROM pg_proc WHERE oid = 'interesse_recente(text)'::regprocedure",
      )
    ).rows[0]!.dono;
    const problemas = await comBuraco(
      "ALTER FUNCTION interesse_recente(text) OWNER TO dc360_console",
      `ALTER FUNCTION interesse_recente(text) OWNER TO "${dono}"`,
      funcoes,
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(/public\.interesse_recente\(text\): o dono da função é dc360_console/);
    expect(texto).toMatch(
      /public\.interesse_recente\(text\): o EXECUTE do banco \(dc360_app, dc360_console\)/,
    );
    expect(await funcoes()).toEqual([]);
  });

  it("quemExecuta lê a ACL: o dono fora (pelo nome do dono), PUBLIC como PUBLIC, X* como opção de concessão", () => {
    expect(quemExecuta("postgres=X/postgres,dc360_app=X/postgres", "postgres")).toEqual([
      "dc360_app",
    ]);
    expect(quemExecuta("postgres=X/postgres,=X/postgres,dc360_app=X/postgres", "postgres")).toEqual(
      ["PUBLIC", "dc360_app"],
    );
    expect(quemExecuta(null, "postgres")).toEqual(["PUBLIC"]);
    expect(quemExecuta("postgres=X/postgres,dc360_app=X*/postgres", "postgres")).toEqual([
      "dc360_app WITH GRANT OPTION",
    ]);
    // Depois de OWNER TO dc360_console a ACL se reescreve no nome dele; quem pula é o dono real.
    expect(
      quemExecuta("dc360_console=X/dc360_console,dc360_app=X/dc360_console", "postgres"),
    ).toEqual(["dc360_app", "dc360_console"]);
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

  it('S5a: declarar `tenant: "contexto"` numa função cujo corpo não chama app_organizacao_atual reprova', async () => {
    const lista = FUNCOES_PRIVILEGIADAS.map((f) => (f.nome === "trocar_senha" ? s5a("049") : f));
    const problemas = await conferirFuncoesPrivilegiadas(db, lista);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(
      /public\.trocar_senha\(uuid,text,uuid\): declara conferir o tenant pelo contexto, mas o corpo da função não chama app_organizacao_atual/,
    );
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

  it("declarar a tabela como exceção, dizendo o que dispensa e o que mantém, é o caminho certo e passa", async () => {
    const problemas = await comBuraco(
      `CREATE TABLE sonda_sem_tenant (id integer PRIMARY KEY);
       ALTER TABLE sonda_sem_tenant ENABLE ROW LEVEL SECURITY;
       ALTER TABLE sonda_sem_tenant FORCE ROW LEVEL SECURITY;`,
      "DROP TABLE sonda_sem_tenant",
      () => conferirExcecoes(db, [...EXCECOES_AO_ISOLAMENTO, excecaoDeSonda("sonda_sem_tenant")]),
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
  it("tabela que não existe", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      excecaoDeSonda("tabela_que_nao_existe"),
    ]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/mas a tabela não existe no banco: tabela_que_nao_existe/);
  });

  it("tabela que TEM `organizacao_id`: dispensa desnecessária (era o caso de `protocolo_sequencias`)", async () => {
    for (const tabela of ["ocorrencias", "protocolo_sequencias"]) {
      const problemas = await conferirExcecoes(db, [
        ...EXCECOES_AO_ISOLAMENTO,
        excecaoDeSonda(tabela, {
          dispensa: ["organizacao_id"],
          mantem: INVARIANTES.filter((i) => i !== "organizacao_id"),
        }),
      ]);
      expect(problemas.join("\n"), tabela).toMatch(
        new RegExp(
          `${tabela}: dispensa organizacao_id, mas a tabela o cumpre: exceção desnecessária`,
        ),
      );
    }
  });

  it("tabela que TEM policy de tenant: dispensa de policy desnecessária", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      excecaoDeSonda("ocorrencias", {
        dispensa: ["policy_de_contexto"],
        mantem: INVARIANTES.filter((i) => i !== "policy_de_contexto"),
      }),
    ]);
    expect(problemas.join("\n")).toMatch(
      /ocorrencias: dispensa policy_de_contexto, mas a tabela o cumpre: exceção desnecessária/,
    );
  });

  it("entrada que não dispensa nem a coluna nem a policy", async () => {
    const problemas = await conferirExcecoes(db, [
      ...EXCECOES_AO_ISOLAMENTO,
      excecaoDeSonda("ocorrencias", { dispensa: [], mantem: INVARIANTES }),
    ]);
    expect(problemas.join("\n")).toMatch(
      /ocorrencias: entrada em EXCECOES_AO_ISOLAMENTO que não dispensa nem a coluna nem a policy de contexto/,
    );
  });

  it("entrada que não diz se dispensa ou mantém um invariante", async () => {
    const problemas = await comBuraco(
      `CREATE TABLE sonda_sem_tenant (id integer PRIMARY KEY);
       ALTER TABLE sonda_sem_tenant ENABLE ROW LEVEL SECURITY;
       ALTER TABLE sonda_sem_tenant FORCE ROW LEVEL SECURITY;`,
      "DROP TABLE sonda_sem_tenant",
      () =>
        conferirExcecoes(db, [
          ...EXCECOES_AO_ISOLAMENTO,
          excecaoDeSonda("sonda_sem_tenant", { mantem: ["rls_forcada", "grants_declarados"] }),
        ]),
    );
    expect(problemas).toEqual([
      "sonda_sem_tenant: não diz se dispensa ou mantém fk_com_organizacao, sem_delete",
    ]);
  });

  it("o que a exceção MANTÉM é conferido: RLS não forçada reprova", async () => {
    const problemas = await comBuraco(
      `CREATE TABLE sonda_sem_tenant (id integer PRIMARY KEY);
       ALTER TABLE sonda_sem_tenant ENABLE ROW LEVEL SECURITY;`,
      "DROP TABLE sonda_sem_tenant",
      () => conferirExcecoes(db, [...EXCECOES_AO_ISOLAMENTO, excecaoDeSonda("sonda_sem_tenant")]),
    );
    expect(problemas).toEqual([
      "sonda_sem_tenant: declara manter rls_forcada, e o banco diz que não",
    ]);
  });

  it("o que a exceção MANTÉM é conferido: um GRANT SELECT a mais em `interesse_municipio` reprova", async () => {
    const problemas = await comBuraco(
      "GRANT SELECT ON interesse_municipio TO dc360_app",
      "REVOKE SELECT ON interesse_municipio FROM dc360_app",
      excecoes,
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /interesse_municipio: declara manter grants_declarados, e o banco diz que não/,
    );
    expect(texto).toMatch(
      /interesse_municipio: sem policy de contexto, a tabela só pode receber o INSERT do papel de aplicação, e o banco dá mais: dc360_app:SELECT/,
    );
  });

  it("o que a exceção MANTÉM é conferido: uma policy DELETE em `organizacoes` reprova `sem_delete`", async () => {
    const problemas = await comBuraco(
      "CREATE POLICY sonda_apaga ON organizacoes FOR DELETE TO dc360_app USING (id = app_organizacao_atual())",
      "DROP POLICY sonda_apaga ON organizacoes",
      excecoes,
    );
    expect(problemas).toEqual(["organizacoes: declara manter sem_delete, e o banco diz que não"]);
  });

  it("dispensar o que não se dispensa (RLS forçada, grants declarados) é recusado na junção", () => {
    expect(() =>
      juntarCatalogo([
        [
          "base",
          {
            ...vazia,
            excecoes: [
              {
                ...excecaoDeSonda("x"),
                etapa: "base",
                dispensa: ["organizacao_id", "rls_forcada"],
              },
            ],
          },
        ],
      ]),
    ).toThrow(/"x" dispensa rls_forcada, que não se dispensa/);
  });
});

describe("sonda 8 (S8b e S8d): a isenção de policy não nasce só porque um arquivo de etapa disse", () => {
  /** A migração 999 da S8b do revisor: o console sem dono escreve no livro de eliminações. */
  const S8B = `
    CREATE POLICY sabotagem_update_sem_dono ON eliminacoes_de_municipio
      FOR UPDATE TO dc360_console USING (true) WITH CHECK (true);
    CREATE POLICY sabotagem_insert_sem_dono ON eliminacoes_de_municipio
      FOR INSERT TO dc360_console WITH CHECK (true);`;
  const FECHA_S8B = `
    DROP POLICY sabotagem_update_sem_dono ON eliminacoes_de_municipio;
    DROP POLICY sabotagem_insert_sem_dono ON eliminacoes_de_municipio;`;

  it("S8b: isentar de policy `eliminacoes_de_municipio`, que TEM organizacao_id, reprova", async () => {
    const isencao = excecaoDeSonda("eliminacoes_de_municipio", {
      dispensa: ["policy_de_contexto"],
      mantem: INVARIANTES.filter((i) => i !== "policy_de_contexto"),
      grants: { dc360_app: [], dc360_console: ["INSERT", "SELECT", "UPDATE (coluna)"], PUBLIC: [] },
    });
    const problemas = await comBuraco(S8B, FECHA_S8B, () =>
      conferirExcecoes(db, [...EXCECOES_AO_ISOLAMENTO, isencao]),
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /eliminacoes_de_municipio: dispensa a policy de contexto numa tabela que TEM organizacao_id obrigatório/,
    );
    expect(texto).toMatch(
      /eliminacoes_de_municipio: sem policy de contexto, a tabela só pode receber o INSERT do papel de aplicação, e o banco dá mais: dc360_console/,
    );
  });

  it("S8b: a mesma isenção declarada como do fornecedor num arquivo de etapa é recusada na junção", () => {
    const isencao = excecaoDeSonda("eliminacoes_de_municipio", {
      etapa: "V2-F03-E04",
      dispensa: ["policy_de_contexto"],
      mantem: INVARIANTES.filter((i) => i !== "policy_de_contexto"),
      doFornecedor: true,
    });
    expect(() =>
      juntarCatalogo([
        ...CONTRIBUICOES_DO_CATALOGO.slice(0, 1),
        ["V2-F03-E04", { ...vazia, excecoes: [isencao] }],
      ]),
    ).toThrow(/declara doFornecedor: a regra do fornecedor só nasce na base congelada/);
  });

  it("S8d: redefinir `console_operadores` dispensando mais do que a base dispensava é recusado", () => {
    const daBase = BASE.excecoes.find((e) => e.tabela === "console_operadores")!;
    const redefinida: ExcecaoAoIsolamento = {
      ...daBase,
      etapa: "V2-F03-E04",
      dispensa: [...daBase.dispensa, "sem_delete"],
      mantem: daBase.mantem.filter((i) => i !== "sem_delete"),
      redefine: true,
    };
    expect(() =>
      juntarCatalogo([
        ["base", BASE],
        ["V2-F03-E04", { ...vazia, excecoes: [redefinida] }],
      ]),
    ).toThrow(/"console_operadores" em V2-F03-E04 redefine a exceção dispensando sem_delete/);
  });

  it("S8d: redefinir `console_operadores` sem a regra do fornecedor (pela etapa) reprova no banco", async () => {
    const daBase = BASE.excecoes.find((e) => e.tabela === "console_operadores")!;
    const { doFornecedor: _semRegra, ...semRegra } = daBase;
    const problemas = await comBuraco(
      `CREATE POLICY sabotagem_operadores ON console_operadores
         FOR UPDATE TO dc360_console USING (true) WITH CHECK (true)`,
      "DROP POLICY sabotagem_operadores ON console_operadores",
      () =>
        conferirExcecoes(db, [
          ...EXCECOES_AO_ISOLAMENTO.filter((e) => e.tabela !== "console_operadores"),
          semRegra,
        ]),
    );
    expect(problemas.join("\n")).toMatch(
      /console_operadores: sem policy de contexto, a tabela só pode receber o INSERT do papel de aplicação, e o banco dá mais: dc360_console:INSERT/,
    );
  });

  it("tabela do fornecedor que o papel de aplicação alcança reprova", async () => {
    const problemas = await comBuraco(
      "GRANT SELECT ON console_codigos_de_recuperacao TO dc360_app",
      "REVOKE SELECT ON console_codigos_de_recuperacao FROM dc360_app",
      excecoes,
    );
    expect(problemas.join("\n")).toMatch(
      /console_codigos_de_recuperacao: tabela do fornecedor que o papel de aplicação ou PUBLIC alcançam: dc360_app:SELECT/,
    );
  });
});

describe("sonda 9 (S3 e S3b): nenhum esquema fora do alcance do portão", () => {
  it("S3: função SECURITY DEFINER noutro esquema, que lê `organizacoes`, com EXECUTE ao app", async () => {
    const abrir = `
      CREATE SCHEMA porta_dos_fundos;
      CREATE FUNCTION porta_dos_fundos.contar_organizacoes() RETURNS bigint
        LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
        AS $$ SELECT count(*) FROM public.organizacoes $$;
      REVOKE ALL ON FUNCTION porta_dos_fundos.contar_organizacoes() FROM PUBLIC;
      GRANT USAGE ON SCHEMA porta_dos_fundos TO dc360_app;
      GRANT EXECUTE ON FUNCTION porta_dos_fundos.contar_organizacoes() TO dc360_app;`;
    const fechar = "DROP SCHEMA porta_dos_fundos CASCADE";
    const [nasFuncoes, nosEsquemas] = await comBuraco(abrir, fechar, async () => [
      await funcoes(),
      await esquemas(),
    ]);
    expect(nasFuncoes).toHaveLength(1);
    expect(nasFuncoes[0]).toMatch(
      /fora de FUNCOES_PRIVILEGIADAS: porta_dos_fundos\.contar_organizacoes\(\)/,
    );
    expect(nosEsquemas.join("\n")).toMatch(
      /objeto fora do esquema public: porta_dos_fundos\.contar_organizacoes\(\)/,
    );
    expect(nosEsquemas.join("\n")).toMatch(/dc360_app tem USAGE no esquema porta_dos_fundos/);
    expect(await esquemas()).toEqual([]);
  });

  it("S3b: tabela noutro esquema, sem RLS, com SELECT, INSERT, UPDATE e DELETE ao app", async () => {
    const abrir = `
      CREATE SCHEMA porta_b;
      CREATE TABLE porta_b.copia (id serial PRIMARY KEY, organizacao_id uuid, dado text);
      GRANT USAGE ON SCHEMA porta_b TO dc360_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON porta_b.copia TO dc360_app;`;
    const fechar = "DROP SCHEMA porta_b CASCADE";
    const [nasExcecoes, nosEsquemas] = await comBuraco(abrir, fechar, async () => [
      await excecoes(),
      await esquemas(),
    ]);
    expect(nasExcecoes.join("\n")).toMatch(/^porta_b\.copia não tem organizacao_id obrigatório/m);
    const texto = nosEsquemas.join("\n");
    expect(texto).toMatch(/objeto fora do esquema public: porta_b\.copia \(r\)/);
    expect(texto).toMatch(/objeto fora do esquema public: porta_b\.copia_id_seq \(S\)/);
    expect(texto).toMatch(/dc360_app tem USAGE no esquema porta_b/);
  });

  it("USAGE num esquema vazio, e CREATE em public, também reprovam", async () => {
    const problemas = await comBuraco(
      `CREATE SCHEMA sonda_vazio; GRANT USAGE ON SCHEMA sonda_vazio TO dc360_console;
       GRANT CREATE ON SCHEMA public TO dc360_app;`,
      "DROP SCHEMA sonda_vazio; REVOKE CREATE ON SCHEMA public FROM dc360_app;",
      esquemas,
    );
    expect(problemas).toEqual([
      "dc360_app tem CREATE no esquema public: quem cria objeto vira dono dele",
      "dc360_console tem USAGE no esquema sonda_vazio, que não é public nem esquema só de extensão",
    ]);
  });
});

describe("sonda 10 (S5a): a origem declarada de cada função é conferida contra os arquivos", () => {
  const reais = fontesDoRepositorio();
  /*
    Número de migração que NUNCA existe: a última real mais 900, calculado. Era a
    literal "053", que a parte 1A (E04) passou a ocupar; as etapas da F03 trazem a
    053 a 066, e uma literal futura colidiria com a migração de verdade.
  */
  const INEXISTENTE = String(Math.max(...[...reais.migracoes.keys()].map(Number)) + 900).padStart(
    3,
    "0",
  );
  const comMigracao = (numero: string, texto: string): FontesDoCatalogo => ({
    migracoes: new Map([...reais.migracoes, [numero, texto]]),
    ler: reais.ler,
  });
  const comS5a = (migracao: string): ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]> => [
    ["base", BASE],
    ["V2-F03-E04", { ...vazia, funcoes: [s5a(migracao)] }],
  ];

  it("S5a: redefinir com uma migração que não existe reprova", () => {
    expect(conferirFontes(comS5a(INEXISTENTE), reais).join("\n")).toMatch(
      new RegExp(
        `public\\.trocar_senha\\(uuid,text,uuid\\) \\(V2-F03-E04\\): a migração ${INEXISTENTE} não existe`,
      ),
    );
  });

  it("S5a: redefinir com uma migração que não recria a função reprova", () => {
    const fontes = comMigracao(INEXISTENTE, "CREATE TABLE qualquer (id integer);");
    expect(conferirFontes(comS5a(INEXISTENTE), fontes).join("\n")).toMatch(
      new RegExp(
        `redefine, mas a migração ${INEXISTENTE} não tem CREATE OR REPLACE FUNCTION trocar_senha`,
      ),
    );
  });

  it("S5a: redefinir com a mesma migração da entrada substituída é recusado na junção", () => {
    expect(() => juntarCatalogo(comS5a("049"))).toThrow(
      /redefine com a migração 049, que não é maior que a 049 da entrada substituída/,
    );
  });

  it("com a migração que recria a função de verdade, a origem passa (e o corpo é conferido à parte, sonda 5)", () => {
    const fontes = comMigracao(
      INEXISTENTE,
      "CREATE OR REPLACE FUNCTION trocar_senha(p_usuario_id uuid, p_senha_hash text, p_sessao_preservada uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;",
    );
    expect(conferirFontes(comS5a(INEXISTENTE), fontes)).toEqual([]);
  });

  it("uma migração nova que recria uma função catalogada, sem a etapa redefinir a entrada, reprova", () => {
    const fontes = comMigracao(
      INEXISTENTE,
      "-- comentário: CREATE FUNCTION dono_do_token( não conta\nCREATE OR REPLACE FUNCTION public.sessao_por_token(p text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;",
    );
    expect(conferirFontes(CONTRIBUICOES_DO_CATALOGO, fontes)).toEqual([
      "public.sessao_por_token(text): o catálogo diz que a forma atual vem da migração 046, mas a " +
        `última que cria a função é a ${INEXISTENTE}. A etapa que a recriou declara a entrada nova no arquivo ` +
        "dela, com redefine: true.",
    ]);
  });

  it("a prova precisa existir, chamar a função fora de comentário, e prova e semProva não andam juntas", () => {
    const comProva = (
      f: Partial<FuncaoPrivilegiada>,
    ): ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]> => [
      [
        "base",
        {
          ...BASE,
          funcoes: BASE.funcoes.map((x) => (x.nome === "trocar_senha" ? { ...x, ...f } : x)),
        },
      ],
    ];
    const ler = (c: string) =>
      c === "so-comentario.test.ts"
        ? "// trocar_senha( só citada\n/* trocar_senha( */"
        : reais.ler(c);
    const fontes: FontesDoCatalogo = { migracoes: reais.migracoes, ler };
    expect(conferirFontes(comProva({ provas: ["db/test/nao-existe.test.ts"] }), fontes)).toEqual([
      "public.trocar_senha(uuid,text,uuid) (base): a prova db/test/nao-existe.test.ts não existe",
    ]);
    expect(conferirFontes(comProva({ provas: ["so-comentario.test.ts"] }), fontes)).toEqual([
      "public.trocar_senha(uuid,text,uuid) (base): a prova so-comentario.test.ts não chama trocar_senha",
    ]);
    expect(
      conferirFontes(
        comProva({ semProva: "Texto de sonda com o tamanho mínimo de um motivo de verdade." }),
        fontes,
      ),
    ).toEqual([
      "public.trocar_senha(uuid,text,uuid) (base): declare provas (o teste que a chama) OU semProva, um dos dois",
    ]);
  });
});

describe("sonda 11: a junção das contribuições das etapas", () => {
  const funcao = (extra: Partial<FuncaoPrivilegiada> = {}): FuncaoPrivilegiada => ({
    ...FANTASMA,
    ...extra,
  });

  it("a mesma função em duas etapas, sem redefine, é erro", () => {
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, funcoes: [funcao({ etapa: "V2-F03-E15" })] }],
        ["V2-F03-E09", { ...vazia, funcoes: [funcao({ etapa: "V2-F03-E09" })] }],
      ]),
    ).toThrow(
      /public\.funcao_que_nao_existe\(integer\)" aparece duas vezes \(a segunda em V2-F03-E09\) sem redefine: true/,
    );
  });

  it("redefine: true com migração maior substitui a entrada anterior", () => {
    const juntado = juntarCatalogo([
      [
        "base",
        {
          ...vazia,
          funcoes: [
            funcao({
              etapa: "base",
              migracao: "049",
              tenant: "ainda_nao_confere",
              corrigidaEm: "V2-F03-E08",
            }),
          ],
        },
      ],
      [
        "V2-F03-E08",
        { ...vazia, funcoes: [funcao({ etapa: "V2-F03-E08", migracao: "061", redefine: true })] },
      ],
    ]);
    expect(juntado.funcoes).toHaveLength(1);
    expect(juntado.funcoes[0]!.tenant).toBe("contexto");
  });

  it("redefine: true sem entrada anterior é erro (nome errado)", () => {
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E08", { ...vazia, funcoes: [funcao({ etapa: "V2-F03-E08", redefine: true })] }],
      ]),
    ).toThrow(/declara redefine: true mas não há entrada anterior/);
  });

  it("entrada que diz outra etapa que não a do arquivo é erro", () => {
    expect(() =>
      juntarCatalogo([["V2-F03-E04", { ...vazia, funcoes: [funcao({ etapa: "base" })] }]]),
    ).toThrow(/está no arquivo de V2-F03-E04 mas diz etapa "base"/);
  });

  it("assinatura que não é da função nomeada é erro", () => {
    expect(() =>
      juntarCatalogo([
        ["sonda", { ...vazia, funcoes: [funcao({ assinatura: "public.outra(integer)" })] }],
      ]),
    ).toThrow(/a assinatura "public\.outra\(integer\)" não é de "funcao_que_nao_existe"/);
  });

  it("a mesma exceção ou a mesma coluna em duas etapas é erro, e coluna com motivo curto também", () => {
    const e = (etapa: string) => excecaoDeSonda("pessoas", { etapa });
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, excecoes: [e("V2-F03-E15")] }],
        ["V2-F03-E11", { ...vazia, excecoes: [e("V2-F03-E11")] }],
      ]),
    ).toThrow(/EXCECOES_AO_ISOLAMENTO: "pessoas" aparece duas vezes/);
    const c = (etapa: string) => ({
      tabela: "t",
      coluna: "c",
      migracao: "001",
      etapa,
      motivo: "Coluna de sonda: o motivo tem o tamanho mínimo exigido de um motivo.",
    });
    expect(() =>
      juntarCatalogo([
        ["V2-F03-E15", { ...vazia, colunasComUpdate: [c("V2-F03-E15")] }],
        ["V2-F03-E11", { ...vazia, colunasComUpdate: [c("V2-F03-E11")] }],
      ]),
    ).toThrow(/COLUNAS_COM_UPDATE_DO_APP: "t.c" aparece duas vezes/);
    expect(() =>
      juntarCatalogo([
        ["sonda", { ...vazia, colunasComUpdate: [{ ...c("sonda"), motivo: "curto" }] }],
      ]),
    ).toThrow(/COLUNAS_COM_UPDATE_DO_APP: "t.c" tem motivo curto demais/);
  });
});
