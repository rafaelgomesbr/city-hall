/**
 * A paridade que `src/ui/tokens.ts` PROMETE, e que não existia.
 *
 * A linha 6 daquele arquivo diz, com todas as letras:
 *
 * > Os valores aqui são cópia literal de `apps/web/src/estilos/tokens.css`, e
 * > um teste reprova se divergirem.
 *
 * Esse teste nunca foi escrito. O arquivo prometia um portão que ninguém
 * tinha, e a promessa é pior que o silêncio: quem lê aquele comentário conclui
 * que pode trocar uma cor num lado e ser avisado se esquecer o outro. Não
 * seria. A identidade deste produto já mudou uma vez inteira (laranja para
 * violeta), e da próxima vez o aplicativo ficaria para trás em silêncio, com o
 * agente e o coordenador abrindo dois produtos diferentes no mesmo dia.
 *
 * ## O que "paridade" significa aqui, já que as escalas não são as mesmas
 *
 * Não pode ser "os dois arquivos são iguais", porque não são nem devem ser: um
 * desenha um painel de mesa e o outro um telefone segurado com uma mão na
 * chuva. A regra que dá para defender é esta, em três camadas:
 *
 * 1. **Primitiva é igualdade, nos dois sentidos.** Toda cor de marca e todo
 *    neutro existe dos dois lados, com o mesmo hexadecimal e sem sobra em
 *    lado nenhum. É aqui que "cópia literal" é literalmente verdade, e é aqui
 *    que a troca de identidade entra. Cor nova num lado só reprova.
 *
 * 2. **Semântico é igualdade por par mapeado, nos dois temas.** `destaque`
 *    tem que ser o que `--ds-accent` é, no claro e no escuro. O mapa está
 *    escrito abaixo, um par por linha.
 *
 * 3. **Onde as escalas divergem, a divergência é DECLARADA, com razão.** E o
 *    portão confere que ela continua real: se alguém igualar os dois valores,
 *    a declaração some junto. Lista de exceção que ninguém poda vira lista de
 *    mentira.
 *
 * O que este portão não faz: não confere que a tela USA o token certo. Ele
 * confere que os dois dicionários concordam. Quem cobra o uso é
 * `portao-design-do-aplicativo.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RAIZ_DO_REPO, TOKENS_CSS, lerEntradas, lerTokensDoApp } from "./fonte-do-aplicativo.mjs";

const app = lerTokensDoApp();

/* ============================================================
   Leitura do `tokens.css` do painel
   ============================================================ */

/** Lê um bloco `seletor { ... }` do CSS como mapa de custom properties. */
function bloco(css, seletor) {
  const inicio = css.indexOf(seletor);
  assert.notEqual(inicio, -1, `bloco não encontrado no tokens.css: ${seletor}`);
  const abre = css.indexOf("{", inicio);
  let profundidade = 0;
  let fim = abre;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") profundidade++;
    if (css[i] === "}") {
      profundidade--;
      if (profundidade === 0) { fim = i; break; }
    }
  }
  const corpo = css.slice(abre + 1, fim).replace(/\/\*[\s\S]*?\*\//g, "");
  const mapa = {};
  for (const casou of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) mapa[casou[1]] = casou[2].trim();
  return mapa;
}

/** Resolve cadeias de `var(--x)` até chegar num literal. */
function resolver(nome, mapa, visitados = new Set()) {
  assert.equal(visitados.has(nome), false, `ciclo de var() em ${nome}`);
  visitados.add(nome);
  const valor = mapa[nome];
  assert.notEqual(valor, undefined, `token inexistente no tokens.css: ${nome}`);
  const referencia = /^var\(\s*(--[\w-]+)\s*\)$/.exec(valor);
  return referencia ? resolver(referencia[1], mapa, visitados) : valor;
}

const css = readFileSync(TOKENS_CSS, "utf8");
const painel = {
  claro: bloco(css, ":root {"),
  get escuro() { return { ...bloco(css, ":root {"), ...bloco(css, '[data-theme="dark"]') }; },
};

const pixels = (valor) => Number(String(valor).replace(/px$/, ""));
const normal = (valor) => String(valor).trim().toUpperCase();

/* ============================================================
   Camada 1: primitivas
   ============================================================ */

