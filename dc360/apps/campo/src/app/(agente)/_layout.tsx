import { useEffect, useRef, useState } from "react";
import { Easing, View, type ColorValue } from "react-native";
import { Redirect, Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FilaDeSincronizacao, ResumoFila } from "@dc360/campo";
import { iniciarSincronizacaoContinua, obterFila } from "../../dados/fila";
import { assinarAvisos, avisosGuardados, type AvisosGuardados } from "../../dados/avisos";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import { enderecoDaApi } from "../../dados/api";
import { Txt, useTema } from "../../ui/componentes";
import { FaixaDeSincronizacao, decidirFaixa, type EstadoDaFaixa } from "../../ui/FaixaDeSincronizacao";
import { IconeEnvio, IconeEquipe, IconeTarefas } from "../../ui/icones";
import { familiaDoTexto } from "../../ui/tipografia";
import { useFontes } from "../../ui/fontes";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";
import { borda, easing, espaco, fonte, icone, movimento, peso, raio, toque } from "../../ui/tokens";

/**
 * A área autenticada, e a faixa de conectividade que fica no topo dela.
 *
 * A faixa é o elemento mais importante do aplicativo inteiro. Ela responde,
 * sem o agente precisar perguntar, as duas coisas que ele quer saber o tempo
 * todo: tem sinal, e o que eu fiz já foi enviado. Quando as duas respostas
 * estão à vista, ninguém precisa confiar; quando faltam, todo mundo desconfia
 * do sistema justamente na hora em que ele está funcionando.
 */

/**
 * A pílula do item ativo, e a conta que decide o tamanho dela.
 *
 * A pílula SOBREVIVEU à troca da barra flutuante pela barra padrão, e a razão
 * é a regra da casa: nada neste aplicativo se comunica só por cor. Sem ela, a
 * única diferença entre a aba aberta e as outras duas seria o violeta do traço
 * e do rótulo, porque a palavra embaixo do ícone é a mesma nos dois estados.
 * Quem não distingue violeta de cinza, ou está com sol forte na tela, ficaria
 * sem saber onde está. Um retângulo preenchido atrás do ícone é uma pista de
 * FORMA, e forma não depende de enxergar cor.
 *
 * O que mudou foi o tamanho, e ele agora sai de uma conta em vez de gosto. A
 * barra flutuante tinha altura própria (60) e podia acomodar o que quisesse;
 * a barra padrão recebe do sistema 49 pontos mais a área segura, e o item
 * dentro dela gasta 5 de recuo em cima e embaixo. Sobram 39 para o ícone e o
 * rótulo juntos. O rótulo é `fonte.legenda` (12), que ocupa cerca de 15 com a
 * entrelinha que o React Native calcula sozinho. O que sobra para a pílula são
 * 24, que é exatamente `icone.acao`, com o ícone de `icone.rotulo` (20) dentro
 * e 2 de folga de cada lado. Pílula maior que isso não some: ela EMPURRA o
 * rótulo para fora da barra, e o rótulo é obrigatório aqui.
 */
/**
 * O DESTAQUE DA ABA ABERTA, e por que ele deixou de ser só atrás do ícone.
 *
 * Até 14/09/2026 a pílula era desenhada dentro do `tabBarIcon`, então ela
 * abraçava o ícone e deixava a palavra de fora. O Rafa viu no aparelho e disse
 * a frase que descreve o defeito melhor que qualquer explicação: "o menu marca
 * apenas o ícone quando ativo, deveria pegar o ícone e o texto".
 *
 * Ele tem razão, e a razão é a mesma que obriga o rótulo a existir: ícone e
 * palavra são UMA peça, e destacar metade dela faz a outra metade parecer de
 * outro item. O desenho anterior tinha um limite escrito (a pílula não podia
 * passar de `icone.acao`, senão empurrava o rótulo para fora da barra), e esse
 * limite era consequência de a pílula morar no lugar errado.
 *
 * Agora quem pinta é `tabBarActiveBackgroundColor`, que o próprio navegador
 * aplica ao item INTEIRO (ícone, crachá e rótulo), e o canto arredondado vem
 * de `tabBarItemStyle`. Três coisas sobrevivem de graça, e cada uma delas
 * custaria código num botão próprio: o crachá numérico continua posicionado
 * pelo navegador, o rótulo de acessibilidade continua o mesmo, e a área de
 * toque continua sendo a do sistema.
 *
 * O que NÃO muda é o porquê da peça existir: ela é a SEGUNDA pista de qual aba
 * está aberta, ao lado da cor do traço, para quem não distingue violeta de
 * cinza e para quem está sob sol forte. A regra da casa é que nada se comunica
 * só por cor, e ela vale para o menu igual.
 */
