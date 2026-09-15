import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";

import { Botao, Tocavel, Txt, useTema } from "./componentes";
import { IconeAparelho, IconeGps, IconeLocalizacao } from "./icones";
import {
  borda, elevacao, espaco, icone as tamanhoDeIcone, movimento, opacidade, raio, tinta, toque,
} from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * AS TRÊS RESPOSTAS DO BOTÃO DO MAPA.
 *
 * "Abrir no mapa" tinha uma resposta só, e ela levava o agente para FORA do
 * aplicativo, no meio de uma coleta de quarenta minutos, sem perguntar.
 * Quem paga olhou a tela e disse: "leva o usuário pra fora do app, deveria
 * perguntar se quer abrir o maps externo ou abrir o mapa dentro do app com a
 * rota, tem que ter uma opção de copiar as coordenadas".
 *
 * As três, e o que separa uma da outra:
 *
 * 1. **Abrir no aplicativo de mapas do aparelho.** É a rota de verdade, com voz
 *    e trânsito, no aplicativo que a pessoa já usa e cujos mapas ela já baixou.
 *    O preço é sair do DC360, e a folha diz isso na letra, porque descobrir
 *    depois de sair é descobrir tarde.
 * 2. **Ver o mapa aqui dentro.** É o mapa que a própria tela de vistoria já
 *    desenha, no cartão de localização: um toque rola até ele. Não sai do
 *    aplicativo e não interrompe a coleta.
 * 3. **Copiar a coordenada.** A única das três que funciona num aparelho sem
 *    nenhum aplicativo de mapas instalado, e a única que serve para o que o
 *    agente faz com mais frequência do que navegar: ditar o ponto por rádio
 *    para a base, ou mandar para a equipe que está subindo atrás.
 *
 * ## Por que é uma folha, e não um `Dialogo`
 *
 * O `Dialogo` do produto tem duas saídas POR CONSTRUÇÃO, e o tipo dele cobra
 * isso: uma ação e uma recusa. Aqui não há ação principal. As três respostas
 * são igualmente legítimas, e qual é a certa depende de o agente estar no
 * carro, na porta da casa, ou com o rádio na mão. Promover uma das três a
 * primária seria decidir por ele, dentro de um componente.
 *
 * O invólucro (modal, véu, folha ancorada embaixo, um valor animado só,
 * `paddingBottom` maior que o de cima por causa da barra de gestos) é o mesmo
 * do `Dialogo`, de propósito e não por cópia descuidada: é o desenho de folha
 * do produto, e uma segunda forma de caixa que sobe seria uma segunda gramática
 * na mesma tela. O que muda é o miolo, que aqui é lista e não pergunta.
 *
 * ## A regra de conteúdo, herdada e não reinventada
 *
 * `Dialogo.tsx` escreve, com estas palavras, que **o botão que age REPETE o
 * verbo da ação**, nunca "OK" nem "Sim", porque quem lê em pé, na chuva, lê o
 * botão e não o título. Vale aqui com mais força: três opções chamadas "Mapa",
 * "Aqui" e "Copiar" obrigariam a ler o texto de apoio de cada uma só para saber
 * o que o dedo vai fazer.
 *
 * ## O cuidado de privacidade, e por que ele NÃO é repetido aqui
 *
 * "Ver o mapa aqui dentro" pode desenhar o mapa do Google (a coordenada sai do
 * aparelho) ou o plano esquemático (nenhuma requisição), conforme o município
 * tenha ou não autorizado. Esta folha **não afirma qual dos dois**, e isso é
 * deliberado: quem decide é `useMapaDoMunicipio`, quem diz é a legenda de modo
 * dentro de `MapaDoImovel`, e ela é a seção 2.2 do `docs/SUBPROCESSADORES.md`
 * virada tela. Uma segunda frase, aqui, afirmando o modo antes de a autorização
 * ter sido lida seria exatamente o defeito que o painel pagou para aprender em
 * 13/09: a tela afirma "nenhuma coordenada sai daqui" e um segundo depois
 * desenha o mapa do Google. O que esta folha faz é APONTAR para a legenda, que
 * é a única frase do produto autorizada a dizer o modo.
 */

/** Qual das três o agente escolheu. Quem age é a tela, não a folha. */
export type RespostaDoMapa = "aplicativo" | "aqui-dentro" | "copiar";

type Opcao = {
  chave: RespostaDoMapa;
  testID: string;
  /** Começa por verbo. É a regra do `Dialogo`, e ela vale aqui. */
  titulo: string;
  detalhe: string;
  desenho: (cor: string) => ReactNode;
};

export function EscolhaDeMapa({
  aberto, endereco, coordenada, aoEscolher, aoFechar,
}: {
  aberto: boolean;
  /** Para onde se vai. Uma folha sem destino é uma pergunta sem sujeito. */
  endereco: string;
  /** Já formatada por `coordenadaEmTexto`, para a folha não ter um segundo formato. */
  coordenada: string;
  aoEscolher: (resposta: RespostaDoMapa) => void;
  aoFechar: () => void;
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

  const OPCOES: Opcao[] = [
    {
      chave: "aplicativo",
      testID: "mapa-no-aparelho",
      titulo: "Abrir no aplicativo de mapas",
      detalhe:
        "Sai do DC360 e abre a rota no mapa do aparelho. A vistoria fica "
        + "guardada como está, e volta inteira quando você voltar.",
      desenho: (cor) => <IconeAparelho cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
    {
      chave: "aqui-dentro",
      testID: "mapa-aqui-dentro",
      titulo: "Ver o mapa aqui dentro",
      detalhe:
        "Rola até o mapa desta tela, sem sair do aplicativo. A legenda dele diz "
        + "se a coordenada sai do aparelho ou se o plano é desenhado aqui.",
      desenho: (cor) => <IconeGps cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
    {
      chave: "copiar",
      testID: "mapa-copiar",
      titulo: "Copiar a coordenada",
      detalhe: `Copia ${coordenada} para colar em outro aplicativo, ou para ditar por rádio.`,
      desenho: (cor) => <IconeLocalizacao cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
  ];

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
            navega por voz sai por "Continuar na vistoria", logo abaixo.
          */}
          <Pressable
            testID="escolha-de-mapa-fundo"
            onPress={aoFechar}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          testID="escolha-de-mapa"
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
            <Txt variante="h2">Como chegar até lá?</Txt>
            <Txt variante="corpoP" discreto>{endereco}</Txt>
          </View>

          <View style={{ gap: espaco.e2 }}>
            {OPCOES.map((opcao) => (
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

          {/*
            A saída nomeia o que faz, e não "Cancelar". Num aplicativo de campo,
            "Cancelar" é ambíguo do jeito mais caro possível: cancelar a
            escolha, ou cancelar a vistoria? É a mesma decisão que o diálogo de
            nova vistoria já tomou ("Manter só a vistoria que já fiz").
          */}
          <Botao
            testID="mapa-continuar"
            titulo="Continuar na vistoria"
            tipo="secundario"
            onPress={aoFechar}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
