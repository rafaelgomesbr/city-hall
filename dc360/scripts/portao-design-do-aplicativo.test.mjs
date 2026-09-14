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
    /*
      A regra que faltava, e a ausência dela era uma CONTRADIÇÃO entre dois
      arquivos desta mesma onda, não um esquecimento.

      `tokens.ts` criou `borda` com um parágrafo dizendo, com estas palavras,
      que `borderWidth: 1` estava escrito à mão em sete lugares e que "um
      número solto repetido sete vezes é uma decisão que ninguém tomou". No
      mesmo turno, este portão listava `"borderWidth: 1, borderTopWidth: 0,"`
      entre os exemplos do que está CERTO. As duas coisas não podiam valer ao
      mesmo tempo, e quem venceu foi o portão: o token nasceu, e oito literais
      sobreviveram a ele, um deles um `borderLeftWidth: 4` colado ao lado de um
      token chamado `marca` que vale exatamente 4 e não tinha um único uso.

      `0` continua fora da regra, pelo mesmo critério da opacidade: ausência de
      borda não é um valor de design.
    */
    nome: "largura de borda escrita à mão",
    padrao: /(?<![A-Za-z])border[A-Za-z]*Width\s*:[^,\n}]*?(?<![\w.])[1-9]\d*/,
    porque:
      "largura de borda vem de `borda` (fio, enfase, marca). O contorno de repouso, "
      + "o que engrossa em foco e a faixa que classifica um cartão são três decisões "
      + "diferentes, e escritas como número solto elas viram a mesma coisa em telas "
      + "vizinhas sem ninguém ter decidido nada",
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
    /*
      A regra que a frente de movimento NÃO escreveu, e disse por quê.

      Ela achou o defeito (`ui/Dialogo.tsx` pintava o véu com 0,66 enquanto
      `opacidade.veu` valia 0,55, ou seja, o token nasceu e ninguém apontou
      para ele), e não acrescentou a regra porque a regra reprovaria um arquivo
      que ela não tinha permissão de tocar. Portão que não nasce para não
      acusar é portão que nasce cego: a próxima pessoa que mexer no token vai
      continuar não mexendo no véu.

      `0` e `1` ficam de fora, e isso é deliberado: transparente e opaco não
      são valores de design, são a ausência de um. O que precisa de nome é o
      MEIO do caminho, que é onde alguém escolhe 0,66 por gosto e o vizinho
      escolhe 0,55.

      `outputRange` entra junto porque é lá que a opacidade animada mora: a
      regra escrita só sobre `opacity:` teria passado ao largo exatamente da
      linha que a motivou. E o aplicativo já escreve assim: as três faixas de
      escala que existem hoje (`ESCALA_SOB_O_DEDO`, `ESCALA_NA_BORDA`,
      `ESCALA_DA_FOTO_ENTRANDO`) são constantes com nome e razão escrita.
    */
    nome: "opacidade ou faixa de interpolação escrita à mão",
    padrao: /(?<![A-Za-z])(?:opacity|outputRange)\s*:[^;\n]*?(?<![\w.])\d*\.\d/,
    porque:
      "opacidade vem de `opacidade` (inativo, aoToque, veu). Número solto no meio "
      + "do caminho é escolha de gosto que nenhum outro lugar do produto conhece: "
      + "foi assim que o véu do diálogo ficou em 0,66 com o token dizendo 0,55. "
      + "Numa faixa de interpolação, dê nome à constante e escreva a razão dela",
  },
  {
    nome: "retorno de toque decidido dentro da tela",
    padrao: /(?<![A-Za-z])opacity\s*:\s*[^,\n]*\bpressed\b/,
    porque:
      "`opacity: pressed ? ... : 1` PULA de um quadro para o outro: o retorno "
      + "aparece com o dedo e some com ele, e o agente de luva na chuva não vê. "
      + "O retorno do toque mora em `useRespostaAoToque`, pelo `Tocavel` ou pelo "
      + "`Botao`, com duração de token, curva de token, `useNativeDriver` e a "
      + "chave de redução de movimento respeitada. Escrito na tela, nada disso "
      + "vem junto, e foi assim que cinco lugares ficaram para trás do botão",
  },
  {
    /*
      A regra que a tipografia do produto precisava e não ganhou.

      Quem resolve a família de fonte neste aplicativo é o `Txt`, chamando
      `familiaDoTexto`. Um `<Text>` cru fica de fora disso sem erro e sem
      aviso: o React Native desenha com a fonte do sistema e ninguém percebe
      no simulador, porque lá a fonte do sistema é bonita. Quando a identidade
      entrou, TRÊS textos ficaram para trás, e dois deles estavam no `Aviso`,
      que aparece 25 vezes no produto: o cartão saía em Work Sans e o aviso
      dentro dele em San Francisco, na mesma tela.

      O mesmo vale para `fontWeight`, que o `Txt` sabe omitir quando a
      identidade está registrada (com uma família por peso, mandar peso junto
      faz o Android desenhar o arquivo errado) e que um `<Text>` cru manda
      sempre.

      `<TextInput>` não entra: ele é controle e não texto, e quem o embrulha é
      o `Campo`, que já resolve o estilo dele num lugar só.
    */
    nome: "texto desenhado fora do `Txt`",
    padrao: /<Text(?![A-Za-z])/,
    porque:
      "`<Text>` cru não passa por `familiaDoTexto`, então sai na fonte do sistema "
      + "enquanto o resto da tela sai na do produto, e manda `fontWeight` por cima "
      + "de uma família por peso, que no Android desenha o arquivo errado. Use `Txt`",
  },
  {
    /*
      A elevação espalhada pela METADE, que é o modo de falha que a própria
      declaração do token descreve e que nada impedia.

      `elevacao()` devolve um estilo COMPLETO (fundo, contorno e sombra) porque
      no tema escuro quem carrega a elevação é a superfície, e não a sombra
      preta sobre fundo quase preto. Levar só a sombra deixa a peça achatada no
      escuro; levar só o fundo a deixa sem separação no claro. `tokens.ts` diz
      isso em duas frases e nenhum teste cobrava.

      Por isso a única forma aceita é o espalhamento. `elevacao(tema).cartao` com
      um `.` depois, ou dentro de uma atribuição a uma propriedade, é sempre
      alguém escolhendo uma parte.
    */
    nome: "elevação usada pela metade",
    padrao: /(?<!\.\.\.)\belevacao\s*\([^)]*\)\s*\.\s*\w+\s*\./,
    porque:
      "a elevação é um estilo completo e se espalha inteira (`...elevacao(tema).cartao`). "
      + "Escolher uma propriedade produz o cartão achatado no escuro ou sem separação "
      + "no claro, que é exatamente o que o token existe para evitar",
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
    ["opacity: pressed ? 0.8 : 1,", "retorno de toque decidido dentro da tela"],
    ["opacity: pressed ? opacidade.aoToque : 1,", "retorno de toque decidido dentro da tela"],
    ["opacity: 0.55,", "opacidade ou faixa de interpolação escrita à mão"],
    [
      "opacity: entrada.interpolate({ inputRange: [0, 1], outputRange: [0, 0.66] }),",
      "opacidade ou faixa de interpolação escrita à mão",
    ],
    ["outputRange: [1, 0.96],", "opacidade ou faixa de interpolação escrita à mão"],
    ['fontWeight: "700",', "peso de fonte literal"],
    ["fontWeight: 700,", "peso de fonte literal"],
    ["elevation: 8,", "sombra escrita à mão"],
    ["shadowOpacity: 0.18,", "sombra escrita à mão"],
    ["shadowRadius: 12,", "sombra escrita à mão"],
    ["shadowOffset: { width: 0, height: 4 },", "sombra escrita à mão"],
    ['Alert.alert("Sair da conta?", "Tem certeza?");', "diálogo nativo do sistema"],
    ["borderWidth: 1,", "largura de borda escrita à mão"],
    ["borderTopWidth: 1,", "largura de borda escrita à mão"],
    ["borderLeftWidth: 4,", "largura de borda escrita à mão"],
    ["borderWidth: marcado ? 0 : 1,", "largura de borda escrita à mão"],
    ["shadowColor: elevacao(tema).cartao.shadowColor,", "elevação usada pela metade"],
    ["const raio = elevacao(tema).folha.shadowRadius;", "elevação usada pela metade"],
    ['<Text style={{ color: cores.texto, fontSize: fonte.corpoP }}>', "texto desenhado fora do `Txt`"],
    ["<Text", "texto desenhado fora do `Txt`"],
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
    "opacity: inativo ? opacidade.inativo : toqueVisual.opacidadeDoToque,",
    "opacity: presenca,",
    "opacity: desabilitado ? opacidade.inativo : 1,",
    "outputRange: [1, opacidade.aoToque],",
    "outputRange: [ESCALA_NA_BORDA, 1],",
    "outputRange: [espaco.e6, 0],",
    "opacity: entrada.interpolate({ inputRange: [0, 1], outputRange: [0, opacidade.veu] }),",
    "duration: movimento.climax * 0.4,",
    "fontWeight: peso,",
    "minHeight: toque,",
    "shadowRadius: elevacao.n2.shadowRadius,",
    "gap: espaco.e2,",
    "width: 96, height: 96,",
    "borderWidth: borda.fio, borderTopWidth: 0,",
    "borderLeftWidth: borda.marca,",
    "borderWidth: comFoco || temErro ? borda.enfase : borda.fio,",
    "borderWidth: foco.largura,",
    "borderWidth: 0,",
    "...elevacao(tema).cartao,",
    "...elevacao(tema).flutuante,",
    "const esperado = elevacao(tema).cartao;",
    "<TextInput {...ligacoes} style={[ligacoes.style, { flex: 1 }]} />",
    "<Txt variante=\"corpoP\" cor={cores.texto}>{children}</Txt>",
    "</Text>",
    "borderRadius: raio.normal + foco.folga + foco.largura,",
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

