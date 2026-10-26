import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FIXTURE, RAIZ_REAL, executarCli } from "./apoio-de-teste.mjs";
import { localizarEtapa, todasAsEtapasDosArquivos } from "./roadmap.mjs";
import {
  ORDEM_DE_RISCO,
  TAGS_EM_ORDEM,
  analisarEtapa,
  caminhosProvaveis,
  derivarTags,
  exigeOpus,
  formatarAnalise,
  gatilhosVisuais,
  lerDiff,
  lerPatch,
  normalizarCaminho,
  tagsPorCaminho,
  temLiteralEmPortugues,
  validadoresObrigatorios,
} from "./tags.mjs";

const etapa = (id) => localizarEtapa(id, FIXTURE);

/** Bloco sintético com só o que o teste precisa. */
function blocoSintetico({ titulo = "Etapa de teste", campos = {} } = {}) {
  return { id: "V2-F99-E01", fase: "F99", titulo, campos: { Risco: "baixo", "Estado atual": "CORRIGIR", ...campos }, texto: "" };
}

/* ---------- Caminhos ---------- */

test("normalizarCaminho tira o dc360/ e as barras invertidas", () => {
  assert.equal(normalizarCaminho("dc360\\apps\\web\\src\\App.tsx"), "apps/web/src/App.tsx");
  assert.equal(normalizarCaminho("./apps/api/src/servidor.ts"), "apps/api/src/servidor.ts");
});

test("tagsPorCaminho conhece cada área do repositório", () => {
  const tags = (c) => [...tagsPorCaminho(c)].sort();
  assert.deepEqual(tags("dc360/apps/web/src/paginas/Entrar.tsx"), ["UI"]);
  assert.deepEqual(tags("dc360/apps/console/src/App.tsx"), ["UI"]);
  assert.deepEqual(tags("dc360/apps/campo/src/app/index.tsx"), ["MOBILE"]);
  assert.deepEqual(tags("dc360/packages/campo/src/fila.ts"), ["MOBILE", "OFFLINE"]);
  assert.deepEqual(tags("dc360/apps/api/src/auth/sessoes.ts"), ["AUTH"]);
  assert.deepEqual(tags("dc360/apps/api/src/rotas/interesse.ts"), ["API", "PUBLIC_API"]);
  assert.deepEqual(tags("dc360/db/migrations/047_familia.sql"), ["DB", "MIGRATION"]);
  assert.deepEqual(tags("dc360/db/test/isolamento.test.ts"), ["DB", "TENANT"]);
  // O catálogo nominal do portão (V2-F03-E08, parte 0B) é o portão: cada arquivo dele, e as sondas.
  assert.deepEqual(tags("dc360/db/test/catalogo/f03-e15.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/catalogo/base.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/catalogo/conferir.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/catalogo-nominal.test.ts"), ["DB", "TENANT"]);
  // As sondas e as provas da parte 0D também são o portão.
  assert.deepEqual(tags("dc360/db/test/portao-comportamental.test.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/funcoes-antes-do-tenant.test.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/extensoes.espacial.test.ts"), ["DB", "TENANT"]);
  assert.deepEqual(tags("dc360/db/test/catalogo/comportamental.ts"), ["DB", "TENANT"]);
  // Outro teste do banco não é o portão.
  assert.deepEqual(tags("dc360/db/test/catalogo-nominal.test.ts.bak"), ["DB"]);
  assert.deepEqual(tags("dc360/db/test/pessoas.test.ts"), ["DB"]);
  assert.deepEqual(tags(".github/workflows/verificar.yml"), ["INFRA"]);
  assert.deepEqual(tags("dc360/fly.toml"), ["INFRA"]);
  assert.deepEqual(tags("dc360/apps/api/src/saida/pacote.ts"), ["DOCUMENTO"]);
  // Teste de laudo não é documento.
  assert.deepEqual(tags("dc360/apps/api/test/laudo.test.ts"), []);
  assert.deepEqual(tags("docs/roadmap-v2/STATUS.md"), []);
});

