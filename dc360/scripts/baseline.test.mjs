/**
 * O roteiro da linha de base (`baseline.mjs`) faz o que diz: redige segredo,
 * lê contagem, compara com o esperado sem arredondar e lista sem executar.
 *
 * Por que isto é teste e não confiança: o filtro de redação é a única defesa
 * contra um JWT ou uma senha de banco entrarem na evidência arquivada (a
 * varredura automática de segredo só chega com a F01-E04), e a comparação com
 * o esperado é o que impede "divergente" de virar "confere" por descuido.
 *
 * Os textos de segredo aqui são inventados: nenhum é credencial de lugar nenhum.
 *
 * O que ele NÃO faz: não roda os passos de verdade (levaria uma hora e
 * precisa de rede e navegador). Quem prova a execução completa é a evidência
 * em `docs/evidencias-v2/G00/V2-F00-E01/`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSOS,
  ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS,
  TESTES_DA_E01_EM_SCRIPTS,
  TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS,
  BASE_DO_TESTE_API,
  MUDANCAS_DO_TESTE_API_POR_ETAPA,
  BASE_DO_TESTE_SHARED,
  MUDANCAS_DO_TESTE_SHARED_POR_ETAPA,
  BASE_DO_TESTE_WEB,
  MUDANCAS_DO_TESTE_WEB_POR_ETAPA,
  BASE_DO_TESTE_DB,
  MUDANCAS_DO_TESTE_DB_POR_ETAPA,
  BASE_DO_TESTE_CAMPO_PACOTE,
  MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA,
  BASE_DO_TESTE_CAMPO_APP,
  MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA,
  avaliar,
  escolherPassos,
  esperadoDoTesteApi,
  esperadoDoTesteShared,
  esperadoDoTesteWeb,
  esperadoDoTesteDb,
  esperadoDoTesteCampoPacote,
  esperadoDoTesteCampoApp,
  extrairContagem,
  lerOpcoes,
  listarComandos,
  redigir,
} from "./baseline.mjs";

const SCRIPT = fileURLToPath(new URL("./baseline.mjs", import.meta.url));
const ESTE_ARQUIVO = fileURLToPath(import.meta.url);

test("redige um JWT colado num texto", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0ZSJ9.assinaturaDeTeste123";
  const saida = redigir(`esperava ${jwt} mas veio vazio`);
  assert.ok(!saida.includes("eyJhbGci"));
  assert.ok(saida.includes("[JWT REDIGIDO]"));
});

test("redige o valor de Authorization Bearer e Basic", () => {
  assert.equal(redigir("Authorization: Bearer abcdef1234567890xyz"), "Authorization: Bearer [REDIGIDO]");
  assert.equal(redigir("Authorization: Basic dXN1YXJpbzpzZW5oYQ=="), "Authorization: Basic [REDIGIDO]");
});

test("redige usuário e senha de uma URL de banco", () => {
  const saida = redigir("conectando em postgres://usuario:senha-de-teste@banco.exemplo:5432/dc360");
  assert.ok(!saida.includes("senha-de-teste"));
  assert.ok(saida.includes("postgres://[REDIGIDO]@banco.exemplo:5432/dc360"));
});

test("troca o nome do usuário nas pastas pessoais", () => {
  assert.equal(redigir("C:\\Users\\Fulana\\projeto\\a.ts"), "C:\\Users\\[usuario]\\projeto\\a.ts");
  assert.equal(redigir("/home/fulana/projeto/a.ts"), "/home/[usuario]/projeto/a.ts");
});

test("troca o travessão, que a regra de conteúdo proíbe em docs", () => {
  const saida = redigir(`expect(rotulo).not.toContain("${String.fromCharCode(0x2014)}")`);
  assert.ok(!saida.includes(String.fromCharCode(0x2014)));
  assert.ok(saida.includes("[travessao]"));
});

test("não mexe em texto comum", () => {
  const comum = "Tests  1 failed | 148 passed (149)\nhttp://localhost:5173/entrar";
  assert.equal(redigir(comum), comum);
});

test("lê as contagens do vitest", () => {
  const saida = "\u001b[2m     Tests \u001b[22m 2 failed | 1089 passed | 18 skipped (1109)\n";
  assert.deepEqual(extrairContagem(saida, "vitest"), { total: 1109, falhas: 2, puladas: 18 });
  assert.deepEqual(extrairContagem(" Tests  318 passed (318)\n", "vitest"), { total: 318, falhas: 0, puladas: 0 });
});

test("lê as contagens do node --test e do jest", () => {
  assert.deepEqual(extrairContagem("# tests 165\n# pass 158\n# fail 3\n# skipped 4\n", "node-test"), { total: 165, falhas: 3, puladas: 4 });
  assert.deepEqual(extrairContagem("Tests:       20 failed, 1781 passed, 1801 total\n", "jest"), { total: 1801, falhas: 20, puladas: 0 });
});

test("sem contagem na saída o resultado é vazio, não zero", () => {
  assert.deepEqual(extrairContagem("nada útil aqui", "vitest"), {});
});

test("avaliar confere quando o resultado é o esperado, vermelho inclusive", () => {
  const passo = { esperado: { codigo: "falha", total: 149, falhas: 1 }, ferramenta: "vitest" };
  const r = avaliar(passo, "Tests  1 failed | 148 passed (149)\n", 1);
  assert.equal(r.status, "confere");
});

test("avaliar marca divergente quando fica verde sem esperar, e quando a contagem muda", () => {
  const passo = { esperado: { codigo: "falha", total: 149, falhas: 1 }, ferramenta: "vitest" };
  const verde = avaliar(passo, "Tests  149 passed (149)\n", 0);
  assert.equal(verde.status, "divergente");
  assert.ok(verde.detalhes.some((d) => d.includes("ficou verde")));
  const outra = avaliar(passo, "Tests  2 failed | 149 passed (151)\n", 1);
  assert.equal(outra.status, "divergente");
  assert.ok(outra.detalhes.some((d) => d.startsWith("total: obtido 151")));
});

test("avaliar não aceita a ausência de contagem como confere", () => {
  const passo = { esperado: { codigo: 0, total: 10 }, ferramenta: "vitest" };
  assert.equal(avaliar(passo, "sem resumo", 0).status, "divergente");
});

test("a lista de passos tem ids únicos e o total de scripts soma a própria etapa", () => {
  const ids = PASSOS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const scripts = PASSOS.find((p) => p.id === "test-scripts");
  const dasEtapasSeguintes = Object.values(TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS).reduce((a, b) => a + b, 0);
  assert.equal(scripts.esperado.total, 165 + TESTES_DA_E01_EM_SCRIPTS + dasEtapasSeguintes);
  // O esperado da API é a base da E01 mais o que cada etapa seguinte declarou mudar.
  const api = PASSOS.find((p) => p.id === "teste-api");
  const soma = Object.values(MUDANCAS_DO_TESTE_API_POR_ETAPA).reduce(
    (a, m) => ({ total: a.total + m.total, falhas: a.falhas + m.falhas, puladas: a.puladas + m.puladas }),
    { ...BASE_DO_TESTE_API },
  );
  assert.deepEqual(esperadoDoTesteApi(), soma);
  assert.deepEqual(
    { total: api.esperado.total, falhas: api.esperado.falhas, puladas: api.esperado.puladas },
    soma,
  );
  // O mesmo para shared e web (V2-F00-E05): base da E01 mais o declarado por etapa.
  for (const [id, base, mudancas, esperado] of [
    ["teste-shared", BASE_DO_TESTE_SHARED, MUDANCAS_DO_TESTE_SHARED_POR_ETAPA, esperadoDoTesteShared()],
    ["teste-web", BASE_DO_TESTE_WEB, MUDANCAS_DO_TESTE_WEB_POR_ETAPA, esperadoDoTesteWeb()],
    // V2-F00-E07: o banco (com o isolamento) segue o mesmo mecanismo.
    ["teste-db", BASE_DO_TESTE_DB, MUDANCAS_DO_TESTE_DB_POR_ETAPA, esperadoDoTesteDb()],
    // V2-F00-E06: o motor offline e o aplicativo de campo seguem o mesmo mecanismo.
    ["teste-campo-pacote", BASE_DO_TESTE_CAMPO_PACOTE, MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA, esperadoDoTesteCampoPacote()],
    ["teste-campo-app", BASE_DO_TESTE_CAMPO_APP, MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA, esperadoDoTesteCampoApp()],
  ]) {
    const passo = PASSOS.find((p) => p.id === id);
    // Quem conta pulados (o banco) compara os pulados também.
    const campos = "puladas" in base ? ["total", "falhas", "puladas"] : ["total", "falhas"];
    const somado = Object.values(mudancas).reduce(
      (a, m) => Object.fromEntries(campos.map((c) => [c, a[c] + m[c]])),
      { ...base },
    );
    assert.deepEqual(esperado, somado, id);
    assert.deepEqual(Object.fromEntries(campos.map((c) => [c, passo.esperado[c]])), somado, id);
  }
  const declarados = (readFileSync(ESTE_ARQUIVO, "utf8").match(/^test\(/gm) ?? []).length;
  assert.equal(declarados, TESTES_DA_E01_EM_SCRIPTS);
  // Cada etapa seguinte que soma teste a `test:scripts` declara quantos: a tabela confere com o arquivo.
  for (const [etapa, arquivo] of Object.entries(ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS)) {
    const dessa = (readFileSync(fileURLToPath(new URL(`./${arquivo}`, import.meta.url)), "utf8").match(/^test\(/gm) ?? []).length;
    assert.equal(dessa, TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS[etapa], `${etapa}: ${arquivo} tem ${dessa} testes`);
  }
});

test("o E2E do painel local declara o servidor que o teste exige", () => {
  const e2e = PASSOS.find((p) => p.id === "e2e");
  assert.equal(e2e.servidor.url, "http://localhost:4173");
  const teste = readFileSync(new URL("../apps/web/test/fluxo.e2e.mjs", import.meta.url), "utf8");
  assert.ok(teste.includes("localhost:4173"), "o E2E mudou de porta: atualize o passo");
});

test("as opções recusam o que não conhecem e os filtros recusam passo inexistente", () => {
  assert.throws(() => lerOpcoes(["--assim-nao"]), /opção desconhecida/);
  assert.throws(() => escolherPassos(lerOpcoes(["--so=nao-existe"])), /passo desconhecido/);
  const sem = escolherPassos(lerOpcoes(["--sem-instalar", "--pular=e2e"]));
  assert.ok(!sem.some((p) => p.instalacao || p.id === "e2e"));
});

test("--so-listar imprime os comandos, não executa nada e não cria a pasta de saída", () => {
  const pasta = join(mkdtempSync(join(tmpdir(), "baseline-")), "nao-criar");
  const r = spawnSync(process.execPath, [SCRIPT, "--so-listar", `--saida=${pasta}`], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("npm run typecheck"));
  assert.equal(r.stdout.trim().split("\n").length, listarComandos().length);
  assert.equal(existsSync(pasta), false);
});