const PRIMITIVAS = [
  ["violeta", "v300", "--ds-violet-300"], ["violeta", "v400", "--ds-violet-400"],
  ["violeta", "v500", "--ds-violet-500"], ["violeta", "v600", "--ds-violet-600"],
  ["violeta", "v700", "--ds-violet-700"], ["violeta", "v800", "--ds-violet-800"],
  ["tinta", "t950", "--ds-ink-950"], ["tinta", "t900", "--ds-ink-900"],
  ["tinta", "t850", "--ds-ink-850"], ["tinta", "t800", "--ds-ink-800"],
  ["tinta", "t700", "--ds-ink-700"], ["tinta", "t500", "--ds-ink-500"],
  ["tinta", "t400", "--ds-ink-400"], ["tinta", "t200", "--ds-ink-200"],
  ["tinta", "t100", "--ds-ink-100"], ["tinta", "t50", "--ds-ink-50"],
  ["tinta", "branco", "--ds-white"], ["tinta", "gelo", "--ds-ice"],
];

test("primitiva: as duas paletas são a mesma paleta", () => {
  const divergem = [];
  for (const [grupo, chave, token] of PRIMITIVAS) {
    const aqui = app[grupo][chave];
    assert.notEqual(aqui, undefined, `tokens.ts não tem mais ${grupo}.${chave}`);
    const la = resolver(token, painel.claro);
    if (normal(aqui) !== normal(la)) {
      divergem.push(`${grupo}.${chave} = ${aqui}   mas   ${token} = ${la}`);
    }
  }
  assert.deepEqual(
    divergem,
    [],
    "a paleta do aplicativo divergiu da do painel. Já trocamos a identidade "
    + "inteira uma vez (laranja para violeta): é exatamente aqui que o "
    + "aplicativo ficaria para trás em silêncio.\n" + divergem.join("\n"),
  );
});

test("primitiva: nenhum dos dois lados tem cor que o outro não tem", () => {
  /*
    A igualdade sozinha não bastaria: ela confere os pares que alguém lembrou
    de listar. Uma primitiva nova, criada de um lado só, passaria batida, e é
    assim que as duas paletas começam a se afastar.
  */
  const mapeadosNoApp = new Set(PRIMITIVAS.map(([g, c]) => `${g}.${c}`));
  const noApp = [
    ...Object.keys(app.violeta).map((c) => `violeta.${c}`),
    ...Object.keys(app.tinta).map((c) => `tinta.${c}`),
  ];
  const sobrandoNoApp = noApp.filter((c) => !mapeadosNoApp.has(c));

  const mapeadosNoPainel = new Set(PRIMITIVAS.map(([, , t]) => t));
  const sobrandoNoPainel = Object.keys(painel.claro)
    .filter((t) => /^--ds-(violet|ink)-\d+$|^--ds-(white|ice)$/.test(t))
    .filter((t) => !mapeadosNoPainel.has(t));

  assert.deepEqual(
    { sobrandoNoApp, sobrandoNoPainel },
    { sobrandoNoApp: [], sobrandoNoPainel: [] },
    "primitiva que existe de um lado só. Ou ela entra no outro e na tabela "
    + "PRIMITIVAS, ou ela não devia ter nascido.",
  );
});

/* ============================================================
   Camada 2: semânticos, nos dois temas
   ============================================================ */

/**
 * O mapa, um par por linha.
 *
 * Duas diferenças de vocabulário que valem registro, porque não são descuido:
 * o painel tem `info` (azul) e o aplicativo não tem tela que o use; e o
 * aplicativo tem `alerta`, que no painel é o mesmo âmbar do selo de
 * severidade média. São os mesmos valores com nomes diferentes, e o mapa diz
 * qual é qual.
 */
const SEMANTICOS = [
  ["fundo", "--ds-bg"],
  ["superficie", "--ds-surface"],
  ["superficie2", "--ds-surface-2"],
  ["borda", "--ds-border"],
  ["texto", "--ds-text"],
  ["textoDiscreto", "--ds-text-muted"],
  ["destaque", "--ds-accent"],
  ["destaqueEscuro", "--ds-accent-hover"],
  ["sobreDestaque", "--ds-on-accent"],

  ["okTexto", "--ds-success-fg"],
  ["okFundo", "--ds-success-bg"],
  ["alertaTexto", "--ds-sev-media-fg"],
  ["alertaFundo", "--ds-sev-media-bg"],
  ["perigoTexto", "--ds-danger-fg"],
  ["perigoFundo", "--ds-danger-bg"],

  ["sevBaixaTexto", "--ds-sev-baixa-fg"],
  ["sevBaixaFundo", "--ds-sev-baixa-bg"],
  ["sevMediaTexto", "--ds-sev-media-fg"],
  ["sevMediaFundo", "--ds-sev-media-bg"],
  ["sevAltaTexto", "--ds-sev-alta-fg"],
  ["sevAltaFundo", "--ds-sev-alta-bg"],
  ["sevCriticaTexto", "--ds-sev-critica-fg"],
  ["sevCriticaFundo", "--ds-sev-critica-bg"],
];