test("caminhosProvaveis ignora o que é só leitura", () => {
  assert.deepEqual(caminhosProvaveis(etapa("V2-F00-E01")), ["apps/api/src/auth/vigencia.ts"]);
});

/* ---------- Tags da fixture ---------- */

test("E01: AUTHZ por prefixo, AUTH pelo caminho, API, e o INFRA 'só leitura' não entra", () => {
  const { tags, origem } = derivarTags(etapa("V2-F00-E01"));
  assert.deepEqual(tags, ["AUTH", "AUTHZ", "API"]);
  assert.ok(origem.AUTHZ.some((o) => o.includes("exigirPermissao")));
  assert.ok(!tags.includes("INFRA"));
});

test("E02: UI, A11Y e LGPD (o IP da lista não é 'só sintético')", () => {
  const { tags } = derivarTags(etapa("V2-F00-E02"));
  assert.deepEqual(tags, ["UI", "A11Y", "LGPD"]);
});

test("E03: Infraestrutura vira INFRA; Migration vira DB e MIGRATION; 'só dado sintético' não é LGPD", () => {
  const { tags } = derivarTags(etapa("V2-F00-E03"));
  assert.deepEqual(tags, ["DB", "MIGRATION", "INFRA"]);
});

test("F02-E01: rota pública, policy e GRANT, retenção de IP", () => {
  const { tags } = derivarTags(etapa("V2-F02-E01"));
  assert.deepEqual(tags, ["RLS", "DB", "MIGRATION", "API", "PUBLIC_API", "LGPD"]);
});

test("TENANT: o test:isolamento da regressão não conta, o do escopo conta", () => {
  const regressao = blocoSintetico({ campos: { "Regressão obrigatória": "`npm run test:isolamento` verde.", "Testes de autorização e isolamento": "test:isolamento verde" } });
  assert.ok(!derivarTags(regressao).tags.includes("TENANT"));
  const escopo = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - API: a rota passa a usar `comTenant` em toda leitura." } });
  assert.ok(derivarTags(escopo).tags.includes("TENANT"));
  const soNoTeste = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Testes: rodar `npm run test:isolamento` no fim." } });
  assert.ok(!derivarTags(soNoTeste).tags.includes("TENANT"));
});

test("ARQUIVO: o prefixo Arquivos: sozinho não basta (na F00 ele lista arquivos do código)", () => {
  const codigo = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Arquivos: `dc360/scripts/baseline.mjs` roda os passos." } });
  assert.ok(!derivarTags(codigo).tags.includes("ARQUIVO"));
  const produto = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Arquivos: upload com limite por tipo." } });
  assert.ok(derivarTags(produto).tags.includes("ARQUIVO"));
});

test("as tags saem sempre na ordem canônica", () => {
  for (const e of todasAsEtapasDosArquivos(RAIZ_REAL).slice(0, 80)) {
    const { tags } = derivarTags(e);
    assert.deepEqual(tags, TAGS_EM_ORDEM.filter((t) => tags.includes(t)), e.id);
  }
});

/* ---------- Validadores e teto ---------- */

test("validadores: qa sempre; UI soma ux e acessibilidade; MOBILE soma testes", () => {
  assert.deepEqual(validadoresObrigatorios([]).validadores, ["qa"]);
  assert.deepEqual(validadoresObrigatorios(["UI", "A11Y"]).validadores, ["qa", "acessibilidade", "ux"]);
  assert.deepEqual(validadoresObrigatorios(["MOBILE", "A11Y"]).validadores, ["qa", "testes"]);
  assert.deepEqual(validadoresObrigatorios(["AUTHZ"]).validadores, ["qa", "red-team", "seguranca-aplicacao"]);
  assert.deepEqual(validadoresObrigatorios(["MIGRATION", "DB"]).validadores, ["qa", "banco-de-dados", "testes"]);
  assert.deepEqual(validadoresObrigatorios(["MIGRATION", "RLS"]).validadores, ["qa", "red-team", "banco-de-dados"], "MIGRATION com RLS cai na linha do RLS, sem o testes");
  assert.deepEqual(validadoresObrigatorios(["DOCUMENTO"]).validadores, ["qa", "especificacao"]);
  assert.deepEqual(validadoresObrigatorios(["INFRA"]).validadores, ["qa", "engenharia-entrega"]);
  assert.deepEqual(validadoresObrigatorios(["ARQUIVO"], { publico: true }).validadores, ["qa", "red-team", "seguranca-aplicacao"]);
  assert.deepEqual(validadoresObrigatorios(["ARQUIVO"], { publico: false }).validadores, ["qa"]);
});

