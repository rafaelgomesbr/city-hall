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
import { useTema } from "../../ui/componentes";
import { AvatarDoAgente, BarraDeAbas } from "../../ui/BarraDeAbas";
import { FaixaDeSincronizacao, decidirFaixa, type EstadoDaFaixa } from "../../ui/FaixaDeSincronizacao";
import { IconeEnvio, IconeMapa, IconeTarefas } from "../../ui/icones";
import { familiaDoTexto } from "../../ui/tipografia";
import { useFontes } from "../../ui/fontes";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";
import { easing, icone, movimento, peso } from "../../ui/tokens";

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
 * QUEM DESENHA A BARRA DEIXOU DE SER O REACT NAVIGATION.
 *
 * O RECLAME, na letra: "esse menu tá feio, parece que foi gambiarra, ele não se
 * encaixa ali embaixo, tem um espaço branco embaixo dos 3 ícones, um espaço
 * inútil, essa desgraça deve ocupar todo o espaço abaixo sem ficar com as
 * calças curtas".
 *
 * A causa foi medida: o `BottomTabBar` desenha 49 pontos de conteúdo e
 * ACRESCENTA a área segura do aparelho como espaço vazio depois do bloco. O
 * destaque do item aberto (`tabBarActiveBackgroundColor` mais `tabBarItemStyle`)
 * cobria os 49 e parava ali, deixando uma tira morta debaixo dele. Nenhuma
 * propriedade nossa criava aquilo e nenhuma preenchia.
 *
 * Por isso a barra passou a ser `ui/BarraDeAbas.tsx`, com a conta da altura
 * escrita lá. A divisão de trabalho é esta, e ela é o que mantém este arquivo
 * pequeno: **o layout diz O QUE cada aba mostra** (a palavra, o ícone, o número
 * do crachá, a frase falada, a cor semântica do crachá), porque é aqui que a
 * fila e o sino são lidos; **a barra diz COMO isso é desenhado.**
 *
 * O que saiu daqui junto com a barra padrão: `tabBarStyle`, `tabBarItemStyle`,
 * `tabBarActiveBackgroundColor`, `tabBarLabelStyle` e o par de `tintColor`.
 * Nenhuma delas é lida por um `tabBar` próprio, e opção que ninguém lê é opção
 * que faz a próxima pessoa ajustar o menu no arquivo errado.
 */

/**
 * O ícone de uma aba, no tamanho que a conta da barra reserva.
 *
 * `icone.acao` (24) e não `icone.rotulo` (20): a conta de altura de
 * `BarraDeAbas` reserva 24 para o ícone, e o desenho anterior gastava 20 dentro
 * de uma pílula de 24. Sem a pílula, o que sobrava eram quatro pontos de nada
 * em volta de um pictograma que o agente olha de relance, com sol na tela.
 */
