import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { Severidade } from "@dc360/shared";

import { Txt, useTema } from "../componentes";
import { borda, espaco, icone, raio } from "../tokens";
import { aparenciaDaCriticidade, criticidadesNoMapa } from "./criticidade";

/**
 * O DESENHO DA CRITICIDADE, e a legenda que o explica.
 *
 * As duas peças moram no mesmo arquivo de propósito: elas são as duas metades
 * da mesma promessa. O desenho sozinho é cor e forma, que não significam nada
 * para quem chegou agora; a legenda sozinha descreve um mapa que não está ali.
 * Separá-las em dois arquivos é o primeiro passo para uma delas mudar sem a
 * outra, e aí o mapa passa a mentir sem ninguém ter escrito uma linha errada.
 *
 * O vocabulário (qual forma, qual cor, qual palavra) mora em `criticidade.ts`,
 * com o argumento inteiro escrito lá: aqui só se desenha.
 */

/**
 * O contorno do desenho, e por que ele é a tinta de TEXTO e não a do tom.
 *
 * O pino é desenhado por cima de um ladrilho de rua que este aplicativo não
 * controla: pode cair sobre asfalto cinza, sobre mata verde ou sobre o telhado
 * claro de um galpão. A cor que garantidamente contrasta com o resto da tela é
 * a tinta de texto do tema (escura no claro, clara no escuro), e é ela que
 * separa a silhueta do fundo em qualquer dos três casos. O par medido no portão
 * de contraste (`fundo` com `tinta` da severidade) continua valendo para o que
 * é TEXTO sobre o fundo dela, que é o `SeloSeveridade`, e não para uma
 * silhueta sobre ladrilho.
 */
/**
 * O lado do desenho, em unidades de `viewBox`. Só relação, nunca ponto: o
 * tamanho em pontos é o que a chamada pede, e tudo aqui dentro escala junto.
 */
const LADO = 24;

/**
 * O canto do quadrado, derivado do raio do produto e não escolhido aqui.
 *
 * `raio.normal` é 8 PONTOS, e aqui a unidade é a do `viewBox` de 24: aplicado
 * cru, ele arredondaria o quadrado até virar um círculo, e as duas formas
 * deixariam de se distinguir, que é justamente o canal que este desenho existe
 * para acrescentar. A razão mantém a decisão amarrada ao token: se o produto
 * ficar mais arredondado, esta figura acompanha.
 */
const CANTO_DO_QUADRADO = raio.normal / 4;

export function DesenhoDaCriticidade({ severidade, tamanho = icone.rotulo }: {
  severidade: Severidade | null;
  tamanho?: number;
}) {
  const tema = useTema();
  const aparencia = aparenciaDaCriticidade(tema, severidade);
  const traco = borda.enfase;

  return (
    <Svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${LADO} ${LADO}`}
      /*
        O desenho é DECORAÇÃO para o leitor de tela, e não um segundo anúncio.
        Quem carrega a palavra é o texto ao lado dele, na legenda, e o rótulo do
        próprio pino, no mapa. Anunciar a forma faria o leitor dizer "imagem"
        antes de cada linha de uma legenda que já é feita de palavras.
      */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {aparencia.forma === "triangulo" && (
        <Path
          d="M 12 3 L 22 20 L 2 20 Z"
          fill={aparencia.fundo}
          stroke={tema.texto}
          strokeWidth={traco}
          strokeLinejoin="round"
        />
      )}
      {aparencia.forma === "losango" && (
        <Path
          d="M 12 2 L 22 12 L 12 22 L 2 12 Z"
          fill={aparencia.fundo}
          stroke={tema.texto}
          strokeWidth={traco}
          strokeLinejoin="round"
        />
      )}
      {aparencia.forma === "quadrado" && (
        <Rect
          x="4" y="4" width="16" height="16"
          rx={CANTO_DO_QUADRADO}
          fill={aparencia.fundo}
          stroke={tema.texto}
          strokeWidth={traco}
        />
      )}
      {aparencia.forma === "circulo" && (
        <Circle
          cx="12" cy="12" r="9"
          fill={aparencia.fundo}
          stroke={tema.texto}
          strokeWidth={traco}
        />
      )}
      {/*
        O ANEL é vazado, e é o único que não preenche: a ocorrência que ninguém
        classificou ainda é um lugar no mapa sem gravidade atribuída, e um
        círculo cheio de cinza pareceria uma gravidade a mais na escala.
      */}
      {aparencia.forma === "anel" && (
        <Circle
          cx="12" cy="12" r="8"
          fill="none"
          stroke={tema.textoDiscreto}
          strokeWidth={traco}
        />
      )}
    </Svg>
  );
}

/**
 * A LEGENDA, que é o que transforma pino colorido em informação.
 *
 * Ela fica VISÍVEL na tela, e não atrás de um toque: a regra da casa é que nada
 * se comunica só por cor, e uma legenda escondida deixa o pino comunicando só
 * por cor durante todo o tempo em que ninguém a abriu. É por existir aqui que o
 * pino pode levar a gravidade.
 *
 * Para quem ouve a tela ela é UM elemento com uma frase, e não cinco pares
 * soltos: "Crítica, Alta, Média" lido item a item, no meio de uma tela, não diz
 * de que escala aquilo é.
 */
export function LegendaDeCriticidade({ severidades }: {
  severidades: readonly (Severidade | null)[];
}) {
  const tema = useTema();
  const chaves = criticidadesNoMapa(severidades);
  if (chaves.length === 0) return null;

  const palavras = chaves.map((c) => aparenciaDaCriticidade(tema, c).palavra);

  return (
    <View
      testID="legenda-de-criticidade"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Criticidade dos pinos do mapa: ${palavras.join(", ")}.`}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: espaco.e3,
        paddingVertical: espaco.e2,
        paddingHorizontal: espaco.e3,
        borderRadius: raio.normal,
        borderWidth: borda.fio,
        borderColor: tema.borda,
        backgroundColor: tema.superficie,
      }}
    >
      {chaves.map((criticidade) => (
        <View
          key={criticidade ?? "sem-classificacao"}
          style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}
        >
          <DesenhoDaCriticidade severidade={criticidade} tamanho={icone.inline} />
          <Txt variante="corpoP">{aparenciaDaCriticidade(tema, criticidade).palavra}</Txt>
        </View>
      ))}
    </View>
  );
}
