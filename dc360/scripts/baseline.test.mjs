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
 *
 * Também não confere o total de casos de cada suíte contra a ÁRVORE: isso é do
 * `npm run conferir:numeros` (`conferirContagensDoRoteiro`), que roda o
 * `node --test` de `scripts/` e o `vitest list` dos pacotes, coisa que não cabe
 * dentro de um teste de `scripts/` sem recursão. Aqui se prova que o conferidor
 * MORDE: com um número velho plantado ele reprova, com o certo ele passa.
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
  codigoDeSaida,
  conferirContagensDoRoteiro,
  montarResumo,
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
/** `test(` e `it(` com ou sem recuo (`describe`), com sufixo (`.skip`): a regra antiga só via `test(` na coluna zero e dava 0 para `auditar.test.mjs`. */
const CASO_DE_TESTE = /^[ \t]*(?:test|it)(?:\.[A-Za-z]+)*\(/gm;
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
  const declarados = (readFileSync(ESTE_ARQUIVO, "utf8").match(CASO_DE_TESTE) ?? []).length;
  assert.equal(declarados, TESTES_DA_E01_EM_SCRIPTS);
  // Cada etapa seguinte que soma teste a `test:scripts` declara quantos: a tabela confere com o arquivo.
  for (const [etapa, arquivo] of Object.entries(ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS)) {
    const dessa = (readFileSync(fileURLToPath(new URL(`./${arquivo}`, import.meta.url)), "utf8").match(CASO_DE_TESTE) ?? []).length;
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

/* ---------- V2-F00-E01, correção 1: o esperado é o de hoje, e divergência se nomeia ---------- */

const SAIDA_EXPO_20_DE_21 = [
  "20/21 checks passed. 1 checks failed. Possible issues detected:",
  "Check the logs and the table below for more information.",
  "",
  "\u2716 Check that packages match versions required by installed Expo SDK",
].join("\n");

test("o esperado é o da árvore verde: auditar fecha em 0 e o expo-doctor espera 21 de 21, sem divergência explicada", () => {
  assert.deepEqual(PASSOS.find((p) => p.id === "auditar").esperado, { codigo: 0 });
  const expo = PASSOS.find((p) => p.id === "expo-doctor");
  assert.deepEqual(expo.esperado, { codigo: 0, contem: "21/21 checks passed" });
  assert.equal(expo.divergenciaExplicada, undefined, "a deriva V-DEP-4 foi fechada em 2026-10-13: nenhuma explicação sobrevive no passo");
  // Os dois `npm audit` crus seguem vermelhos por desenho (a política do CP-03 está no `auditar`).
  assert.equal(PASSOS.find((p) => p.id === "audit-raiz").esperado.codigo, "falha");
  assert.equal(PASSOS.find((p) => p.id === "audit-campo").esperado.codigo, "falha");
});

test("os npm audit crus só 'falham' de verdade se houve relatório: registro fora do ar diverge (validação de 2026-10-13)", () => {
  const SEM_REGISTRO = [
    "npm warn audit request to http://127.0.0.1:9/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:9",
    "npm error audit endpoint returned an error",
  ].join("\n");
  const COM_ACHADOS = "# npm audit report\n\nvitest  <=4.0.0\nSeverity: critical\n\n3 vulnerabilities (1 moderate, 2 critical)\n";
  for (const id of ["audit-raiz", "audit-campo"]) {
    const passo = PASSOS.find((p) => p.id === id);
    // Antes do conserto o esperado era só { codigo: "falha" }, e o código 1 do registro fora do ar conferia.
    assert.equal(avaliar(passo, SEM_REGISTRO, 1).status, "divergente", `${id}: não auditou, não pode conferir`);
    assert.equal(avaliar(passo, COM_ACHADOS, 1).status, "confere", `${id}: auditou e achou, confere`);
    assert.equal(avaliar(passo, COM_ACHADOS, 0).status, "divergente", `${id}: ficar verde diverge de propósito`);
  }
});

test("a deriva do expo-doctor, quando descrita num passo, é divergência EXPLICADA e nomeada; sem descrição, é divergente", () => {
  const real = PASSOS.find((p) => p.id === "expo-doctor");
  // O passo real não descreve nada: 20 de 21 hoje seria deriva nova e sem explicação.
  assert.equal(avaliar(real, SAIDA_EXPO_20_DE_21, 1).status, "divergente");
  // O mecanismo continua coberto com um passo sintético que descreve a deriva V-DEP-4 de 2026-10-13.
  const expo = {
    ...real,
    divergenciaExplicada: {
      id: "V-DEP-4",
      onde: "dc360/apps/campo/PENDENCIAS.md, item 17",
      motivo: "seis pacotes do Expo um patch atrás do que o SDK 57 exige",
      codigo: 1,
      contem: ["20/21 checks passed", "Check that packages match versions required by installed Expo SDK"],
    },
  };
  const explicada = avaliar(expo, SAIDA_EXPO_20_DE_21, 1);
  assert.equal(explicada.status, "divergente-explicada");
  assert.equal(explicada.explicacao.id, "V-DEP-4");
  assert.ok(explicada.detalhes.length > 0, "a divergência não some: o detalhe continua dizendo o que diverge");
  // Verde de verdade confere.
  assert.equal(avaliar(expo, "21/21 checks passed. No issues detected!", 0).status, "confere");
  // Outra verificação falhando (19 de 21) NÃO é a deriva descrita.
  assert.equal(avaliar(expo, SAIDA_EXPO_20_DE_21.replace("20/21", "19/21"), 1).status, "divergente");
  // 20 de 21 por OUTRA verificação também não é a deriva descrita.
  assert.equal(avaliar(expo, SAIDA_EXPO_20_DE_21.replace("packages match versions required by installed Expo SDK", "something else"), 1).status, "divergente");
  // O código de saída também faz parte da descrição.
  assert.equal(avaliar(expo, SAIDA_EXPO_20_DE_21, 2).status, "divergente");
});

test("passo sem divergência nomeada nunca vira explicada, e contem aceita lista exigindo todos os trechos", () => {
  const passo = { esperado: { codigo: 0, contem: ["Passou: 279   Falhou: 0", "Passou: 50   Falhou: 0"] } };
  assert.equal(avaliar(passo, "Passou: 279   Falhou: 0\nPassou: 50   Falhou: 0", 0).status, "confere");
  const falta = avaliar(passo, "Passou: 279   Falhou: 0", 0);
  assert.equal(falta.status, "divergente");
  assert.ok(falta.detalhes.some((d) => d.includes("Passou: 50")));
});

test("o código de saída separa tudo confere (0), só explicada (1) e sem explicação (3)", () => {
  assert.equal(codigoDeSaida([{ status: "confere" }]), 0);
  assert.equal(codigoDeSaida([{ status: "confere" }, { status: "divergente-explicada" }]), 1);
  assert.equal(codigoDeSaida([{ status: "divergente-explicada" }, { status: "divergente" }]), 3);
});

test("o resumo conta as divergências explicadas e diz por quê", () => {
  const resumo = montarResumo(
    [
      { id: "typecheck", cmd: "npm run typecheck", cwd: ".", codigo: 0, duracaoMs: 1000, status: "confere", detalhes: [] },
      {
        id: "expo-doctor",
        cmd: "npx expo-doctor",
        cwd: "apps/campo",
        codigo: 1,
        duracaoMs: 1000,
        status: "divergente-explicada",
        detalhes: ["código de saída 1, esperado 0"],
        explicacao: { id: "V-DEP-4", onde: "PENDENCIAS.md, item 17", motivo: "deriva do Expo" },
      },
    ],
    "2026-10-13T00:00:00Z",
  );
  assert.match(resumo, /Conferem: 1 de 2\. Divergentes sem explicação: 0\. Divergentes explicadas: 1 \(expo-doctor por V-DEP-4\)/);
  assert.match(resumo, /EXPLICADA por V-DEP-4 \(PENDENCIAS\.md, item 17\): deriva do Expo/);
});

test("o conferidor de contagens reprova o número velho plantado e passa com o certo", () => {
  // O caso real que reprovou a E01: o roteiro esperava 206 e o node imprimia 213.
  const passos = [{ id: "test-scripts", cmd: "npm run test:scripts", esperado: { codigo: 0, total: 206 } }];
  const velho = conferirContagensDoRoteiro({ "test-scripts": { quantos: 213 } }, passos);
  assert.equal(velho.length, 1);
  assert.match(velho[0], /test-scripts/);
  assert.match(velho[0], /espera 206 casos e a árvore tem 213 \(\+7\)/);
  assert.match(velho[0], /TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS/, "a mensagem diz ONDE atualizar");
  passos[0].esperado.total = 213;
  assert.deepEqual(conferirContagensDoRoteiro({ "test-scripts": { quantos: 213 } }, passos), []);
  // Teste a MENOS também reprova (apagar teste sem declarar).
  assert.equal(conferirContagensDoRoteiro({ "test-scripts": { quantos: 200 } }, passos).length, 1);
});

test("o conferidor desconta o pulo por ambiente só onde a lista do vitest não o enumera", () => {
  const passos = [{ id: "teste-db", cmd: "npm run test:isolamento", esperado: { codigo: 0, total: 330, puladas: 3 } }];
  assert.deepEqual(conferirContagensDoRoteiro({ "teste-db": { quantos: 327, descontaPuladas: true } }, passos), []);
  assert.equal(conferirContagensDoRoteiro({ "teste-db": { quantos: 327 } }, passos).length, 1);
});

test("suíte com total esperado e sem medida reprova, e medida de passo que o roteiro não conhece também", () => {
  const passos = [{ id: "teste-nova", cmd: "npm run test:nova", esperado: { codigo: 0, total: 10 } }];
  const semMedida = conferirContagensDoRoteiro({}, passos);
  assert.equal(semMedida.length, 1);
  assert.match(semMedida[0], /teste-nova.*nenhuma medida/);
  const semPasso = conferirContagensDoRoteiro({ "teste-nova": { quantos: 10 }, "teste-fantasma": { quantos: 3 } }, passos);
  assert.equal(semPasso.length, 1);
  assert.match(semPasso[0], /teste-fantasma/);
});

test("todo passo do roteiro com total esperado aparece na medição do conferir:numeros", () => {
  const fonte = readFileSync(fileURLToPath(new URL("./conferir-numeros.mjs", import.meta.url)), "utf8");
  assert.match(fonte, /conferirContagensDoRoteiro/);
  for (const passo of PASSOS.filter((p) => p.esperado?.total !== undefined)) {
    assert.ok(fonte.includes(`"${passo.id}":`), `${passo.id} tem total esperado e o conferir-numeros.mjs não o mede`);
  }
});

test("o registro da deriva V-DEP-4 existe e diz que foi fechada", () => {
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const pendencias = readFileSync(join(raiz, "dc360/apps/campo/PENDENCIAS.md"), "utf8");
  assert.match(pendencias, /^## 17\. `expo-doctor` deu 20 de 21 .*RESOLVIDO em 2026-10-13/m);
  const registro = readFileSync(join(raiz, "docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md"), "utf8");
  assert.ok(registro.includes("V-DEP-4"), "V-DEP-4 não está na classificação dos vermelhos");
});