const DESTAQUE_DA_ABA = {
  borderRadius: raio.pilula,
  /*
    `hidden` porque a cor de fundo é pintada pelo navegador no elemento de
    DENTRO. Sem o corte, o arredondamento do lado de fora não alcança a tinta e
    o destaque sai quadrado, que é como ele estava na primeira tentativa.
  */
  overflow: "hidden" as const,
  /*
    Folga SÓ na horizontal, e isto é cicatriz: a primeira versão tinha
    `marginVertical: espaco.e1`, e o Rafa viu no aparelho que "os ícones do
    menu ficaram achatados". A palavra saía cortada ao meio.

    A conta explica: o sistema dá 49 pontos mais a área segura, e ali dentro
    precisam caber o ícone (24) e o rótulo (12 mais entrelinha). São quase 40 de
    conteúdo em 49 de caixa, e quatro pontos em cima mais quatro embaixo comem a
    folga inteira. Na horizontal sobra espaço de sobra, e é de lá que vem o
    formato de pílula.

    Ou seja: o limite que o desenho anterior escrevia como "a pílula não passa
    de 24 de altura" não sumiu quando a pílula mudou de lugar. Ele só mudou de
    endereço, e mora aqui agora.
  */
  marginHorizontal: espaco.e2,
};

/**
 * O ícone da aba, sem peça nenhuma em volta.
 *
 * Ele ficou sem nada porque o destaque passou para o item inteiro, e duas
 * peças pintadas uma dentro da outra desenhariam uma pílula dentro de outra.
 */
function IconeDaAba({
  Icone, cor, ativo,
}: {
  /* `ColorValue` e não `string`: é o que o `tabBarIcon` entrega, e é o mesmo
     tipo que os ícones já aceitam. */
  Icone: (p: { cor: ColorValue; tamanho?: number }) => React.JSX.Element;
  cor: ColorValue;
  ativo: boolean;
}) {
  return (
    <View
      /* O identificador existe para o portão conseguir provar qual item está
         aberto sem depender da cor. */
      testID={ativo ? "icone-da-aba-ativa" : "icone-da-aba"}
    >
      <Icone cor={cor} tamanho={icone.rotulo} />
    </View>
  );
}

