import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CABECALHO_DE_VERSAO_DO_APLICATIVO } from "@dc360/shared";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { gerarOpenApi, type DocumentoOpenApi } from "../src/contrato/openapi.js";
import { ROTAS_DO_CONTRATO } from "../src/contrato/rotas.js";
import { construirServidor } from "../src/servidor.js";
import { ROTA_DA_VERSAO_MINIMA } from "../src/versao-do-aplicativo.js";

/**
 * O 426 e o cabeçalho `X-App-Version` no contrato (V2-F02-E04, correção 1,
 * achado da revisão independente dos lotes 3 e 4).
 *
 * O gancho do escopo `/v1` devolve 426 `versao_do_aplicativo_antiga` ANTES de
 * autenticar, em toda rota do escopo menos a pública da versão mínima. O
 * documento tem de dizer isso em toda operação, e o teste confere o documento
 * contra o COMPORTAMENTO: o servidor real, com mínimo configurado, é chamado por
 * `inject` em cada operação do contrato.
 */

const SEGREDO = "segredo-do-openapi-da-versao-com-mais-de-32-bytes";
const ID = "00000000-0000-4000-8000-000000000000";

type Operacao = {
  parameters?: { name: string; in: string; required: boolean; schema: unknown }[];
  responses: Record<
    string,
    { description: string; content?: { "application/json": { schema: { $ref?: string } } } }
  >;
};

let mem: BancoEmMemoria;
let app: FastifyInstance;
const documento: DocumentoOpenApi = gerarOpenApi();

function operacoes(): { metodo: string; caminho: string; operacao: Operacao }[] {
  return Object.entries(documento.paths).flatMap(([caminho, porMetodo]) =>
    Object.entries(porMetodo).map(([metodo, operacao]) => ({
      metodo,
      caminho,
      operacao: operacao as unknown as Operacao,
    })),
  );
}

const ehDaVersaoMinima = (caminho: string) =>
  caminho === ROTA_DA_VERSAO_MINIMA.replace(":aplicativo", "{aplicativo}");

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: SEGREDO,
      LOGIN_POR_IP: "10000",
      VERSAO_MINIMA_CAMPO: "1.3.0",
      VERSAO_MINIMA_CIDADAO: "2.0.0",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("o documento declara o 426 e o cabeçalho de versão", () => {
  it("âncora: o documento tem operações e a rota pública da versão mínima", () => {
    expect(operacoes().length).toBe(ROTAS_DO_CONTRATO.length);
    expect(operacoes().some((o) => ehDaVersaoMinima(o.caminho))).toBe(true);
  });

  it("toda operação do /v1, menos a da versão mínima, declara x-app-version opcional", () => {
    for (const { metodo, caminho, operacao } of operacoes()) {
      const cabecalho = (operacao.parameters ?? []).filter((p) => p.in === "header");
      if (ehDaVersaoMinima(caminho)) {
        expect(cabecalho, `${metodo} ${caminho}`).toEqual([]);
        continue;
      }
      expect(
        cabecalho.map((p) => p.name),
        `${metodo} ${caminho}`,
      ).toEqual([CABECALHO_DE_VERSAO_DO_APLICATIVO]);
      expect(cabecalho[0]!.required).toBe(false);
    }
  });

  it("toda operação do /v1, menos a da versão mínima, declara o 426 com o corpo { erro, mensagem, versaoMinima }", () => {
    const esquema = documento.components.schemas.VersaoDoAplicativoAntiga as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(esquema.required.slice().sort()).toEqual(["erro", "mensagem", "versaoMinima"]);
    for (const { metodo, caminho, operacao } of operacoes()) {
      const r426 = operacao.responses["426"];
      if (ehDaVersaoMinima(caminho)) {
        expect(r426, `${metodo} ${caminho}`).toBeUndefined();
        continue;
      }
      expect(r426, `${metodo} ${caminho}`).toBeDefined();
      expect(r426!.content?.["application/json"].schema.$ref).toBe(
        "#/components/schemas/VersaoDoAplicativoAntiga",
      );
    }
  });
});

describe("o 426 é do gancho, não da entrada", () => {
  it("entrada que declara o 426 por conta própria faz o gerador falhar", () => {
    expect(() =>
      gerarOpenApi(
        [
          {
            metodo: "GET",
            caminho: "/v1/coisas",
            resumo: "Lê.",
            grupo: "teste",
            resposta: { status: 200, descricao: "Ok." },
            tambemResponde: [{ status: 426, descricao: "Sozinha." }],
          },
        ],
        [],
      ),
    ).toThrow(/426/);
  });
});

describe("o documento confere com o comportamento do servidor", () => {
  it("cada operação declarada com 426 devolve 426 no corpo descrito; a da versão mínima não", async () => {
    const esquema = documento.components.schemas.VersaoDoAplicativoAntiga as {
      required: string[];
    };
    let conferidas = 0;
    for (const { metodo, caminho, operacao } of operacoes()) {
      const url = caminho.replace(/\{[^}]+\}/g, (n) => (n === "{aplicativo}" ? "campo" : ID));
      const r = await app.inject({
        method: metodo.toUpperCase() as "GET",
        url,
        headers: { [CABECALHO_DE_VERSAO_DO_APLICATIVO]: "campo/1.2.0" },
        ...(metodo === "get" ? {} : { payload: {} }),
      });
      const declara426 = "426" in operacao.responses;
      expect(r.statusCode === 426, `${metodo} ${url} (${r.statusCode})`).toBe(declara426);
      if (declara426) {
        expect(Object.keys(r.json()).sort()).toEqual(esquema.required.slice().sort());
        expect(r.json().erro).toBe("versao_do_aplicativo_antiga");
      }
      conferidas += 1;
    }
    expect(conferidas).toBe(ROTAS_DO_CONTRATO.length);
  }, 120_000);
});
