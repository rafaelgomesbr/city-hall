import { useContext, useState, type ComponentProps } from "react";
import {
  Image, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle,
} from "react-native";
/*
  O contexto vem do ROTEADOR, e não de `@react-navigation/bottom-tabs`.

  Desde o SDK 56 o Expo Router traz a própria cópia das abas e RECUSA compilar
  quando `@react-navigation/bottom-tabs` aparece como dependência direta. A
  recusa é alta e explícita, com endereço de migração, e foi ela que derrubou o
  primeiro build desta barra:

    error: As of SDK 56, expo-router is no longer compatible with
    react-navigation.

  Existe uma variável de ambiente que desliga a checagem. Usá-la seria calar o
  aviso e manter duas cópias das abas no mesmo binário, que é o defeito que ele
  existe para impedir: dois contextos com o mesmo nome, e o nosso lendo o que a
  tela de verdade não escreve.
*/
import { BottomTabBarHeightCallbackContext } from "expo-router/build/react-navigation/bottom-tabs";
import type { Tabs } from "expo-router";

import { Dialogo } from "./Dialogo";
import { Tocavel, Txt, useTema } from "./componentes";
import { lerRascunho } from "../dados/rascunho";
import { borda, espaco, icone, peso, raio, toque } from "./tokens";

/**
 * O MENU INFERIOR, desenhado por este aplicativo em vez de pelo React Navigation.
 *
 * ## Por que ele deixou de ser o do sistema
 *
 * O RECLAME, na letra de quem paga: "esse menu tá feio, parece que foi
 * gambiarra, ele não se encaixa ali embaixo, tem um espaço branco embaixo dos 3
 * ícones, um espaço inútil, essa desgraça deve ocupar todo o espaço abaixo sem
 * ficar com as calças curtas, tem que ser algo bem feito".
 *
 * A causa foi medida antes de qualquer linha ser escrita, e ela não estava em
 * propriedade nenhuma nossa. O `BottomTabBar` desenha 49 pontos de conteúdo e
 * ACRESCENTA a área segura do aparelho (uns 34 num iPhone com faixa inicial)
 * como espaço vazio DEPOIS do bloco, pintado com a cor da barra. O retângulo de
 * destaque do item aberto (`tabBarActiveBackgroundColor` mais `tabBarItemStyle`)
 * cobria os 49 e parava ali. É isso que lê como calça curta: um bloco colorido
 * que termina no meio da barra, com uma tira morta debaixo dele.
 *
 * Nenhuma propriedade da barra padrão cria aquela tira, e nenhuma a preenche:
 * ela sai da conta do `getTabBarHeight` mais o recuo que o próprio componente
 * aplica. Por isso a barra passou a ser nossa, ligada por
 * `tabBar={(props) => <BarraDeAbas {...props} />}`.
 *
 * ## A CONTA DA ALTURA, que é o conserto
 *
 * A área segura vira RECUO DE BAIXO DO ITEM, e não um vão depois dele. Cada
 * item vai da borda de cima da barra até a borda de baixo da tela, e o conteúdo
 * (ícone e palavra) fica centrado na parte útil, acima do indicador do aparelho.
 * Com isso o destaque do item aberto cobre a coluna inteira, e não sobra tira
 * morta nenhuma para ler como remendo.
 *
 *     conteúdo   = icone.acao (24) + espaco.e1 (4) + linha.legenda (16) = 44
 *     respiro    = espaco.e1 em cima + espaco.e1 embaixo                =  8
 *     parte útil = 44 + 8                                              = 52 = `toque`
 *     item       = parte útil + insets.bottom  (86 no iPhone, 52 sem gestos)
 *
 * Os 52 não são coincidência nem gosto: são o alvo mínimo de toque que este
 * produto declara em `tokens.ts` (dedo, com luva, na chuva, num barranco). A
 * conta FECHA em cima dele, e é por isso que ela cabe. Quem aumentar o ícone ou
 * o rótulo sem mexer na altura reprova no portão, que refaz esta soma.
 *
 * Nada aqui tem altura FIXA: o item declara `minHeight`, então com a fonte
 * grande do sistema o rótulo quebra em duas linhas e a barra cresce junto, em
 * vez de cortar a palavra ao meio (que foi o defeito da versão anterior desta
 * barra, visto no aparelho: "os ícones do menu ficaram achatados").
 *
 * ## O rótulo em 12, e não em 14
 *
 * A régua de hierarquia manda o texto que NOMEIA o que se toca ficar no degrau
 * `interacao`, com piso de `fonteMinimaDeInteracao` (14). Aqui ele fica no
 * degrau de legenda (12), e isto é exceção declarada, não descuido: nesta peça
 * a palavra é a SEGUNDA pista ao lado do ícone, dentro de um alvo de 52 pontos
 * que se anuncia inteiro pelo `accessibilityLabel`, e não o nome isolado de um
 * controle. Era 12 na barra do sistema desde sempre e continua 12: trocar agora,
 * no mesmo turno em que a barra mudou de dono, misturaria duas decisões numa
 * mudança só.
 *
 * ## O que a barra padrão dava de graça e passou a ser daqui
 *
 * Crachá numérico posicionado, rótulo falado, estado de selecionado e alvo de
 * toque. Cada um está abaixo com o seu porquê, e cada um tem caso em
 * `src/__tests__/menu-colado-e-transicoes.test.tsx`. O que continua vindo do
 * navegador é o que é dele: a transição entre telas (`animation: "shift"`, que
 * tira a direção da POSIÇÃO da aba no estado) e o roteamento.
 *
 * ## O que esta peça NÃO decide
 *
 * Nenhum número de crachá e nenhuma frase falada nascem aqui. Eles chegam pelas
 * opções de cada `Tabs.Screen`, declaradas em `app/(agente)/_layout.tsx`, que é
 * onde a fila e o sino já eram lidos. A barra desenha; o layout diz o quê.
 */

