/**
 * As regras de acessibilidade do APLICATIVO DE CAMPO, verificadas por máquina.
 *
 * O painel tem `apps/web/test/acessibilidade.test.ts` desde que o contraste
 * deixou de ser um comentário dentro do `tokens.css` ("8.98:1 sobre branco").
 * Comentário não recalcula: quem escurece um neutro seis meses depois não abre
 * o comentário, e o texto some sem nada reclamar.
 *
 * O aplicativo estava exatamente no estado anterior a esse: `temaClaro` e
 * `temaEscuro` vivem em `src/ui/tokens.ts`, o arquivo diz que são cópia do
 * painel, e **nenhum dos dois jamais teve o contraste calculado**. Aqui ele é.
 *
 * E há uma régua que só existe deste lado: **52 pontos de alvo de toque**, e
 * não os 44 do painel. A razão está escrita no próprio `tokens.ts`: o painel é
 * ponteiro de mouse, e isto aqui é dedo, em pé, na chuva, às vezes com luva,
 * com alguém olhando para um barranco e não para a tela. A ausência do portão
 * tinha consequência medida: `src/app/(agente)/vistoria/[id].tsx` apagava
 * fotografia por um botão de 32 pontos, vinte abaixo da régua que o produto
 * declara, e nada reclamava. Apagar a prova de uma interdição por engano é o
 * defeito que só acontece em campo, e nunca na mesa de quem desenha.
 *
 * O que este portão NÃO faz, dito na cara: ele calcula contraste sobre TOKEN,
 * não sobre pixel renderizado. Não vê texto sobre fotografia, não vê
 * sobreposição acidental e não substitui uma passada com leitor de tela. Ele
 * substitui a lembrança de um revisor, que é o que sustentava estas regras no
 * aplicativo até agora, ou seja, nada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  arquivosDeFonte,
  compor,
  contraste,
  corDeTexto,
  lerTokensDoApp,
  nomeCurto,
  semComentarios,
  tocaveis,
} from "./fonte-do-aplicativo.mjs";

const tokens = lerTokensDoApp();

/* ============================================================
   1. Contraste AA calculado, par a par, nos dois temas
   ============================================================ */

const AA_TEXTO = 4.5;
/** Onde o alvo não é texto, a régua da WCAG 1.4.11 para componente é 3:1. */
const AA_COMPONENTE = 3;

/**
 * Os pares, com o fundo real de cada um.
 *
 * Cada linha é um par que a tela desenha de verdade. `sobre` existe para o dia
 * em que um fundo translúcido entrar aqui (o painel já tem, com selos de 12%
 * de opacidade): contraste medido contra a cor translúcida seria um número que
 * não existe na tela, porque o que está na tela é a composição.
 */
