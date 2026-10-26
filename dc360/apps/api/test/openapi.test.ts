import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { aberturaOcorrenciaSchema } from "@dc360/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import {
  gerarOpenApi,
  relatorioDeRotasSemResposta,
  serializarOpenApi,
} from "../src/contrato/openapi.js";
import {
  GRUPOS,
  ROTAS_DO_CONTRATO,
  ROTAS_PENDENTES,
  problemasDoRegistro,
  rotasSemResposta,
  type RotaComGrupo,
} from "../src/contrato/rotas.js";
import { chaveDaRota } from "../src/contrato/tipos.js";
import { construirServidor } from "../src/servidor.js";
import { PREFIXO_V1 } from "../src/versao-v1.js";
import { rotasRegistradas } from "./superficie-registrada.js";

/**
 * O contrato OpenAPI do `/v1` (V2-F02-E04).
 *
 * O que este arquivo trava, sempre contra as rotas que o Fastify de fato
 * registrou (a mesma leitura de `printRoutes` dos testes de paridade da E01) e
 * nunca contra uma lista escrita aqui:
 *
 *   - toda rota sob `/v1` tem entrada no registro (ou está em `pendentes` do
 *     grupo, dívida DECLARADA e contada), e toda entrada tem rota;
 *   - o documento regenerado em memória é igual ao `openapi/v1.json`
 *     commitado (sem deriva: o arquivo é derivado, nunca editado à mão);
 *   - entrada `nova` sem `resposta` reprova; as existentes sem resposta saem
 *     num relatório (número) e não reprovam;
 *   - o documento é estruturalmente OpenAPI 3.1 (sem validador externo: não
 *     entra dependência nova) e NÃO é rota da API.
 *
 * `pendentes` não é licença: o teto abaixo só desce, e a lista que cita rota
 * que não existe, que repete rota já descrita ou que passa do teto reprova.
 */

/**
 * Quantas rotas registradas ainda não têm entrada, EXATO (não é um teto de
 * "menor ou igual"): o lote 3 da F02 (partes 3C1 a 3C3) leva isto a ZERO, e a
 * cada rota descrita baixa este número e tira a chave de `PENDENTES_CONGELADAS`
 * no mesmo commit. Subir, ou trocar uma pendente por outra, mexe aqui e no
 * diff.
 */
const TETO_DE_PENDENTES = 22;

const V1_JSON = fileURLToPath(new URL("../openapi/v1.json", import.meta.url));

/**
 * O que cada instância do Fastify anunciou no `onRoute`: método, endereço como
 * foi declarado e o handler original. O `vi.mock` abaixo põe o gancho em TODA
 * instância criada neste arquivo (a do servidor de verdade e as sintéticas) e
 * não muda nenhum comportamento.
 */
type RotaAnunciada = { metodo: string; url: string; handler: unknown };
const REGISTRO_DE_ROTAS = vi.hoisted(() => new WeakMap<object, RotaAnunciada[]>());

vi.mock("fastify", async (importOriginal) => {
  const original = await importOriginal<typeof import("fastify")>();
  const criar = ((...args: Parameters<typeof original.default>) => {
    const instancia = original.default(...args);
    const anunciadas: RotaAnunciada[] = [];
    REGISTRO_DE_ROTAS.set(instancia, anunciadas);
    instancia.addHook("onRoute", (r) => {
      for (const metodo of [r.method].flat()) {
        anunciadas.push({ metodo: String(metodo), url: r.url, handler: r.handler });
      }
    });
    return instancia;
  }) as typeof original.default;
  return { ...original, default: criar };
});

type Registrada = { chave: string };

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 && caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
}

/**
 * As rotas sob `/v1` com as formas com e sem barra final fundidas numa só, MAS
 * só quando as duas formas são de fato a mesma rota.
 *
 * O Fastify registra `/v1/avisos` e `/v1/avisos/` com o mesmo handler quando o
 * plugin tem prefixo e a rota é `/` (`prefixTrailingSlash: "both"`). Mas um
 * `GET /x/:id` e um `GET /x/:id/` declarados à mão são DUAS rotas, e fundi-las
 * calado esconderia uma delas do contrato. Por isso a fusão é provada, pelo
 * que o próprio Fastify anunciou no `onRoute` (ver `REGISTRO_DE_ROTAS`, o
 * `findRoute` não serve: devolve o `routeHandler` genérico, igual para todas):
 *
 *   - as duas formas foram declaradas, e o handler delas é o MESMO: fundem;
 *   - só uma forma foi declarada (a outra é o gêmeo `prefixTrailingSlash` que o
 *     próprio Fastify cria, sem passar pelo `onRoute`): fundem;
 *   - as duas foram declaradas com handlers DIFERENTES: são duas rotas, sai um
 *     problema e as duas chaves ficam separadas, para a paridade reprovar a que
 *     não tem entrada.
 */
