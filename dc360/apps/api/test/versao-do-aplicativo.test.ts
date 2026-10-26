import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { ROTAS_SO_NO_V1 } from "../src/versao-v1.js";
import { rotasRegistradas } from "./superficie-registrada.js";

/**
 * X-App-Version, a versão mínima por aplicativo e o 426 (V2-F02-E06).
 *
 * O que este arquivo trava:
 *
 *   - POSITIVOS: versão igual ou acima do mínimo passa; mínimo vazio (o padrão)
 *     não recusa ninguém; a rota pública devolve o mínimo sem token.
 *   - NEGATIVOS: abaixo do mínimo recebe 426 antes de qualquer outra coisa
 *     (inclusive do 401 e da validação do corpo); cabeçalho malformado é
 *     IGNORADO, nunca 500; cabeçalho ausente é aceito e contado em log `info`.
 *   - ISOLAMENTO: o 426 não depende de município nem de recurso (o corpo é o
 *     mesmo para um id real e para um falso, então não confirma nada); token do
 *     município B contra recurso de A segue 404.
 *   - ESCOPO: a recusa vale só em `/v1` (o espelho e a infraestrutura ficam de
 *     fora), e a rota de versão mínima só existe em `/v1`.
 */

const SENHA = "defesa-civil-2026";
const SEGREDO = "segredo-da-versao-do-aplicativo-com-mais-de-32-bytes";
const ORIGEM_DO_PAINEL = "http://localhost:4691";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_B = "aurelio.machado@valefundo.exemplo.gov.br";
const ID_FALSO = "00000000-0000-4000-8000-000000000000";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let appSemMinimo: FastifyInstance;
let tokenHelena: string;
let tokenB: string;
let idOcorrenciaA: string;
let linhas: string[] = [];

const coletor = {
  write: (linha: string) => {
    linhas.push(linha);
  },
};
const com = (t: string, versao?: string) => ({
  authorization: `Bearer ${t}`,
  ...(versao ? { "x-app-version": versao } : {}),
});
const logs = () => linhas.map((l) => JSON.parse(l) as Record<string, unknown>);

function configDe(extra: Record<string, string> = {}) {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: SEGREDO,
    LOGIN_POR_IP: "10000",
    ORIGENS_PERMITIDAS: ORIGEM_DO_PAINEL,
    ...extra,
  } as NodeJS.ProcessEnv);
}

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({
    banco: mem.banco,
    config: configDe({ VERSAO_MINIMA_CAMPO: "1.3.0", VERSAO_MINIMA_CIDADAO: "2.0.0" }),
    armazenamento,
    destinoDeLog: coletor,
  });
  await app.ready();
  // O mesmo banco, a configuração de fábrica: nenhum mínimo.
  appSemMinimo = await construirServidor({ banco: mem.banco, config: configDe(), armazenamento });
  await appSemMinimo.ready();

  tokenHelena = await entrar(EMAIL_HELENA);
  tokenB = await entrar(EMAIL_B);
  const criada = await app.inject({
    method: "POST",
    url: "/v1/ocorrencias",
    headers: com(tokenHelena),
    payload: {
      solicitanteNome: "Marilda Souza Prado",
      canalEntrada: "telefone",
      endereco: "Rua das Acácias, 245",
      tipo: "deslizamento",
      descricao: "Talude cedeu depois da chuva da madrugada.",
    },
  });
  expect(criada.statusCode, criada.body).toBe(201);
  idOcorrenciaA = criada.json().id as string;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await appSemMinimo?.close();
  await mem?.banco.encerrar();
});

describe("Positivos: o que passa", () => {
  it("campo/1.4.0 com mínimo 1.3.0 passa", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "campo/1.4.0"),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("a versão igual ao mínimo passa", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "campo/1.3.0"),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o pré-lançamento não conta: campo/1.3.0-beta.1 é 1.3.0 e passa", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "campo/1.3.0-beta.1"),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o painel manda a build e nunca é recusado, nem com mínimo alto", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "painel/a1b2c3d"),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("cada aplicativo tem o seu mínimo: campo/1.9.0 passa mesmo com o mínimo do cidadão em 2.0.0", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "campo/1.9.0"),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("mínimo vazio (o padrão) não recusa versão nenhuma", async () => {
    for (const versao of ["campo/0.0.1", "cidadao/0.0.1", "campo/1.2.0"]) {
      const r = await appSemMinimo.inject({
        method: "GET",
        url: "/v1/ocorrencias",
        headers: com(tokenHelena, versao),
      });
      expect(r.statusCode, versao).toBe(200);
    }
  });

  it("a rota pública responde sem token, com o mínimo de cada aplicativo", async () => {
    const campo = await app.inject({ method: "GET", url: "/v1/aplicativos/campo/versao-minima" });
    expect(campo.statusCode, campo.body).toBe(200);
    expect(campo.json()).toEqual({ aplicativo: "campo", versaoMinima: "1.3.0" });
    const cidadao = await app.inject({
      method: "GET",
      url: "/v1/aplicativos/cidadao/versao-minima",
    });
    expect(cidadao.json()).toEqual({ aplicativo: "cidadao", versaoMinima: "2.0.0" });
  });

  it("sem mínimo configurado a rota pública devolve null", async () => {
    const r = await appSemMinimo.inject({
      method: "GET",
      url: "/v1/aplicativos/campo/versao-minima",
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ aplicativo: "campo", versaoMinima: null });
  });

  it("a rota pública responde mesmo para o aplicativo que seria recusado (é por ela que ele descobre o que instalar)", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/aplicativos/campo/versao-minima",
      headers: { "x-app-version": "campo/0.0.1" },
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o CORS libera x-app-version para a origem do painel", async () => {
    const r = await app.inject({
      method: "OPTIONS",
      url: "/v1/ocorrencias",
      headers: {
        origin: ORIGEM_DO_PAINEL,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,x-app-version",
      },
    });
    expect(r.statusCode).toBe(204);
    const liberados = String(r.headers["access-control-allow-headers"] ?? "").toLowerCase();
    expect(liberados).toContain("x-app-version");
  });
});

