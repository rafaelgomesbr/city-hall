import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODIGOS_DE_ERRO,
  CODIGOS_RESERVADOS,
  categoriaDoCodigo,
  ehCodigoDeErro,
  erroDaApiSchema,
  tabelaDoCatalogoEmMarkdown,
  type CodigoDeErro,
} from "@dc360/shared";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { RegraDeNegocio, construirServidor } from "../src/servidor.js";
import { fontesDe, varrerFonte, varrerPasta } from "./varredura-de-erros.js";

/**
 * O CATÁLOGO DE CÓDIGOS DE ERRO, PRESO AO QUE A API EMITE (V2-F02-E03).
 *
 * `packages/shared/src/erros.ts` lista todo `erro` que a API devolve, com status
 * e categoria. Este arquivo prende os dois lados:
 *
 *   1. ESTÁTICO, nos dois sentidos, sobre `apps/api/src`, pela árvore sintática
 *      (a mesma varredura do teste dos códigos de acesso): código emitido fora do
 *      catálogo reprova; código do catálogo que ninguém emite reprova, a não ser
 *      que esteja em `CODIGOS_RESERVADOS` (código de etapa futura, que ainda não
 *      vale como emitido). Código emitido que está só na lista reservada também
 *      reprova: ao passar a emitir, ele muda de lista no mesmo commit.
 *   2. DE TIPO: `RegraDeNegocio` só aceita código do catálogo. O compilador é
 *      chamado de verdade, sobre um arquivo que tenta o contrário.
 *   3. DE EXECUÇÃO: em `NODE_ENV=test` o tratador de erros lança quando o
 *      código fora do catálogo chega por variável, `as` ou JavaScript, em
 *      qualquer status (a guarda de acesso só cobre 401 e 403). O corpo de toda
 *      resposta de erro tem a forma `{ erro, mensagem, campos?, requisicao? }`.
 *   4. ISOLAMENTO: recurso de outro município é 404, nunca 403.
 *
 * A TABELA do catálogo, a que o Rafael lê na validação humana, é gerada por
 * `tabelaDoCatalogoEmMarkdown()` e arquivada em `docs/evidencias-v2/G02/`.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC_DA_API = join(AQUI, "..", "src");
const SEGREDO = "segredo-do-catalogo-de-erros-com-mais-de-32-bytes";
const SENHA = "serra-alta-senha-bem-longa";

type EntradaLida = { status: number | readonly number[]; tambemSai?: readonly number[] };
const statusDe = (c: string): number[] => {
  const e = (CODIGOS_DE_ERRO as unknown as Record<string, EntradaLida>)[c]!;
  return [e.status as number, ...(e.tambemSai ?? [])];
};

describe("o catálogo cobre o que a API emite, nos dois sentidos (varredura da árvore sintática)", () => {
  const v = varrerPasta(SRC_DA_API);

  /*
    Duas formas de emitir que a varredura não lê como emissão literal, e que
    esta lista declara. Cada uma é conferida contra o fonte (o texto precisa
    estar lá), para a lista não apodrecer.
  */
  /** Funções que repassam o primeiro argumento a `new RegraDeNegocio(codigo, ...)`. */
  const AUXILIARES_QUE_REPASSAM = ["recusarFoto"] as const;
  /** Pontos em que o código calculado de `RegraDeNegocio` é repasse conferido (arquivo e expressão). */
  const REPASSES_CALCULADOS: ReadonlyArray<{ arquivo: RegExp; expressao: string; porque: string }> =
    [
      {
        arquivo: /rotas[\\/]sincronizacao\.ts$/,
        expressao: "codigo",
        porque:
          "`recusarFoto(codigo: CodigoDeErro, ...)`: o tipo fecha o catálogo, e os usos são lidos abaixo",
      },
    ];
  /** Códigos emitidos por um caminho que a varredura de emissão não enxerga. */
  const EMISSORES_FORA_DO_FORMATO: ReadonlyArray<{
    arquivo: string;
    codigo: string;
    porque: string;
  }> = [
    {
      arquivo: "guarda-de-codigos-de-erro.ts",
      codigo: "desvio_do_catalogo_de_erro",
      porque: 'o par `["erro", "..."]` com que a guarda monta a resposta que troca o desvio',
    },
  ];

  const lidos = (() => {
    const todos = new Set<string>();
    for (const e of v.emissoes) if (e.codigo !== null) todos.add(e.codigo);
    const alemDaVarredura: string[] = [];
    for (const arquivo of fontesDe(SRC_DA_API)) {
      const fonte = readFileSync(arquivo, "utf8");
      for (const nome of AUXILIARES_QUE_REPASSAM) {
        for (const m of fonte.matchAll(new RegExp(`\\b${nome}\\(\\s*"([a-z][a-z_0-9]*)"`, "g"))) {
          todos.add(m[1]!);
          alemDaVarredura.push(m[1]!);
        }
      }
      for (const x of EMISSORES_FORA_DO_FORMATO) {
        if (arquivo.endsWith(x.arquivo) && fonte.includes(`"${x.codigo}"`)) {
          todos.add(x.codigo);
          alemDaVarredura.push(x.codigo);
        }
      }
    }
    return { todos, alemDaVarredura };
  })();

  it("a leitura enxerga as emissões (não ficou cega)", () => {
    expect(v.emissoes.length).toBeGreaterThan(150);
    expect(lidos.todos.size).toBeGreaterThanOrEqual(85);
  });

  it("todo código emitido está no catálogo (fora dele reprova; reservado emitido também)", () => {
    const fora = [...lidos.todos].filter((c) => !ehCodigoDeErro(c)).sort();
    expect(fora).toEqual([]);
  });

  it("todo código do catálogo é emitido por alguém, senão é reservado (sem código morto)", () => {
    const naoEmitidos = Object.keys(CODIGOS_DE_ERRO)
      .filter((c) => !lidos.todos.has(c))
      .sort();
    expect(naoEmitidos).toEqual([]);
  });

  it("a lista reservada guarda códigos que NINGUÉM emite ainda, e nenhum está no catálogo emitido", () => {
    for (const c of Object.keys(CODIGOS_RESERVADOS)) {
      expect(
        lidos.todos.has(c),
        `${c} é reservado mas já é emitido: mude de lista no mesmo commit`,
      ).toBe(false);
      expect(ehCodigoDeErro(c), c).toBe(false);
      expect(categoriaDoCodigo(c), c).not.toBeNull();
    }
  });

  it("todo código emitido com status conhecido sai com o status do catálogo (ou um dos seus desvios declarados)", () => {
    const erradas = v.emissoes
      .filter((e) => e.codigo !== null && e.status !== null && ehCodigoDeErro(e.codigo))
      .filter((e) => !statusDe(e.codigo!).includes(e.status!))
      .map(
        (e) =>
          `${e.arquivo.replace(/^.*src[\\/]/, "src/")}:${e.linha} ${e.codigo} sai ${e.status}, o catálogo diz ${statusDe(e.codigo!).join(" ou ")}`,
      );
    expect(erradas).toEqual([]);
  });

  it("todo código CALCULADO em `new RegraDeNegocio(...)` é um repasse declarado (helper novo reprova)", () => {
    const soltos = v.emissoes
      .filter((e) => e.forma === "RegraDeNegocio" && e.codigo === null)
      .filter(
        (e) =>
          !REPASSES_CALCULADOS.some(
            (r) => r.arquivo.test(e.arquivo) && r.expressao === e.expressao,
          ),
      )
      .map((e) => `${e.arquivo.replace(/^.*src[\\/]/, "src/")}:${e.linha} \`${e.expressao}\``);
    expect(soltos).toEqual([]);
    // Cada repasse declarado existe de fato (a lista não apodrece) e o auxiliar tem usos lidos.
    for (const r of REPASSES_CALCULADOS) {
      expect(
        v.emissoes.some(
          (e) => e.forma === "RegraDeNegocio" && e.codigo === null && r.arquivo.test(e.arquivo),
        ),
        r.porque,
      ).toBe(true);
    }
    expect(lidos.alemDaVarredura.length).toBeGreaterThan(0);
  });

  it("a varredura enxerga um código fora do catálogo e o do catálogo (a prova de que não é cega)", () => {
    const fonte = [
      'throw new RegraDeNegocio("inventado_na_e03", "x", 409);',
      'throw new RegraDeNegocio(\n  "nao_encontrada",\n  "x",\n  404,\n);',
    ].join("\n");
    const achados = varrerFonte(fonte, "src/exemplo.ts").emissoes.map((e) => e.codigo);
    expect(achados).toEqual(["inventado_na_e03", "nao_encontrada"]);
    expect(achados.filter((c) => !ehCodigoDeErro(c))).toEqual(["inventado_na_e03"]);
  });
});

