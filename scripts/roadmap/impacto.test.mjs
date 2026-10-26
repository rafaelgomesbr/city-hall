import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { RAIZ_REAL, executarCli } from "./apoio-de-teste.mjs";
import {
  arquivosEntre,
  casa,
  dimensaoToca,
  formatarImpacto,
  globParaRegex,
  herdavel,
  impactoDoDiff,
  lerCabecalho,
  lerMapa,
  padroesDaDimensao,
} from "./impacto.mjs";
import { blocoDoGate } from "./roadmap.mjs";
import { ORDEM_DE_RISCO, TAGS_EM_ORDEM } from "./tags.mjs";

const mapa = lerMapa(RAIZ_REAL);
const DC360 = join(RAIZ_REAL, "dc360");

/* ---------- Glob ---------- */

test("glob simples: ** atravessa pastas, * fica num nível, ? é um caractere", () => {
  const g = (p, c) => globParaRegex(p).test(c);
  assert.equal(g("dc360/apps/api/src/auth/**", "dc360/apps/api/src/auth/vigencia.ts"), true);
  assert.equal(g("dc360/apps/api/src/auth/**", "dc360/apps/api/src/auth/sub/x.ts"), true);
  assert.equal(g("dc360/apps/api/src/auth/**", "dc360/apps/api/src/servidor.ts"), false);
  assert.equal(g("dc360/**/test/**", "dc360/apps/api/test/api.test.ts"), true);
  assert.equal(g("dc360/**/test/**", "dc360/db/test/isolamento.test.ts"), true);
  assert.equal(g("dc360/**/test/**", "dc360/test/x.ts"), true, "** casa zero pastas");
  assert.equal(g("dc360/apps/*/package.json", "dc360/apps/api/package.json"), true);
  assert.equal(g("dc360/apps/*/package.json", "dc360/apps/api/src/package.json"), false);
  assert.equal(g("dc360/apps/api/src/rotas/armazenamento*.ts", "dc360/apps/api/src/rotas/armazenamento-local.ts"), true);
  assert.equal(g("a/b?.ts", "a/b1.ts"), true);
  assert.equal(g("a/b?.ts", "a/b12.ts"), false);
  assert.equal(g("dc360/README.md", "dc360/READMExmd"), false, "o ponto é literal");
  assert.equal(casa(["x/**", "y/**"], "y/z"), true);
});

/* ---------- O mapa em si ---------- */

test("mapa: ids únicos, tags conhecidas e todas as dimensões da política", () => {
  const ids = [...mapa.regras.map((r) => r.id), ...mapa.reabre_se.map((r) => r.id)];
  assert.equal(new Set(ids).size, ids.length, "id repetido");
  for (const r of mapa.regras) for (const t of r.tags) assert.ok(TAGS_EM_ORDEM.includes(t), `${r.id}: tag ${t}`);
  for (const [nome, d] of Object.entries(mapa.dimensoes)) for (const t of d.tags) assert.ok(TAGS_EM_ORDEM.includes(t), `${nome}: tag ${t}`);
  for (const v of ["qa", ...ORDEM_DE_RISCO]) assert.ok(mapa.dimensoes[v], `dimensão sem mapa: ${v}`);
  assert.deepEqual(mapa.sempre.suites, ["npm run typecheck", "npm run test:isolamento", "npm run conferir:numeros"]);
});

test("mapa: todo comando npm existe no package.json e todo arquivo de teste existe", () => {
  const scripts = JSON.parse(readFileSync(join(DC360, "package.json"), "utf8")).scripts;
  const suites = [...mapa.sempre.suites, ...mapa.regras.flatMap((r) => r.suites), ...mapa.reabre_se.flatMap((r) => r.suites)];
  for (const s of new Set(suites)) {
    if (s.startsWith("npm run ")) {
      const nome = s.slice("npm run ".length).split(/\s+/)[0];
      assert.ok(scripts[nome], `comando inexistente em dc360/package.json: ${s}`);
    } else if (s.startsWith("node --test ")) {
      assert.ok(existsSync(join(RAIZ_REAL, "scripts", "roadmap")), s);
    } else {
      assert.ok(existsSync(join(DC360, ...s.split("/"))), `arquivo de teste inexistente: ${s}`);
    }
  }
});

test("mapa: todo item de gate é o começo de um item real do G00", () => {
  const itens = blocoDoGate("G00", RAIZ_REAL).itens.map((i) => i.texto);
  const citados = [
    ...mapa.sempre.itens_de_gate,
    ...mapa.regras.flatMap((r) => r.itens_de_gate),
    ...mapa.reabre_se.flatMap((r) => r.itens_de_gate),
  ];
  for (const c of new Set(citados)) assert.ok(itens.some((t) => t.startsWith(c)), `item de gate que não existe no G00: "${c}"`);
});

