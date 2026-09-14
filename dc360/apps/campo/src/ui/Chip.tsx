import type { ReactNode } from "react";
import { View } from "react-native";
import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";

import { Txt, useTema } from "./componentes";
import { IconeSeveridade } from "./icones";
import { pesoEfetivo, type PesoVisual } from "./regua";
import { espaco, icone, raio } from "./tokens";

/**
 * O selo de estado, com símbolo obrigatório.
 *
 * O que este componente substitui é um padrão que estava remontado à mão em
 * cada tela: um `Selo` genérico recebendo `fundo` e `cor` decididos ali mesmo,
 * numa cadeia de ternários, ao lado de uma segunda lista (o `switch` que
 * escolhe a palavra) que precisava concordar com a primeira. Duas listas para
 * um fato só é a forma exata do defeito que já custou caro neste aplicativo, e
 * ele apareceu de novo aqui: a fila de envio ganhou o estado "arquivado" no
 * `switch` das palavras e ninguém acrescentou o caso na cadeia das cores, então
 * uma coleta ARQUIVADA (a ocorrência foi encerrada no painel enquanto ela
 * esperava sinal) ficava com o mesmo desenho de uma coleta AGUARDANDO envio.
 * Os dois estados são opostos: um ainda vai chegar, o outro nunca vai.
 *
 * Duas decisões, e as duas vêm da rua:
 *
 * 1. **`simbolo` é obrigatório, e não opcional com padrão.** A regra da casa é
 *    que nada se comunica só por cor, e um padrão silencioso seria o jeito
 *    curto de furá-la sem ninguém perceber na revisão. Sob sol forte na tela do
 *    aparelho, verde e âmbar são a mesma mancha clara, e para quem não separa
 *    as duas cores eles nunca foram diferentes. Exigir o símbolo obriga quem
 *    escreve a tela a responder "e sem cor, como isto se distingue?".
 * 2. **O texto não desce abaixo de `fonteMinimaDeInteracao`.** O selo antigo usava
 *    `legenda`, que é 12: é o tamanho que se lê sentado numa mesa, não em pé
 *    com o aparelho molhado a meio metro do rosto.
 *
 * Para o leitor de tela o chip é UM elemento com uma frase em português. O
 * símbolo sozinho seria lido como "sinal de exclamação", que é ruído, e por
 * isso o `accessible` está no invólucro e não nos dois textos.
 */

/**
 * Os tons, e por que a severidade é um deles em vez de uma exceção.
 *
 * Os quatro primeiros são estado de processo: nada, deu certo, olhe isto, algo
 * quebrou. Os quatro últimos são a escala de gravidade da ocorrência, que tem
 * paleta PRÓPRIA no tema (`sevBaixa` a `sevCritica`) porque a regra da casa
 * proíbe comunicar severidade com a cor de marca e porque esses quatro pares
 * são medidos, um a um, no portão de contraste.
 *
 * Eles moram aqui, e não numa propriedade de cor solta, porque a alternativa é
 * o que o aplicativo tinha: um `Selo` genérico recebendo `fundo` e `cor`
 * decididos dentro da tela. Assim que a paleta vira parâmetro, a decisão volta
 * para o ponto de uso e duas telas passam a pintar o mesmo estado de dois
 * jeitos. Um tom a mais na união é mais barato que isso.
 */
export type TomDoChip =
  | "neutro" | "ok" | "alerta" | "perigo"
  | "sevBaixa" | "sevMedia" | "sevAlta" | "sevCritica";

/**
 * O símbolo, nas três formas que ele tem de verdade.
 *
 * A terceira é a que importa e foi a última a existir. Enquanto o símbolo só
 * podia ser um nó PRONTO, quem passava um ícone precisava saber com que cor
 * pintá-lo, e essa cor é do tom, ou seja, do próprio chip. O resultado é que a
 * tela repetia o mapa de cores por fora: `vistoria/[id].tsx` escrevia
 * `<IconeSucesso cor={tema.okTexto} />` ao lado de `tom="ok"`, duas listas para
 * um fato só. Com a função, a cor nunca sai daqui.
 */