/**
 * TODA ESPERA DE TELA CHEIA TEM SAÍDA.
 *
 * Este caso existe por causa de uma decisão que ele sustenta, e não por causa
 * de um defeito que ele viu. A frente de movimento tinha o esqueleto de
 * carregamento como opção declarada para a lista de tarefas e para a fila, e
 * decidiu NÃO trocar. Uma das quatro razões é que `Carregando` oferece o que
 * esqueleto nenhum oferece: aos seis segundos ele admite a demora e abre uma
 * porta, com destino nomeado pela tela que chamou.
 *
 * Essa razão só continua verdadeira enquanto todas as chamadas passarem
 * `aoDesistir`, e a propriedade é OPCIONAL no componente, de propósito (nem
 * toda espera tem para onde ir). Sem este caso, a primeira chamada sem saída
 * faria o argumento contra o esqueleto deixar de valer em silêncio, e o
 * aplicativo voltaria a ter uma tela que pulsa para sempre com o agente em pé
 * no morro achando que está quase.
 *
 * A leitura é do ELEMENTO inteiro, e não da linha: `<Carregando` quase sempre
 * abre numa linha e fecha em outra, e um portão que olhasse linha a linha
 * daria verde para sempre.
 */
function esperasSemSaida() {
  const achados = [];
  for (const caminho of arquivosDeFonte()) {
    const fonte = semComentarios(readFileSync(caminho, "utf8"));
    let de = fonte.indexOf("<Carregando");
    while (de !== -1) {
      const ate = fonte.indexOf(">", de);
      const elemento = ate === -1 ? fonte.slice(de) : fonte.slice(de, ate);
      if (!elemento.includes("aoDesistir")) {
        achados.push(`${nomeCurto(caminho)}: ${elemento.replace(/\s+/g, " ").slice(0, 80)}`);
      }
      de = fonte.indexOf("<Carregando", de + 1);
    }
  }
  return achados;
}