test("teto de 4: sem UI, qa mais os três de maior risco pela ORDEM_DE_RISCO, e o corte é dito", () => {
  const semUi = TAGS_EM_ORDEM.filter((t) => t !== "UI");
  const todas = validadoresObrigatorios(semUi, { publico: true, risco: "alto" });
  assert.deepEqual(todas.validadores, ["qa", "red-team", "seguranca-aplicacao", "banco-de-dados"]);
  assert.deepEqual(todas.descartadosPeloTeto, ["privacidade-lgpd", "especificacao", "engenharia-entrega", "testes"]);
  assert.match(todas.regraDeDesempate, /ORDEM_DE_RISCO/);
  // A lista de risco cobre todo validador que a matriz pode pedir.
  for (const v of todas.validadores.concat(todas.descartadosPeloTeto)) {
    if (v !== "qa") assert.ok(ORDEM_DE_RISCO.includes(v), v);
  }
});

test("teto de 4: com tag UI o ux nunca é cortado", () => {
  const todas = validadoresObrigatorios(TAGS_EM_ORDEM, { publico: true, risco: "alto" });
  assert.equal(todas.validadores.length, 4);
  assert.deepEqual(todas.validadores, ["qa", "red-team", "seguranca-aplicacao", "ux"]);
  assert.ok(!todas.descartadosPeloTeto.includes("ux"));
  assert.ok(todas.descartadosPeloTeto.includes("banco-de-dados"), "o ux ocupou a vaga do banco de dados");
});

test("teto de 4: em risco médio corta-se primeiro seguranca-aplicacao, e fica o red-team", () => {
  const medio = validadoresObrigatorios(["UI", "A11Y", "AUTHZ", "LGPD"], { risco: "médio" });
  assert.deepEqual(medio.validadores, ["qa", "red-team", "privacidade-lgpd", "ux"]);
  assert.deepEqual(medio.descartadosPeloTeto, ["seguranca-aplicacao", "acessibilidade"]);
  // Em risco alto os dois ficam e quem cai é o de menor risco.
  const alto = validadoresObrigatorios(["UI", "A11Y", "AUTHZ", "LGPD"], { risco: "alto" });
  assert.deepEqual(alto.validadores, ["qa", "red-team", "seguranca-aplicacao", "ux"]);
  assert.deepEqual(alto.descartadosPeloTeto, ["privacidade-lgpd", "acessibilidade"]);
  // Sem estouro do teto a duplicidade não é cortada, mesmo em risco médio.
  assert.deepEqual(validadoresObrigatorios(["AUTHZ"], { risco: "médio" }).validadores, ["qa", "red-team", "seguranca-aplicacao"]);
});

test("teto na fixture: privacidade-lgpd perde para os três de segurança e banco", () => {
  const a = analisarEtapa(etapa("V2-F02-E01"));
  assert.deepEqual(a.validadores, ["qa", "red-team", "seguranca-aplicacao", "banco-de-dados"]);
  assert.deepEqual(a.descartadosPeloTeto, ["privacidade-lgpd"]);
});

test("A11Y sem UI aparece como sugerido, fora da matriz", () => {
  assert.deepEqual(validadoresObrigatorios(["A11Y"]).sugeridos, ["acessibilidade"]);
  assert.deepEqual(validadoresObrigatorios(["UI", "A11Y"]).sugeridos, []);
});

/* ---------- Opus ---------- */