function fundirFormas(instancia: FastifyInstance): { chaves: string[]; problemas: string[] } {
  const porChave = new Map<string, { metodo: string; caminhos: string[] }>();
  for (const r of rotasRegistradas(instancia)) {
    if (r.caminho !== PREFIXO_V1 && !r.caminho.startsWith(`${PREFIXO_V1}/`)) continue;
    const chave = chaveDaRota({ metodo: r.metodo, caminho: semBarraFinal(r.caminho) });
    const achada = porChave.get(chave) ?? { metodo: r.metodo, caminhos: [] };
    achada.caminhos.push(r.caminho);
    porChave.set(chave, achada);
  }

  const chaves: string[] = [];
  const problemas: string[] = [];
  for (const [chave, { metodo, caminhos }] of porChave) {
    if (caminhos.length === 1) {
      chaves.push(chave);
      continue;
    }
    const anunciadas = REGISTRO_DE_ROTAS.get(instancia) ?? [];
    const declaradas = caminhos
      .map((caminho) => anunciadas.find((a) => a.metodo === metodo && a.url === caminho))
      .filter((a) => a !== undefined);
    const mesmo =
      declaradas.length > 0 && declaradas.every((a) => a.handler === declaradas[0]!.handler);
    if (mesmo) {
      chaves.push(chave);
    } else {
      problemas.push(
        `${chave}: as formas ${caminhos.join(" e ")} têm handlers DIFERENTES e não podem ser fundidas`,
      );
      for (const caminho of caminhos) chaves.push(chaveDaRota({ metodo, caminho }));
    }
  }
  return { chaves: chaves.sort(), problemas };
}

/**
 * A lista congelada das rotas que, hoje, ficam em `pendentes`. Rota NOVA nunca
 * entra em `pendentes`: nasce com entrada e `resposta`. O lote 3 tira chaves
 * daqui e de `pendentes` no mesmo commit, e o diff mostra cada uma.
 */
const PENDENTES_CONGELADAS: readonly string[] = [
  "POST /v1/sincronizacao/pendencias/reconciliar",
  "POST /v1/evidencias/autorizar-envio",
  "POST /v1/evidencias/confirmar-envio",
  "GET /v1/documentos/validar/:codigo",
  "POST /v1/mapa/resolver-link",
  "POST /v1/rota",
  "GET /v1/busca",
  "GET /v1/ocorrencias",
  "GET /v1/ocorrencias/mapa",
  "GET /v1/ocorrencias/duplicidades/consulta",
  "POST /v1/ocorrencias/:id/providencia",
  "GET /v1/oficios",
  "POST /v1/oficios",
  "POST /v1/oficios/:id/envio",
  "GET /v1/orgaos",
  "POST /v1/orgaos",
  "PATCH /v1/orgaos/:id",
  "POST /v1/orgaos/:id/desativacao",
  "GET /v1/trilha",
  "GET /v1/relatorios/ocorrencias.csv",
  "GET /v1/relatorios/resumo",
  "GET /v1/relatorios/consultas",
];

/**
 * Confere `pendentes` contra a lista congelada e o teto, por IGUALDADE: voltar
 * de 39 para 40, ou trocar uma pendente por outra, aparece no diff do teste.
 */
function conferirPendentes(
  pendentes: readonly string[],
  congeladas: readonly string[],
  teto: number,
): string[] {
  const problemas: string[] = [];
  const congelada = new Set(congeladas);
  for (const chave of pendentes) {
    if (!congelada.has(chave)) {
      problemas.push(`rota nova em pendentes (nasce com entrada e resposta): ${chave}`);
    }
  }
  if (congeladas.length !== teto) {
    problemas.push(`a lista congelada tem ${congeladas.length} e o teto diz ${teto}`);
  }
  if (pendentes.length !== teto) {
    problemas.push(`pendentes tem ${pendentes.length} e o teto exato é ${teto}`);
  }
  return problemas;
}

