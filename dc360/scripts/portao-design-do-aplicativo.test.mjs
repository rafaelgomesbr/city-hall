/**
 * O design system do APLICATIVO DE CAMPO, verificado por máquina.
 *
 * O painel tem este portão desde que `apps/web/test/design-system.test.ts`
 * existe. O aplicativo não tinha nenhum, e a consequência estava medida:
 * `src/app/(agente)/_layout.tsx` escrevia `#000000` e `#FFFFFF` no meio da
 * barra de abas, e `src/app/(agente)/vistoria/[id].tsx` pintava a tela da
 * câmera com `#000` e o botão do obturador com `#FFFFFF`. As mesmas linhas,
 * escritas no painel, reprovariam.
 *
 * A razão da regra é a mesma escrita no portão do painel, e no React Native
 * ela pesa mais, não menos: **cor literal não troca com o tema**. Aqui o tema
 * não é uma classe no `<html>`, é um objeto que cada componente recebe e usa.
 * Um valor escrito à mão simplesmente fica de fora dessa troca, e o defeito
 * aparece só no modo que quem escreveu não estava usando.
 *
 * Este aplicativo já pagou por isso uma vez, e o preço está escrito em
 * `src/ui/tokens.ts`: o quadro de assinatura desenhava o traço com a cor do
 * tema, no tema escuro isso era quase branco, e o PNG rasterizado ia para o
 * laudo oficial, cujo papel é branco. A assinatura do morador ficava
 * invisível no documento que prova que ele estava na casa interditada.
 *
 * ## Por que este portão mora em `scripts/`
 *
 * Ver o cabeçalho de `fonte-do-aplicativo.mjs`: o pacote do aplicativo roda em
 * `jest-expo`, sem tipos de Node, e varredura de arquivo precisa de `node:fs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RAIZ_DO_APP,
  TOKENS_TS,
  arquivosDeFonte,
  nomeCurto,
  semComentarios,
} from "./fonte-do-aplicativo.mjs";

/**
 * `tokens.ts` é onde os valores literais MORAM, como `tokens.css` no painel.
 * É o único arquivo isento, e ele tem portão próprio: a paridade com o painel,
 * em `paridade-de-tokens-do-aplicativo.test.mjs`.
 */
const ISENTOS = new Set(["ui/tokens.ts"]);

/**
 * Marcador da exceção deliberada e rara, no mesmo desenho do painel.
 *
 * A diferença é o alcance declarado: `design-system: excecao (5 linhas)`
 * dispensa as cinco linhas seguintes, e não só a de baixo. Sem isso, uma
 * sombra do React Native (que são cinco propriedades irmãs, uma por linha)
 * precisaria de cinco comentários iguais empilhados, e cinco marcadores
 * seguidos é o tipo de coisa que um revisor para de ler.
 *
 * O número é obrigatório para passar de uma linha, de propósito: quem escreve
 * a exceção declara QUANTO está dispensando, e o revisor confere isso contando.
 */
const PERMISSAO = /design-system: excecao(?:\s*\((\d+)\s*linhas?\))?/;