const PARES = [
  { oQue: "texto no fundo da tela", frente: "texto", fundo: "fundo" },
  { oQue: "texto no cartão", frente: "texto", fundo: "superficie" },
  { oQue: "texto na superfície secundária", frente: "texto", fundo: "superficie2" },
  { oQue: "texto discreto no fundo", frente: "textoDiscreto", fundo: "fundo" },
  { oQue: "texto discreto no cartão", frente: "textoDiscreto", fundo: "superficie" },
  { oQue: "texto discreto na superfície secundária", frente: "textoDiscreto", fundo: "superficie2" },
  { oQue: "ação no fundo da tela", frente: "destaque", fundo: "fundo" },
  { oQue: "ação no cartão", frente: "destaque", fundo: "superficie" },
  // A pílula do item ativo do menu inferior: ícone de destaque sobre superficie2.
  { oQue: "ação na superfície secundária", frente: "destaque", fundo: "superficie2" },
  { oQue: "texto do botão primário", frente: "sobreDestaque", fundo: "destaque" },
  { oQue: "texto sobre o destaque escuro", frente: "sobreDestaque", fundo: "destaqueEscuro" },
  /*
    O botão `realce`, que é o segundo preenchido do aplicativo (ver o par
    `destaqueFundo`/`destaqueTexto` em `tokens.ts`). Ele carrega texto, então
    a régua é a de texto e não a de componente: 4,5:1, nos dois temas.
  */
  { oQue: "texto do botão de realce", frente: "destaqueTexto", fundo: "destaqueFundo" },

  { oQue: "aviso de sucesso", frente: "okTexto", fundo: "okFundo" },
  { oQue: "aviso de alerta", frente: "alertaTexto", fundo: "alertaFundo" },
  { oQue: "aviso de perigo", frente: "perigoTexto", fundo: "perigoFundo" },
  // "Apagar", "Remover" e o contador de bloqueados saem em vermelho direto
  // sobre o cartão, sem fundo de aviso: é um par próprio e precisa do seu número.
  { oQue: "texto de perigo direto no cartão", frente: "perigoTexto", fundo: "superficie" },
  { oQue: "texto de perigo direto no fundo da tela", frente: "perigoTexto", fundo: "fundo" },
  /*
    O NÚMERO DO CRACHÁ DO SINO, e o da aba Perfil, que é o mesmo par: o crachá
    é âmbar (`alertaTexto` como FUNDO, porque o violeta já é o crachá da fila e
    dois crachás iguais para duas coisas opostas seria ruído) e o número sai em
    `sobreDestaque`. Nenhum dos dois pares acima mede isso: `alertaTexto` só
    era medido como texto, e aqui ele é fundo. O sino desenha o número com a
    fonte de legenda, então a régua é a de texto, nos dois temas.
  */
  { oQue: "número do crachá do sino", frente: "sobreDestaque", fundo: "alertaTexto" },

  /*
    O PESO LEVE da régua (`apps/campo/src/ui/regua.ts`) criou uma classe nova de
    par, e ela precisa dos números dela.

    Em peso leve o bloco perde o fundo e passa a desenhar o sinal, a palavra e o
    filete lateral direto sobre a superfície de baixo. Antes desta frente,
    NENHUM desses pares existia na tabela: a única cor de tom medida fora do
    fundo dela era a de perigo, porque "Apagar" e "Remover" já saíam soltos no
    cartão. Todo chip `ok` do aplicativo passou a desenhar assim, e um par que
    ninguém mede é um par que ninguém sabe que reprova.

    As três superfícies entram porque as três acontecem: o cartão, a superfície
    secundária (dentro do bloco "o que fazer" da fila) e o fundo da tela.

    `sevCriticaTexto` NÃO aparece aqui, e a ausência é a regra R5 da régua: ele é
    branco nos dois temas, mede 1.00:1 sobre o cartão claro, e por isso a
    severidade crítica é proibida de aleviar. Quem prova esse número, e quem
    reprova se alguém tirar a proibição, é
    `scripts/portao-densidade-do-aplicativo.test.mjs`.
  */
  { oQue: "chip leve de sucesso no cartão", frente: "okTexto", fundo: "superficie" },
  { oQue: "chip leve de sucesso na superfície secundária", frente: "okTexto", fundo: "superficie2" },
  { oQue: "chip leve de sucesso no fundo da tela", frente: "okTexto", fundo: "fundo" },
  { oQue: "aviso leve de alerta no cartão", frente: "alertaTexto", fundo: "superficie" },
  { oQue: "aviso leve de alerta na superfície secundária", frente: "alertaTexto", fundo: "superficie2" },
  { oQue: "aviso leve de alerta no fundo da tela", frente: "alertaTexto", fundo: "fundo" },
  { oQue: "aviso leve de perigo na superfície secundária", frente: "perigoTexto", fundo: "superficie2" },
  { oQue: "selo leve de severidade baixa no cartão", frente: "sevBaixaTexto", fundo: "superficie" },
  { oQue: "selo leve de severidade média no cartão", frente: "sevMediaTexto", fundo: "superficie" },
  { oQue: "selo leve de severidade alta no cartão", frente: "sevAltaTexto", fundo: "superficie" },

  { oQue: "selo de severidade baixa", frente: "sevBaixaTexto", fundo: "sevBaixaFundo" },
  { oQue: "selo de severidade média", frente: "sevMediaTexto", fundo: "sevMediaFundo" },
  { oQue: "selo de severidade alta", frente: "sevAltaTexto", fundo: "sevAltaFundo" },
  { oQue: "selo de severidade crítica", frente: "sevCriticaTexto", fundo: "sevCriticaFundo" },

  /*
    A borda de controle, que é o par que o aplicativo NÃO tem como passar hoje.
    Ver PENDENTES, logo abaixo.
  */
  { oQue: "borda de campo sobre o cartão", frente: "bordaControle", fundo: "superficie", minimo: AA_COMPONENTE },
  { oQue: "borda de campo no fundo da tela", frente: "bordaControle", fundo: "fundo", minimo: AA_COMPONENTE },
];