describe("Negativos: o 426", () => {
  it("campo/1.2.0 com mínimo 1.3.0 recebe 426 em POST /v1/sincronizacao/vistoria", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/sincronizacao/vistoria",
      headers: com(tokenHelena, "campo/1.2.0"),
      payload: { qualquer: "coisa" },
    });
    expect(r.statusCode, r.body).toBe(426);
    expect(r.json()).toEqual({
      erro: "versao_do_aplicativo_antiga",
      mensagem: expect.stringContaining("1.3.0"),
      versaoMinima: "1.3.0",
    });
    expect(r.json().mensagem).not.toContain(String.fromCharCode(0x2014));
  });

  it("o 426 do cidadão cita o mínimo do cidadão", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "cidadao/1.9.9"),
    });
    expect(r.statusCode).toBe(426);
    expect(r.json().versaoMinima).toBe("2.0.0");
  });

  it("o 426 vem ANTES do 401: sem token e com versão antiga é 426; sem token e sem versão é 401", async () => {
    const velha = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: { "x-app-version": "campo/1.2.0" },
    });
    expect(velha.statusCode).toBe(426);
    const semVersao = await app.inject({ method: "GET", url: "/v1/ocorrencias" });
    expect(semVersao.statusCode).toBe(401);
  });

  it("o 426 vem antes da validação do corpo: login com corpo vazio e versão antiga é 426, não 422", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/auth/entrar",
      headers: { "x-app-version": "campo/1.0.0" },
      payload: {},
    });
    expect(r.statusCode).toBe(426);
  });

  it("o 426 não é cacheado e leva o id da requisição, como toda resposta", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: { "x-app-version": "campo/1.2.0" },
    });
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-request-id"]).toBeTruthy();
  });

  it("a recusa vale só em /v1: o espelho e a infraestrutura atendem a mesma versão antiga", async () => {
    const espelho = await app.inject({
      method: "GET",
      url: "/ocorrencias",
      headers: com(tokenHelena, "campo/1.2.0"),
    });
    expect(espelho.statusCode, espelho.body).toBe(200);
    const saude = await app.inject({
      method: "GET",
      url: "/saude",
      headers: { "x-app-version": "campo/1.2.0" },
    });
    expect(saude.statusCode).toBe(200);
  });
});

describe("Cabeçalho ausente ou malformado: aceito, nunca 500", () => {
  const malformados = [
    "campo",
    "campo/",
    "/1.2.0",
    "robo/0.0.1",
    "campo/abc",
    "campo/1.2",
    "campo/1.2.0/extra",
    "campo 1.2.0",
    "campo/1.2.0, campo/1.0.0",
    "   ",
    `campo/${"1".repeat(5000)}`,
    "çampo/1.2.0",
  ];

  it.each(malformados)("%s é ignorado e o pedido segue (200, nem 426 nem 500)", async (valor) => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: { authorization: `Bearer ${tokenHelena}`, "x-app-version": valor },
    });
    expect(r.statusCode, `${valor.slice(0, 30)}: ${r.body.slice(0, 120)}`).toBe(200);
  });

  it("o cabeçalho repetido também é ignorado", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: {
        authorization: `Bearer ${tokenHelena}`,
        "x-app-version": ["campo/1.2.0", "campo/1.2.0"],
      },
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o cabeçalho ausente é aceito e CONTADO em log info, sem usuário, município, token nem endereço", async () => {
    linhas = [];
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena),
      remoteAddress: "203.0.113.77",
    });
    expect(r.statusCode).toBe(200);
    const contados = logs().filter((l) => l["evento"] === "versao_do_aplicativo");
    expect(contados).toHaveLength(1);
    const linha = contados[0]!;
    expect(linha["level"]).toBe(30); // info
    expect(linha["situacao"]).toBe("ausente");
    expect(linha["rota"]).toBe("/v1/ocorrencias");
    const texto = JSON.stringify(linha);
    expect(texto).not.toContain(tokenHelena);
    expect(texto).not.toContain("203.0.113.77");
    expect(texto).not.toContain(EMAIL_HELENA);
    expect(texto).not.toMatch(/organizacao|usuario|authorization/i);
  });

  it("o cabeçalho ilegível é contado como ilegível, sem repetir o valor no log", async () => {
    linhas = [];
    await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: { authorization: `Bearer ${tokenHelena}`, "x-app-version": "robo/9.9.9-segredo" },
    });
    const contados = logs().filter((l) => l["evento"] === "versao_do_aplicativo");
    expect(contados).toHaveLength(1);
    expect(contados[0]!["situacao"]).toBe("ilegivel");
    expect(JSON.stringify(contados[0])).not.toContain("segredo");
  });

  it("a versão legível não gera linha de contagem em /v1", async () => {
    linhas = [];
    await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena, "campo/1.4.0"),
    });
    expect(logs().filter((l) => l["evento"] === "versao_do_aplicativo")).toHaveLength(0);
  });
});