test("Opus: coluna da matriz e gatilho 4 da seção 12 (calibração de 2026-10-07)", () => {
  // A coluna da matriz só vale em risco alto ou crítico: os casos abaixo partem de risco alto.
  const bloco = (extra = {}) => blocoSintetico({ ...extra, campos: { Risco: "alto", ...(extra.campos ?? {}) } });
  const com = (campos, extra = {}) => bloco({ campos, ...extra });
  assert.equal(exigeOpus(bloco(), []).opus, false);
  assert.equal(exigeOpus(bloco(), ["AUTH"]).opus, true);
  assert.equal(exigeOpus(bloco(), ["TENANT"]).opus, true);
  assert.equal(exigeOpus(bloco(), ["PUBLIC_API"]).opus, true);

  // LGPD só estrutural: manifesto de dados, retenção, eliminação, expurgo, anonimização, base legal.
  assert.equal(exigeOpus(bloco(), ["LGPD"]).opus, false);
  for (const palavra of ["manifesto de dados", "política de retenção", "eliminação", "expurgo", "anonimização", "base legal"]) {
    assert.equal(exigeOpus(bloco({ titulo: `Etapa de ${palavra}` }), ["LGPD"]).opus, true, palavra);
  }
  // O campo Impacto LGPD, sozinho, não torna estrutural.
  assert.equal(exigeOpus(com({ "Impacto LGPD": "guarda IP, retenção de 30 dias" }), ["LGPD"]).opus, false);

  // DOCUMENTO só quando toca imutabilidade ou assinatura, pelo texto ou pelo diff.
  assert.equal(exigeOpus(bloco(), ["DOCUMENTO"]).opus, false);
  assert.equal(exigeOpus(bloco({ titulo: "Laudo imutável" }), ["DOCUMENTO"]).opus, true);
  assert.equal(exigeOpus(bloco({ titulo: "Assinatura do laudo" }), ["DOCUMENTO"]).opus, true);
  const diffDeAssinatura = { intervalo: "a..b", arquivos: [], patch: [{ caminho: "dc360/apps/api/src/saida/laudo.ts", adicionadas: ["const assinatura = hash(x);"], removidas: [] }] };
  assert.equal(exigeOpus(bloco(), ["DOCUMENTO"], { diff: diffDeAssinatura }).opus, true);
  const diffSoDeTeste = { intervalo: "a..b", arquivos: [], patch: [{ caminho: "dc360/apps/api/test/laudo.test.ts", adicionadas: ["// assinatura"], removidas: [] }] };
  assert.equal(exigeOpus(bloco(), ["DOCUMENTO"], { diff: diffSoDeTeste }).opus, false, "linha de teste não conta");

  // Gatilho 4: crítico; alto com AUTHZ, TENANT, RLS ou PUBLIC_API (e DOCUMENTO imutável ou LGPD estrutural).
  assert.equal(exigeOpus(bloco({ campos: { Risco: "crítico" } }), []).opus, true);
  assert.equal(exigeOpus(bloco({ campos: { Risco: "alto" } }), ["UI"]).opus, false);
  assert.equal(exigeOpus(bloco({ campos: { Risco: "alto" } }), ["LGPD"]).opus, false, "alto com LGPD amplo deixou de bastar");
  assert.equal(exigeOpus(bloco({ campos: { Risco: "alto" } }), ["DOCUMENTO"]).opus, false, "alto com DOCUMENTO amplo deixou de bastar");
  const alto = exigeOpus(bloco({ titulo: "Eliminação do município", campos: { Risco: "alto" } }), ["LGPD"]);
  assert.ok(alto.motivos.some((m) => /gatilho 4/.test(m) && /LGPD estrutural/.test(m)));

  // INFRA só com segredo ou produção.
  const infraComSegredo = bloco({ campos: { "O que deve ser implementado": "\n  - Infraestrutura: segredo do provedor no cofre." } });
  assert.equal(exigeOpus(infraComSegredo, ["INFRA"]).opus, true);
  const infraSimples = bloco({ campos: { "O que deve ser implementado": "\n  - Infraestrutura: cache do npm no CI." } });
  assert.equal(exigeOpus(infraSimples, ["INFRA"]).opus, false);
  // Em risco médio ou baixo a matriz não manda Opus, mesmo com AUTH, TENANT, PUBLIC_API, LGPD estrutural, DOCUMENTO imutável ou INFRA com segredo.
  for (const risco of ["médio", "baixo"]) {
    const em = (extra = {}) => blocoSintetico({ ...extra, campos: { Risco: risco, ...(extra.campos ?? {}) } });
    for (const tag of ["AUTH", "AUTHZ", "TENANT", "RLS", "PUBLIC_API"]) assert.equal(exigeOpus(em(), [tag]).opus, false, `${tag} em risco ${risco}`);
    assert.equal(exigeOpus(em({ titulo: "Eliminação do município" }), ["LGPD"]).opus, false, `LGPD estrutural em risco ${risco}`);
    assert.equal(exigeOpus(em({ titulo: "Laudo imutável" }), ["DOCUMENTO"]).opus, false, `DOCUMENTO em risco ${risco}`);
    assert.equal(exigeOpus(em(), ["ARQUIVO"], { publico: true }).opus, false, `ARQUIVO público em risco ${risco}`);
    const infra = em({ campos: { "O que deve ser implementado": "\n  - Infraestrutura: segredo do provedor no cofre." } });
    assert.equal(exigeOpus(infra, ["INFRA"]).opus, false, `INFRA com segredo em risco ${risco}`);
  }
  // Em risco alto ou crítico a matriz continua valendo, com o motivo dito.
  assert.ok(exigeOpus(bloco(), ["AUTH"]).motivos.includes("matriz: AUTH ou AUTHZ"));
  assert.ok(exigeOpus(blocoSintetico({ campos: { Risco: "crítico" } }), ["PUBLIC_API"]).motivos.includes("matriz: PUBLIC_API ou ARQUIVO público"));
});