test("mapa: seções do e2e são números inteiros e os arquivos existem", () => {
  for (const r of mapa.regras) {
    for (const [arquivo, secoes] of Object.entries(r.secoes_e2e)) {
      assert.ok(existsSync(join(DC360, "apps", "web", "test", arquivo)), `${r.id}: ${arquivo}`);
      if (secoes !== "todas") for (const n of secoes) assert.ok(Number.isInteger(n) && n > 0, `${r.id}: seção ${n}`);
    }
  }
});

test("mapa: as condições Reabre se do G00 estão todas ligadas a caminhos", () => {
  const reabre = blocoDoGate("G00", RAIZ_REAL).reabreSe;
  assert.ok(reabre.length > 0);
  assert.equal(mapa.reabre_se.length, 7, "o G00 tem sete condições");
  for (const r of mapa.reabre_se) {
    assert.equal(r.gate, "G00");
    assert.ok(r.padroes.length > 0 && r.itens_de_gate.length > 0, r.id);
    // A frase da condição aparece no texto do gate (sem a pontuação de borda).
    assert.ok(reabre.replaceAll("`", "").includes(r.condicao), `condição fora do texto do G00: ${r.id}`);
  }
});

/* ---------- Impacto de um diff ---------- */

test("diff de vigência e migração pede API, isolamento, migrar, e2e e itens de gate", () => {
  const i = impactoDoDiff(["dc360/apps/api/src/auth/vigencia.ts", "dc360/db/migrations/047_familia_da_sessao.sql", "dc360/apps/web/src/dados/http.ts"], mapa);
  // As de sempre vêm primeiro.
  assert.deepEqual(i.comandos.slice(0, 3), ["npm run typecheck", "npm run test:isolamento", "npm run conferir:numeros"]);
  for (const c of ["npm run test:api", "npm run migrar -- --conferir", "npm run test:e2e", "npm run test:e2e:api"]) assert.ok(i.comandos.includes(c), c);
  assert.ok(i.testes.includes("apps/api/test/vigencia-na-escrita.test.ts"));
  assert.ok(i.secoesE2e["fluxo-api.e2e.mjs"].includes(24));
  assert.deepEqual(i.secoesE2e["fluxo.e2e.mjs"], [2, 11]);
  assert.ok(i.itensDeGate.includes("Vigência de conta, papel e sessão ligada na escrita"));
  assert.ok(i.reabreSe.some((r) => r.id === "G00-vigencia-desligada"));
  assert.ok(i.reabreSe.some((r) => r.id === "G00-cliente-chama-caminho-inexistente"));
  for (const t of ["AUTH", "DB", "MIGRATION", "RLS", "UI"]) assert.ok(i.tags.includes(t), t);
  assert.equal(i.kitCompleto, false);
  assert.match(formatarImpacto(i), /Seções do e2e: .*fluxo-api\.e2e\.mjs: .*24/);
});

test("'todas' as seções vence a lista de números", () => {
  const i = impactoDoDiff(["dc360/apps/web/src/dados/http.ts", "dc360/apps/web/src/estilos/app.css"], mapa);
  assert.equal(i.secoesE2e["fluxo-api.e2e.mjs"], "todas");
  assert.equal(i.secoesE2e["fluxo.e2e.mjs"], "todas");
});

test("caminho do registro de validação não pede nada além do de sempre", () => {
  const i = impactoDoDiff(["docs/evidencias-v2/G00/V2-F00-E04/VEREDITO.md", "docs/evidencias-v2/G00/V2-F00-E04/validacao/99390e0/qa.md", "docs/roadmap-v2/STATUS.md", "docs/roadmap-v2/ESTADO-ATUAL.md"], mapa);
  assert.equal(i.naListaPermitida.length, 4);
  assert.deepEqual(i.comandos, mapa.sempre.suites);
  assert.deepEqual(i.testes, []);
  assert.equal(i.kitCompleto, false);
  assert.deepEqual(i.reabreSe, []);
});

test("caminho de produto que nenhuma regra conhece liga o kit completo", () => {
  const i = impactoDoDiff(["dc360/apps/novo-app/src/x.ts", "dc360/apps/api/src/auth/vigencia.ts"], mapa);
  assert.deepEqual(i.semRegra, ["dc360/apps/novo-app/src/x.ts"]);
  assert.equal(i.kitCompleto, true);
  assert.match(formatarImpacto(i), /sem regra no mapa/);
});

test("barra invertida e ./ no começo não escapam do mapa", () => {
  const i = impactoDoDiff([".\\dc360\\apps\\api\\src\\auth\\vigencia.ts"], mapa);
  assert.deepEqual(i.regras, ["api-auth-e-vigencia"]);
});

