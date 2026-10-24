import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import type { Banco } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { ehIdDeRequisicao, idDeRequisicaoRecebido } from "../src/observabilidade/id-de-requisicao.js";
import type { ContextoDoErro, ReportadorDeErros } from "../src/observabilidade/reportador.js";

/**
 * O ID DE REQUISIÇÃO (V2-F01-E14, OPS-33).
 *
 * Antes: o id só chegava ao log, ninguém o via e nenhum teste o afirmava. Agora
 * toda resposta o devolve em `X-Request-Id`, o 500 o repete no corpo como código
 * de suporte, e um id de ENTRADA só vale se for UUID.
 *
 * O perigo do id de entrada é a injeção: ele entra em toda linha de log da
 * requisição e volta num cabeçalho. Texto livre ali é `\n` mais um falso
 * registro, ou um cabeçalho forjado. Por isso os casos negativos são o centro
 * deste arquivo.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_DO_CLIENTE = "3f2b8c1e-5a47-4d0e-9b61-7c2d4e8f1a90";
const ORIGEM_DO_PAINEL = "http://localhost:4691";

describe("idDeRequisicaoRecebido (a regra pura)", () => {
  it("aceita UUID e devolve em minúsculas", () => {
    expect(idDeRequisicaoRecebido(ID_DO_CLIENTE)).toBe(ID_DO_CLIENTE);
    expect(idDeRequisicaoRecebido(ID_DO_CLIENTE.toUpperCase())).toBe(ID_DO_CLIENTE);
    expect(ehIdDeRequisicao(ID_DO_CLIENTE)).toBe(true);
  });

  it("negativo: descarta tudo o que não é UUID, inclusive o que carrega quebra de linha", () => {
    const hostis: unknown[] = [
      undefined, null, "", " ", "abc", "x".repeat(200), `${ID_DO_CLIENTE}\n`,
      `${ID_DO_CLIENTE}\r\nx-falso: 1`, `\n${ID_DO_CLIENTE}`, ` ${ID_DO_CLIENTE}`,
      `${ID_DO_CLIENTE}, ${ID_DO_CLIENTE}`, `${ID_DO_CLIENTE}x`, ID_DO_CLIENTE.replaceAll("-", ""),
      "{\"level\":60,\"msg\":\"registro falso\"}", "<script>alert(1)</script>",
      [ID_DO_CLIENTE], [ID_DO_CLIENTE, ID_DO_CLIENTE], 12345, {},
    ];
    for (const hostil of hostis) {
      expect(idDeRequisicaoRecebido(hostil), JSON.stringify(hostil)).toBeNull();
    }
  });
});

describe("X-Request-Id na API", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let linhas: string[] = [];
  const coletor = { write: (linha: string) => { linhas.push(linha); } };

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: false });
    app = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
        ORIGENS_PERMITIDAS: ORIGEM_DO_PAINEL,
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      destinoDeLog: coletor,
    });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  it("sem cabeçalho, a resposta traz um UUID novo, e cada pedido ganha o seu", async () => {
    const a = await app.inject({ method: "GET", url: "/saude" });
    const b = await app.inject({ method: "GET", url: "/saude" });
    expect(a.statusCode).toBe(200);
    expect(a.headers["x-request-id"]).toMatch(UUID);
    expect(b.headers["x-request-id"]).toMatch(UUID);
    expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
  });

  it("com um UUID válido, a API o adota e o devolve", async () => {
    const r = await app.inject({
      method: "GET", url: "/saude", headers: { "x-request-id": ID_DO_CLIENTE },
    });
    expect(r.headers["x-request-id"]).toBe(ID_DO_CLIENTE);
  });

  it("o id adotado é o que aparece no log da requisição", async () => {
    linhas = [];
    await app.inject({ method: "GET", url: "/saude", headers: { "x-request-id": ID_DO_CLIENTE } });
    const registros = linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(registros.length).toBeGreaterThan(0);
    expect(registros.every((r) => r["reqId"] === ID_DO_CLIENTE)).toBe(true);
  });

  it("negativo: id com quebra de linha ou de 200 caracteres é descartado e substituído", async () => {
    const hostis = [
      `${ID_DO_CLIENTE}\nX-Falso: 1`,
      "falso\n{\"level\":60,\"msg\":\"registro forjado\"}",
      "x".repeat(200),
      "nao-e-uuid",
    ];
    for (const hostil of hostis) {
      linhas = [];
      const r = await app.inject({
        method: "GET", url: "/saude", headers: { "x-request-id": hostil },
      });
      const devolvido = r.headers["x-request-id"];
      expect(devolvido, JSON.stringify(hostil)).toMatch(UUID);
      expect(devolvido).not.toBe(hostil);
      // Nada do que o cliente mandou chega ao log.
      expect(linhas.join("\n")).not.toContain("registro forjado");
      expect(linhas.join("\n")).not.toContain("x".repeat(50));
      // E cada linha do log continua sendo um JSON de uma linha só.
      for (const linha of linhas) expect(() => JSON.parse(linha)).not.toThrow();
    }
  });

  it("toda resposta devolve o id: 401 e 404 incluídos", async () => {
    const semToken = await app.inject({ method: "GET", url: "/ocorrencias" });
    expect(semToken.statusCode).toBe(401);
    expect(semToken.headers["x-request-id"]).toMatch(UUID);

    const inexistente = await app.inject({ method: "GET", url: "/rota-que-nao-existe" });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.headers["x-request-id"]).toMatch(UUID);
  });

  it("o navegador pode ler o cabeçalho: ele está em access-control-expose-headers", async () => {
    const r = await app.inject({
      method: "GET", url: "/saude", headers: { origin: ORIGEM_DO_PAINEL },
    });
    expect(String(r.headers["access-control-expose-headers"]).toLowerCase()).toContain("x-request-id");
    expect(r.headers["x-request-id"]).toMatch(UUID);
  });

  it("negativo: origem fora da lista continua sem liberação de CORS", async () => {
    const r = await app.inject({
      method: "GET", url: "/saude", headers: { origin: "http://painel-falso.exemplo" },
    });
    // O `expose-headers` sai igual, e é inofensivo: sem `allow-origin` o navegador
    // recusa a resposta inteira, e o cabeçalho nunca chega a quem não é o painel.
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("o 500 e o banco fora do ar", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let linhas: string[] = [];
  const eventos: Array<{ erro: unknown; contexto: ContextoDoErro }> = [];
  const coletor = { write: (linha: string) => { linhas.push(linha); } };
  const reportador: ReportadorDeErros = {
    reportar: (erro, contexto) => { eventos.push({ erro, contexto }); },
  };
  const TOKEN_DE_OUTRO_MUNICIPIO = "eyJhbGciOiJIUzI1NiJ9.eyJvcmciOiJvdXRybyJ9.assinatura-secreta-do-token";
  const EMAIL_DE_OUTRO_MUNICIPIO = "servidora.de.outro.municipio@prefeitura-vizinha.gov.br";

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: false });
    // Banco que cai: toda consulta lança um erro cuja mensagem carrega dado
    // pessoal, como a de um driver que ecoa o valor que violou uma restrição.
    const falha = () => Promise.reject(
      new Error(`falha para ${EMAIL_DE_OUTRO_MUNICIPIO} com Bearer ${TOKEN_DE_OUTRO_MUNICIPIO}`),
    );
    const bancoQueCai: Banco = {
      ...mem.banco,
      semTenant: falha,
      comTenant: falha,
    } as Banco;
    app = await construirServidor({
      banco: bancoQueCai,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      destinoDeLog: coletor,
    });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  it("negativo: banco fora do ar dá 503 em /saude, com o id na resposta e sem detalhe do erro", async () => {
    const r = await app.inject({ method: "GET", url: "/saude", headers: { "x-request-id": ID_DO_CLIENTE } });
    expect(r.statusCode).toBe(503);
    expect(r.headers["x-request-id"]).toBe(ID_DO_CLIENTE);
    expect(r.body).not.toContain("prefeitura-vizinha");
    expect(r.json()).toEqual({ status: "indisponivel", banco: "indisponivel" });
  });

  it("o 500 repete o id no corpo e no cabeçalho, e o log sai em nível error com o mesmo id", async () => {
    linhas = [];
    const r = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "agente@prefeitura.gov.br", senha: "uma-senha-qualquer" },
      headers: { "x-request-id": ID_DO_CLIENTE },
    });
    expect(r.statusCode).toBe(500);
    expect(r.headers["x-request-id"]).toBe(ID_DO_CLIENTE);
    expect(r.json().requisicao).toBe(ID_DO_CLIENTE);
    expect(r.json().erro).toBe("erro_interno");
    // A mensagem do 500 nunca repete a do banco.
    expect(r.body).not.toContain("prefeitura-vizinha");

    const registros = linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
    const doErro = registros.filter((x) => x["level"] === 50 && x["msg"] === "erro nao tratado");
    expect(doErro.length).toBe(1);
    expect(doErro[0]!["requisicao"]).toBe(ID_DO_CLIENTE);
    expect(doErro[0]!["origem"]).toBe("http");
    expect(doErro[0]!["status"]).toBe(500);
  });

  it("autorização e isolamento: nem o log nem o evento carregam o token, o e-mail ou a barra de endereço", async () => {
    linhas = [];
    const r = await app.inject({
      method: "POST", url: "/auth/entrar?token=segredo-na-query&email=quem@ninguem.org",
      payload: { email: "agente@prefeitura.gov.br", senha: "outra-senha-qualquer" },
      headers: { authorization: `Bearer ${TOKEN_DE_OUTRO_MUNICIPIO}`, cookie: "sid=cookie-secreto" },
    });
    expect(r.statusCode).toBe(500);
    const tudo = linhas.join("\n");
    expect(tudo).not.toContain(TOKEN_DE_OUTRO_MUNICIPIO);
    expect(tudo).not.toContain("assinatura-secreta-do-token");
    expect(tudo).not.toContain(EMAIL_DE_OUTRO_MUNICIPIO);
    expect(tudo).not.toContain("cookie-secreto");
    expect(tudo).not.toContain("segredo-na-query");
    expect(tudo).not.toContain("uma-senha-qualquer");
    expect(tudo).not.toContain("outra-senha-qualquer");
    // A mensagem do erro ficou, mascarada: o diagnóstico não se perde.
    expect(tudo).toContain("[email]");
  });

  it("o reportador injetado recebe o molde da rota e o id, e nunca a barra de endereço", async () => {
    const dono = await bancoEmMemoria({ semear: false });
    const falha = () => Promise.reject(new Error("falha"));
    const alvo = await construirServidor({
      banco: { ...dono.banco, semTenant: falha, comTenant: falha } as Banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      reportador,
    });
    await alvo.ready();
    eventos.length = 0;
    await alvo.inject({
      method: "POST", url: "/auth/entrar?x=1",
      payload: { email: "a@b.org", senha: "senha-qualquer-aqui" },
    });
    await alvo.close();
    await dono.banco.encerrar();
    expect(eventos).toHaveLength(1);
    const { contexto } = eventos[0]!;
    expect(contexto.origem).toBe("http");
    expect(contexto.requisicao).toMatch(UUID);
    expect(contexto.rota).toBe("/auth/entrar");
    expect(contexto.status).toBe(500);
    expect(JSON.stringify(contexto)).not.toContain("x=1");
  });
});