test("Opus na fixture: E01 (AUTHZ, risco alto) sim; E03 (risco baixo, INFRA simples) não", () => {
  assert.equal(analisarEtapa(etapa("V2-F00-E01")).opus.opus, true);
  assert.equal(analisarEtapa(etapa("V2-F00-E03")).opus.opus, false);
  assert.equal(analisarEtapa(etapa("V2-F02-E01")).opus.opus, true);
});

/* ---------- Portão visual ---------- */

test("etapa sem UI nem MOBILE não tem portão visual", () => {
  const g = analisarEtapa(etapa("V2-F00-E01")).visual;
  assert.equal(g.aplicavel, false);
  assert.equal(g.rafaelVisualObrigatorio, false);
  assert.ok(g.gatilhos.every((x) => !x.disparado));
});

test("E02 da fixture: sem diff, nada dispara por texto e o resto fica 'a decidir pelo diff' como possível", () => {
  const v = analisarEtapa(etapa("V2-F00-E02")).visual;
  assert.equal(v.aplicavel, true);
  assert.deepEqual(v.gatilhos.filter((g) => g.disparado).map((g) => g.id), []);
  assert.equal(v.rafaelVisualObrigatorio, false, "o texto de uma etapa de rotina não obriga Rafael");
  // O texto sugere estes, e eles viram "possível", não obrigatório.
  for (const esperado of ["nova-superficie-ou-tela", "nova-jornada", "texto-de-produto", "mudanca-grande-de-ux", "fluxo-de-erro-critico"]) {
    assert.ok(v.possiveis.includes(esperado), `deveria ser possível: ${esperado}`);
  }
  assert.ok(!v.possiveis.includes("novo-padrao-visual"));
  assert.equal(v.gatilhos.find((g) => g.id === "texto-de-produto").deteccao, "a decidir pelo diff");
  assert.deepEqual(v.pendentesDeDiff, ["novo-padrao-visual", "nova-superficie-ou-tela", "nova-jornada", "texto-de-produto", "mudanca-grande-de-ux", "fluxo-de-erro-critico"]);
  assert.equal(v.gatilhos.find((g) => g.id === "gate-de-fase").disparado, false);
});