export type SimboloDoChip = string | ReactNode | ((cor: string) => ReactNode);

export function Chip({
  texto,
  simbolo,
  tom = "neutro",
  peso = "forte",
  descricao,
  testID,
}: {
  texto: string;
  /**
   * O segundo canal, além da cor. Caractere curto de alto contraste ("✓", "!",
   * "↑") ou um DESENHO, quando o conjunto de ícones tiver um que diga melhor.
   *
   * Continua OBRIGATÓRIO, e é isso que não muda: a escolha é entre caractere e
   * desenho, nunca a ausência dos dois. Um padrão silencioso aqui seria o jeito
   * curto de furar a regra de "nada se comunica só por cor".
   *
   * O desenho entrou porque a tela de equipe precisou de três selos com ícone e
   * não pôde usar esta peça, criando uma cópia local com outro nome. Duas peças
   * iguais com nomes diferentes divergem na primeira mudança, e a que ninguém
   * lembra é a que fica errada.
   */
  simbolo: SimboloDoChip;
  tom?: TomDoChip;
  /**
   * Quanto peso esta pílula tem direito a ocupar. Ver `ui/regua.ts`.
   *
   * O padrão continua `forte` para que nenhuma chamada existente mude de
   * desenho sem alguém ter decidido isso. Quem migra decide uma a uma, com a
   * R2 da régua na mão: numa peça com mais de um candidato a fundo cheio, o
   * mais grave fica forte e o resto desce.
   *
   * `forte` NÃO é garantia de fundo: `pesoEfetivo` ainda pode aleviar (é o que
   * acontece com todo chip `ok`, pela R3). Pedir forte aqui é dizer "se este
   * tom pudesse pintar, ele pintaria", e não "pinte".
   */
  peso?: PesoVisual;
  /** A frase que o leitor de tela fala, quando o texto do chip não bastar. */
  descricao?: string;
  testID?: string;
}) {
  const tema = useTema();
  const cores = {
    neutro: { fundo: tema.superficie2, cor: tema.textoDiscreto },
    ok: { fundo: tema.okFundo, cor: tema.okTexto },
    alerta: { fundo: tema.alertaFundo, cor: tema.alertaTexto },
    perigo: { fundo: tema.perigoFundo, cor: tema.perigoTexto },
    sevBaixa: { fundo: tema.sevBaixaFundo, cor: tema.sevBaixaTexto },
    sevMedia: { fundo: tema.sevMediaFundo, cor: tema.sevMediaTexto },
    sevAlta: { fundo: tema.sevAltaFundo, cor: tema.sevAltaTexto },
    sevCritica: { fundo: tema.sevCriticaFundo, cor: tema.sevCriticaTexto },
  }[tom];

  /*
    O peso DESENHADO, e não o pedido. Ver `ui/regua.ts`.

    A diferença aparece em dois lugares: todo chip `ok` desce para leve mesmo
    pedindo forte (R3), e o chip `sevCritica` sobe para forte mesmo pedindo
    leve (R5, porque o texto dele é branco e fora do vermelho ele some).
  */
  const desenho = pesoEfetivo(tom, peso);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={descricao ?? texto}
      style={{
        /*
          Em peso leve a pílula deixa de ser pílula: sem fundo e sem recuo
          lateral, ela vira o par ícone mais palavra, que é o segundo canal
          inteiro e nada além dele. O recuo sai junto com o fundo de propósito:
          mantido, ele deixaria um bloco invisível empurrando o texto para
          longe do que vem antes, e a linha pareceria desalinhada das outras.
        */
        backgroundColor: desenho === "forte" ? cores.fundo : "transparent",
        borderRadius: raio.pilula,
        paddingHorizontal: desenho === "forte" ? espaco.e3 : 0,
        paddingVertical: espaco.e1,
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e2,
        alignSelf: "flex-start",
      }}
    >
      {/*
        Caractere vai dentro de `Txt`, para herdar tamanho e cor. Desenho vai
        cru: ele já recebe tamanho e cor de quem o escolheu, e embrulhar um nó
        em `Txt` no React Native muda como ele é medido.

        A função recebe a cor do tom e é chamada aqui, e não na tela. É a forma
        que a cópia local de `equipe.tsx` tinha inventado sozinha, e trazê-la
        para cá foi o que permitiu apagar aquela cópia.
      */}
      {typeof simbolo === "function"
        ? simbolo(cores.cor)
        : typeof simbolo === "string"
          ? <Txt variante="corpoP" negrito cor={cores.cor}>{simbolo}</Txt>
          : simbolo}
      <Txt variante="corpoP" negrito cor={cores.cor}>{texto}</Txt>
    </View>
  );
}