test("nenhuma espera de tela cheia fica sem saída", () => {
  assert.deepEqual(
    esperasSemSaida(),
    [],
    "`Carregando` sem `aoDesistir` é espera sem porta, e é ela que faz alguém "
    + "fechar o aplicativo à força no meio de um plantão. Passe o que a tela faz "
    + "quando o agente desiste, e um rótulo que diga para onde leva:\n  "
    + esperasSemSaida().join("\n  "),
  );
});

test("a varredura de espera sem saída enxerga alguma coisa", () => {
  /*
    O caso irmão, e sem ele o de cima daria verde num dia em que
    `arquivosDeFonte` deixasse de achar as telas. Zero chamada encontrada e
    zero chamada sem saída são estados indistinguíveis para uma asserção de
    lista vazia, e o segundo é o único que significa alguma coisa.
  */
  let quantas = 0;
  for (const caminho of arquivosDeFonte()) {
    quantas += semComentarios(readFileSync(caminho, "utf8")).split("<Carregando").length - 1;
  }
  assert.ok(
    quantas >= 3,
    `esperado encontrar as esperas de tela cheia do aplicativo, achei ${quantas}. `
    + "A varredura ficou cega, e o caso ao lado passou a não provar nada.",
  );
});

/* ============================================================
   TOKEN DECLARADO E SEM NINGUÉM APONTANDO PARA ELE
   ============================================================ */

