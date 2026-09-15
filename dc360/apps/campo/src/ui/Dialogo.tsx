import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Botao, Txt, useTema } from "./componentes";
import { easing, elevacao, espaco, movimento, opacidade, raio, tinta } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A pergunta que precede o que não se desfaz, desenhada por este aplicativo e
 * não pelo sistema operacional.
 *
 * Este componente existe para tirar `Alert.alert` das quatro decisões
 * irreversíveis do produto (sair da conta com coleta pendente, descartar uma
 * coleta da fila, abrir uma segunda vistoria do mesmo protocolo, e a
 * confirmação de que a vistoria foi guardada). O alerta nativo é conveniente
 * para quem escreve e ruim para quem está na rua, por quatro motivos que se
 * somam no pior momento possível:
 *
 * 1. **Ele não é deste aplicativo.** Não segue o tema: no plantão noturno, com
 *    o aparelho em modo escuro, o alerta do sistema abre num retângulo claro no
 *    meio da tela. Quem está com a vista adaptada ao escuro leva alguns
 *    segundos para voltar a enxergar a tela, e o botão que apaga a vistoria já
 *    está debaixo do dedo.
 * 2. **Ele não obedece à régua de tipografia do produto.** O corpo do alerta
 *    nativo é menor que o `corpo` daqui, e é justamente o texto que explica o
 *    que vai ser perdido.
 * 3. **Os botões dele são do tamanho do sistema, e não os 52 pontos que este
 *    aplicativo exige.** A razão dos 52 está em `tokens.ts`: dedo, com luva, na
 *    chuva, num barranco. Errar o alvo aqui é errar entre "manter na fila" e
 *    "descartar".
 * 4. **Ele fica no meio da tela.** Num aparelho de 6 polegadas, o meio da tela
 *    é onde o polegar de quem segura o telefone com uma mão só não alcança sem
 *    regripar, e regripar em pé num barranco é como telefone cai no barro. Por
 *    isso este diálogo é uma folha ancorada embaixo.
 *
 * Duas regras de conteúdo, e as duas evitam defeito de campo:
 *
 * - **O botão que age REPETE o verbo da ação.** "Descartar esta coleta", nunca
 *   "OK" nem "Sim". Quem lê um diálogo em pé, na chuva, lê o botão e não o
 *   título, e "OK" não diz o que vai acontecer com o trabalho da manhã.
 * - **A ação destrutiva tem desenho próprio**, e nunca só a cor: ela vem em
 *   `tipo="perigo"` com a palavra inteira dentro, enquanto a recusa vem
 *   contornada e sem preenchimento.
 *
 * A recusa fica EMBAIXO da ação, e essa ordem é deliberada: a parte de baixo é
 * a que o polegar alcança sem pensar, e o alcance fácil pertence à opção que
 * não faz nada. Chegar na ação destrutiva exige um movimento a mais.
 *
 * E ela é OBRIGATÓRIA quando a ação é destrutiva, cobrada pelo tipo das
 * propriedades e não por convenção. O motivo apareceu escrevendo o teste deste
 * arquivo: tocar no fundo escuro fecha o diálogo, mas o fundo NÃO existe para
 * quem usa leitor de tela. Um diálogo modal esconde tudo o que está fora dele,
 * inclusive o próprio fundo, e é assim que funciona no aparelho de verdade. Um
 * diálogo destrutivo sem botão de recusa seria, para quem navega por voz, uma
 * pergunta com uma resposta só, e a resposta única seria "apague a minha
 * vistoria".
 */

/**
 * A FAIXA DE VÉU QUE SOBRA ACIMA DA FOLHA quando ela bate no teto.
 *
 * Não é folga por folga. Uma folha que encostasse na área segura viraria, aos
 * olhos de quem segura o aparelho, uma tela nova para a qual o aplicativo
 * navegou, e o agente procuraria o botão de voltar que não existe. É a mesma
 * razão pela qual a `FolhaArrastavel` nunca chega a 100% da altura: a faixa
 * que sobra em cima é o que diz "isto é uma folha sobre a tela".
 *
 * Sai da escala de espaço, e não de um número solto, pela regra de sempre.
 */
export const RESPIRO_ACIMA_DA_FOLHA = espaco.e6;

