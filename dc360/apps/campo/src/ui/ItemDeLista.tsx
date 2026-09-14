import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing } from "react-native";
import { easing, movimento } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A ENTRADA E A SAÍDA DE UM ITEM DE LISTA, num vocabulário só.
 *
 * As duas listas deste aplicativo perdem e ganham itens sozinhas, e as duas
 * perdiam do mesmo jeito: um cartão a menos no quadro seguinte. Quem estava
 * olhando para outro ponto da tela não via nada acontecer, e uma lista que
 * encolhe sem aviso é como um trabalho parece perdido.
 *
 * A fila de envio resolveu isso primeiro, com um `CartaoQueSai` escrito dentro
 * dela. A lista de tarefas continuou sem nada, e é a lista em que sumir dói
 * mais: lá o item que some acabou de ser DEVOLVIDO para a coordenação, que é um
 * ato institucional, com motivo escrito e o nome de quem assinou. Ele merece
 * mais do que desaparecer.
 *
 * Este arquivo existe para as duas usarem a MESMA saída, e não duas parecidas.
 * Escala e opacidade, com duração e curva de token, na thread de interface.
 * Duas listas vizinhas com ritmos diferentes é o defeito que ninguém relata e
 * todo mundo sente.
 *
 * **É um componente só, com as duas pontas, e não dois aninhados.** Entrada e
 * saída nunca acontecem juntas no mesmo cartão, então um valor animado basta, e
 * um basta é o que importa numa lista de dezenas de itens num aparelho fraco.
 */

/**
 * Quanto o cartão encolhe ao sair, e de quanto ele cresce ao chegar.
 *
 * Noventa e seis por cento, e não setenta: o item precisa PARECER que saiu ou
 * chegou, não ser jogado para longe. Encolher demais lê como erro, e a saída
 * mais comum destas listas é trabalho concluído.
 */
export const ESCALA_NA_BORDA = 0.96;

