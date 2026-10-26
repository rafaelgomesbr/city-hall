import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arquivoDoCaminho, criarServidor } from "../../docs/relatorios-v2/site/servidor.mjs";
import { RAIZ } from "./roadmap.mjs";

test("o caminho da URL vira arquivo dentro da pasta do site e nunca sai dela", () => {
  const raiz = join("/", "site");
  assert.match(arquivoDoCaminho("/progresso", raiz).replaceAll("\\", "/"), /site\/progresso\/index\.html$/);
  assert.match(arquivoDoCaminho("/progresso/decisoes/", raiz).replaceAll("\\", "/"), /site\/progresso\/decisoes\/index\.html$/);
  assert.match(arquivoDoCaminho("/progresso/img/a.jpg", raiz).replaceAll("\\", "/"), /site\/progresso\/img\/a\.jpg$/);
  assert.equal(arquivoDoCaminho("/progresso/../../etc/passwd", raiz), null);
  assert.equal(arquivoDoCaminho("/../servidor.mjs", raiz), null);
});

test("servidor: pede senha, entrega a página com a senha certa e recusa fora de /progresso", async () => {
  const raiz = mkdtempSync(join(tmpdir(), "progresso-"));
  mkdirSync(join(raiz, "progresso", "decisoes"), { recursive: true });
  writeFileSync(join(raiz, "progresso", "index.html"), "<title>Relatório</title>");
  writeFileSync(join(raiz, "progresso", "decisoes", "index.html"), "<title>Decisões</title>");
  writeFileSync(join(raiz, "segredo.txt"), "fora");
  // O middleware real é importado pelo servidor; aqui só garantimos que ele existe ao lado.
  cpSync(join(RAIZ, "docs", "relatorios-v2", "site", "middleware.js"), join(raiz, "middleware.js"));
  const antes = { senha: process.env.PROGRESSO_SENHA, segredo: process.env.PROGRESSO_SEGREDO };
  process.env.PROGRESSO_SENHA = "senha-so-de-teste";
  process.env.PROGRESSO_SEGREDO = "segredo-so-de-teste";
  const servidor = criarServidor({ raiz });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const basic = (s) => ({ Authorization: `Basic ${Buffer.from(`x:${s}`).toString("base64")}` });
  try {
    assert.equal((await fetch(`${base}/saude`)).status, 200);
    assert.equal((await fetch(`${base}/progresso/decisoes`)).status, 401);
    assert.equal((await fetch(`${base}/progresso/decisoes`, { headers: basic("errada") })).status, 401);
    const ok = await fetch(`${base}/progresso/decisoes`, { headers: basic("senha-so-de-teste") });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Decisões/);
    assert.equal(ok.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal((await fetch(`${base}/segredo.txt`, { headers: basic("senha-so-de-teste") })).status, 404);
    assert.equal((await fetch(`${base}/progresso/inexistente.html`, { headers: basic("senha-so-de-teste") })).status, 404);
    const entrar = await fetch(`${base}/progresso/entrar`, { method: "POST", body: new URLSearchParams({ senha: "senha-so-de-teste" }), redirect: "manual" });
    assert.equal(entrar.status, 303);
    assert.match(entrar.headers.get("set-cookie") ?? "", /progresso_sessao=.+HttpOnly/);
  } finally {
    await new Promise((ok) => servidor.close(ok));
    if (antes.senha === undefined) delete process.env.PROGRESSO_SENHA; else process.env.PROGRESSO_SENHA = antes.senha;
    if (antes.segredo === undefined) delete process.env.PROGRESSO_SEGREDO; else process.env.PROGRESSO_SEGREDO = antes.segredo;
  }
});