/**
 * Divergências declaradas, com razão. Nada aqui é "deixa pra lá".
 *
 * A chave é `tema.chave` para cor e o nome do token para escala.
 */
const DIVERGENCIAS = new Map([
  [
    "temaEscuro.okFundo",
    "no tema escuro o painel pinta o selo com 12% de opacidade e deixa a superfície "
    + "de baixo aparecer; o aplicativo desenha o mesmo selo sobre fundos diferentes "
    + "(cartão, fundo da tela, faixa de sincronização) e por isso usa um opaco. O "
    + "número que importa é o contraste, e ele é medido em portao-acessibilidade-do-aplicativo",
  ],
  ["temaEscuro.alertaFundo", "mesma razão de temaEscuro.okFundo"],
  ["temaEscuro.perigoFundo", "mesma razão de temaEscuro.okFundo"],
  ["temaEscuro.sevBaixaFundo", "mesma razão de temaEscuro.okFundo"],
  ["temaEscuro.sevMediaFundo", "mesma razão de temaEscuro.okFundo"],
  ["temaEscuro.sevAltaFundo", "mesma razão de temaEscuro.okFundo"],
  [
    "toque",
    "52 no aplicativo contra 44 no painel, e a razão está escrita em tokens.ts: o "
    + "painel é ponteiro de mouse, e aqui é dedo, em pé, na chuva, às vezes com luva",
  ],
  [
    "tipografia",
    "a escala grande é de tela de mesa: display 44 e h1 32 no painel, contra 32 e 26 "
    + "no telefone. Do corpo para baixo (16, 14, 12) os dois são idênticos, e isso é "
    + "conferido abaixo, porque é onde mora o texto que o agente lê no barranco",
  ],
  [
    "movimento",
    "o painel tem três durações de transição de página (150, 200, 300) e o aplicativo "
    + "tem três de outra natureza: resposta ao dedo, mudança de estado e o clímax da "
    + "fila esvaziando, que é longo por razão declarada em tokens.ts",
  ],
]);

for (const [temaApp, temaPainel] of [["temaClaro", "claro"], ["temaEscuro", "escuro"]]) {
  test(`semântico: ${temaApp} concorda com o painel, par a par`, () => {
    const divergem = [];
    const mapa = painel[temaPainel];

    for (const [chave, token] of SEMANTICOS) {
      const aqui = app[temaApp][chave];
      assert.notEqual(aqui, undefined, `tokens.ts não tem mais ${temaApp}.${chave}`);
      const la = resolver(token, mapa);
      if (normal(aqui) === normal(la)) continue;
      if (DIVERGENCIAS.has(`${temaApp}.${chave}`)) continue;
      divergem.push(`${temaApp}.${chave} = ${aqui}   mas   ${token} = ${la}`);
    }

    assert.deepEqual(
      divergem,
      [],
      `os dois produtos deixaram de ser o mesmo produto no ${temaApp}:\n${divergem.join("\n")}\n\n`
      + "Ou o valor volta a bater, ou a diferença entra em DIVERGENCIAS com a razão escrita.",
    );
  });
}

/* ============================================================
   Camada 3: escalas
   ============================================================ */

