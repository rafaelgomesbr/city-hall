import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { caminhos, comandosDeGeracao, diasAntes, hojeEmSaoPaulo } from "./publicar-progresso.mjs";

test("hoje em São Paulo respeita o fuso (meia-noite UTC ainda é o dia anterior)", () => {
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-14T02:30:00Z")), "2026-10-13");
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-14T12:00:00Z")), "2026-10-14");
});

test("diasAntes volta o número de dias, atravessando mês e ano", () => {
  assert.equal(diasAntes("2026-10-13", 7), "2026-10-06");
  assert.equal(diasAntes("2027-01-03", 7), "2026-12-27");
});

test("os três comandos rodam na ordem coleta, estimativa e página, com os caminhos do site", () => {
  const raiz = join("/", "repo");
  const cmds = comandosDeGeracao({ hoje: "2026-10-13", raiz });
  assert.deepEqual(cmds.map((c) => c.rotulo), ["coleta", "estimativa", "página"]);
  const c = caminhos(raiz);
  const pagina = cmds[2].args;
  assert.ok(pagina.includes(c.pagina));
  assert.ok(pagina.includes("--sem-indexar"));
  assert.equal(pagina[pagina.indexOf("--link-de-saida") + 1], "/progresso/sair");
  assert.equal(pagina[pagina.indexOf("--imagens-externas") + 1], "/progresso/img");
  assert.equal(pagina[pagina.indexOf("--pasta-de-imagens") + 1], c.imagens);
  assert.equal(cmds[0].args[cmds[0].args.indexOf("--desde") + 1], "2026-10-06");
  assert.equal(cmds[1].args[cmds[1].args.indexOf("--hoje") + 1], "2026-10-13");
});

test("a senha nunca aparece em nenhum arquivo do site nem nos comandos", async () => {
  const { readFileSync } = await import("node:fs");
  const { RAIZ } = await import("./roadmap.mjs");
  for (const arquivo of ["middleware.js", "vercel.json", "package.json"]) {
    const texto = readFileSync(join(RAIZ, "docs", "relatorios-v2", "site", arquivo), "utf8");
    assert.doesNotMatch(texto, /defesacivil/i, arquivo);
  }
  assert.doesNotMatch(JSON.stringify(comandosDeGeracao({ hoje: "2026-10-13" })), /defesacivil/i);
  const mw = readFileSync(join(RAIZ, "docs", "relatorios-v2", "site", "middleware.js"), "utf8");
  assert.match(mw, /process\.env\.PROGRESSO_SENHA/);
  assert.match(mw, /process\.env\.PROGRESSO_SEGREDO/);
  assert.match(mw, /HttpOnly; Secure; SameSite=Lax/);
});
