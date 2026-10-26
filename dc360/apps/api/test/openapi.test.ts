import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aberturaOcorrenciaSchema } from "@dc360/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * Quantas rotas registradas ainda não têm entrada. O lote 3 da F02 (partes
 * 3C1 a 3C3) leva isto a ZERO; o número só pode descer. Subir exige decisão
 * escrita, não um ajuste de teste.
 */
const TETO_DE_PENDENTES = 40;

const V1_JSON = fileURLToPath(new URL("../openapi/v1.json", import.meta.url));

type Registrada = { chave: string };

/** `/v1/avisos/` e `/v1/avisos` são a mesma rota (o Fastify registra as duas formas). */
function semBarraFinal(caminho: string): string {
  return caminho.length > 1 && caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
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

  const chaves = new Set(
    rotasRegistradas(app)
      .filter((r) => r.caminho === PREFIXO_V1 || r.caminho.startsWith(`${PREFIXO_V1}/`))
      .map((r) => chaveDaRota({ metodo: r.metodo, caminho: semBarraFinal(r.caminho) })),
  );
  registradasSobV1 = [...chaves].sort().map((chave) => ({ chave }));
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
});

describe("pendências declaradas, por grupo", () => {
  it("o número de rotas pendentes não passa do teto e só desce", () => {
    const porGrupo = GRUPOS.map((g) => `${g.nome}=${g.pendentes.length}`).join(" ");
    console.log(`rotas pendentes (sem entrada): ${ROTAS_PENDENTES.length}; por grupo: ${porGrupo}`);
    expect(ROTAS_PENDENTES.length).toBeLessThanOrEqual(TETO_DE_PENDENTES);
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
    const sem = documento.paths["/v1/equipes"]?.get as {
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
