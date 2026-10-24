/**
 * Testes de `conferir-saude-remota.mjs` (V2-F01-E12): a régua que diz, depois de
 * um deploy, se o que está no ar é a versão e o commit que o workflow queria.
 * Sem rede e sem relógio: `buscar` e `dormir` são de mentira.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  esperarSaude,
  lerArgumentos,
  principal,
  problemasDeUso,
} from "./conferir-saude-remota.mjs";

const COMMIT = "f14214f0b5a8c3d9e1a2b3c4d5e6f708192a3b4c";
const OUTRO = "0123456789abcdef0123456789abcdef01234567";
const ESPERADO = {
  url: "https://defesa-civil-hml.fly.dev",
  tipo: "api",
  versao: "0.1.0",
  commit: COMMIT,
  tentativas: 3,
  espera: 1,
};

const saudeDaApi = (extra = {}) =>
  JSON.stringify({ status: "ok", banco: "ok", versao: "0.1.0", commit: COMMIT, ...extra });
const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => corpo,
});

function ambiente(respostas) {
  const fila = [...respostas];
  const urls = [];
  const dormidas = [];
  const linhas = { log: [], error: [] };
  return {
    urls,
    dormidas,
    linhas,
    dependencias: {
      buscar: async (u) => {
        urls.push(u);
        const proxima = fila.length > 1 ? fila.shift() : fila[0];
        if (proxima instanceof Error) throw proxima;
        return proxima;
      },
      dormir: async (s) => {
        dormidas.push(s);
      },
      saida: { log: (m) => linhas.log.push(m), error: (m) => linhas.error.push(m) },
    },
  };
}

test("positivo: a versão e o commit certos passam na primeira tentativa, sem dormir", async () => {
  const a = ambiente([resposta(200, saudeDaApi())]);
  assert.equal(await esperarSaude(ESPERADO, a.dependencias), 0);
  assert.deepEqual(a.urls, ["https://defesa-civil-hml.fly.dev/saude"]);
  assert.deepEqual(a.dormidas, []);
});

test("positivo: espera a troca de máquina (503, depois o commit antigo, depois o novo)", async () => {
  const a = ambiente([
    resposta(503, "{}"),
    resposta(200, saudeDaApi({ commit: OUTRO })),
    resposta(200, saudeDaApi()),
  ]);
  assert.equal(await esperarSaude(ESPERADO, a.dependencias), 0);
  assert.equal(a.urls.length, 3);
  assert.deepEqual(a.dormidas, [1, 1]);
});

test("positivo: o console responde no formato dele ({ ok: true })", async () => {
  const a = ambiente([
    resposta(200, JSON.stringify({ ok: true, versao: "0.1.0", commit: COMMIT })),
  ]);
  assert.equal(await esperarSaude({ ...ESPERADO, tipo: "console" }, a.dependencias), 0);
});

test("negativo: o commit antigo no ar depois das tentativas reprova (o deploy 'deu certo' e a imagem não trocou)", async () => {
  const a = ambiente([resposta(200, saudeDaApi({ commit: OUTRO }))]);
  assert.equal(await esperarSaude(ESPERADO, a.dependencias), 1);
  assert.equal(a.urls.length, 3);
  assert.match(a.linhas.error.join("\n"), /commit é .* e o build passou/);
});

test("negativo: banco fora, versão errada, HTTP 500, corpo que não é JSON e rede caída reprovam", async () => {
  const casos = [
    [resposta(200, saudeDaApi({ banco: "falha" })), /banco/],
    [resposta(200, saudeDaApi({ versao: "9.9.9" })), /versao/],
    [resposta(500, "erro"), /HTTP 500/],
    [resposta(200, "<html>"), /não é JSON/],
    [
      Object.assign(new Error("falhou"), { name: "TypeError", cause: { code: "ECONNREFUSED" } }),
      /ECONNREFUSED/,
    ],
  ];
  for (const [entrada, esperado] of casos) {
    const a = ambiente([entrada]);
    assert.equal(await esperarSaude(ESPERADO, a.dependencias), 1);
    assert.match(a.linhas.error.join("\n"), esperado);
  }
});

test("autorização: o URL tem de ser https e sem caminho, o commit tem de ser completo", () => {
  const bom = { tipo: "api", url: "https://defesa-civil.fly.dev", versao: "0.1.0", commit: COMMIT };
  assert.deepEqual(problemasDeUso(bom), []);
  assert.equal(problemasDeUso({ ...bom, url: "http://defesa-civil.fly.dev" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, url: "https://defesa-civil.fly.dev/" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, url: "https://x.fly.dev/saude" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, commit: "f14214f" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, versao: "1.0" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, tipo: "painel" }).length, 1);
  assert.equal(problemasDeUso({ ...bom, tentativas: "0" }).length, 1);
});

test("principal: uso errado devolve 2 sem tocar a rede, e argumento sem --chave=valor também", async () => {
  const a = ambiente([resposta(200, saudeDaApi())]);
  assert.equal(await principal(["--tipo=api"], a.dependencias), 2);
  assert.equal(await principal(["api"], a.dependencias), 2);
  assert.deepEqual(a.urls, []);
  assert.deepEqual(lerArgumentos(["--a=1", "--b-c=x=y"]), { a: "1", "b-c": "x=y" });
  const completo = [
    "--tipo=api",
    `--url=${ESPERADO.url}`,
    "--versao=0.1.0",
    `--commit=${COMMIT}`,
    "--tentativas=2",
    "--espera=1",
  ];
  assert.equal(await principal(completo, a.dependencias), 0);
});
