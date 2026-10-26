import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ } from "./roadmap.mjs";
import { codigosCobertos, conferirEstrutura, diferencasComPendencias, montarDecisoes } from "./decisoes-visual.mjs";

const DADOS = {
  posicao: "25/10/2026",
  titulo: "O que só uma pessoa pode resolver",
  lead: "Texto de abertura.",
  grupos: [
    { id: "agora", titulo: "Agora", texto: "Fecham o gate." },
    { id: "espera", titulo: "Podem esperar", texto: "Sem prazo." },
  ],
  caminho: {
    titulo: "O caminho",
    passos: [
      { rotulo: "Hoje", texto: "Feito", estado: "feito" },
      { rotulo: "H09", texto: "Decidir", estado: "voce" },
      { rotulo: "Fase 1", texto: "Começa", estado: "depois" },
    ],
    fora: "Em paralelo: H10.",
  },
  decisoes: [
    {
      codigo: "H09",
      curto: "Aprovar o gate",
      grupo: "agora",
      etapa: "G00",
      titulo: "Aprovar o G00?",
      hoje: "O gatekeeper recomendou.",
      pergunta: "Aprova?",
      opcoes: [
        { rotulo: "Aprovar", efeito: "A fase 1 começa.", recomendada: true },
        { rotulo: "Esperar", efeito: "Nada muda." },
      ],
      tambem: "Decida a H44 antes.",
      quem: "Rafael",
      ler: "docs/x.md",
    },
    { codigo: "H05", curto: "Tecla Esc", grupo: "espera", etapa: "E09", titulo: "Esc fecha?", hoje: "Fecha.", pergunta: "Mantém?", opcoes: [{ rotulo: "Sim", efeito: "Igual." }], quem: "Rafael" },
  ],
  conferencias: {
    titulo: "Conferir",
    lead: "Só olhar.",
    tipos: [{ id: "olhar", titulo: "Olhar", texto: "Telas." }, { id: "vazio", titulo: "Vazio", texto: "Nada." }],
    itens: [
      { codigo: "H10", curto: "Frases", tipo: "olhar", etapa: "E05", fazer: "Ler a frase.", esperado: "Diz o que fazer.", reprova: "Confusa.", ler: "pasta/" },
      { codigo: "H21", curto: "Leitor de tela", tipo: "olhar", etapa: "E09", fazer: "Ouvir o leitor de tela." },
    ],
  },
};

const GLOSSARIO = {
  destaque: [{ sigla: "H44", nome: "Pendência humana", texto: "Algo que só uma pessoa resolve." }],
  completo: [{ sigla: "G00", nome: "Gate", texto: "Aprovação que fecha a fase." }, { sigla: "CI", nome: "Verificação automática", texto: "Roda os testes." }],
};
const montar = (extra = {}) => montarDecisoes({ dados: DADOS, css: ":root{--bg:#fff}", glossario: GLOSSARIO, ...extra });

test("a estrutura de teste está em ordem e os códigos cobertos são os das decisões e das conferências", () => {
  assert.deepEqual(conferirEstrutura(DADOS), []);
  assert.deepEqual(codigosCobertos(DADOS), ["H09", "H05", "H10", "H21"]);
});