test("a F00 inteira: todo arquivo que os diffs arquivados tocaram tem regra no mapa", () => {
  const base = join(RAIZ_REAL, "docs", "evidencias-v2", "G00");
  const arquivos = new Set();
  for (const pasta of readdirSync(base)) {
    const patch = join(base, pasta, "diff-da-etapa.patch");
    if (!existsSync(patch)) continue;
    for (const m of readFileSync(patch, "utf8").matchAll(/^diff --git a\/.* b\/(.*)$/gm)) arquivos.add(m[1]);
  }
  assert.ok(arquivos.size > 20, `só ${arquivos.size} arquivos nos patches`);
  const i = impactoDoDiff([...arquivos], mapa);
  assert.deepEqual(i.semRegra, []);
});

test("a F00: os caminhos que a política cita têm regra", () => {
  const caminhos = [
    "dc360/apps/api/src/auth/sessoes.ts",
    "dc360/apps/api/src/servidor.ts",
    "dc360/apps/api/src/rotas/oficios.ts",
    "dc360/apps/api/src/rotas/avisos.ts",
    "dc360/apps/api/src/saida/pacote.ts",
    "dc360/apps/web/src/dados/http.ts",
    "dc360/apps/web/src/paginas/Entrar.tsx",
    "dc360/apps/web/src/paginas/MinhaConta.tsx",
    "dc360/apps/web/src/paginas/Usuarios.tsx",
    "dc360/packages/campo/src/transporte.ts",
    "dc360/packages/campo/src/fila.ts",
    "dc360/apps/campo/src/app/(agente)/perfil.tsx",
    "dc360/db/migrations/047_familia_da_sessao.sql",
    "dc360/scripts/baseline.mjs",
    "dc360/scripts/portao-de-skip.mjs",
    "scripts/roadmap/tags.mjs",
    ".github/workflows/verificar.yml",
    "dc360/README.md",
    "docs/roadmap-v2/mapa-de-impacto.json",
  ];
  const i = impactoDoDiff(caminhos, mapa);
  assert.deepEqual(i.semRegra, []);
});

/* ---------- Dimensões e herança ---------- */

test("dimensaoToca: cada dimensão só enxerga o que é dela", () => {
  const toca = (d, c) => dimensaoToca(d, [c], mapa);
  assert.deepEqual(toca("ux", "dc360/apps/api/src/servidor.ts"), []);
  assert.deepEqual(toca("ux", "dc360/apps/web/src/paginas/Entrar.tsx"), ["dc360/apps/web/src/paginas/Entrar.tsx"]);
  assert.equal(toca("seguranca-aplicacao", "dc360/apps/api/src/servidor.ts").length, 1);
  assert.equal(toca("banco-de-dados", "dc360/db/migrations/047_x.sql").length, 1);
  assert.deepEqual(toca("banco-de-dados", "dc360/apps/web/src/paginas/Entrar.tsx"), []);
  assert.equal(toca("engenharia-entrega", ".github/workflows/verificar.yml").length, 1);
  assert.deepEqual(toca("engenharia-entrega", "dc360/apps/api/src/servidor.ts"), []);
  assert.equal(toca("qa", "dc360/apps/api/src/servidor.ts").length, 1);
  assert.equal(toca("testes", "dc360/packages/campo/test/fila.test.ts").length, 1);
  assert.equal(dimensaoToca("dimensao-inexistente", ["x"], mapa), null);
  // Registro de validação nunca toca dimensão nenhuma.
  for (const d of Object.keys(mapa.dimensoes)) {
    assert.deepEqual(dimensaoToca(d, ["docs/evidencias-v2/G00/V2-F00-E04/VEREDITO.md", "docs/roadmap-v2/STATUS.md"], mapa), [], d);
  }
  assert.ok(padroesDaDimensao("ux", mapa).includes("dc360/apps/web/src/paginas/**"));
});

const relatorio = (campos = {}) => {
  const c = { validador: "ux", modelo: "claude-sonnet", etapa: "V2-F00-E13", sha_validado: "1111111aaaa", veredito: "PASS", ...campos };
  return `---\n${Object.entries(c).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n## Critérios verificados\n`;
};

test("lerCabecalho lê o YAML simples e recusa texto sem cabeçalho", () => {
  assert.equal(lerCabecalho(relatorio()).validador, "ux");
  assert.equal(lerCabecalho(relatorio().replace(/\n/g, "\r\n")).sha_validado, "1111111aaaa");
  assert.equal(lerCabecalho("sem cabeçalho"), null);
  assert.equal(lerCabecalho("---\nvalidador: ux\n"), null);
});

