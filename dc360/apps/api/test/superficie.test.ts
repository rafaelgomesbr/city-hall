import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

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
 * exige token de TODAS, com uma isenção explícita e curta.
 */

let mem: BancoEmMemoria;
let app: FastifyInstance;

/**
 * As únicas rotas que podem responder sem token, cada uma com a razão.
 *
 * Acrescentar algo aqui é uma decisão de segurança, e é por isso que a lista
 * é de exceções e não de regras: exceção alguém revisa, regra alguém esquece.
 */
const SEM_TOKEN = new Map<string, string>([
  ["GET /saude", "sonda do balanceador, e não devolve dado de município"],
  ["POST /auth/entrar", "é o que entrega o token"],
  ["POST /auth/renovar", "autentica pelo próprio token de renovação"],
  ["POST /auth/sair", "revoga pelo token de renovação, sem precisar do de acesso"],
  ["POST /auth/recuperar", "quem esqueceu a senha não tem token"],
  ["POST /auth/redefinir", "autentica pelo link de uso único"],
  ["PUT /armazenamento/objeto", "autenticado pela assinatura embutida na URL"],
  ["GET /armazenamento/objeto", "autenticado pela assinatura embutida na URL"],
]);

type Rota = { metodo: string; caminho: string };

/**
 * Lê a árvore de rotas do próprio Fastify.
 *
 * `printRoutes` é a única forma pública de enumerar o que foi registrado, e é
 * justamente por vir do servidor montado que ela não pode ficar desatualizada.
 */
function rotasRegistradas(instancia: FastifyInstance): Rota[] {
  const arvore = instancia.printRoutes({ commonPrefix: false });
  const rotas: Rota[] = [];

  for (const linha of arvore.split("\n")) {
    const casou = /^[\s│├└─]*(\S+)\s+\((.+?)\)\s*$/.exec(linha);
    if (!casou) continue;
    const caminho = casou[1]!;
    for (const metodo of casou[2]!.split(",").map((m) => m.trim())) {
      if (metodo === "HEAD" || metodo === "OPTIONS") continue;
      rotas.push({ metodo, caminho });
    }
  }
  return rotas;
}

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
      if (SEM_TOKEN.has(chave)) continue;

      const r = await app.inject({
        method: rota.metodo as "GET",
        url: comParametros(rota.caminho),
        payload: rota.metodo === "GET" ? undefined : {},
      });

      /*
        401 é o esperado. 404 e 422 também servem como prova de que a rota não
        entregou nada: o que reprova é 2xx, e 403, que significaria ter passado
        pela autenticação e parado só na permissão.
      */
      if (r.statusCode < 400 || r.statusCode === 403) {
        desprotegidas.push(`${chave} respondeu ${r.statusCode}`);
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

  it("não anuncia qual servidor está rodando", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    // Versão de servidor no cabeçalho é presente para quem procura CVE.
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(String(r.headers["server"] ?? "")).not.toMatch(/fastify|node/i);
  });
});