/**
 * Até onde a folha pode crescer, em pontos.
 *
 * A conta, e a razão de ela existir: a folha crescia com o conteúdo e nada a
 * prendia à área segura. Com seis motivos de devolução e dois botões, ela
 * subia por cima do relógio do iPhone, e a captura de quem paga mostrou isso.
 * O teto é a altura da janela menos o que o aparelho reserva no topo (relógio,
 * câmera) menos o respiro. Passado o teto, o conteúdo rola por dentro e os
 * botões continuam no rodapé da folha, ao alcance do polegar.
 *
 * Pura, e exportada, para a conta ser conferida como aritmética.
 */
export function tetoDaFolha({ alturaDaTela, margemDeCima }: {
  alturaDaTela: number;
  margemDeCima: number;
}): number {
  return alturaDaTela - margemDeCima - RESPIRO_ACIMA_DA_FOLHA;
}

export type AcaoDoDialogo = {
  /**
   * O rótulo do botão. REPETE o verbo do que vai acontecer.
   *
   * "Sair da conta", "Descartar esta coleta", "Fazer nova vistoria". Nunca
   * "OK", "Sim" ou "Confirmar": esses três não dizem nada a quem está lendo com
   * pressa, e é com pressa que se lê um diálogo em campo.
   */
  rotulo: string;
  aoTocar: () => void;
  /** Perde coleta, sessão ou trabalho já feito. Ganha desenho próprio. */
  destrutiva?: boolean;
  /**
   * Trava o botão enquanto a pergunta ainda não foi respondida.
   *
   * Existe por causa do diálogo de devolução, que pede um MOTIVO antes de
   * deixar agir. A alternativa seria aceitar o toque e recusar depois com um
   * aviso, e isso é pior em campo: o agente lê "devolver", toca, e a tela diz
   * que não. Botão apagado, com a frase do que falta logo acima, responde a
   * pergunta antes de ela virar frustração.
   */
  desabilitada?: boolean;
};

type BaseDoDialogo = {
  aberto: boolean;
  titulo: string;
  texto: string;
  /**
   * O que a pergunta precisa perguntar ANTES de deixar agir.
   *
   * Opcional, e quase sempre ausente: a maioria das decisões daqui é sim ou
   * não, e um diálogo que pede coisas é um formulário disfarçado. A exceção é a
   * devolução da tarefa, em que a coordenação não consegue fazer nada sem o
   * motivo, e perguntar numa tela separada custaria uma navegação a mais a
   * quem está de capa de chuva.
   *
   * Vai dentro de uma área que ROLA: são seis motivos de 52 pontos mais um
   * campo de texto, e num aparelho pequeno, de lado, isso não cabe. Sem o
   * rolamento, os botões de agir e recusar seriam empurrados para fora da tela,
   * e a pergunta ficaria sem resposta possível.
   */
  conteudo?: ReactNode;
  aoFechar: () => void;
  testID?: string;
};

/**
 * A recusa é opcional só quando a ação não destrói nada.
 *
 * Isto é um portão de compilação, e não um pedido: ver o comentário acima sobre
 * o leitor de tela e o fundo que não existe para ele.
 */
type PropsDoDialogo = BaseDoDialogo & (
  | {
      acao: AcaoDoDialogo & { destrutiva: true };
      /** Obrigatória: a ação destrói alguma coisa. */
      recusa: { rotulo: string };
    }
  | {
      acao: AcaoDoDialogo & { destrutiva?: false };
      /**
       * Ausente só quando não há o que recusar, como na confirmação de que a
       * vistoria já foi guardada: ali não existe desfazer, existe só seguir em
       * frente.
       */
      recusa?: { rotulo: string };
    }
);

