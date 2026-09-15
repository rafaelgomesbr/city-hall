import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";

import { Botao, Tocavel, Txt, useTema } from "./componentes";
import {
  borda, elevacao, espaco, movimento, opacidade, raio, tinta, toque,
} from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A FOLHA DE ESCOLHA: uma pergunta, um assunto, duas ou mais respostas que
 * valem o mesmo, e uma saída nomeada.
 *
 * Nasceu como `EscolhaDeMapa`, com as três respostas do botão do mapa da
 * vistoria escritas dentro dela. A tela do mapa das tarefas precisou de DUAS
 * perguntas diferentes no mesmo turno (o que fazer ao tocar num pino, e como
 * chegar até a tarefa aberta), e o cabeçalho de `EscolhaDeMapa` já dizia por
 * que copiar o invólucro seria errado: "uma segunda forma de caixa que sobe
 * seria uma segunda gramática na mesma tela". Então o invólucro virou esta
 * peça, e cada pergunta traz o título, o assunto e as respostas dela.
 * `EscolhaDeMapa` continua existindo, com a mesma assinatura e os mesmos
 * `testID`s, e passou a ser uma chamada desta.
 *
 * ## Por que é uma folha, e não um `Dialogo`
 *
 * O `Dialogo` do produto tem duas saídas POR CONSTRUÇÃO, e o tipo dele cobra
 * isso: uma ação e uma recusa. Aqui não há ação principal. As respostas são
 * igualmente legítimas, e qual é a certa depende de o agente estar no carro,
 * na porta da casa, ou com o rádio na mão. Promover uma delas a primária seria
 * decidir por ele, dentro de um componente. Por isso o tipo cobra PELO MENOS
 * DUAS: uma pergunta com uma resposta só é um `Dialogo` disfarçado.
 *
 * O invólucro (modal, véu, folha ancorada embaixo, um valor animado só,
 * `paddingBottom` maior que o de cima por causa da barra de gestos) é o mesmo
 * do `Dialogo`, de propósito: é o desenho de folha do produto.
 *
 * ## A regra de conteúdo, herdada e não reinventada
 *
 * `Dialogo.tsx` escreve, com estas palavras, que **o botão que age REPETE o
 * verbo da ação**, nunca "OK" nem "Sim", porque quem lê em pé, na chuva, lê o
 * botão e não o título. Vale para cada resposta daqui, e vale para a saída:
 * "Cancelar" num aplicativo de campo é ambíguo do jeito mais caro possível
 * (cancelar a escolha, ou cancelar a vistoria?), então quem chama nomeia a
 * saída pelo que ela faz ("Continuar na vistoria", "Continuar no mapa").
 */

/** Uma resposta. `chave` é o que volta a quem chamou; quem age é a tela. */
export type OpcaoDaFolha<Chave extends string> = {
  chave: Chave;
  testID: string;
  /** Começa por verbo. É a regra do `Dialogo`, e ela vale aqui. */
  titulo: string;
  detalhe: string;
  desenho: (cor: string) => ReactNode;
};

