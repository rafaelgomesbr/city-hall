import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { Easing, View, type ColorValue } from "react-native";
import { Redirect, Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FilaDeSincronizacao } from "@dc360/campo";
import { iniciarSincronizacaoContinua, obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import { enderecoDaApi } from "../../dados/api";
import { useTema } from "../../ui/componentes";
import { BarraDeAbas } from "../../ui/BarraDeAbas";
import { FaixaDeSincronizacaoLigada } from "../../ui/FaixaDeSincronizacao";
import { GuardaDeSaidaDaVistoria } from "../../ui/GuardaDeSaidaDaVistoria";
import { Sino } from "../../ui/Sino";
import { IconeEnvio, IconeMapa, IconeTarefas } from "../../ui/icones";
import { familiaDoTexto } from "../../ui/tipografia";
import { useFontes } from "../../ui/fontes";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";
import { easing, espaco, icone, movimento, peso, toque } from "../../ui/tokens";

/**
 * A área autenticada: a faixa de conectividade no topo, o navegador de abas
 * no meio, e o menu de vidro pairando embaixo.
 *
 * ## A ABA QUE FICAVA ESCURA, e a regra que este arquivo passou a obedecer
 *
 * O dono: "ao trocar de aba fica tudo escuro, nada acontece, nem spinner, só
 * volta se eu sair e entrar da aba". Envio e Perfil sumiam (sem título e sem
 * conteúdo); o Mapa funcionava.
 *
 * A causa, levantada com evidência: este layout guardava ESTADO que muda
 * DURANTE a transição de 120 ms. Ao montar `fila.tsx`, `obterFila().assinar()`
 * avisa os ouvintes na hora (`packages/campo/src/fila.ts`), e o layout
 * escutava (`setResumo`). Ao montar `perfil.tsx`, a sincronização dos avisos
 * avisa os ouvintes do sino, e o layout escutava (`setSino`). Cada redesenho
 * deste componente é um redesenho do PAI do navegador, e o navegador refaz os
 * `descriptors` a cada renderização (`useDescriptors` não os memoiza), então
 * o efeito que chama `Animated.parallel(...).start()` em `BottomTabView`
 * roda de novo: a animação em voo é parada, os nós de interpolação da cena
 * são recriados, e o React comita `opacity: 0` / `translateX: 50` como props
 * da cena, que é o valor que o JavaScript ainda conhecia (com `useNativeDriver`
 * o valor animado vive na camada nativa e o lado JS nunca é atualizado). O
 * `Background` com opacidade zero embrulha cabeçalho E conteúdo, por isso
 * somem os dois, e o que aparece por trás é o `View` de fora com `tema.fundo`.
 * O Mapa não acordava o layout ao montar, por isso funcionava; e na segunda
 * visita a tela já estava montada, os efeitos de montagem não rodavam, e a
 * transição corria inteira.
 *
 * A REGRA, estrutural: **este layout não guarda nenhum estado que mude com o
 * uso.** Resumo da fila, contagem do sino, sinal: tudo é lido DENTRO de quem
 * desenha (`ui/BarraDeAbas.tsx`, `FaixaDeSincronizacaoLigada`), que são
 * filhos ou irmãos do navegador, nunca o pai dele. O laço da fila, que precisa
 * do sinal, mora num componente que não renderiza nada (`LacoDaFila`). As
 * `screenOptions` são memoizadas (com o `Easing.bezier` calculado uma vez) e o
 * `tabBar` é uma função de módulo, para que mesmo um redesenho raro deste
 * layout (troca de tema, rotação) entregue ao navegador o mesmo objeto.
 *
 * A prova está em `src/__tests__/a-aba-nao-fica-escura.test.tsx` (o navegador
 * de verdade, com a barra de verdade, acordado pela fila no meio da transição)
 * e em `menu-de-vidro-e-transicoes.test.tsx` (o navegador não é redesenhado
 * quando a fila ou o sino avisam).
 */

/**
 * O ícone de uma aba, no tamanho que a barra reserva para os pictogramas.
 *
 * `icone.acao` (24) e não `icone.rotulo` (20): a conta de altura de
 * `BarraDeAbas` reserva 24 para o pictograma, e o rosto do Perfil é maior que
 * isso de propósito (ver `DIAMETRO_DO_AVATAR` lá).
 */
function IconeDaAba({ Icone, cor }: {
  /* `ColorValue` e não `string`: é o que o `tabBarIcon` entrega, e é o mesmo
     tipo que os ícones já aceitam. */
  Icone: (p: { cor: ColorValue; tamanho?: number }) => React.JSX.Element;
  cor: ColorValue;
}) {
  return <Icone cor={cor} tamanho={icone.acao} />;
}

type OpcoesDaAba = NonNullable<ComponentProps<typeof Tabs.Screen>["options"]>;

/**
 * O QUE cada aba mostra: a palavra e o ícone. Constantes de módulo, porque
 * nada aqui muda com o uso, e um objeto novo por renderização seria um
 * descritor novo por renderização.
 *
 * Os números dos crachás e as frases faladas NÃO moram aqui: quem os lê é a
 * barra, pelo motivo do cabeçalho. E o Perfil não declara ícone: o rosto é a
 * própria barra que desenha, porque ele é o item em destaque dela.
 */
const OPCOES_TAREFAS: OpcoesDaAba = {
  title: "Minhas tarefas",
  tabBarLabel: "Tarefas",
  tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeTarefas} cor={color} />,
};