function IconeDaAba({ Icone, cor }: {
  /* `ColorValue` e não `string`: é o que o `tabBarIcon` entrega, e é o mesmo
     tipo que os ícones já aceitam. */
  Icone: (p: { cor: ColorValue; tamanho?: number }) => React.JSX.Element;
  cor: ColorValue;
}) {
  return <Icone cor={cor} tamanho={icone.acao} />;
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
        A barra, colada na borda de baixo e desenhada por nós.

        O motivo primeiro de existir uma barra é alcance, não estética. Antes de
        existir barra nenhuma, o único caminho para a fila era tocar a faixa lá
        em cima, e "Minha conta" ficava no FIM do rolamento das tarefas. Num
        aparelho de 6,7 polegadas segurado com uma mão, no alto de um barranco, o
        topo da tela é o ponto mais distante do polegar que existe.

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

        E A BARRA PASSOU A APARECER DENTRO DA VISTORIA. Isto desfaz uma decisão
        que este aplicativo defendia em três lugares: escotilha de fuga
        permanente embaixo do polegar, ao lado do formulário mais longo do
        produto, é como se produz vistoria pela metade. O dono desfez COM
        compensação, e a compensação mora em `BarraDeAbas`: tocar em outra aba
        com vistoria começada pergunta antes. O rascunho é gravado no disco a
        cada toque, então a pergunta é sobre ATENÇÃO, e não sobre perda.
      */}
      <Tabs
        tabBar={(props) => <BarraDeAbas {...props} />}
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
            Só a cor. O recuo no fim da rolagem não existe: a barra é IRMÃ da
            cena no leiaute, então o navegador já encurta a cena pela altura
            dela, e um recuo aqui viraria um vão morto no fim de toda lista do
            aplicativo.
          */
          sceneStyle: { backgroundColor: tema.fundo },
          ...transicaoEntreTelas,
          /*
            Nenhuma opção de desenho da barra daqui para baixo, e a ausência é
            deliberada: `tabBarStyle`, `tabBarItemStyle`,
            `tabBarActiveBackgroundColor`, `tabBarLabelStyle` e o par de
            `tintColor` são lidos pelo `BottomTabBar` PADRÃO, e só por ele. Com
            `tabBar` próprio, elas viram texto morto que faz a próxima pessoa
            ajustar o menu no arquivo errado. Quem desenha é `ui/BarraDeAbas.tsx`.
          */
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Minhas tarefas",
            tabBarLabel: "Tarefas",
            tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeTarefas} cor={color} />,
          }}
        />
        {/*
          O MAPA, entre as tarefas e o envio, e a posição é a ordem de uso: o
          agente abre a lista, decide por onde começar (é para isso que o mapa
          serve) e só volta ao envio no fim do dia, quando desce o morro.
        */}
        <Tabs.Screen
          name="mapa"
          options={{
            title: "Mapa",
            tabBarLabel: "Mapa",
            tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeMapa} cor={color} />,
          }}
        />
        <Tabs.Screen
          name="fila"
          options={{
            title: "Fila de envio",
            tabBarLabel: "Envio",
            tabBarIcon: ({ color }) => <IconeDaAba Icone={IconeEnvio} cor={color} />,
            // Número, e não pontinho colorido: o agente precisa saber QUANTAS
            // coletas estão esperando, não só que existe alguma.
            tabBarBadge: naFila > 0 ? naFila : undefined,
            /*
              SÓ AS DUAS CORES, e o tamanho saiu junto com a barra padrão: quem
              desenha o crachá agora é `BarraDeAbas`, e o degrau tipográfico dele
              é decisão de desenho, não de contagem. O que continua morando aqui
              é o que é SEMÂNTICO: a cor muda com o que o número significa.
            */
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

          O crachá aqui é o SINO (`GET /avisos`). A razão de o conteúdo morar
          dentro do Perfil, e não num sino fixo no topo, está escrita no
          cabeçalho de `perfil.tsx`: o sino precisa de rede, e o topo desta tela
          já pertence à `FaixaDeSincronizacao`, que nunca mente.

          O ícone desta aba deixou de ser o de equipe e passou a ser A PESSOA: um
          círculo com as iniciais de quem está com o aparelho. `IconeEquipe`
          dizia "equipe", e esta aba não é a equipe (ela está DENTRO do perfil):
          é você. Num aparelho de plantão, que troca de mão a cada turno, saber
          de quem é a sessão aberta é a primeira pergunta de quem pega o
          telefone.
        */}
        <Tabs.Screen
          name="perfil"
          options={{
            title: "Meu perfil",
            tabBarLabel: "Perfil",
            /* A foto é pendência nomeada, e não esquecimento: ver
               `AvatarDoAgente`. `identidade` não traz rosto nenhum hoje. */
            tabBarIcon: ({ focused }) => (
              <AvatarDoAgente nome={identidade.nome} ativo={focused} />
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
            },
            tabBarAccessibilityLabel: avisosPorLer === 0
              ? "Perfil"
              : `Perfil, ${avisosTruncados ? "mais de " : ""}${avisosPorLer} `
                + `${avisosPorLer === 1 && !avisosTruncados ? "aviso" : "avisos"} por ler`,
          }}
        />
        {/*
          FORA DA BARRA, e ÚLTIMA. As duas coisas são decisões, e a segunda é a
          que some da vista mais fácil.

          `href: null` a tira da barra sem tirá-la das rotas: ela continua sendo
          empurrada pela lista de tarefas, com parâmetro. Ela não é destino, é
          tarefa, e tarefa não vira aba.

          ÚLTIMA porque a transição entre telas é `shift`, e o `shift` tira a
          DIREÇÃO da deslizada da POSIÇÃO da rota neste estado. Declarada por
          último, a vistoria sempre entra pela direita, que é como o olho lê
          "avancei para dentro do trabalho"; declarada no meio, ela entraria pela
          esquerda quando aberta a partir do Perfil, e o mesmo toque produziria
          movimentos opostos dependendo de onde o agente estava.

          O que SAIU daqui: `tabBarStyle: { display: "none" }`. A barra passa a
          aparecer nesta tela, com a pergunta de saída como compensação (ver o
          comentário acima e `ui/BarraDeAbas.tsx`).
        */}
        <Tabs.Screen
          name="vistoria/[id]"
          options={{ title: "Vistoria", href: null }}
        />
      </Tabs>
    </View>
  );
}