/**
 * A causa por trás do véu com dois valores, promovida a regra.
 *
 * O defeito do `Dialogo` não foi ter escrito `0.66`: foi `opacidade.veu` ter
 * nascido, ficado em 0,55 e nunca ter sido usado por ninguém. Um token sem
 * dono é uma afirmação que o produto não sustenta, e ele é pior que a ausência
 * do token, porque a próxima pessoa lê o arquivo, acredita e não confere a
 * tela. Foi exatamente assim que o sistema de design passou a dizer 0,55
 * enquanto o aplicativo desenhava 0,66, com as duas coisas verdes.
 *
 * A varredura cobre os grupos cujo acesso é sempre `grupo.membro`. Os temas
 * ficam de fora de propósito: `tema` chega aos componentes como parâmetro, com
 * dez nomes diferentes, e uma varredura textual ali acusaria falso sem parar.
 * Quem cobre os temas é o portão de acessibilidade, que MEDE cada par.
 *
 * O apelido é resolvido porque ele existe no código de verdade:
 * `componentes.tsx` importa `icone as tamanhoDeIcone`, e uma varredura que não
 * soubesse disso declararia os quatro tamanhos de ícone mortos no primeiro dia.
 */
const GRUPOS_COM_DONO = ["espaco", "raio", "fonte", "linha", "movimento", "peso", "borda", "opacidade", "icone", "foco", "easing", "papel", "visor"];

/**
 * Exceção nomeada, com a razão escrita e com o caso que a mata.
 *
 * `elevacao(tema).folha` é o topo da escala de elevação, e `tokens.ts` diz, na
 * própria declaração, que ele existe para "o que cobre a tela e pede decisão
 * (diálogo, painel que sobe)". O único elemento dessa classe no aplicativo é a
 * folha do `Dialogo`, e ela desenha a superfície à mão: fundo `superficie`,
 * contorno só no topo, sem sombra nenhuma.
 *
 * Isto está declarado e NÃO corrigido nesta revisão, com a razão em
 * `apps/campo/PENDENCIAS.md`: o nível foi desenhado para uma folha que paira,
 * com a sombra descendo 12 pontos, e a única folha do produto é colada no
 * rodapé, onde essa sombra cai para fora da tela. Espalhar o nível pela metade
 * é justamente o que a declaração do token proíbe, e mudar a direção da sombra
 * no ponto de uso seria decidir a escala de elevação dentro de um componente.
 * A escolha entre acertar o nível e aposentá-lo é de quem desenha o produto, e
 * não cabe numa revisão adversarial que não pode ver a tela no aparelho.
 */
const SEM_DONO_DECLARADO = new Map([
  ["elevacao.folha", "nível desenhado para folha que paira; a única folha do produto é colada no rodapé. Ver apps/campo/PENDENCIAS.md"],
  /*
    `corpoG` (17 pontos) é um degrau da escala tipográfica que NENHUM componente
    sabe pedir: a união de `variante` do `Txt` tem display, h1, h2, h3, corpo,
    corpoP e legenda, e não tem corpoG. Passá-lo devolveria `fontSize:
    undefined`. Ou seja, a escala declara oito degraus e a única peça que a lê
    expõe sete.

    Não é corrigido aqui, e a razão é que as duas saídas são decisão de quem
    desenha o produto e nenhuma delas é neutra: abrir a variante no `Txt` cria
    um tamanho novo na interface, e apagar o degrau tira da escala do aplicativo
    um passo que o painel TEM (`--ds-fs-body-lg`, que lá vale 18 e aqui valeria
    17, e a paridade de propósito não mapeia este par). Escolher por conta
    própria, numa revisão que não pode ver a tela no aparelho, seria mexer na
    tipografia do produto por dedução. Registrado em `apps/campo/PENDENCIAS.md`.
  */
  ["fonte.corpoG", "degrau de 17 pontos que o `Txt` não expõe em `variante`. Ver apps/campo/PENDENCIAS.md"],
  ["linha.corpoG", "a altura de linha do degrau acima, e ela some ou fica junto com ele"],
]);