test("cada decisão vira um cartão com situação, pergunta e um ramo por opção", () => {
  const { html, problemas } = montar();
  assert.deepEqual(problemas, []);
  assert.match(html, /<article class="card dcs" id="H09"/);
  assert.match(html, /class="no hoje"><small>Hoje<\/small><p>O gatekeeper recomendou\./);
  assert.match(html, /class="no pergunta"><small>Você decide<\/small><p>Aprova\?/);
  assert.match(html, /<ul class="ramos" style="--n:2">/);
  assert.match(html, /<ul class="ramos" style="--n:1">/);
  assert.equal((html.match(/<li class="ramo/g) ?? []).length, 3);
});

test("os atalhos mostram o nome legível ao lado do código, e o glossário explica as siglas", () => {
  const { html, problemas } = montar();
  assert.deepEqual(problemas, []);
  assert.ok(html.includes('<a class="chip" href="#H09"><b>H09</b><span>Aprovar o gate</span></a>'));
  assert.ok(html.includes('<h2 id="h-gloss">Como ler as siglas</h2>'));
  assert.ok(html.includes('<b class="cod-g">H44</b><span class="nome-g">Pendência humana'));
  assert.ok(html.includes("<dt>G00<small>Gate</small></dt><dd>Aprovação que fecha a fase.</dd>"));
  assert.match(html, /2 termos/);
  assert.doesNotMatch(montarDecisoes({ dados: DADOS, css: "" }).html, /h-gloss/);
});

test("a estrutura exige um nome curto em cada decisão e conferência", () => {
  const ruim = structuredClone(DADOS);
  delete ruim.decisoes[0].curto;
  delete ruim.conferencias.itens[0].curto;
  const p = conferirEstrutura(ruim);
  assert.ok(p.some((x) => /H09: falta "curto"/.test(x)));
  assert.ok(p.some((x) => /H10: falta "curto"/.test(x)));
});

test("a recomendação aparece escrita, não só pela cor", () => {
  const { html } = montar();
  assert.equal((html.match(/Recomendada no documento/g) ?? []).length, 1);
  assert.match(html, /class="ramo rec"><b><span class="letra" aria-hidden="true">A<\/span>Aprovar/);
});

test("conferência: sem 'deve acontecer' e sem 'reprova se' vira um passo só", () => {
  const { html } = montar();
  assert.match(html, /<article class="card conf" id="H10"[\s\S]*fluxo-linha n3/);
  assert.match(html, /<article class="card conf" id="H21"[\s\S]*fluxo-linha n1/);
  assert.equal((html.match(/Reprova se/g) ?? []).length, 1);
});

test("tipo de conferência sem item não gera seção, e o caminho marca o estado por texto", () => {
  const { html } = montar();
  assert.doesNotMatch(html, />Vazio</);
  assert.match(html, /class="passo voce"[^>]*>[\s\S]*sua decisão/);
  assert.match(html, /class="passo feito"[\s\S]*feito/);
});

test("os contadores do topo saem dos dados", () => {
  const { html } = montar();
  assert.match(html, /<b>2<\/b><span>decisões a tomar/);
  assert.match(html, /<b>1<\/b><span>fecham o gate G00/);
  assert.match(html, /<b>2<\/b><span>conferências a fazer/);
});

test("links de volta e de saída só aparecem quando pedidos", () => {
  assert.doesNotMatch(montar().html, /Voltar ao relatório/);
  assert.doesNotMatch(montar().html, /class="sair"/);
  const r = montar({ linkDoRelatorio: "/progresso", linkDeSaida: "/progresso/sair" }).html;
  assert.match(r, /<a class="voltar" href="\/progresso">/);
  assert.match(r, /<a class="sair" href="\/progresso\/sair">Sair<\/a>/);
});

test("o texto é escapado e passa pela conferência (travessão, 'pronto', segredo)", () => {
  const sujo = structuredClone(DADOS);
  sujo.decisoes[0].hoje = "Aberto <script>alert(1)</script>";
  const r = montarDecisoes({ dados: sujo, css: "" });
  assert.doesNotMatch(r.html, /<script>alert/);
  assert.match(r.html, /&lt;script&gt;/);
  sujo.decisoes[0].opcoes[0].efeito = "Fica pronto — sim.";
  const p = montarDecisoes({ dados: sujo, css: "" }).problemas;
  assert.ok(p.some((x) => /travessão/.test(x)));
  assert.ok(p.some((x) => /pronto/.test(x)));
});

test("a estrutura recusa código repetido, grupo inexistente e decisão sem opção", () => {
  const ruim = structuredClone(DADOS);
  ruim.decisoes[1].codigo = "H09";
  ruim.decisoes[1].grupo = "nao-existe";
  ruim.decisoes[1].opcoes = [];
  ruim.conferencias.itens[1].tipo = "nao-existe";
  const p = conferirEstrutura(ruim);
  assert.ok(p.some((x) => /H09: código repetido/.test(x)));
  assert.ok(p.some((x) => /grupo "nao-existe"/.test(x)));
  assert.ok(p.some((x) => /sem opções/.test(x)));
  assert.ok(p.some((x) => /tipo "nao-existe"/.test(x)));
});

test("diferenças com pendencias-humanas.md: abertos sem cartão e cartões de itens que saíram", () => {
  const md = [
    "## A. Decisões",
    "| H09 | G00 | aprovar |",
    "| H05 | E09 | esc |",
    "| H99 | E01 | novo, sem cartão |",
    "## B. Texto",
    "| H10 | E05 | frase |",
    "## E. Correções",
    "| H21 | texto solto |",
    "## F. Resolvidos",
    "| H21 | 2026-10-25 | resolvido | ok |",
  ].join("\n");
  const d = diferencasComPendencias({ dados: DADOS, markdown: md });
  assert.deepEqual(d.faltam, ["H99"]);
  assert.deepEqual(d.resolvidas, ["H21"]);
  assert.deepEqual(d.resolvidasNoDocumento, ["H21"]);
});

test("decisoes.json REAL: estrutura em ordem, texto aprovado na conferência e opções sem inventar recomendação", () => {
  const dados = JSON.parse(readFileSync(join(RAIZ, "docs", "relatorios-v2", "semanais", "progresso", "decisoes.json"), "utf8"));
  const glossario = JSON.parse(readFileSync(join(RAIZ, "docs", "relatorios-v2", "semanais", "progresso", "glossario.json"), "utf8"));
  const { problemas, html } = montarDecisoes({ dados, css: "", glossario });
  assert.deepEqual(problemas, []);
  assert.ok(glossario.completo.length >= 15 && glossario.destaque.length === 4);
  assert.ok(dados.decisoes.length >= 10);
  assert.ok(dados.conferencias.itens.length >= 10);
  // Só H44, H09 e H33 têm recomendação escrita no pendencias-humanas.md ou no roteiro do G00.
  const recomendadas = dados.decisoes.filter((d) => d.opcoes.some((o) => o.recomendada)).map((d) => d.codigo);
  assert.deepEqual(recomendadas.sort(), ["H09", "H33", "H44"]);
  assert.match(html, /id="H44"/);
});