/**
 * Compara o que o servidor registrou com o registro do contrato. Devolve uma
 * lista de problemas em português; vazia é verde. É função pura de propósito,
 * para os casos negativos abaixo provarem que cada defeito reprova.
 */
function paridade(
  registradas: readonly Registrada[],
  entradas: readonly string[],
  pendentes: readonly string[],
): string[] {
  const problemas: string[] = [];
  const doServidor = new Set(registradas.map((r) => r.chave));
  const dasEntradas = new Set(entradas);
  const dasPendentes = new Set(pendentes);

  for (const chave of [...doServidor].sort()) {
    if (!dasEntradas.has(chave) && !dasPendentes.has(chave)) {
      problemas.push(`rota registrada sem entrada e fora de pendentes: ${chave}`);
    }
  }
  for (const chave of [...dasEntradas].sort()) {
    if (!doServidor.has(chave)) problemas.push(`entrada sem rota registrada: ${chave}`);
  }
  for (const chave of [...dasPendentes].sort()) {
    if (!doServidor.has(chave)) problemas.push(`pendente cita rota que não existe: ${chave}`);
    if (dasEntradas.has(chave)) problemas.push(`pendente já descrita (tire da lista): ${chave}`);
  }
  if (dasPendentes.size !== pendentes.length) problemas.push("pendentes com chave repetida");
  return problemas;
}

let mem: BancoEmMemoria;
let app: FastifyInstance;
let registradasSobV1: Registrada[];
let problemasDeFusao: string[];

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-openapi-com-mais-de-32-bytes!!",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  const fundidas = fundirFormas(app);
  problemasDeFusao = fundidas.problemas;
  registradasSobV1 = fundidas.chaves.map((chave) => ({ chave }));
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("paridade com as rotas que o servidor registrou", () => {
  it("lê rotas de verdade (âncora contra o teste que passa sem conferir)", () => {
    expect(registradasSobV1.length).toBeGreaterThan(80);
    expect(registradasSobV1.map((r) => r.chave)).toContain("POST /v1/ocorrencias");
    expect(registradasSobV1.every((r) => r.chave.includes(" /v1/"))).toBe(true);
  });

  it("toda rota sob /v1 tem entrada (ou está declarada em pendentes) e toda entrada tem rota", () => {
    const problemas = paridade(
      registradasSobV1,
      ROTAS_DO_CONTRATO.map(chaveDaRota),
      ROTAS_PENDENTES.map((p) => p.chave),
    );
    expect(problemas).toEqual([]);
  });

  it("o conjunto de entradas e pendentes cobre exatamente as rotas registradas", () => {
    expect(ROTAS_DO_CONTRATO.length + ROTAS_PENDENTES.length).toBe(registradasSobV1.length);
  });

  it("reprova rota registrada sem entrada", () => {
    const p = paridade([{ chave: "GET /v1/nova" }], [], []);
    expect(p).toEqual(["rota registrada sem entrada e fora de pendentes: GET /v1/nova"]);
  });

  it("reprova entrada sem rota registrada", () => {
    const p = paridade([], ["GET /v1/fantasma"], []);
    expect(p).toEqual(["entrada sem rota registrada: GET /v1/fantasma"]);
  });

  it("reprova pendente que cita rota inexistente e a que já foi descrita", () => {
    expect(paridade([], [], ["GET /v1/fantasma"])).toEqual([
      "pendente cita rota que não existe: GET /v1/fantasma",
    ]);
    expect(paridade([{ chave: "GET /v1/a" }], ["GET /v1/a"], ["GET /v1/a"])).toEqual([
      "pendente já descrita (tire da lista): GET /v1/a",
    ]);
  });

  it("o contrato só descreve o /v1: nenhuma entrada usa o caminho legado", () => {
    expect(problemasDoRegistro()).toEqual([]);
  });

  it("as formas com e sem barra final fundidas são o mesmo handler (nas rotas reais)", () => {
    expect(problemasDeFusao).toEqual([]);
  });

  it("duas rotas distintas (`/:id` e `/:id/` com handlers diferentes) NÃO se fundem em silêncio", async () => {
    const sintetico = Fastify();
    sintetico.get("/v1/coisas/:id", async () => "a");
    sintetico.get("/v1/coisas/:id/", async () => "b");
    await sintetico.ready();
    const { chaves, problemas } = fundirFormas(sintetico);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("DIFERENTES");
    expect(chaves).toEqual(["GET /v1/coisas/:id", "GET /v1/coisas/:id/"]);
    await sintetico.close();
  });

  it("as duas formas do mesmo handler (plugin com prefixo e rota `/`) fundem sem problema", async () => {
    const sintetico = Fastify();
    await sintetico.register(
      async (dentro) => {
        dentro.get("/", async () => "lista");
      },
      { prefix: "/v1/lista" },
    );
    await sintetico.ready();
    const { chaves, problemas } = fundirFormas(sintetico);
    expect(problemas).toEqual([]);
    expect(chaves).toEqual(["GET /v1/lista"]);
    await sintetico.close();
  });
});