/**
 * As iniciais de um nome, para o círculo do Perfil.
 *
 * Cópia do critério de `app/(agente)/perfil.tsx`, e a cópia é deliberada: lá a
 * função não é exportada, e o comentário dela explica por quê ("tudo dentro de
 * `src/app` é rota do Expo, e um arquivo de rota exporta a tela, não
 * utilitário"). Copiar é o menor dos males enquanto aquela tela está sendo
 * mexida por outra frente, mas a DUPLICATA é nomeada aqui para não virar
 * divergência: a casa desta regra é `src/ui`, e quem passar por `perfil.tsx`
 * apaga a de lá, exporta esta e usa uma só.
 *
 * Até isso acontecer, as duas precisam concordar, e concordam: duas letras
 * quando há sobrenome (uma equipe com dois "Carlos" viraria dois "C"
 * idênticos), uma quando não há, e interrogação quando o cadastro do município
 * veio sem nome.
 */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? "";
  if (!primeira) return "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira[0] ?? "") + (ultima[0] ?? "")).toUpperCase();
}

/**
 * O círculo do Perfil: a pessoa, e não um pictograma de equipe.
 *
 * A aba trazia `IconeEquipe`, duas pessoas em traço, e a aba não é a equipe: é
 * VOCÊ. O desenho de círculo com iniciais já existe neste produto, na lista de
 * colegas dentro do Perfil, e trazê-lo para a barra faz a aba dizer de quem é o
 * aparelho, que é a primeira pergunta de quem pega um telefone de plantão que
 * não é o dele.
 *
 * PENDÊNCIA NOMEADA, e não esquecimento: a FOTO. A peça já a aceita e já a
 * desenha, e quem não a passa é o chamador, porque `identidade` não traz
 * fotografia nenhuma. Publicá-la depende de a API expor o campo no perfil do
 * usuário; enquanto isso não existe, o círculo cai nas iniciais. No dia em que
 * o campo entrar, muda uma propriedade no `_layout` e mais nada.
 */
