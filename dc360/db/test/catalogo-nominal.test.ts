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
 *
 * As sondas 12 a 16 são da parte 0G (as formas que a ADR 0009 pedia e o portão
 * não sabia dizer: privilégio por coluna de INSERT e SELECT, chave estrangeira
 * para tabela global, tabela protegida sem município com o destino na
 * eliminação provado, e o caminho da tabela temporária de mesmo nome que um
 * gatilho privilegiado aceitava).
 *
 * As sondas 17 a 22 são da correção 1 da 0G (a auditoria de cobertura
 * independente): a redefinição de privilégio por coluna só encolhe e a coluna
 * proibida nunca volta (17); a redefinição de exceção preserva o regime (18);
 * a eliminação provada com COMMIT de verdade, âncora e o outro município (19);
 * a recusa comportamental da função de gatilho disparada de uma tabela
 * temporária de mesmo nome (20); o disparo declarado e habilitado (21); e a
 * chave para a global com as colunas referenciadas e validada (22).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE } from "./catalogo/base.js";
import {
  CHAVES_PARA_GLOBAIS,
  COLUNAS_PROIBIDAS_DO_PORTAO,
  CONTRIBUICOES_DO_CATALOGO,
  EXCECOES_AO_ISOLAMENTO,
  FUNCOES_PRIVILEGIADAS,
  INVARIANTES,
  PRIVILEGIOS_DE_COLUNA,
  conferirChavesEstrangeiras,
  conferirColunasProibidas,
  conferirCriacaoDeObjetos,
  conferirDeclaracoesCompletas,
  conferirCorpoDaLeitora,
  conferirLeitoraDeOrigem,
  simbolosDoCorpo,
  conferirDisparoDosGatilhos,
  conferirEliminacaoSemMunicipio,
  conferirEsquemas,
  conferirExcecoes,
  conferirFontes,
  conferirFuncoesPrivilegiadas,
  conferirGatilhosPrivilegiados,
  conferirPrivilegiosDeColuna,
  fontesDoRepositorio,
  juntarCatalogo,
  provarRecusaForaDaTabela,
  quemExecuta,
  type ChaveParaTabelaGlobal,
  type ColunaComPrivilegio,
  type ColunaProibida,
  type ContribuicaoDoCatalogo,
  type ExcecaoAoIsolamento,
  type FontesDoCatalogo,
  type FuncaoPrivilegiada,
  type PrivilegioDeColuna,
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

  it("o único privilégio por coluna que não é UPDATE do app: o cancelamento do livro pelo console (parte 0G)", () => {
    expect(
      (BASE.privilegiosDeColuna ?? []).map(
        (p) => `${p.papel}:${p.tabela}:${p.privilegio}:${p.colunas.join(",")}`,
      ),
    ).toEqual(["dc360_console:eliminacoes_de_municipio:UPDATE:cancelada_em,cancelada_por_email"]);
    expect(BASE.chavesParaGlobais ?? []).toEqual([]);
    expect(BASE.excecoes.filter((e) => e.semMunicipio)).toEqual([]);
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

  /*
    Parte 0G: a JUNÇÃO DE VERDADE mais a entrada da sonda no fim, e não só a
    base. Com só a base e as migrações reais, uma etapa que redefine de
    verdade uma função da base (a 1B, a `consumir_recuperacao` da 051; a E08,
    várias) fazia esta sonda acusar a redefinição legítima, que a base não
    conhece. A redefinição continua precisando de `redefine: true`, migração
    maior e `CREATE OR REPLACE` (as sondas acima e abaixo).
  */
  const naJuncao = (
    f: FuncaoPrivilegiada,
  ): ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]> => [
    ...CONTRIBUICOES_DO_CATALOGO,
    ["sonda", { ...vazia, funcoes: [{ ...f, etapa: "sonda" }] }],
  ];

  it("com a migração que recria a função de verdade, a origem passa (e o corpo é conferido à parte, sonda 5)", () => {
    const fontes = comMigracao(
      INEXISTENTE,
      "CREATE OR REPLACE FUNCTION trocar_senha(p_usuario_id uuid, p_senha_hash text, p_sessao_preservada uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;",
    );
    expect(conferirFontes(naJuncao(s5a(INEXISTENTE)), fontes)).toEqual([]);
  });

  it("uma etapa que redefine uma função da base com redefine: true e a migração que a recria passa (parte 0G)", () => {
    const daBase = BASE.funcoes.find((f) => f.nome === "sessao_por_token")!;
    const fontes = comMigracao(
      INEXISTENTE,
      "CREATE OR REPLACE FUNCTION public.sessao_por_token(p text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;",
    );
    expect(
      conferirFontes(naJuncao({ ...daBase, migracao: INEXISTENTE, redefine: true }), fontes),
    ).toEqual([]);
    // Sem o redefine na etapa, a mesma migração reprova (o caso logo abaixo).
    expect(conferirFontes(CONTRIBUICOES_DO_CATALOGO, fontes)).toEqual([
      expect.stringMatching(
        /^public\.sessao_por_token\(text\): o catálogo diz que a forma atual vem da migração/,
      ),
    ]);
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
    ): ReadonlyArray<readonly [string, ContribuicaoDoCatalogo]> =>
      // A junção inteira, com só a entrada da base trocada (parte 0G: ver `naJuncao`).
      CONTRIBUICOES_DO_CATALOGO.map(([de, c]) =>
        de === "base"
          ? ([
              de,
              {
                ...c,
                funcoes: c.funcoes.map((x) => (x.nome === "trocar_senha" ? { ...x, ...f } : x)),
              },
            ] as const)
          : ([de, c] as const),
      );
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

/* ========================================================================= */
/* Parte 0G: as formas que a ADR 0009 pedia e o portão não sabia dizer.      */
/* ========================================================================= */

const MOTIVO_DE_SONDA =
  "Entrada de sonda: o motivo existe só para passar do tamanho mínimo do texto.";

/** Um grupo de privilégio por coluna de sonda. */
const grupo = (
  tabela: string,
  privilegio: PrivilegioDeColuna["privilegio"],
  colunas: string[],
  extra: Partial<PrivilegioDeColuna> = {},
): PrivilegioDeColuna => ({
  tabela,
  papel: "dc360_app",
  privilegio,
  colunas,
  migracao: "999",
  etapa: "sonda",
  motivo: MOTIVO_DE_SONDA,
  ...extra,
});

const achatar = (gs: readonly PrivilegioDeColuna[]): ColunaComPrivilegio[] =>
  gs.flatMap((g) =>
    g.colunas.map((coluna) => ({
      tabela: g.tabela,
      coluna,
      papel: g.papel,
      privilegio: g.privilegio,
      etapa: g.etapa,
    })),
  );

describe("sonda 12 (parte 0G): privilégio por coluna de INSERT, SELECT e UPDATE, nos dois sentidos", () => {
  const ABRIR = `
    CREATE TABLE sonda_colunas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organizacao_id uuid NOT NULL REFERENCES organizacoes(id),
      a text, b text, c text);
    ALTER TABLE sonda_colunas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_colunas FORCE ROW LEVEL SECURITY;
    GRANT INSERT (organizacao_id, a, b) ON sonda_colunas TO dc360_app;
    GRANT SELECT (id, a) ON sonda_colunas TO dc360_app;`;
  const FECHAR = "DROP TABLE sonda_colunas";
  const DECLARADOS = [
    grupo("sonda_colunas", "INSERT", ["organizacao_id", "a", "b"]),
    grupo("sonda_colunas", "SELECT", ["id", "a"]),
  ];
  const conferir = (gs: readonly PrivilegioDeColuna[] = DECLARADOS) =>
    conferirPrivilegiosDeColuna(db, [...PRIVILEGIOS_DE_COLUNA, ...achatar(gs)]);

  it("o banco de hoje bate com o catálogo de hoje (o UPDATE do app e o cancelamento do console)", async () => {
    expect(await conferirPrivilegiosDeColuna(db, PRIVILEGIOS_DE_COLUNA)).toEqual([]);
  });

  it("INSERT e SELECT por coluna, declarados por tabela e papel, passam", async () => {
    expect(await comBuraco(ABRIR, FECHAR, () => conferir())).toEqual([]);
  });

  it("INSERT de TABELA dado ao app junto do INSERT de coluna reprova", async () => {
    const problemas = await comBuraco(
      `${ABRIR} GRANT INSERT ON sonda_colunas TO dc360_app;`,
      FECHAR,
      () => conferir(),
    );
    expect(problemas).toEqual([
      expect.stringMatching(
        /^dc360_app:sonda_colunas:INSERT: dc360_app tem INSERT por coluna em sonda_colunas e TAMBÉM o INSERT de tabela/,
      ),
    ]);
  });

  it("coluna a mais no grant reprova", async () => {
    const problemas = await comBuraco(
      `${ABRIR} GRANT INSERT (c) ON sonda_colunas TO dc360_app;`,
      FECHAR,
      () => conferir(),
    );
    expect(problemas).toEqual([
      expect.stringMatching(
        /^privilégio de coluna no banco que o catálogo não declara: dc360_app:sonda_colunas\.c:INSERT/,
      ),
    ]);
  });

  it("coluna declarada que o banco não concede reprova (nada a menos)", async () => {
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      conferir([DECLARADOS[0]!, grupo("sonda_colunas", "SELECT", ["id", "a", "b"])]),
    );
    expect(problemas).toEqual([
      "consta no catálogo e o banco não concede por coluna: dc360_app:sonda_colunas.b:SELECT",
    ]);
  });

  it("opção de concessão, PUBLIC e REFERENCES por coluna reprovam", async () => {
    const problemas = await comBuraco(
      `${ABRIR}
       GRANT SELECT (a) ON sonda_colunas TO dc360_app WITH GRANT OPTION;
       GRANT SELECT (c) ON sonda_colunas TO PUBLIC;
       GRANT REFERENCES (b) ON sonda_colunas TO dc360_app;`,
      FECHAR,
      () => conferir(),
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /privilégio de coluna com opção de concessão: dc360_app:sonda_colunas\.a:SELECT/,
    );
    expect(texto).toMatch(/não declara: PUBLIC:sonda_colunas\.c:SELECT/);
    expect(texto).toMatch(/não declara: dc360_app:sonda_colunas\.b:REFERENCES/);
  });

  it("o console com uma coluna a mais no livro de eliminações reprova", async () => {
    const problemas = await comBuraco(
      "GRANT UPDATE (motivo) ON eliminacoes_de_municipio TO dc360_console",
      "REVOKE UPDATE (motivo) ON eliminacoes_de_municipio FROM dc360_console",
      () => conferirPrivilegiosDeColuna(db, PRIVILEGIOS_DE_COLUNA),
    );
    expect(problemas).toEqual([
      expect.stringMatching(/não declara: dc360_console:eliminacoes_de_municipio\.motivo:UPDATE/),
    ]);
  });

  it("tirar uma coluna de hoje do catálogo reprova", async () => {
    const semUma = PRIVILEGIOS_DE_COLUNA.filter(
      (c) => !(c.tabela === "oficio_envios" && c.coluna === "desfecho"),
    );
    expect(await conferirPrivilegiosDeColuna(db, semUma)).toEqual([
      expect.stringMatching(/não declara: dc360_app:oficio_envios\.desfecho:UPDATE/),
    ]);
  });

  it("a junção: grupo repetido, redefinição com migração menor, o mesmo UPDATE nos dois lugares, coluna repetida e motivo curto", () => {
    const comGrupos = (de: string, gs: PrivilegioDeColuna[]) =>
      [de, { ...vazia, privilegiosDeColuna: gs }] as const;
    expect(() =>
      juntarCatalogo([
        comGrupos("V2-F03-E15", [grupo("usuarios", "INSERT", ["nome"], { etapa: "V2-F03-E15" })]),
        comGrupos("V2-F03-E08", [grupo("usuarios", "INSERT", ["nome"], { etapa: "V2-F03-E08" })]),
      ]),
    ).toThrow(/PRIVILEGIOS_DE_COLUNA: "dc360_app:usuarios:INSERT" aparece duas vezes/);
    expect(() =>
      juntarCatalogo([
        comGrupos("V2-F03-E15", [
          grupo("usuarios", "INSERT", ["nome", "email"], { etapa: "V2-F03-E15", migracao: "054" }),
        ]),
        comGrupos("V2-F03-E08", [
          grupo("usuarios", "INSERT", ["nome"], {
            etapa: "V2-F03-E08",
            migracao: "053",
            redefine: true,
          }),
        ]),
      ]),
    ).toThrow(/redefine com a migração 053, que não é maior que a 054/);
    const encolhida = juntarCatalogo([
      comGrupos("V2-F03-E15", [
        grupo("usuarios", "INSERT", ["nome", "email"], { etapa: "V2-F03-E15", migracao: "054" }),
      ]),
      comGrupos("V2-F03-E08", [
        grupo("usuarios", "INSERT", ["nome"], {
          etapa: "V2-F03-E08",
          migracao: "061",
          redefine: true,
        }),
      ]),
    ]);
    expect(encolhida.privilegiosDeColunaAchatados.map((c) => c.coluna)).toEqual(["nome"]);
    expect(() =>
      juntarCatalogo([
        ["base", BASE],
        comGrupos("V2-F03-E15", [
          grupo("oficio_envios", "UPDATE", ["desfecho"], { etapa: "V2-F03-E15" }),
        ]),
      ]),
    ).toThrow(/também está em COLUNAS_COM_UPDATE_DO_APP \(desfecho, detalhe, provedor_id\)/);
    expect(() => juntarCatalogo([comGrupos("sonda", [grupo("t", "SELECT", ["a", "a"])])])).toThrow(
      /"dc360_app:t:SELECT" sem colunas, ou com coluna repetida/,
    );
    expect(() =>
      juntarCatalogo([comGrupos("sonda", [grupo("t", "SELECT", ["a"], { motivo: "curto" })])]),
    ).toThrow(/PRIVILEGIOS_DE_COLUNA: "dc360_app:t:SELECT" tem motivo curto demais/);
  });
});

/** O destino na eliminação de uma tabela de sonda, com a semeadura por uma conta em `usuarios`. */
const naEliminacaoDeSonda = (
  tabela: string,
  destino: "fica" | "some",
  extra: Partial<NonNullable<ExcecaoAoIsolamento["semMunicipio"]>["naEliminacao"]> = {},
) => ({
  destino,
  porque: "Sonda: o destino declarado existe para a prova da eliminação conferir.",
  semear:
    "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) " +
    "VALUES (:org, 'Servidor da Prova', 'P-1', 'prova-0g@exemplo.gov.br', 'administrador'); " +
    `INSERT INTO ${tabela} (usuario_id) SELECT id FROM usuarios WHERE organizacao_id = :org;`,
  linhasDoMunicipio:
    `SELECT m.usuario_id AS chave FROM ${tabela} m JOIN usuarios u ON u.id = m.usuario_id ` +
    "WHERE u.organizacao_id = :org",
  coluna: "usuario_id",
  ...extra,
});

const protegida = (tabela: string, destino: "fica" | "some" = "fica") =>
  excecaoDeSonda(tabela, {
    mantem: ["rls_forcada", "grants_declarados", "fk_com_organizacao", "sem_delete"],
    semMunicipio: { especie: "protegida", naEliminacao: naEliminacaoDeSonda(tabela, destino) },
  });

const global_ = (tabela: string) =>
  excecaoDeSonda(tabela, {
    semMunicipio: {
      especie: "global",
      naEliminacao: {
        destino: "fica",
        porque: "Sonda: a linha global sobrevive ao município, como a pessoa da ADR 0009.",
        semear: `INSERT INTO ${tabela} (id) VALUES (gen_random_uuid()); ` + "SELECT :org",
        linhasDoMunicipio: `SELECT id AS chave FROM ${tabela} WHERE :org IS NOT NULL`,
        coluna: "id",
      },
    },
  });

describe("sonda 13 (parte 0G): chave estrangeira sem organizacao_id só para tabela global declarada", () => {
  const ISENTAS = [
    ["console_operadores", "console_operadores"],
    ["console_codigos_de_recuperacao", "console_operadores"],
  ] as const;
  const ABRIR = `
    CREATE TABLE sonda_pessoas (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    ALTER TABLE sonda_pessoas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_pessoas FORCE ROW LEVEL SECURITY;
    CREATE TABLE sonda_contas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organizacao_id uuid NOT NULL REFERENCES organizacoes(id),
      pessoa_id uuid NOT NULL CONSTRAINT sonda_contas_pessoa_fkey REFERENCES sonda_pessoas(id));`;
  const FECHAR = "DROP TABLE sonda_contas; DROP TABLE sonda_pessoas;";
  const CHAVE: ChaveParaTabelaGlobal = {
    tabela: "sonda_contas",
    restricao: "sonda_contas_pessoa_fkey",
    colunas: ["pessoa_id"],
    alvo: "sonda_pessoas",
    migracao: "999",
    etapa: "sonda",
    motivo: MOTIVO_DE_SONDA,
  };
  const fk = (
    excecoes: readonly ExcecaoAoIsolamento[] = [
      ...EXCECOES_AO_ISOLAMENTO,
      global_("sonda_pessoas"),
    ],
    chaves: readonly ChaveParaTabelaGlobal[] = [...CHAVES_PARA_GLOBAIS, CHAVE],
  ) => conferirChavesEstrangeiras(db, excecoes, chaves, ISENTAS);

  it("o banco de hoje passa, e as duas isenções do fornecedor são as únicas que o portão passa por nome", async () => {
    expect(await fk(EXCECOES_AO_ISOLAMENTO, CHAVES_PARA_GLOBAIS)).toEqual([]);
    const semIsencao = await conferirChavesEstrangeiras(
      db,
      EXCECOES_AO_ISOLAMENTO,
      CHAVES_PARA_GLOBAIS,
      [],
    );
    expect(semIsencao).toHaveLength(2);
    expect(semIsencao.join("\n")).toMatch(/console_codigos_de_recuperacao -> console_operadores/);
  });

  it("a chave declarada para tabela global declarada passa", async () => {
    expect(await comBuraco(ABRIR, FECHAR, () => fk())).toEqual([]);
  });

  it("chave para a tabela global sem a declaração da chave reprova", async () => {
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      fk([...EXCECOES_AO_ISOLAMENTO, global_("sonda_pessoas")], CHAVES_PARA_GLOBAIS),
    );
    expect(problemas).toEqual([
      expect.stringMatching(
        /^sonda_contas -> sonda_pessoas \(sonda_contas_pessoa_fkey\) não inclui organizacao_id.*sonda_pessoas é tabela global, e a chave para ela entra por nome/,
      ),
    ]);
  });

  it("chave declarada para tabela que não é global no catálogo reprova", async () => {
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      fk([...EXCECOES_AO_ISOLAMENTO, excecaoDeSonda("sonda_pessoas")]),
    );
    expect(problemas).toEqual([
      expect.stringMatching(/aponta para sonda_pessoas, que não é tabela global do catálogo/),
    ]);
  });

  it("chave sem organizacao_id para outra tabela qualquer continua reprovando", async () => {
    const problemas = await comBuraco(
      `${ABRIR} ALTER TABLE sonda_contas ADD COLUMN interesse uuid REFERENCES interesse_municipio(id);`,
      FECHAR,
      () => fk(),
    );
    expect(problemas).toEqual([
      expect.stringMatching(
        /^sonda_contas -> interesse_municipio \(sonda_contas_interesse_fkey\) não inclui organizacao_id: essa referência alcança linha de outro município$/,
      ),
    ]);
  });

  it("chave para tabela global com cascata, ou com a coluna gravável pelo app, reprova", async () => {
    const problemas = await comBuraco(
      `${ABRIR}
       ALTER TABLE sonda_contas DROP CONSTRAINT sonda_contas_pessoa_fkey;
       ALTER TABLE sonda_contas ADD CONSTRAINT sonda_contas_pessoa_fkey
         FOREIGN KEY (pessoa_id) REFERENCES sonda_pessoas(id) ON DELETE CASCADE;
       GRANT INSERT (organizacao_id, pessoa_id) ON sonda_contas TO dc360_app;
       GRANT UPDATE ON sonda_contas TO dc360_console;`,
      FECHAR,
      () => fk(),
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /sonda_contas\.sonda_contas_pessoa_fkey: chave para tabela global com ação em cascata \(ON DELETE c/,
    );
    expect(texto).toMatch(/dc360_app tem INSERT em sonda_contas\.pessoa_id/);
    expect(texto).toMatch(/dc360_console tem UPDATE em sonda_contas\.pessoa_id/);
  });

  it("chave declarada que o banco não tem, ou que inclui organizacao_id, reprova", async () => {
    expect(await fk(EXCECOES_AO_ISOLAMENTO, [...CHAVES_PARA_GLOBAIS, CHAVE])).toEqual([
      "consta em chavesParaGlobais (sonda) mas a restrição não existe no banco: sonda_contas.sonda_contas_pessoa_fkey",
    ]);
    const problemas = await comBuraco(
      `CREATE TABLE sonda_alvo_org (organizacao_id uuid NOT NULL, id uuid NOT NULL, PRIMARY KEY (organizacao_id, id));
       CREATE TABLE sonda_ref_org (organizacao_id uuid NOT NULL, alvo uuid NOT NULL,
         CONSTRAINT sonda_ref_org_fkey FOREIGN KEY (organizacao_id, alvo) REFERENCES sonda_alvo_org (organizacao_id, id));`,
      "DROP TABLE sonda_ref_org; DROP TABLE sonda_alvo_org;",
      () =>
        fk(EXCECOES_AO_ISOLAMENTO, [
          {
            ...CHAVE,
            tabela: "sonda_ref_org",
            restricao: "sonda_ref_org_fkey",
            colunas: ["organizacao_id", "alvo"],
            alvo: "sonda_alvo_org",
          },
        ]),
    );
    expect(problemas.join("\n")).toMatch(
      /sonda_ref_org\.sonda_ref_org_fkey: declarada em chavesParaGlobais, mas inclui organizacao_id/,
    );
  });
});

describe("sonda 14 (parte 0G): tabela sem município (global ou protegida) só com RLS forçada, nenhum privilégio e nenhuma policy", () => {
  const ABRIR = `
    CREATE TABLE sonda_marcas (usuario_id uuid PRIMARY KEY, gravada_em timestamptz NOT NULL DEFAULT now());
    ALTER TABLE sonda_marcas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_marcas FORCE ROW LEVEL SECURITY;`;
  const FECHAR = "DROP TABLE sonda_marcas";
  const com = (e: ExcecaoAoIsolamento) => conferirExcecoes(db, [...EXCECOES_AO_ISOLAMENTO, e]);

  it("a protegida e a global, na forma certa, passam", async () => {
    expect(await comBuraco(ABRIR, FECHAR, () => com(protegida("sonda_marcas")))).toEqual([]);
    expect(
      await comBuraco(
        "CREATE TABLE sonda_global (id uuid PRIMARY KEY); ALTER TABLE sonda_global ENABLE ROW LEVEL SECURITY; ALTER TABLE sonda_global FORCE ROW LEVEL SECURITY;",
        "DROP TABLE sonda_global",
        () => com(global_("sonda_global")),
      ),
    ).toEqual([]);
  });

  it("tabela protegida com um grant ao app reprova", async () => {
    const problemas = await comBuraco(
      `${ABRIR} GRANT SELECT ON sonda_marcas TO dc360_app;`,
      FECHAR,
      () => com(protegida("sonda_marcas")),
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /sonda_marcas \(protegida\): tabela sem município que o banco deixa alcançar: dc360_app:SELECT/,
    );
    expect(texto).toMatch(/sonda_marcas: declara manter grants_declarados, e o banco diz que não/);
  });

  it("tabela sem organizacao_id fingindo ser protegida (RLS não forçada, policy aberta, grant declarado) reprova", async () => {
    const problemas = await comBuraco(
      `CREATE TABLE sonda_marcas (usuario_id uuid PRIMARY KEY);
       ALTER TABLE sonda_marcas ENABLE ROW LEVEL SECURITY;
       GRANT INSERT ON sonda_marcas TO dc360_app;
       CREATE POLICY sonda_aberta ON sonda_marcas FOR INSERT TO dc360_app WITH CHECK (true);`,
      FECHAR,
      () =>
        com({
          ...protegida("sonda_marcas"),
          grants: { dc360_app: ["INSERT"], dc360_console: [], PUBLIC: [] },
        }),
    );
    const texto = problemas.join("\n");
    expect(texto).toMatch(
      /sonda_marcas \(protegida\): tabela sem município não concede nada a papel do produto nem a PUBLIC, e a entrada declara dc360_app:INSERT/,
    );
    expect(texto).toMatch(
      /sonda_marcas \(protegida\): tabela sem município que o banco deixa alcançar: dc360_app:INSERT/,
    );
    expect(texto).toMatch(
      /sonda_marcas \(protegida\): tabela sem município sem RLS ativada E forçada/,
    );
    expect(texto).toMatch(/sonda_marcas \(protegida\): tabela sem município com 1 policy/);
  });

  it("tabela sem município que não mantém o que precisa manter reprova", async () => {
    const e = protegida("sonda_marcas");
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      com({
        ...e,
        dispensa: [...e.dispensa, "sem_delete"],
        mantem: e.mantem.filter((i) => i !== "sem_delete"),
      }),
    );
    expect(problemas.join("\n")).toMatch(
      /sonda_marcas \(protegida\): tabela sem município precisa MANTER sem_delete/,
    );
  });

  it("a junção: sem município e do fornecedor ao mesmo tempo, e o porquê curto, são recusados", () => {
    expect(() =>
      juntarCatalogo([
        [
          "base",
          { ...vazia, excecoes: [{ ...protegida("x"), etapa: "base", doFornecedor: true }] },
        ],
      ]),
    ).toThrow(/"x" declara semMunicipio e doFornecedor/);
    const curta = protegida("x");
    expect(() =>
      juntarCatalogo([
        [
          "sonda",
          {
            ...vazia,
            excecoes: [
              {
                ...curta,
                semMunicipio: {
                  ...curta.semMunicipio!,
                  naEliminacao: { ...curta.semMunicipio!.naEliminacao, porque: "curto" },
                },
              },
            ],
          },
        ],
      ]),
    ).toThrow(/"x" tem o porquê do destino na eliminação curto demais/);
  });
});

