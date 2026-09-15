import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { TRACO_DO_GLIFO, VIEWBOX_DO_GLIFO, type Severidade } from "@dc360/shared";

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
 * de contraste (`fundo` com `tinta` da severidade) vale para o que vai POR
 * CIMA do fundo: no `SeloSeveridade` é o texto, e aqui é a marca de dentro do
 * glifo (o ponto, o traço, a exclamação).
 *
 * A GEOMETRIA não mora aqui. Até 15/09/2026 este arquivo desenhava triângulo,
 * losango, quadrado, círculo e anel com números próprios, e o selo do mesmo
 * aplicativo desenhava um medidor, e o painel desenhava uma terceira coisa. O
 * glifo vem de `@dc360/shared`, e é o mesmo nos três lugares; o que este
 * arquivo decide é só como PREENCHER: o contorno vira mancha no fundo da
 * severidade, contornada na tinta de texto, e a marca vai por cima na tinta
 * da severidade. O traço é o dos ícones do conjunto (1,8 na grade de 24),
 * para que o pino tenha o mesmo peso de linha do selo ao lado dele.
 */
export function DesenhoDaCriticidade({ severidade, tamanho = icone.rotulo }: {
  severidade: Severidade | null;
  tamanho?: number;
}) {
  const tema = useTema();
  const aparencia = aparenciaDaCriticidade(tema, severidade);
  const { glifo } = aparencia;

  return (
    <Svg
      width={tamanho}
      height={tamanho}
      viewBox={VIEWBOX_DO_GLIFO}
      /*
        O desenho é DECORAÇÃO para o leitor de tela, e não um segundo anúncio.
        Quem carrega a palavra é o texto ao lado dele, na legenda, e o rótulo do
        próprio pino, no mapa. Anunciar a forma faria o leitor dizer "imagem"
        antes de cada linha de uma legenda que já é feita de palavras.
      */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/*
        Sem classificação é o único que NÃO preenche (`glifo.preenche`): a
        ocorrência que ninguém classificou ainda é um lugar no mapa sem
        gravidade atribuída, e um círculo cheio de cinza pareceria uma
        gravidade a mais na escala. O tracejado fica em tinta de texto, e não
        na discreta, pela mesma razão do contorno dos outros: sobre ladrilho, é
        a tinta de texto que garante ser vista.
      */}
      {glifo.preenche ? (
        <Path
          d={glifo.contorno}
          fill={aparencia.fundo}
          stroke={tema.texto}
          strokeWidth={TRACO_DO_GLIFO}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d={glifo.contorno}
          stroke={tema.texto}
          strokeWidth={TRACO_DO_GLIFO}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {glifo.marca.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={aparencia.tinta}
          strokeWidth={TRACO_DO_GLIFO}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
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
