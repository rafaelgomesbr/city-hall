import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { rotasRegistradas } from "./apoio/rotas.js";
import { ehSemToken, SEM_TOKEN } from "./superficie-registrada.js";

/**
 * A superfície da API, descoberta e não listada.
 *
 * O erro que este arquivo existe para impedir é banal e caro: alguém adiciona
 * uma rota nova e esquece `exigirAutenticacao`. Nenhum teste de funcionalidade
 * pega isso, porque a rota funciona perfeitamente; ela só funciona para
 * qualquer um.
 *
 * Em vez de manter uma lista de rotas que precisam de token (que ficaria
 * desatualizada na primeira pressa), o teste enumera as rotas de verdade e
 * exige token de TODAS, com uma isenção explícita e curta. A lista de isenções
 * (`SEM_TOKEN`) mora em `superficie-registrada.ts` e a leitura da árvore
 * (`rotasRegistradas`) em `apoio/rotas.ts`, que o contrato do painel e o
 * contrato de cliente x rota também usam.
 */

let mem: BancoEmMemoria;
let app: FastifyInstance;

/** Preenche `:id` com um uuid válido: o teste é de autenticação, não de rota. */
function comParametros(caminho: string): string {
  return caminho.replace(/:[A-Za-z]+/g, "00000000-0000-4000-8000-000000000000");
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-superficie-com-mais-de-32-bytes-x",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Toda rota exige token", () => {
  it("encontra a árvore de rotas do servidor montado", () => {
    const rotas = rotasRegistradas(app);
    // Se a leitura da árvore quebrar numa atualização do Fastify, o teste
    // inteiro passaria vazio e ninguém notaria. Este caso é a âncora.
    expect(rotas.length).toBeGreaterThan(15);
    expect(rotas.some((r) => r.caminho.includes("ocorrencias"))).toBe(true);
  });

  it("nenhuma rota nova responde sem autenticação", async () => {
    const desprotegidas: string[] = [];

    for (const rota of rotasRegistradas(app)) {
      const chave = `${rota.metodo} ${rota.caminho}`;
      if (ehSemToken(chave)) continue;

      const r = await app.inject({
        method: rota.metodo as "GET",
        url: comParametros(rota.caminho),
        payload: rota.metodo === "GET" ? undefined : {},
      });

      /*
        401, e SÓ 401.

        Antes isto aceitava qualquer coisa de 400 para cima menos 403, com o
        argumento de que 404 e 422 também provam que nada foi entregue. O
        argumento está certo sobre o vazamento e errado sobre o que este
        portão existe para pegar: uma rota INTENCIONALMENTE pública responde
        422 a um corpo vazio, exatamente como uma protegida responderia se a
        validação rodasse antes da autenticação. As duas ficavam
        indistinguíveis, e foi assim que a rota do formulário público entrou
        sem ser declarada aqui.

        Numa rota protegida deste produto, a autenticação roda ANTES do
        `parse`, então corpo vazio devolve 401. Exigir 401 é exigir que a
        autenticação tenha acontecido, que é a pergunta que interessa.
      */
      if (r.statusCode !== 401) {
        desprotegidas.push(`${chave} respondeu ${r.statusCode}, e não 401`);
      }
    }

    expect(
      desprotegidas,
      "rota respondendo sem token; se for intencional, declare em SEM_TOKEN com a razão",
    ).toEqual([]);
  }, 120_000);

  it("a lista de isenções não tem entrada morta", () => {
    // Isenção que sobra depois de a rota sumir vira permissão pendurada
    // esperando alguém recriar a rota com o mesmo nome.
    const existentes = new Set(rotasRegistradas(app).map((r) => `${r.metodo} ${r.caminho}`));
    for (const chave of SEM_TOKEN.keys()) {
      expect(existentes.has(chave), `isenção para rota inexistente: ${chave}`).toBe(true);
    }
  });

  it("toda isenção tem razão escrita", () => {
    for (const [chave, razao] of SEM_TOKEN) {
      expect(razao.length, `isenção sem razão: ${chave}`).toBeGreaterThan(10);
    }
  });
});

describe("Respostas não vazam estrutura interna", () => {
  it("erro de rota inexistente não descreve o servidor", async () => {
    const r = await app.inject({ method: "GET", url: "/nao-existe-esta-rota" });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toMatch(/fastify|node_modules|at \//i);
  });

  it("token adulterado devolve a mesma coisa que token ausente", async () => {
    const sem = await app.inject({ method: "GET", url: "/ocorrencias" });
    const falso = await app.inject({
      method: "GET", url: "/ocorrencias",
      headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.assinaturaFalsa" },
    });

    expect(sem.statusCode).toBe(401);
    expect(falso.statusCode).toBe(401);
    // Mensagens diferentes contariam a um atacante se o formato do token está
    // certo, que é meio caminho para forjar um.
    expect(falso.json().erro).toBe(sem.json().erro);
  });

  it("cabeçalhos de segurança em toda resposta, inclusive nas de erro", async () => {
    for (const url of ["/saude", "/ocorrencias", "/nao-existe"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.headers["x-content-type-options"], url).toBe("nosniff");
      expect(r.headers["content-security-policy"], url).toContain("default-src 'none'");
    }
  });

  it("no-store em toda resposta, para o cache não guardar dado de família", async () => {
    // O caso concreto é o computador compartilhado da recepção: sem no-store,
    // o "voltar" do navegador reabre a ocorrência da família anterior a partir
    // do cache de disco. Vale até para o 404, que não carrega dado, porque a
    // garantia é do hook global e não pode depender de a rota lembrar.
    for (const url of ["/ocorrencias", "/saude", "/nao-existe"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.headers["cache-control"], url).toBe("no-store");
    }
  });

  it("não anuncia qual servidor está rodando", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    // Versão de servidor no cabeçalho é presente para quem procura CVE.
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(String(r.headers["server"] ?? "")).not.toMatch(/fastify|node/i);
  });
});