describe("sonda 15 (parte 0G): o destino na eliminação é provado executando a eliminação", () => {
  const ABRIR = `
    CREATE TABLE sonda_marcas (usuario_id uuid PRIMARY KEY);
    ALTER TABLE sonda_marcas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_marcas FORCE ROW LEVEL SECURITY;`;
  const FECHAR = "DROP TABLE sonda_marcas";
  /** A marca SOME com a conta: um gatilho de usuarios a apaga junto. */
  const SOME = `
    CREATE FUNCTION sonda_marca_some() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
      AS $$ BEGIN DELETE FROM public.sonda_marcas WHERE usuario_id = OLD.id; RETURN OLD; END $$;
    CREATE TRIGGER sonda_marca_some AFTER DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION sonda_marca_some();`;
  const FECHAR_SOME =
    "DROP TRIGGER sonda_marca_some ON usuarios; DROP FUNCTION sonda_marca_some();";
  const eliminar = (e: ExcecaoAoIsolamento) => conferirEliminacaoSemMunicipio(db, [e]);
  const organizacoes = async () =>
    (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM organizacoes")).rows[0]!.n;

  it("o catálogo de hoje não declara nenhuma, e passa", async () => {
    expect(await conferirEliminacaoSemMunicipio(db, EXCECOES_AO_ISOLAMENTO)).toEqual([]);
  });

  it("a marca que FICA, declarada fica, passa; e a prova não deixa rastro no banco", async () => {
    const antes = await organizacoes();
    expect(
      await comBuraco(ABRIR, FECHAR, () => eliminar(protegida("sonda_marcas", "fica"))),
    ).toEqual([]);
    expect(await organizacoes()).toBe(antes);
  });

  it("a marca que FICA, declarada some, reprova", async () => {
    expect(
      await comBuraco(ABRIR, FECHAR, () => eliminar(protegida("sonda_marcas", "some"))),
    ).toEqual([
      "sonda_marcas (protegida, some): o catálogo diz que as linhas do município SOMEM na eliminação, e 1 de 1 ficaram",
    ]);
  });

  it("a marca que SOME com a conta, declarada some, passa; declarada fica, reprova", async () => {
    expect(
      await comBuraco(`${ABRIR} ${SOME}`, `${FECHAR_SOME} ${FECHAR}`, () =>
        eliminar(protegida("sonda_marcas", "some")),
      ),
    ).toEqual([]);
    expect(
      await comBuraco(`${ABRIR} ${SOME}`, `${FECHAR_SOME} ${FECHAR}`, () =>
        eliminar(protegida("sonda_marcas", "fica")),
      ),
    ).toEqual([
      "sonda_marcas (protegida, fica): o catálogo diz que as linhas do município FICAM na eliminação, e 1 de 1 sumiram",
    ]);
  });

  it("prova vazia, e semeadura que quebra, reprovam", async () => {
    const vaziaDeLinhas = protegida("sonda_marcas");
    expect(
      await comBuraco(ABRIR, FECHAR, () =>
        eliminar({
          ...vaziaDeLinhas,
          semMunicipio: {
            especie: "protegida",
            naEliminacao: { ...vaziaDeLinhas.semMunicipio!.naEliminacao, semear: "SELECT :org" },
          },
        }),
      ),
    ).toEqual([
      "sonda_marcas (protegida, fica): linhasDoMunicipio não achou nenhuma linha depois de semear: a prova da eliminação seria vazia",
    ]);
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      eliminar({
        ...vaziaDeLinhas,
        semMunicipio: {
          especie: "protegida",
          naEliminacao: {
            ...vaziaDeLinhas.semMunicipio!.naEliminacao,
            semear: "INSERT INTO tabela_que_nao_existe VALUES (:org)",
          },
        },
      }),
    );
    expect(problemas).toEqual([
      expect.stringMatching(/a prova do destino na eliminação não chegou ao fim/),
    ]);
  });
});