test("escala: espaçamento e raio são idênticos aos do painel", () => {
  /*
    Estes dois não têm por que divergir, e por isso a régua aqui é igualdade
    dura. Espaçamento diferente entre as duas pontas é o que faz o mesmo cartão
    parecer apertado num lugar e folgado no outro sem ninguém saber dizer por quê.
  */
  const divergem = [];
  const espacos = [["e1", "--ds-sp-1"], ["e2", "--ds-sp-2"], ["e3", "--ds-sp-3"], ["e4", "--ds-sp-4"],
    ["e5", "--ds-sp-5"], ["e6", "--ds-sp-6"], ["e7", "--ds-sp-7"], ["e8", "--ds-sp-8"]];
  for (const [chave, token] of espacos) {
    const la = pixels(resolver(token, painel.claro));
    if (app.espaco[chave] !== la) divergem.push(`espaco.${chave} = ${app.espaco[chave]} mas ${token} = ${la}`);
  }
  const raios = [["normal", "--ds-radius"], ["cartao", "--ds-radius-card"], ["pilula", "--ds-radius-pill"]];
  for (const [chave, token] of raios) {
    const la = pixels(resolver(token, painel.claro));
    if (app.raio[chave] !== la) divergem.push(`raio.${chave} = ${app.raio[chave]} mas ${token} = ${la}`);
  }
  assert.deepEqual(divergem, [], divergem.join("\n"));
});

test("escala: do corpo do texto para baixo, as duas tipografias são a mesma", () => {
  /*
    A escala grande diverge de propósito (ver DIVERGENCIAS.tipografia): título
    de painel de mesa não cabe num telefone. Mas do corpo para baixo é onde
    vive o texto que a pessoa LÊ, e aí os dois têm que concordar, senão o
    mesmo parágrafo sai em dois tamanhos no mesmo produto.
  */
  const pares = [
    ["corpo", "--ds-fs-body", "--ds-lh-body"],
    ["corpoP", "--ds-fs-body-sm", "--ds-lh-body-sm"],
    ["legenda", "--ds-fs-caption", "--ds-lh-caption"],
  ];
  const divergem = [];
  for (const [chave, tamanho, altura] of pares) {
    const la = pixels(resolver(tamanho, painel.claro));
    const laAltura = pixels(resolver(altura, painel.claro));
    if (app.fonte[chave] !== la) divergem.push(`fonte.${chave} = ${app.fonte[chave]} mas ${tamanho} = ${la}`);
    if (app.linha[chave] !== laAltura) divergem.push(`linha.${chave} = ${app.linha[chave]} mas ${altura} = ${laAltura}`);
  }
  assert.deepEqual(divergem, [], divergem.join("\n"));
});

test("escala: o alvo de toque do aplicativo é maior que o do painel, e não menor", () => {
  /*
    A divergência está declarada, mas declarar não diz a DIREÇÃO. Se alguém
    baixasse `toque` para 40 a divergência continuaria existindo e o portão
    continuaria verde. O que precisa valer é que o dedo tem mais espaço que o
    ponteiro, sempre.
  */
  const doPainel = pixels(resolver("--ds-touch", painel.claro));
  assert.ok(
    app.toque > doPainel,
    `toque do aplicativo (${app.toque}) precisa ser maior que o do painel (${doPainel}): `
    + "aqui é dedo com luva na chuva, lá é ponteiro de mouse",
  );
  assert.ok(app.fonteMinima >= pixels(resolver("--ds-fs-caption", painel.claro)),
    "o piso de fonte do aplicativo caiu abaixo da legenda do painel");
});

test("nenhuma divergência declarada sobreviveu ao próprio conserto", () => {
  /*
    A metade que impede a lista de virar mentira. Cada entrada de DIVERGENCIAS
    que fala de um par de cor precisa ESTAR divergindo de verdade. No dia em
    que alguém igualar os dois valores, a linha sai daqui, e quem lê a lista
    continua lendo a verdade.
  */
  const iguais = [];
  for (const chave of DIVERGENCIAS.keys()) {
    const casou = /^(temaClaro|temaEscuro)\.(\w+)$/.exec(chave);
    if (!casou) continue;
    const [, tema, campo] = casou;
    const par = SEMANTICOS.find(([c]) => c === campo);
    assert.ok(par, `DIVERGENCIAS nomeia ${chave}, que não está mais no mapa SEMANTICOS`);
    const mapa = tema === "temaClaro" ? painel.claro : painel.escuro;
    if (normal(app[tema][campo]) === normal(resolver(par[1], mapa))) iguais.push(chave);
  }
  assert.deepEqual(
    iguais,
    [],
    "estes valores voltaram a ser iguais aos do painel e continuam declarados como "
    + "divergência. Tire a linha de DIVERGENCIAS:\n" + iguais.join("\n"),
  );
});