test("sem diff, só disparam critério E4 explícito e tela pública", () => {
  const e4 = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Frontend: botão novo.", "Validação humana": "Rafael vê no iPhone, num aparelho físico." } });
  const v1 = gatilhosVisuais(e4, ["UI", "A11Y"]);
  assert.deepEqual(v1.gatilhos.filter((g) => g.disparado).map((g) => g.id), ["e4-explicito"]);
  assert.equal(v1.rafaelVisualObrigatorio, true);

  const publica = blocoSintetico({ titulo: "Tela de entrada para o cidadão", campos: { "O que deve ser implementado": "\n  - Frontend: formulário do cidadão." } });
  const v2 = gatilhosVisuais(publica, ["UI", "A11Y"]);
  assert.deepEqual(v2.gatilhos.filter((g) => g.disparado).map((g) => g.id), ["tela-publica"]);
  assert.equal(v2.rafaelVisualObrigatorio, true);
});

test("com diff, o texto da etapa não dispara os seis do diff", () => {
  const bloco = blocoSintetico({ campos: { Objetivo: "Tela nova com a frase 'Sessão encerrada' e componente compartilhado novo.", "Estado atual": "CRIAR", "O que deve ser implementado": "\n  - Frontend: tela nova." } });
  const { tags } = derivarTags(bloco);
  const diff = { intervalo: "a..b", arquivos: [{ status: "M", caminho: "dc360/apps/web/src/paginas/Antiga.tsx" }], patch: [{ caminho: "dc360/apps/web/src/paginas/Antiga.tsx", adicionadas: ["  const x = 1;"], removidas: [] }] };
  const v = gatilhosVisuais(bloco, tags, diff);
  assert.deepEqual(v.gatilhos.filter((g) => g.disparado).map((g) => g.id), []);
  assert.deepEqual(v.possiveis, []);
  assert.deepEqual(v.pendentesDeDiff, []);
  assert.equal(v.rafaelVisualObrigatorio, false);
});

test("mudança grande de UX pelo diff: página nova, rota nova ou mais de um arquivo de tela com layout novo", () => {
  const bloco = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Frontend: ajuste." } });
  const { tags } = derivarTags(bloco);
  const ux = (diff) => gatilhosVisuais(bloco, tags, { intervalo: "a..b", arquivos: [], patch: [], ...diff }).gatilhos.find((g) => g.id === "mudanca-grande-de-ux");

  assert.equal(ux({ arquivos: [{ status: "A", caminho: "dc360/apps/web/src/paginas/Nova.tsx" }] }).disparado, true);
  assert.equal(ux({ patch: [{ caminho: "dc360/apps/web/src/App.tsx", adicionadas: ['<Route path="/x" element={<X />} />'], removidas: [] }] }).disparado, true);

  const layout = (nome) => ({ caminho: `dc360/apps/web/src/paginas/${nome}.tsx`, adicionadas: ["<section className=\"a\">", "<div>texto</div>"], removidas: ["<div>texto</div>"] });
  assert.equal(ux({ patch: [layout("A")] }).disparado, false, "um arquivo só não basta");
  assert.equal(ux({ patch: [layout("A"), layout("B")] }).disparado, true);
  // Só texto ou estilo nos dois arquivos não é layout novo.
  const soTexto = (nome) => ({ caminho: `dc360/apps/web/src/paginas/${nome}.tsx`, adicionadas: ["<p>Outro texto</p>"], removidas: ["<p>Texto</p>"] });
  assert.equal(ux({ patch: [soTexto("A"), soTexto("B")] }).disparado, false);
});