describe("sonda 16 (parte 0G): a tabela temporária de mesmo nome e o gatilho privilegiado", () => {
  /*
    O caminho que a revisão da 1B achou: com TEMP no banco e EXECUTE numa
    função de gatilho SECURITY DEFINER, o `dc360_app` cria `pg_temp.<tabela
    real>`, anexa a ela o gatilho e o faz gravar como o dono numa tabela que
    ele não alcança. Aqui o ataque roda DE VERDADE.
  */
  const BASE_DO_ATAQUE = (confereRelid: boolean) => `
    CREATE TABLE sonda_cofre (quem text NOT NULL);
    ALTER TABLE sonda_cofre ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_cofre FORCE ROW LEVEL SECURITY;
    CREATE TABLE sonda_alvo (organizacao_id uuid NOT NULL, nome text);
    CREATE FUNCTION sonda_grava_no_cofre() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN
        ${confereRelid ? "IF TG_RELID <> 'public.sonda_alvo'::regclass THEN RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501'; END IF;" : ""}
        INSERT INTO public.sonda_cofre (quem) VALUES (NEW.nome);
        RETURN NEW;
      END $$;
    REVOKE ALL ON FUNCTION sonda_grava_no_cofre() FROM PUBLIC;
    CREATE TRIGGER sonda_alvo_grava AFTER INSERT ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();`;
  const FECHAR = `
    DROP TABLE sonda_alvo; DROP TABLE sonda_cofre; DROP FUNCTION sonda_grava_no_cofre();
    DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM dc360_app', current_database()); END $$;`;
  const TEMP =
    "DO $$ BEGIN EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO dc360_app', current_database()); END $$;";
  const EXECUTE = "GRANT EXECUTE ON FUNCTION sonda_grava_no_cofre() TO dc360_app;";

  /** O ataque, como o papel de aplicação. Devolve o erro, ou quantas linhas o cofre ganhou. */
  async function atacar(): Promise<string | number> {
    try {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE dc360_app");
        await tx.exec(
          "CREATE TEMP TABLE sonda_alvo (organizacao_id uuid, nome text) ON COMMIT DROP",
        );
        await tx.exec(
          "CREATE TRIGGER invasor AFTER INSERT ON pg_temp.sonda_alvo FOR EACH ROW EXECUTE FUNCTION public.sonda_grava_no_cofre()",
        );
        await tx.exec("INSERT INTO pg_temp.sonda_alvo VALUES (gen_random_uuid(), 'invasor')");
      });
    } catch (erro) {
      return (erro as Error).message;
    }
    return (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM sonda_cofre WHERE quem = 'invasor'",
      )
    ).rows[0]!.n;
  }

  /** A entrada como o catálogo de ANTES da 0G a aceitava: EXECUTE ao app, sem gatilhoEm. */
  const ANTIGA: FuncaoPrivilegiada = {
    nome: "sonda_grava_no_cofre",
    assinatura: "public.sonda_grava_no_cofre()",
    migracao: "999",
    etapa: "sonda",
    executavelPor: ["dc360_app"],
    motivo: "Sonda: função de gatilho privilegiada que grava numa tabela que o app não alcança.",
    tenant: "antes_do_tenant",
    confere: "Sonda: age só sobre a linha que disparou o gatilho (NEW).",
    semProva: "Sonda: a prova é o ataque desta própria sonda, que a chama pelo gatilho.",
  };
  const NOVA: FuncaoPrivilegiada = { ...ANTIGA, executavelPor: [], gatilhoEm: ["sonda_alvo"] };

  it("o banco de hoje: nenhum papel do produto cria objeto, e nenhuma função de gatilho privilegiada existe", async () => {
    expect(await conferirCriacaoDeObjetos(db)).toEqual([]);
    expect(await conferirGatilhosPrivilegiados(db, FUNCOES_PRIVILEGIADAS)).toEqual([]);
  });

  it("com TEMP e EXECUTE o ataque grava no cofre; a entrada de antes da 0G passava, e agora as três conferências reprovam", async () => {
    const [resultado, funcoesAntigas, criacao, gatilhos] = await comBuraco(
      `${BASE_DO_ATAQUE(false)} ${TEMP} ${EXECUTE}`,
      FECHAR,
      async () =>
        [
          await atacar(),
          await conferirFuncoesPrivilegiadas(db, [...FUNCOES_PRIVILEGIADAS, ANTIGA]),
          await conferirCriacaoDeObjetos(db),
          await conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
        ] as const,
    );
    expect(resultado, "o ataque não gravou: a sonda não reproduz o caminho").toBe(1);
    expect((funcoesAntigas as string[]).join("\n")).toMatch(
      /public\.sonda_grava_no_cofre\(\): função de gatilho com EXECUTE declarado \(dc360_app\)/,
    );
    expect((funcoesAntigas as string[]).join("\n")).toMatch(/função de gatilho sem gatilhoEm/);
    expect(criacao).toEqual([expect.stringMatching(/^dc360_app tem TEMPORARY no banco /)]);
    const texto = (gatilhos as string[]).join("\n");
    expect(texto).toMatch(
      /dc360_app tem EXECUTE na função de gatilho privilegiada public\.sonda_grava_no_cofre\(\)/,
    );
    expect(texto).toMatch(/não confere a tabela que a disparou \(TG_RELID/);
    expect(texto).toMatch(/o corpo não cita public\.sonda_alvo qualificado/);
  });

  it("sem TEMP o ataque não começa, e sem EXECUTE o gatilho não se anexa", async () => {
    expect(await comBuraco(`${BASE_DO_ATAQUE(false)} ${EXECUTE}`, FECHAR, atacar)).toMatch(
      /permission denied (to create temporary tables|for schema pg_temp)/,
    );
    expect(await comBuraco(`${BASE_DO_ATAQUE(false)} ${TEMP}`, FECHAR, atacar)).toMatch(
      /permission denied for function (public\.)?sonda_grava_no_cofre/,
    );
  });

  it("com TG_RELID conferido, nem TEMP e EXECUTE juntos gravam; e a forma certa passa nas três conferências", async () => {
    expect(await comBuraco(`${BASE_DO_ATAQUE(true)} ${TEMP} ${EXECUTE}`, FECHAR, atacar)).toMatch(
      /gatilho fora da tabela/,
    );
    const [funcoes_, gatilhos] = await comBuraco(BASE_DO_ATAQUE(true), FECHAR, async () => [
      await conferirFuncoesPrivilegiadas(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
      await conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
    ]);
    expect(funcoes_).toEqual([]);
    expect(gatilhos).toEqual([]);
  });

  it("o gatilho numa tabela que o catálogo não declara, e o nome nu no corpo, reprovam", async () => {
    const problemas = await comBuraco(
      `${BASE_DO_ATAQUE(true)}
       CREATE TABLE sonda_outra (nome text);
       CREATE TRIGGER sonda_outra_grava AFTER INSERT ON sonda_outra FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();`,
      `DROP TABLE sonda_outra; ${FECHAR}`,
      () => conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
    );
    expect(problemas).toEqual([
      "public.sonda_grava_no_cofre(): os gatilhos do banco que a chamam estão em (sonda_alvo, sonda_outra), e o catálogo declara (sonda_alvo)",
    ]);
    const nu = await comBuraco(
      BASE_DO_ATAQUE(true).replace("'public.sonda_alvo'::regclass", "'sonda_alvo'::regclass"),
      FECHAR,
      () => conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
    );
    expect(nu).toEqual([expect.stringMatching(/o corpo não cita public\.sonda_alvo qualificado/)]);
  });

  it("conferir pelo esquema E pelo nome também vale; só pelo nome (TG_TABLE_NAME = 'usuarios', que a temporária também tem) reprova", async () => {
    const PELO_ESQUEMA =
      "IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'sonda_alvo' THEN RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501'; END IF;";
    const SO_PELO_NOME =
      "IF TG_TABLE_NAME <> 'sonda_alvo' THEN RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501'; END IF;";
    const comCorpo = (conferencia: string) =>
      BASE_DO_ATAQUE(false).replace("BEGIN\n", `BEGIN\n        ${conferencia}\n`);
    expect(
      await comBuraco(comCorpo(PELO_ESQUEMA), FECHAR, () =>
        conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
      ),
    ).toEqual([]);
    expect(await comBuraco(`${comCorpo(PELO_ESQUEMA)} ${TEMP} ${EXECUTE}`, FECHAR, atacar)).toMatch(
      /gatilho fora da tabela/,
    );
    const soPeloNome = await comBuraco(comCorpo(SO_PELO_NOME), FECHAR, () =>
      conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, NOVA]),
    );
    expect(soPeloNome.join("\n")).toMatch(/não confere a tabela que a disparou/);
    expect(await comBuraco(`${comCorpo(SO_PELO_NOME)} ${TEMP} ${EXECUTE}`, FECHAR, atacar)).toBe(1);
  });

  it("CREATE no banco ou num esquema, dado a PUBLIC, reprova", async () => {
    const problemas = await comBuraco(
      `GRANT CREATE ON SCHEMA public TO PUBLIC;
       DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO PUBLIC', current_database()); END $$;`,
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
       DO $$ BEGIN EXECUTE format('REVOKE CREATE ON DATABASE %I FROM PUBLIC', current_database()); END $$;`,
      () => conferirCriacaoDeObjetos(db),
    );
    const texto = problemas.join("\n");
    for (const papel of ["PUBLIC", "dc360_app", "dc360_console"]) {
      expect(texto).toMatch(new RegExp(`^${papel} tem CREATE no banco `, "m"));
      expect(texto).toMatch(new RegExp(`^${papel} tem CREATE no esquema public`, "m"));
    }
  });

  it("a função de gatilho na lista com EXECUTE vazio não reprova mais por 'ninguém a chama', e a comum continua reprovando", async () => {
    const comum = FUNCOES_PRIVILEGIADAS.map((f) =>
      f.nome === "interesse_recente" ? { ...f, executavelPor: [] } : f,
    );
    const problemas = await conferirFuncoesPrivilegiadas(db, comum);
    expect(problemas.join("\n")).toMatch(/interesse_recente\(text\): sem nenhum papel com EXECUTE/);
    const comGatilhoEm = FUNCOES_PRIVILEGIADAS.map((f) =>
      f.nome === "interesse_recente" ? { ...f, gatilhoEm: ["interesse_municipio"] } : f,
    );
    expect((await conferirFuncoesPrivilegiadas(db, comGatilhoEm)).join("\n")).toMatch(
      /interesse_recente\(text\): gatilhoEm numa função que não retorna trigger/,
    );
  });
});

/* ========================================================================= */
/* Correção 1 da parte 0G: os oito itens da auditoria de cobertura.          */
/* ========================================================================= */

const JUSTIFICATIVA_DE_SONDA =
  "Sonda: a ampliação existe e diz por que, com o tamanho mínimo do texto exigido.";

describe("sonda 17 (correção 1 da 0G, item 1): a redefinição de privilégio por coluna só encolhe, e a coluna proibida nunca volta", () => {
  const comGrupos = (de: string, gs: PrivilegioDeColuna[]) =>
    [de, { ...vazia, privilegiosDeColuna: gs }] as const;
  const e15 = comGrupos("V2-F03-E15", [
    grupo("usuarios", "UPDATE", ["nome", "email", "senha_hash"], {
      etapa: "V2-F03-E15",
      migracao: "054",
    }),
  ]);
  const e08 = (colunas: string[], extra: Partial<PrivilegioDeColuna> = {}) =>
    comGrupos("V2-F03-E08", [
      grupo("usuarios", "UPDATE", colunas, {
        etapa: "V2-F03-E08",
        migracao: "061",
        redefine: true,
        ...extra,
      }),
    ]);
  const amplia = (colunas: string[], justificativa = JUSTIFICATIVA_DE_SONDA) => ({
    ampliacao: { colunas, justificativa },
  });
  const colunas = (c: ReturnType<typeof juntarCatalogo>) =>
    c.privilegiosDeColunaAchatados.map((p) => p.coluna);

  it("encolher passa; ampliar sem declarar reprova (o caso da auditoria: a coluna de volta à lista)", () => {
    expect(colunas(juntarCatalogo([e15, e08(["nome"])]))).toEqual(["nome"]);
    expect(() => juntarCatalogo([e15, e08(["nome", "matricula"])])).toThrow(
      /"dc360_app:usuarios:UPDATE" em V2-F03-E08 redefine AMPLIANDO a lista \(matricula\) sem declarar a ampliação: redefinição só encolhe/,
    );
    const encolhida = comGrupos("V2-F03-E08", [
      grupo("usuarios", "UPDATE", ["nome"], {
        etapa: "V2-F03-E08",
        migracao: "061",
        redefine: true,
      }),
    ]);
    const devolve = comGrupos("V2-F03-E21", [
      grupo("usuarios", "UPDATE", ["nome", "senha_hash"], {
        etapa: "V2-F03-E21",
        migracao: "062",
        redefine: true,
      }),
    ]);
    expect(() => juntarCatalogo([e15, encolhida, devolve])).toThrow(
      /em V2-F03-E21 redefine AMPLIANDO a lista \(senha_hash\)/,
    );
  });

  it("a ampliação declarada é exatamente o que a redefinição acrescenta, com justificativa, e só em redefinição", () => {
    expect(
      colunas(juntarCatalogo([e15, e08(["nome", "matricula"], amplia(["matricula"]))])),
    ).toEqual(["nome", "matricula"]);
    expect(() =>
      juntarCatalogo([e15, e08(["nome", "matricula", "papel"], amplia(["matricula"]))]),
    ).toThrow(/declara a ampliação \(matricula\), e a redefinição acrescenta \(matricula, papel\)/);
    expect(() => juntarCatalogo([e15, e08(["nome"], amplia(["matricula"]))])).toThrow(
      /declara a ampliação \(matricula\), e a redefinição acrescenta \(nada\)/,
    );
    expect(() =>
      juntarCatalogo([e15, e08(["nome", "matricula"], amplia(["matricula"], "curta"))]),
    ).toThrow(/amplia a lista com a justificativa curta demais/);
    expect(() =>
      juntarCatalogo([
        comGrupos("V2-F03-E15", [
          grupo("usuarios", "UPDATE", ["nome"], { etapa: "V2-F03-E15", ...amplia(["nome"]) }),
        ]),
      ]),
    ).toThrow(/declara ampliacao sem redefine/);
  });

  it("a coluna proibida não volta nem por ampliação declarada; proibição não se redefine nem se repete", () => {
    const sem = comGrupos("V2-F03-E15", [
      grupo("usuarios", "UPDATE", ["nome"], { etapa: "V2-F03-E15", migracao: "054" }),
    ]);
    expect(() =>
      juntarCatalogo(
        [sem, e08(["nome", "senha_hash"], amplia(["senha_hash"]))],
        COLUNAS_PROIBIDAS_DO_PORTAO,
      ),
    ).toThrow(/amplia a lista com senha_hash, coluna proibida \(COLUNAS_PROIBIDAS\)/);
    const proibicao: ColunaProibida = {
      tabela: "t",
      colunas: ["a"],
      privilegios: ["UPDATE"],
      desdeMigracao: "999",
      etapa: "sonda",
      motivo: MOTIVO_DE_SONDA,
    };
    const deEtapa = (p: ColunaProibida) => [
      ["sonda", { ...vazia, colunasProibidas: [p] }] as const,
    ];
    expect(() => juntarCatalogo(deEtapa(proibicao), [proibicao])).toThrow(
      /COLUNAS_PROIBIDAS: .* aparece duas vezes/,
    );
    expect(() =>
      juntarCatalogo(deEtapa({ ...proibicao, redefine: true } as ColunaProibida), [proibicao]),
    ).toThrow(/COLUNAS_PROIBIDAS: "t" em sonda redefine uma proibição: proibição não se redefine/);
    expect(() =>
      juntarCatalogo(deEtapa({ ...proibicao, colunas: ["a", "b"] }), [proibicao]),
    ).toThrow(/COLUNAS_PROIBIDAS: "t\.a:UPDATE" proibida duas vezes/);
    expect(() => juntarCatalogo([], [{ ...proibicao, desdeMigracao: "61" }])).toThrow(
      /precisa de desdeMigracao com 3 dígitos/,
    );
  });

  const ABRIR = `
    CREATE TABLE sonda_proibida (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organizacao_id uuid NOT NULL REFERENCES organizacoes(id),
      segredo text, livre text);
    ALTER TABLE sonda_proibida ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_proibida FORCE ROW LEVEL SECURITY;`;
  const FECHAR = "DROP TABLE sonda_proibida";
  const PROIBIDA: ColunaProibida = {
    tabela: "sonda_proibida",
    colunas: ["segredo", "coluna_que_nao_existe"],
    privilegios: ["UPDATE", "SELECT"],
    desdeMigracao: "999",
    etapa: "sonda",
    motivo: MOTIVO_DE_SONDA,
  };
  const proibidas = (
    declarados: readonly ColunaComPrivilegio[] = PRIVILEGIOS_DE_COLUNA,
    migracoes: string[] = ["999"],
  ) => conferirColunasProibidas(db, [PROIBIDA], declarados, migracoes);

  it("antes da migração da proibição nada se confere; depois, a tabela sem o privilégio passa", async () => {
    expect(
      await comBuraco(
        `${ABRIR} GRANT UPDATE (segredo) ON sonda_proibida TO dc360_app;`,
        FECHAR,
        () => proibidas(PRIVILEGIOS_DE_COLUNA, ["001"]),
      ),
    ).toEqual([]);
    expect(
      await comBuraco(`${ABRIR} GRANT UPDATE (livre) ON sonda_proibida TO dc360_app;`, FECHAR, () =>
        proibidas([
          ...PRIVILEGIOS_DE_COLUNA,
          ...achatar([grupo("sonda_proibida", "UPDATE", ["livre"])]),
        ]),
      ),
    ).toEqual([]);
  });

  it("o privilégio proibido no banco reprova, de coluna ou de tabela, do app, do console ou de PUBLIC", async () => {
    const texto = (
      await comBuraco(
        `${ABRIR}
         GRANT UPDATE (segredo) ON sonda_proibida TO dc360_app;
         GRANT SELECT ON sonda_proibida TO dc360_console;`,
        FECHAR,
        () => proibidas(),
      )
    ).join("\n");
    expect(texto).toMatch(
      /^sonda_proibida\.segredo: dc360_app tem UPDATE, proibido desde a migração 999 \(sonda\)/m,
    );
    expect(texto).toMatch(/^sonda_proibida\.segredo: dc360_console tem SELECT, proibido/m);
    const publico = await comBuraco(
      `${ABRIR} GRANT SELECT (segredo) ON sonda_proibida TO PUBLIC;`,
      FECHAR,
      () => proibidas(),
    );
    expect(publico.join("\n")).toMatch(/^sonda_proibida\.segredo: PUBLIC tem SELECT/m);
  });

  it("o catálogo que lista a coluna proibida reprova, mesmo com o banco igual a ele", async () => {
    const problemas = await comBuraco(
      `${ABRIR} GRANT UPDATE (segredo) ON sonda_proibida TO dc360_app;`,
      FECHAR,
      () =>
        proibidas([
          ...PRIVILEGIOS_DE_COLUNA,
          ...achatar([grupo("sonda_proibida", "UPDATE", ["segredo"])]),
        ]),
    );
    expect(problemas.join("\n")).toMatch(
      /sonda_proibida\.segredo: UPDATE proibido desde a migração 999 \(sonda\), e o catálogo o declara para dc360_app \(sonda\)/,
    );
  });

  it("proibição sobre tabela que não existe reprova", async () => {
    expect(
      await conferirColunasProibidas(
        db,
        [{ ...PROIBIDA, tabela: "sonda_que_nao_existe" }],
        [],
        ["999"],
      ),
    ).toEqual([
      "COLUNAS_PROIBIDAS: sonda_que_nao_existe não existe no banco (proibição sobre o nada)",
    ]);
  });

  it("as proibições do portão passam no banco das migrações reais; enquanto a 061 não existe, ligá-las mesmo assim morde (o app ainda alcança a credencial de usuarios)", async () => {
    const reais = fontesDoRepositorio().migracoes;
    expect(
      await conferirColunasProibidas(
        db,
        COLUNAS_PROIBIDAS_DO_PORTAO,
        PRIVILEGIOS_DE_COLUNA,
        reais.keys(),
      ),
    ).toEqual([]);
    /*
      Depois que a E08 juntar a 061, o banco das migrações reais já não dá a
      credencial ao app, e a mordida de antes deixa de existir: a primeira
      conferência acima passa a ser a que vale.
    */
    if (reais.has("061")) return;
    const texto = (
      await conferirColunasProibidas(db, COLUNAS_PROIBIDAS_DO_PORTAO, PRIVILEGIOS_DE_COLUNA, [
        "061",
      ])
    ).join("\n");
    for (const privilegio of ["INSERT", "UPDATE", "SELECT"]) {
      expect(texto).toMatch(
        new RegExp(
          `^usuarios\\.senha_hash: dc360_app tem ${privilegio}, proibido desde a migração 061`,
          "m",
        ),
      );
    }
    expect(texto).toMatch(/^usuarios\.email: dc360_app tem UPDATE/m);
    expect(texto).not.toMatch(/usuarios\.email: dc360_app tem SELECT/);
  });
});

describe("sonda 18 (correção 1 da 0G, item 2): a redefinição de uma exceção preserva o regime", () => {
  const de = (etapa: string, e: ExcecaoAoIsolamento) =>
    [etapa, { ...vazia, excecoes: [{ ...e, etapa }] }] as const;
  const redefinida = (e: ExcecaoAoIsolamento) => ({ ...e, redefine: true as const });
  const marca = protegida("t", "fica");

  it("a mesma exceção, no mesmo regime, redefinida, passa", () => {
    expect(
      juntarCatalogo([de("V2-F03-E15", marca), de("V2-F03-E08", redefinida(marca))]).excecoes,
    ).toHaveLength(1);
  });

  it("tirar semMunicipio de uma tabela protegida reprova (ela voltava à exceção comum e saía da prova da eliminação)", () => {
    const semRegime: ExcecaoAoIsolamento = { ...marca, semMunicipio: undefined };
    expect(() =>
      juntarCatalogo([de("V2-F03-E15", marca), de("V2-F03-E08", redefinida(semRegime))]),
    ).toThrow(
      /"t" em V2-F03-E08 redefine a exceção trocando o regime \(sem município protegida, fica na eliminação para exceção comum\)/,
    );
  });

  it("trocar protegida por global, ou o destino na eliminação, reprova", () => {
    const global: ExcecaoAoIsolamento = {
      ...marca,
      semMunicipio: { ...marca.semMunicipio!, especie: "global" },
    };
    expect(() =>
      juntarCatalogo([de("V2-F03-E15", marca), de("V2-F03-E08", redefinida(global))]),
    ).toThrow(
      /trocando o regime \(sem município protegida, fica na eliminação para sem município global, fica na eliminação\)/,
    );
    const some = protegida("t", "some");
    expect(() =>
      juntarCatalogo([de("V2-F03-E15", marca), de("V2-F03-E08", redefinida(some))]),
    ).toThrow(
      /trocando o regime \(sem município protegida, fica na eliminação para sem município protegida, some na eliminação\)/,
    );
  });

  it("uma exceção comum também não ganha regime por redefinição (qualquer transição é ampliação)", () => {
    const comum = excecaoDeSonda("t");
    expect(() =>
      juntarCatalogo([de("V2-F03-E15", comum), de("V2-F03-E08", redefinida(marca))]),
    ).toThrow(
      /trocando o regime \(exceção comum para sem município protegida, fica na eliminação\)/,
    );
  });
});

describe("sonda 19 (correção 1 da 0G, itens 3, 4 e 5): a eliminação provada com COMMIT de verdade, com âncora e com o outro município", () => {
  const ABRIR = `
    CREATE TABLE sonda_marcas (usuario_id uuid PRIMARY KEY, outra uuid NOT NULL DEFAULT gen_random_uuid());
    ALTER TABLE sonda_marcas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_marcas FORCE ROW LEVEL SECURITY;`;
  const FECHAR = "DROP TABLE sonda_marcas";
  const OUTRO =
    "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) " +
    "VALUES (:org, 'Servidor do Outro', 'P-2', 'outro-0g@exemplo.gov.br', 'administrador'); " +
    "INSERT INTO sonda_marcas (usuario_id) SELECT id FROM usuarios WHERE organizacao_id = :org;";
  const comOutro = (
    destino: "fica" | "some",
    extra: Partial<NonNullable<ExcecaoAoIsolamento["semMunicipio"]>["naEliminacao"]> = {},
  ): ExcecaoAoIsolamento => {
    const e = protegida("sonda_marcas", destino);
    return {
      ...e,
      semMunicipio: {
        especie: "protegida",
        naEliminacao: { ...e.semMunicipio!.naEliminacao, semearOutroMunicipio: OUTRO, ...extra },
      },
    };
  };
  const eliminar = (e: ExcecaoAoIsolamento) => conferirEliminacaoSemMunicipio(db, [e]);
  const contagem = async () =>
    (
      await db.query<{ o: number; u: number }>(
        "SELECT (SELECT count(*) FROM organizacoes)::int AS o, (SELECT count(*) FROM usuarios)::int AS u",
      )
    ).rows[0]!;

  it("com o outro município semeado, a marca que fica passa; e a prova (na cópia) não toca o banco do portão", async () => {
    const antes = await contagem();
    expect(await comBuraco(ABRIR, FECHAR, () => eliminar(comOutro("fica")))).toEqual([]);
    expect(await contagem()).toEqual(antes);
  });

  it("um gatilho ADIADO que apaga a marca só na confirmação reprova a declaração fica (numa transação desfeita, ele nunca disparava)", async () => {
    const ADIADO = `
      CREATE FUNCTION sonda_marca_some_no_fim() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$ BEGIN DELETE FROM public.sonda_marcas WHERE usuario_id = OLD.id; RETURN NULL; END $$;
      CREATE CONSTRAINT TRIGGER sonda_marca_some_no_fim AFTER DELETE ON usuarios
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sonda_marca_some_no_fim();`;
    const FECHAR_ADIADO =
      "DROP TRIGGER sonda_marca_some_no_fim ON usuarios; DROP FUNCTION sonda_marca_some_no_fim();";
    expect(
      await comBuraco(`${ABRIR} ${ADIADO}`, `${FECHAR_ADIADO} ${FECHAR}`, () =>
        eliminar(comOutro("fica")),
      ),
    ).toEqual([
      "sonda_marcas (protegida, fica): o catálogo diz que as linhas do município FICAM na eliminação, e 1 de 1 sumiram",
    ]);
  });

  it("um gatilho ADIADO que recusa na confirmação reprova: a eliminação não chega ao fim", async () => {
    const ADIADO = `
      CREATE FUNCTION sonda_recusa_no_fim() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'sonda: recusa na confirmacao'; END $$;
      CREATE CONSTRAINT TRIGGER sonda_recusa_no_fim AFTER DELETE ON usuarios
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sonda_recusa_no_fim();`;
    const FECHAR_ADIADO =
      "DROP TRIGGER sonda_recusa_no_fim ON usuarios; DROP FUNCTION sonda_recusa_no_fim();";
    expect(
      await comBuraco(`${ABRIR} ${ADIADO}`, `${FECHAR_ADIADO} ${FECHAR}`, () =>
        eliminar(comOutro("fica")),
      ),
    ).toEqual([
      expect.stringMatching(
        /^sonda_marcas \(protegida, fica\): a prova do destino na eliminação não chegou ao fim: sonda: recusa na confirmacao/,
      ),
    ]);
  });

  it("âncora: chaves que nunca estiveram na coluna declarada reprovam, mesmo com destino some (antes, a contagem zero passava)", async () => {
    const problemas = await comBuraco(ABRIR, FECHAR, () =>
      eliminar(
        comOutro("some", {
          linhasDoMunicipio: "SELECT id AS chave FROM usuarios WHERE organizacao_id = :org",
          coluna: "outra",
        }),
      ),
    );
    expect(problemas).toEqual([
      expect.stringMatching(
        /^sonda_marcas \(protegida, some\): 2 de 2 chave\(s\) que linhasDoMunicipio devolve não existem em sonda_marcas\.outra ANTES da eliminação/,
      ),
    ]);
  });

  it("o outro município: um DELETE sem filtro na eliminação reprova a declaração some; o apagamento só do eliminado passa", async () => {
    const SEM_FILTRO = `
      CREATE FUNCTION sonda_apaga_tudo() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
        AS $$ BEGIN DELETE FROM public.sonda_marcas; RETURN NULL; END $$;
      CREATE TRIGGER sonda_apaga_tudo AFTER DELETE ON usuarios FOR EACH STATEMENT EXECUTE FUNCTION sonda_apaga_tudo();`;
    const COM_FILTRO = `
      CREATE FUNCTION sonda_apaga_tudo() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
        AS $$ BEGIN DELETE FROM public.sonda_marcas WHERE usuario_id = OLD.id; RETURN OLD; END $$;
      CREATE TRIGGER sonda_apaga_tudo AFTER DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION sonda_apaga_tudo();`;
    const FECHAR_GATILHO =
      "DROP TRIGGER sonda_apaga_tudo ON usuarios; DROP FUNCTION sonda_apaga_tudo();";
    expect(
      await comBuraco(`${ABRIR} ${SEM_FILTRO}`, `${FECHAR_GATILHO} ${FECHAR}`, () =>
        eliminar(comOutro("some")),
      ),
    ).toEqual([
      expect.stringMatching(
        /^sonda_marcas \(protegida, some\): a eliminação de UM município mexeu em sonda_marcas fora dele .*: 1 linha\(s\) sumiram ou mudaram e 0 apareceram/,
      ),
    ]);
    expect(
      await comBuraco(`${ABRIR} ${COM_FILTRO}`, `${FECHAR_GATILHO} ${FECHAR}`, () =>
        eliminar(comOutro("some")),
      ),
    ).toEqual([]);
  });

  it("o outro município sem linha reprova (sem elas não há o que ficar intacto)", async () => {
    expect(
      await comBuraco(ABRIR, FECHAR, () =>
        eliminar(comOutro("fica", { semearOutroMunicipio: "SELECT :org" })),
      ),
    ).toEqual([
      expect.stringMatching(
        /^sonda_marcas \(protegida, fica\): linhasDoMunicipio não achou nenhuma linha do OUTRO município/,
      ),
    ]);
  });

  it("a linha COMPARTILHADA entre os dois municípios nunca some com a eliminação de um deles", async () => {
    const ABRIR_COMPARTILHADA = `
      CREATE TABLE sonda_compartilhada (chave text PRIMARY KEY, valor text);
      CREATE TABLE sonda_uso (org uuid NOT NULL, chave text NOT NULL);
      ALTER TABLE sonda_compartilhada ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sonda_compartilhada FORCE ROW LEVEL SECURITY;
      CREATE FUNCTION sonda_some_com_o_municipio() RETURNS trigger LANGUAGE plpgsql
        SET search_path = public, pg_temp AS $$
        BEGIN
          DELETE FROM public.sonda_compartilhada c
           WHERE c.chave IN (SELECT u.chave FROM public.sonda_uso u WHERE u.org = OLD.id)
             AND (sonda_apaga_compartilhada()
                  OR NOT EXISTS (SELECT 1 FROM public.sonda_uso u2 WHERE u2.chave = c.chave AND u2.org <> OLD.id));
          RETURN OLD;
        END $$;
      CREATE TRIGGER sonda_some_com_o_municipio AFTER DELETE ON organizacoes
        FOR EACH ROW EXECUTE FUNCTION sonda_some_com_o_municipio();`;
    const FECHAR_COMPARTILHADA = `
      DROP TRIGGER sonda_some_com_o_municipio ON organizacoes; DROP FUNCTION sonda_some_com_o_municipio();
      DROP FUNCTION sonda_apaga_compartilhada(); DROP TABLE sonda_uso; DROP TABLE sonda_compartilhada;`;
    const regra = (apaga: boolean) =>
      `CREATE FUNCTION sonda_apaga_compartilhada() RETURNS boolean LANGUAGE sql AS $$ SELECT ${apaga} $$;`;
    const usa = (chave: string, org: string) =>
      `INSERT INTO sonda_compartilhada VALUES (${chave}, 'v') ON CONFLICT DO NOTHING; ` +
      `INSERT INTO sonda_uso VALUES (${org}, ${chave});`;
    const compartilhada = excecaoDeSonda("sonda_compartilhada", {
      semMunicipio: {
        especie: "global",
        naEliminacao: {
          destino: "some",
          porque:
            "Sonda: a linha só do município eliminado some; a compartilhada fica com o outro.",
          semear: usa("'so-' || :org::text", ":org"),
          semearOutroMunicipio: usa("'so-' || :org::text", ":org"),
          compartilhar: `${usa("'junto'", ":org")} INSERT INTO sonda_uso VALUES (:outra, 'junto');`,
          linhasDoMunicipio: "SELECT chave FROM sonda_uso WHERE org = :org",
          coluna: "chave",
        },
      },
    });
    expect(
      await comBuraco(`${regra(false)} ${ABRIR_COMPARTILHADA}`, FECHAR_COMPARTILHADA, () =>
        eliminar(compartilhada),
      ),
    ).toEqual([]);
    expect(
      await comBuraco(`${regra(true)} ${ABRIR_COMPARTILHADA}`, FECHAR_COMPARTILHADA, () =>
        eliminar(compartilhada),
      ),
    ).toEqual([
      expect.stringMatching(
        /^sonda_compartilhada \(global, some\): a eliminação de UM município mexeu em sonda_compartilhada fora dele .*: 1 linha\(s\) sumiram/,
      ),
    ]);
  });

  it("a declaração completa: sem semearOutroMunicipio, ou compartilhar sem :outra, reprova", () => {
    expect(conferirDeclaracoesCompletas([protegida("x")], [])).toEqual([
      expect.stringMatching(/^x \(protegida\): sem semearOutroMunicipio \(com :org\)/),
    ]);
    const meia = comOutro("fica", { compartilhar: "SELECT :org" });
    expect(conferirDeclaracoesCompletas([meia], [])).toEqual([
      "sonda_marcas: compartilhar precisa usar :org e :outra (os dois municípios da prova)",
    ]);
    expect(conferirDeclaracoesCompletas([comOutro("fica")], [])).toEqual([]);
  });
});

describe("sonda 20 (correção 1 da 0G, item 6): a função de gatilho privilegiada, disparada de uma tabela temporária de mesmo nome, recusa com 42501 antes de qualquer efeito", () => {
  const ABRIR = (corpo: string, gatilhos: string) => `
    CREATE TABLE sonda_cofre (quem text);
    ALTER TABLE sonda_cofre ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_cofre FORCE ROW LEVEL SECURITY;
    CREATE SEQUENCE sonda_contador;
    CREATE TABLE sonda_alvo (organizacao_id uuid NOT NULL, nome text);
    CREATE FUNCTION sonda_grava_no_cofre() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN
        ${corpo}
        RETURN NEW;
      END $$;
    REVOKE ALL ON FUNCTION sonda_grava_no_cofre() FROM PUBLIC;
    ${gatilhos}`;
  const UM =
    "CREATE TRIGGER sonda_alvo_grava AFTER INSERT ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();";
  const FECHAR =
    "DROP TABLE sonda_alvo; DROP TABLE sonda_cofre; DROP SEQUENCE sonda_contador; DROP FUNCTION sonda_grava_no_cofre();";
  const RECUSA =
    "IF TG_RELID IS DISTINCT FROM 'public.sonda_alvo'::regclass THEN RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501'; END IF;";
  const GRAVA = "INSERT INTO public.sonda_cofre (quem) VALUES (NEW.nome);";
  const provar = () => provarRecusaForaDaTabela(db);
  const ENTRADA: FuncaoPrivilegiada = {
    nome: "sonda_grava_no_cofre",
    assinatura: "public.sonda_grava_no_cofre()",
    migracao: "999",
    etapa: "sonda",
    executavelPor: [],
    gatilhoEm: ["sonda_alvo"],
    motivo: "Sonda: função de gatilho privilegiada que grava numa tabela que o app não alcança.",
    tenant: "antes_do_tenant",
    confere: "Sonda: age só sobre a linha que disparou o gatilho (NEW).",
    semProva: "Sonda: a prova é o disparo desta própria sonda, que a chama pelo gatilho.",
  };

  it("o banco de hoje não tem função de gatilho privilegiada, e passa", async () => {
    expect(await provar()).toEqual([]);
  });

  it("a recusa por TG_RELID antes de tudo passa", async () => {
    expect(await comBuraco(ABRIR(`${RECUSA} ${GRAVA}`, UM), FECHAR, provar)).toEqual([]);
  });

  it("PERFORM TG_RELID = ... (inoperante) passa na conferência textual e reprova aqui: a função não recusa, e escreve", async () => {
    const corpo = `PERFORM TG_RELID = 'public.sonda_alvo'::regclass; ${GRAVA}`;
    const [textual, comportamental] = await comBuraco(ABRIR(corpo, UM), FECHAR, async () => [
      await conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, ENTRADA]),
      await provar(),
    ]);
    expect(textual).toEqual([]);
    expect(comportamental).toEqual([
      expect.stringMatching(
        /^public\.sonda_grava_no_cofre\(\): disparada pelo gatilho sonda_alvo_grava \(de sonda_alvo\) copiado para pg_temp\."sonda_alvo" \(INSERT\), a função NÃO recusou/,
      ),
      expect.stringMatching(/a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/),
    ]);
  });

  it("a conferência posta DEPOIS da escrita reprova: escreveu antes de recusar", async () => {
    expect(await comBuraco(ABRIR(`${GRAVA} ${RECUSA}`, UM), FECHAR, provar)).toEqual([
      expect.stringMatching(
        /\(INSERT\), a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/,
      ),
    ]);
  });

  it("a escrita com a chave da linha nula não muda nada; a cópia de uma linha REAL mostra o efeito antes da recusa", async () => {
    const corpo = `UPDATE public.sonda_cofre SET quem = quem WHERE quem = NEW.nome; ${RECUSA}`;
    expect(await comBuraco(ABRIR(corpo, UM), FECHAR, provar)).toEqual([]);
    expect(
      await comBuraco(
        `${ABRIR(corpo, UM)}
         ALTER TABLE sonda_alvo DISABLE TRIGGER sonda_alvo_grava;
         INSERT INTO sonda_alvo VALUES (gen_random_uuid(), 'real');
         INSERT INTO sonda_cofre VALUES ('real');
         ALTER TABLE sonda_alvo ENABLE TRIGGER sonda_alvo_grava;`,
        FECHAR,
        provar,
      ),
    ).toEqual([
      expect.stringMatching(
        /\(INSERT, com uma linha real de public\."sonda_alvo"\), a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/,
      ),
    ]);
  });

  it("a sequência que anda antes da recusa também é efeito", async () => {
    expect(
      await comBuraco(
        ABRIR(`PERFORM nextval('public.sonda_contador'); ${RECUSA}`, UM),
        FECHAR,
        provar,
      ),
    ).toEqual([
      expect.stringMatching(/ESCREVEU antes de recusar \(sequência public\.sonda_contador\)/),
    ]);
  });

  it("recusar com outro erro que não 42501 não é a recusa pela tabela que disparou", async () => {
    const outra =
      "IF TG_RELID IS DISTINCT FROM 'public.sonda_alvo'::regclass THEN RAISE EXCEPTION 'outra coisa'; END IF;";
    expect(await comBuraco(ABRIR(outra, UM), FECHAR, provar)).toEqual([
      expect.stringMatching(/falhou com P0001 \(outra coisa\), e não com a recusa 42501/),
    ]);
  });

  it("cada gatilho real é copiado com o nome e o adiamento, e SEM o WHEN: o adiado e o de UPDATE OF também disparam", async () => {
    const DOIS = `
      CREATE CONSTRAINT TRIGGER sonda_alvo_no_fim AFTER INSERT ON sonda_alvo
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();
      CREATE TRIGGER sonda_alvo_muda AFTER UPDATE OF nome ON sonda_alvo FOR EACH ROW
        WHEN (OLD.nome IS DISTINCT FROM NEW.nome) EXECUTE FUNCTION sonda_grava_no_cofre();`;
    const texto = (await comBuraco(ABRIR(GRAVA, DOIS), FECHAR, provar)).join("\n");
    expect(texto).toMatch(
      /gatilho sonda_alvo_no_fim \(de sonda_alvo\) .*\(INSERT\), a função NÃO recusou/,
    );
    expect(texto).toMatch(
      /gatilho sonda_alvo_muda \(de sonda_alvo\) .*\(UPDATE\), a função NÃO recusou/,
    );
    expect(await comBuraco(ABRIR(`${RECUSA} ${GRAVA}`, DOIS), FECHAR, provar)).toEqual([]);
  });

  it("a função sem gatilho no banco é disparada de uma tabela de prova", async () => {
    expect(
      await comBuraco(
        ABRIR("INSERT INTO public.sonda_cofre (quem) VALUES ('x');", ""),
        FECHAR,
        provar,
      ),
    ).toEqual([
      expect.stringMatching(
        /gatilho de prova \(a função não tem gatilho no banco\) .*a função NÃO recusou/,
      ),
      expect.stringMatching(/ESCREVEU antes de recusar \(public\.sonda_cofre\)/),
    ]);
    expect(await comBuraco(ABRIR(RECUSA, ""), FECHAR, provar)).toEqual([]);
  });
});

describe("sonda 21 (correção 1 da 0G, item 7): o disparo de cada gatilho privilegiado é o declarado, e ele está habilitado", () => {
  const ABRIR = (gatilho: string) => `
    CREATE TABLE sonda_alvo (organizacao_id uuid NOT NULL, nome text);
    CREATE FUNCTION sonda_grava() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN
        IF TG_RELID IS DISTINCT FROM 'public.sonda_alvo'::regclass THEN
          RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END $$;
    REVOKE ALL ON FUNCTION sonda_grava() FROM PUBLIC;
    ${gatilho}`;
  const FECHAR = "DROP TABLE sonda_alvo; DROP FUNCTION sonda_grava();";
  const ANTES_DO_INSERT =
    "CREATE TRIGGER sonda_alvo_grava BEFORE INSERT ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava();";
  const ENTRADA: FuncaoPrivilegiada = {
    nome: "sonda_grava",
    assinatura: "public.sonda_grava()",
    migracao: "999",
    etapa: "sonda",
    executavelPor: [],
    gatilhoEm: ["sonda_alvo"],
    gatilhos: [
      {
        tabela: "sonda_alvo",
        nome: "sonda_alvo_grava",
        momento: "BEFORE",
        nivel: "ROW",
        eventos: ["INSERT"],
      },
    ],
    motivo:
      "Sonda: função de gatilho privilegiada cujo disparo a conferência compara com o declarado.",
    tenant: "antes_do_tenant",
    confere: "Sonda: age só sobre a linha que disparou o gatilho (NEW).",
    semProva: "Sonda: a prova é a conferência desta própria sonda, sem teste que a chame.",
  };
  const disparo = (f: FuncaoPrivilegiada = ENTRADA) =>
    conferirDisparoDosGatilhos(db, [...FUNCOES_PRIVILEGIADAS, f]);

  it("o banco de hoje passa; o gatilho declarado como está passa, também ENABLE ALWAYS", async () => {
    expect(await conferirDisparoDosGatilhos(db, FUNCOES_PRIVILEGIADAS)).toEqual([]);
    expect(await comBuraco(ABRIR(ANTES_DO_INSERT), FECHAR, () => disparo())).toEqual([]);
    expect(
      await comBuraco(
        `${ABRIR(ANTES_DO_INSERT)} ALTER TABLE sonda_alvo ENABLE ALWAYS TRIGGER sonda_alvo_grava;`,
        FECHAR,
        () => disparo(),
      ),
    ).toEqual([]);
  });

  it("função de gatilho sem gatilhos declarados reprova, e gatilhos fora de gatilhoEm também", async () => {
    expect(
      await comBuraco(ABRIR(ANTES_DO_INSERT), FECHAR, () =>
        disparo({ ...ENTRADA, gatilhos: undefined }),
      ),
    ).toEqual([
      expect.stringMatching(
        /^public\.sonda_grava\(\): função de gatilho privilegiada sem gatilhos declarados/,
      ),
    ]);
    expect(
      await comBuraco(ABRIR(ANTES_DO_INSERT), FECHAR, () =>
        disparo({ ...ENTRADA, gatilhoEm: ["outra_tabela"] }),
      ),
    ).toEqual(
      expect.arrayContaining([
        "public.sonda_grava(): os gatilhos declarados estão em (sonda_alvo), e gatilhoEm diz (outra_tabela)",
      ]),
    );
  });

  it("desabilitado, ou habilitado só para réplica, reprova; gatilhoEm continuava batendo", async () => {
    const [textual, desabilitado] = await comBuraco(
      `${ABRIR(ANTES_DO_INSERT)} ALTER TABLE sonda_alvo DISABLE TRIGGER sonda_alvo_grava;`,
      FECHAR,
      async () => [
        await conferirGatilhosPrivilegiados(db, [...FUNCOES_PRIVILEGIADAS, ENTRADA]),
        await disparo(),
      ],
    );
    expect(textual).toEqual([]);
    expect(desabilitado).toEqual([
      "public.sonda_grava(): o gatilho sonda_alvo_grava de sonda_alvo está DESABILITADO (tgenabled D): gatilho privilegiado dispara sempre (O ou A)",
    ]);
    expect(
      await comBuraco(
        `${ABRIR(ANTES_DO_INSERT)} ALTER TABLE sonda_alvo ENABLE REPLICA TRIGGER sonda_alvo_grava;`,
        FECHAR,
        () => disparo(),
      ),
    ).toEqual([
      "public.sonda_grava(): o gatilho sonda_alvo_grava de sonda_alvo está habilitado SÓ PARA RÉPLICA (tgenabled R): gatilho privilegiado dispara sempre (O ou A)",
    ]);
  });

  it("evento, momento, WHEN, UPDATE OF ou adiamento diferentes do declarado reprovam", async () => {
    const outros = [
      "CREATE TRIGGER sonda_alvo_grava AFTER INSERT ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava();",
      "CREATE TRIGGER sonda_alvo_grava BEFORE INSERT OR UPDATE ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava();",
      "CREATE TRIGGER sonda_alvo_grava BEFORE INSERT ON sonda_alvo FOR EACH ROW WHEN (NEW.nome IS NULL) EXECUTE FUNCTION sonda_grava();",
      "CREATE TRIGGER sonda_alvo_grava BEFORE INSERT ON sonda_alvo FOR EACH STATEMENT EXECUTE FUNCTION sonda_grava();",
      "CREATE CONSTRAINT TRIGGER sonda_alvo_grava AFTER INSERT ON sonda_alvo DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sonda_grava();",
    ];
    for (const gatilho of outros) {
      expect(await comBuraco(ABRIR(gatilho), FECHAR, () => disparo()), gatilho).toEqual([
        expect.stringMatching(
          /^public\.sonda_grava\(\): o gatilho sonda_alvo\.sonda_alvo_grava no banco é \{.*\}, e o catálogo declara \{"momento":"BEFORE","nivel":"ROW","eventos":\["INSERT"\],"colunasDoUpdate":\[\],"quando":null,"adiado":null\}$/,
        ),
      ]);
    }
    const comTudo: FuncaoPrivilegiada = {
      ...ENTRADA,
      gatilhos: [
        {
          tabela: "sonda_alvo",
          nome: "sonda_alvo_grava",
          momento: "AFTER",
          nivel: "ROW",
          eventos: ["UPDATE"],
          colunasDoUpdate: ["nome"],
          quando: "(old.nome IS DISTINCT FROM new.nome)",
        },
      ],
    };
    expect(
      await comBuraco(
        ABRIR(
          "CREATE TRIGGER sonda_alvo_grava AFTER UPDATE OF nome ON sonda_alvo FOR EACH ROW WHEN (OLD.nome IS DISTINCT FROM NEW.nome) EXECUTE FUNCTION sonda_grava();",
        ),
        FECHAR,
        () => disparo(comTudo),
      ),
    ).toEqual([]);
  });

  it("gatilho a mais no banco, ou declarado que não existe, reprova", async () => {
    const problemas = await comBuraco(
      `${ABRIR(ANTES_DO_INSERT)}
       CREATE TRIGGER sonda_alvo_outro AFTER DELETE ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava();`,
      FECHAR,
      () =>
        disparo({
          ...ENTRADA,
          gatilhos: [
            ...ENTRADA.gatilhos!,
            {
              tabela: "sonda_alvo",
              nome: "sonda_fantasma",
              momento: "AFTER",
              nivel: "ROW",
              eventos: ["INSERT"],
            },
          ],
        }),
    );
    expect(problemas).toEqual([
      "public.sonda_grava(): o gatilho sonda_alvo.sonda_alvo_outro a chama no banco e não está declarado em gatilhos",
      "public.sonda_grava(): o gatilho sonda_alvo.sonda_fantasma está declarado e não existe no banco",
    ]);
  });
});

describe("sonda 22 (correção 1 da 0G, item 8): a chave para a tabela global referencia as colunas declaradas e está validada", () => {
  const ISENTAS = [
    ["console_operadores", "console_operadores"],
    ["console_codigos_de_recuperacao", "console_operadores"],
  ] as const;
  const ABRIR = `
    CREATE TABLE sonda_pessoas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), espelho uuid UNIQUE);
    ALTER TABLE sonda_pessoas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_pessoas FORCE ROW LEVEL SECURITY;
    CREATE TABLE sonda_contas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organizacao_id uuid NOT NULL REFERENCES organizacoes(id),
      pessoa_id uuid NOT NULL CONSTRAINT sonda_contas_pessoa_fkey REFERENCES sonda_pessoas(id));`;
  const FECHAR = "DROP TABLE sonda_contas; DROP TABLE sonda_pessoas;";
  const TROCAR = (destino: string) => `
    ALTER TABLE sonda_contas DROP CONSTRAINT sonda_contas_pessoa_fkey;
    ALTER TABLE sonda_contas ADD CONSTRAINT sonda_contas_pessoa_fkey ${destino};`;
  const CHAVE: ChaveParaTabelaGlobal = {
    tabela: "sonda_contas",
    restricao: "sonda_contas_pessoa_fkey",
    colunas: ["pessoa_id"],
    alvo: "sonda_pessoas",
    colunasReferenciadas: ["id"],
    migracao: "999",
    etapa: "sonda",
    motivo: MOTIVO_DE_SONDA,
  };
  const fk = (chave: ChaveParaTabelaGlobal = CHAVE) =>
    conferirChavesEstrangeiras(
      db,
      [...EXCECOES_AO_ISOLAMENTO, global_("sonda_pessoas")],
      [...CHAVES_PARA_GLOBAIS, chave],
      ISENTAS,
    );

  it("a chave validada para as colunas declaradas passa", async () => {
    expect(await comBuraco(ABRIR, FECHAR, () => fk())).toEqual([]);
  });

  it("NOT VALID reprova", async () => {
    expect(
      await comBuraco(
        `${ABRIR} ${TROCAR("FOREIGN KEY (pessoa_id) REFERENCES sonda_pessoas(id) NOT VALID")}`,
        FECHAR,
        () => fk(),
      ),
    ).toEqual([
      expect.stringMatching(
        /^sonda_contas\.sonda_contas_pessoa_fkey: chave para tabela global NOT VALID/,
      ),
    ]);
  });

  it("referenciar outra coluna única do alvo reprova, declarada ou não; declarar a coluna certa passa", async () => {
    const OUTRA = `${ABRIR} ${TROCAR("FOREIGN KEY (pessoa_id) REFERENCES sonda_pessoas(espelho)")}`;
    expect(await comBuraco(OUTRA, FECHAR, () => fk())).toEqual([
      "sonda_contas.sonda_contas_pessoa_fkey: referencia sonda_pessoas(espelho), e o catálogo declara sonda_pessoas(id)",
    ]);
    expect(
      await comBuraco(OUTRA, FECHAR, () => fk({ ...CHAVE, colunasReferenciadas: undefined })),
    ).toEqual([
      "sonda_contas.sonda_contas_pessoa_fkey: referencia sonda_pessoas(espelho), e o catálogo declara sonda_pessoas(id) (sem declaração, a chave primária do alvo)",
    ]);
    expect(
      await comBuraco(OUTRA, FECHAR, () => fk({ ...CHAVE, colunasReferenciadas: ["espelho"] })),
    ).toEqual([]);
  });

  it("a declaração completa: chave para global sem colunasReferenciadas reprova", () => {
    expect(
      conferirDeclaracoesCompletas([], [{ ...CHAVE, colunasReferenciadas: undefined }]),
    ).toEqual([
      "sonda_contas.sonda_contas_pessoa_fkey: chave para tabela global sem colunasReferenciadas (as colunas do alvo sonda_pessoas que ela referencia)",
    ]);
    expect(conferirDeclaracoesCompletas([], [CHAVE])).toEqual([]);
  });
});

describe("sonda 23 (correção 2 da 0G): a prova de some exige pelo menos uma linha EXCLUSIVA do município eliminado", () => {
  const ABRIR = `
    CREATE TABLE sonda_marcas (usuario_id uuid PRIMARY KEY, outra uuid NOT NULL DEFAULT gen_random_uuid());
    ALTER TABLE sonda_marcas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_marcas FORCE ROW LEVEL SECURITY;`;
  const FECHAR = "DROP TABLE sonda_marcas";
  const OUTRO =
    "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) " +
    "VALUES (:org, 'Servidor do Outro', 'P-2', 'outro-0g@exemplo.gov.br', 'administrador'); " +
    "INSERT INTO sonda_marcas (usuario_id) SELECT id FROM usuarios WHERE organizacao_id = :org;";
  /** A consulta que ignora o município: devolve as mesmas chaves para os dois. */
  const TODAS = "SELECT usuario_id AS chave FROM sonda_marcas WHERE :org IS NOT NULL";
  const declarada = (destino: "fica" | "some", linhasDoMunicipio?: string): ExcecaoAoIsolamento => {
    const e = protegida("sonda_marcas", destino);
    return {
      ...e,
      semMunicipio: {
        especie: "protegida",
        naEliminacao: {
          ...e.semMunicipio!.naEliminacao,
          semearOutroMunicipio: OUTRO,
          ...(linhasDoMunicipio === undefined ? {} : { linhasDoMunicipio }),
        },
      },
    };
  };
  const eliminar = (e: ExcecaoAoIsolamento) => conferirEliminacaoSemMunicipio(db, [e]);
  const LIMPA = `
    CREATE FUNCTION sonda_limpa_marca() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
      AS $$ BEGIN DELETE FROM public.sonda_marcas WHERE usuario_id = OLD.id; RETURN OLD; END $$;
    CREATE TRIGGER sonda_limpa_marca AFTER DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION sonda_limpa_marca();`;
  const FECHAR_LIMPA =
    "DROP TRIGGER sonda_limpa_marca ON usuarios; DROP FUNCTION sonda_limpa_marca();";
  const SEM_EXCLUSIVA =
    /^sonda_marcas \(protegida, some\): nenhuma das 2 chave\(s\) que linhasDoMunicipio devolve para o município eliminado é EXCLUSIVA dele/;

  it("a consulta que devolve as mesmas chaves para os dois municípios, com a limpeza que nunca acontece, reprova a declaração some (antes passava: tudo virava compartilhado)", async () => {
    expect(await comBuraco(ABRIR, FECHAR, () => eliminar(declarada("some", TODAS)))).toEqual([
      expect.stringMatching(SEM_EXCLUSIVA),
    ]);
  });

  it("sem linha exclusiva, nem a limpeza de verdade basta: não há o que provar", async () => {
    expect(
      await comBuraco(`${ABRIR} ${LIMPA}`, `${FECHAR_LIMPA} ${FECHAR}`, () =>
        eliminar(declarada("some", TODAS)),
      ),
    ).toEqual([expect.stringMatching(SEM_EXCLUSIVA)]);
  });

  it("controle: com a consulta pelo município e a limpeza de verdade, some passa; e fica não exige linha exclusiva", async () => {
    expect(
      await comBuraco(`${ABRIR} ${LIMPA}`, `${FECHAR_LIMPA} ${FECHAR}`, () =>
        eliminar(declarada("some")),
      ),
    ).toEqual([]);
    expect(await comBuraco(ABRIR, FECHAR, () => eliminar(declarada("fica", TODAS)))).toEqual([]);
  });
});

describe("sonda 24 (correção 2 da 0G, dívida do item 6): a prova da recusa fora da tabela usa linha real semeada e UPDATE com mudança efetiva", () => {
  const ABRIR = (corpo: string, gatilhos: string) => `
    CREATE TABLE sonda_cofre (quem text);
    ALTER TABLE sonda_cofre ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sonda_cofre FORCE ROW LEVEL SECURITY;
    CREATE TABLE sonda_alvo (organizacao_id uuid NOT NULL, nome text);
    CREATE FUNCTION sonda_grava_no_cofre() RETURNS trigger LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN
        ${corpo}
        RETURN NEW;
      END $$;
    REVOKE ALL ON FUNCTION sonda_grava_no_cofre() FROM PUBLIC;
    ${gatilhos}`;
  const NO_INSERT =
    "CREATE TRIGGER sonda_alvo_grava AFTER INSERT ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();";
  const NO_UPDATE =
    "CREATE TRIGGER sonda_alvo_muda AFTER UPDATE ON sonda_alvo FOR EACH ROW EXECUTE FUNCTION sonda_grava_no_cofre();";
  const FECHAR =
    "DROP TABLE sonda_alvo; DROP TABLE sonda_cofre; DROP FUNCTION sonda_grava_no_cofre();";
  const RECUSA =
    "IF TG_RELID IS DISTINCT FROM 'public.sonda_alvo'::regclass THEN RAISE EXCEPTION 'gatilho fora da tabela' USING ERRCODE = '42501'; END IF;";
  const ENTRADA: FuncaoPrivilegiada = {
    nome: "sonda_grava_no_cofre",
    assinatura: "public.sonda_grava_no_cofre()",
    migracao: "999",
    etapa: "sonda",
    executavelPor: [],
    gatilhoEm: ["sonda_alvo"],
    semearParaProva:
      "INSERT INTO sonda_alvo VALUES (:org, 'semeada'); INSERT INTO sonda_cofre VALUES ('semeada');",
    motivo: "Sonda: função de gatilho privilegiada que grava numa tabela que o app não alcança.",
    tenant: "antes_do_tenant",
    confere: "Sonda: age só sobre a linha que disparou o gatilho (NEW).",
    semProva: "Sonda: a prova é o disparo desta própria sonda, que a chama pelo gatilho.",
  };
  const comCatalogo = () => provarRecusaForaDaTabela(db, [ENTRADA]);
  const semCatalogo = () => provarRecusaForaDaTabela(db);
  const SEM_LINHA =
    /^public\.sonda_grava_no_cofre\(\): semearParaProva não pôs nenhuma linha em public\."sonda_alvo"/;

  it("tabela vazia: a escrita chaveada por NEW antes da recusa passava só com a linha nula, e com a linha semeada reprova", async () => {
    const corpo = `UPDATE public.sonda_cofre SET quem = quem WHERE quem = NEW.nome; ${RECUSA}`;
    expect(await comBuraco(ABRIR(corpo, NO_INSERT), FECHAR, semCatalogo)).toEqual([]);
    expect(await comBuraco(ABRIR(corpo, NO_INSERT), FECHAR, comCatalogo)).toEqual([
      expect.stringMatching(
        /\(INSERT, com uma linha real de public\."sonda_alvo"\), a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/,
      ),
    ]);
  });

  it("a escrita só quando NEW difere de OLD, antes da recusa, passava com SET coluna = coluna e reprova com a mudança efetiva", async () => {
    const corpo = `IF NEW IS DISTINCT FROM OLD THEN INSERT INTO public.sonda_cofre (quem) VALUES ('mudou'); END IF; ${RECUSA}`;
    const comLinha = `${ABRIR(corpo, NO_UPDATE)} INSERT INTO sonda_alvo VALUES (gen_random_uuid(), 'real');`;
    const texto = (await comBuraco(comLinha, FECHAR, semCatalogo)).join("\n");
    expect(texto).toMatch(
      /gatilho sonda_alvo_muda \(de sonda_alvo\) .*\(UPDATE\), a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/,
    );
    expect(texto).toMatch(
      /\(UPDATE, com uma linha real de public\."sonda_alvo"\), a função ESCREVEU antes de recusar \(public\.sonda_cofre\)/,
    );
  });

  it("controle: a recusa antes de tudo passa com a linha semeada e com a mudança efetiva", async () => {
    const corpo = `${RECUSA} INSERT INTO public.sonda_cofre (quem) VALUES (NEW.nome);`;
    expect(await comBuraco(ABRIR(corpo, `${NO_INSERT} ${NO_UPDATE}`), FECHAR, comCatalogo)).toEqual(
      [],
    );
  });

  it("a semeadura que não põe linha na tabela do gatilho reprova", async () => {
    const vazia: FuncaoPrivilegiada = { ...ENTRADA, semearParaProva: "SELECT :org" };
    expect(
      await comBuraco(ABRIR(RECUSA, NO_INSERT), FECHAR, () =>
        provarRecusaForaDaTabela(db, [vazia]),
      ),
    ).toEqual([expect.stringMatching(SEM_LINHA)]);
  });

  it("a declaração completa: função de gatilho privilegiada sem semearParaProva (ou sem :org) reprova", () => {
    const semSemente: FuncaoPrivilegiada = { ...ENTRADA, semearParaProva: undefined };
    expect(conferirDeclaracoesCompletas([], [], [semSemente])).toEqual([
      expect.stringMatching(
        /^public\.sonda_grava_no_cofre\(\): função de gatilho privilegiada sem semearParaProva \(com :org\)/,
      ),
    ]);
    expect(
      conferirDeclaracoesCompletas([], [], [{ ...ENTRADA, semearParaProva: "SELECT 1" }]),
    ).toHaveLength(1);
    expect(conferirDeclaracoesCompletas([], [], [ENTRADA])).toEqual([]);
  });
});

describe("sonda 25 (correção 6 da ADR 0009, junção do lote 1): a leitora de origens_de_conta por lista permitida", () => {
  /** O corpo da leitora da E15 (o mesmo da 054), sem comentários com crase. */
  const LEITORA = `