const OPCOES_MAPA: OpcoesDaAba = {
  title: "Mapa",
  tabBarLabel: "Mapa",
  tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeMapa} cor={color} />,
};

const OPCOES_FILA: OpcoesDaAba = {
  title: "Fila de envio",
  tabBarLabel: "Envio",
  tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeEnvio} cor={color} />,
};

const OPCOES_PERFIL: OpcoesDaAba = {
  title: "Meu perfil",
  tabBarLabel: "Perfil",
};

/*
  OS AVISOS, fora da barra, como a vistoria: `href: null` tira a rota do menu
  sem tirá-la das rotas, e quem chega nela é o sino do cabeçalho. Sem sino no
  próprio cabeçalho dela: um sino que abre a tela em que já se está é um
  botão que não faz nada.

  Declarada ANTES da vistoria, e a ordem é a razão escrita logo abaixo: a
  vistoria continua sendo a última rota, para sempre entrar pela direita.
*/
const OPCOES_AVISOS: OpcoesDaAba = { title: "Avisos", href: null, headerRight: () => null };

/*
  FORA DA BARRA, e ÚLTIMA. As duas coisas são decisões, e a segunda é a que
  some da vista mais fácil.

  `href: null` a tira da barra sem tirá-la das rotas: ela continua sendo
  empurrada pela lista de tarefas, com parâmetro. Ela não é destino, é
  tarefa, e tarefa não vira aba.

  ÚLTIMA porque a transição entre telas é `shift`, e o `shift` tira a
  DIREÇÃO da deslizada da POSIÇÃO da rota neste estado. Declarada por
  último, a vistoria sempre entra pela direita, que é como o olho lê
  "avancei para dentro do trabalho"; declarada no meio, ela entraria pela
  esquerda quando aberta a partir do Perfil, e o mesmo toque produziria
  movimentos opostos dependendo de onde o agente estava.
*/
const OPCOES_VISTORIA: OpcoesDaAba = { title: "Vistoria", href: null };

/**
 * A barra, como função de MÓDULO e não como seta dentro do JSX.
 *
 * Uma seta nova a cada renderização é um `tabBar` novo a cada renderização, e
 * o navegador trata isso como mudança. Aqui a função é uma só pela vida do
 * processo, então mesmo o redesenho raro deste layout entrega ao navegador a
 * mesma referência.
 */
function desenharBarra(props: Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]) {
  return <BarraDeAbas {...props} />;
}

/**
 * O laço da fila, num componente que NÃO renderiza nada.
 *
 * Ele precisa do sinal (para não tentar enviar sem rede e para tentar na hora
 * em que a rede volta), e `useSinal()` muda de valor sozinho: na primeira
 * leitura do aparelho e a cada troca de rede. Se esse gancho morasse no
 * layout, cada troca de rede seria um redesenho do pai do navegador, e uma
 * troca no meio da transição de aba produziria exatamente a aba escura do
 * cabeçalho. Aqui ele redesenha um `null`.
 */
function LacoDaFila() {
  const { identidade, obterToken, lerIdentidade } = useSessao();
  const sinal = useSinal();
  const filaRef = useRef<FilaDeSincronizacao | null>(null);
  const sinalRef = useRef(sinal.temSinal);
  sinalRef.current = sinal.temSinal;

  useEffect(() => {
    if (!identidade) return;
    let vivo = true;
    let parar: (() => void) | undefined;

    void (async () => {
      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      if (!vivo) return;
      filaRef.current = fila;
      /*
        O laço lê o sinal por referência, e não por valor capturado. Sem isso
        ele nasceria acreditando no estado do primeiro quadro e continuaria
        acreditando nisso pelo resto do dia, tentando enviar sem sinal ou
        parado com sinal.
      */
      parar = iniciarSincronizacaoContinua(fila, () => sinalRef.current);
    })();

    return () => {
      vivo = false;
      parar?.();
    };
  }, [identidade, obterToken, lerIdentidade]);

  // Sinal voltou: tenta agora, sem esperar a próxima janela do laço. É o
  // momento em que o agente está olhando para a tela esperando ver acontecer.
  useEffect(() => {
    if (sinal.temSinal) void filaRef.current?.drenar().catch(() => undefined);
  }, [sinal.temSinal]);

  return null;
}