/**
 * Pendência nomeada, com dono, medida e com data de morte.
 *
 * `tema.borda` é a ÚNICA coisa que diz onde um campo de formulário começa: o
 * campo tem o mesmo fundo do cartão em que está. Medido aqui, ele dá 1.30:1 no
 * tema claro e 1.33:1 no escuro, contra os 3:1 que a WCAG 1.4.11 pede para o
 * que identifica um componente de interação.
 *
 * O painel teve o mesmo defeito e o resolveu criando um token separado,
 * `--ds-border-controle`, porque escurecer `--ds-border` deixaria pesada
 * também a borda de cartão, a linha de tabela e o separador, que são decoração
 * e não controle. O aplicativo não tem o token equivalente, e **criar token é
 * faixa da frente F1**, que está mexendo em `src/ui/` agora.
 *
 * A saída errada seria tirar o par da tabela: o portão ficaria verde e
 * ninguém saberia que o número existe. Aqui o par é MEDIDO, o número aparece
 * no relatório da execução, e a dívida está escrita com o nome de quem a paga.
 *
 * E ela se mata sozinha: o caso "nenhuma pendência sobreviveu ao conserto"
 * reprova no dia em que a borda passar dos 3:1, obrigando a linha a sair
 * daqui. Pendência que não sabe morrer vira permanente.
 */
const PENDENTES = new Map([]);

function medir(tema, par) {
  const paleta = tokens[tema];
  const fundoBruto = corDeTexto(paleta[par.fundo]);
  const sobre = par.sobre ? corDeTexto(paleta[par.sobre]) : null;
  const fundo = fundoBruto.a < 1 && sobre ? compor(fundoBruto, sobre) : fundoBruto;
  return contraste(corDeTexto(paleta[par.frente]), fundo);
}

for (const tema of ["temaClaro", "temaEscuro"]) {
  test(`contraste calculado: ${tema} passa no mínimo exigido em todo par`, () => {
    const reprovados = [];
    const pendentes = [];

    for (const par of PARES) {
      const razao = medir(tema, par);
      const minimo = par.minimo ?? AA_TEXTO;
      if (razao >= minimo) continue;

      const linha = `${par.oQue}: ${par.frente} sobre ${par.fundo} = `
        + `${razao.toFixed(2)}:1 (mínimo ${minimo}:1)`;
      if (PENDENTES.has(par.oQue)) pendentes.push(`${linha}\n      pendente: ${PENDENTES.get(par.oQue)}`);
      else reprovados.push(linha);
    }

    if (pendentes.length > 0) {
      /*
        Escrito na saída de propósito. Pendência calada é pendência esquecida,
        e quem roda a suíte precisa ver o número mesmo quando ele não reprova.
      */
      console.log(`\n  PENDENTE em ${tema}, declarado em PENDENTES:\n      ${pendentes.join("\n      ")}`);
    }

    assert.deepEqual(
      reprovados,
      [],
      `contraste abaixo do mínimo em ${tema}:\n${reprovados.join("\n")}`,
    );
  });
}

test("o cálculo confere com valores conhecidos", () => {
  /*
    Sem esta âncora, um erro na fórmula faria todo par passar sempre, e o
    portão daria verde medindo nada.
  */
  const branco = corDeTexto("#FFFFFF");
  assert.ok(Math.abs(contraste(corDeTexto("#000000"), branco) - 21) < 0.05);
  assert.ok(Math.abs(contraste(branco, branco) - 1) < 0.001);
  // Cinza de referência da própria WCAG: #767676 sobre branco dá 4.54:1.
  assert.ok(Math.abs(contraste(corDeTexto("#767676"), branco) - 4.54) < 0.05);
  // E a composição de transparência muda o resultado, senão o achatamento
  // seria uma função que não faz nada.
  const composto = compor(corDeTexto("rgba(255, 135, 135, 0.12)"), corDeTexto("#171E24"));
  assert.ok(composto.r > 23 && composto.r < 255);
});

