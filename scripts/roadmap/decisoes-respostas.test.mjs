import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { RAIZ } from "./roadmap.mjs";
import { montarDecisoes } from "./decisoes-visual.mjs";

const modelo = join(RAIZ, "docs", "relatorios-v2", "modelo");
const codigo = readFileSync(join(modelo, "decisoes.js"), "utf8");
const modulo = { exports: {} };
vm.runInNewContext(codigo, { module: modulo });
const { gerarTexto } = modulo.exports;

const ITENS = [
  { codigo: "H44", curto: "Tipo de merge", tipo: "decisao", opcoes: [{ valor: "A", rotulo: "Merge primeiro" }, { valor: "B", rotulo: "Regra como está" }] },
  { codigo: "H09", curto: "Aprovar o G00", tipo: "decisao", opcoes: [{ valor: "A", rotulo: "Aprovar" }, { valor: "outra", rotulo: "Outra decisão" }] },
  { codigo: "H04", curto: "Fotos", tipo: "decisao", opcoes: [{ valor: "A", rotulo: "Anexo" }, { valor: "B", rotulo: "Teto" }] },
  { codigo: "H18", curto: "Foto na vistoria", tipo: "conferencia", opcoes: [{ valor: "feito", rotulo: "Feito" }, { valor: "reprovo", rotulo: "Reprovo" }] },
  { codigo: "H19", curto: "Sair da conta", tipo: "conferencia", opcoes: [{ valor: "feito", rotulo: "Feito" }, { valor: "reprovo", rotulo: "Reprovo" }] },
  { codigo: "H20", curto: "Coleta sem sinal", tipo: "conferencia", opcoes: [{ valor: "feito", rotulo: "Feito" }] },
];
const AGORA = new Date(2026, 9, 26, 14, 5);

test("relatório: decisões, outra decisão, conferências e o que ficou sem resposta", () => {
  const estado = {
    H44: { v: ["A"], nota: "" },
    H09: { v: ["outra"], nota: "Aprovar depois de ler.\nSegunda linha." },
    H04: { v: ["A", "B"], nota: "" },
    H18: { v: ["feito"], nota: "" },
    H19: { v: ["reprovo"], nota: "Rascunho some." },
  };
  const t = gerarTexto(ITENS, estado, AGORA, "25/10/2026");
  assert.match(t, /Gerado em 26\/10\/2026 14:05, a partir da página na posição de 25\/10\/2026\./);
  assert.match(t, /DECISÕES TOMADAS \(3 de 3\)/);
  assert.match(t, /- H44 · Tipo de merge: A\. Merge primeiro\n/);
  assert.match(t, /- H09 · Aprovar o G00: Outra decisão: Aprovar depois de ler\.\n  Segunda linha\./);
  assert.match(t, /- H04 · Fotos: A\. Anexo \+ B\. Teto/);
  assert.match(t, /CONFERÊNCIAS \(2 de 3\)/);
  assert.match(t, /- H18 · Foto na vistoria: FEITO/);
  assert.match(t, /- H19 · Sair da conta: REPROVO\n  Motivo ou observação: Rascunho some\./);
  assert.match(t, /SEM RESPOSTA \(1\)\nH20 \(Coleta sem sinal\)/);
});

test("relatório: observação junto de uma opção, só observação e nada respondido", () => {
  const t = gerarTexto(ITENS, { H44: { v: ["B"], nota: "Só depois do G00." }, H18: { v: [], nota: "Não achei o aparelho." } }, AGORA, "x");
  assert.match(t, /- H44 · Tipo de merge: B\. Regra como está\n  Observação: Só depois do G00\./);
  assert.match(t, /SÓ COM OBSERVAÇÃO \(1\)\n- H18 · Foto na vistoria: nenhuma opção marcada\.\n  Observação: Não achei o aparelho\./);
  const vazio = gerarTexto(ITENS, {}, AGORA, "x");
  assert.match(vazio, /DECISÕES TOMADAS \(0 de 3\)\n- nenhuma/);
  assert.match(vazio, /SEM RESPOSTA \(6\)/);
  assert.doesNotMatch(vazio, /SÓ COM OBSERVAÇÃO/);
});

