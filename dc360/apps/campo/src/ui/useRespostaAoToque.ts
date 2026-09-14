import { useRef } from "react";
import { Animated, Easing } from "react-native";
import { easing, movimento, opacidade } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * O RETORNO DO DEDO, num lugar só.
 *
 * O `Botao` já tinha isto escrito por dentro, e foi a única peça do aplicativo
 * a ganhar transição de toque. Todo o resto continuou com `opacity: pressed ?
 * ... : 1` calculado dentro da função de estilo do `Pressable`: a opacidade
 * PULA de um quadro para o outro quando o dedo encosta, e pula de volta quando
 * ele sai. O agente que toca com luva, na chuva, olhando para um barranco, não
 * vê um retorno que aparece e some junto com o toque, e o que ele faz quando
 * não vê é tocar de novo, no cartão que abre a vistoria.
 *
 * Este arquivo existe para o vocabulário ser UM. Cinco lugares copiando as
 * quatro linhas do `Botao` seria a mesma história dos quatro `Easing` escolhidos
 * dentro dos componentes, que o token de `easing` acabou de resolver: no dia em
 * que alguém trocar a curva, cinco telas ficam com ritmos diferentes e ninguém
 * descobre lendo uma delas.
 *
 * As três regras, e nenhuma é negociável:
 *
 * 1. **Duração e curva saem de token.** `movimento.respostaAoToque` é curto de
 *    propósito: acima de uns 150 ms o toque começa a parecer que não pegou.
 * 2. **`useNativeDriver`.** Escala e opacidade rodam na thread de interface. O
 *    dedo não pode esperar o JavaScript, que neste aplicativo pode estar
 *    ocupado drenando a fila de uma manhã inteira de vistorias no SQLite.
 * 3. **Redução de movimento tira a INTERPOLAÇÃO, nunca o retorno.** Quem liga
 *    a chave no sistema liga porque animação dá enjoo, e não porque quer uma
 *    interface que não responde. O valor vai direto ao destino: o estado muda
 *    no mesmo quadro e o agente continua sabendo que o toque pegou.
 */

/**
 * Quanto a peça encolhe sob o dedo.
 *
 * Três por cento, e não dez: o alvo aqui é o cartão de uma lista que o agente
 * está rolando, e encolhimento visível vira "a tela mexeu" em vez de "o toque
 * pegou". Escala não muda layout (roda em transformação), então nem a âncora da
 * `FlatList` nem a altura reservada da faixa sentem isto.
 */
export const ESCALA_SOB_O_DEDO = 0.97;

export type RespostaAoToque = {
  /** Ligar em `onPressIn`. */
  aoEncostar: () => void;
  /** Ligar em `onPressOut`. */
  aoSoltar: () => void;
  /** Vai em `opacity`, dentro de um `Animated.View` ou equivalente. */
  opacidadeDoToque: Animated.AnimatedInterpolation<number>;
  /** Vai em `transform: [{ scale }]`. */
  escalaDoToque: Animated.AnimatedInterpolation<number>;
};

export function useRespostaAoToque(): RespostaAoToque {
  const reduzirMovimento = useReducaoDeMovimento();

  /*
    Um valor só move as duas propriedades, porque elas são o mesmo gesto visto
    de dois jeitos e separá-las abriria a chance de ficarem dessincronizadas.
    Zero é repouso, um é sob o dedo.
  */
  const toqueEmCurso = useRef(new Animated.Value(0)).current;

  function animarPara(destino: number, curva: readonly [number, number, number, number]) {
    if (reduzirMovimento) {
      toqueEmCurso.setValue(destino);
      return;
    }
    Animated.timing(toqueEmCurso, {
      toValue: destino,
      duration: movimento.respostaAoToque,
      easing: Easing.bezier(...curva),
      useNativeDriver: true,
    }).start();
  }

  return {
    aoEncostar: () => { animarPara(1, easing.entrada); },
    aoSoltar: () => { animarPara(0, easing.saida); },
    opacidadeDoToque: toqueEmCurso.interpolate({
      inputRange: [0, 1],
      outputRange: [1, opacidade.aoToque],
    }),
    escalaDoToque: toqueEmCurso.interpolate({
      inputRange: [0, 1],
      outputRange: [1, ESCALA_SOB_O_DEDO],
    }),
  };
}