test("a paridade pega o que deveria pegar", () => {
  /*
    Prova da própria varredura. Sem ela, um erro na leitura do CSS ou do
    TypeScript faria tudo passar vazio: é literalmente o defeito que este
    arquivo existe para corrigir, porque o portão prometido em tokens.ts nunca
    tinha sido escrito e ninguém notou por meses.
  */
  assert.ok(PRIMITIVAS.length >= 18, "a tabela de primitivas encolheu");
  assert.ok(SEMANTICOS.length >= 20, "o mapa semântico encolheu");

  // O CSS de fato foi lido, e as cadeias de var() de fato resolvem.
  assert.equal(normal(resolver("--ds-accent", painel.claro)), "#5B21B6");
  assert.equal(normal(resolver("--ds-accent", painel.escuro)), "#A78BFA");
  assert.notEqual(resolver("--ds-bg", painel.claro), resolver("--ds-bg", painel.escuro));

  // E o TypeScript também, com a referência a primitiva já desembrulhada.
  assert.equal(normal(app.temaClaro.destaque), "#5B21B6");
  assert.equal(normal(app.temaEscuro.destaque), "#A78BFA");

  // A comparação reprova de verdade quando os valores diferem.
  assert.notEqual(normal("#5B21B6"), normal("#4C1D95"));
  assert.equal(normal("#5b21b6"), normal("#5B21B6"), "a comparação virou sensível a maiúscula");

  /*
    E o leitor do TypeScript não corta o valor no meio.

    Este caso nasceu de um defeito achado na rodada de mutação: a primeira
    versão do parser partia em toda vírgula, e `rgba(255, 135, 135, 0.12)`
    (que é a forma dos selos do tema escuro do PAINEL, e pode chegar aqui
    amanhã) virava `"rgba(255`. A paridade então comparava um pedaço de texto
    contra o painel, e nada acusava: os dois simplesmente nunca eram iguais, e
    a divergência que existisse de verdade ficava indistinguível do erro de
    leitura.
  */
  const lido = lerEntradas('a: "rgba(255, 135, 135, 0.12)", b: "#FFFFFF", c: tinta.t50,');
  assert.equal(lido.a, '"rgba(255, 135, 135, 0.12)"');
  assert.equal(lido.b, '"#FFFFFF"');
  assert.equal(lido.c, "tinta.t50");
});

/* ============================================================
   A outra promessa do mesmo arquivo
   ============================================================ */

test("os tokens de papel são os mesmos da folha impressa", () => {
  /*
    `tokens.ts` faz uma segunda promessa sem portão, e ela é mais cara que a
    primeira: diz que as cores de `papel` são "os mesmos do papel de verdade,
    em apps/api/src/documentos/folha.ts".

    O custo de quebrar isso já foi pago uma vez. O quadro de assinatura
    desenhava o traço com a cor do tema; no tema escuro isso é quase branco; o
    PNG rasterizado entra no laudo, cujo papel é branco; e a assinatura do
    morador, que é a prova de que ele estava na casa no dia da interdição,
    ficava invisível no documento oficial. A defesa contra a volta disso é a
    paleta fixa de documento, e ela só serve enquanto for a MESMA dos dois
    lados: o agente vira o telefone para o morador ver o que vai assinar, e o
    que ele assina precisa ser o que sai impresso.
  */
  const folha = readFileSync(join(RAIZ_DO_REPO, "apps/api/src/documentos/folha.ts"), "utf8");
  const da = (nome) => {
    const casou = new RegExp(`--${nome}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(folha);
    assert.ok(casou, `folha.ts não declara mais --${nome}`);
    return casou[1];
  };

  const divergem = [];
  for (const [chave, variavel] of [
    ["fundo", "papel"], ["tinta", "tinta"], ["tintaDiscreta", "tinta-fraca"], ["linha", "linha"],
  ]) {
    if (normal(app.papel[chave]) !== normal(da(variavel))) {
      divergem.push(`papel.${chave} = ${app.papel[chave]} mas --${variavel} = ${da(variavel)}`);
    }
  }
  assert.deepEqual(
    divergem,
    [],
    "a minuta no aparelho deixou de ser o mesmo papel que sai impresso:\n" + divergem.join("\n"),
  );

  // E o papel é OPACO. Cor com transparência aqui vira PNG transparente, e o
  // traço passa a depender do que estiver atrás dele no visualizador de quem
  // abrir o laudo.
  assert.match(app.papel.fundo, /^#[0-9a-fA-F]{6}$/, "o fundo do papel ganhou transparência");
});