const REGRAS = [
  {
    nome: "cor em hexadecimal",
    padrao: /#[0-9a-fA-F]{3,8}\b/,
    porque: "cor literal não troca com o tema: fica igual no claro e no escuro",
  },
  {
    nome: "cor em rgb ou hsl",
    padrao: /\b(?:rgba?|hsla?)\s*\(/,
    porque: "mesma razão da cor em hexadecimal",
  },
  {
    nome: "raio escrito à mão",
    padrao: /(?<![A-Za-z])border[A-Za-z]*Radius\s*:\s*-?\d/,
    porque: "raio vem de `raio` (normal, cartao, pilula), senão cada tela arredonda de um jeito",
  },
  {
    nome: "duração de movimento literal",
    padrao: /(?<![A-Za-z])(?:duration|delay)\s*:\s*-?\d/,
    porque:
      "duração vem de `movimento` (respostaAoToque, mudancaDeEstado, climax). "
      + "Número solto também escapa do desligamento por prefers-reduced-motion",
  },
  {
    nome: "peso de fonte literal",
    padrao: /(?<![A-Za-z])fontWeight\s*:\s*(?:\d|["'])/,
    porque:
      "peso vem de token. Com o peso solto, o mesmo 'negrito' vira 600 numa tela "
      + "e 800 na outra, e quando a fonte do produto entrar não há onde ajustar",
  },
  {
    nome: "sombra escrita à mão",
    padrao:
      /(?<![A-Za-z])(?:elevation|shadowOpacity|shadowRadius)\s*:\s*-?[\d.]|(?<![A-Za-z])shadowColor\s*:\s*["'#]|(?<![A-Za-z])shadowOffset\s*:\s*\{/,
    porque:
      "sombra literal não escurece junto com o tema e some no fundo escuro. "
      + "E são cinco propriedades irmãs: escritas à mão, uma delas fica para trás",
  },
  {
    nome: "diálogo nativo do sistema",
    padrao: /(?<![A-Za-z.])Alert\s*\.\s*(?:alert|prompt)\s*\(|(?<![A-Za-z.])Alert\s*,|,\s*Alert\s*[,}]/,
    porque:
      "o alerta nativo ignora o tema, ignora a régua de tipografia do produto e "
      + "usa a área de toque do sistema, e não os 52 pontos que este aplicativo "
      + "exige. Use `Dialogo`, que existe exatamente para isso. E ele não é "
      + "testável de dentro da tela: as quatro chamadas foram migradas no T6, e "
      + "até hoje nada varria a fonte para impedir a quinta de nascer",
  },
];

/**
 * Exceção nomeada, com dono e com data de morte. **Hoje ela está vazia**, e a
 * história de por que ela existiu vale mais que o nome dela.
 *
 * Quando este portão foi escrito, o aplicativo não tinha token de peso de
 * fonte: `tokens.ts` declarava espaço, raio, tipografia, toque e movimento, e
 * os `"700"` e `"800"` espalhados pelas telas não tinham para onde apontar.
 * Afrouxar a regra teria sido a saída errada, porque regra afrouxada volta a
 * valer sozinha e ninguém percebe. Então a regra valeu, e a dívida ficou aqui,
 * com os três arquivos nomeados um a um.
 *
 * A frente F1 criou `peso` no mesmo turno, e a lista se esvaziou. A mecânica
 * que a esvaziou continua montada, logo abaixo, e é o que importa guardar: o
 * último caso deste arquivo REPROVA enquanto sobrar nome aqui e o token
 * existir. Sem ele, a dívida teria sobrevivido ao próprio conserto em
 * silêncio, que é como uma exceção temporária vira permanente.
 */
const PESO_SEM_TOKEN_AINDA = new Set([]);

function varrer() {
  const achados = [];

  for (const caminho of arquivosDeFonte()) {
    const curto = nomeCurto(caminho);
    if (ISENTOS.has(curto)) continue;

    const bruto = readFileSync(caminho, "utf8").split("\n");
    /*
      A varredura roda sobre a fonte SEM comentário, e a permissão é procurada
      na fonte COM comentário. Os dois lados são necessários: sem o primeiro, o
      portão puniria os parágrafos que explicam o defeito (vários deles citam
      `Alert.alert` e cor em hexadecimal pelo nome, porque é disso que falam);
      sem o segundo, o marcador de exceção seria apagado junto e não haveria
      como declarar exceção nenhuma.
    */
    const limpo = semComentarios(readFileSync(caminho, "utf8")).split("\n");

    /* Linhas dispensadas por um marcador, com o alcance que ele declarou. */
    const dispensadas = new Set();
    bruto.forEach((linha, i) => {
      const casou = PERMISSAO.exec(linha);
      if (!casou) return;
      const quantas = casou[1] ? Number(casou[1]) : 1;
      dispensadas.add(i + 1);
      for (let n = 1; n <= quantas; n++) dispensadas.add(i + 1 + n);
    });

    limpo.forEach((linha, i) => {
      const numero = i + 1;
      if (dispensadas.has(numero)) return;

      for (const regra of REGRAS) {
        if (!regra.padrao.test(linha)) continue;
        if (regra.nome === "peso de fonte literal" && PESO_SEM_TOKEN_AINDA.has(curto)) continue;
        achados.push({
          arquivo: curto,
          linha: numero,
          regra: regra.nome,
          trecho: bruto[i].trim().slice(0, 110),
          porque: regra.porque,
        });
      }
    });
  }
  return achados;
}

test("a varredura enxerga os arquivos do aplicativo de verdade", () => {
  /*
    Sem esta âncora, um erro de caminho faria a varredura passar vazia e o
    portão inteiro virar decoração. É o mesmo caso que o painel tem, e ele
    existe porque portão cego dá verde para sempre.
  */
  const arquivos = arquivosDeFonte().map(nomeCurto);
  assert.ok(arquivos.length > 30, `varredura achou só ${arquivos.length} arquivos em ${RAIZ_DO_APP}`);
  assert.ok(arquivos.includes("app/(agente)/vistoria/[id].tsx"), "a tela de vistoria sumiu da varredura");
  assert.ok(arquivos.includes("ui/componentes.tsx"), "as primitivas sumiram da varredura");
  assert.ok(
    !arquivos.some((a) => a.endsWith(".test.tsx") || a.endsWith(".test.ts")),
    "a varredura do produto está lendo arquivo de teste",
  );
});

test("nenhum valor de design escrito à mão no aplicativo", () => {
  const achados = varrer();
  const relatorio = achados
    .map((a) => `${a.arquivo}:${a.linha} [${a.regra}] ${a.trecho}\n      porque: ${a.porque}`)
    .join("\n");

  assert.deepEqual(
    achados,
    [],
    achados.length === 0
      ? ""
      : `valores de design escritos à mão em apps/campo/src:\n${relatorio}\n\n`
        + "Use um token de `src/ui/tokens.ts`. Se a exceção for deliberada, escreva "
        + '"design-system: excecao" num comentário na linha de cima, com a razão, e '
        + '"(N linhas)" se ela precisar alcançar mais de uma.',
  );
});

test("a varredura pega o que deveria pegar", () => {
  /*
    Prova da própria varredura, reintroduzindo cada defeito. Sem isto, uma
    expressão quebrada daria verde para sempre e ninguém saberia: o portão
    continuaria rodando, continuaria passando, e não estaria mais medindo nada.

    Cada linha aqui é uma linha que EXISTIU neste aplicativo, ou que existe em
    `src/ui/` hoje.
  */
  const casos = [
    ['shadowColor: "#000000",', "cor em hexadecimal"],
    ['<View style={{ flex: 1, backgroundColor: "#000" }}>', "cor em hexadecimal"],
    ["backgroundColor: rgba(0, 0, 0, 0.5),", "cor em rgb ou hsl"],
    ["borderRadius: 12,", "raio escrito à mão"],
    ["borderTopLeftRadius: 8,", "raio escrito à mão"],
    ["duration: 300,", "duração de movimento literal"],
    ['fontWeight: "700",', "peso de fonte literal"],
    ["fontWeight: 700,", "peso de fonte literal"],
    ["elevation: 8,", "sombra escrita à mão"],
    ["shadowOpacity: 0.18,", "sombra escrita à mão"],
    ["shadowRadius: 12,", "sombra escrita à mão"],
    ["shadowOffset: { width: 0, height: 4 },", "sombra escrita à mão"],
    ['Alert.alert("Sair da conta?", "Tem certeza?");', "diálogo nativo do sistema"],
    ['import { Alert, View } from "react-native";', "diálogo nativo do sistema"],
  ];

  for (const [linha, esperada] of casos) {
    const pegaram = REGRAS.filter((r) => r.padrao.test(linha)).map((r) => r.nome);
    assert.ok(
      pegaram.includes(esperada),
      `a regra "${esperada}" deixou de pegar: ${linha}  (pegaram: ${pegaram.join(", ") || "nenhuma"})`,
    );
  }
});

test("a varredura não reclama do que está certo", () => {
  const corretos = [
    "backgroundColor: tema.superficie,",
    "borderRadius: raio.cartao,",
    "borderRadius: raio.pilula,",
    "duration: movimento.mudancaDeEstado,",
    "duration: movimento.climax * 0.4,",
    "fontWeight: peso,",
    "minHeight: toque,",
    "shadowRadius: elevacao.n2.shadowRadius,",
    "gap: espaco.e2,",
    "width: 96, height: 96,",
    "borderWidth: 1, borderTopWidth: 0,",
    "const bloqueados = fila.filter((f) => f.estado === 'bloqueado').length;",
  ];
  for (const linha of corretos) {
    const pegaram = REGRAS.filter((r) => r.padrao.test(linha)).map((r) => r.nome);
    assert.deepEqual(pegaram, [], `falso positivo em: ${linha}`);
  }
});

test("o marcador de exceção dispensa o que declarou, e só isso", () => {
  /*
    Um portão cujo escape não é testado tem duas formas de mentir: dispensar
    mais do que foi pedido (e aí a exceção de uma linha apaga o arquivo
    inteiro) ou dispensar menos (e aí ninguém consegue declarar exceção e todo
    mundo aprende a comentar a regra). As duas estão travadas aqui.
  */
  const semAlcance = PERMISSAO.exec("// design-system: excecao, papel de laudo é branco sempre");
  assert.ok(semAlcance, "o marcador deixou de ser reconhecido");
  assert.equal(semAlcance[1], undefined, "sem alcance declarado, a exceção vale uma linha só");

  const comAlcance = PERMISSAO.exec("  design-system: excecao (5 linhas), não existe token de elevação");
  assert.ok(comAlcance, "o marcador com alcance deixou de ser reconhecido");
  assert.equal(comAlcance[1], "5");

  assert.equal(PERMISSAO.test("// excecao do design system"), false, "marcador escrito de outro jeito não vale");
});

test("os comentários são apagados antes da varredura, e o código da mesma linha não", () => {
  /*
    Metade dos arquivos deste aplicativo tem parágrafo de comentário contando o
    defeito que a linha abaixo conserta, e vários citam `Alert.alert` e cores
    em hexadecimal pelo nome. Punir quem explica ensina a apagar a explicação.

    O risco oposto é o que este caso trava junto: apagar comentário não pode
    apagar o código que está na MESMA linha, senão o portão fica cego para
    `backgroundColor: "#000" // preto` e para tudo que vier depois.
  */
  const fonte = [
    '/* O traço saía branco sobre papel #FFFFFF, e sumia no laudo. */',
    'const a = 1;',
    '// Antes isto era Alert.alert, e não dava para testar.',
    'const cor = "#123456"; // cor crua, isto tem que reprovar',
    'const url = "https://exemplo.gov.br/a"; // a barra dupla está dentro da string',
  ].join("\n");

  const limpo = semComentarios(fonte).split("\n");
  assert.equal(limpo.length, 5, "apagar comentário mudou o número de linhas, e todo número de linha passa a mentir");
  assert.equal(REGRAS.some((r) => r.padrao.test(limpo[0])), false, "comentário com hexadecimal ainda reprova");
  assert.equal(REGRAS.some((r) => r.padrao.test(limpo[2])), false, "comentário citando Alert.alert ainda reprova");
  assert.ok(REGRAS.some((r) => r.padrao.test(limpo[3])), "código com comentário na mesma linha ficou cego");
  assert.ok(limpo[4].includes("https://exemplo.gov.br/a"), "a barra dupla dentro de string foi tratada como comentário");
});

test("a dívida de peso de fonte morre no dia em que o token nascer", () => {
  /*
    Esta é a metade que impede a exceção de virar permanente.

    Enquanto `tokens.ts` não exportar `peso`, os arquivos listados em
    `PESO_SEM_TOKEN_AINDA` estão dispensados da regra, porque não existe token
    para eles apontarem. No minuto em que o token existir, a dispensa deixa de
    ter razão, e este caso reprova até alguém esvaziar a lista e trocar os
    literais. Sem ele, a frente F1 criaria o token e a dívida sobreviveria
    calada, que é exatamente como uma exceção temporária vira permanente.
  */
  const tokens = readFileSync(TOKENS_TS, "utf8");
  const temToken = /export const peso\b/.test(tokens);

  /*
    Sem o token, a dispensa tem razão de existir e a lista pode ter nomes. Com
    o token, não tem, e a lista precisa estar vazia. É só isso, e é o suficiente
    para a exceção não conseguir envelhecer calada.
  */
  if (!temToken) return;

  assert.deepEqual(
    [...PESO_SEM_TOKEN_AINDA],
    [],
    "`src/ui/tokens.ts` passou a exportar `peso`, então a dispensa de peso de fonte "
    + "perdeu a razão de existir. Troque os literais pelo token nestes arquivos e "
    + "esvazie PESO_SEM_TOKEN_AINDA:\n  " + [...PESO_SEM_TOKEN_AINDA].join("\n  "),
  );
});