/**
 * A gravidade da ocorrência, que é a pílula mais lida do produto.
 *
 * Ela mora aqui, junto do `Chip`, e não mais em `componentes.tsx`, porque ela É
 * um chip. Enquanto foi um `Selo` próprio, herdou dele três coisas que a onda
 * inteira tratou como defeito em toda peça vizinha e deixou passar nesta:
 *
 * 1. **Texto em `legenda` (12)**, abaixo do `fonteMinimaDeInteracao` de 14 que o produto
 *    declara. A tela de vistoria chegou a escrever o porquê num comentário, ao
 *    desenhar à mão uma pílula de prazo de 14 na LINHA DE BAIXO desta;
 * 2. **Fonte do sistema**, porque o `Selo` desenhava com um `<Text>` cru, sem
 *    passar pelo `Txt` que resolve a família do produto. A marca de gravidade
 *    saía em San Francisco ao lado de rótulos em Work Sans;
 * 3. **Cor e nada mais.** Quatro pílulas coloridas com quatro palavras e nenhum
 *    segundo canal, contra a regra escrita no topo de `componentes.tsx`. Sob
 *    sol forte, âmbar e vermelho são a mesma mancha clara, e severidade é
 *    justamente o que separa a casa que pode esperar da que não pode. O ícone
 *    para isto já existia (`IconeSeveridade` foi desenhado nesta mesma onda,
 *    com "acompanha o `SeloSeveridade`" escrito no comentário) e terminou a
 *    onda sem um único uso.
 *
 * O `accessibilityLabel` diz "Severidade alta" e não só "Alta": lida sozinha no
 * meio de um cartão, a palavra não diz de que escala ela é.
 */
const TOM_DA_SEVERIDADE: Record<Severidade, TomDoChip> = {
  baixa: "sevBaixa",
  media: "sevMedia",
  alta: "sevAlta",
  critica: "sevCritica",
};

export function SeloSeveridade({ severidade, testID }: {
  severidade: Severidade | null;
  testID?: string;
}) {
  const desenho = (cor: string) => <IconeSeveridade cor={cor} tamanho={icone.inline} />;

  /*
    Sem classificação é um ESTADO, e não a ausência de um: a ocorrência chegou e
    ninguém decidiu ainda. Por isso ela também tem palavra e desenho, em vez de
    ser a única pílula do produto que se distingue só pelo cinza.
  */
  if (!severidade) {
    return (
      <Chip
        testID={testID}
        texto="Sem classificação"
        simbolo={desenho}
        tom="neutro"
        descricao="Severidade ainda não classificada"
      />
    );
  }

  return (
    <Chip
      testID={testID}
      texto={ROTULO_SEVERIDADE[severidade]}
      simbolo={desenho}
      tom={TOM_DA_SEVERIDADE[severidade]}
      descricao={`Severidade ${ROTULO_SEVERIDADE[severidade].toLowerCase()}`}
    />
  );
}