export default function LayoutDoAgente() {
  const { identidade, obterToken, lerIdentidade } = useSessao();
  const tema = useTema();
  const margens = useSafeAreaInsets();
  const sinal = useSinal();
  const fontes = useFontes();
  const reduzirMovimento = useReducaoDeMovimento();

  const [resumo, setResumo] = useState<ResumoFila | null>(null);
  /*
    O SINO, só o número, lido do DISCO e nunca da rede.

    Quem fala com o servidor é a tela de Perfil; aqui a barra só espelha o que
    já está guardado. É o que faz o crachá existir mesmo no morro, sem nenhuma
    chamada, e é o que impede a barra de abas de virar o segundo lugar do
    aplicativo que tenta rede sozinho.
  */
  const [sino, setSino] = useState<AvisosGuardados | null>(null);
  const filaRef = useRef<FilaDeSincronizacao | null>(null);
  const sinalRef = useRef(sinal.temSinal);
  sinalRef.current = sinal.temSinal;

  useEffect(() => {
    if (!identidade) return;
    let vivo = true;
    let parar: (() => void) | undefined;
    let desassinar: (() => void) | undefined;

    void (async () => {
      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      if (!vivo) return;
      filaRef.current = fila;
      desassinar = fila.assinar((r) => { if (vivo) setResumo(r); });
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
      desassinar?.();
      parar?.();
    };
  }, [identidade, obterToken, lerIdentidade]);

  /*
    Lê uma vez e depois só escuta. A leitura inicial é o que faz o crachá
    existir já na primeira pintura (quem abre o aplicativo depois de um dia fora
    precisa ver o número antes de tocar em qualquer coisa), e a escuta é o que
    faz ele ZERAR quando o agente marca os avisos como lidos dentro do Perfil,
    sem depender de trocar de aba para a barra se redesenhar.

    LISTA DE DEPENDÊNCIAS VAZIA, e não `[identidade]`, que foi a primeira
    versão. `useSessao()` devolve um objeto NOVO a cada renderização, então o
    efeito reexecutava a cada quadro, gravava estado, provocava a renderização
    seguinte e recomeçava: laço infinito que estoura a memória do processo. O
    efeito não precisa da identidade, porque não há nada a reler quando ela
    muda: o logout apaga `marcas`, e a barra inteira é desmontada junto.
  */
  useEffect(() => {
    let vivo = true;
    void avisosGuardados().then((lido) => { if (vivo) setSino(lido); });
    const desassinar = assinarAvisos((novo) => { if (vivo) setSino(novo); });
    return () => { vivo = false; desassinar(); };
  }, []);

  // Sinal voltou: tenta agora, sem esperar a próxima janela do laço. É o
  // momento em que o agente está olhando para a tela esperando ver acontecer.
  useEffect(() => {
    if (sinal.temSinal) void filaRef.current?.drenar().catch(() => undefined);
  }, [sinal.temSinal]);

  if (!identidade) return <Redirect href="/entrar" />;

  const pendentes = (resumo?.pendentes ?? 0) + (resumo?.enviando ?? 0);
  const bloqueados = resumo?.bloqueados ?? 0;
  /*
    Coleta de outro agente (ou sem autor registrado) entra no crachá, e NÃO em
    `pendentes`.

    No crachá porque ela é uma vistoria feita no morro que ainda não chegou à
    coordenação, e o crachá responde exatamente essa pergunta. Fora de
    `pendentes` porque "esperando envio" promete que sai sozinha assim que
    houver sinal, e essa não sai enquanto o autor não entrar neste aparelho.
  */
  const deOutroAutor = resumo?.deOutroAutor ?? 0;
  // O que a aba de envio mostra no número: tudo que ainda não chegou lá.
  const naFila = pendentes + bloqueados + deOutroAutor;

  const avisosPorLer = sino?.naoLidos ?? 0;
  /*
    A contagem do servidor bateu no teto dele: o número é um PISO, e não o
    total. O "+" existe para o crachá não afirmar um total que ninguém contou,
    que é o mesmo cuidado que o sino do painel já tem.
  */
  const avisosTruncados = sino?.naoLidosTruncado ?? false;

  /*
    A PASSAGEM DE UMA TELA PARA OUTRA, que até aqui não existia.

    As três abas e a vistoria trocavam sem nenhum movimento: uma tela sumia e
    a outra aparecia no mesmo quadro. Num aplicativo de formulário longo isso
    não é neutro, é desorientador, porque nada diz de onde para onde se foi.

    `shift` e não `fade`: as telas deslizam 50 pontos na direção em que estão
    na barra, cruzando a opacidade. A direção é o que carrega informação, e ela
    é de graça aqui, porque o React Navigation a tira da POSIÇÃO da aba: sair
    de Tarefas para Envio vem da direita, voltar vem da esquerda. A vistoria é
    a última rota declarada neste arquivo, então ela SEMPRE entra pela direita,
    que é como o olho lê "avancei para dentro do trabalho". Um cruzamento de
    opacidade puro diria só "a tela trocou".

    A duração é `respostaAoToque` e não `mudancaDeEstado`, e a diferença
    importa: isto responde ao dedo do agente, não é algo que mudou sozinho.
    Acima de uns 150 ms uma troca de aba começa a parecer que o toque não
    pegou, e a pessoa toca de novo. O padrão da biblioteca aqui é 150 ms com
    uma curva escolhida por ela; o nosso é o token, com a curva de entrada do
    produto, para o menu ter o mesmo ritmo do resto do aplicativo.

    E some inteiro para quem pediu redução de movimento: `animation: "none"`
    desliga o interpolador, e sem interpolador nenhuma propriedade é animada.
    Mandar a duração junto seria pior que inútil, porque sugeriria que ainda
    existe animação com duração zero.

    SEM `react-native-reanimated`, e a decisão é deliberada. Ele está instalado
    e inerte, só como dependência de par do `expo-router` e do
    `react-native-screens`. Usá-lo aqui não traria nada: quem anima a troca de
    aba é o próprio `BottomTabView`, com `Animated` do React Native e
    `useNativeDriver` ligado, então o movimento já roda na camada nativa e não
    atravessa a ponte quadro a quadro. O que custaria é o plugin de Babel que o
    reanimated exige, e `babel.config.js` é mínimo de propósito: cada plugin a
    mais é uma diferença a mais entre o que roda no aparelho e o que o
    TypeScript conferiu. Ligar o reanimated é decisão para quando existir
    gesto contínuo, que é onde ele ganha de verdade; não existe nenhum aqui.
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

  /*
    A `chave` existe para a faixa saber que houve TRANSIÇÃO, e não só que o
    texto mudou. Sem ela, "3 esperando envio" virando "2 esperando envio" seria
    indistinguível de "esperando" virando "sincronizado", e o clímax da fila
    esvaziando dispararia a cada item enviado, o que o esvaziaria de sentido.

    A decisão em si mora em `decidirFaixa`, fora daqui: ela é a promessa central
    do aplicativo para quem desceu o morro, e aqui dentro não havia como
    testá-la sem montar as abas inteiras.
  */
  const faixa: EstadoDaFaixa = decidirFaixa(
    { temSinal: sinal.temSinal, pendentes, deOutroAutor, sincronizando: resumo?.sincronizando ?? false },
    tema,
  );

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo, paddingTop: margens.top }}>
      <FaixaDeSincronizacao
        estado={faixa}
        bloqueados={bloqueados}
        aoTocar={() => router.push("/(agente)/fila")}
      />

      {/*
        Barra PADRÃO, colada na borda de baixo.

        O motivo primeiro de existir uma barra é alcance, não estética. Antes
        de existir barra nenhuma, o único caminho para a fila era tocar a faixa
        lá em cima, e "Minha conta" ficava no FIM do rolamento das tarefas. Num
        aparelho de 6,7 polegadas segurado com uma mão, no alto de um barranco,
        o topo da tela é o ponto mais distante do polegar que existe.

        Ela FLUTUAVA, e o Rafa reprovou na primeira tela que abriu no iPhone:
        "esse aplicativo não combina com menu flutuante, deixa um menu padrão
        inferior". Ele tem razão, e a razão é maior que gosto. Menu flutuante é
        gramática de aplicativo de consumo, onde o conteúdo é uma esteira
        infinita que passa por baixo do cromo. Aqui o conteúdo são tarefas e
        formulários com começo e fim, o aplicativo é ferramenta de trabalho, e
        ferramenta de trabalho usa o desenho que o sistema operacional já
        ensinou para todo mundo. O agente não deve gastar um segundo aprendendo
        o nosso menu.

        O que a troca traz de concreto, e cada item era um defeito da versão
        flutuante:

        - a ALTURA deixa de ser nossa. Some `height`, e com ela some o
          conflito com a área segura: `getTabBarHeight` do React Navigation
          devolve a altura declarada no estilo quando ela existe, então o
          número escrito à mão ATROPELAVA a conta do sistema (49 mais o
          inset), e o resultado dependia do aparelho;
        - some `position: absolute` com `bottom` e `marginHorizontal`, e a
          barra volta a ocupar lugar no leiaute em vez de pairar sobre ele;
        - volta a `borderTopWidth`, que é o fio que separa a barra do conteúdo
          agora que não há mais sombra em volta de uma pílula;
        - o `paddingBottom` do `sceneStyle` PERDE a razão de existir, e é a
          parte mais fácil de esquecer. Ele reservava, no fim de toda rolagem,
          a altura da barra flutuante mais a folga. Com a barra ocupando lugar
          no leiaute, o React Navigation já encurta a cena e aplica o inset, e
          manter o recuo deixaria um vão morto no fim de toda lista do
          aplicativo: o oposto exato do defeito que ele existia para consertar.

        Três abas, e não cinco. O Instagram tem cinco destinos de peso igual;
        este aplicativo tem um destino (Tarefas) e uma tarefa (Vistoria). Duas
        abas a mais seriam duas invenções.

        Ícone COM palavra, sempre, e aqui o produto se afasta do Instagram de
        propósito. Lá o ícone sozinho funciona porque a pessoa abre o
        aplicativo várias vezes por dia e decorou os pictogramas. O agente
        abre este duas vezes por semana, com sol na tela e luva no dedo. A
        regra da casa é que nada se comunica só por cor; ícone sozinho falha
        pela mesma razão.

        O item ativo continua ganhando uma pílula preenchida atrás do ícone,
        agora do tamanho que cabe na barra do sistema (ver `PILULA`). Ela
        sobreviveu à troca porque é funcional e não decorativa: soma uma
        segunda pista à cor, para quem não distingue violeta de cinza.

        E a barra SOME dentro da vistoria. Aquela tela é uma tarefa com fim
        irreversível, tem o formulário mais longo do produto, e uma escotilha
        de fuga permanente embaixo do polegar, ao lado de um rolamento longo, é
        como se produz vistoria pela metade.
      */}
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: tema.superficie },
          headerTintColor: tema.texto,
          /*
            A ÁREA SEGURA É PAGA UMA VEZ SÓ, e quem paga é o `View` de fora.

            O cabeçalho do React Navigation reserva a área segura por conta
            própria quando não há cabeçalho pai, e a fonte dele diz isso sem
            rodeio: `headerStatusBarHeight = isParentHeaderShown ? 0 :
            insets.top`. A pilha da raiz desliga o cabeçalho dela para
            `(agente)`, então aqui não há pai nenhum e o recuo entrava inteiro.

            Só que este layout JÁ aplicou `paddingTop: margens.top` lá em cima,
            e precisa aplicar: a faixa de sincronização mora acima do cabeçalho
            e sem aquele recuo ela nasce embaixo do entalhe. O resultado eram
            duas áreas seguras empilhadas, cerca de 59 pontos de nada entre a
            faixa e a palavra "Minhas tarefas". Foi o que o Rafa viu no
            aparelho e chamou de "muito testudo".

            Zerar aqui não põe nada embaixo do entalhe: muda só quem paga.
          */
          headerStatusBarHeight: 0,
          /* Mesma razão do rótulo da aba, logo abaixo: o título do cabeçalho
             é texto do produto, e a pilha de fora já fazia isto. */
          headerTitleStyle: {
            fontFamily: familiaDoTexto({ peso: peso.negrito, fontesProntas: fontes.prontas }),
            ...(fontes.prontas ? {} : { fontWeight: peso.negrito }),
          },
          /*
            Só a cor. O recuo no fim da rolagem SAIU junto com a barra
            flutuante: ele reservava a altura do menu mais a folga, e agora que
            a barra ocupa lugar no leiaute ele viraria um vão morto no fim de
            toda lista do aplicativo.
          */
          sceneStyle: { backgroundColor: tema.fundo },
          ...transicaoEntreTelas,
          tabBarActiveTintColor: tema.destaque,
          tabBarInactiveTintColor: tema.textoDiscreto,
          /*
            Três propriedades, e nenhuma delas é de posição.

            Posição, altura e recuo inferior são do sistema agora: sem `height`
            no estilo, `getTabBarHeight` devolve 49 mais a área segura que o
            aparelho informa, que é o único número que acerta no iPhone com
            faixa inicial, no iPhone com botão e no Android com barra de
            gestos. Nenhum dos três sobreviveria a um valor escrito aqui.

            `superficie` e não `elevacao(tema).flutuante`: a elevação existe
            para peça que paira POR CIMA do conteúdo, e esta não paira mais.
            Quem separa a barra do que está em cima dela agora é o fio, que é
            justamente o que a barra flutuante tinha desligado com
            `borderTopWidth: 0` para não cortar a pílula ao meio.
          */
          tabBarStyle: {
            backgroundColor: tema.superficie,
            borderTopWidth: borda.fio,
            borderTopColor: tema.borda,
          },
          /*
            O destaque do item ABERTO, ícone e rótulo juntos. Ver
            `DESTAQUE_DA_ABA` no topo deste arquivo para o porquê de ele ter
            saído de dentro do ícone.
          */
          tabBarActiveBackgroundColor: tema.superficie2,
          tabBarItemStyle: DESTAQUE_DA_ABA,
          /*
            O rótulo da barra era a última superfície do aplicativo ainda
            desenhada na fonte do sistema, pelo mesmo descuido que o título do
            cabeçalho tinha em `app/_layout.tsx`. Com a fonte do produto no
            resto da tela, a palavra embaixo do ícone saía com outro desenho e
            outra largura, e é a primeira coisa que o olho compara.

            O peso só é declarado quando a fonte NÃO carregou: cada peso tem um
            arquivo próprio, e pedir `fontWeight` por cima da família certa faz
            o Android sintetizar em cima de um arquivo que já é o peso pedido.
          */
          tabBarLabelStyle: {
            fontSize: fonte.legenda,
            fontFamily: familiaDoTexto({ peso: peso.forte, fontesProntas: fontes.prontas }),
            ...(fontes.prontas ? {} : { fontWeight: peso.forte }),
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Minhas tarefas",
            tabBarLabel: "Tarefas",
            tabBarIcon: ({ color, focused }) => (
              <IconeDaAba Icone={IconeTarefas} cor={color} ativo={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="fila"
          options={{
            title: "Fila de envio",
            tabBarLabel: "Envio",
            tabBarIcon: ({ color, focused }) => (
              <IconeDaAba Icone={IconeEnvio} cor={color} ativo={focused} />
            ),
            // Número, e não pontinho colorido: o agente precisa saber QUANTAS
            // coletas estão esperando, não só que existe alguma.
            tabBarBadge: naFila > 0 ? naFila : undefined,
            tabBarBadgeStyle: {
              backgroundColor: bloqueados > 0 ? tema.perigoTexto : tema.destaque,
              /*
                `sobreDestaque`, e não branco escrito à mão. O branco estava
                certo no tema claro por acidente e ERRADO no escuro: ali
                `destaque` é violeta 400, um lilás claro, e branco sobre ele dá
                cerca de 1.9:1. O número de coletas esperando é a informação que
                o agente confere de relance, e ela estava sumindo justamente no
                tema que se usa à noite e debaixo de capa de chuva.
              */
              color: tema.sobreDestaque,
              fontSize: fonte.legenda,
            },
            /*
              O RÓTULO FALADO NÃO PROMETE ENVIO, e essa é a correção.

              Ele dizia "N coletas esperando" sobre um número que soma três
              coisas com destinos diferentes: o que sai sozinho quando houver
              sinal, o que o servidor recusou, e o que NÃO sai por esta conta
              (a coleta do turno anterior, no aparelho de plantão, que só sobe
              quando o autor dela entrar aqui, senão o laudo sairia com o nome
              errado). "Esperando" é a palavra da primeira, e ela estava
              cobrindo as três: quem ouve a tela recebia a promessa inteira,
              sem a ressalva, e ia embora. É a mesma frase que a
              `FaixaDeSincronizacao` já teve de corrigir, na superfície ao lado.

              Agora o total diz só "na fila", que é o fato, e cada parte com
              destino próprio se nomeia depois dele. Quem não vê a tela ouve a
              mesma separação que o desenho da fila mostra em seções.
            */
            tabBarAccessibilityLabel: naFila === 0
              ? "Envio, nada esperando"
              : [
                `Envio, ${naFila} na fila`,
                pendentes > 0 ? `${pendentes} esperando envio` : null,
                bloqueados > 0 ? `${bloqueados} com problema` : null,
                deOutroAutor > 0 ? `${deOutroAutor} de outro agente` : null,
              ].filter((parte) => parte !== null).join(", "),
          }}
        />
        {/*
          PERFIL, e não "Equipe" mais "Conta" em duas telas.

          As duas respondiam à mesma pergunta ("quem sou eu aqui e como está o
          meu aparelho"), e a conta estava escondida atrás de um botão no FIM do
          rolamento da equipe: quem quisesse conferir a versão do aplicativo ou
          trocar o tema precisava abrir a equipe, rolar dez vistorias concluídas
          e achar um botão secundário no rodapé. A rota `conta` saiu junto, e
          não sobrou redirecionamento: ninguém liga para ela de lugar nenhum.

          O crachá aqui é o SINO (`GET /avisos`), e ele é o que compra a
          visibilidade de qualquer tela sem inventar uma quarta aba. A razão de
          o conteúdo morar dentro do Perfil, e não num sino fixo no topo, está
          escrita no cabeçalho de `perfil.tsx`: o sino precisa de rede, e o topo
          desta tela já pertence à `FaixaDeSincronizacao`, que nunca mente.
        */}
        <Tabs.Screen
          name="perfil"
          options={{
            title: "Meu perfil",
            tabBarLabel: "Perfil",
            tabBarIcon: ({ color, focused }) => (
              <IconeDaAba Icone={IconeEquipe} cor={color} ativo={focused} />
            ),
            // Número, e não pontinho: o agente precisa saber QUANTOS avisos
            // esperam, e o número é o que decide se vale abrir agora.
            tabBarBadge: avisosPorLer > 0
              ? `${avisosPorLer}${avisosTruncados ? "+" : ""}`
              : undefined,
            tabBarBadgeStyle: {
              /*
                `alertaTexto` e não `destaque`: o crachá da fila já é violeta, e
                dois crachás violetas na mesma barra seriam dois avisos com a
                mesma cara para duas coisas opostas (uma é trabalho que ainda não
                subiu, a outra é notícia do município). E `sobreDestaque` para o
                número pela mesma razão do crachá da fila: branco escrito à mão
                acerta num tema e some no outro.
              */
              backgroundColor: tema.alertaTexto,
              color: tema.sobreDestaque,
              fontSize: fonte.legenda,
            },
            tabBarAccessibilityLabel: avisosPorLer === 0
              ? "Perfil"
              : `Perfil, ${avisosTruncados ? "mais de " : ""}${avisosPorLer} `
                + `${avisosPorLer === 1 && !avisosTruncados ? "aviso" : "avisos"} por ler`,
          }}
        />
        {/* Fora da barra, e sem barra: ver o comentário acima. */}
        <Tabs.Screen
          name="vistoria/[id]"
          options={{ title: "Vistoria", href: null, tabBarStyle: { display: "none" } }}
        />
      </Tabs>
    </View>
  );
}