export function Dialogo({
  aberto,
  titulo,
  texto,
  conteudo,
  acao,
  recusa,
  aoFechar,
  testID = "dialogo",
}: PropsDoDialogo) {
  const tema = useTema();
  const reduzir = useReducaoDeMovimento();
  const margens = useSafeAreaInsets();
  const { height: alturaDaTela } = useWindowDimensions();

  /*
    Um valor animado só, e não um por propriedade.

    A folha sobe e aparece no mesmo gesto, e o escurecimento do fundo é uma
    interpolação do mesmo valor. Dois valores separados escorregariam um do
    outro em aparelho fraco, e o resultado seria a folha chegando antes do
    fundo escurecer, que é exatamente a piscada que este diálogo existe para
    não dar na vista de quem está adaptado ao escuro.
  */
  const entrada = useRef(new Animated.Value(0)).current;

  /*
    A FOLHA CONTINUA MONTADA ENQUANTO SAI, e é por isso que `visible` não é
    `aberto`.

    Enquanto o `Modal` seguia `aberto` à risca, a folha sumia no quadro
    seguinte ao toque: subia com transição e descia num corte seco, que é o
    tipo de detalhe que faz um aplicativo parecer sem vida. Agora quem fecha o
    `Modal` é o FIM da animação de saída. `montado` é o que o `Modal` obedece;
    `aberto` é o que a tela pediu. Os dois divergem só durante a descida.

    A referência existe para o efeito abaixo saber se há o que desfazer sem
    entrar na lista de dependências: um diálogo que nasce fechado não tem
    saída para animar, e animar uma saída de uma folha que nunca subiu seria
    uma animação a mais em toda tela que monta um diálogo fechado, ou seja, em
    todas.
  */
  const [montado, setMontado] = useState(aberto);
  const montadoRef = useRef(aberto);
  const fixarMontado = (valor: boolean) => {
    montadoRef.current = valor;
    setMontado(valor);
  };

  useEffect(() => {
    /*
      Uma animação de cada vez. Se a folha é pedida de volta no meio da
      descida, a descida para AQUI e avisa que não terminou; é essa bandeira
      que impede a saída interrompida de fechar a folha que acabou de ser
      pedida de novo.
    */
    entrada.stopAnimation();

    if (aberto) {
      fixarMontado(true);
      if (reduzir) {
        // Quem pediu para reduzir movimento não perde o diálogo: perde a
        // subida. O conteúdo é o mesmo, e ele aparece inteiro de uma vez.
        entrada.setValue(1);
        return;
      }
      /*
        Parte de onde estiver: zero numa abertura comum (a saída anterior
        terminou em zero), ou do meio do caminho quando a folha foi pedida de
        volta durante a descida. Zerar aqui faria a folha piscar para o fundo
        antes de subir de novo.
      */
      Animated.timing(entrada, {
        toValue: 1,
        duration: movimento.mudancaDeEstado,
        easing: Easing.bezier(...easing.entrada),
        // Opacidade e deslocamento são o que a camada nativa anima sozinha.
        // Sem isto, cada quadro atravessa a ponte e a folha sobe aos
        // solavancos no aparelho de entrada que a prefeitura comprou.
        useNativeDriver: true,
      }).start();
      return;
    }

    /* Nunca subiu, ou já desceu: não há o que desfazer. */
    if (!montadoRef.current) return;

    if (reduzir) {
      entrada.setValue(0);
      fixarMontado(false);
      return;
    }
    Animated.timing(entrada, {
      toValue: 0,
      duration: movimento.mudancaDeEstado,
      /*
        A curva de SAÍDA, e não a de entrada ao contrário: o que deixa a tela
        sai andando, e o olho não precisa acompanhar o fim.
      */
      easing: Easing.bezier(...easing.saida),
      useNativeDriver: true,
    }).start(({ finished }) => {
      /*
        Só a descida que chegou ao fim desmonta. A interrompida (a folha foi
        pedida de volta, ou a chave de redução ligou no meio) já foi tratada
        por quem a interrompeu.
      */
      if (finished) fixarMontado(false);
    });
  }, [aberto, reduzir, entrada]);

  return (
    <Modal
      visible={montado}
      transparent
      // A animação é nossa, e ela respeita a redução de movimento. A do
      // sistema não respeitaria, e as duas juntas dariam movimento em dobro.
      animationType="none"
      /*
        Sem isto, o botão físico de voltar do Android não fecha o diálogo, e o
        agente fica preso numa pergunta sem resposta segura no meio do plantão.
      */
      onRequestClose={aoFechar}
    >
      <View
        style={{ flex: 1, justifyContent: "flex-end" }}
        /*
          Enquanto a folha desce, nada nela responde ao dedo. O agente tocou em
          "Manter na fila" e o dedo desceu de novo, na folha que ainda está
          desaparecendo: se ela continuasse viva, o segundo toque cairia em
          "Descartar esta coleta", que estava logo acima. O "none" alcança os
          descendentes todos, o véu incluído.
        */
        pointerEvents={aberto ? "auto" : "none"}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: tinta.t950,
              /*
                A opacidade do véu sai de `opacidade.veu`, e não de um número
                escrito aqui. Enquanto morou nesta linha, ela valia 0,66 com o
                token declarando 0,55, e as duas conviveram porque nada obrigava
                uma a conhecer a outra. O token foi acertado para o valor que
                este arquivo desenhava (ver a razão em `tokens.ts`), e o portão
                de design reprova a volta do literal.
              */
              opacity: entrada.interpolate({ inputRange: [0, 1], outputRange: [0, opacidade.veu] }),
            },
          ]}
        >
          {/*
            Tocar fora fecha sem fazer nada. É a saída mais barata possível para
            um diálogo que abriu por engano, e ela nunca faz o lado destrutivo:
            fechar é sempre recusar.

            Ela é escondida do leitor de tela DE PROPÓSITO, e não por descuido:
            um diálogo modal tira da árvore de acessibilidade tudo o que está
            fora dele, o próprio fundo incluído, então anunciar aqui um botão
            "Fechar sem fazer nada" seria prometer uma saída que a pessoa nunca
            vai encontrar. Quem navega por voz sai pela recusa, e é por isso que
            a recusa é obrigatória quando a ação destrói alguma coisa.
          */}
          <Pressable
            testID="dialogo-fundo"
            onPress={aoFechar}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          testID={testID}
          /*
            O leitor de tela para aqui dentro. Sem isto, o dedo deslizando
            continua encontrando os botões da tela de trás, que continuam
            clicáveis para quem navega por gestos, e a pergunta vira decoração:
            dá para acionar "Descartar" da tela de baixo sem nunca responder.
          */
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={{
            /*
              A folha usa o topo da escala de elevação, INTEIRO.

              Enquanto a superfície foi desenhada à mão aqui (fundo
              `tema.superficie`, contorno só no topo, sombra nenhuma), o nível
              `folha` não tinha um único uso no produto, e o preço aparecia no
              tema escuro: a peça que está por cima de tudo terminava em
              `superficie`, que é a superfície de um cartão comum, e o que
              separava as duas era só o véu. Agora quem separa é a camada,
              porque no escuro quem carrega a elevação é a superfície clareando.

              O nível foi corrigido junto, e a razão está em `tokens.ts`: a
              sombra dele descia 12 pontos, ou seja, ele tinha sido desenhado
              para uma folha que paira, e nenhuma folha deste aplicativo paira
              (ver o motivo 4 no alto deste arquivo). Ela sobe.
            */
            ...elevacao(tema).folha,
            /*
              O TETO. Sem ele, a folha crescia com o conteúdo e subia por cima
              do relógio do aparelho (ver `tetoDaFolha`). Com ele, a área de
              perguntas cede (`flexShrink` no `ScrollView` abaixo), o conteúdo
              rola por dentro, e os botões continuam no rodapé da folha.
            */
            maxHeight: tetoDaFolha({ alturaDaTela, margemDeCima: margens.top }),
            borderTopLeftRadius: raio.cartao,
            borderTopRightRadius: raio.cartao,
            padding: espaco.e5,
            // A folga de baixo é maior que a de cima por causa da barra de
            // gestos do aparelho, que come o rodapé e engoliria o alvo do
            // botão que não faz nada.
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
          <Txt variante="h2">{titulo}</Txt>
          <Txt variante="corpo">{texto}</Txt>

          {conteudo && (
            /*
              `flexShrink` é o que faz a área de perguntas ceder espaço aos
              botões quando o conteúdo é alto. Sem ele, o teclado aberto num
              aparelho pequeno empurraria "Devolver" e "Manter comigo" para
              fora da tela, e o diálogo viraria uma pergunta sem resposta.
            */
            <ScrollView
              testID="dialogo-conteudo"
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ gap: espaco.e3 }}
              keyboardShouldPersistTaps="handled"
            >
              {conteudo}
            </ScrollView>
          )}

          <View style={{ gap: espaco.e3 }}>
            <Botao
              testID="dialogo-acao"
              titulo={acao.rotulo}
              tipo={acao.destrutiva ? "perigo" : "primario"}
              /*
                Fecha ANTES de agir, e a ordem importa.

                A ação costuma navegar para fora desta tela (sair da conta
                volta para a entrada, a vistoria guardada volta para a lista).
                Agir primeiro e fechar depois escreveria estado num componente
                que já saiu da árvore, e o diálogo que sobra aberto por trás da
                navegação foi defeito visto: o agente volta para a tela
                anterior e encontra a pergunta ainda de pé, perguntando por algo
                que já aconteceu.
              */
              desabilitado={acao.desabilitada}
              onPress={() => { aoFechar(); acao.aoTocar(); }}
            />
            {recusa && (
              <Botao
                testID="dialogo-recusa"
                titulo={recusa.rotulo}
                tipo="secundario"
                onPress={aoFechar}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