describe("Isolamento entre municípios", () => {
  it("o 426 é o mesmo para um id real de A e para um id falso (não confirma que o recurso existe)", async () => {
    const real = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenB, "campo/1.2.0"),
    });
    const falso = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${ID_FALSO}`,
      headers: com(tokenB, "campo/1.2.0"),
    });
    expect(real.statusCode).toBe(426);
    expect(falso.statusCode).toBe(426);
    expect(real.json()).toEqual(falso.json());
    expect(real.body).not.toContain(idOcorrenciaA);
  });

  it("o 426 não varia com o município: o mesmo corpo para o token de A, o de B e nenhum token", async () => {
    const corpos = await Promise.all(
      [
        com(tokenHelena, "campo/1.2.0"),
        com(tokenB, "campo/1.2.0"),
        { "x-app-version": "campo/1.2.0" },
      ].map(
        async (headers) =>
          (await app.inject({ method: "GET", url: "/v1/ocorrencias", headers })).body,
      ),
    );
    expect(new Set(corpos).size).toBe(1);
  });

  it("com versão aceita, o token do município B contra recurso de A segue 404", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenB, "campo/1.4.0"),
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");
  });

  it("a rota pública não devolve nada de município nem de pessoa (só aplicativo e versão)", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/aplicativos/campo/versao-minima" });
    expect(Object.keys(r.json()).sort()).toEqual(["aplicativo", "versaoMinima"]);
  });
});

describe("A rota de versão mínima só existe em /v1 e só para quem tem mínimo", () => {
  it("o espelho não a tem (404) e a paridade a declara só em /v1", async () => {
    const r = await app.inject({ method: "GET", url: "/aplicativos/campo/versao-minima" });
    expect(r.statusCode).toBe(404);
    expect(ROTAS_SO_NO_V1.has("GET /v1/aplicativos/:aplicativo/versao-minima")).toBe(true);
    const registradas = rotasRegistradas(app).map((x) => `${x.metodo} ${x.caminho}`);
    expect(registradas).toContain("GET /v1/aplicativos/:aplicativo/versao-minima");
    expect(registradas).not.toContain("GET /aplicativos/:aplicativo/versao-minima");
  });

  it("aplicativo sem mínimo (painel) ou desconhecido responde 404 nao_encontrado", async () => {
    for (const nome of ["painel", "robo", "constructor", "__proto__"]) {
      const r = await app.inject({ method: "GET", url: `/v1/aplicativos/${nome}/versao-minima` });
      expect(r.statusCode, nome).toBe(404);
      expect(r.json().erro, nome).toBe("nao_encontrado");
    }
  });
});

describe("Configuração", () => {
  it("VERSAO_MINIMA_CAMPO e VERSAO_MINIMA_CIDADAO nascem vazias (sem mínimo)", () => {
    const c = configDe();
    expect(c.VERSAO_MINIMA_CAMPO).toBeUndefined();
    expect(c.VERSAO_MINIMA_CIDADAO).toBeUndefined();
  });

  it("vazia no ambiente é o mesmo que ausente", () => {
    const c = configDe({ VERSAO_MINIMA_CAMPO: "", VERSAO_MINIMA_CIDADAO: "" });
    expect(c.VERSAO_MINIMA_CAMPO).toBeUndefined();
    expect(c.VERSAO_MINIMA_CIDADAO).toBeUndefined();
  });

  it("um mínimo que não é maior.menor.correção derruba a partida (erro de digitação não desliga a recusa em silêncio)", () => {
    for (const ruim of ["1.3", "v1.3.0", "1.3.0-beta", "abc", "1.3.x", "1.3.0.1"]) {
      expect(() => configDe({ VERSAO_MINIMA_CAMPO: ruim }), ruim).toThrow(/VERSAO_MINIMA_CAMPO/);
      expect(() => configDe({ VERSAO_MINIMA_CIDADAO: ruim }), ruim).toThrow(
        /VERSAO_MINIMA_CIDADAO/,
      );
    }
  });
});
