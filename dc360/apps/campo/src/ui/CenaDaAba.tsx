import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Animated, Easing } from "react-native";
import { easing, espaco, movimento } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A ENTRADA DE UMA ABA, feita por nós e com driver JavaScript.
 *
 * ## Por que o navegador não anima mais a cena
 *
 * O `BottomTabView` da cópia do React Navigation que o Expo Router carrega
 * anima a cena (opacidade e deslocamento) com `useNativeDriver`. Ele guarda
 * um `Animated.Value` por rota, dispara `Animated.parallel(...).start()` num
 * efeito, e a cena é um `Animated.View` cujo estilo lê esse valor. Na
 * arquitetura nova do React Native, um REDESENHO desse `Animated.View` no
 * meio da animação recomita a cena com o valor que o lado JavaScript conhece,
 * que é o valor de PARTIDA (a animação nativa não escreve de volta enquanto
 * corre, e nem ao ser interrompida): opacidade zero. A cena fica escura até a
 * próxima transição, que é o "só volta se eu sair e entrar" do Rafa.
 *
 * Quem redesenha a cena no meio da transição? Dois gatilhos, e o segundo é o
 * que sobreviveu à primeira correção:
 *
 * 1. o layout das abas guardando estado que muda durante a transição (fila e
 *    sino avisando). Esse saiu: o layout não tem mais estado nenhum, e
 *    `__tests__/a-aba-nao-fica-escura.test.tsx` prova contra o navegador de
 *    verdade que o pai parado ordena UMA animação por rota;
 * 2. o `Screen` da `@react-navigation/elements` guarda a ALTURA DO CABEÇALHO
 *    em estado e a mede no `onLayout` do cabeçalho. A estimativa inicial
 *    inclui a barra de status; este aplicativo paga a área segura uma vez só
 *    e zera `headerStatusBarHeight`, então a medida sempre difere da
 *    estimativa, e TODA primeira montagem de aba faz `setState` dentro da
 *    cena, no meio dos 120 ms da transição. É por isso que o defeito aparece
 *    na primeira visita a cada aba e some depois: na segunda o cabeçalho já
 *    foi medido. Esse gatilho está dentro da biblioteca, e não sai.
 *
 * Então a decisão é não deixar o navegador animar a cena (`animation:
 * "none"`, sempre, e não só com redução de movimento): sem interpolador,
 * a cena nasce com opacidade cheia e `activityState` constante, e não existe
 * valor nativo para ficar parado. O que se perde é a deslizada de 50 pontos
 * na direção da aba. O que se ganha é a aba aparecer.
 *
 * ## Por que a entrada é nossa, e com driver JavaScript
 *
 * O Rafa pediu suavidade nas transições, e uma aba que aparece seca parece
 * quebrada. Este invólucro entra pelo `screenLayout` do navegador, que
 * embrulha o conteúdo de cada rota DENTRO do `NavigationProvider` dela, e
 * faz o conteúdo subir `espaco.e2` e atravessar a opacidade a cada foco. O
 * cabeçalho fica fora do invólucro e não pisca: é o conteúdo que chega.
 *
 * `useNativeDriver: false`, de propósito e contra a régua geral do
 * aplicativo, pelo motivo escrito acima: com driver JavaScript o valor que o
 * lado JavaScript conhece é sempre o valor corrente, então um redesenho no
 * meio da animação (o cabeçalho medindo, a lista chegando, a fila avisando)
 * recomita com o quadro certo, e a animação segue. São 120 ms de opacidade
 * e deslocamento num `View` só; não há lista dentro do valor animado.
 *
 * A duração é `respostaAoToque`: isto responde ao dedo, não é algo que mudou
 * sozinho. Com redução de movimento o conteúdo nasce pronto.
 */

/** O que o invólucro precisa do navegador da rota, e nada mais. */
export type NavegacaoDaCena = {
  isFocused: () => boolean;
  addListener: (evento: "focus", ouvinte: () => void) => () => void;
};

export function CenaDaAba({ navigation, children }: { navigation: NavegacaoDaCena; children: ReactNode }) {
  const reduzirMovimento = useReducaoDeMovimento();
  /*
    Um valor só: 0 é "chegando", 1 é "aqui". Opacidade e deslocamento saem
    dele por interpolação, então os dois andam juntos por construção.
  */
  const presenca = useRef(new Animated.Value(navigation.isFocused() ? 0 : 1)).current;

  useEffect(() => {
    const entrar = () => {
      if (reduzirMovimento) {
        presenca.setValue(1);
        return;
      }
      presenca.setValue(0);
      Animated.timing(presenca, {
        toValue: 1,
        duration: movimento.respostaAoToque,
        easing: Easing.bezier(...easing.entrada),
        useNativeDriver: false,
      }).start();
    };
    if (navigation.isFocused()) entrar();
    return navigation.addListener("focus", entrar);
  }, [navigation, presenca, reduzirMovimento]);

  return (
    <Animated.View
      testID="cena-da-aba"
      style={{
        flex: 1,
        opacity: presenca,
        transform: [{ translateY: presenca.interpolate({ inputRange: [0, 1], outputRange: [espaco.e2, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * O `screenLayout` que o layout das abas entrega ao navegador. Função de
 * módulo, e não fechamento: o navegador chama isto a cada desenho, e uma
 * função nova a cada vez faria o React tratar o invólucro como peça nova e
 * remontar a aba inteira.
 */
export function desenharCena({ navigation, children }: { navigation: NavegacaoDaCena; children: ReactNode }): ReactElement {
  return <CenaDaAba navigation={navigation}>{children}</CenaDaAba>;
}
