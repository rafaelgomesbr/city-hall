import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Txt, useTema } from "./componentes";
import { easing, espaco, movimento, peso, raio } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * O GRÁFICO DE BARRAS, desenhado pelo aplicativo e não por biblioteca.
 *
 * O pedido, na letra de quem paga: "não tem animações, infos, gráficos". E a
 * restrição: SVG próprio, sem biblioteca de gráfico. `react-native-svg` já
 * está no binário (é o que desenha os ícones e o gradiente do botão), e um
 * gráfico de sete barras não justifica uma dependência que traz eixo,
 * legenda, tooltip e mais trinta coisas que esta tela nunca vai pedir.
 *
 * ## O que ele desenha, e por que assim
 *
 * Uma coluna por barra: o VALOR escrito em cima, a barra no meio, o RÓTULO
 * embaixo. A regra da casa é "nunca só cor", e um gráfico é o lugar em que
 * ela é mais fácil de furar: sete retângulos violeta de alturas diferentes
 * são legíveis numa mesa e ilegíveis com sol na tela. O número em cima é o
 * que o agente lê na rua; a barra é o que faz a semana ter forma.
 *
 * A barra de ZERO continua desenhada, como um traço: um dia sem vistoria é
 * um fato (choveu, folga, base), e um buraco na sequência parece dado que
 * faltou.
 *
 * ## Para quem ouve a tela
 *
 * Cada coluna é UM elemento com a frase inteira ("Terça-feira: 3 vistorias
 * concluídas"), que vem pronta de quem monta as barras
 * (`dados/numeros-do-agente.ts`). Lidos separados, "3" e "ter" seriam um
 * número solto e uma sílaba. E o gráfico inteiro tem nome, para a pessoa
 * saber em que entrou antes de ouvir sete frases.
 *
 * ## A entrada
 *
 * As barras crescem de baixo para cima, na duração do clímax: é a única
 * animação da tela de perfil que existe por razão emocional, e ela dura o
 * bastante para ser vista, como a fila zerando. Roda na thread de interface
 * (escala, e não altura), e com a redução de movimento ligada as barras
 * nascem inteiras, pelo mesmo mecanismo de `ItemDeLista`.
 */

export type BarraDoGrafico = {
  /** O texto curto embaixo: "seg", "abr". */
  rotulo: string;
  valor: number;
  /** A frase inteira para o leitor de tela. */
  descricao: string;
};

/**
 * A altura da área das barras, em pontos. O maior valor enche esta altura;
 * os outros são proporcionais a ele.
 */
export const ALTURA_DAS_BARRAS = espaco.e8 + espaco.e6;

/** A altura de uma barra de zero: um traço, e não o nada. */
const ALTURA_DO_TRACO = espaco.e1;

export function GraficoDeBarras({ titulo, barras, testID }: {
  /** O nome do gráfico, falado antes das barras. Quem desenha o título visível é o cartão. */
  titulo: string;
  barras: readonly BarraDoGrafico[];
  testID?: string;
}) {
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();

  /*
    A chave de redução chega atrasada, sempre (ver `ItemDeLista`): a barra
    nasce em zero, e o efeito abaixo ou a anima até um, ou a fixa em um na
    hora quando a chave responde ligada.
  */
  const crescimento = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduzirMovimento) {
      crescimento.stopAnimation();
      crescimento.setValue(1);
      return;
    }
    Animated.timing(crescimento, {
      toValue: 1,
      duration: movimento.climax,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [reduzirMovimento, crescimento]);

  const maior = barras.reduce((m, b) => Math.max(m, b.valor), 0);

  return (
    <View
      testID={testID}
      accessibilityLabel={`${titulo}, gráfico de barras`}
      style={{ gap: espaco.e2 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: espaco.e2 }}>
        {barras.map((b) => {
          const altura = maior > 0 && b.valor > 0
            ? Math.max(ALTURA_DO_TRACO, (b.valor / maior) * ALTURA_DAS_BARRAS)
            : ALTURA_DO_TRACO;
          return (
            <View
              key={b.rotulo}
              accessible
              accessibilityLabel={b.descricao}
              style={{ flex: 1, alignItems: "center", gap: espaco.e1 }}
            >
              <Txt variante="corpoP" peso={peso.forte} mono>
                {String(b.valor)}
              </Txt>
              {/*
                A área tem altura fixa e a barra fica colada ao chão dela: as
                sete colunas alinham pela base, e o número de cada uma fica
                exatamente em cima da própria barra, que é o que faz "nunca
                só cor" funcionar aqui.
              */}
              <View style={{ height: ALTURA_DAS_BARRAS, justifyContent: "flex-end", alignSelf: "stretch" }}>
                <Animated.View
                  testID={testID ? `${testID}-coluna-${b.rotulo}` : undefined}
                  style={{
                    height: altura,
                    transformOrigin: "bottom",
                    /*
                      Com a redução ligada a escala é o NÚMERO um, e não o
                      valor animado fixado em um. A diferença é real: o valor
                      roda na thread nativa, e fixá-lo lá não redesenha o
                      JavaScript, então a árvore continuaria declarando a
                      barra em zero. Quem pediu menos movimento recebe a barra
                      inteira, declarada inteira.
                    */
                    transform: [{ scaleY: reduzirMovimento ? 1 : crescimento }],
                  }}
                >
                  <Svg width="100%" height={altura}>
                    <Rect
                      testID={testID ? `${testID}-barra-${b.rotulo}` : undefined}
                      x="0"
                      y="0"
                      width="100%"
                      height={altura}
                      rx={raio.normal / 2}
                      /* Cor de destaque, e não de estado: o gráfico conta
                         trabalho feito, e trabalho feito não é alerta nem
                         sucesso, é o número do dia. */
                      fill={b.valor > 0 ? tema.destaque : tema.borda}
                    />
                  </Svg>
                </Animated.View>
              </View>
              <Txt variante="legenda" discreto>{b.rotulo}</Txt>
            </View>
          );
        })}
      </View>
    </View>
  );
}