describe("RegraDeNegocio só aceita código do catálogo, em compilação", () => {
  it("o compilador recusa texto fora do catálogo, texto solto e aceita o código do catálogo", () => {
    // Arquivo só em memória: o anfitrião do compilador o entrega sem tocar o disco.
    const arquivo = join(AQUI, "codigo-tipado-virtual.ts").replace(/\\/g, "/");
    const servidor = join(SRC_DA_API, "servidor.js").replace(/\\/g, "/");
    const fonte = [
      `import { RegraDeNegocio } from ${JSON.stringify(servidor)};`,
      'export const aceito = new RegraDeNegocio("nao_encontrada", "x", 404);',
      "// @ts-expect-error o literal fora do catálogo não compila",
      'export const recusado = new RegraDeNegocio("inventado_na_e03", "x", 409);',
      'const solto: string = "outro_codigo";',
      "// @ts-expect-error um string qualquer (variável) não compila",
      'export const recusadoPorVariavel = new RegraDeNegocio(solto, "x", 409);',
    ].join("\n");
    const opcoes: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2023.d.ts"],
      types: ["node"],
      strict: true,
      noUncheckedIndexedAccess: true,
      noEmit: true,
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      resolveJsonModule: true,
      typeRoots: [join(AQUI, "..", "..", "..", "node_modules", "@types")],
    };
    const anfitriao = ts.createCompilerHost(opcoes);
    const lerOriginal = anfitriao.readFile.bind(anfitriao);
    const existeOriginal = anfitriao.fileExists.bind(anfitriao);
    const lerFonteOriginal = anfitriao.getSourceFile.bind(anfitriao);
    anfitriao.fileExists = (f) => f === arquivo || existeOriginal(f);
    anfitriao.readFile = (f) => (f === arquivo ? fonte : lerOriginal(f));
    anfitriao.getSourceFile = (f, alvo, ...resto) =>
      f === arquivo
        ? ts.createSourceFile(f, fonte, alvo, true)
        : lerFonteOriginal(f, alvo, ...resto);
    const programa = ts.createProgram([arquivo], opcoes, anfitriao);
    const diagnosticos = ts.getPreEmitDiagnostics(programa, programa.getSourceFile(arquivo));
    const texto = diagnosticos.map(
      (d) => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
    );
    // Zero: os dois `@ts-expect-error` foram CONSUMIDOS (houve erro) e o código do catálogo compilou.
    // Se o tipo voltasse a aceitar `string`, apareceria o TS2578 ("diretiva sem uso").
    expect(texto).toEqual([]);
  }, 180_000);
});

