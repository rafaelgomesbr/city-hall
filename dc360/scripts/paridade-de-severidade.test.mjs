/**
 * A PARIDADE DO DESENHO DA SEVERIDADE entre o painel e o aplicativo.
 *
 * O defeito que este portão fecha foi visto por quem paga: "os ícones de
 * criticidade estão diferentes do app e site". Estavam. O painel punha um
 * ponto colorido na pílula e, no mapa, círculo, triângulo, quadrado e losango;
 * o aplicativo punha um medidor na pílula e, no mapa, triângulo, losango,
 * quadrado, círculo e anel, com crítica sendo círculo num lado e triângulo no
 * outro. Nenhum teste reprovava, porque cada canal era coerente consigo mesmo.
 *
 * A correção foi pôr a geometria num lugar só,
 * `packages/shared/src/glifos-de-severidade.ts`, e fazer os dois canais
 * desenharem a partir dela. Este portão é o que impede a volta: a primeira
 * pessoa com pressa que escrever um `d="M..."` de severidade dentro de uma
 * tela recria a divergência sem que nenhum outro teste perceba.
 *
 * ## O que ele cobra, em quatro regras
 *
 * 1. **Nenhum sítio de severidade desenha por conta própria.** Toda função ou
 *    constante cujo nome fala de severidade ou criticidade (`SeloSeveridade`,
 *    `FormaSeveridade`, `IconeSeveridade`, `DesenhoDaCriticidade`,
 *    `caminhoDaSeveridade`, ...) não pode conter caminho literal (`d="..."`),
 *    string que pareça caminho (`"M 8 0 A ..."`) nem primitiva de forma
 *    (`<Circle>`, `<rect>`, `<Polygon>`...). `<Path d={expressao}>` é o
 *    permitido, porque é assim que se desenha o que veio do pacote.
 *
 * 2. **Nenhum mapa de severidade para geometria, em lugar nenhum.** Um
 *    `case "critica": return "M..."` ou um `{ alta: <svg>... }` é o desenho
 *    local com outro nome, esteja dentro de um sítio nomeado ou não.
 *
 * 3. **Os sítios canônicos leem do compartilhado.** A lista está escrita à
 *    mão, um por canal e por lugar (pílula, pino do plano, marcador do Google),
 *    porque "não desenha nada" também é o que faz um sítio que ninguém ligou.
 *
 * 4. **O compartilhado tem os cinco glifos, na grade de 24.** Quatro níveis e
 *    sem classificação, cada um com contorno e marca, sem número fora da grade.
 *
 * O que ele NÃO faz, dito na cara: lê TEXTO, não árvore de sintaxe, como os
 * outros portões desta pasta. Geometria montada em tempo de execução a partir
 * de números soltos passa por ele. E ele não confere que o desenho é bonito:
 * isso foi conferido a olho, com captura, e está no relatório da entrega.
 *
 * Mora em `scripts/` pela razão escrita em `fonte-do-aplicativo.mjs`: o
 * aplicativo roda em `jest-expo`, sem `node:fs`, e varredura de arquivo
 * precisa dele. `npm run test:scripts` já roda tudo que casa com
 * `scripts/*.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { RAIZ_DO_REPO, arquivosDeFonte, semComentarios } from "./fonte-do-aplicativo.mjs";

const RAIZ_DO_PAINEL = join(RAIZ_DO_REPO, "apps", "web", "src");
const RAIZ_DO_APLICATIVO = join(RAIZ_DO_REPO, "apps", "campo", "src");
const COMPARTILHADO = join(RAIZ_DO_REPO, "packages", "shared", "src", "glifos-de-severidade.ts");

/** Caminho mostrado nas mensagens, relativo à raiz do dc360. */
function nome(caminho) {
  return relative(RAIZ_DO_REPO, caminho).split(sep).join("/");
}

/* ============================================================
   O que é "geometria escrita à mão"
   ============================================================ */