test("herdável: PASS cujo diff não toca o mapa da dimensão", () => {
  const r = herdavel({ relatorio: relatorio(), shaNovo: "2222222bbbb", mapa, arquivos: ["dc360/apps/api/src/servidor.ts", "docs/evidencias-v2/G00/V2-F00-E13/VEREDITO.md"] });
  assert.equal(r.herdavel, true);
  assert.equal(r.registro, "herdado de 1111111, sem impacto");
  assert.equal(r.dimensao, "ux");
});

test("não herdável: o diff toca o mapa da dimensão, e o motivo diz qual arquivo", () => {
  const r = herdavel({ relatorio: relatorio(), shaNovo: "2222222", mapa, arquivos: ["dc360/apps/web/src/paginas/Entrar.tsx"] });
  assert.equal(r.herdavel, false);
  assert.deepEqual(r.tocados, ["dc360/apps/web/src/paginas/Entrar.tsx"]);
  assert.match(r.motivo, /Entrar\.tsx/);
});

test("não herdável: FAIL, BLOCKED, sem veredito, dimensão sem mapa e relatório sem cabeçalho", () => {
  const arquivos = ["docs/roadmap-v2/STATUS.md"];
  for (const veredito of ["FAIL", "BLOCKED", "N/A", ""]) {
    assert.equal(herdavel({ relatorio: relatorio({ veredito }), shaNovo: "2222222", mapa, arquivos }).herdavel, false, `veredito ${veredito}`);
  }
  assert.match(herdavel({ relatorio: relatorio({ validador: "inventado" }), shaNovo: "2222222", mapa, arquivos }).motivo, /não tem mapa/);
  assert.equal(herdavel({ relatorio: "texto livre", shaNovo: "2222222", mapa, arquivos }).herdavel, false);
  assert.equal(herdavel({ relatorio: relatorio({ sha_validado: "" }), shaNovo: "2222222", mapa, arquivos }).herdavel, false);
});

test("não herdável: a política, o mapa, a skill ou os scripts mudaram entre os SHAs", () => {
  for (const arquivo of ["docs/roadmap-v2/28-execucao-e-validacao.md", "docs/roadmap-v2/mapa-de-impacto.json", ".claude/skills/validar-etapa/SKILL.md", "scripts/roadmap/tags.mjs"]) {
    const r = herdavel({ relatorio: relatorio(), shaNovo: "2222222", mapa, arquivos: [arquivo] });
    assert.equal(r.herdavel, false, arquivo);
    assert.match(r.motivo, /a regra mudou/);
  }
});

test("herdável com git de verdade: o mesmo SHA não muda nada; SHA inexistente não é herdável", () => {
  const head = arquivosEntre("HEAD", "HEAD", RAIZ_REAL);
  assert.deepEqual(head, []);
  const sha = "HEAD";
  assert.equal(herdavel({ relatorio: relatorio({ sha_validado: sha }), shaNovo: "HEAD", mapa, raiz: RAIZ_REAL }).herdavel, true);
  const inexistente = herdavel({ relatorio: relatorio({ sha_validado: "0000000deadbeef" }), shaNovo: "HEAD", mapa, raiz: RAIZ_REAL });
  assert.equal(inexistente.herdavel, false);
  assert.match(inexistente.motivo, /não consegui ler o diff/);
  assert.throws(() => arquivosEntre("--output=x", "HEAD", RAIZ_REAL), /inválida/);
});

/* ---------- CLI ---------- */

test("CLI: impacto.mjs HEAD..HEAD e --json", () => {
  const r = executarCli("impacto.mjs", ["HEAD..HEAD"]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /npm run typecheck/);
  const j = executarCli("impacto.mjs", ["HEAD..HEAD", "--json"]);
  assert.deepEqual(JSON.parse(j.saida).comandos, mapa.sempre.suites);
  assert.equal(executarCli("impacto.mjs", []).codigo, 2);
  assert.equal(executarCli("impacto.mjs", ["--output=x..y"]).codigo, 2);
});

test("CLI: --herdavel devolve 0 para herdável e 1 para não herdável", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-impacto-"));
  try {
    const ok = join(pasta, "ux.md");
    writeFileSync(ok, relatorio({ sha_validado: "HEAD" }));
    const certo = executarCli("impacto.mjs", ["--herdavel", ok, "--para", "HEAD"]);
    assert.equal(certo.codigo, 0, certo.erro);
    assert.match(certo.saida, /herdado de HEAD, sem impacto/);

    const ruim = join(pasta, "fail.md");
    writeFileSync(ruim, relatorio({ sha_validado: "HEAD", veredito: "FAIL" }));
    assert.equal(executarCli("impacto.mjs", ["--herdavel", ruim, "--para", "HEAD"]).codigo, 1);
    assert.equal(executarCli("impacto.mjs", ["--herdavel", ok]).codigo, 2);
    assert.ok(statSync(ok).isFile());
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