describe("o tratador de erros e a forma do corpo (servidor de verdade, NODE_ENV=test)", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let appSemConferencia: FastifyInstance;
  let orgA: string;
  let orgaoDeB: string;
  const tokens: Record<string, string> = {};

  const com = (t: string) => ({ authorization: `Bearer ${t}` });
  const comoCodigo = (s: string) => s as unknown as CodigoDeErro;

  function plantar(servidor: FastifyInstance): void {
    // O código calculado, como um engano de rota: o tipo não ajuda aqui, a execução sim.
    for (const status of [404, 409, 422, 429, 503]) {
      servidor.get(`/teste-do-catalogo/variavel-${status}`, async () => {
        const codigo: string = "inventado_por_variavel";
        throw new RegraDeNegocio(comoCodigo(codigo), "mensagem", status);
      });
    }
    servidor.get("/teste-do-catalogo/do-catalogo", async () => {
      throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
    });
    servidor.get("/teste-do-catalogo/com-campos", async () => {
      throw new RegraDeNegocio("dados_invalidos", "Corrija.", 422, [
        { campo: "vistoria.fotos.0", mensagem: "Campo obrigatório" },
      ]);
    });
    servidor.get("/teste-do-catalogo/estoura", async () => {
      throw new Error("detalhe interno que o cliente não vê: tabela ocorrencias");
    });
  }

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: false });
    const db = mem.bruto;
    const a = await db.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
    );
    const b = await db.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
    );
    orgA = a.rows[0]!.id;
    const orgB = b.rows[0]!.id;
    const hash = await derivarSenha(SENHA);
    for (const [org, nome, matricula, email, papel] of [
      [orgA, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador"],
      [orgB, "Aurelio Machado", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador"],
    ] as const) {
      await db.query(
        "INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash) VALUES ($1,$2,$3,$4,$5,$6)",
        [org, nome, matricula, email, papel, hash],
      );
    }
    const o = await db.query<{ id: string }>(
      "INSERT INTO orgaos (organizacao_id,nome,email) VALUES ($1,'Secretaria de Obras','obras@valefundo.exemplo.gov.br') RETURNING id",
      [orgB],
    );
    orgaoDeB = o.rows[0]!.id;

    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: SEGREDO,
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv);
    app = await construirServidor({
      banco: mem.banco,
      config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    plantar(app);
    await app.ready();
    appSemConferencia = await construirServidor({
      banco: mem.banco,
      config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      conferirCatalogoDeErros: false,
    });
    plantar(appSemConferencia);
    await appSemConferencia.ready();

    for (const [chave, email] of [
      ["coordA", "helena@serraalta.exemplo.gov.br"],
      ["coordB", "aurelio@valefundo.exemplo.gov.br"],
    ] as const) {
      const r = await app.inject({
        method: "POST",
        url: "/auth/entrar",
        payload: { email, senha: SENHA },
      });
      if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
      tokens[chave] = r.json().acesso;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await appSemConferencia?.close();
    await mem?.banco.encerrar();
  });

  describe("código fora do catálogo que chega por variável (a guarda de acesso só cobre 401 e 403)", () => {
    it.each([404, 409, 422, 429, 503])(
      "status %i: o tratador lança em teste, e o código inventado não chega ao cliente",
      async (status) => {
        const r = await app.inject({ method: "GET", url: `/teste-do-catalogo/variavel-${status}` });
        expect(r.statusCode, r.body).toBe(500);
        expect(r.body).not.toContain('"erro":"inventado_por_variavel"');
        expect(r.json().message).toContain("fora do catálogo");
        expect(r.json().message).toContain("inventado_por_variavel");
      },
    );

    it("com a conferência desligada (o teste da guarda), o código sai como veio", async () => {
      const r = await appSemConferencia.inject({
        method: "GET",
        url: "/teste-do-catalogo/variavel-409",
      });
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({ erro: "inventado_por_variavel", mensagem: "mensagem" });
    });

    it("o código do catálogo passa, com o status que a rota escolheu", async () => {
      const r = await app.inject({ method: "GET", url: "/teste-do-catalogo/do-catalogo" });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual({ erro: "nao_encontrada", mensagem: "Ocorrência não encontrada." });
    });
  });

  describe("o corpo de toda resposta de erro é { erro, mensagem, campos?, requisicao? }", () => {
    const forma = (corpo: unknown) => {
      const r = erroDaApiSchema.safeParse(corpo);
      expect(r.success, JSON.stringify(corpo)).toBe(true);
      const chaves = Object.keys(corpo as object).sort();
      expect(
        chaves.every((c) => ["erro", "mensagem", "campos", "requisicao"].includes(c)),
        chaves.join(","),
      ).toBe(true);
      expect(
        ehCodigoDeErro((corpo as { erro: string }).erro),
        (corpo as { erro: string }).erro,
      ).toBe(true);
    };

    it("422 do esquema segue { erro: dados_invalidos, campos }", async () => {
      const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: {} });
      expect(r.statusCode).toBe(422);
      forma(r.json());
      expect(r.json().erro).toBe("dados_invalidos");
      expect(r.json().campos.length).toBeGreaterThan(0);
    });

    it("regra de negócio com campos devolve os campos, sem requisição", async () => {
      const r = await app.inject({ method: "GET", url: "/teste-do-catalogo/com-campos" });
      expect(r.statusCode).toBe(422);
      forma(r.json());
      expect(r.json().campos).toEqual([
        { campo: "vistoria.fotos.0", mensagem: "Campo obrigatório" },
      ]);
      expect(r.json().requisicao).toBeUndefined();
    });

    it("500 devolve a requisição (igual ao X-Request-Id) e nada da causa", async () => {
      const r = await app.inject({ method: "GET", url: "/teste-do-catalogo/estoura" });
      expect(r.statusCode).toBe(500);
      forma(r.json());
      expect(r.json().erro).toBe("erro_interno");
      expect(r.json().requisicao).toBe(r.headers["x-request-id"]);
      expect(r.body).not.toContain("ocorrencias");
    });

    it("401, 404 de rota e 404 de recurso seguem a forma", async () => {
      const semToken = await app.inject({ method: "GET", url: "/ocorrencias" });
      expect(semToken.statusCode).toBe(401);
      forma(semToken.json());
      const semRota = await app.inject({ method: "GET", url: "/nao-existe-esta-rota" });
      expect(semRota.statusCode).toBe(404);
      forma(semRota.json());
    });
  });

  describe("os erros do próprio Fastify saem na forma do catálogo (DV-36)", () => {
    it("endereço malformado: 400 url_invalida, em português, sem eco do caminho e com X-Request-Id", async () => {
      const r = await app.inject({ method: "GET", url: "/ocorrencias/%E0%A4%A" });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().erro).toBe("url_invalida");
      expect(r.body).not.toContain("E0%A4");
      expect(r.body).not.toMatch(/is not a valid url|Bad Request/);
      expect(r.headers["x-request-id"]).toBeTruthy();
      expect(r.headers["x-content-type-options"]).toBe("nosniff");
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.headers["content-type"]).toContain("application/json");
      expect(erroDaApiSchema.safeParse(r.json()).success).toBe(true);
    });

    it("parâmetro de rota acima de 100 caracteres: 414 parametro_longo_demais, sem eco do caminho", async () => {
      const longo = "a".repeat(150);
      const r = await app.inject({
        method: "GET",
        url: `/ocorrencias/${longo}`,
        headers: com(tokens["coordA"]!),
      });
      expect(r.statusCode, r.body).toBe(414);
      expect(r.json().erro).toBe("parametro_longo_demais");
      expect(r.body).not.toContain(longo);
      expect(r.body).not.toMatch(/exceeding|Bad Request/);
      expect(r.headers["x-request-id"]).toBeTruthy();
      expect(erroDaApiSchema.safeParse(r.json()).success).toBe(true);
    });

    it("os dois códigos novos estão no catálogo, com status e categoria", () => {
      expect(CODIGOS_DE_ERRO.url_invalida).toMatchObject({ status: 400, categoria: "corrigir" });
      expect(CODIGOS_DE_ERRO.parametro_longo_demais).toMatchObject({
        status: 414,
        categoria: "corrigir",
      });
    });
  });

  describe("isolamento: recurso de outro município é 404, nunca 403", () => {
    it.each(["/orgaos", "/v1/orgaos"])(
      "PATCH %s/<id de B> por coordenador de A: 404 e o mesmo corpo de um id que não existe",
      async (base) => {
        const corpo = { nome: "Nome Trocado Por A" };
        const alheio = await app.inject({
          method: "PATCH",
          url: `${base}/${orgaoDeB}`,
          headers: com(tokens["coordA"]!),
          payload: corpo,
        });
        const inexistente = await app.inject({
          method: "PATCH",
          url: `${base}/00000000-0000-4000-8000-000000000000`,
          headers: com(tokens["coordA"]!),
          payload: corpo,
        });
        expect(alheio.statusCode, alheio.body).toBe(404);
        expect(alheio.statusCode).not.toBe(403);
        // O código é `nao_encontrado` (masculino, o do órgão): nenhum código muda de nome ao entrar no catálogo.
        expect(alheio.json()).toEqual({
          erro: "nao_encontrado",
          mensagem: "Órgão não encontrado.",
        });
        expect(alheio.json()).toEqual(inexistente.json());
        expect(CODIGOS_DE_ERRO).toHaveProperty("nao_encontrado");
      },
    );

    it("o órgão de B continua intacto depois da tentativa de A", async () => {
      const r = await mem.bruto.query<{ nome: string }>("SELECT nome FROM orgaos WHERE id = $1", [
        orgaoDeB,
      ]);
      expect(r.rows[0]!.nome).toBe("Secretaria de Obras");
    });

    it("o coordenador de B edita o próprio órgão (controle: a rota funciona)", async () => {
      const r = await app.inject({
        method: "PATCH",
        url: `/orgaos/${orgaoDeB}`,
        headers: com(tokens["coordB"]!),
        payload: { nome: "Secretaria de Obras e Viação" },
      });
      expect(r.statusCode, r.body).toBe(200);
    });
  });
});

describe("a tabela do catálogo", () => {
  it("é gerada, ordenada por código, com uma linha por código emitido e por reservado", () => {
    const tabela = tabelaDoCatalogoEmMarkdown();
    const linhas = tabela.split("\n").slice(2);
    expect(linhas).toHaveLength(
      Object.keys(CODIGOS_DE_ERRO).length + Object.keys(CODIGOS_RESERVADOS).length,
    );
    expect(tabela).toContain("`url_invalida` | 400 | corrigir");
    expect(tabela).toContain("`parametro_longo_demais` | 414 | corrigir");
    expect(tabela).toContain("| reservado |");
  });
});