const GEOMETRIA = [
  {
    nome: "caminho literal",
    padrao: /(?<![\w$])d\s*[=:]\s*["'`]/,
    porque: "o `d` de severidade vem de `glifoDeSeveridade(...)`, e não de uma string na tela",
  },
  {
    nome: "string que é caminho SVG",
    padrao: /["'`]\s*[Mm]\s*-?\d/,
    porque: "um \"M 8 0 A ...\" é um caminho com outro nome",
  },
  {
    nome: "primitiva de forma",
    padrao: /<(?:Circle|Rect|Polygon|Ellipse|Line|circle|rect|polygon|ellipse|line)\b/,
    porque: "círculo, retângulo ou polígono desenhado à mão é forma que o outro canal não tem",
  },
];

function geometriaEm(trecho) {
  return GEOMETRIA.filter((regra) => regra.padrao.test(trecho));
}

/* ============================================================
   Leitura: sítios nomeados e mapas por severidade
   ============================================================ */

/** Índice do delimitador que fecha o aberto em `abre` (`{`/`}` ou `(`/`)`), ou -1. Pula strings. */
function fecha(texto, abre) {
  const abertura = texto[abre];
  const fechamento = abertura === "(" ? ")" : "}";
  let profundidade = 0;
  let aspas = null;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === "\\") { i++; continue; }
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { aspas = c; continue; }
    if (c === abertura) profundidade++;
    if (c === fechamento) {
      profundidade--;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

const NOME_DE_SITIO = /(?:function|const|let)\s+([A-Za-z_$][\w$]*(?:Severidade|Criticidade|SEVERIDADE|CRITICIDADE)[\w$]*)\b/g;

/**
 * Os sítios de severidade do arquivo: nome, e o corpo entre as chaves.
 *
 * O corpo NÃO é a primeira chave depois do nome: `function X({ severidade })`
 * abre uma chave na lista de parâmetros, e foi exatamente esse o primeiro
 * defeito desta leitura. Se o que vem depois do nome é um parêntese (lista de
 * parâmetros de `function X(...)` ou de `const X = (...) =>`), ele é pulado
 * inteiro, balanceado, e o corpo é a primeira chave depois dele. Se é uma
 * chave (`const X = {`), é ela. Tipos (`type`, `interface`) ficam de fora:
 * eles não desenham.
 */
export function sitiosDeSeveridade(fonte) {
  const sitios = [];
  for (const casou of fonte.matchAll(NOME_DE_SITIO)) {
    let cursor = casou.index + casou[0].length;
    const parentese = fonte.indexOf("(", cursor);
    const chave = fonte.indexOf("{", cursor);
    if (chave === -1) continue;
    if (parentese !== -1 && parentese < chave) {
      const fimDosParametros = fecha(fonte, parentese);
      if (fimDosParametros === -1) continue;
      cursor = fimDosParametros + 1;
    }
    const abre = fonte.indexOf("{", cursor);
    if (abre === -1) continue;
    const fim = fecha(fonte, abre);
    if (fim === -1) continue;
    sitios.push({
      nome: casou[1],
      abre,
      corpo: fonte.slice(abre, fim + 1),
    });
  }
  return sitios;
}

const CHAVE_DE_SEVERIDADE = /(?:case\s+["'](?:critica|alta|media|baixa)["']\s*:|(?<![\w$.-])(?:critica|alta|media|baixa)\s*:)/g;

/**
 * O valor associado a uma chave de severidade: do `:` até a vírgula, o
 * ponto e vírgula ou o próximo `case` no mesmo nível, com colchetes, chaves
 * e parênteses respeitados.
 */
export function valorDaChave(fonte, depoisDoDoisPontos) {
  let profundidade = 0;
  let aspas = null;
  for (let i = depoisDoDoisPontos; i < fonte.length; i++) {
    const c = fonte[i];
    if (aspas) {
      if (c === "\\") { i++; continue; }
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { aspas = c; continue; }
    if ("{[(".includes(c)) profundidade++;
    if ("}])".includes(c)) {
      if (profundidade === 0) return fonte.slice(depoisDoDoisPontos, i);
      profundidade--;
      continue;
    }
    if (profundidade === 0) {
      if (c === "," || c === ";") return fonte.slice(depoisDoDoisPontos, i);
      if (fonte.startsWith("case ", i) || fonte.startsWith("default:", i)) {
        return fonte.slice(depoisDoDoisPontos, i);
      }
    }
  }
  return fonte.slice(depoisDoDoisPontos);
}

function linhaDe(fonte, indice) {
  return fonte.slice(0, indice).split("\n").length;
}

/**
 * Tudo que o arquivo desenha de severidade fora do compartilhado.
 *
 * Devolve uma lista de acusações com arquivo, linha, regra e razão, vazia
 * quando o arquivo está limpo. É função pura sobre o texto, para o caso que
 * prova a mordida poder alimentá-la com um arquivo modificado.
 */
export function acusacoes(fonteCrua, arquivo) {
  const fonte = semComentarios(fonteCrua);
  const achados = [];

  for (const sitio of sitiosDeSeveridade(fonte)) {
    for (const regra of geometriaEm(sitio.corpo)) {
      const dentro = regra.padrao.exec(sitio.corpo);
      achados.push({
        arquivo,
        linha: linhaDe(fonte, sitio.abre + dentro.index),
        regra: `${regra.nome} dentro de ${sitio.nome}`,
        porque: regra.porque,
      });
    }
  }

  for (const casou of fonte.matchAll(CHAVE_DE_SEVERIDADE)) {
    const doisPontos = casou.index + casou[0].length;
    const valor = valorDaChave(fonte, doisPontos);
    for (const regra of geometriaEm(valor)) {
      achados.push({
        arquivo,
        linha: linhaDe(fonte, casou.index),
        regra: `${regra.nome} como valor de ${casou[0].trim()}`,
        porque: "mapa de severidade para geometria é o desenho local com outro nome",
      });
    }
  }

  return achados;
}

function varrer(raiz) {
  const achados = [];
  for (const caminho of arquivosDeFonte(raiz)) {
    achados.push(...acusacoes(readFileSync(caminho, "utf8"), nome(caminho)));
  }
  return achados;
}

function relatorio(achados) {
  return achados
    .map((a) => `${a.arquivo}:${a.linha} [${a.regra}]\n      porque: ${a.porque}`)
    .join("\n");
}

/* ============================================================
   Regras 1 e 2: ninguém desenha severidade fora do compartilhado
   ============================================================ */

test("a varredura enxerga os dois canais de verdade", () => {
  const painel = arquivosDeFonte(RAIZ_DO_PAINEL).map(nome);
  const aplicativo = arquivosDeFonte(RAIZ_DO_APLICATIVO).map(nome);
  assert.ok(painel.includes("apps/web/src/componentes/comuns.tsx"), "o painel sumiu da varredura");
  assert.ok(painel.includes("apps/web/src/paginas/mapa-de-base.ts"), "o mapa do painel sumiu da varredura");
  assert.ok(aplicativo.includes("apps/campo/src/ui/icones.tsx"), "os ícones do aplicativo sumiram da varredura");
  assert.ok(
    aplicativo.includes("apps/campo/src/ui/mapa/DesenhoDaCriticidade.tsx"),
    "o pino do aplicativo sumiu da varredura",
  );
});

test("o painel não desenha severidade com forma própria", () => {
  const achados = varrer(RAIZ_DO_PAINEL);
  assert.deepEqual(
    achados,
    [],
    "o painel voltou a desenhar severidade por conta própria. O glifo vem de "
    + "`@dc360/shared` (`glifoDeSeveridade`), e o aplicativo desenha o mesmo:\n"
    + relatorio(achados),
  );
});

test("o aplicativo não desenha severidade com forma própria", () => {
  const achados = varrer(RAIZ_DO_APLICATIVO);
  assert.deepEqual(
    achados,
    [],
    "o aplicativo voltou a desenhar severidade por conta própria. O glifo vem de "
    + "`@dc360/shared` (`glifoDeSeveridade`), e o painel desenha o mesmo:\n"
    + relatorio(achados),
  );
});

/* ============================================================
   Regra 3: os sítios canônicos leem do compartilhado
   ============================================================ */

/**
 * Um por lugar onde a severidade é desenhada: pílula, pino e marcador do
 * Google em cada canal. Se um deles sumir ou deixar de ler o pacote, o
 * "ninguém desenha por conta própria" das regras acima vira "ninguém desenha",
 * e isso não é paridade.
 */
const SITIOS_CANONICOS = [
  ["apps/web/src/componentes/comuns.tsx", "SeloSeveridade", /glifoDeSeveridade\(/],
  ["apps/web/src/componentes/Icones.tsx", "FormaSeveridade", /glifoDeSeveridade\(/],
  ["apps/web/src/paginas/mapa-de-base.ts", "caminhoDaSeveridade", /glifoDeSeveridade\(/],
  ["apps/campo/src/ui/icones.tsx", "IconeSeveridade", /glifoDeSeveridade\(/],
  ["apps/campo/src/ui/Chip.tsx", "SeloSeveridade", /IconeSeveridade[^>]*severidade=\{severidade\}/],
  ["apps/campo/src/ui/mapa/criticidade.ts", "aparenciaDaCriticidade", /glifoDeSeveridade\(/],
  ["apps/campo/src/ui/mapa/DesenhoDaCriticidade.tsx", "DesenhoDaCriticidade", /glifo\.contorno[\s\S]*glifo\.marca/],
];

test("cada sítio canônico existe e lê o glifo do pacote compartilhado", () => {
  const faltando = [];
  for (const [arquivo, sitio, prova] of SITIOS_CANONICOS) {
    const fonte = semComentarios(readFileSync(join(RAIZ_DO_REPO, arquivo), "utf8"));
    const achado = sitiosDeSeveridade(fonte).find((s) => s.nome === sitio);
    if (!achado) { faltando.push(`${arquivo}: ${sitio} não existe mais`); continue; }
    if (!prova.test(achado.corpo)) faltando.push(`${arquivo}: ${sitio} não lê mais o glifo compartilhado (${prova})`);
  }
  assert.deepEqual(faltando, [], faltando.join("\n"));
});

/* ============================================================
   Regra 4: o compartilhado tem os cinco glifos, na grade de 24
   ============================================================ */

const CHAVES = ["baixa", "media", "alta", "critica", "sem_classificacao"];

/** O bloco `{ ... }` de uma chave do registro, no texto do compartilhado. */
function blocoDaChave(fonte, chave) {
  const casou = new RegExp(`(?<![\\w$])${chave}\\s*:\\s*\\{`).exec(fonte);
  if (!casou) return null;
  const abre = casou.index + casou[0].length - 1;
  const fim = fecha(fonte, abre);
  return fim === -1 ? null : fonte.slice(abre, fim + 1);
}

test("o compartilhado declara os cinco glifos com contorno, marca e preenchimento", () => {
  const fonte = semComentarios(readFileSync(COMPARTILHADO, "utf8"));
  assert.match(fonte, /export const GRADE_DO_GLIFO = 24;/, "a grade deixou de ser 24, ou mudou de nome");
  assert.match(fonte, /export const TRACO_DO_GLIFO = 1\.8;/, "o traço deixou de ser 1,8, ou mudou de nome");
  assert.match(
    fonte,
    /VIEWBOX_DO_GLIFO = `0 0 \$\{GRADE_DO_GLIFO\} \$\{GRADE_DO_GLIFO\}`/,
    "o viewBox deixou de derivar da grade",
  );

  const problemas = [];
  for (const chave of CHAVES) {
    const bloco = blocoDaChave(fonte, chave);
    if (!bloco) { problemas.push(`${chave}: não está no registro`); continue; }
    if (!/contorno\s*:/.test(bloco)) problemas.push(`${chave}: sem contorno`);
    if (!/marca\s*:/.test(bloco)) problemas.push(`${chave}: sem marca`);
    if (!/preenche\s*:\s*(?:true|false)/.test(bloco)) problemas.push(`${chave}: sem preenche`);
    /*
      Todo número dentro de uma string de caminho cabe na grade. Coordenada
      fora de 0..24 sai cortada no aparelho e no marcador do Google, e não há
      outro lugar que confira isso para os dois canais de uma vez.
    */
    for (const texto of bloco.matchAll(/"([^"]*)"/g)) {
      for (const numero of texto[1].match(/-?\d*\.?\d+/g) ?? []) {
        if (Math.abs(Number(numero)) > 24) problemas.push(`${chave}: ${numero} está fora da grade de 24 em "${texto[1]}"`);
      }
    }
  }
  assert.deepEqual(problemas, [], problemas.join("\n"));
});

/* ============================================================
   A prova de que o portão morde
   ============================================================ */

test("a varredura acusa um caminho local reintroduzido no selo do painel", () => {
  /*
    O caso-irmão. Pega o `comuns.tsx` real, injeta dentro de `SeloSeveridade`
    exatamente o tipo de linha que alguém com pressa escreveria, e vê o portão
    acusar as duas, com o nome do sítio e a linha. Sem isto, as regras acima
    poderiam estar varrendo uma lista vazia e dando verde para sempre.
  */
  const original = readFileSync(join(RAIZ_DO_PAINEL, "componentes", "comuns.tsx"), "utf8");
  assert.deepEqual(acusacoes(original, "comuns.tsx"), [], "o arquivo real precisa estar limpo para o caso valer");

  const marca = "export function SeloSeveridade(";
  assert.ok(original.includes(marca), "o selo do painel mudou de nome");
  // A chave do CORPO, e não a do parâmetro desestruturado: é a que vem depois do `)`.
  const abre = original.indexOf(") {", original.indexOf(marca)) + 2;
  const modificado = original.slice(0, abre + 1)
    + '\n  const ponto = <circle cx="10" cy="10" r="4" />;\n'
    + '  const pino = <path d="M10 2 19 18H1L10 2Z" />;\n'
    + original.slice(abre + 1);

  const achados = acusacoes(modificado, "comuns.tsx");
  const regras = achados.map((a) => a.regra);
  assert.ok(regras.some((r) => r.startsWith("primitiva de forma dentro de SeloSeveridade")), `não acusou o <circle>: ${regras}`);
  assert.ok(regras.some((r) => r.startsWith("caminho literal dentro de SeloSeveridade")), `não acusou o d="...": ${regras}`);
  for (const achado of achados) assert.ok(achado.linha > 1, "a linha acusada precisa ser real");
});

test("a varredura acusa um mapa de severidade para caminho reintroduzido no marcador do Google", () => {
  const original = readFileSync(join(RAIZ_DO_PAINEL, "paginas", "mapa-de-base.ts"), "utf8");
  assert.deepEqual(acusacoes(original, "mapa-de-base.ts"), []);

  const modificado = original
    + '\nexport function caminhoAntigo(severidade) {\n'
    + '  switch (severidade) {\n'
    + '    case "critica": return "M 8 0 A 8 8 0 1 1 -8 0 A 8 8 0 1 1 8 0 Z";\n'
    + '    default: return "";\n'
    + '  }\n}\n';

  const achados = acusacoes(modificado, "mapa-de-base.ts");
  assert.ok(
    achados.some((a) => a.regra === 'string que é caminho SVG como valor de case "critica":'),
    `não acusou o case: ${achados.map((a) => a.regra)}`,
  );
});

test("a varredura acusa o medidor antigo do aplicativo, e um objeto com forma por nível", () => {
  const original = readFileSync(join(RAIZ_DO_APLICATIVO, "ui", "icones.tsx"), "utf8");
  assert.deepEqual(acusacoes(original, "icones.tsx"), []);

  const medidor = original
    + '\nexport function IconeSeveridadeAntigo({ cor }) {\n'
    + '  return <Svg><Path d="M2.8 20v-1.8a9.2 9.2 0 0 1 18.4 0V20Z" stroke={cor} /></Svg>;\n'
    + '}\n';
  assert.ok(
    acusacoes(medidor, "icones.tsx").some((a) => a.regra === "caminho literal dentro de IconeSeveridadeAntigo"),
    "o medidor com caminho literal passou",
  );

  const porNivel = original + '\nconst FORMAS = { alta: <Rect x="4" y="4" width="16" height="16" />, baixa: null };\n';
  assert.ok(
    acusacoes(porNivel, "icones.tsx").some((a) => a.regra === "primitiva de forma como valor de alta:"),
    "o objeto com forma por nível passou",
  );
});

test("a varredura não reclama do que está certo", () => {
  /*
    Falso positivo em portão de texto é o jeito mais rápido de o portão ser
    desligado. O que precisa passar: `<Path d={d}>` com expressão, mapa de
    severidade para cor, para prazo e para palavra, e comentário citando um
    caminho.
  */
  const certos = [
    'function IconeSeveridade({ cor }) { return <Svg>{caminhosDoGlifo(glifo).map((d) => <Path key={d} d={d} stroke={cor} />)}</Svg>; }',
    'const PRAZO = { baixa: 72, media: 48, alta: 24, critica: 4 };',
    'const ROTULO = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };',
    'function tokenDaSeveridade(s) { switch (s) { case "critica": return "--ds-sev-critica-bg"; default: return "--ds-text-muted"; } }',
    '/* o caminho antigo era d="M 8 0 A 8 8 0 1 1 -8 0" e um <circle> */ const x = 1;',
    'const TOM = { baixa: "sevBaixa", media: "sevMedia", alta: "sevAlta", critica: "sevCritica" };',
    'export function SeloSeveridade({ severidade }) { const glifo = glifoDeSeveridade(severidade); return <svg viewBox={VIEWBOX_DO_GLIFO}><path d={glifo.contorno} /></svg>; }',
  ];
  for (const linha of certos) {
    assert.deepEqual(acusacoes(linha, "(exemplo)"), [], `falso positivo em: ${linha}`);
  }
});

test("o leitor de sítio pula o parâmetro desestruturado e pega o corpo de verdade", () => {
  /*
    O primeiro defeito desta leitura: `function SeloSeveridade({ severidade })`
    tem uma chave ANTES do corpo, e a leitura ingênua tomava `{ severidade }`
    como o corpo inteiro. O portão então dizia que o selo "não lia o glifo" e,
    pior, deixaria passar qualquer caminho escrito dentro do corpo real.
  */
  const fonte = 'export function SeloSeveridade({ severidade }: { severidade: Severidade | null }) {\n'
    + '  return glifoDeSeveridade(severidade);\n}\n'
    + 'const outraCriticidade = (a, b) => { return a + b; };\n'
    + 'const MAPA_DE_CRITICIDADE = { alta: 1 };';
  const sitios = sitiosDeSeveridade(fonte);
  assert.deepEqual(sitios.map((s) => s.nome), ["SeloSeveridade", "outraCriticidade", "MAPA_DE_CRITICIDADE"]);
  assert.match(sitios[0].corpo, /glifoDeSeveridade\(severidade\)/);
  assert.doesNotMatch(sitios[0].corpo, /Severidade \| null/);
  assert.equal(sitios[1].corpo, "{ return a + b; }");
  assert.equal(sitios[2].corpo, "{ alta: 1 }");
});

test("o leitor de valor para na vírgula do mesmo nível, e não dentro de um objeto", () => {
  const fonte = 'const A = { alta: { fundo: "x", tinta: "y" }, baixa: 1 };';
  const indice = fonte.indexOf("alta:") + "alta:".length;
  assert.equal(valorDaChave(fonte, indice).trim(), '{ fundo: "x", tinta: "y" }');
  const doCase = 'switch (s) { case "alta": return desenhar(a, b); case "baixa": return 2; }';
  const i2 = doCase.indexOf('case "alta":') + 'case "alta":'.length;
  assert.equal(valorDaChave(doCase, i2).trim(), "return desenhar(a, b)");
});