test("com diff, o gatilho que o texto não via passa a ser avaliado", () => {
  const bloco = blocoSintetico({ campos: { "O que deve ser implementado": "\n  - Frontend: ajuste de espaçamento." } });
  const { tags } = derivarTags(bloco);
  assert.deepEqual(tags, ["UI", "A11Y"]);

  const semDiff = gatilhosVisuais(bloco, tags);
  assert.equal(semDiff.rafaelVisualObrigatorio, false);
  assert.ok(semDiff.pendentesDeDiff.length > 0, "sem diff, o que não dispara fica pendente");

  const diff = {
    intervalo: "a..b",
    arquivos: [
      { status: "A", caminho: "dc360/apps/web/src/componentes/CartaoNovo.tsx" },
      { status: "A", caminho: "dc360/apps/web/src/paginas/Sessoes.tsx" },
      { status: "M", caminho: "dc360/apps/web/src/estilos/tokens.css" },
    ],
    patch: [
      { caminho: "dc360/apps/web/src/paginas/Sessoes.tsx", adicionadas: ['  return <p>Esta página não existe</p>;'], removidas: [] },
      { caminho: "dc360/apps/web/test/fluxo.e2e.mjs", adicionadas: ["// 31. Sessões encerradas pelo painel"], removidas: [] },
    ],
  };
  const comDiff = gatilhosVisuais(bloco, tags, diff);
  const por = Object.fromEntries(comDiff.gatilhos.map((g) => [g.id, g]));
  assert.equal(por["novo-padrao-visual"].disparado, true);
  assert.match(por["novo-padrao-visual"].deteccao, /diff/);
  assert.equal(por["nova-superficie-ou-tela"].disparado, true);
  assert.equal(por["nova-jornada"].disparado, true);
  assert.equal(por["texto-de-produto"].disparado, true);
  assert.deepEqual(comDiff.pendentesDeDiff, []);
  assert.equal(comDiff.rafaelVisualObrigatorio, true);
});

test("literal em português: o que conta e o que não conta como texto de produto", () => {
  assert.equal(temLiteralEmPortugues('const titulo = "Sua sessão terminou";'), true);
  assert.equal(temLiteralEmPortugues("return <p>Esta página não existe</p>;"), true);
  assert.equal(temLiteralEmPortugues("aviso: `Não foi possível enviar a coleta`,"), true);
  assert.equal(temLiteralEmPortugues('import { Botao } from "./componentes/Botao";'), false);
  assert.equal(temLiteralEmPortugues("// comentário em português não é tela"), false);
  assert.equal(temLiteralEmPortugues('headers: { "content-type": "application/json" },'), false);
  assert.equal(temLiteralEmPortugues('const chave = "abc-def";'), false);
  assert.equal(temLiteralEmPortugues('x("ok");'), false);
});

test("lerPatch separa adicionadas e removidas por arquivo", () => {
  const saida = [
    "diff --git a/dc360/apps/web/src/App.tsx b/dc360/apps/web/src/App.tsx",
    "--- a/dc360/apps/web/src/App.tsx",
    "+++ b/dc360/apps/web/src/App.tsx",
    "@@ -1 +1 @@",
    "-antigo",
    "+novo",
    "diff --git a/x.md b/x.md",
    "+++ b/x.md",
    "+so isto",
  ].join("\n");
  assert.deepEqual(lerPatch(saida), [
    { caminho: "dc360/apps/web/src/App.tsx", adicionadas: ["novo"], removidas: ["antigo"] },
    { caminho: "x.md", adicionadas: ["so isto"], removidas: [] },
  ]);
});

/* ---------- Diff de verdade, num repositório descartável ---------- */

function git(pasta, ...args) {
  return execFileSync("git", ["-c", "user.name=teste", "-c", "user.email=teste@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", ...args], { cwd: pasta, encoding: "utf8" });
}