export function ItemDeLista({ entrando = false, saindo = false, atraso = 0, children }: {
  /** Este item ACABOU de chegar a uma lista que já estava na tela. */
  entrando?: boolean;
  /** Este item já saiu do disco e ainda está desaparecendo da tela. */
  saindo?: boolean;
  /**
   * Quantos milissegundos esperar antes de COMEÇAR a aparecer, para a lista
   * chegar em cascata e não como um bloco só. O número sai de
   * `atrasoEmCascata()` em `hierarquia.ts`, que tem teto justamente para a
   * cascata não virar espera.
   *
   * Só vale para a entrada. Saída em cascata atrasaria o sumiço de um item que
   * o disco já não tem, e a lista ficaria mostrando trabalho que acabou.
   *
   * O item nasce na árvore no primeiro quadro de qualquer jeito: o que espera é
   * a PINTURA. Montar o filho depois faria a `FlatList` medir uma lista
   * incompleta, e o leitor de tela anunciaria os cartões chegando um a um.
   */
  atraso?: number;
  children: ReactNode;
}) {
  const reduzirMovimento = useReducaoDeMovimento();

  /*
    `entrando` é lido UMA vez, na montagem, e guardado.

    Enquanto a animação roda, a tela já recalculou quem é novo e a propriedade
    vira falsa; ler o valor corrente a cada quadro interromperia a entrada no
    meio. E o valor inicial precisa estar certo no PRIMEIRO quadro, e não num
    efeito: começar em 1, cair para 0 e voltar é um piscar, que é pior do que
    não animar nada.
  */
  const animarEntrada = useRef(entrando && !reduzirMovimento).current;
  const presenca = useRef(new Animated.Value(animarEntrada ? 0 : 1)).current;
  const atrasoInicial = useRef(Math.max(0, atraso)).current;

  useEffect(() => {
    if (!animarEntrada) return;
    Animated.timing(presenca, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      /*
        Lido uma vez junto com `entrando`, pelo mesmo motivo: o índice do item
        muda quando a lista se reordena, e um atraso novo no meio da animação
        reiniciaria a entrada de um cartão que já está na tela.

        Com a redução de movimento JÁ CONHECIDA na montagem nem se chega aqui
        (`animarEntrada` é falso e o item nasce inteiro). Quando ela chega
        depois, que é o caso normal, quem desfaz é o efeito logo abaixo: o
        atraso não pode segurar a pintura de quem pediu menos movimento, porque
        isso transforma acessibilidade em lentidão.
      */
      delay: atrasoInicial,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [animarEntrada, atrasoInicial, presenca]);

  /*
    A CHAVE DE REDUÇÃO CHEGA ATRASADA, e ela chega atrasada SEMPRE.

    `useReducaoDeMovimento` começa em `false` e só sabe a resposta do sistema
    quando a promessa de `AccessibilityInfo` resolve, o que nunca é o primeiro
    quadro. Então `animarEntrada`, que é lido na montagem, é `true` mesmo para
    quem ligou a chave: a decisão é tomada antes de a resposta existir.

    Sem esta guarda, quem pediu menos movimento recebia a animação inteira mais
    o atraso da cascata em cima, ou seja, a opção de acessibilidade virava meio
    segundo de espera olhando para um cartão invisível. É o contrário do que ela
    pede, e é a pessoa que este aplicativo coloca em pé num barranco.

    Parar e fixar em 1, e não deixar terminar: deixar terminar é a animação
    acontecendo, que é justamente o que dá enjoo em quem ligou a chave.
  */
  useEffect(() => {
    if (!animarEntrada || !reduzirMovimento) return;
    presenca.stopAnimation();
    presenca.setValue(1);
  }, [animarEntrada, reduzirMovimento, presenca]);

  /*
    A DESPEDIDA TEM VOLTA, e por isso este efeito tem as duas pontas.

    Quem chama começa a despedida quando o item some do disco e larga o cartão
    um pouco depois. Nesse intervalo o item pode VOLTAR: na lista de tarefas é a
    devolução que o servidor recusa (a tarefa sai da lista quando o pedido entra
    na fila, e volta quando a recusa chega), e a tela já trata esse caso tirando
    o item da despedida para ele não aparecer duas vezes com a mesma chave.

    O item nunca foi desmontado: mesma chave, mesmo componente, e esta peça o
    tinha deixado em opacidade zero sem nenhum caminho de volta. O que sobrava
    na tela era um buraco do tamanho do cartão, e o cartão que faltava era
    justamente o que diz "a coordenação não recebeu esta devolução", ou seja, o
    único aviso de que aquela tarefa continua sendo do agente.

    `jaSaiu` é o que separa a VOLTA de uma renderização qualquer em que nada
    aconteceu: sem ela, todo item da lista seria reanimado a cada leitura de
    disco, e a lista que não pode pular passaria a piscar.
  */
  const jaSaiu = useRef(false);
  useEffect(() => {
    if (saindo) {
      jaSaiu.current = true;
      if (reduzirMovimento) {
        presenca.setValue(0);
        return;
      }
      Animated.timing(presenca, {
        toValue: 0,
        duration: movimento.mudancaDeEstado,
        easing: Easing.bezier(...easing.saida),
        /*
          Opacidade e escala rodam na thread de interface: o JavaScript deste
          aplicativo pode estar ocupado drenando a fila justamente agora. E
          escala não muda layout, então a âncora da `FlatList` da lista de
          tarefas, que existe para a lista não pular, não sente nada disto.
        */
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!jaSaiu.current) return;
    jaSaiu.current = false;
    /* A saída pode estar no meio: pará-la antes é o que impede ela de continuar
       levando a opacidade para zero por cima da volta. */
    presenca.stopAnimation();
    if (reduzirMovimento) {
      presenca.setValue(1);
      return;
    }
    Animated.timing(presenca, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [saindo, reduzirMovimento, presenca]);

  return (
    <Animated.View
      style={{
        opacity: presenca,
        transform: [{
          scale: presenca.interpolate({
            inputRange: [0, 1], outputRange: [ESCALA_NA_BORDA, 1],
          }),
        }],
      }}
    >
      {children}
    </Animated.View>
  );
}