DECLARE
  v_orfa      uuid;
  v_pessoa    uuid;
  v_origem    text;
  v_transacao xid8;
  v_existe    uuid;
BEGIN
  IF TG_RELID IS DISTINCT FROM 'public.usuarios'::regclass OR TG_OP <> 'INSERT'
     OR NOT ((TG_NAME = 'usuarios_origem_da_pessoa' AND TG_WHEN = 'AFTER' AND TG_LEVEL = 'ROW')
          OR (TG_NAME = 'usuarios_nenhuma_pessoa_sem_conta' AND TG_WHEN = 'AFTER'
              AND TG_LEVEL = 'STATEMENT')) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'conferir_origem_da_conta so serve aos dois gatilhos de conferencia de public.usuarios';
  END IF;
  -- O de COMANDO: toda marca criador desta transacao tem a sua conta.
  IF TG_LEVEL = 'STATEMENT' THEN
    SELECT o.usuario_id INTO v_orfa
      FROM public.origens_de_conta o
     WHERE o.transacao = pg_current_xact_id()
       AND o.origem = 'criador'
       AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = o.usuario_id)
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'a conta nao foi inserida',
        DETAIL  = 'A linha foi descartada depois do gatilho criador -- e isto e texto, '
                  'nao comentario: /* idem */ ; PERFORM pg_notify(''x'', ''y'')',
        CONSTRAINT = 'usuarios_origem_da_pessoa',
        TABLE = 'usuarios';
    END IF;
    RETURN NULL;
  END IF;
  SELECT o.pessoa_id, o.origem, o.transacao INTO v_pessoa, v_origem, v_transacao
    FROM public.origens_de_conta o
   WHERE o.usuario_id = NEW.id;
  SELECT p.id INTO v_existe
    FROM public.pessoas p
   WHERE p.id = NEW.pessoa_id;
  IF v_pessoa IS NULL
     OR v_transacao IS DISTINCT FROM pg_current_xact_id()
     OR v_pessoa IS DISTINCT FROM NEW.pessoa_id
     OR v_origem IS DISTINCT FROM 'criador'
     OR v_existe IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'a conta nao tem a origem do pessoa_id gravada nesta transacao',
      CONSTRAINT = 'usuarios_origem_da_pessoa',
      TABLE = 'usuarios';
  END IF;
  RETURN NULL;
