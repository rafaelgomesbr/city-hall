import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import {
  Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";

import { useTema } from "./componentes";
import { easing, elevacao, espaco, movimento, raio, toque } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A FOLHA QUE CONVIVE COM O MAPA.
 *
 * O pedido de quem paga foi "a gente pode pensar em algo como o uber faz": o
 * mapa ocupa a tela inteira e o conteúdo vem numa folha por cima, que sobe para
 * virar lista e desce para revelar o mapa. Esta peça é essa folha. Ela não é
 * uma tela: quem monta a tela é a frente de "Hoje" e a da vistoria, e as duas
 * consomem daqui.
 *
 * ## O que ela herda de `Dialogo.tsx`, que é a referência da casa
 *
 * - **Um valor animado só.** A subida da folha e o contra-deslocamento do
 *   rodapé saem do MESMO `Animated.Value`. Dois valores separados escorregam um
 *   do outro em aparelho fraco, e aqui o sintoma seria pior que no diálogo: o
 *   rodapé com a ação primária descolaria da folha no meio do arraste.
 * - **`paddingBottom` maior que o de cima**, por causa da barra de gestos do
 *   aparelho, que come o rodapé e engoliria o alvo do botão.
 * - **Movimento por token**, `useNativeDriver`, e a chave de redução de
 *   movimento respeitada.
 *
 * ## E onde ela é o CONTRÁRIO do diálogo, de propósito
 *
 * O `Dialogo` é modal: ele cobre a tela com um véu, declara
 * `accessibilityViewIsModal` e existe para tirar todo o resto do alcance até a
 * pergunta ser respondida. Esta folha **convive**. O mapa atrás continua vivo,
 * continua tocável e continua sendo o lugar onde o agente arrasta para ver a
 * rua ao lado. Por isso aqui:
 *
 * - **não há véu**, e o embrulho que mede a área é `pointerEvents="box-none"`,
 *   que é a linha que faz o toque atravessar até o mapa;
 * - **não há `accessibilityViewIsModal`**, senão o leitor de tela deixaria de
 *   enxergar o mapa e a barra de abas no instante em que a folha existisse, ou
 *   seja, o aplicativo inteiro;
 * - **ela não se fecha.** O mínimo é `recolhida`. A lista de tarefas do dia não
 *   tem estado "ausente": uma folha que some deixa o agente numa tela que só
 *   mostra o mapa, sem nada dizendo onde foi parar o trabalho dele.
 *
 * ## A ação primária não se move, e isso é estrutura e não convenção
 *
 * "Abrir a vistoria" e "Navegar até lá" ficam no `rodape`, e o rodapé é
 * ancorado no fundo da folha e **contra-deslocado pelo mesmo valor animado**.
 * O efeito é que ele fica parado no rodapé da TELA, em qualquer posição da
 * folha, enquanto a folha desliza por trás dele. Sem esse truque, a folha
 * recolhida esconderia a própria ação primária: a folha tem a altura da posição
 * cheia e só a faixa de cima dela aparece, então tudo que estivesse no fim do
 * conteúdo estaria fora da tela justamente na posição em que o agente mais
 * precisa de um toque só.
 *
 * ## Gesto horizontal é PROIBIDO nesta peça
 *
 * Não é esquecimento e não é para depois: a literatura de operação com luva
 * recomenda evitá-lo por inteiro, e o dedo molhado erra o eixo. Um arraste em
 * que o horizontal domina é RECUSADO (ver `deveOArrasteComecar`), e recusar
 * aqui é o que devolve o gesto para o mapa, que é quem sabe o que fazer com
 * ele.
 */

export type PosicaoDaFolha = "recolhida" | "meia" | "cheia";

/**
 * Quanto da altura disponível cada posição ocupa.
 *
 * Frações, e não pontos: o mesmo aplicativo roda num aparelho de 5,4 e num de
 * 6,9 polegadas, e uma altura em pontos que deixa o mapa respirando num deles
 * cobre o mapa inteiro no outro.
 *
 * - `recolhida` (0,28) é a menor faixa em que ainda cabem a alça, o cabeçalho
 *   e a primeira tarefa, que é a que o agente precisa ver sem tocar em nada.
 *   Abaixo disso a folha vira uma gaveta decorativa.
 * - `meia` (0,55) é o equilíbrio: metade do roteiro e metade do mapa.
 * - `cheia` (0,92) NUNCA é 1, e essa é a decisão mais deliberada das três. A
 *   faixa de mapa que sobra em cima é o que diz que aquilo continua sendo uma
 *   folha sobre um mapa, e não uma tela nova para a qual o aplicativo navegou.
 *   Com 1, o agente perde a referência de onde está e procura o botão de voltar
 *   que não existe.
 */
export const FRACAO_DA_POSICAO: Record<PosicaoDaFolha, number> = {
  recolhida: 0.28,
  meia: 0.55,
  cheia: 0.92,
};

/** Como cada posição é DITA, e não só desenhada. Ver a nota de leitor de tela. */
export const NOME_DA_POSICAO: Record<PosicaoDaFolha, string> = {
  recolhida: "recolhida",
  meia: "meia altura",
  cheia: "expandida",
};

/**
 * Quantos pontos o dedo precisa andar antes de a folha assumir o gesto.
 *
 * Existe para a folha não engolir os toques do que está DENTRO dela. O agente
 * toca num cartão de tarefa e o dedo dele escorrega dois ou três pontos no
 * caminho, porque ele está em pé num barranco; se a folha assumisse o gesto
 * nesse instante, o cartão nunca abriria e o aplicativo pareceria quebrado.
 * Acima destes 8 pontos já não é mais toque, é arraste, e aí a folha tem razão
 * de tomar o gesto do que estiver embaixo, a lista inclusive.
 */
export const LIMIAR_DE_ARRASTE = 8;

/**
 * A partir de que velocidade o gesto é ARREMESSO e não arraste.
 *
 * Meio ponto por milissegundo, ou seja, 500 pontos por segundo. Abaixo disso
 * quem decide é a distância (a folha vai para a posição mais perto de onde o
 * dedo soltou); acima, quem decide é a direção, mesmo que o dedo tenha andado
 * pouco. Sem este caminho, o gesto rápido e curto (que é o gesto de quem está
 * andando com o aparelho na mão) não faria nada, e a folha pareceria travada.
 */
export const VELOCIDADE_DE_ARREMESSO = 0.5;

/** Todas as posições, na ordem em que a folha cresce. */
export const TODAS_AS_POSICOES: readonly PosicaoDaFolha[] = ["recolhida", "meia", "cheia"];

/**
 * As posições que esta folha oferece, ordenadas da menor para a maior.
 *
 * A ordem sai da FRAÇÃO e não da ordem em que quem chama escreveu a lista: uma
 * tela que passasse `["cheia", "meia"]` receberia, sem isto, um "arrastar para
 * cima" que encolhe a folha.
 */
export function posicoesOrdenadas(posicoes: readonly PosicaoDaFolha[]): PosicaoDaFolha[] {
  return [...new Set(posicoes)].sort((a, b) => FRACAO_DA_POSICAO[a] - FRACAO_DA_POSICAO[b]);
}

/**
 * A folha deve assumir este gesto, tirando-o de quem estiver embaixo?
 *
 * Função pura, e exportada, porque ela é a decisão mais delicada da peça: é
 * ela que separa "arrastei a folha" de "rolei a lista" de "toquei num cartão".
 * Errar aqui não produz um defeito visível, produz um aplicativo que às vezes
 * não obedece, que é o pior tipo.
 *
 * As quatro recusas, na ordem em que são baratas de responder:
 *
 * 1. **Andou pouco:** ainda pode virar um toque. Ver `LIMIAR_DE_ARRASTE`.
 * 2. **Horizontal dominou:** gesto horizontal é proibido nesta peça, e recusar
 *    é o que devolve o gesto para o mapa.
 * 3. **Descendo com a lista fora do topo:** quem tem direito ao gesto é a
 *    lista, que precisa voltar ao topo antes de a folha começar a descer. É
 *    esta linha que faz a rolagem e o arraste conviverem sem um cancelar o
 *    outro no meio.
 * 4. **Já está no fim daquele lado:** descer estando na menor posição, ou subir
 *    estando na maior, não tem para onde ir. Assumir o gesto ali só serviria
 *    para tirá-lo da lista sem entregar nada em troca.
 */
export function deveOArrasteComecar({
  dx, dy, posicao, listaNoTopo, posicoes,
}: {
  dx: number;
  dy: number;
  posicao: PosicaoDaFolha;
  listaNoTopo: boolean;
  posicoes: readonly PosicaoDaFolha[];
}): boolean {
  if (Math.abs(dy) < LIMIAR_DE_ARRASTE) return false;
  if (Math.abs(dx) > Math.abs(dy)) return false;

  const ordem = posicoesOrdenadas(posicoes);
  if (ordem.length === 0) return false;

  /* Dedo descendo encolhe a folha. */
  if (dy > 0) return listaNoTopo && posicao !== ordem[0];
  return posicao !== ordem[ordem.length - 1];
}

/**
 * Onde a folha para quando o dedo sai da tela.
 *
 * Pura, e separada do componente, porque é aritmética e merece ser provada como
 * aritmética. Duas regras, nesta ordem:
 *
 * 1. **Arremesso manda na distância.** Passou de `VELOCIDADE_DE_ARREMESSO`, a
 *    folha anda UMA posição no sentido do gesto, mesmo que o dedo tenha andado
 *    dez pontos.
 * 2. **Senão, vale onde o dedo soltou.** A folha vai para a posição cuja altura
 *    está mais perto da altura em que ela ficou. Isto já embute a histerese que
 *    um limiar escrito à mão tentaria criar: para mudar de posição é preciso
 *    passar de metade do caminho, e não existe segundo número para alguém
 *    escolher por gosto.
 */
export function posicaoAoSoltar({
  posicao, deslocamento, velocidade, posicoes, altura,
}: {
  posicao: PosicaoDaFolha;
  /** Quanto o dedo andou desde que pegou a folha. Positivo é para baixo. */
  deslocamento: number;
  /** Pontos por milissegundo. Positiva é para baixo. */
  velocidade: number;
  posicoes: readonly PosicaoDaFolha[];
  /** A altura disponível na tela, que é a base das frações. */
  altura: number;
}): PosicaoDaFolha {
  const ordem = posicoesOrdenadas(posicoes);
  const indice = ordem.indexOf(posicao);
  if (indice < 0) return posicao;

  /*
    Sem altura medida não há onde comparar, e chutar aqui moveria a folha por
    conta própria no primeiro quadro depois da montagem.
  */
  if (altura <= 0) return posicao;

  if (Math.abs(velocidade) >= VELOCIDADE_DE_ARREMESSO) {
    const passo = velocidade > 0 ? -1 : 1;
    const destino = Math.min(Math.max(indice + passo, 0), ordem.length - 1);
    return ordem[destino] ?? posicao;
  }

  const alturaSolta = altura * FRACAO_DA_POSICAO[posicao] - deslocamento;
  const distancia = (p: PosicaoDaFolha) => Math.abs(altura * FRACAO_DA_POSICAO[p] - alturaSolta);
  return ordem.reduce((melhor, p) => (distancia(p) < distancia(melhor) ? p : melhor), posicao);
}

type Props = {
  /**
   * A posição atual. A folha é CONTROLADA pela tela, e não dona do próprio
   * estado, porque quem está atrás dela precisa saber quanto do mapa está
   * coberto para escolher onde centralizar o pino. Duas fontes de verdade aqui
   * produziriam um mapa que centraliza atrás da folha.
   */
  posicao: PosicaoDaFolha;
  /**
   * Avisado quando o gesto (ou o leitor de tela) escolheu outra posição.
   *
   * A folha JÁ se moveu quando isto é chamado: ela não espera a tela responder,
   * senão o dedo soltaria e nada aconteceria até o próximo quadro de
   * renderização. Se a tela não refletir a mudança, a folha continua coerente
   * consigo mesma e o próximo arraste parte de onde ela está de verdade.
   */
  aoMudarPosicao: (nova: PosicaoDaFolha) => void;
  /** Como o leitor de tela anuncia a folha. Ex.: "Tarefas de hoje". */
  rotulo: string;
  /** Quais posições esta folha oferece. O cartão de um pino costuma usar duas. */
  posicoes?: readonly PosicaoDaFolha[];
  /** Fica colado no topo, sempre visível, e NÃO rola. */
  cabecalho?: ReactNode;
  /** O conteúdo que rola quando é maior que a folha. */
  children: ReactNode;
  /** A ação primária. Ancorada no rodapé da TELA em qualquer posição. */
  rodape?: ReactNode;
  testID?: string;
};

export function FolhaArrastavel({
  posicao, aoMudarPosicao, rotulo, posicoes = TODAS_AS_POSICOES,
  cabecalho, children, rodape, testID = "folha",
}: Props) {
  const tema = useTema();
  const reduzir = useReducaoDeMovimento();
  const ordem = useMemo(() => posicoesOrdenadas(posicoes), [posicoes]);

  const [altura, setAltura] = useState(0);
  const [alturaDoRodape, setAlturaDoRodape] = useState(0);
  /*
    A posição VISÍVEL, que é a que o leitor de tela anuncia.

    Ela existe além da propriedade porque o gesto move a folha antes de a tela
    responder. Sem ela, quem navega por voz ouviria "meia altura" numa folha
    que o dedo acabou de expandir, e ouvir o estado errado é pior que não ouvir
    estado nenhum. Só muda quando o dedo SOLTA: nada aqui re-renderiza por
    quadro de arraste.
  */
  const [posicaoVisivel, setPosicaoVisivel] = useState(posicao);

  const maior = ordem[ordem.length - 1] ?? "cheia";
  const alturaCheia = altura * FRACAO_DA_POSICAO[maior];

  const deslocamentoDe = useCallback(
    (p: PosicaoDaFolha) => alturaCheia - altura * FRACAO_DA_POSICAO[p],
    [alturaCheia, altura],
  );

  /*
    UM valor animado só, como no `Dialogo`, e aqui ele carrega duas coisas: a
    folha desliza por `translateY` e o rodapé volta pelo NEGATIVO do mesmo
    valor. Sendo o mesmo nó, os dois chegam no mesmo quadro por construção, e
    não por sorte de agendamento.
  */
  const deslocamento = useRef(new Animated.Value(0)).current;
  const contraDeslocamento = useRef(Animated.multiply(deslocamento, -1)).current;

  /*
    O que o gesto precisa saber, em REFERÊNCIA e não em estado.

    Duas razões, e as duas já custaram defeito neste aplicativo:

    1. **Estado re-renderiza, e arrastar é a interação mais sensível do produto
       a isso:** ela acontece a 60 quadros por segundo com o dedo na tela.
       Guardar a posição do dedo em `useState` obrigaria uma renderização da
       árvore inteira da folha (lista de tarefas dentro) a cada evento de
       movimento. Aqui o quadro de arraste só escreve num `Animated.Value` e
       numa referência: zero renderização até o dedo soltar.
    2. **`PanResponder.create` dentro de `useRef` CONGELA a closure na primeira
       renderização**, exatamente como está escrito em `Assinatura.tsx`. Um
       `posicao` capturado ali ficaria valendo para sempre, e a folha passaria a
       decidir o arraste com a posição de quando a tela montou.
  */
  const estado = useRef({ ordem, altura, aoMudarPosicao, reduzir });
  estado.current = { ordem, altura, aoMudarPosicao, reduzir };

  /** Onde a folha está AGORA, para o próximo arraste partir daqui. */
  const posicaoDesenhada = useRef(posicao);
  const deslocamentoAtual = useRef(0);
  const inicioDoArraste = useRef(0);
  /** A rolagem de dentro está no topo? Referência, porque `onScroll` é por quadro. */
  const listaNoTopo = useRef(true);
  /** Já houve uma medida? A primeira posiciona a folha com uma entrada própria. */
  const jaEntrou = useRef(false);

  const limitar = useCallback(
    (valor: number) => {
      const chao = deslocamentoDe(ordem[0] ?? maior);
      return Math.min(Math.max(valor, 0), chao);
    },
    [deslocamentoDe, ordem, maior],
  );

  /**
   * Leva a folha até uma posição, animando ou não.
   *
   * Um lugar só, e não um trecho na soltura do dedo mais outro no efeito que
   * segue a propriedade: duas cópias divergem, e a segunda é a que não recebe
   * a regra nova. É o mesmo argumento escrito em `regua.ts`.
   */
  const irPara = useCallback(
    (destino: PosicaoDaFolha, animar: boolean) => {
      const alvo = deslocamentoDe(destino);
      posicaoDesenhada.current = destino;
      deslocamentoAtual.current = alvo;
      setPosicaoVisivel(destino);

      if (!animar || estado.current.reduzir) {
        /*
          Quem pediu para reduzir movimento não perde a folha: perde o deslize.
          O conteúdo é o mesmo e ele chega inteiro de uma vez.
        */
        deslocamento.setValue(alvo);
        return;
      }
      Animated.timing(deslocamento, {
        toValue: alvo,
        duration: movimento.mudancaDeEstado,
        easing: Easing.bezier(...easing.entrada),
        /*
          `translateY` é o que a camada nativa anima sozinha. Sem isto, cada
          quadro do acomodamento atravessa a ponte e a folha chega aos
          solavancos no aparelho de entrada que a prefeitura comprou.
        */
        useNativeDriver: true,
      }).start();
    },
    [deslocamento, deslocamentoDe],
  );

  const mudarPara = useCallback(
    (destino: PosicaoDaFolha) => {
      const veioDe = posicaoDesenhada.current;
      irPara(destino, true);
      if (destino !== veioDe) estado.current.aoMudarPosicao(destino);
    },
    [irPara],
  );

  /* A tela mandou outra posição: a folha segue. */
  useEffect(() => {
    if (altura <= 0) return;
    if (!jaEntrou.current) {
      jaEntrou.current = true;
      /*
        A ENTRADA. A folha nasce fora da tela, embaixo, e sobe até a posição
        pedida. Sem isto ela nasceria na posição cheia (o valor animado começa
        em zero) e DESCERIA até a recolhida no primeiro quadro medido, que é um
        movimento que ninguém pediu e que diz o contrário do que acontece: a
        folha está chegando, não saindo.
      */
      deslocamento.setValue(deslocamentoDe(ordem[0] ?? maior));
      irPara(posicao, true);
      return;
    }
    if (posicao === posicaoDesenhada.current) return;
    irPara(posicao, true);
  }, [posicao, altura, irPara, deslocamento, deslocamentoDe, ordem, maior]);

  const gesto = useRef(
    PanResponder.create({
      /*
        Nunca no toque, só no movimento. Assumir o gesto na descida do dedo
        engoliria todo botão e todo cartão que mora dentro da folha, que é o
        risco que `Assinatura.tsx` documenta ao usar a fase de captura num
        quadro que não tem filho tocável. Aqui tem, e muitos.
      */
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      /*
        A fase de CAPTURA é obrigatória para o arraste conviver com a rolagem: a
        lista de dentro reivindica o movimento vertical antes de o pai sequer
        ser consultado na fase normal. Capturando, a folha decide primeiro, e
        `deveOArrasteComecar` é quem garante que ela só decida quando tem
        direito. Sem captura, puxar a lista para baixo no topo nunca recolheria
        a folha.
      */
      onMoveShouldSetPanResponderCapture: (_evento, g) => deveOArrasteComecar({
        dx: g.dx,
        dy: g.dy,
        posicao: posicaoDesenhada.current,
        listaNoTopo: listaNoTopo.current,
        posicoes: estado.current.ordem,
      }),
      onMoveShouldSetPanResponder: (_evento, g) => deveOArrasteComecar({
        dx: g.dx,
        dy: g.dy,
        posicao: posicaoDesenhada.current,
        listaNoTopo: listaNoTopo.current,
        posicoes: estado.current.ordem,
      }),

      onPanResponderGrant: () => {
        inicioDoArraste.current = deslocamentoAtual.current;
      },

      onPanResponderMove: (_evento, g) => {
        /*
          O quadro de arraste faz UMA coisa: escreve no valor animado. Sem
          `setState`, sem cálculo de lista, sem tocar no tema. É isto que
          mantém o arraste em 60 quadros no aparelho fraco, e não o driver
          nativo, que aqui não pode ajudar: o dedo chega pelo JavaScript de
          qualquer jeito. O que o driver nativo resolve é o acomodamento depois
          da soltura, que roda sozinho.
        */
        deslocamento.setValue(limitar(inicioDoArraste.current + g.dy));
      },

      onPanResponderRelease: (_evento, g) => {
        mudarPara(posicaoAoSoltar({
          posicao: posicaoDesenhada.current,
          deslocamento: g.dy,
          velocidade: g.vy,
          posicoes: estado.current.ordem,
          altura: estado.current.altura,
        }));
      },

      /*
        O sistema arranca o gesto quando entra ligação ou quando alguém puxa a
        central de notificações. Sem tratar, a folha ficaria parada no meio do
        caminho, numa posição que não é nenhuma das três, e o próximo arraste
        partiria de um lugar que o componente acha que não existe.
      */
      onPanResponderTerminate: (_evento, g) => {
        mudarPara(posicaoAoSoltar({
          posicao: posicaoDesenhada.current,
          deslocamento: g.dy,
          velocidade: g.vy,
          posicoes: estado.current.ordem,
          altura: estado.current.altura,
        }));
      },

      /* Depois de ganhar o arraste, não devolve no meio dele. */
      onPanResponderTerminationRequest: () => false,
      /* Só age no Android, e é justamente o Android que rouba o gesto. */
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  const vizinha = (passo: number): PosicaoDaFolha => {
    const atual = ordem.indexOf(posicaoDesenhada.current);
    const destino = Math.min(Math.max(atual + passo, 0), ordem.length - 1);
    return ordem[destino] ?? posicaoDesenhada.current;
  };

  const recolhida = posicaoVisivel === ordem[0];

  return (
    <View
      testID={`${testID}-area`}
      style={StyleSheet.absoluteFill}
      /*
        A linha que faz o mapa continuar sendo um mapa. `box-none` deixa o toque
        atravessar este embrulho onde não há folha; sem ela, um retângulo
        invisível do tamanho da tela ficaria entre o dedo e o mapa, e arrastar o
        mapa deixaria de funcionar sem nada na tela explicando por quê.
      */
      pointerEvents="box-none"
      onLayout={(evento: LayoutChangeEvent) => setAltura(evento.nativeEvent.layout.height)}
    >
      {altura > 0 && (
        <Animated.View
          testID={testID}
          /*
            O papel, e não o texto: o conteúdo se apresenta sozinho. Sem papel,
            o leitor de tela trata a folha como um agrupamento anônimo e o
            agente não sabe que aquilo é uma superfície que se move.
          */
          accessibilityRole="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: alturaCheia,
            borderTopLeftRadius: raio.cartao,
            borderTopRightRadius: raio.cartao,
            /*
              `flutuante`, e não `folha`, e a escolha está declarada. O nível
              `folha` do design system foi desenhado para uma folha que PAIRA,
              com a sombra descendo 12 pontos; esta aqui é colada no rodapé,
              onde essa sombra cai para fora da tela. Espalhar o nível pela
              metade, ou virar a sombra aqui dentro, seria decidir a escala de
              elevação dentro de um componente, que é o que `tokens.ts` proíbe.
              O nível certo (folha colada, com a sombra subindo) está pedido no
              relatório desta frente.
            */
            /*
              `folha`, e não `flutuante`.

              Esta peça nasceu usando `flutuante` porque, naquele momento, o
              nível `folha` tinha a sombra descendo 12 pontos: ele fora
              desenhado para folha que PAIRA, e esta é colada no rodapé, onde
              aquela sombra cairia para fora da tela.

              A fundação da 2.0 corrigiu o nível no mesmo turno, depois de
              concluir que nenhuma folha deste aplicativo paira nem vai pairar:
              a sombra agora SOBE. O nível deixou de estar sem uso e passou a
              estar certo, e esta é a peça para a qual ele existe.
            */
            ...elevacao(tema).folha,
            transform: [{ translateY: deslocamento }],
          }}
          {...gesto.panHandlers}
        >
          {/*
            O recorte mora aqui, e não na peça de fora, porque `overflow:
            hidden` no mesmo elemento que carrega a sombra apaga a sombra no
            iOS.
          */}
          <View
            style={{
              flex: 1,
              borderTopLeftRadius: raio.cartao,
              borderTopRightRadius: raio.cartao,
              overflow: "hidden",
            }}
          >
            <Pressable
              testID={`${testID}-alca`}
              /*
                `adjustable` é o papel que existe para exatamente isto: um
                controle com uma faixa de valores que se percorre. Com ele, quem
                usa VoiceOver ou TalkBack desliza para cima e para baixo em cima
                da alça e a folha muda de posição, que é o equivalente honesto
                do arraste. Sem ele, a folha seria uma peça que só quem enxerga
                consegue mover.
              */
              accessibilityRole="adjustable"
              accessibilityLabel={rotulo}
              /*
                O estado é DITO, e não só desenhado. A posição da folha na tela
                é a única pista que um vidente tem, e ela não existe para quem
                ouve.
              */
              accessibilityValue={{ text: NOME_DA_POSICAO[posicaoVisivel] }}
              accessibilityHint="Deslize para cima ou para baixo para mudar o tamanho da folha"
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(evento) => {
                const acao = evento.nativeEvent.actionName;
                if (acao === "increment") mudarPara(vizinha(1));
                if (acao === "decrement") mudarPara(vizinha(-1));
              }}
              /*
                O toque na alça expande um degrau, e na maior posição volta para
                a menor. É o atalho de quem está com uma mão só e não quer
                arrastar: um toque no lugar mais óbvio da folha sempre faz
                alguma coisa, e o que ele faz é sempre o próximo passo do mesmo
                caminho que o dedo faria.
              */
              onPress={() => mudarPara(
                posicaoDesenhada.current === ordem[ordem.length - 1]
                  ? (ordem[0] ?? posicaoDesenhada.current)
                  : vizinha(1),
              )}
              style={{
                minHeight: toque,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                testID={`${testID}-barra`}
                style={{
                  width: espaco.e6,
                  height: espaco.e1,
                  borderRadius: raio.pilula,
                  backgroundColor: tema.bordaControle,
                }}
              />
            </Pressable>

            {cabecalho && (
              <View
                testID={`${testID}-cabecalho`}
                style={{ paddingHorizontal: espaco.e4, paddingBottom: espaco.e3 }}
              >
                {cabecalho}
              </View>
            )}

            {/*
              O corpo some do leitor de tela quando a folha está recolhida, e
              isso não é economia: é o que impede a folha de MENTIR. Recolhida,
              o agente vê a alça, o cabeçalho e mais nada; se o leitor
              continuasse lendo as doze tarefas que estão na árvore e fora da
              tela, quem navega por voz ouviria uma lista que quem enxerga não
              tem, e perderia o mapa de vista sem saber que ele está ali. Para
              alcançar a lista, a alça é `adjustable` e expande.
            */}
            <View
              testID={`${testID}-corpo`}
              style={{ flex: 1 }}
              accessibilityElementsHidden={recolhida}
              importantForAccessibility={recolhida ? "no-hide-descendants" : "auto"}
            >
              <ScrollView
                testID={`${testID}-rolagem`}
                /*
                  O que acontece quando o conteúdo é maior que a folha: ele
                  rola, aqui dentro, e nunca empurra a alça nem o rodapé para
                  fora. O recuo no fim reserva a altura MEDIDA do rodapé, senão
                  o último cartão da lista nasce debaixo da ação primária e o
                  agente nunca chega nele.
                */
                contentContainerStyle={{
                  paddingHorizontal: espaco.e4,
                  paddingBottom: alturaDoRodape + espaco.e4,
                  gap: espaco.e3,
                }}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={(evento: NativeSyntheticEvent<NativeScrollEvent>) => {
                  /*
                    Referência, e não estado: isto dispara a cada quadro de
                    rolagem, e um `setState` aqui re-renderizaria a lista
                    inteira sessenta vezes por segundo enquanto o dedo desliza.
                  */
                  listaNoTopo.current = evento.nativeEvent.contentOffset.y <= 0;
                }}
              >
                {children}
              </ScrollView>
            </View>

            {rodape && (
              <Animated.View
                testID={`${testID}-rodape`}
                onLayout={(evento: LayoutChangeEvent) => setAlturaDoRodape(
                  evento.nativeEvent.layout.height,
                )}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: espaco.e4,
                  paddingTop: espaco.e3,
                  /*
                    Maior que o de cima, pela mesma razão do `Dialogo`: a barra
                    de gestos do aparelho come o rodapé e engoliria o alvo da
                    ação primária.
                  */
                  paddingBottom: espaco.e7,
                  ...elevacao(tema).flutuante,
                  /*
                    O contra-deslocamento, que é o que prende a ação primária no
                    rodapé da TELA enquanto a folha desliza por trás dela. Mesmo
                    nó animado da folha, com o sinal trocado: os dois não têm
                    como escorregar um do outro.
                  */
                  transform: [{ translateY: contraDeslocamento }],
                }}
              >
                {rodape}
              </Animated.View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