test("lerDiff lê nome e status por git diff, e tags e gatilhos usam o diff", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-diff-"));
  try {
    git(pasta, "init", "-q");
    mkdirSync(join(pasta, "dc360", "apps", "web", "src", "paginas"), { recursive: true });
    mkdirSync(join(pasta, "dc360", "db", "migrations"), { recursive: true });
    writeFileSync(join(pasta, "dc360", "apps", "web", "src", "App.tsx"), "export const a = 1;\n");
    git(pasta, "add", "-A");
    git(pasta, "commit", "-q", "-m", "base");
    const base = git(pasta, "rev-parse", "HEAD").trim();

    writeFileSync(join(pasta, "dc360", "apps", "web", "src", "paginas", "Entrar.tsx"), 'export const t = () => <p>Sessão encerrada, entre de novo</p>;\n');
    writeFileSync(join(pasta, "dc360", "db", "migrations", "050_x.sql"), "CREATE POLICY p ON t USING (organizacao_id = 1);\n");
    git(pasta, "add", "-A");
    git(pasta, "commit", "-q", "-m", "candidato");

    const diff = lerDiff(`${base}..HEAD`, pasta);
    assert.deepEqual(diff.arquivos.map((a) => [a.status, a.caminho]).sort(), [
      ["A", "dc360/apps/web/src/paginas/Entrar.tsx"],
      ["A", "dc360/db/migrations/050_x.sql"],
    ]);

    const bloco = blocoSintetico();
    const { tags, origem } = derivarTags(bloco, diff);
    for (const esperado of ["UI", "DB", "MIGRATION", "RLS", "TENANT"]) assert.ok(tags.includes(esperado), `faltou ${esperado} em ${tags}`);
    assert.ok(origem.UI[0].startsWith("diff:"));

    const g = gatilhosVisuais(bloco, tags, diff);
    const ids = g.gatilhos.filter((x) => x.disparado).map((x) => x.id);
    assert.ok(ids.includes("nova-superficie-ou-tela"));
    assert.ok(ids.includes("texto-de-produto"));
    assert.ok(ids.includes("tela-publica"), "Entrar.tsx é tela sem login");
    assert.ok(ids.includes("fluxo-de-erro-critico"), "o texto fala de sessão encerrada");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("lerDiff recusa intervalo que parece opção do git", () => {
  assert.throws(() => lerDiff("--output=x", FIXTURE), /inválido/);
  assert.throws(() => lerDiff("a b..c", FIXTURE), /inválido/);
  assert.throws(() => lerDiff("-p", FIXTURE), /inválido/);
});

/* ---------- Repositório real ---------- */

test("repositório real: V2-F00-E04 tem AUTH ou AUTHZ e pede seguranca-aplicacao", () => {
  const a = analisarEtapa(localizarEtapa("V2-F00-E04", RAIZ_REAL));
  assert.ok(a.tags.includes("AUTH") || a.tags.includes("AUTHZ"), a.tags.join(","));
  assert.ok(a.validadores.includes("seguranca-aplicacao"), a.validadores.join(","));
  assert.ok(a.validadores.includes("qa"));
  assert.ok(a.validadores.length <= 4);
  assert.equal(a.opus.opus, true);
  assert.match(formatarAnalise(a), /Validadores obrigatórios/);
});

test("repositório real: nenhuma etapa passa do teto e toda etapa tem qa", () => {
  for (const e of todasAsEtapasDosArquivos(RAIZ_REAL)) {
    const a = analisarEtapa(e);
    assert.ok(a.validadores.length >= 1 && a.validadores.length <= 4, `${e.id}: ${a.validadores}`);
    assert.equal(a.validadores[0], "qa", e.id);
    // Sem UI nem MOBILE não há portão visual.
    if (!a.tags.includes("UI") && !a.tags.includes("MOBILE")) assert.equal(a.visual.aplicavel, false, e.id);
  }
});

test("CLI: tags.mjs V2-F00-E04 --json devolve JSON com tags e validadores", () => {
  const r = executarCli("tags.mjs", ["V2-F00-E04", "--json"]);
  assert.equal(r.codigo, 0, r.erro);
  const j = JSON.parse(r.saida);
  assert.equal(j.id, "V2-F00-E04");
  assert.ok(j.validadores.includes("seguranca-aplicacao"));
});

test("CLI: texto legível, ID inválido e etapa inexistente", () => {
  const texto = executarCli("tags.mjs", ["V2-F00-E04"]);
  assert.equal(texto.codigo, 0);
  assert.match(texto.saida, /Tags: /);
  assert.equal(executarCli("tags.mjs", ["E04"]).codigo, 2);
  assert.equal(executarCli("tags.mjs", ["V2-F00-E99"]).codigo, 2);
  assert.equal(executarCli("tags.mjs", ["V2-F00-E04", "--diff", "--output=x"]).codigo, 2);
  assert.equal(executarCli("tags.mjs", []).codigo, 2);
});

test("CLI: --diff com intervalo real do repositório", () => {
  const r = executarCli("tags.mjs", ["V2-F00-E04", "--diff", "HEAD..HEAD", "--json"]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(JSON.parse(r.saida).fonteDosCaminhos, /^diff HEAD\.\.HEAD$/);
});