export function FolhaDeEscolha<Chave extends string>({
  aberto, titulo, assunto, opcoes, saida, aoEscolher, aoFechar, testID = "folha-de-escolha",
}: {
  aberto: boolean;
  /** A pergunta, em uma linha. */
  titulo: string;
  /**
   * De quem a folha fala: o endereço, ou o protocolo e o endereço. Uma folha
   * sem assunto é uma pergunta sem sujeito, e com duas tarefas na tela o
   * agente precisa saber de qual delas está decidindo.
   */
  assunto: string;
  /** Duas ou mais, cobrado pelo tipo. Ver o cabeçalho. */
  opcoes: readonly [OpcaoDaFolha<Chave>, OpcaoDaFolha<Chave>, ...OpcaoDaFolha<Chave>[]];
  /** A saída sem escolher, nomeada pelo que faz. */
  saida: { titulo: string; testID: string };
  aoEscolher: (chave: Chave) => void;
  aoFechar: () => void;
  /** O da folha. O fundo que fecha ao toque recebe `${testID}-fundo`. */
  testID?: string;
}) {
  const tema = useTema();
  const reduzir = useReducaoDeMovimento();

  /*
    Um valor animado só, como no `Dialogo`: a folha sobe e o fundo escurece
    pelo mesmo valor. Dois valores separados escorregam um do outro em aparelho
    de entrada, e o sintoma é a folha chegando antes de o fundo escurecer.
  */
  const entrada = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!aberto) { entrada.setValue(0); return; }
    if (reduzir) { entrada.setValue(1); return; }
    entrada.setValue(0);
    Animated.timing(entrada, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [aberto, reduzir, entrada]);

  return (
    <Modal
      visible={aberto}
      transparent
      animationType="none"
      /* Sem isto o botão físico de voltar do Android não fecha a folha. */
      onRequestClose={aoFechar}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: tinta.t950,
              opacity: entrada.interpolate({ inputRange: [0, 1], outputRange: [0, opacidade.veu] }),
            },
          ]}
        >
          {/*
            Tocar fora fecha sem escolher, que é a saída mais barata de uma
            folha aberta por engano. Escondida do leitor de tela de propósito:
            num modal, o fundo não existe para quem navega por voz, e anunciar
            aqui um botão seria prometer uma saída que ele nunca encontra. Quem
            navega por voz sai pela saída nomeada, logo abaixo.
          */}
          <Pressable
            testID={`${testID}-fundo`}
            onPress={aoFechar}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          style={{
            ...elevacao(tema).folha,
            borderTopLeftRadius: raio.cartao,
            borderTopRightRadius: raio.cartao,
            padding: espaco.e5,
            /* Maior que o de cima por causa da barra de gestos, que come o rodapé. */
            paddingBottom: espaco.e7,
            gap: espaco.e4,
            transform: [
              {
                translateY: entrada.interpolate({
                  inputRange: [0, 1],
                  outputRange: [espaco.e6, 0],
                }),
              },
            ],
            opacity: entrada,
          }}
        >
          <View style={{ gap: espaco.e2 }}>
            <Txt variante="h2">{titulo}</Txt>
            <Txt variante="corpoP" discreto>{assunto}</Txt>
          </View>

          <View style={{ gap: espaco.e2 }}>
            {opcoes.map((opcao) => (
              <Tocavel
                key={opcao.chave}
                testID={opcao.testID}
                accessibilityRole="button"
                /*
                  O título e o detalhe viram UMA frase para quem ouve. Em dois
                  elementos, o leitor de tela lê o verbo, e só depois de mais um
                  gesto lê o que ele faz, que é a ordem errada para quem decide
                  sem ver.
                */
                accessibilityLabel={`${opcao.titulo}. ${opcao.detalhe}`}
                onPress={() => { aoEscolher(opcao.chave); aoFechar(); }}
                estilo={{
                  minHeight: toque,
                  padding: espaco.e3,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: espaco.e3,
                  borderRadius: raio.normal,
                  borderWidth: borda.fio,
                  borderColor: tema.borda,
                  backgroundColor: tema.superficie2,
                }}
              >
                {/*
                  O desenho ACOMPANHA a palavra e não a substitui: quem usa este
                  aplicativo o abre duas vezes por semana e não decora
                  pictograma. Ele sai em `textoDiscreto` porque quem carrega a
                  hierarquia aqui é o título, e três ícones na cor de marca, um
                  embaixo do outro, seriam três destaques para três opções que
                  valem o mesmo.
                */}
                {opcao.desenho(tema.textoDiscreto)}
                <View style={{ flex: 1, gap: espaco.e1 }}>
                  <Txt variante="corpo" negrito>{opcao.titulo}</Txt>
                  <Txt variante="corpoP" discreto>{opcao.detalhe}</Txt>
                </View>
              </Tocavel>
            ))}
          </View>

          <Botao
            testID={saida.testID}
            titulo={saida.titulo}
            tipo="secundario"
            onPress={aoFechar}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