END;
`;
  /** Põe um trecho logo antes do último RETURN NULL (o ramo de linha). */
  const comTrecho = (trecho: string) => {
    const i = LEITORA.lastIndexOf("RETURN NULL;");
    return `${LEITORA.slice(0, i)}${trecho}\n  ${LEITORA.slice(i)}`;
  };
  const reprova = (corpo: string, motivo: RegExp) => {
    const problemas = conferirCorpoDaLeitora(corpo);
    expect(problemas.join("\n")).toMatch(motivo);
  };

  it("a leitora da E15 passa; os literais são preservados (um -- ou um ; dentro do literal é texto)", () => {
    expect(conferirCorpoDaLeitora(LEITORA)).toEqual([]);
    const { simbolos } = simbolosDoCorpo(LEITORA);
    expect(simbolos.some((s) => s.t === "lit" && s.v.includes("-- e isto e texto"))).toBe(true);
    // Os literais adjacentes viram um só.
    expect(
      simbolos.some(
        (s) =>
          s.t === "lit" &&
          s.v.includes("texto, nao comentario: /* idem */ ; PERFORM pg_notify('x', 'y')"),
      ),
    ).toBe(true);
  });

  it("as sete sabotagens da correção 6 reprovam, uma por vez", () => {
    reprova(
      comTrecho("PERFORM pg_notify('x', NEW.id::text);"),
      /comando não permitido na leitora: perform/,
    );
    reprova(comTrecho("PERFORM pg_advisory_lock(1);"), /comando não permitido na leitora: perform/);
    reprova(
      comTrecho("PERFORM set_config('dc360.x', 'y', false);"),
      /comando não permitido na leitora: perform/,
    );
    reprova(
      comTrecho("PERFORM nextval('public.sonda_contador');"),
      /comando não permitido na leitora: perform/,
    );
    reprova(
      comTrecho("PERFORM public.sonda_auxiliar_que_escreve();"),
      /comando não permitido na leitora: perform/,
    );
    reprova(
      comTrecho(
        "INSERT INTO public.origens_de_conta (usuario_id, pessoa_id, origem, transacao) " +
          "VALUES (gen_random_uuid(), gen_random_uuid(), 'criador', pg_current_xact_id()); " +
          "DELETE FROM public.origens_de_conta WHERE transacao = pg_current_xact_id() AND origem = 'criador';",
      ),
      /comando não permitido na leitora: insert/,
    );
    reprova(
      comTrecho(
        "BEGIN INSERT INTO public.origens_de_conta (usuario_id, pessoa_id, origem, transacao) " +
          "VALUES (gen_random_uuid(), gen_random_uuid(), 'criador', pg_current_xact_id()); " +
          "RAISE EXCEPTION 'x'; EXCEPTION WHEN OTHERS THEN NULL; END;",
      ),
      /comando não permitido na leitora: begin/,
    );
  });

  it("a escrita disfarçada de leitura e o que o conferidor não reconhece reprovam (falha fechada)", () => {
    // SELECT que chama função, ou lê outra tabela, ou sem o filtro da própria conta.
    reprova(
      comTrecho(
        "SELECT o.pessoa_id INTO v_pessoa FROM public.origens_de_conta o WHERE o.usuario_id = public.sonda_f();",
      ),
      /palavra não permitida na condição: public|sem o filtro/,
    );
    reprova(
      comTrecho("SELECT u.email INTO v_origem FROM public.usuarios u WHERE u.id = NEW.id;"),
      /lê só origens_de_conta e pessoas/,
    );
    reprova(
      comTrecho(
        "SELECT o.pessoa_id INTO v_pessoa FROM public.origens_de_conta o WHERE o.origem = 'criador';",
      ),
      /sem o filtro pela chave da própria conta/,
    );
    // INTO para quem não é variável declarada, e tipo fora da lista nominal.
    reprova(
      comTrecho(
        "SELECT o.pessoa_id INTO NEW.pessoa_id FROM public.origens_de_conta o WHERE o.usuario_id = NEW.id;",
      ),
      /destino do INTO/,
    );
    reprova(
      LEITORA.replace("v_origem    text;", "v_origem    public.sonda_tipo;"),
      /declaração fora da forma|tipo não permitido/,
    );
    reprova(
      LEITORA.replace("v_origem    text;", "v_origem    jsonb;"),
      /tipo não permitido: jsonb/,
    );
    reprova(
      LEITORA.replace("v_orfa      uuid;", "v_orfa      uuid := public.sonda_f();"),
      /declaração fora da forma/,
    );
    // RAISE com valor lido, concatenação ou format.
    reprova(
      comTrecho("RAISE EXCEPTION USING MESSAGE = 'x' || v_origem;"),
      /opção do RAISE fora da forma/,
    );
    reprova(
      comTrecho("RAISE EXCEPTION USING MESSAGE = format('%s', v_origem);"),
      /opção do RAISE fora da forma/,
    );
    reprova(comTrecho("RAISE NOTICE 'x';"), /RAISE fora da forma/);
    // Conversão, operador e função fora da lista.
    reprova(
      comTrecho("IF v_origem::sonda_tipo = 'x' THEN RETURN NULL; END IF;"),
      /operador não permitido: ::/,
    );
    reprova(
      comTrecho("IF lower(v_origem) = 'x' THEN RETURN NULL; END IF;"),
      /palavra não permitida na condição: lower/,
    );
    reprova(comTrecho("IF v_origem ~~ 'x' THEN RETURN NULL; END IF;"), /operador não permitido/);
    // Construções que não estão na lista: atribuição, laço, ELSE, EXECUTE, texto entre cifrões, aspas.
    reprova(comTrecho("v_origem := 'x';"), /comando não permitido na leitora: v_origem/);
    reprova(
      comTrecho("IF FOUND THEN RETURN NULL; ELSE RETURN NULL; END IF;"),
      /IF sem END IF|comando não permitido|RETURN fora/,
    );
    reprova(comTrecho("EXECUTE 'SELECT 1';"), /comando não permitido na leitora: execute/);
    reprova(comTrecho("RAISE EXCEPTION USING MESSAGE = $x$oi$x$;"), /cifrões/);
    reprova(
      comTrecho(
        'SELECT o."pessoa_id" INTO v_pessoa FROM public.origens_de_conta o WHERE o.usuario_id = NEW.id;',
      ),
      /entre aspas/,
    );
    reprova(comTrecho("RAISE EXCEPTION USING MESSAGE = E'oi';"), /prefixo/);
    reprova(comTrecho("RETURN OLD;"), /RETURN fora da forma/);
  });

  // No banco: a declaração, o proconfig, o EXECUTE e o disparo.
  const criarLeitora = (opcoes: { config?: string; definidora?: boolean; corpo?: string } = {}) => `
    CREATE FUNCTION sonda_leitora() RETURNS trigger LANGUAGE plpgsql
      ${opcoes.definidora === false ? "" : "SECURITY DEFINER"}
      ${opcoes.config ?? "SET search_path = pg_catalog, public, pg_temp"}
      AS $corpo$${opcoes.corpo ?? LEITORA}$corpo$;
    REVOKE ALL ON FUNCTION sonda_leitora() FROM PUBLIC;
    CREATE CONSTRAINT TRIGGER sonda_leitora_adiada AFTER INSERT ON usuarios
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sonda_leitora();`;
  const FECHAR = "DROP TRIGGER sonda_leitora_adiada ON usuarios; DROP FUNCTION sonda_leitora();";
  const ENTRADA: FuncaoPrivilegiada = {
    nome: "sonda_leitora",
    assinatura: "public.sonda_leitora()",
    migracao: "999",
    etapa: "sonda",
    executavelPor: [],
    gatilhoEm: ["usuarios"],
    leOrigemDeConta: "verificador",
    motivo: "Sonda: o verificador adiado, que só lê a marca da própria conta.",
    tenant: "contexto",
    confere: "Sonda: lê só a marca da própria conta (NEW.id) e a pessoa dela.",
    semProva: "Sonda: a prova é esta sonda.",
  };
  const conferir = (funcoes: readonly FuncaoPrivilegiada[]) => conferirLeitoraDeOrigem(db, funcoes);

  it("a leitora na forma certa passa no banco; sem leitora declarada, também", async () => {
    expect(await conferir([])).toEqual([]);
    expect(await comBuraco(criarLeitora(), FECHAR, () => conferir([ENTRADA]))).toEqual([]);
  });

  it("proconfig diferente, sem SECURITY DEFINER, com EXECUTE, ou corpo sabotado reprovam", async () => {
    expect(
      (
        await comBuraco(criarLeitora({ config: "SET search_path = public, pg_temp" }), FECHAR, () =>
          conferir([ENTRADA]),
        )
      ).join("\n"),
    ).toMatch(/proconfig da leitora/);
    expect(
      (await comBuraco(criarLeitora({ config: "" }), FECHAR, () => conferir([ENTRADA]))).join("\n"),
    ).toMatch(/proconfig da leitora é \[\]/);
    expect(
      (
        await comBuraco(criarLeitora({ definidora: false }), FECHAR, () => conferir([ENTRADA]))
      ).join("\n"),
    ).toMatch(/não é SECURITY DEFINER/);
    expect(
      (
        await comBuraco(
          `${criarLeitora()} GRANT EXECUTE ON FUNCTION sonda_leitora() TO dc360_app;`,
          FECHAR,
          () => conferir([ENTRADA]),
        )
      ).join("\n"),
    ).toMatch(/a leitora tem EXECUTE de dc360_app/);
    expect(
      (
        await comBuraco(
          criarLeitora({ corpo: comTrecho("PERFORM pg_notify('x', 'y');") }),
          FECHAR,
          () => conferir([ENTRADA]),
        )
      ).join("\n"),
    ).toMatch(
      /corpo fora da lista permitida da leitora: comando não permitido na leitora: perform/,
    );
  });

  it("duas leitoras, leitora escritora, leitora fora de usuarios ou de AFTER INSERT, e escritora com ramo verificador reprovam", async () => {
    const t = (await conferir([ENTRADA, { ...ENTRADA, assinatura: "public.outra()" }])).join("\n");
    expect(t).toMatch(/mais de uma leitora/);
    const comMarca = (
      await comBuraco(criarLeitora(), FECHAR, () =>
        conferir([{ ...ENTRADA, gravaOrigemDeConta: "criador" }]),
      )
    ).join("\n");
    expect(comMarca).toMatch(/a leitora não é escritora/);
    expect(comMarca).toMatch(/ramo verificador em função escritora/);
    const noUpdate = `${criarLeitora()}
      CREATE TRIGGER sonda_leitora_no_update AFTER UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION sonda_leitora();`;
    expect(
      (
        await comBuraco(
          noUpdate,
          `DROP TRIGGER sonda_leitora_no_update ON usuarios; ${FECHAR}`,
          () => conferir([ENTRADA]),
        )
      ).join("\n"),
    ).toMatch(/gatilho sonda_leitora_no_update de usuarios, que não é AFTER INSERT/);
    expect(
      (
        await comBuraco(criarLeitora(), FECHAR, () =>
          conferir([{ ...ENTRADA, gatilhoEm: ["sessoes"] }]),
        )
      ).join("\n"),
    ).toMatch(/dispara só de usuarios/);
    expect(await conferir([{ ...ENTRADA, assinatura: "public.nao_existe()" }])).toEqual([
      "public.nao_existe(): a leitora declarada não existe no banco",
    ]);
  });
});