test("os dois temas são de fato dois, e a leitura resolve as primitivas", () => {
  /*
    Se `lerTokensDoApp` devolvesse o mesmo objeto para os dois, os dois casos
    acima seriam um só e o tema escuro nunca teria sido medido.
  */
  assert.equal(tokens.temaClaro.texto, "#14191D");
  assert.equal(tokens.temaEscuro.texto, "#ECF1F4");
  assert.notEqual(tokens.temaClaro.fundo, tokens.temaEscuro.fundo);
  // `destaque: violeta.v700` precisa ter virado hexadecimal, senão `corDeTexto`
  // teria explodido, e explodir é melhor que medir errado.
  assert.match(tokens.temaClaro.destaque, /^#[0-9A-Fa-f]{6}$/);
});

test("nenhuma pendência de contraste sobreviveu ao próprio conserto", () => {
  const consertados = [];
  for (const oQue of PENDENTES.keys()) {
    const par = PARES.find((p) => p.oQue === oQue);
    assert.ok(par, `PENDENTES nomeia um par que não existe mais na tabela: ${oQue}`);
    const minimo = par.minimo ?? AA_TEXTO;
    const claro = medir("temaClaro", par);
    const escuro = medir("temaEscuro", par);
    if (claro >= minimo && escuro >= minimo) {
      consertados.push(`${oQue}: ${claro.toFixed(2)}:1 no claro e ${escuro.toFixed(2)}:1 no escuro`);
    }
  }
  assert.deepEqual(
    consertados,
    [],
    "estes pares passaram no mínimo e continuam declarados como pendência. "
    + "Tire a linha de PENDENTES: dívida que não sabe morrer vira permanente.\n"
    + consertados.join("\n"),
  );
});

/* ============================================================
   2. Alvo de toque, e 3. rótulo de quem toca
   ============================================================ */

const PERMISSAO = "acessibilidade: excecao";

/**
 * `flex: 1` dispensa a altura declarada, e é a única dispensa automática.
 *
 * O caso real é o fundo escurecido do `Dialogo`: ele é um tocável que ocupa a
 * tela inteira para fechar o diálogo ao toque fora dele. Exigir `minHeight` ali
 * seria exigir um número menor do que ele já tem. Quem estica não precisa de
 * piso; quem tem tamanho próprio precisa.
 */
const ESTICA = /(?<![A-Za-z])flex\s*:\s*1\b/;

const TAMANHO = /(?<![A-Za-z])(minHeight|minWidth|height|width)\s*:\s*(-?[\d.]+)\b/g;

/**
 * A exceção foi declarada para ESTE elemento?
 *
 * A janela é de quatro linhas acima, e não de uma, pela mesma razão do portão
 * do painel: a razão de uma exceção raramente cabe numa linha, e obrigar a
 * caber produz justificativa curta demais para significar alguma coisa.
 *
 * A leitura é da fonte COM comentário, porque `semComentarios` apaga o
 * marcador junto com todo o resto. Os dois lados são necessários: sem a fonte
 * limpa o portão puniria quem explica, e sem a fonte bruta não haveria como
 * declarar exceção nenhuma.
 *
 * Separada em função própria para poder ser provada, logo abaixo, com um texto
 * de exemplo. Escape que ninguém testa mente de duas formas: dispensando mais
 * do que foi pedido, e dispensando nada.
 */
function dispensado(linhasBrutas, numeroDaLinha) {
  const acima = linhasBrutas.slice(Math.max(0, numeroDaLinha - 5), numeroDaLinha - 1).join(" ");
  return acima.includes(PERMISSAO) || (linhasBrutas[numeroDaLinha - 1] ?? "").includes(PERMISSAO);
}

function tocaveisDoApp() {
  const achados = [];
  for (const caminho of arquivosDeFonte()) {
    const bruto = readFileSync(caminho, "utf8");
    const limpo = semComentarios(bruto);
    const linhasBrutas = bruto.split("\n");
    for (const el of tocaveis(limpo)) {
      achados.push({
        arquivo: nomeCurto(caminho),
        linha: el.linha,
        texto: el.texto,
        dispensado: dispensado(linhasBrutas, el.linha),
      });
    }
  }
  return achados;
}

test("a varredura enxerga os elementos tocáveis de verdade", () => {
  /*
    Âncora obrigatória. A heurística do painel (juntar linhas até a primeira que
    contenha `>`) NÃO serve aqui: em React Native quase todo tocável tem
    `onPress={() => ...}`, e a seta tem `>` dentro, então a leitura pararia
    antes do `style`, que é onde o alvo de toque mora. Um portão que enxerga
    metade do elemento dá verde sem medir.
  */
  const todos = tocaveisDoApp();
  assert.ok(todos.length >= 10, `só ${todos.length} tocáveis encontrados, a varredura provavelmente quebrou`);

  const daVistoria = todos.filter((t) => t.arquivo === "app/(agente)/vistoria/[id].tsx");
  assert.ok(daVistoria.length >= 4, "os tocáveis da tela de vistoria sumiram da varredura");
  /*
    `style` OU `estilo`: o `Pressable` cru recebe `style`, e a primitiva
    `Tocavel` recebe `estilo`, que é o mesmo objeto com nome em português. O
    que se prova aqui continua sendo o mesmo: a leitura não parou na primeira
    linha que tem `>` dentro (e `onPress={() => ...}` tem), porque parar ali
    deixaria o alvo de toque de fora e o portão mediria o nada.
  */
  assert.ok(
    daVistoria.some(
      (t) => t.texto.includes("accessibilityLabel")
        && (t.texto.includes("style") || t.texto.includes("estilo")),
    ),
    "a leitura parou antes do estilo: é exatamente o defeito que a heurística do painel teria aqui",
  );
});

test("nenhum alvo de toque abaixo de 52", () => {
  /*
    52 e não 44, e o número sai do próprio `tokens.ts`, não daqui: se a régua
    do produto mudar, este portão muda junto, e ninguém precisa lembrar de
    editar dois lugares.
  */
  const minimo = tokens.toque;
  const achados = [];

  for (const el of tocaveisDoApp()) {
    if (el.dispensado) continue;

    const medidas = [...el.texto.matchAll(TAMANHO)];
    const pequenas = medidas.filter(([, , valor]) => Number(valor) > 0 && Number(valor) < minimo);
    for (const [trecho, propriedade, valor] of pequenas) {
      achados.push(
        `${el.arquivo}:${el.linha}  ${propriedade}: ${valor} (mínimo ${minimo})  em  ${trecho}`,
      );
    }

    /*
      Tocável que não declara tamanho nenhum também reprova, e a razão é que a
      ausência é indistinguível do descuido: o elemento fica do tamanho do que
      estiver dentro, e "Apagar" em fonte de legenda é um alvo de 16 pontos.
    */
    const declarouPiso = medidas.some(
      ([, propriedade, valor]) =>
        (propriedade === "minHeight" || propriedade === "height") && Number(valor) >= minimo,
    ) || /(?<![A-Za-z])(minHeight|height)\s*:\s*toque\b/.test(el.texto);

    if (pequenas.length === 0 && !declarouPiso && !ESTICA.test(el.texto)) {
      achados.push(
        `${el.arquivo}:${el.linha}  não declara altura mínima nenhuma  em  ${el.texto.slice(0, 110)}`,
      );
    }
  }

  assert.deepEqual(
    achados,
    [],
    `alvo de toque abaixo da régua de ${minimo} pontos do produto:\n${achados.join("\n")}\n\n`
    + "Use `minHeight: toque`. Se o elemento estica com o pai, `flex: 1` basta. "
    + `Se a exceção for deliberada, escreva "${PERMISSAO}" num comentário acima, com a razão.`,
  );
});

test("todo elemento tocável se apresenta ao leitor de tela", () => {
  /*
    Duas coisas, e as duas obrigatórias: um papel (`accessibilityRole`), para o
    leitor dizer o QUE é, e um rótulo (`accessibilityLabel`), para dizer o que
    aquilo faz ALI.

    O texto visível dentro do elemento não conta como rótulo neste aplicativo,
    e a razão é concreta: os tocáveis daqui dizem "Apagar", "Remover" e
    "Ocultar". Anunciado sozinho, "Apagar" não diz apagar o quê, e a resposta
    (a terceira fotografia da vistoria) é justamente a parte que não dá para
    desfazer.

    A saída declarada é esconder o elemento do leitor, e ela é legítima: o
    fundo escurecido do `Dialogo` fecha ao toque, mas anunciá-lo poria um
    controle sem nome entre o título e o primeiro botão.
  */
  const semApresentacao = [];

  for (const el of tocaveisDoApp()) {
    if (el.dispensado) continue;
    const escondido = el.texto.includes("accessibilityElementsHidden")
      || /importantForAccessibility\s*=\s*["'{]?\s*["']?no/.test(el.texto);
    if (escondido) continue;

    const falta = [];
    if (!el.texto.includes("accessibilityLabel")) falta.push("accessibilityLabel");
    if (!el.texto.includes("accessibilityRole")) falta.push("accessibilityRole");
    if (falta.length > 0) {
      semApresentacao.push(`${el.arquivo}:${el.linha}  falta ${falta.join(" e ")}  em  ${el.texto.slice(0, 110)}`);
    }
  }

  assert.deepEqual(
    semApresentacao,
    [],
    "elemento tocável que o leitor de tela não sabe anunciar:\n" + semApresentacao.join("\n") + "\n\n"
    + "Dê accessibilityRole e accessibilityLabel. Se o elemento não deve ser "
    + "anunciado, declare accessibilityElementsHidden, e escreva por quê.",
  );
});

test("as três varreduras pegam o que deveriam pegar", () => {
  /*
    Prova das varreduras, reintroduzindo cada defeito. O primeiro caso é
    literalmente a linha 1205 de `app/(agente)/vistoria/[id].tsx` como ela
    estava antes desta frente: um botão de apagar fotografia com 32 pontos,
    vinte abaixo da régua que o produto declara.
  */
  const pequeno = [
    "<Pressable",
    "  onPress={() => void alterar({ fotos: outras })}",
    '  accessibilityRole="button"',
    '  accessibilityLabel={`Apagar a fotografia ${f.ordem + 1}`}',
    '  style={{ minHeight: 32, alignItems: "center", justifyContent: "center" }}',
    ">",
    "  <Icone nome=\"lixeira\" />",
    "</Pressable>",
  ].join("\n");

  const [el] = tocaveis(pequeno);
  assert.ok(el, "a varredura deixou de enxergar um <Pressable>");
  assert.ok(el.texto.includes("minHeight: 32"), "a leitura parou antes do style");
  const medidas = [...el.texto.matchAll(TAMANHO)].map(([, p, v]) => `${p}=${v}`);
  assert.deepEqual(medidas, ["minHeight=32"]);
  assert.ok(Number(32) < tokens.toque, "a régua do produto caiu para 32 ou menos");

  /*
    E a primitiva, pelo mesmo caminho. Sem este caso, tirar `Tocavel` da lista
    de tags devolveria a cegueira de sete tocáveis sem nada acusar aqui: o caso
    da quantidade acusaria um número menor, e número menor é o tipo de aviso
    que se explica como "mudou a tela".
  */
  const naPrimitiva = [
    "<Tocavel",
    "  onPress={() => setFotoParaApagar(f)}",
    '  accessibilityRole="button"',
    '  accessibilityLabel={`Apagar a fotografia ${f.ordem + 1}`}',
    '  estilo={{ minHeight: 32, alignItems: "center" }}',
    ">",
    "  <Txt>Apagar</Txt>",
    "</Tocavel>",
  ].join("\n");
  const [daPrimitiva] = tocaveis(naPrimitiva);
  assert.ok(daPrimitiva, "a varredura não enxerga <Tocavel>, e as telas migraram todas para ele");
  assert.ok(daPrimitiva.texto.includes("minHeight: 32"), "a leitura parou antes do estilo da primitiva");

  // Sem rótulo e sem papel: os dois precisam ser acusados, e pelo nome.
  const mudo = tocaveis('<Pressable onPress={f} style={{ minHeight: toque }} />')[0];
  assert.ok(mudo, "tag de uma linha só deixou de ser enxergada");
  assert.equal(mudo.texto.includes("accessibilityLabel"), false);
  assert.equal(mudo.texto.includes("accessibilityRole"), false);

  /*
    O CASO QUE A LEITURA POR LINHA NÃO TINHA, e que a deixava cega em treze dos
    dezessete tocáveis do aplicativo.

    A tag abaixo fecha COLADA no último atributo (`}}>`, e não `>` sozinho numa
    linha), que é a forma mais comum de todas neste código. A leitura antiga
    parava só em linha cujo conteúdo fosse exatamente `>` ou `/>`, ou em linha
    terminada em `>` precedido de espaço: nenhuma das duas casa aqui, então ela
    seguia por até sessenta linhas e engolia os FILHOS.

    O efeito inverte o sentido da medida. Este `<Pressable>` é mudo, e o `<View>`
    lá dentro é que tem papel e rótulo: lida com o filho junto, a varredura
    absolvia o pai e o portão dizia que todo tocável se apresenta ao leitor de
    tela. O mesmo vale para o alvo de toque, com o piso do filho cobrindo a
    ausência do pai.
  */
  const engolindoOFilho = [
    "<Pressable onPress={apagar} style={{ padding: espaco.e2 }}>",
    '  <View accessibilityRole="image" accessibilityLabel="ícone de lixeira"',
    "        style={{ minHeight: toque }}>",
    "    <Txt>Apagar</Txt>",
    "  </View>",
    "</Pressable>",
  ].join("\n");
  const [pai] = tocaveis(engolindoOFilho);
  assert.ok(pai, "a varredura deixou de enxergar o tocável que fecha colado no atributo");
  assert.equal(
    pai.texto.includes("accessibilityLabel"), false,
    "a leitura passou do `>` da tag de abertura e trouxe o rótulo do FILHO: "
    + "é a cegueira que absolvia treze dos dezessete tocáveis do aplicativo",
  );
  assert.equal(
    pai.texto.includes("accessibilityRole"), false,
    "a leitura trouxe o papel do filho, e um tocável mudo passaria a ter papel emprestado",
  );
  assert.deepEqual(
    [...pai.texto.matchAll(TAMANHO)].map(([, p, v]) => `${p}=${v}`), [],
    "a leitura trouxe o `minHeight: toque` do filho, e o tocável sem piso nenhum "
    + "passaria a declarar piso emprestado",
  );
  assert.equal(
    ESTICA.test(pai.texto), false,
    "o tocável não estica, e a leitura precisa dizer isso para ele ser cobrado",
  );

  /*
    E o filho continua sendo lido quando ELE é o tocável, senão o conserto de
    cima teria trocado uma cegueira por outra: o que está dentro de outro
    elemento não pode sumir da varredura.
  */
  const aninhado = [
    "<View style={{ gap: espaco.e2 }}>",
    "  <Tocavel onPress={abrir} style={{ minHeight: 30 }}>",
    "    <Txt>Abrir</Txt>",
    "  </Tocavel>",
    "</View>",
  ].join("\n");
  const [dentro] = tocaveis(aninhado);
  assert.ok(dentro, "tocável dentro de outro elemento sumiu da varredura");
  assert.deepEqual([...dentro.texto.matchAll(TAMANHO)].map(([, p, v]) => `${p}=${v}`), ["minHeight=30"]);

  /*
    E o defeito ORIGINAL desta varredura continua travado: `onPress={() => ...}`
    tem um `>` dentro da seta, e parar ali deixaria o estilo de fora.
  */
  const comSeta = tocaveis('<Tocavel onPress={() => fechar()} estilo={{ minHeight: 30 }} />')[0];
  assert.ok(comSeta.texto.includes("minHeight: 30"), "a leitura parou no `>` da arrow function");

  /*
    Tocável que o leitor de árvore PERDEU precisa estourar, e não devolver uma
    lista menor em silêncio: `arvoreJsx` desfaz o elemento que nunca fecha, e um
    tocável desfeito é um tocável que nenhuma das três regras mede.
  */
  assert.throws(
    () => tocaveis("<Pressable onPress={f} style={{ minHeight: 30 }}>"),
    /achou 0 tocáveis e o texto tem 1 aberturas/,
    "a varredura perdeu um tocável e devolveu a lista menor sem reclamar",
  );

  /*
    E a conta-conferência não pode reprovar quem MENCIONA a tag dentro de uma
    string: `arvoreJsx` pula texto literal, então contar a menção faria o portão
    acusar código inocente, que é como se ensina alguém a afrouxar uma regra.
  */
  const comMencaoEmTexto = [
    'const aviso = "todo <Pressable> precisa de rótulo";',
    "<Tocavel onPress={f} estilo={{ minHeight: toque }} />",
  ].join("\n");
  assert.equal(
    tocaveis(comMencaoEmTexto).length, 1,
    "a conta-conferência contou uma tag citada dentro de uma string",
  );

  // O que estica não precisa de piso, e o que não estica precisa.
  assert.equal(ESTICA.test('style={{ flex: 1 }}'), true);
  assert.equal(ESTICA.test('style={{ flexDirection: "row" }}'), false);
  assert.equal(ESTICA.test('style={{ flex: 2 }}'), false);

  // E `borderWidth` e `lineHeight` não podem ser lidos como tamanho de alvo,
  // senão toda borda de 1 ponto viraria uma reprovação falsa.
  const enganos = [...'style={{ borderWidth: 1, lineHeight: 20, maxHeight: 8 }}'.matchAll(TAMANHO)];
  assert.deepEqual(enganos, []);
});

test("o escape nomeado dispensa quem foi declarado, e ninguém mais", () => {
  const linhas = [
    "/*",                                          // 1
    `  ${PERMISSAO}: o fundo do diálogo ocupa a tela`, // 2
    "  inteira e fecha ao toque fora dela.",       // 3
    "*/",                                          // 4
    "<Pressable onPress={fechar} />",              // 5, dispensado
    "",                                            // 6
    "<Pressable onPress={apagar} />",              // 7, NÃO dispensado
  ];
  assert.equal(dispensado(linhas, 5), true, "a exceção declarada quatro linhas acima não alcançou o elemento");
  assert.equal(dispensado(linhas, 7), false, "a exceção de um elemento vazou para o vizinho de baixo");
  assert.equal(dispensado(linhas, 2), true, "o marcador não vale na própria linha");
  assert.equal(dispensado(["<Pressable />"], 1), false, "elemento sem marcador nenhum saiu dispensado");

  /*
    A ÚNICA exceção viva é o `PressionavelAnimado` dentro de `Tocavel`, e ela
    é só do piso: a primitiva não impõe altura, porque o cartão de lista e o
    disparador de câmera não têm a mesma, e o `minHeight: toque` é cobrado em
    cada `<Tocavel>` das telas. Papel e rótulo continuam sendo cobrados AQUI,
    pelo texto, porque o marcador dispensa das duas regras e uma exceção que
    apagasse o rótulo da primitiva apagaria o rótulo de todo tocável do
    aplicativo. Qualquer outro tocável dispensado precisa aparecer no
    relatório do turno em vez de passar calado.
  */
  const comMarcador = tocaveisDoApp().filter((t) => t.dispensado);
  assert.deepEqual(
    comMarcador.map((t) => t.arquivo),
    ["ui/componentes.tsx"],
    "só a primitiva `Tocavel` pode estar dispensada, e só do piso:\n"
    + comMarcador.map((t) => `${t.arquivo}:${t.linha}`).join("\n"),
  );
  const [primitiva] = comMarcador;
  assert.ok(primitiva.texto.startsWith("<PressionavelAnimado"), "a exceção de `Tocavel` mudou de elemento");
  assert.ok(
    primitiva.texto.includes("accessibilityRole={accessibilityRole}")
      && primitiva.texto.includes("accessibilityLabel={accessibilityLabel}"),
    "a primitiva `Tocavel` parou de repassar papel e rótulo ao elemento de verdade, "
    + "e a exceção do piso não cobre isso",
  );
});