export function AvatarDoAgente({ nome, foto, ativo }: {
  nome: string;
  /** Caminho local ou remoto do rosto. Ver a pendência acima. */
  foto?: string | null;
  ativo: boolean;
}) {
  const tema = useTema();

  return (
    <View
      /*
        Escondido do leitor de tela de propósito: quem anuncia este item é o
        `accessibilityLabel` do tocável inteiro ("Perfil, 3 avisos por ler"), e
        deixar o círculo falar poria duas letras soltas entre o rótulo e o
        crachá.
      */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="avatar-do-agente"
      style={{
        width: icone.acao,
        height: icone.acao,
        borderRadius: raio.pilula,
        /*
          O círculo é a única peça da barra preenchida mesmo com a aba fechada, e
          é isso que o faz ler como pessoa em vez de como mais um traço. Aberta,
          ele assume a cor de destaque; fechada, a superfície de apoio, para o
          violeta não competir com o item que está aberto de verdade.
        */
        backgroundColor: ativo ? tema.destaque : tema.superficie2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {foto
        ? (
          <Image
            testID="foto-do-agente"
            source={{ uri: foto }}
            style={{ width: icone.acao, height: icone.acao }}
          />
        )
        : (
          /* O invólucro existe porque `Txt` não recebe identificador, e o portão
             precisa ler as letras sem o resto do item junto. Mesmo precedente do
             `testID` que a versão anterior desta barra punha em volta do ícone. */
          <View testID="iniciais-do-agente">
            <Txt
              variante="legenda"
              peso={peso.negrito}
              cor={ativo ? tema.sobreDestaque : tema.texto}
            >
              {iniciaisDe(nome)}
            </Txt>
          </View>
        )}
    </View>
  );
}

/**
 * O crachá numérico, que a barra padrão posicionava sozinha.
 *
 * Número, e não pontinho colorido: o agente precisa saber QUANTAS coletas
 * esperam e QUANTOS avisos chegaram, porque é o número que decide se vale abrir
 * agora. A cor vem de fora, pelo `tabBarBadgeStyle` da aba, porque ela é
 * semântica e mora onde a contagem é feita: o crachá da fila muda quando há item
 * com problema, e o do sino é de outra cor porque conta outra coisa.
 *
 * Ele fica sobre o canto do ícone, e não ao lado da palavra: ao lado, empurraria
 * o rótulo e mudaria a largura da coluna toda vez que a fila passasse de um
 * dígito para dois.
 */
function Cracha({ texto, fundo, cor, testID }: {
  texto: string;
  fundo: ColorValue;
  cor: string;
  testID: string;
}) {
  return (
    <View
      /* Ver o motivo em `AvatarDoAgente`: quem fala é o tocável inteiro, e o
         número já está dentro da frase dele ("Envio, 4 na fila, ..."). */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={{
        position: "absolute",
        /*
          A âncora é o canto de cima do bloco do ícone, deslocada por tokens: o
          crachá encosta no ícone sem sair da coluna nem tocar a borda da barra.
        */
        top: -espaco.e1,
        left: icone.acao - espaco.e2,
        /*
          `minHeight` e não `height`, pela mesma razão do item: com a fonte
          grande do sistema o número cresce, e uma caixa fixa o cortaria pela
          metade justamente para quem aumentou a fonte por precisar dela.
        */
        minWidth: espaco.e4,
        minHeight: espaco.e4,
        paddingHorizontal: espaco.e1,
        borderRadius: raio.pilula,
        backgroundColor: fundo,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variante="legenda" peso={peso.negrito} cor={cor}>{texto}</Txt>
    </View>
  );
}

/** Uma cor declarada em `tabBarBadgeStyle`, sem depender da ordem do arranjo. */
function corDoCracha(estilo: unknown, campo: "backgroundColor" | "color"): string | undefined {
  const junto = StyleSheet.flatten(estilo as StyleProp<ViewStyle>) as
    Record<string, unknown> | undefined;
  const valor = junto?.[campo];
  return typeof valor === "string" ? valor : undefined;
}

/**
 * A rota está fora da barra?
 *
 * `href: null` no expo-router não é uma bandeira própria: ele vira
 * `tabBarItemStyle: { display: "none" }` mais um `tabBarButton` que devolve
 * nulo (ver `expo-router/build/layouts/TabsClient.js`). A barra padrão obedecia
 * aos dois; a nossa obedece ao primeiro, que é o que chega intacto até aqui.
 *
 * Ler isto, em vez de manter uma lista de nomes escrita à mão, é o que impede a
 * barra de discordar do roteador: quem declara `href: null` é o `_layout`, e uma
 * lista aqui seria uma segunda verdade para a mesma pergunta.
 */
function foraDaBarra(opcoes: { tabBarItemStyle?: unknown }): boolean {
  const estilo = StyleSheet.flatten(opcoes.tabBarItemStyle as StyleProp<ViewStyle>) as
    Record<string, unknown> | undefined;
  return estilo?.["display"] === "none";
}

/** O nome da rota da vistoria, que é a única tela com pergunta de saída. */
const ROTA_DA_VISTORIA = "vistoria/[id]";

/**
 * O que o `Tabs` entrega ao `tabBar`, tirado do próprio `Tabs`.
 *
 * E não o `BottomTabBarProps` de `@react-navigation/bottom-tabs`, que parece o
 * mesmo tipo e não é: o expo-router publica uma cópia própria das declarações
 * do navegador, com diferenças pequenas nos tipos de cor do cabeçalho, e o
 * TypeScript recusa a troca. Ler do componente que vai receber esta peça é o
 * que faz o tipo continuar certo no dia em que o expo-router mudar a cópia
 * dele, em vez de virar um `as` escondido aqui.
 */
type PropsDaBarra = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

type RotaDaBarra = PropsDaBarra["state"]["routes"][number];

export function BarraDeAbas({ state, descriptors, navigation, insets }: PropsDaBarra) {
  const tema = useTema();
  /*
    Quem ouve a altura da barra é `useBottomTabBarHeight()`, e hoje nenhuma tela
    deste aplicativo o chama: as cenas são dimensionadas por `flex`, porque a
    barra é IRMÃ delas no leiaute e não paira sobre nada. Mesmo assim o número é
    informado, porque a barra padrão informava: uma tela que perguntasse receberia
    a conta do sistema (49 mais o inset) em vez da nossa, e erraria por uns
    poucos pontos exatamente na borda de baixo.
  */
  const avisarAltura = useContext(BottomTabBarHeightCallbackContext);

  /**
   * A aba que o agente tocou enquanto havia vistoria começada.
   *
   * Guarda a rota inteira, e não só o nome: a resposta do diálogo chega num
   * quadro diferente do toque, e reconstruir a rota pelo nome perderia os
   * parâmetros que vieram junto.
   */
  const [perguntando, setPerguntando] = useState<
    { rota: RotaDaBarra; rotulo: string } | null
  >(null);

  const abertaAgora = state.routes[state.index];

  /**
   * Há vistoria COMEÇADA na tela aberta?
   *
   * Começada e aberta são coisas diferentes, e a diferença é o que impede a
   * pergunta de virar obstáculo: a tela de vistoria cunha o rascunho em memória
   * na abertura e só o GRAVA no primeiro toque do agente (ver `alterar()` em
   * `app/(agente)/vistoria/[id].tsx`). Existir linha no disco quer dizer que
   * alguém preencheu alguma coisa, e é o mesmo critério que a lista de tarefas
   * já usa para marcar uma tarefa como "em andamento".
   *
   * A leitura acontece no TOQUE, e não quando a tela abre: o rascunho nasce
   * entre uma coisa e outra, e uma resposta guardada na abertura estaria errada
   * exatamente no caso que importa.
   */
  async function haVistoriaComecada(): Promise<boolean> {
    if (abertaAgora?.name !== ROTA_DA_VISTORIA) return false;
    const id = (abertaAgora.params as { id?: string } | undefined)?.id;
    if (!id) return false;
    try {
      return (await lerRascunho(id)) !== null;
    } catch {
      /*
        Disco recusando leitura não pode PRENDER o agente na tela. O pior caso de
        deixar passar é uma troca de aba sem pergunta, com o rascunho intacto no
        disco; o pior caso de segurar é um menu que não responde ao dedo no meio
        do plantão.
      */
      return false;
    }
  }

  async function aoTocar(rota: RotaDaBarra, rotulo: string): Promise<void> {
    /*
      O `tabPress` é emitido mesmo na aba já aberta, e é assim que a barra padrão
      faz: é esse evento que uma tela usa para voltar a lista ao topo quando se
      toca na aba em que já se está. Ninguém escuta hoje; tirar o aviso faria o
      dia em que alguém escutar não funcionar sem motivo visível.
    */
    const evento = navigation.emit({
      type: "tabPress", target: rota.key, canPreventDefault: true,
    });
    if (rota.key === abertaAgora?.key || evento.defaultPrevented) return;

    if (await haVistoriaComecada()) {
      setPerguntando({ rota, rotulo });
      return;
    }
    navigation.navigate(rota.name, rota.params);
  }

  return (
    <View
      testID="barra-de-abas"
      onLayout={(e) => avisarAltura?.(e.nativeEvent.layout.height)}
      style={{
        flexDirection: "row",
        backgroundColor: tema.superficie,
        /*
          O fio, e não sombra. Elevação existe para peça que paira POR CIMA do
          conteúdo, e esta não paira: ela ocupa lugar no leiaute, e o que a separa
          do que está acima dela é uma linha.
        */
        borderTopWidth: borda.fio,
        borderTopColor: tema.borda,
        /*
          Nenhum recuo de baixo AQUI, e a ausência é o conserto. Era ele, dentro
          do `BottomTabBar`, que produzia a tira morta: o bloco de itens
          terminava e a área segura vinha depois, pintada. Agora quem a paga é
          cada item, e por isso o item cobre a coluna inteira.
        */
      }}
    >
      {state.routes.map((rota, indice) => {
        const descritor = descriptors[rota.key];
        if (!descritor || foraDaBarra(descritor.options)) return null;
        const { options } = descritor;

        const aberta = state.index === indice;
        const rotulo = typeof options.tabBarLabel === "string" ? options.tabBarLabel : rota.name;
        const cor = aberta ? tema.destaque : tema.textoDiscreto;
        const cracha = options.tabBarBadge;

        return (
          <Tocavel
            key={rota.key}
            testID={`aba-${rota.name}`}
            accessibilityRole="button"
            /*
              O rótulo FALADO é o composto que o layout monta ("Envio, 4 na fila,
              3 esperando envio, 1 com problema"), e não a palavra da tela. A
              palavra sozinha não diria o que o crachá mostra, e quem ouve a tela
              não vê crachá nenhum.
            */
            accessibilityLabel={options.tabBarAccessibilityLabel ?? rotulo}
            /*
              A pista da aba aberta para quem não vê a tela. Ela é o par do bloco
              preenchido: duas pistas, uma por canal, e nenhuma delas é a cor
              sozinha.
            */
            accessibilityState={{ selected: aberta }}
            onPress={() => { void aoTocar(rota, rotulo); }}
            estilo={{
              flex: 1,
              /*
                A CONTA, aplicada. `toque` é a parte útil (ver o cabeçalho), e a
                área segura entra em cima dela para o item alcançar a borda de
                baixo da tela. `minHeight` e não `height`: com a fonte grande do
                sistema o rótulo quebra em duas linhas e a barra cresce junto.
              */
              minHeight: toque + insets.bottom,
              paddingTop: espaco.e1,
              paddingBottom: espaco.e1 + insets.bottom,
              alignItems: "center",
              justifyContent: "center",
              gap: espaco.e1,
            }}
          >
            {aberta && (
              <View
                testID="destaque-da-aba"
                /*
                  O DESTAQUE, que antes tinha altura própria e parava no meio da
                  barra. Aqui ele preenche o item, então vai da borda de cima da
                  barra até a borda de baixo da tela.

                  Arredondado só EM CIMA: embaixo ele encosta na borda da tela, e
                  um canto redondo ali deixaria duas fatias da cor da barra
                  aparecendo nos cantos, que é a mesma aparência de remendo que a
                  calça curta produzia.

                  Ele é irmão do conteúdo e vem ANTES dele: no React Native quem é
                  declarado primeiro é pintado primeiro, então o bloco fica atrás
                  do ícone e da palavra sem precisar de `zIndex`.
                */
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: tema.superficie2,
                  borderTopLeftRadius: raio.cartao,
                  borderTopRightRadius: raio.cartao,
                }}
              />
            )}

            <View>
              {options.tabBarIcon?.({ focused: aberta, color: cor, size: icone.acao })}
              {cracha !== undefined && cracha !== "" && (
                <Cracha
                  testID={`cracha-${rota.name}`}
                  texto={String(cracha)}
                  fundo={corDoCracha(options.tabBarBadgeStyle, "backgroundColor") ?? tema.destaque}
                  cor={corDoCracha(options.tabBarBadgeStyle, "color") ?? tema.sobreDestaque}
                />
              )}
            </View>

            {/* Invólucro pelo mesmo motivo das iniciais: `Txt` não recebe
                identificador, e o portão precisa ler a palavra sem o crachá
                junto. */}
            <View testID={`rotulo-da-aba-${rota.name}`}>
              <Txt
                variante="legenda"
                peso={aberta ? peso.negrito : peso.forte}
                cor={cor}
                alinhamento="center"
              >
                {rotulo}
              </Txt>
            </View>
          </Tocavel>
        );
      })}

      {/*
        A PERGUNTA, que é a compensação de a barra ter passado a aparecer dentro
        da vistoria.

        O argumento contra a barra ali estava escrito em três lugares deste
        aplicativo: uma escotilha de fuga permanente embaixo do polegar, ao lado
        do formulário mais longo do produto, é como se produz vistoria pela
        metade. O dono desfez a decisão e pediu esta pergunta no lugar.

        Ela NÃO é sobre perda, e o texto diz isso na cara: o rascunho está no
        disco desde o primeiro toque. É sobre atenção. Por isso a ação não é
        destrutiva, e o botão repete o DESTINO em vez de dizer "OK", que é a regra
        de conteúdo do `Dialogo`.
      */}
      {perguntando && (
        <Dialogo
          testID="dialogo-de-sair-da-vistoria"
          aberto
          titulo="Sair da vistoria?"
          texto={
            "A vistoria está começada e o que você já preencheu está guardado "
            + "neste aparelho. Sair agora não apaga nada: quando você voltar, ela "
            + "continua de onde parou."
          }
          acao={{
            rotulo: `Ir para ${perguntando.rotulo}`,
            aoTocar: () => {
              navigation.navigate(perguntando.rota.name, perguntando.rota.params);
            },
          }}
          recusa={{ rotulo: "Continuar a vistoria" }}
          aoFechar={() => { setPerguntando(null); }}
        />
      )}
    </View>
  );
}