test("relatório: 'outra decisão' sem texto não some e espaços sobrando não contam", () => {
  const t = gerarTexto(ITENS, { H09: { v: ["outra"], nota: "   " } }, AGORA, "x");
  assert.match(t, /- H09 · Aprovar o G00: Outra decisão \(sem texto\)/);
});

const DADOS = {
  posicao: "25/10/2026",
  titulo: "T", lead: "L",
  grupos: [{ id: "g", titulo: "G", texto: "t" }],
  caminho: { titulo: "C", passos: [{ rotulo: "Hoje", texto: "x", estado: "feito" }] },
  decisoes: [
    { codigo: "H44", curto: "Merge", grupo: "g", etapa: "G00", titulo: "Merge?", hoje: "h", pergunta: "p?", opcoes: [{ rotulo: "Um", efeito: "e1" }, { rotulo: "Dois", efeito: "e2" }], quem: "Rafael" },
    { codigo: "H04", curto: "Fotos", grupo: "g", etapa: "E06", titulo: "Fotos?", hoje: "h", pergunta: "p?", multipla: true, opcoes: [{ rotulo: "Um", efeito: "e1" }, { rotulo: "Dois", efeito: "e2" }], quem: "Rafael" },
  ],
  conferencias: { titulo: "Conf", lead: "l", tipos: [{ id: "o", titulo: "O", texto: "t" }], itens: [{ codigo: "H18", curto: "Foto", tipo: "o", etapa: "E16", fazer: "Fazer." }] },
};

test("página: cada decisão tem opções marcáveis, 'outra decisão' com campo de texto e botão de limpar", () => {
  const { html, problemas } = montarDecisoes({ dados: DADOS, css: "", script: "window.x = 1;" });
  assert.deepEqual(problemas, []);
  const h44 = html.slice(html.indexOf('id="H44"'), html.indexOf('id="H04"'));
  assert.equal((h44.match(/type="radio"/g) ?? []).length, 3);
  assert.match(h44, /value="outra" data-valor data-rotulo="Outra decisão"/);
  assert.match(h44, /<textarea rows="2"/);
  assert.match(h44, /data-limpar/);
  assert.match(h44, /data-resp="H44" data-curto="Merge" data-tipo="decisao"/);
});

test("página: decisão de resposta múltipla usa caixas de marcar, conferência usa feito e reprovo", () => {
  const { html } = montarDecisoes({ dados: DADOS, css: "" });
  const h04 = html.slice(html.indexOf('id="H04"'), html.indexOf('id="H18"'));
  assert.equal((h04.match(/type="checkbox"/g) ?? []).length, 3);
  assert.doesNotMatch(h04, /type="radio"/);
  assert.match(h04, /pode marcar mais de uma/);
  const h18 = html.slice(html.indexOf('id="H18"'));
  assert.match(h18, /value="feito"/);
  assert.match(h18, /value="reprovo"/);
  assert.match(h18, /data-tipo="conferencia"/);
});

test("página: seção do relatório, botões, barra de contagem e o script embutido", () => {
  const { html } = montarDecisoes({ dados: DADOS, css: "", script: "window.x = 1;" });
  for (const id of ["btn-gerar", "btn-copiar", "btn-apagar", "relatorio-saida", "relatorio-aviso"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<h2 id="h-relatorio">Gerar o relatório das suas respostas<\/h2>/);
  assert.match(html, /class="barra-resp"/);
  assert.match(html, /<div class="dc" data-posicao="25\/10\/2026">/);
  assert.match(html, /<script>\nwindow\.x = 1;\n<\/script>/);
  assert.doesNotMatch(montarDecisoes({ dados: DADOS, css: "" }).html, /<script>/);
});

test("página: um </script> dentro do script não fecha a tag antes da hora", () => {
  const { html } = montarDecisoes({ dados: DADOS, css: "", script: 'var a = "</script>";' });
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
});
