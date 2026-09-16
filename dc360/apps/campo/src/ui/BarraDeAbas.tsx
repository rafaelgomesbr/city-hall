import {
  useContext, useEffect, useMemo, useRef, useState, type ComponentProps,
} from "react";
import {
  Animated, Easing, Image, Platform, StyleSheet, View, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
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
import {
  BottomTabBarHeightCallbackContext, BottomTabBarHeightContext,
} from "expo-router/build/react-navigation/bottom-tabs";
import type { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Cracha } from "./Cracha";
import { Tocavel, Txt, useTema } from "./componentes";
import { useGuardaDeSaida } from "./GuardaDeSaidaDaVistoria";
import { textoDoCracha, useContagemDeAvisos, type ContagemDeAvisos } from "../dados/avisos";
import { contagemDaFila, fraseDaFila, useResumoDaFila } from "../dados/resumo-da-fila";
import { useSessao } from "../dados/sessao";
import { useFotoDoAgente } from "../dados/foto-do-agente";
import {
  borda, easing, elevacao, espaco, foco, icone, linha, movimento, opacidade, peso, raio, toque,
} from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * O MENU INFERIOR: uma pílula de vidro que paira sobre o conteúdo.
 *
 * ## O pedido, na letra de quem paga
 *
 * "Volta pro menu flutuante, vidro e bonito, se baseia em Nubank, BB,
 * Instagram. Bonito, animado, suave e responsivo. Capricha nesse menu, o perfil
 * em destaque pra dar a entender que é pra clicar. Eu imaginei ele arredondado
 * com o avatar de perfil bonito."
 *
 * ## A barra já foi flutuante uma vez, e foi reprovada. Os quatro defeitos
 *
 * A versão de 28/08 flutuava por cima da barra padrão do React Navigation, e
 * cada defeito dela tinha uma causa que esta peça fecha pelo lado certo:
 *
 * - (a) **Altura escrita à mão atropelava a conta do sistema.** Agora a barra
 *   MEDE a própria altura (`onLayout` na moldura, que vai da borda de cima da
 *   pílula até a borda de baixo da tela) e a informa por
 *   `BottomTabBarHeightCallbackContext`. Nunca `height`, sempre `minHeight`:
 *   com a fonte grande do sistema o rótulo cresce e a pílula cresce junto.
 * - (b) **`left` e `right` eram ignorados.** Eram opções da barra padrão, que
 *   as lia do jeito dela. A peça agora é nossa: `position: absolute` com
 *   `bottom`, `left` e `right` são nossos e valem.
 * - (c) **O fio estava desligado.** Flutuante não precisa de fio, precisa de
 *   ELEVAÇÃO, e `elevacao(tema).flutuante` existe para exatamente isto: "peça
 *   que paira e continua ali enquanto o conteúdo rola". Ver a nota sobre o
 *   fundo transparente na pílula (`pilula-do-menu`, dentro do componente),
 *   porque vidro e elevação puxam em direções opostas e a conciliação está
 *   escrita lá.
 * - (d) **`paddingBottom` na cena medido por ninguém.** A cena NÃO recebe recuo
 *   nenhum daqui. Cada tela rolável usa `useRecuoDoMenu()` no
 *   `contentContainerStyle.paddingBottom`, que lê a altura MEDIDA. O conteúdo
 *   passa por baixo do vidro, que é o ponto do vidro.
 *
 * ## A conta da altura
 *
 *     conteúdo do item = icone.acao (24) + espaco.e1 (4) + linha.legenda (16) = 44
 *     avatar do Perfil = a mesma altura do conteúdo (44), sem palavra embaixo
 *     respiro          = espaco.e1 em cima + espaco.e1 embaixo                 =  8
 *     item             = 44 + 8                                                = 52
 *     pílula           = item + 2 × borda.fio (o contorno da elevação)         = 54
 *     reserva na cena  = pílula + espaco.e3 (recuo do fundo) + área segura
 *
 * O avatar do Perfil ocupa EXATAMENTE a altura de ícone mais palavra dos
 * vizinhos, e não tem palavra embaixo: o rosto é o rótulo. Foi pedido assim
 * ("o item da aba perfil não precisa do nome perfil abaixo, e pode aparecer
 * a foto do usuário"), e a régua de "ícone COM palavra" continua cumprida
 * pelo canal que importa: o `accessibilityLabel` do item diz "Perfil" e a
 * contagem do sino, e o anel na cor de destaque é a segunda pista visual ao
 * lado do indicador. O item fecha em `toque` (52), que é o alvo mínimo do
 * produto, e o portão de acessibilidade refaz essa conta.
 *
 * ## O que esta peça decide, e o que ela lê de fora
 *
 * O layout (`app/(agente)/_layout.tsx`) diz a PALAVRA e o ÍCONE de cada aba,
 * pelas opções de cada `Tabs.Screen`. Os NÚMEROS (o crachá da fila, o crachá
 * do sino), as FRASES faladas e o rosto do Perfil são lidos AQUI, por ganchos
 * que assinam a fila e os avisos. A razão não é organização: é o defeito da
 * aba que ficava escura. Quem guarda estado que muda com o uso não pode ser o
 * pai do navegador, porque cada redesenho do pai reinicia a animação da cena.
 * A barra pode se redesenhar à vontade: ela é filha do navegador, não pai.
 *
 * ## O rótulo em 12, e não em 14
 *
 * A régua de hierarquia manda o texto que NOMEIA o que se toca ficar no degrau
 * `interacao`, com piso de `fonteMinimaDeInteracao` (14). Aqui ele fica no
 * degrau de legenda (12), e isto é exceção declarada, não descuido: nesta peça
 * a palavra é a SEGUNDA pista ao lado do ícone, dentro de um alvo de 52 pontos
 * que se anuncia inteiro pelo `accessibilityLabel`, e não o nome isolado de um
 * controle.
 *
 * ## `react-native-reanimated` continua inerte
 *
 * O indicador desliza com `Animated` do React Native e `useNativeDriver`, que
 * roda na camada nativa sem atravessar a ponte quadro a quadro. A decisão de
 * não ligar o reanimated está escrita em `app/(agente)/_layout.tsx` e vale
 * aqui igual: ele ganha em gesto contínuo, e não existe nenhum neste menu.
 */

/** As rotas que a barra trata de um jeito próprio. Quem as declara é o layout. */
const ROTA_DA_FILA = "fila";
const ROTA_DO_PERFIL = "perfil";

/**
 * A altura do conteúdo de um item com ícone e palavra: é o que os três
 * vizinhos do Perfil medem, e é a régua do avatar.
 */
const CONTEUDO_DO_ITEM = icone.acao + espaco.e1 + linha.legenda;

/**
 * O diâmetro do avatar do Perfil: a altura inteira de ícone mais palavra dos
 * vizinhos (44), anel incluído.
 *
 * Sem palavra embaixo, o rosto cresce até a mesma linha de topo e de base
 * dos outros itens, e a fileira lê como UMA linha com um rosto no fim, e não
 * como três ícones e um botão de outra altura. É quase o dobro dos 24 dos
 * pictogramas: o "em destaque" do pedido, sem inventar degrau novo na escala
 * de ícone, porque o número sai da soma dos tokens que os vizinhos já usam.
 *
 * O anel é a mesma figura do anel de foco (`foco`): uma borda de `enfase` com
 * uma folga entre ela e a peça, porque anel colado no contorno vira um traço
 * grosso só. A foto (ou as iniciais) ocupa o que sobra dentro.
 */
export const DIAMETRO_DO_AVATAR = CONTEUDO_DO_ITEM;

/** O respiro de cima e de baixo de cada item, dentro da pílula. */
const RESPIRO_DO_ITEM = espaco.e1;

/** A altura da pílula com o conteúdo mínimo: é a conta do cabeçalho. */
export const ALTURA_MINIMA_DA_PILULA =
  DIAMETRO_DO_AVATAR + 2 * RESPIRO_DO_ITEM + 2 * borda.fio;

/** Quanto a pílula recua das bordas laterais da tela. */
export const RECUO_LATERAL = espaco.e4;

/** Quanto a pílula recua da área segura de baixo. */
export const RECUO_DO_FUNDO = espaco.e3;

/**
 * A largura máxima da pílula: oito alvos de toque, dois por item.
 *
 * Num telefone ela nunca chega lá (390 de largura menos os dois recuos dá 358),
 * então a conta só decide no tablet: a pílula para de crescer e centraliza,
 * em vez de virar uma régua de 700 pontos com quatro palavras perdidas nas
 * pontas.
 */
export const LARGURA_MAXIMA_DA_PILULA = toque * 8;

/**
 * Quanto o desfoque do vidro pesa, de 1 a 100.
 *
 * Alto o bastante para o conteúdo que passa por baixo virar mancha de cor, e
 * não texto lido pela metade atrás de outro texto; abaixo de 100 para o vidro
 * continuar parecendo vidro, e não uma placa. É o mesmo peso nos dois temas: o
 * que muda por tema é a TINTA (clara ou escura), e ela é o que decide o
 * contraste, junto com o véu.
 */
export const INTENSIDADE_DO_VIDRO = 75;

/**
 * ONDE O VIDRO EXISTE, e onde a reserva opaca entra no lugar.
 *
 * No iOS o `BlurView` é o `UIVisualEffectView` do sistema: desfoca de verdade,
 * na camada nativa, sem custo que o aparelho sinta. No Android, o `expo-blur`
 * só desfoca de verdade com `blurMethod` de "dimezis", que exige um
 * `BlurTargetView` envolvendo o que está POR BAIXO do menu, e o navegador não
 * expõe esse ponto (a barra é irmã das cenas, dentro dele). Sem o alvo, o que
 * ele desenha no Android é uma tinta translúcida sem desfoque, ou seja, texto
 * da lista lido pela metade atrás do texto do menu.
 *
 * Então no Android a pílula é a RESERVA que o pedido nomeia: o fundo opaco de
 * `elevacao(tema).flutuante`, com a mesma forma, a mesma elevação e o mesmo
 * indicador. Vidro de verdade no Android é trabalho declarado, não feito.
 */
export const VIDRO_DISPONIVEL = Platform.OS === "ios";

/**
 * As iniciais de um nome, para o círculo do Perfil.
 *
 * Duas letras quando há sobrenome (uma equipe com dois "Carlos" viraria dois
 * "C" idênticos), uma quando não há, e interrogação quando o cadastro do
 * município veio sem nome.
 */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? "";
  if (!primeira) return "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira[0] ?? "") + (ultima[0] ?? "")).toUpperCase();
}

/**
 * O rosto do Perfil: o item que mais parece um botão, de propósito.
 *
 * Um círculo com as iniciais (ou a foto), dentro de um ANEL. O anel é o que
 * faz a peça ler como "isto se toca": aberta, ele assume a cor de destaque e o
 * círculo se preenche de violeta com as iniciais em `sobreDestaque`; fechada,
 * o anel é discreto (`borda`) e o círculo fica na superfície de apoio, para o
 * violeta não competir com a aba que está aberta de verdade.
 *
 * Entre o anel e o círculo há a folga do anel de foco (`foco.folga`), pela
 * razão escrita em `tokens.ts`: sem ela o anel encosta no contorno da peça e
 * os dois viram um traço grosso só, que some para quem tem baixa visão.
 *
 * A FOTO vem do disco do aparelho, pela cópia local que o Perfil grava ao
 * trocar (`dados/foto-do-agente.ts`), e a barra a lê por `useFotoDoAgente`,
 * que relê quando o disco avisa. Sem foto, as iniciais. A foto preenche o
 * círculo inteiro: um retrato de 24 pontos num círculo de 36 seria uma
 * moldura com um selo no meio.
 */
export function AvatarDoAgente({ nome, foto, ativo }: {
  nome: string;
  /** Caminho local (ou remoto) do rosto; nulo ou ausente desenha as iniciais. */
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
        width: DIAMETRO_DO_AVATAR,
        height: DIAMETRO_DO_AVATAR,
        borderRadius: raio.pilula,
        borderWidth: borda.enfase,
        borderColor: ativo ? tema.destaque : tema.borda,
        padding: foco.folga,
      }}
    >
      <View
        testID="circulo-do-agente"
        style={{
          flex: 1,
          borderRadius: raio.pilula,
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
              style={StyleSheet.absoluteFill}
            />
          )
          : (
            /* O invólucro existe porque `Txt` não recebe identificador, e o
               portão precisa ler as letras sem o resto do item junto. */
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
    </View>
  );
}

/**
 * A frase falada da aba Perfil, com o sino dentro dela.
 *
 * "Perfil" vem primeiro porque é o que a aba É; o número vem depois porque é o
 * estado dela. O "mais de" carrega o piso do servidor: o crachá não afirma um
 * total que ninguém contou.
 */
export function fraseDoPerfil(contagem: ContagemDeAvisos): string {
  if (contagem.porLer <= 0) return "Perfil";
  const palavra = contagem.porLer === 1 && !contagem.truncado ? "aviso" : "avisos";
  return `Perfil, ${contagem.truncado ? "mais de " : ""}${contagem.porLer} ${palavra} por ler`;
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

/**
 * A tela aberta pediu para a barra INTEIRA sumir?
 *
 * É a opção padrão do React Navigation para isso (`tabBarStyle: { display:
 * "none" }`, via `navigation.setOptions` da própria tela), lida da rota que
 * está aberta. O único uso hoje é a câmera da vistoria: um visor de tela
 * cheia com o obturador embaixo, e a pílula de vidro em cima do obturador é
 * uma foto errada com o morador esperando. "Somente nesses momentos onde tem
 * elementos em tela cheia sumir o menu", nas palavras do dono. O resto das
 * telas NÃO some o menu: elas reservam o vão (`useRecuoDoMenu`) ou sobem as
 * barras fixas de botões acima da pílula.
 *
 * Escondida, a barra informa altura ZERO pelo contexto, para a cena que
 * reserva o vão não reservar um vão de nada.
 */
export function barraEscondida(opcoes: { tabBarStyle?: unknown } | undefined): boolean {
  const estilo = StyleSheet.flatten(opcoes?.tabBarStyle as StyleProp<ViewStyle>) as
    Record<string, unknown> | undefined;
  return estilo?.["display"] === "none";
}

/**
 * O que a cena precisa reservar embaixo para o conteúdo não morrer atrás do
 * vidro, sem que a barra precise dizer.
 *
 * A altura medida chega por `BottomTabBarHeightContext`, que o navegador
 * preenche com o que a moldura informa no `onLayout`. Fora de uma cena do
 * navegador (uma peça montada solta, um teste) o contexto não existe, e a
 * reserva cai na CONTA do cabeçalho com a área segura do aparelho, que é o
 * mesmo número antes de a primeira medição chegar.
 *
 * Mais `espaco.e3` de respiro, para o último item da lista parar ACIMA da
 * pílula, e não encostado nela.
 */
export function alturaDeReservaDoMenu(areaSeguraDeBaixo: number): number {
  return ALTURA_MINIMA_DA_PILULA + RECUO_DO_FUNDO + areaSeguraDeBaixo;
}

export function useRecuoDoMenu(): number {
  const medida = useContext(BottomTabBarHeightContext);
  const margens = useSafeAreaInsets();
  return (medida ?? alturaDeReservaDoMenu(margens.bottom)) + espaco.e3;
}

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
  const { identidade } = useSessao();
  const fotoDoAgente = useFotoDoAgente(identidade?.usuarioId);
  const janela = useWindowDimensions();
  const reduzirMovimento = useReducaoDeMovimento();
  const resumo = useResumoDaFila();
  const contagemDeAvisos = useContagemDeAvisos();

  /*
    Quem ouve a altura da barra é `useBottomTabBarHeight()`, por baixo de
    `useRecuoDoMenu()`. A pílula paira sobre a cena, então a cena não é
    encurtada por ninguém: o número que sai daqui é a única coisa que diz a uma
    lista onde o conteúdo dela precisa parar.
  */
  const avisarAltura = useContext(BottomTabBarHeightCallbackContext);

  /*
    A PERGUNTA DE SAIR DA VISTORIA mora em `GuardaDeSaidaDaVistoria`, e a
    barra é quem diz à guarda onde o agente está: ela é a única peça que
    recebe o estado do navegador pronto. O sino do cabeçalho pergunta pela
    mesma guarda, com o mesmo diálogo.
  */
  const guarda = useGuardaDeSaida();
  const abertaAgora = state.routes[state.index];
  useEffect(() => {
    guarda.registrarRotaAberta(abertaAgora ?? null);
  }, [guarda, abertaAgora]);

  /* A tela aberta pediu tela cheia? Ver `barraEscondida`. */
  const escondida = barraEscondida(abertaAgora ? descriptors[abertaAgora.key]?.options : undefined);
  useEffect(() => {
    if (escondida) avisarAltura?.(0);
  }, [escondida, avisarAltura]);

  /* As rotas que aparecem na pílula, na ordem em que o layout as declarou. */
  const visiveis = state.routes.flatMap((rota, indice) => {
    const descritor = descriptors[rota.key];
    if (!descritor || foraDaBarra(descritor.options)) return [];
    return [{ rota, indice, descritor }];
  });

  /* Onde o item aberto está na pílula; -1 quando a tela aberta não tem item
     (a vistoria). */
  const posicaoAberta = visiveis.findIndex(({ indice }) => indice === state.index);

  /*
    A largura da pílula sai da JANELA, e não de uma medição: os quatro itens
    têm `flex: 1`, então a largura de cada um é a da linha dividida por
    quatro, e a linha é medida uma vez (`onLayout`) para o indicador saber
    quanto deslizar. Sem medição, o número é o estimado; com ela, o real.
  */
  const larguraDaPilula = Math.min(janela.width - 2 * RECUO_LATERAL, LARGURA_MAXIMA_DA_PILULA);
  const [larguraDaLinha, setLarguraDaLinha] = useState(0);
  const larguraDoItem = visiveis.length > 0 ? larguraDaLinha / visiveis.length : 0;

  /*
    O INDICADOR QUE DESLIZA, que é a segunda pista do item aberto (a primeira é
    a cor). Dois valores animados: onde ele está (`posicao`, em itens) e se ele
    existe (`presenca`, porque dentro da vistoria nenhuma aba está aberta e o
    bloco some em vez de ficar apontando para a última).

    `useNativeDriver` porque translação e opacidade rodam na camada nativa: o
    dedo não pode esperar o JavaScript, que neste aplicativo pode estar
    drenando a fila de uma manhã inteira de vistorias.

    Com redução de movimento, os dois valores vão direto ao destino. A
    interpolação some; o indicador, que é informação, fica.
  */
  const posicao = useRef(new Animated.Value(Math.max(posicaoAberta, 0))).current;
  const presenca = useRef(new Animated.Value(posicaoAberta >= 0 ? 1 : 0)).current;

  useEffect(() => {
    if (reduzirMovimento) {
      if (posicaoAberta >= 0) posicao.setValue(posicaoAberta);
      presenca.setValue(posicaoAberta >= 0 ? 1 : 0);
      return;
    }
    const configuracao = {
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    };
    const passos = [
      Animated.timing(presenca, { ...configuracao, toValue: posicaoAberta >= 0 ? 1 : 0 }),
    ];
    /* Some no lugar em que estava: deslizar até um item inexistente seria
       apontar para uma aba que não abriu. */
    if (posicaoAberta >= 0) {
      passos.push(Animated.timing(posicao, { ...configuracao, toValue: posicaoAberta }));
    }
    Animated.parallel(passos).start();
  }, [posicaoAberta, reduzirMovimento, posicao, presenca]);

  const deslocamentoDoIndicador = useMemo(
    () => Animated.multiply(posicao, larguraDoItem),
    [posicao, larguraDoItem],
  );

  function aoTocar(rota: RotaDaBarra, rotulo: string): void {
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

    /* Pergunta se houver vistoria começada; senão navega na hora. */
    guarda.antesDeSair(rotulo, () => { navigation.navigate(rota.name, rota.params); });
  }

  const fila = contagemDaFila(resumo);
  const crachaDaFila = fila.naFila > 0
    ? {
      texto: String(fila.naFila),
      /*
        A cor é SEMÂNTICA: muda com o que o número significa. Item com
        problema pinta de perigo; o resto, de destaque. E `sobreDestaque` para
        o número, e não branco escrito à mão: branco estava certo no tema claro
        por acidente e errado no escuro, onde `destaque` é um lilás claro.
      */
      fundo: fila.bloqueados > 0 ? tema.perigoTexto : tema.destaque,
      cor: tema.sobreDestaque,
    }
    : null;
  const textoDoSino = textoDoCracha(contagemDeAvisos);
  const crachaDoSino = textoDoSino !== null
    ? {
      texto: textoDoSino,
      /*
        `alertaTexto` e não `destaque`: o crachá da fila já é violeta, e dois
        crachás violetas na mesma barra seriam dois avisos com a mesma cara para
        duas coisas opostas (uma é trabalho que ainda não subiu, a outra é
        notícia do município).
      */
      fundo: tema.alertaTexto,
      cor: tema.sobreDestaque,
    }
    : null;

  /*
    A elevação inteira, espalhada uma vez na pílula. Ver `Pilula` para a
    conciliação entre o fundo dela e o vidro.
  */
  const flutuante = elevacao(tema).flutuante;

  /*
    A COR DO INDICADOR: o degrau neutro vizinho da superfície da pílula.

    A pílula veste a superfície de `flutuante`: branca no claro, `superficie2`
    no escuro (no escuro, o que sobe clareia). O bloco do item aberto precisa
    ser um degrau diferente dessa superfície nos DOIS temas, senão some num
    deles: no claro é `superficie2`, um cinza leve sobre o branco; no escuro é
    `superficie`, um recesso um tom mais fundo que a pílula. Os dois pares
    (destaque sobre superficie2, destaque sobre superficie) são medidos pelo
    portão de acessibilidade.
  */
  const corDoIndicador = tema.escuro ? tema.superficie : tema.superficie2;

  if (escondida) return null;

  return (
    <View
      testID="barra-de-abas"
      /*
        A MOLDURA: vai da borda de cima da pílula até a borda de baixo da tela,
        e é ela que é medida. Assim o número que a cena recebe já inclui o
        recuo do fundo e a área segura, sem nenhuma soma escrita à mão do lado
        de quem lê. `box-none` porque a moldura cobre uma faixa de conteúdo que
        continua tocável embaixo do recuo.
      */
      pointerEvents="box-none"
      onLayout={(e) => avisarAltura?.(e.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: RECUO_LATERAL,
        paddingBottom: insets.bottom + RECUO_DO_FUNDO,
        alignItems: "center",
      }}
    >
      <View
        testID="pilula-do-menu"
        style={{
          width: larguraDaPilula,
          /*
            A ELEVAÇÃO INTEIRA, e o fundo dela SAI só onde há vidro.

            `elevacao()` devolve fundo, contorno e sombra juntos porque no
            escuro quem carrega a elevação é a superfície clareando, e no claro
            é a sombra. Aqui a metade do fundo NÃO é descartada: ela muda de
            camada. O `BlurView` desfoca o que está atrás dele na janela, e um
            pai opaco seria exatamente "o que está atrás": o desfoque veria a
            superfície chapada e nenhuma lista. Por isso a pílula fica
            transparente e o fundo de `flutuante` vai para o VÉU, sobre o
            desfoque, com opacidade parcial. Contorno e sombra ficam aqui, na
            pílula, que não é recortada.

            Sem vidro (ver `VIDRO_DISPONIVEL`), nada disso acontece: a pílula
            é a elevação inteira, opaca, como o token pede.

            A sombra no iOS, com fundo transparente, passa a ser calculada por
            pixel em vez de pelo contorno (`RCTViewComponentView`, "Stage 1.
            Shadow Path"). É uma pílula só e ela não muda de tamanho: o custo
            é pago uma vez.
          */
          ...flutuante,
          ...(VIDRO_DISPONIVEL ? { backgroundColor: "transparent" } : {}),
          borderRadius: raio.pilula,
        }}
      >
        {VIDRO_DISPONIVEL && (
          /*
            O RECORTE: quem tem `overflow: hidden` é esta camada, e não a
            pílula, porque recortar a pílula recortaria a sombra dela junto.
          */
          <View
            testID="recorte-do-vidro"
            style={[StyleSheet.absoluteFill, { borderRadius: raio.pilula, overflow: "hidden" }]}
          >
            <BlurView
              testID="vidro-do-menu"
              intensity={INTENSIDADE_DO_VIDRO}
              tint={tema.escuro ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            {/*
              O VÉU: o fundo de `flutuante` em opacidade parcial, para o texto
              ter contraste sobre qualquer conteúdo que passe por baixo. O
              token é `veu` porque é a mesma pergunta do véu do diálogo:
              quanto do que está atrás ainda se vê.
            */}
            <View
              testID="veu-do-vidro"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: flutuante.backgroundColor, opacity: opacidade.veu },
              ]}
            />
          </View>
        )}

        <View
          testID="linha-de-itens"
          onLayout={(e) => setLarguraDaLinha(e.nativeEvent.layout.width)}
          style={{ flexDirection: "row" }}
        >
          {larguraDoItem > 0 && (
            <Animated.View
              testID="indicador-da-aba"
              /*
                Irmão dos itens e declarado ANTES deles: no React Native quem é
                declarado primeiro é pintado primeiro, então o bloco fica atrás
                do ícone e da palavra sem precisar de `zIndex`. Recuado de
                `espaco.e1` em todos os lados para não encostar no vidro.
              */
              style={{
                position: "absolute",
                top: RESPIRO_DO_ITEM,
                bottom: RESPIRO_DO_ITEM,
                left: RESPIRO_DO_ITEM,
                width: larguraDoItem - 2 * RESPIRO_DO_ITEM,
                borderRadius: raio.pilula,
                backgroundColor: corDoIndicador,
                opacity: presenca,
                transform: [{ translateX: deslocamentoDoIndicador }],
              }}
            />
          )}

          {visiveis.map(({ rota, indice, descritor }) => {
            const { options } = descritor;
            const aberta = state.index === indice;
            const rotulo = typeof options.tabBarLabel === "string" ? options.tabBarLabel : rota.name;
            const cor = aberta ? tema.destaque : tema.textoDiscreto;
            const ehPerfil = rota.name === ROTA_DO_PERFIL;
            const cracha = rota.name === ROTA_DA_FILA ? crachaDaFila : ehPerfil ? crachaDoSino : null;
            /*
              O rótulo FALADO é o composto ("Envio, 4 na fila, 3 esperando
              envio, 1 com problema"), e não a palavra da tela. A palavra
              sozinha não diria o que o crachá mostra, e quem ouve a tela não
              vê crachá nenhum.
            */
            const falado = rota.name === ROTA_DA_FILA
              ? fraseDaFila(resumo)
              : ehPerfil
                ? fraseDoPerfil(contagemDeAvisos)
                : (options.tabBarAccessibilityLabel ?? rotulo);

            return (
              <Tocavel
                key={rota.key}
                testID={`aba-${rota.name}`}
                accessibilityRole="button"
                accessibilityLabel={falado}
                /*
                  A pista da aba aberta para quem não vê a tela. Ela é o par do
                  bloco que desliza: duas pistas, uma por canal, e nenhuma delas
                  é a cor sozinha.
                */
                accessibilityState={{ selected: aberta }}
                onPress={() => { aoTocar(rota, rotulo); }}
                estilo={{
                  flex: 1,
                  minHeight: toque,
                  paddingVertical: RESPIRO_DO_ITEM,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: espaco.e1,
                }}
              >
                <View>
                  {ehPerfil
                    ? <AvatarDoAgente nome={identidade?.nome ?? ""} foto={fotoDoAgente} ativo={aberta} />
                    : options.tabBarIcon?.({ focused: aberta, color: cor, size: icone.acao })}
                  {cracha && (
                    <Cracha
                      testID={`cracha-${rota.name}`}
                      texto={cracha.texto}
                      fundo={cracha.fundo}
                      cor={cracha.cor}
                    />
                  )}
                </View>

                {/* O Perfil não tem palavra: o rosto é o rótulo (ver a conta
                    da altura no cabeçalho). Invólucro pelo mesmo motivo das
                    iniciais: `Txt` não recebe identificador, e o portão precisa
                    ler a palavra sem o crachá junto. */}
                {!ehPerfil && (
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
                )}
              </Tocavel>
            );
          })}
        </View>
      </View>

    </View>
  );
}