/** Os membros de `export const GRUPO = { ... }`, por leitura do texto. */
function membrosDoGrupo(fonte, grupo) {
  const abertura = new RegExp(`export const ${grupo}(?:\\s*:\\s*[\\w.<>, ]+)?\\s*=\\s*\\{`);
  const casou = abertura.exec(fonte);
  if (!casou) return null;
  const inicio = fonte.indexOf("{", casou.index);
  let profundidade = 0;
  let fim = inicio;
  for (let i = inicio; i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) { fim = i; break; }
    }
  }
  const corpo = fonte.slice(inicio + 1, fim);
  /* Só o primeiro nível: `shadowOffset: { width, height }` não declara token. */
  const nomes = new Set();
  let nivel = 0;
  for (const linha of corpo.split("\n")) {
    const antes = nivel;
    for (const c of linha) {
      if (c === "{") nivel++;
      if (c === "}") nivel--;
    }
    if (antes !== 0) continue;
    for (const casouMembro of linha.matchAll(/(?:^|[{,\s])([A-Za-z_]\w*)\s*:/g)) nomes.add(casouMembro[1]);
  }
  return [...nomes];
}

/** Os níveis que `elevacao()` devolve, lidos do tipo `NivelDeElevacao`. */
function niveisDeElevacao(fonte) {
  const casou = /export type NivelDeElevacao\s*=\s*([^;]+);/.exec(fonte);
  if (!casou) return [];
  return [...casou[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

test("nenhum token declarado fica sem alguém apontando para ele", () => {
  const tokens = semComentarios(readFileSync(TOKENS_TS, "utf8"));
  const produto = arquivosDeFonte()
    .filter((c) => nomeCurto(c) !== "ui/tokens.ts")
    .map((c) => semComentarios(readFileSync(c, "utf8")))
    .join("\n");

  const orfaos = [];
  const usado = (nomes, membro) =>
    nomes.some((n) => new RegExp(`(?<![A-Za-z0-9_$])${n}\\s*\\.\\s*${membro}\\b`).test(produto));

  for (const grupo of GRUPOS_COM_DONO) {
    const membros = membrosDoGrupo(tokens, grupo);
    assert.ok(membros && membros.length > 0, `tokens.ts não declara mais "export const ${grupo}", ou a leitura quebrou`);
    /* `icone as tamanhoDeIcone` e qualquer outro apelido de importação. */
    const apelidos = [...produto.matchAll(new RegExp(`(?<![A-Za-z0-9_$])${grupo}\\s+as\\s+(\\w+)`, "g"))].map((m) => m[1]);
    for (const membro of membros) {
      if (usado([grupo, ...apelidos], membro)) continue;
      orfaos.push(`${grupo}.${membro}`);
    }
  }

  for (const nivel of niveisDeElevacao(tokens)) {
    if (new RegExp(`elevacao\\s*\\([^)]*\\)\\s*\\.\\s*${nivel}\\b`).test(produto)) continue;
    orfaos.push(`elevacao.${nivel}`);
  }

  const naoDeclarados = orfaos.filter((o) => !SEM_DONO_DECLARADO.has(o));

  assert.deepEqual(
    naoDeclarados,
    [],
    "estes tokens existem em `src/ui/tokens.ts` e nenhuma linha do produto os usa:\n  "
    + naoDeclarados.join("\n  ")
    + "\n\nToken sem dono é afirmação que o produto não sustenta, e foi assim que "
    + "`opacidade.veu` ficou em 0,55 enquanto o diálogo desenhava 0,66. Ou ligue o "
    + "token onde ele deveria estar, ou apague-o, ou declare a dívida em "
    + "SEM_DONO_DECLARADO com a razão e o lugar onde ela está registrada.",
  );
});

test("a dívida de token sem dono não sobrevive ao próprio conserto", () => {
  /*
    O irmão obrigatório: sem ele, a lista de exceções vira permanente. No dia
    em que alguém ligar `elevacao.folha`, o nome precisa sair daqui, senão a
    próxima dívida entra na lista e ninguém percebe que a lista deixou de ser
    lida.
  */
  const tokens = semComentarios(readFileSync(TOKENS_TS, "utf8"));
  const produto = arquivosDeFonte()
    .filter((c) => nomeCurto(c) !== "ui/tokens.ts")
    .map((c) => semComentarios(readFileSync(c, "utf8")))
    .join("\n");

  const consertados = [];
  for (const nome of SEM_DONO_DECLARADO.keys()) {
    const [grupo, membro] = nome.split(".");
    const achou = grupo === "elevacao"
      ? new RegExp(`elevacao\\s*\\([^)]*\\)\\s*\\.\\s*${membro}\\b`).test(produto)
      : new RegExp(`(?<![A-Za-z0-9_$])${grupo}\\s*\\.\\s*${membro}\\b`).test(produto);
    if (achou) consertados.push(nome);
  }

  assert.deepEqual(
    consertados,
    [],
    "estes tokens ganharam dono e continuam declarados como dívida. Tire a linha "
    + "de SEM_DONO_DECLARADO:\n  " + consertados.join("\n  "),
  );
  assert.ok(tokens.includes("export const opacidade"), "a leitura de tokens.ts quebrou");
});

test("a varredura de token sem dono enxerga o que deveria", () => {
  /*
    A prova da própria varredura, e ela tem duas metades.

    A primeira reintroduz o defeito de origem: com o uso de `opacidade.veu`
    apagado do produto, o token precisa aparecer como órfão. Sem este caso, um
    erro na expressão de busca daria verde para sempre, que é o estado em que o
    aplicativo estava.

    A segunda prova o apelido, porque é onde esta varredura erraria primeiro:
    `componentes.tsx` importa `icone as tamanhoDeIcone`, e uma busca que
    ignorasse isso declararia os quatro tamanhos de ícone mortos.
  */
  const tokens = semComentarios(readFileSync(TOKENS_TS, "utf8"));

  const membros = membrosDoGrupo(tokens, "opacidade");
  assert.deepEqual([...membros].sort(), ["aoToque", "inativo", "veu"]);
  assert.deepEqual([...membrosDoGrupo(tokens, "borda")].sort(), ["enfase", "fio", "marca"]);
  assert.deepEqual(niveisDeElevacao(tokens).sort(), ["cartao", "flutuante", "folha"]);

  /* `shadowOffset: { width: 0, height: 1 }` não pode virar token `width`. */
  assert.equal(membrosDoGrupo(tokens, "opacidade").includes("width"), false);

  const busca = (produto, grupo, membro) =>
    new RegExp(`(?<![A-Za-z0-9_$])${grupo}\\s*\\.\\s*${membro}\\b`).test(produto);

  assert.equal(busca("opacity: entrada.interpolate({ outputRange: [0, opacidade.veu] })", "opacidade", "veu"), true);
  assert.equal(busca("opacity: entrada.interpolate({ outputRange: [0, 0.66] })", "opacidade", "veu"), false);
  /* E o sufixo não pode casar: `superopacidade.veu` não é o nosso token. */
  assert.equal(busca("superopacidade.veu", "opacidade", "veu"), false);

  const comApelido = 'import { icone as tamanhoDeIcone } from "./tokens";\nwidth: tamanhoDeIcone.vazio,';
  assert.equal(busca(comApelido, "icone", "vazio"), false, "sem resolver o apelido, o token pareceria órfão");
  const apelidos = [...comApelido.matchAll(/(?<![A-Za-z0-9_$])icone\s+as\s+(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(apelidos, ["tamanhoDeIcone"]);
  assert.equal(busca(comApelido, apelidos[0], "vazio"), true);
});