describe("pendências declaradas, por grupo", () => {
  it("pendentes é IGUAL à lista congelada e ao teto exato (toda mudança aparece no diff)", () => {
    const porGrupo = GRUPOS.map((g) => `${g.nome}=${g.pendentes.length}`).join(" ");
    console.log(`rotas pendentes (sem entrada): ${ROTAS_PENDENTES.length}; por grupo: ${porGrupo}`);
    const chaves = ROTAS_PENDENTES.map((p) => p.chave);
    expect(conferirPendentes(chaves, PENDENTES_CONGELADAS, TETO_DE_PENDENTES)).toEqual([]);
    expect([...chaves].sort()).toEqual([...PENDENTES_CONGELADAS].sort());
  });

  it("reprova rota NOVA colocada em pendentes, a troca de uma por outra e a volta do teto", () => {
    const congeladas = ["GET /v1/a", "GET /v1/b"];
    expect(conferirPendentes(congeladas, congeladas, 2)).toEqual([]);
    expect(conferirPendentes(["GET /v1/a", "GET /v1/nova"], congeladas, 2)).toEqual([
      "rota nova em pendentes (nasce com entrada e resposta): GET /v1/nova",
    ]);
    expect(conferirPendentes(["GET /v1/a"], congeladas, 2)).toEqual([
      "pendentes tem 1 e o teto exato é 2",
    ]);
    expect(conferirPendentes([...congeladas, "GET /v1/a"], congeladas, 2)).toEqual([
      "pendentes tem 3 e o teto exato é 2",
    ]);
    expect(conferirPendentes(congeladas, congeladas, 3)).toEqual([
      "a lista congelada tem 2 e o teto diz 3",
      "pendentes tem 2 e o teto exato é 3",
    ]);
  });

  it("cada grupo tem nome único", () => {
    const nomes = GRUPOS.map((g) => g.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe("resposta das rotas", () => {
  it("entrada nova sem resposta reprova", () => {
    const sem: RotaComGrupo = {
      metodo: "GET",
      caminho: "/v1/algo-novo",
      resumo: "Rota criada depois do contrato.",
      nova: true,
      grupo: "teste",
    };
    expect(problemasDoRegistro([sem])).toEqual(["rota nova sem resposta: GET /v1/algo-novo"]);
    expect(problemasDoRegistro([{ ...sem, resposta: { status: 200, descricao: "ok" } }])).toEqual(
      [],
    );
  });

  it("nenhuma entrada real é nova sem resposta", () => {
    expect(ROTAS_DO_CONTRATO.filter((r) => r.nova && !r.resposta)).toEqual([]);
  });

  it("as existentes sem resposta saem num relatório e não reprovam", () => {
    const sem = rotasSemResposta();
    const relatorio = relatorioDeRotasSemResposta();
    console.log(`entradas existentes sem resposta descrita: ${sem.length}`);
    expect(relatorio).toContain(`Entradas existentes sem resposta descrita: ${sem.length}`);
    expect(relatorio).toContain(`Rotas ainda sem entrada (pendentes): ${ROTAS_PENDENTES.length}`);
    expect(sem.every((r) => !r.nova && !r.resposta)).toBe(true);
  });
});

describe("o documento v1.json", () => {
  const documento = gerarOpenApi();

  it("o regenerado em memória é igual ao commitado (sem deriva)", () => {
    const commitado = readFileSync(V1_JSON, "utf8");
    expect(serializarOpenApi(documento)).toBe(commitado);
  });

  it("tem a forma do OpenAPI 3.1", () => {
    expect(documento.openapi).toBe("3.1.0");
    expect(documento.info).toMatchObject({
      title: expect.any(String),
      version: expect.any(String),
    });
    const caminhos = Object.keys(documento.paths);
    expect(caminhos.length).toBeGreaterThan(40);

    for (const caminho of caminhos) {
      expect(caminho).toMatch(/^\/v1\//);
      expect(caminho).not.toContain(":");
      for (const [metodo, operacao] of Object.entries(documento.paths[caminho]!)) {
        expect(["get", "post", "put", "patch", "delete"]).toContain(metodo);
        expect(operacao.summary, `${metodo} ${caminho}`).toEqual(expect.any(String));
        expect(
          Object.keys(operacao.responses as object).length,
          `${metodo} ${caminho}`,
        ).toBeGreaterThan(0);
        const doCaminho = [...caminho.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
        const declarados = ((operacao.parameters ?? []) as { name: string; in: string }[])
          .filter((p) => p.in === "path")
          .map((p) => p.name);
        expect(declarados.sort(), `${metodo} ${caminho}`).toEqual(doCaminho.sort());
      }
    }
  });

  it("toda referência $ref aponta para algo que existe no documento", () => {
    const texto = JSON.stringify(documento);
    const refs = new Set([...texto.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]!));
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const nome = ref.replace("#/components/schemas/", "");
      expect(documento.components.schemas[nome], ref).toBeDefined();
    }
    expect(texto).not.toContain("#/$defs");
  });

  it("POST /v1/ocorrencias descreve aberturaOcorrenciaSchema", () => {
    const operacao = documento.paths["/v1/ocorrencias"]?.post as {
      requestBody: { content: { "application/json": { schema: { properties: object } } } };
    };
    const propriedades = Object.keys(
      operacao.requestBody.content["application/json"].schema.properties,
    );
    expect(propriedades.sort()).toEqual(Object.keys(aberturaOcorrenciaSchema.shape).sort());
  });

  it("o erro da API é descrito uma vez e referenciado, com os códigos do catálogo", () => {
    const operacao = documento.paths["/v1/ocorrencias/{id}/triagem"]?.post as {
      responses: Record<string, { "x-codigos-de-erro"?: string[] }>;
    };
    expect(operacao.responses["401"]?.["x-codigos-de-erro"]).toEqual(["nao_autenticado"]);
    expect(operacao.responses["403"]?.["x-codigos-de-erro"]).toEqual(["sem_permissao"]);
    expect(documento.components.schemas.ErroDaApi).toMatchObject({ type: "object" });
  });

  it("operação sem resposta descrita se declara pendente, não inventa status", () => {
    /* Rota sintética: as rotas reais vão ganhando resposta, e este caso não pode depender de quais ainda não têm. */
    const semResposta: RotaComGrupo = {
      metodo: "GET",
      caminho: "/v1/coisas",
      resumo: "Sem resposta descrita.",
      grupo: "teste",
    };
    const sem = gerarOpenApi([semResposta], []).paths["/v1/coisas"]?.get as {
      responses: Record<string, unknown>;
      "x-resposta-pendente"?: boolean;
    };
    expect(sem["x-resposta-pendente"]).toBe(true);
    expect(Object.keys(sem.responses)).toContain("default");

    const com = documento.paths["/v1/auth/recuperacao"]?.get as {
      responses: Record<string, unknown>;
    };
    expect(Object.keys(com.responses)).toContain("200");
  });

  it("lista as rotas pendentes dentro do próprio documento", () => {
    expect(documento["x-rotas-pendentes"]).toEqual(ROTAS_PENDENTES.map((p) => p.chave).sort());
  });

  it("parâmetro de caminho que o esquema não declara faz o gerador falhar", () => {
    const torta: RotaComGrupo = {
      metodo: "GET",
      caminho: "/v1/coisas/:id",
      resumo: "Sem parametros.",
      grupo: "teste",
    };
    expect(() => gerarOpenApi([torta], [])).toThrow(/parâmetros de caminho/);
    expect(() =>
      gerarOpenApi([{ ...torta, parametros: z.object({ outro: z.string() }) }], []),
    ).toThrow(/parâmetros de caminho/);
    expect(() =>
      gerarOpenApi([{ ...torta, parametros: z.object({ id: z.string() }) }], []),
    ).not.toThrow();
  });
});

describe("o documento não é rota", () => {
  it.each(["/v1/openapi.json", "/openapi/v1.json", "/openapi.json", "/v1/docs"])(
    "%s não existe na API",
    async (url) => {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode).toBe(404);
    },
  );
});