/** Para onde a faixa leva ao toque: a fila, que é o que ela resume. */
function irParaAFila(): void {
  router.push("/(agente)/fila");
}

export default function LayoutDoAgente() {
  const { identidade } = useSessao();
  const tema = useTema();
  const margens = useSafeAreaInsets();
  const fontes = useFontes();
  const reduzirMovimento = useReducaoDeMovimento();

  /*
    As opções do navegador, calculadas uma vez por (tema, fonte, redução de
    movimento) e mais nada. Tudo o que entra aqui é estável durante o uso:
    tema muda quando o agente escolhe, fonte quando termina de carregar,
    redução de movimento quando a chave do sistema muda.
  */
  const screenOptions = useMemo<NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>>(() => {
    /*
      A PASSAGEM DE UMA TELA PARA OUTRA.

      `shift` e não `fade`: as telas deslizam 50 pontos na direção em que estão
      na barra, cruzando a opacidade. A direção é o que carrega informação, e
      ela é de graça aqui, porque o React Navigation a tira da POSIÇÃO da aba:
      sair de Tarefas para Envio vem da direita, voltar vem da esquerda. A
      vistoria é a última rota declarada neste arquivo, então ela SEMPRE entra
      pela direita, que é como o olho lê "avancei para dentro do trabalho".

      A duração é `respostaAoToque` e não `mudancaDeEstado`: isto responde ao
      dedo do agente, não é algo que mudou sozinho. Acima de uns 150 ms uma
      troca de aba começa a parecer que o toque não pegou.

      E some inteiro para quem pediu redução de movimento: `animation: "none"`
      desliga o interpolador, e sem interpolador nenhuma propriedade é animada.

      SEM `react-native-reanimated`, e a decisão é deliberada. Ele está
      instalado e inerte, só como dependência de par do `expo-router` e do
      `react-native-screens`. Quem anima a troca de aba é o próprio
      `BottomTabView`, com `Animated` do React Native e `useNativeDriver`
      ligado, então o movimento já roda na camada nativa. O que custaria é o
      plugin de Babel que o reanimated exige, e `babel.config.js` é mínimo de
      propósito. Ligar o reanimated é decisão para quando existir gesto
      contínuo; não existe nenhum aqui.

      O `Easing.bezier` é calculado AQUI DENTRO, uma vez por memoização, e não
      a cada renderização: uma função nova de easing a cada quadro era parte
      do que fazia o navegador enxergar opções novas.
    */
    const transicaoEntreTelas = reduzirMovimento
      ? { animation: "none" as const }
      : {
        animation: "shift" as const,
        transitionSpec: {
          animation: "timing" as const,
          config: {
            duration: movimento.respostaAoToque,
            easing: Easing.bezier(...easing.entrada),
          },
        },
      };

    return {
      headerStyle: {
        backgroundColor: tema.superficie,
        /*
          O CABEÇALHO CRESCE PARA CABER O SINO, e a decisão é de alvo de
          toque. O cabeçalho padrão do iOS tem 44 pontos de conteúdo, e o sino
          é um tocável de `toque` (52): os 4 pontos que sobram em cima e
          embaixo ficariam FORA da caixa do cabeçalho, e toque fora da caixa
          do pai não é entregue em nenhuma das duas plataformas. O agente com
          luva pegaria a borda do sino e nada aconteceria, que é exatamente o
          tipo de defeito que a régua de 52 existe para impedir.

          `minHeight` e não `height`: o cabeçalho continua podendo crescer, e
          é o piso que sobe. Mais `espaco.e2` de respiro para o sino não
          encostar nas bordas.
        */
        minHeight: toque + espaco.e2,
      },
      headerTintColor: tema.texto,
      /*
        A ÁREA SEGURA É PAGA UMA VEZ SÓ, e quem paga é o `View` de fora.

        O cabeçalho do React Navigation reserva a área segura por conta
        própria quando não há cabeçalho pai (`headerStatusBarHeight =
        isParentHeaderShown ? 0 : insets.top`), e a pilha da raiz desliga o
        cabeçalho dela para `(agente)`. Este layout JÁ aplica `paddingTop:
        margens.top` lá em cima, e precisa aplicar: a faixa de sincronização
        mora acima do cabeçalho. Sem zerar aqui, eram duas áreas seguras
        empilhadas, o "muito testudo" que o Rafa viu no aparelho.
      */
      headerStatusBarHeight: 0,
      headerTitleStyle: {
        fontFamily: familiaDoTexto({ peso: peso.negrito, fontesProntas: fontes.prontas }),
        ...(fontes.prontas ? {} : { fontWeight: peso.negrito }),
      },
      /*
        Só a cor. Nenhum recuo de baixo AQUI: a pílula paira sobre a cena, e
        quem reserva espaço para ela é cada tela rolável, com
        `useRecuoDoMenu()` no `contentContainerStyle`. Um recuo na cena
        inteira seria um vão morto medido por ninguém, que é o defeito (d) da
        barra flutuante de 28/08.
      */
      sceneStyle: { backgroundColor: tema.fundo },
      ...transicaoEntreTelas,
      /*
        O SINO, à direita, em toda tela. Ele guarda o próprio estado (lê o
        disco pelo mesmo gancho da barra) e pergunta antes de sair de vistoria
        começada pela mesma guarda que a barra usa. A tela de avisos o desliga
        no próprio cabeçalho (ver `OPCOES_AVISOS`).
      */
      headerRight: () => <Sino />,
      headerRightContainerStyle: { paddingRight: espaco.e2 },
      /*
        Nenhuma opção de desenho da barra daqui para baixo, e a ausência é
        deliberada: `tabBarStyle`, `tabBarItemStyle`,
        `tabBarActiveBackgroundColor`, `tabBarLabelStyle` e o par de
        `tintColor` são lidos pelo `BottomTabBar` PADRÃO, e só por ele. Com
        `tabBar` próprio, elas viram texto morto que faz a próxima pessoa
        ajustar o menu no arquivo errado. Quem desenha é `ui/BarraDeAbas.tsx`.
      */
    };
  }, [tema, fontes.prontas, reduzirMovimento]);

  if (!identidade) return <Redirect href="/entrar" />;

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo, paddingTop: margens.top }}>
      <LacoDaFila />
      {/*
        A faixa é o elemento mais importante do aplicativo inteiro. Ela
        responde, sem o agente precisar perguntar, as duas coisas que ele quer
        saber o tempo todo: tem sinal, e o que eu fiz já foi enviado. Ela
        assina a fila e o sinal sozinha: é irmã do navegador, não pai.
      */}
      <FaixaDeSincronizacaoLigada aoTocar={irParaAFila} />

      {/*
        QUATRO abas, e não três nem cinco. O Mapa entrou porque ele responde uma
        pergunta que a lista não responde ("o que está perto de mim agora"), e
        porque o agente com quatro tarefas no dia decide a ORDEM delas por
        distância, não por prazo. Continuam sendo destinos de peso igual, que é a
        régua para uma aba existir: a vistoria não é aba porque não é destino, é
        tarefa.

        Ícone COM palavra, sempre, e aqui o produto se afasta do Instagram de
        propósito. Lá o ícone sozinho funciona porque a pessoa abre o aplicativo
        várias vezes por dia e decorou os pictogramas. O agente abre este duas
        vezes por semana, com sol na tela e luva no dedo. A regra da casa é que
        nada se comunica só por cor; ícone sozinho falha pela mesma razão.

        E A BARRA APARECE DENTRO DA VISTORIA, com compensação: tocar em outra
        aba com vistoria começada pergunta antes (ver `BarraDeAbas`). O rascunho
        é gravado no disco a cada toque, então a pergunta é sobre ATENÇÃO, e não
        sobre perda.
      */}
      {/*
        A GUARDA fica entre o layout e o navegador: é ela que guarda "estou
        perguntando", e não este layout. Quando ela muda de estado, o `<Tabs>`
        chega a ela como o mesmo elemento de antes e o navegador não é
        redesenhado. Ver o cabeçalho de `GuardaDeSaidaDaVistoria`.
      */}
      <GuardaDeSaidaDaVistoria>
        <Tabs tabBar={desenharBarra} screenOptions={screenOptions}>
          <Tabs.Screen name="index" options={OPCOES_TAREFAS} />
          {/* O MAPA, entre as tarefas e o envio, e a posição é a ordem de uso:
              o agente abre a lista, decide por onde começar (é para isso que o
              mapa serve) e só volta ao envio no fim do dia, quando desce o
              morro. */}
          <Tabs.Screen name="mapa" options={OPCOES_MAPA} />
          <Tabs.Screen name="fila" options={OPCOES_FILA} />
          {/*
            PERFIL, e não "Equipe" mais "Conta" em duas telas. As duas
            respondiam à mesma pergunta ("quem sou eu aqui e como está o meu
            aparelho"). O crachá desta aba é o SINO, e o rosto é a própria
            barra que desenha: num aparelho de plantão, que troca de mão a cada
            turno, saber de quem é a sessão aberta é a primeira pergunta de
            quem pega o telefone.
          */}
          <Tabs.Screen name="perfil" options={OPCOES_PERFIL} />
          <Tabs.Screen name="avisos" options={OPCOES_AVISOS} />
          <Tabs.Screen name="vistoria/[id]" options={OPCOES_VISTORIA} />
        </Tabs>
      </GuardaDeSaidaDaVistoria>
    </View>
  );
}
