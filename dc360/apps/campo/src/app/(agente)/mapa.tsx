import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
/*
  O contexto vem do ROTEADOR, e não de `@react-navigation/bottom-tabs`, pela
  razão escrita em `ui/BarraDeAbas.tsx`: desde o SDK 56 o Expo Router traz a
  própria cópia das abas e recusa compilar com a outra como dependência direta.
*/
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import * as Location from "expo-location";
import {
  dataDoPrazo, quantoFalta, seloDaColeta, type ColetaLocal, type ItemFila,
} from "@dc360/campo";

import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";

import { enderecoDaApi, type Pendencia } from "../../dados/api";
import { listarColetas } from "../../dados/coletas";
import { useSinal } from "../../dados/conectividade";
import { obterFila } from "../../dados/fila";
import { pendenciasGuardadas } from "../../dados/pendencias";
import {
  CaminhoIndisponivel, FRASE_DA_INDISPONIBILIDADE, fraseDoCaminho, verOCaminho, type Caminho,
} from "../../dados/rota";
import { useSessao } from "../../dados/sessao";
import {
  abrirNoMapa, coordenadaEmTexto, copiarCoordenada, distanciaEmTexto, rotaEsquematica, type Ponto,
} from "../../dados/mapa";
import {
  AVISO_SEM_DISTANCIA,
  coletadasNoAparelho,
  ordemDoDia,
  pontoDaTarefa,
  pontoQueSeMede,
  tarefasDoDia,
} from "../../dados/ordem-do-dia";
import {
  Botao, Carregando, Dado, LinhaDeAcoes, Tocavel, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { Chip, SeloSeveridade } from "../../ui/Chip";
import { FolhaDeEscolha, type OpcaoDaFolha } from "../../ui/FolhaDeEscolha";
import { MapaDoImovel, ladoDoMapa, useMapaDoMunicipio, type PinoNoMapa } from "../../ui/mapa";
import {
  IconeAparelho, IconeGps, IconeLocalizacao, IconePrazo, IconePrazoVencido, IconeTarefas,
} from "../../ui/icones";
import { retornoTatil } from "../../ui/retornoTatil";
import {
  borda, easing, espaco, icone as tamanhoDeIcone, movimento, peso, raio, toque,
} from "../../ui/tokens";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";

/**
 * O MAPA DAS TAREFAS DO DIA, que agora é uma tela e não uma lente.
 *
 * ## O que esta tela desfaz, e o que ela mantém
 *
 * Até 15/09/2026 o mapa era uma LENTE dentro da tela de tarefas, com o
 * argumento escrito lá: "mapa não é lugar aonde se vai, é jeito de olhar as
 * tarefas que já se tem". O medo era concreto e continua sendo: duas telas
 * dizendo "minhas tarefas" podem discordar, e no dia em que discordarem o
 * agente vai acreditar na que estiver na frente dele.
 *
 * O que derrubou a lente não foi o argumento, foi a forma. Quem paga, com o
 * aparelho na mão: "o botão mapa dentro da tela tarefas ficou zuado demais, por
 * quê? Porque surge um bottom-sheet com as tarefas e outro com o mapa por cima".
 * Eram duas folhas empilhadas, e a de cima cobria justamente o que a de baixo
 * existia para mostrar. Uma tela dedicada não tem folha nenhuma: o mapa e a
 * lista dividem a tela, e nada fica por cima de nada.
 *
 * **A defesa continua montada, e mudou de lugar.** O que impedia as duas visões
 * de discordar nunca foi estarem na mesma tela: era consumirem a mesma regra.
 * A regra está em `src/dados/ordem-do-dia.ts` (`tarefasDoDia`,
 * `coletadasNoAparelho`, `ordemDoDia`), as duas telas a consomem sobre a mesma
 * leitura de disco, e `src/__tests__/hoje-lista-e-mapa.test.tsx` compara as
 * duas item a item, que é o mesmo caso que comparava as duas lentes antes.
 *
 * **E ela continua sendo o mapa DELE, não o do coordenador.** O outro argumento
 * que existia no código ("um mapa só, do imóvel focado, e não N pinos
 * espalhados") tinha esse medo dentro: o agente cair na visão geral do
 * município. Nada aqui busca ocorrência nenhuma. Os pinos são exatamente as
 * tarefas da lista dele, na ordem da lista dele; ocorrência de outra equipe não
 * está no aparelho e não aparece aqui.
 *
 * ## A lista é a superfície, e o item expande no lugar
 *
 * A primeira versão desta tela tinha um CARTÃO DA ESCOLHIDA entre o mapa e a
 * lista, com os botões, e a lista embaixo repetia a escolhida resumida. Quem
 * paga viu no iPhone: "tem uma redundância que pode ser melhorada, mostra o
 * item expandido com os btns ver o caminho e abrir a vistoria, e abaixo o mesmo
 * item só que resumido. Minha proposta: fazer uma lista paginada com itens
 * resumidos e ao expandir mostrar os btns".
 *
 * É o que está aqui. Cada item da lista tem um resumo (protocolo, severidade,
 * endereço em uma linha, distância) e, tocado, expande NO LUGAR, um por vez,
 * com o detalhe (prazo com data, rumo e distância, endereço inteiro, ponto de
 * referência) e os dois botões. Expandir um item escolhe o pino dele no mapa;
 * tocar no pino expande o item. A tela abre com a sugerida do dia já aberta,
 * porque é por ela que o dia começa.
 *
 * ## A tela pergunta antes de agir
 *
 * "Ver o caminho" e o toque no pino abrem uma `FolhaDeEscolha`, e não fazem
 * nada sozinhos. Do mesmo relato: "ao clicar ver o caminho perguntar o que
 * fazer; ao tocar nos itens do mapa perguntar se abrir o mapa naquela
 * localização ou ir na ocorrência". As respostas de "Ver o caminho" são as
 * três da vistoria (mapa do aparelho, caminho aqui dentro, copiar a
 * coordenada), e as do pino são duas (mapa do aparelho, abrir a vistoria). A
 * folha diz de qual tarefa fala, porque com doze pinos na tela a pergunta sem
 * sujeito é a que leva ao morro errado.
 *
 * ## O que ela não faz: rede
 *
 * Esta tela LÊ o disco e não baixa nada. Quem baixa é a tela de tarefas, que
 * tem o gesto de puxar, o relógio e a conversa com a fila. O disco é a fonte
 * das duas, e o foco relê: como as abas não aparecem ao mesmo tempo, não há
 * instante em que uma mostre uma lista e a outra mostre outra. A única saída
 * de dado é o caminho por ruas, e só quando o agente escolhe "Traçar aqui
 * dentro" na folha, uma tarefa por vez (ver `docs/SUBPROCESSADORES.md` 2.2).
 */

/**
 * A TELA INTEIRA ROLA, e o mapa é um quadrado.
 *
 * O reclame de quem paga, na letra: "não tem scroll na tela, tá travada; a
 * área que o mapa ocupa na tela também é pequena, eu imaginava pelo menos um
 * quadrado perfeito". Até 15/09/2026 a tela era quatro faixas fixas (cabeçalho,
 * mapa em 38% da altura com as legendas dentro, cartão, lista), e só a lista
 * rolava: arrastar em cima de qualquer outra faixa não movia nada, e o mapa
 * ficava com uns 260 pontos de altura para 400 de largura.
 *
 * Agora é UMA `ScrollView`, com tudo dentro dela: cabeçalho, o mapa, as
 * legendas embaixo dele e a lista. O arraste DENTRO do mapa move o mapa (o
 * `MapView` nativo captura o gesto, e no Android ele pede ao pai para não
 * interceptar); fora dele, rola a tela. O mapa mede a largura útil da tela por
 * altura igual (`ladoDoMapa`), com teto em tablet, e as legendas não disputam
 * mais altura com ele.
 *
 * O fim da rolagem reserva a altura do menu inferior: outra frente está
 * tornando o menu flutuante, pairando sobre a tela, e sem a folga a última
 * linha da lista ficaria escondida atrás dele para sempre. A altura vem do
 * contexto que a barra publica (`BottomTabBarHeightContext`), lido com
 * `useContext` e não com `useBottomTabBarHeight()`, porque este ESTOURA fora
 * de uma aba e a tela precisa abrir igual em teste e onde não houver menu.
 */

/** Só o que esta tela precisa saber de uma tarefa para desenhá-la. */
type TarefaNoMapa = Pendencia;

/**
 * QUANTOS ITENS A LISTA MOSTRA de cada vez.
 *
 * Cinco cabe numa tela de aparelho pequeno abaixo do quadrado do mapa sem que
 * a lista pareça infinita, e é mais do que o agente resolve num turno sem
 * voltar aqui. Quem quer ver o resto pede ("Mostrar mais"), e o pino de uma
 * tarefa além da página faz a página crescer até ela, porque um pino que abre
 * um item que não está na tela é um toque que parece não ter feito nada.
 *
 * A página é da LISTA. O mapa é do dia inteiro, sempre: esconder pino seria
 * esconder trabalho.
 */
export const TAMANHO_DA_PAGINA = 5;

/**
 * A GRAVIDADE EM PALAVRA, para o rótulo do pino.
 *
 * Quem ouve a tela não vê nem a cor nem a forma do pino: sem esta frase, o mapa
 * dele é um punhado de botões sem gravidade nenhuma. As palavras são as MESMAS
 * do `SeloSeveridade` ("Severidade crítica", "Severidade ainda não
 * classificada"), e não uma segunda redação: a mesma tarefa lida no pino e no
 * item precisa soar igual, senão parecem duas coisas diferentes.
 */
function gravidadeEmPalavra(severidade: Severidade | null): string {
  return severidade
    ? `Severidade ${ROTULO_SEVERIDADE[severidade].toLowerCase()}`
    : "Severidade ainda não classificada";
}

/**
 * O que a tela sabe do caminho pedido, para UMA tarefa por vez.
 *
 * O caminho é da tarefa e não da tela: trocar de item aberto tira a linha e a
 * frase, e o botão fica no novo. Guardar por tarefa aqui seria duplicar o que
 * `verOCaminho` já guarda no aparelho; a tela só lembra o que está mostrando.
 */
type EstadoDoCaminho =
  | { ocorrenciaId: string; fase: "pedindo" }
  | { ocorrenciaId: string; fase: "tracado"; caminho: Caminho }
  | { ocorrenciaId: string; fase: "indisponivel"; frase: string };

/**
 * O que a folha de "Ver o caminho" oferece, e o que a do pino oferece.
 *
 * As chaves são as mesmas de `RespostaDoMapa` da vistoria onde o ato é o mesmo
 * ("aplicativo" abre o mapa do aparelho nas duas telas, "copiar" copia), para
 * quem lê as duas telas reconhecer o vocabulário.
 */
type RespostaDoCaminho = "aplicativo" | "aqui-dentro" | "copiar";
type RespostaDoPino = "aplicativo" | "vistoria";

/** Qual folha está aberta, e de qual tarefa ela fala. */
type FolhaAberta = { tipo: "caminho" | "pino"; ocorrenciaId: string };

/**
 * QUAL ITEM ESTÁ ABERTO.
 *
 * Três estados e não dois, porque "nenhum" e "ainda não escolhi" são coisas
 * diferentes. A tela abre com a sugerida do dia aberta sem ninguém tocar em
 * nada, e a sugerida só é conhecida depois da leitura do disco: `"sugerida"` é
 * o estado que resolve para ela no momento em que ela existir. Tocar no item
 * aberto recolhe (`"nenhuma"`), e aí nenhum pino fica escolhido. Um `id` que
 * saiu da lista (a coordenação encerrou, outra equipe pegou) volta para a
 * sugerida, para a tela não falar de uma casa que não é mais da conta dele.
 */
type Escolha = "sugerida" | "nenhuma" | { id: string };

/**
 * O recado de UMA resposta da folha, dentro do item que a pediu.
 *
 * "Coordenada copiada" quando copiou; a coordenada em texto quando o aparelho
 * não deixou copiar ou quando nenhum aplicativo de mapas atendeu. Nos dois
 * fracassos os números vão no texto, porque é o que salva a ida: com eles na
 * tela o agente dita por rádio, ou digita onde quiser.
 */
type AvisoDoItem = { ocorrenciaId: string; texto: string; tom: "ok" | "alerta" };

/**
 * A SETA DO ITEM, que diz "isto abre" e vira quando abriu.
 *
 * É o sinal visual da sanfona. Sem ele, um item resumido é um cartão que
 * parece completo, e o agente não descobre que tocar mostra os botões. Vira de
 * ponta-cabeça quando o item está aberto, em transformação com driver nativo,
 * e sem interpolação quando o sistema pediu menos movimento.
 *
 * Desenhada aqui, e não em `icones.tsx`, porque aquele arquivo está com outra
 * frente neste turno. Segue as regras do conjunto (grade de 24, traço de 1,8,
 * sem preenchimento) para o dia em que for morar lá.
 */
const TRACO_DA_SETA = 1.8;
const ROTACAO_DA_SETA_ABERTA = "180deg";

function SetaDoItem({ aberto, cor, reduzir }: { aberto: boolean; cor: string; reduzir: boolean }) {
  const giro = useRef(new Animated.Value(aberto ? 1 : 0)).current;

  useEffect(() => {
    if (reduzir) { giro.setValue(aberto ? 1 : 0); return; }
    Animated.timing(giro, {
      toValue: aberto ? 1 : 0,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [aberto, reduzir, giro]);

  return (
    <Animated.View
      style={{
        transform: [{
          rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", ROTACAO_DA_SETA_ABERTA] }),
        }],
      }}
    >
      <Svg width={tamanhoDeIcone.rotulo} height={tamanhoDeIcone.rotulo} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 9.5l6 6 6-6"
          stroke={cor} strokeWidth={TRACO_DA_SETA} strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * O DETALHE DO ITEM ABERTO, que aparece com opacidade e deslocamento.
 *
 * A altura NÃO é animada, e isso é deliberado: altura não roda no driver
 * nativo, e animá-la no JavaScript é o que engasga numa lista de doze itens
 * num aparelho de entrada. O bloco entra inteiro no leiaute e PINTA em
 * transição (opacidade de 0 a 1, um deslocamento curto para cima), com driver
 * nativo. Com redução de movimento, sem interpolação: o valor vai direto a 1.
 *
 * A chave de redução vem da TELA, por propriedade, e não de um
 * `useReducaoDeMovimento()` próprio: cada instância do gancho nasce em `false`
 * e só sabe a resposta quando a promessa do sistema resolve, o que nunca é o
 * primeiro quadro. Um gancho aqui dentro faria o detalhe animar UMA vez para
 * quem pediu menos movimento, a cada item aberto. A tela já resolveu a chave
 * muito antes de qualquer item ser tocado.
 */
function DetalheDoItem({ children, reduzir }: { children: React.ReactNode; reduzir: boolean }) {
  const presenca = useRef(new Animated.Value(reduzir ? 1 : 0)).current;

  useEffect(() => {
    if (reduzir) { presenca.stopAnimation(); presenca.setValue(1); return; }
    Animated.timing(presenca, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [reduzir, presenca]);

  return (
    <Animated.View
      style={{
        gap: espaco.e2,
        opacity: presenca,
        transform: [{
          translateY: presenca.interpolate({ inputRange: [0, 1], outputRange: [-espaco.e2, 0] }),
        }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * O ITEM DA LISTA: resumo que se toca, e detalhe que aparece embaixo.
 *
 * O resumo é um `Tocavel` e o detalhe é IRMÃO dele, fora do tocável, e isso
 * não é detalhe de leiaute: um `Pressable` com rótulo é um elemento só para o
 * leitor de tela, e botões dentro dele ficam inalcançáveis por voz. Os dois
 * botões precisam ser botões de verdade, cada um com o rótulo dele.
 *
 * É ele que cumpre a outra metade da regra de severidade. O pino leva cor e
 * forma, a legenda embaixo do mapa diz a palavra de cada forma, e aqui a
 * gravidade aparece por extenso, no `SeloSeveridade`, com ícone e nome. Nenhum
 * dos três canais depende de enxergar cor.
 *
 * A distância e o rumo saem de `rotaEsquematica`, com a frase já pronta, e não
 * de uma segunda conta escrita aqui: duas contas para o mesmo fato divergem, e
 * a que diverge é a que manda o agente para o lado errado do morro.
 *
 * No nível do módulo, e não dentro da tela, porque componente declarado dentro
 * de outro é um tipo novo a cada renderização: o React desmonta e remonta a
 * subárvore inteira a cada toque.
 */
function ItemDaTarefa({
  tarefa, aberto, agente, agora, metros, selo, caminho, aviso, reduzir,
  aoAlternar, aoVerOCaminho, aoAbrirVistoria, aoMedir,
}: {
  tarefa: TarefaNoMapa;
  aberto: boolean;
  agente: Ponto | null;
  agora: number;
  metros: number | null;
  selo: string | null;
  /** O estado do caminho DESTA tarefa, ou nada. */
  caminho: EstadoDoCaminho | null;
  /** O recado da última resposta da folha, se foi para esta tarefa. */
  aviso: AvisoDoItem | null;
  /** A chave de redução de movimento, resolvida pela tela. Ver `DetalheDoItem`. */
  reduzir: boolean;
  aoAlternar: () => void;
  aoVerOCaminho: () => void;
  aoAbrirVistoria: () => void;
  /** Onde o item ficou, em pontos, a partir do topo da lista. Ver `rolarAteOItem`. */
  aoMedir: (y: number) => void;
}) {
  const tema = useTema();
  const prazo = quantoFalta(tarefa.prazo_em, agora);
  const data = dataDoPrazo(tarefa.prazo_em);
  const ponto = pontoDaTarefa(tarefa);
  const rota = ponto ? rotaEsquematica(agente, ponto) : null;
  const IconeDoPrazo = prazo.atrasado ? IconePrazoVencido : IconePrazo;
  const corDoPrazo = prazo.atrasado ? tema.perigoTexto : tema.textoDiscreto;

  const ondeFica = !ponto
    ? "A coordenação não informou onde fica este imóvel. O endereço e o ponto de "
      + "referência estão na vistoria, e é por eles que se chega."
    : rota
      ? rota.frase
      : "Sem GPS: sem distância e sem rumo até este imóvel. O endereço e o ponto "
        + "de referência estão na vistoria.";

  /*
    O ESTADO que o leitor de tela anuncia. `expanded` é o que a sanfona é;
    `selected` vai junto porque é o que o iOS anuncia em versões que ainda não
    leem `expanded`.
  */
  const estadoDoItem = { selected: aberto, expanded: aberto };

  /*
    O RÓTULO composto, na ordem em que se decide: qual, quão grave, onde, a
    que distância, quando vence, se já foi feita, e se está aberto. Tudo numa
    frase, porque quem ouve não pode passar o olho pela linha de baixo.
  */
  const rotulo =
    `Protocolo ${tarefa.protocolo}, ${gravidadeEmPalavra(tarefa.severidade).toLowerCase()}, `
    + `${tarefa.endereco}`
    + (metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`)
    + `. ${prazo.texto}`
    + (selo ? `. ${selo}` : "")
    + (aberto ? ". Expandido, mostrando as ações" : ". Recolhido, toque para ver as ações");

  return (
    <View
      testID={`tarefa-${tarefa.id}`}
      onLayout={(e) => { aoMedir(e.nativeEvent.layout.y); }}
      style={{
        borderRadius: raio.cartao,
        borderWidth: aberto ? borda.enfase : borda.fio,
        borderColor: aberto ? tema.destaque : tema.borda,
        backgroundColor: tema.superficie,
        overflow: "hidden",
      }}
    >
      <Tocavel
        testID={`escolher-${tarefa.id}`}
        accessibilityRole="button"
        accessibilityState={estadoDoItem}
        accessibilityLabel={rotulo}
        onPress={aoAlternar}
        estilo={{
          minHeight: toque,
          padding: espaco.e3,
          gap: espaco.e1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          <Txt variante="corpoP" mono negrito>{tarefa.protocolo}</Txt>
          <View style={{ flex: 1 }} />
          <SeloSeveridade severidade={tarefa.severidade} />
          <SetaDoItem aberto={aberto} cor={tema.textoDiscreto} reduzir={reduzir} />
        </View>
        {/*
          Endereço em UMA linha no resumo. Aberto, a linha se solta e mostra o
          endereço inteiro, e o ponto de referência vem no detalhe: é lá que se
          lê para achar a casa.
        */}
        <Txt variante="corpoP" numeroDeLinhas={aberto ? undefined : 1}>{tarefa.endereco}</Txt>
        {(metros !== null || selo) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
            {metros !== null && (
              <Txt nivel="apoio">{`a ${distanciaEmTexto(metros)} de você`}</Txt>
            )}
            {/* O mesmo `Chip` do cartão da lista de tarefas, e não um texto parecido:
                duas peças para o mesmo fato divergem na primeira edição. */}
            {!!selo && <Chip texto={selo} simbolo="✓" tom="ok" />}
          </View>
        )}
      </Tocavel>

      {aberto && (
        <View style={{ paddingHorizontal: espaco.e3, paddingBottom: espaco.e3 }}>
          <DetalheDoItem reduzir={reduzir}>
            {/*
              O PRAZO COM A DATA. "Vence em 9h" não diz ao agente se o prazo
              cai dentro do turno dele ou já na madrugada, e é essa distinção
              que decide se ele sobe hoje ou passa a tarefa. É a mesma linha da
              tela de tarefas, com o mesmo ícone e a mesma cor de atraso.
            */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
              <IconeDoPrazo cor={corDoPrazo} tamanho={tamanhoDeIcone.rotulo} />
              <Txt variante="corpoP" peso={prazo.atrasado ? peso.negrito : peso.forte} cor={corDoPrazo}>
                {prazo.texto}
              </Txt>
              {!!data && <Txt variante="legenda" cor={tema.textoDiscreto}>{data}</Txt>}
            </View>
            {/*
              O PONTO DE REFERÊNCIA é o que faz achar a casa: endereço de morro
              raramente tem placa, e "a casa azul depois da padaria" é o que
              resolve a chegada.
            */}
            {!!tarefa.ponto_referencia && (
              <Txt nivel="apoio">{`Referência: ${tarefa.ponto_referencia}`}</Txt>
            )}
            {/*
              A frase de `rotaEsquematica` traz a distância E o rumo por extenso,
              e é a linha de medida que funciona sem sinal e sem Google. O
              caminho por ruas, quando pedido, entra ABAIXO dela e não no lugar
              dela: se o Google errar, a reta é a segunda opinião que o agente
              tem na tela.
            */}
            <Txt variante="corpoP">{ondeFica}</Txt>
            {caminho?.fase === "tracado" && (
              <Txt variante="corpoP" negrito>{fraseDoCaminho(caminho.caminho)}</Txt>
            )}
            {caminho?.fase === "indisponivel" && (
              <Txt nivel="apoio">{caminho.frase}</Txt>
            )}
            {aviso && (
              aviso.tom === "ok"
                ? (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Chip texto={aviso.texto} simbolo="✓" tom="ok" testID="aviso-do-item" />
                  </View>
                )
                : (
                  <View testID="aviso-do-item">
                    <Txt variante="corpoP" cor={tema.alertaTexto}>{aviso.texto}</Txt>
                  </View>
                )
            )}
            {/*
              "VER O CAMINHO" é `realce` e não `primario`: a ação principal do
              item continua sendo abrir a vistoria, que é o trabalho. O caminho
              é o ato importante que ajuda a chegar. Ele só existe quando há
              para onde: sem coordenada do imóvel, nenhuma das três respostas da
              folha teria o que fazer, e a frase de `ondeFica` já diz por onde
              se chega. A posição do agente NÃO é condição: duas das três
              respostas (mapa do aparelho, copiar) não precisam dela, e a que
              precisa some da folha quando ela falta.

              É um TOQUE de propósito, e depois dele uma PERGUNTA. Cada pedido
              de caminho aqui dentro manda a posição do agente para fora do
              país (ver `docs/SUBPROCESSADORES.md` seção 2.2), e isso é uma
              decisão dele, uma por tarefa, nunca da tela.
            */}
            {ponto ? (
              <LinhaDeAcoes
                acoes={[
                  {
                    titulo: "Ver o caminho",
                    tipo: "realce",
                    testID: "ver-o-caminho",
                    carregando: caminho?.fase === "pedindo",
                    descricao: `Ver o caminho até o protocolo ${tarefa.protocolo}: abre uma escolha entre o mapa do aparelho, o caminho aqui dentro e copiar a coordenada`,
                    onPress: aoVerOCaminho,
                  },
                  {
                    titulo: "Abrir a vistoria",
                    testID: "abrir-a-vistoria",
                    descricao: `Abrir a vistoria do protocolo ${tarefa.protocolo}, ${tarefa.endereco}`,
                    onPress: aoAbrirVistoria,
                  },
                ]}
              />
            ) : (
              <Botao
                titulo="Abrir a vistoria"
                testID="abrir-a-vistoria"
                descricao={`Abrir a vistoria do protocolo ${tarefa.protocolo}, ${tarefa.endereco}`}
                onPress={aoAbrirVistoria}
              />
            )}
          </DetalheDoItem>
        </View>
      )}
    </View>
  );
}

export default function Mapa() {
  const tema = useTema();
  const { width: larguraDaTela } = useWindowDimensions();
  const lado = ladoDoMapa(larguraDaTela);
  /*
    `?? 0` e não `useBottomTabBarHeight()`: aquele gancho ESTOURA fora de uma
    aba ("Couldn't find the bottom tab bar height"), e esta tela precisa abrir
    igual em teste e onde não houver menu. Zero é a folga certa quando não há
    menu nenhum para cobrir a lista.
  */
  const alturaDoMenu = useContext(BottomTabBarHeightContext) ?? 0;
  const { temSinal } = useSinal();
  const { obterToken, lerIdentidade } = useSessao();
  const reduzirMovimento = useReducaoDeMovimento();

  const [tarefas, setTarefas] = useState<TarefaNoMapa[] | null>(null);
  const [coletas, setColetas] = useState<ColetaLocal[]>([]);
  const [itensDaFila, setItensDaFila] = useState<ItemFila[]>([]);
  const [desistiuDeAbrir, setDesistiuDeAbrir] = useState(false);
  /** Qual item está aberto. Ver `Escolha`. */
  const [escolha, setEscolha] = useState<Escolha>("sugerida");
  /** Quantos itens a lista mostra por pedido. Cresce com "Mostrar mais". */
  const [pagina, setPagina] = useState(TAMANHO_DA_PAGINA);
  /** O caminho pedido, de UMA tarefa. Ver `EstadoDoCaminho`. */
  const [caminho, setCaminho] = useState<EstadoDoCaminho | null>(null);
  /** A folha aberta, se alguma. Ver `FolhaAberta`. */
  const [folha, setFolha] = useState<FolhaAberta | null>(null);
  /** O recado da última resposta, no item que a pediu. */
  const [aviso, setAviso] = useState<AvisoDoItem | null>(null);

  /*
    "Coordenada copiada" some sozinha, no mesmo prazo que a vistoria usa para
    o selo dela: é confirmação de um ato curto, e uma confirmação que fica
    passa a parecer estado. O recado de FRACASSO (ninguém atendeu, não deixou
    copiar) fica até a próxima resposta, porque carrega a coordenada em texto
    que o agente ainda vai ditar.
  */
  useEffect(() => {
    if (aviso?.tom !== "ok") return;
    const relogio = setTimeout(() => { setAviso(null); }, movimento.climax * 8);
    return () => { clearTimeout(relogio); };
  }, [aviso]);

  /*
    A ROLAGEM ATÉ O ITEM QUE O PINO ABRIU. "Tem que ser tudo conectado": o
    item fica embaixo do quadrado do mapa, fora da vista, e sem rolar até ele
    o toque no pino parece não ter feito nada depois que a folha fecha.

    A posição vem do LEIAUTE MEDIDO (`onLayout` da lista e do item), e nunca de
    uma conta sobre alturas: o item aberto cresce, o que estava aberto encolhe,
    e o aparelho é o único que sabe onde cada um ficou. Por isso quem rola é
    a medição do item, e não o toque: o item que o pino abre sempre muda de
    altura (o detalhe monta), então ele SEMPRE mede de novo, já no lugar
    final. Tocar no próprio item não rola: o dedo já está nele.
  */
  const rolagem = useRef<ScrollView>(null);
  const posicaoDaLista = useRef(0);
  const posicaoDosItens = useRef(new Map<string, number>());
  const [rolarAte, setRolarAte] = useState<string | null>(null);

  const rolarAteOItem = useCallback((id: string): boolean => {
    const y = posicaoDosItens.current.get(id);
    if (y === undefined) return false;
    rolagem.current?.scrollTo({
      y: Math.max(0, posicaoDaLista.current + y - espaco.e3),
      animated: !reduzirMovimento,
    });
    return true;
  }, [reduzirMovimento]);

  const aoMedirItem = useCallback((id: string, y: number) => {
    posicaoDosItens.current.set(id, y);
    if (rolarAte === id && rolarAteOItem(id)) setRolarAte(null);
  }, [rolarAte, rolarAteOItem]);

  /*
    ONDE O AGENTE ESTÁ, e as duas coisas que esta tela NÃO faz, iguais às da
    lista de tarefas.

    **Não pede permissão.** Quem pede é a vistoria, onde a coordenada é prova e
    a tela explica por quê. Abrir um mapa e levar um pedido de localização na
    cara é o jeito mais rápido de o agente negar para sempre, e negar ali custa
    o carimbo da vistoria, que é o que o laudo precisa.

    **Não liga o GPS.** `getLastKnownPositionAsync` lê a última posição que o
    sistema já tem, sem ligar o rádio e sem gastar bateria. Nula é o caso
    COMUM, e esta tela sabe trabalhar sem ela: sem posição não há distância nem
    rumo, e ela diz isso em vez de estimar.
  */
  const [ondeEstou, setOndeEstou] = useState<Ponto | null>(null);
  const verOndeEstou = useCallback(async () => {
    try {
      const permissao = await Location.getForegroundPermissionsAsync();
      if (!permissao.granted) return;
      const ultima = await Location.getLastKnownPositionAsync();
      if (!ultima) return;
      /*
        O filtro é o MESMO da coordenada da tarefa, e é a mesma função:
        `getLastKnownPositionAsync` devolve 0,0 em aparelho que ainda não fixou,
        em emulador e em aparelho barato com o rádio recém-ligado. Da ilha nula,
        o enquadramento abriria no golfo da Guiné com os pinos a seis mil
        quilômetros, e a tela escreveria a distância como se tivesse medido.
      */
      const novo = pontoQueSeMede(ultima.coords.latitude, ultima.coords.longitude);
      if (!novo) return;
      setOndeEstou((antes) => (
        antes && antes.latitude === novo.latitude && antes.longitude === novo.longitude
          ? antes
          : novo
      ));
    } catch {
      /* Sem localização, a tela fica sem distância e sem rumo, e diz isso. */
    }
  }, []);

  /*
    O TOKEN DO MAPA, e ele é lido UMA vez. Este subsistema veio da tela de
    tarefas junto com o mapa, inteiro, porque ele não é do mapa: é da PROMESSA.

    `useMapaDoMunicipio` pergunta ao servidor se o município autorizou mapa.
    Para ele, token `null` é RESPOSTA ("sem sessão não há a quem perguntar,
    então não mande coordenada para fora"), e não espera. Como o estado nasce
    nulo, a primeira passada decidiria plano esquemático, e a tela afirmaria em
    voz alta "o seu município optou por não enviar coordenada ao Google (...)
    nenhuma informação sai daqui" para, um instante depois, trocar pelo mapa do
    Google.

    Isso não é piscada de interface: a legenda de modo é a seção 2.2 do
    `docs/SUBPROCESSADORES.md` virada tela, e é por ela que o encarregado de
    dados do município confere, olhando, se a coordenada das famílias está
    saindo dali. Uma legenda que se desmente já disse uma coisa falsa, para
    justamente quem tem competência para reclamar.

    `MapaDaVistoria` resolve isso montando o mapa só depois de o token estar
    lido. Aqui o caminho é o mesmo dito de outro jeito: enquanto não lemos, a
    decisão que vai para a tela é `null`, que é o "ainda não sei" que
    `MapaDoImovel` desenha como espera com porta de saída.
  */
  const [tokenDoMapa, setTokenDoMapa] = useState<string | null>(null);
  const [tokenLido, setTokenLido] = useState(false);
  const mapa = useMapaDoMunicipio(tokenDoMapa);
  const mapaDaTela = tokenLido ? mapa : { ...mapa, decisao: null };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const token = await obterToken();
        if (vivo) setTokenDoMapa(token ?? null);
      } catch {
        /* Sem token não há mapa do Google, e é a resposta segura. */
      } finally {
        /*
          No `finally`, e não só no caminho que deu certo: a leitura que falhou
          TAMBÉM é uma leitura terminada, e deixar a tela esperando para sempre
          por uma resposta que não vem é trocar uma legenda falsa por uma roda
          eterna.
        */
        if (vivo) setTokenLido(true);
      }
    })();
    return () => { vivo = false; };
  }, [obterToken]);

  /*
    Relógio da tela, para o prazo não congelar enquanto o aparelho fica aberto
    em cima do painel do carro. Trinta segundos é bem mais curto que a menor
    faixa que `quantoFalta` distingue, então nunca dá para ver a frase errada.
  */
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  /*
    A LEITURA DO DISCO, e ela é a MESMA que a tela de tarefas faz.

    As três fontes são as três entradas da ordem do dia: o que a coordenação
    despachou, o que já foi coletado neste aparelho e o que está na fila (é dela
    que sai a devolução a caminho, que tira a tarefa da lista das duas telas).
    Falhar aqui não pode custar a tela: sem leitura, o agente fica sem o mapa,
    que é a única coisa que ele veio buscar.
  */
  const lendoODisco = useRef(false);
  const lerDoDisco = useCallback(async () => {
    if (lendoODisco.current) return;
    lendoODisco.current = true;
    try {
      const [guardadas, coletadas] = await Promise.all([
        pendenciasGuardadas(), listarColetas(),
      ]);
      let naFila: ItemFila[] = [];
      try {
        const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
        naFila = await fila.itens();
      } catch {
        /*
          Sem a fila, o mapa desenha o que está no disco. O preço está dito: uma
          devolução que acabou de entrar na fila continuaria com pino por mais
          um foco. Errar para esse lado mostra trabalho a mais; errar para o
          outro (não desenhar nada) esconde o dia inteiro.
        */
      }
      setTarefas(guardadas);
      setColetas(coletadas);
      setItensDaFila(naFila);
    } finally {
      lendoODisco.current = false;
    }
  }, [obterToken, lerIdentidade]);

  useFocusEffect(useCallback(() => {
    void lerDoDisco();
    /*
      A posição é relida no FOCO, e não a cada quadro. Entrar nesta tela é o
      momento exato em que o agente quer saber onde ele está em relação ao
      trabalho; seguir o GPS em tempo real reordenaria a lista e mexeria o mapa
      debaixo do dedo dele, que é o defeito que a tela de tarefas passou uma
      onda inteira consertando.
    */
    void verOndeEstou();
  }, [lerDoDisco, verOndeEstou]));

  const naLista = useMemo(
    () => tarefasDoDia(tarefas ?? [], itensDaFila),
    [tarefas, itensDaFila],
  );
  const jaColetadas = useMemo(() => coletadasNoAparelho(coletas), [coletas]);
  const oDia = useMemo(
    () => ordemDoDia(naLista, { agora: agora.getTime(), de: ondeEstou, jaColetadas }),
    [naLista, agora, ondeEstou, jaColetadas],
  );

  /** Metros até cada tarefa, quando há como medir. Para o item não recalcular. */
  const distancias = useMemo(
    () => new Map(oDia.lugares.map((l) => [l.tarefa.id, l.distanciaM])),
    [oDia],
  );
  const lapides = useMemo(
    () => new Map(coletas.map((c) => [c.ocorrenciaId, c])),
    [coletas],
  );

  /*
    O ITEM ABERTO, resolvido a partir da escolha. Ver `Escolha`: a sugerida
    quando ninguém tocou em nada ou quando a escolhida saiu da lista; nenhum
    quando o agente recolheu.
  */
  const aberta = escolha === "nenhuma"
    ? null
    : escolha === "sugerida"
      ? oDia.sugerida
      : (oDia.ordenadas.find((t) => t.id === escolha.id) ?? oDia.sugerida);

  /*
    A PÁGINA cresce até o item aberto. Um pino tocado além da página abre um
    item que ninguém veria; com isto o item está na tela, e o "Mostrar mais"
    continua contando o que falta a partir dele.
  */
  const indiceDaAberta = aberta ? oDia.ordenadas.findIndex((t) => t.id === aberta.id) : -1;
  const visiveis = Math.min(oDia.ordenadas.length, Math.max(pagina, indiceDaAberta + 1));
  const mostradas = oDia.ordenadas.slice(0, visiveis);
  const restantes = oDia.ordenadas.length - visiveis;

  /*
    O CAMINHO É DA TAREFA: o que está na tela só vale para o item aberto.
    Trocar de item tira a linha e a frase, e o botão fica no novo.
  */
  const caminhoDaAberta = caminho && aberta && caminho.ocorrenciaId === aberta.id
    ? caminho
    : null;

  /** Abre ou recolhe um item, e escolhe o pino dele. */
  const alternar = useCallback((id: string) => {
    setEscolha((antes) => {
      const abertaAgora = antes === "nenhuma"
        ? null
        : antes === "sugerida" ? oDia.sugerida?.id ?? null : antes.id;
      return abertaAgora === id ? "nenhuma" : { id };
    });
  }, [oDia.sugerida]);

  const abrirVistoria = useCallback((id: string) => {
    router.push({ pathname: "/(agente)/vistoria/[id]", params: { id } });
  }, []);

  const pedirOCaminho = useCallback(async (tarefa: TarefaNoMapa, destino: Ponto) => {
    if (!ondeEstou) return;
    const ocorrenciaId = tarefa.id;
    /*
      SEM SINAL, a frase sai na hora e nada é tentado. `useSinal` pode estar
      atrasado em relação ao rádio, e por isso a tentativa também trata a
      rejeição de rede; mas quando ele já sabe que não há sinal, gastar doze
      segundos de espera para descobrir a mesma coisa é o que faz o agente
      concluir que o botão não funciona.
    */
    if (!temSinal) {
      setCaminho({ ocorrenciaId, fase: "indisponivel", frase: FRASE_DA_INDISPONIBILIDADE["sem-sinal"] });
      return;
    }
    setCaminho({ ocorrenciaId, fase: "pedindo" });
    try {
      const token = await obterToken();
      if (!token) throw new CaminhoIndisponivel("falhou");
      const { caminho: tracado } = await verOCaminho({
        ocorrenciaId, token, origem: ondeEstou, destino,
      });
      setCaminho({ ocorrenciaId, fase: "tracado", caminho: tracado });
    } catch (erro) {
      const frase = erro instanceof CaminhoIndisponivel
        ? erro.message
        : FRASE_DA_INDISPONIBILIDADE.falhou;
      setCaminho({ ocorrenciaId, fase: "indisponivel", frase });
    }
  }, [ondeEstou, temSinal, obterToken]);

  /**
   * Entrega a coordenada da tarefa ao mapa do aparelho, com rota, e diz quando
   * ninguém atendeu. A coordenada vai no texto do aviso, e isso é o que salva
   * a ida: com os números na tela o agente dita por rádio, ou digita onde
   * quiser.
   */
  const abrirNoAparelho = useCallback(async (tarefa: TarefaNoMapa, ponto: Ponto) => {
    setAviso(null);
    const abriu = await abrirNoMapa(ponto.latitude, ponto.longitude, tarefa.endereco);
    if (abriu) return;
    setAviso({
      ocorrenciaId: tarefa.id,
      tom: "alerta",
      texto: "Nenhum aplicativo de mapas atendeu neste aparelho. A coordenada é "
        + `${coordenadaEmTexto(ponto.latitude, ponto.longitude)}.`,
    });
  }, []);

  const copiar = useCallback(async (tarefa: TarefaNoMapa, ponto: Ponto) => {
    setAviso(null);
    const copiou = await copiarCoordenada(ponto.latitude, ponto.longitude);
    if (copiou) {
      retornoTatil("confirmado");
      setAviso({ ocorrenciaId: tarefa.id, tom: "ok", texto: "Coordenada copiada" });
      return;
    }
    /*
      Recusa da área de transferência acontece em telefone gerenciado por
      política da prefeitura. Dizer só "não deu" deixaria o agente sem nada.
    */
    setAviso({
      ocorrenciaId: tarefa.id,
      tom: "alerta",
      texto: "Este aparelho não deixou copiar. A coordenada é "
        + `${coordenadaEmTexto(ponto.latitude, ponto.longitude)}.`,
    });
  }, []);

  /*
    OS PINOS, que são as tarefas da lista que TÊM ponto, na ordem da lista.

    `pontoDaTarefa` é `pontoQueSeMede` aplicado à ocorrência: coordenada nula,
    ilegível ou 0,0 não é ponto, é ausência de ponto. Um pino na ilha nula seria
    o mapa afirmando um lugar que ninguém informou, e ele arrastaria o
    enquadramento de todos os outros para o meio do Atlântico.

    O toque no pino faz DUAS coisas: abre o item dele na lista (para a tela
    ficar coerente quando a folha fechar) e abre a folha que pergunta o que
    fazer com ele.
  */
  const pinos = useMemo<PinoNoMapa[]>(() => oDia.ordenadas.flatMap((t) => {
    const ponto = pontoDaTarefa(t);
    if (!ponto) return [];
    const prazo = quantoFalta(t.prazo_em, agora.getTime());
    const metros = distancias.get(t.id) ?? null;
    return [{
      id: t.id,
      ponto,
      severidade: t.severidade,
      escolhido: aberta?.id === t.id,
      /*
        O pino é UM elemento para quem ouve a tela, e o rótulo dele carrega o
        que o item vai mostrar: protocolo, endereço, prazo e distância, e o que
        o toque faz. Sem isso, quem navega por leitor de tela ouviria "botão"
        numa figura no meio de um mapa e teria que tocar para descobrir o que é.
      */
      rotulo:
        `Protocolo ${t.protocolo}, ${t.endereco}. ${gravidadeEmPalavra(t.severidade)}`
        + `. ${prazo.texto}`
        + (metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`)
        + ". Abre a escolha entre o mapa do aparelho e a vistoria",
      aoTocar: () => {
        setEscolha({ id: t.id });
        setFolha({ tipo: "pino", ocorrenciaId: t.id });
        setRolarAte(t.id);
      },
    }];
  }), [oDia, agora, distancias, aberta]);

  const semCoordenada = naLista.length - pinos.length;

  /*
    A TAREFA DE QUE A FOLHA FALA, e o ponto dela. Resolvida a partir da lista
    de agora, e não guardada: se a tarefa sair da lista com a folha aberta, a
    folha fecha sozinha em vez de agir sobre uma casa que não é mais dele.
  */
  const tarefaDaFolha = folha ? oDia.ordenadas.find((t) => t.id === folha.ocorrenciaId) ?? null : null;
  const pontoDaFolha = tarefaDaFolha ? pontoDaTarefa(tarefaDaFolha) : null;
  const assuntoDaFolha = tarefaDaFolha
    ? `Protocolo ${tarefaDaFolha.protocolo}, ${tarefaDaFolha.endereco}`
    : "";

  /*
    AS RESPOSTAS DE "VER O CAMINHO". "Traçar aqui dentro" só entra quando há de
    onde traçar: sem posição do agente a resposta não teria o que fazer, e uma
    opção que explica "não dá" é uma opção a mais para o polegar errar.
  */
  const opcoesDoCaminho = useMemo(() => {
    const coordenada = pontoDaFolha ? coordenadaEmTexto(pontoDaFolha.latitude, pontoDaFolha.longitude) : "";
    const noAparelho: OpcaoDaFolha<RespostaDoCaminho> = {
      chave: "aplicativo",
      testID: "caminho-no-aparelho",
      titulo: "Abrir no mapa do aparelho",
      detalhe:
        "Sai do DC360 e abre a rota até lá no aplicativo de mapas do aparelho, com "
        + "voz e trânsito. Esta tela fica como está quando você voltar.",
      desenho: (cor) => <IconeAparelho cor={cor} tamanho={tamanhoDeIcone.acao} />,
    };
    const aquiDentro: OpcaoDaFolha<RespostaDoCaminho> = {
      chave: "aqui-dentro",
      testID: "caminho-aqui-dentro",
      titulo: "Traçar o caminho aqui dentro",
      detalhe:
        "Desenha o caminho por ruas neste mapa, com o tempo de carro e a distância, "
        + "sem sair do aplicativo. A sua posição sai do aparelho para isso.",
      desenho: (cor) => <IconeGps cor={cor} tamanho={tamanhoDeIcone.acao} />,
    };
    const copiarACoordenada: OpcaoDaFolha<RespostaDoCaminho> = {
      chave: "copiar",
      testID: "caminho-copiar",
      titulo: "Copiar a coordenada",
      detalhe: `Copia ${coordenada} para colar em outro aplicativo, ou para ditar por rádio.`,
      desenho: (cor) => <IconeLocalizacao cor={cor} tamanho={tamanhoDeIcone.acao} />,
    };
    return (ondeEstou
      ? [noAparelho, aquiDentro, copiarACoordenada]
      : [noAparelho, copiarACoordenada]) as [
        OpcaoDaFolha<RespostaDoCaminho>, OpcaoDaFolha<RespostaDoCaminho>, ...OpcaoDaFolha<RespostaDoCaminho>[],
      ];
  }, [pontoDaFolha, ondeEstou]);

  const opcoesDoPino: [OpcaoDaFolha<RespostaDoPino>, OpcaoDaFolha<RespostaDoPino>] = [
    {
      chave: "aplicativo",
      testID: "pino-no-aparelho",
      titulo: "Abrir no mapa do aparelho",
      detalhe:
        "Sai do DC360 e abre este ponto no aplicativo de mapas do aparelho, com a "
        + "rota até lá. Esta tela fica como está quando você voltar.",
      desenho: (cor) => <IconeAparelho cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
    {
      chave: "vistoria",
      testID: "pino-abrir-vistoria",
      titulo: "Abrir a vistoria",
      detalhe: "Vai para a vistoria deste protocolo, sem sair do aplicativo.",
      desenho: (cor) => <IconeTarefas cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
  ];

  const responderCaminho = useCallback((resposta: RespostaDoCaminho) => {
    if (!tarefaDaFolha || !pontoDaFolha) return;
    if (resposta === "aplicativo") { void abrirNoAparelho(tarefaDaFolha, pontoDaFolha); return; }
    if (resposta === "aqui-dentro") { void pedirOCaminho(tarefaDaFolha, pontoDaFolha); return; }
    void copiar(tarefaDaFolha, pontoDaFolha);
  }, [tarefaDaFolha, pontoDaFolha, abrirNoAparelho, pedirOCaminho, copiar]);

  const responderPino = useCallback((resposta: RespostaDoPino) => {
    if (!tarefaDaFolha) return;
    if (resposta === "vistoria") { abrirVistoria(tarefaDaFolha.id); return; }
    if (pontoDaFolha) void abrirNoAparelho(tarefaDaFolha, pontoDaFolha);
  }, [tarefaDaFolha, pontoDaFolha, abrirVistoria, abrirNoAparelho]);

  const fecharFolha = useCallback(() => { setFolha(null); }, []);

  if (tarefas === null) {
    if (!desistiuDeAbrir) {
      return (
        <Carregando
          mensagem="Abrindo o mapa das suas tarefas"
          rotuloDaSaida="Parar de esperar"
          aoDesistir={() => { setDesistiuDeAbrir(true); }}
        />
      );
    }
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Vazio
          titulo="O mapa ainda não abriu"
          descricao="A leitura do aparelho não terminou. Nada foi perdido: o que estava guardado continua guardado."
          icone={<IconeLocalizacao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.vazio} />}
          acao={{
            titulo: "Tentar de novo",
            testID: "tentar-abrir-o-mapa",
            descricao: "Tentar abrir o mapa das suas tarefas de novo",
            onPress: () => { setDesistiuDeAbrir(false); void lerDoDisco(); },
          }}
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={rolagem}
        testID="tela-do-mapa"
        style={{ flex: 1 }}
        /*
          O fim da rolagem reserva a altura do menu inferior, mais o recuo da
          tela. Ver o parágrafo "A TELA INTEIRA ROLA" no topo deste arquivo.
        */
        contentContainerStyle={{
          paddingHorizontal: espaco.e4,
          paddingTop: espaco.e4,
          paddingBottom: alturaDoMenu + espaco.e4,
          gap: espaco.e3,
        }}
        /*
          Sem `keyboardShouldPersistTaps`, e sem `nestedScrollEnabled`: não há
          campo de texto aqui, e o mapa não é uma rolagem aninhada. No Android o
          `MapView` pede ao pai para não interceptar o toque no primeiro contato,
          então o arraste dentro do mapa move o mapa e o de fora move a tela.
        */
      >
        <View style={{ gap: espaco.e2 }}>
          {/*
            O NÚMERO É O MESMO DA TELA DE TAREFAS, e o rótulo também.

            Ele conta a lista inteira, e não os pinos: quem some do mapa por não
            ter coordenada continua sendo trabalho do dia, e um cabeçalho que
            contasse só o que cabe no desenho faria as duas telas discordarem
            sobre a única pergunta que decide o turno.
          */}
          <Dado
            testID="quantas-no-mapa"
            valor={String(naLista.length)}
            rotulo={naLista.length === 1 ? "vistoria para fazer" : "vistorias para fazer"}
          />
          {/*
            A HONESTIDADE DA ORDEM, no mesmo texto que a lista usa. Sem GPS, uma
            ordem por urgência se apresentaria como se também tivesse considerado
            o caminho, e o agente decidiria por onde subir o morro confiando nisso.
          */}
          {!oDia.usouDistancia && naLista.length > 0 && (
            <Txt nivel="apoio">{AVISO_SEM_DISTANCIA}</Txt>
          )}
          {semCoordenada > 0 && (
            <Txt nivel="apoio">
              {`${semCoordenada} de ${naLista.length} sem coordenada: `
                + (semCoordenada === 1 ? "ela aparece" : "elas aparecem")
                + " na lista, não no mapa."}
            </Txt>
          )}
        </View>

        <View testID="area-do-mapa">
          {pinos.length > 0 ? (
            <MapaDoImovel
              pinos={pinos}
              agente={ondeEstou}
              mapa={mapaDaTela}
              /*
                O QUADRADO: a largura útil por altura igual. As legendas vêm
                embaixo, fora dele, desenhadas pela própria peça.
              */
              altura={lado}
              /*
                A linha do caminho, só quando ele foi pedido e traçado, e só
                para o item aberto. No plano esquemático a peça não a desenha.
              */
              caminho={caminhoDaAberta?.fase === "tracado" ? caminhoDaAberta.caminho.pontos : null}
            />
          ) : (
            /*
              O estado vazio ocupa a mesma altura do quadrado, para a tela não
              saltar quando a primeira tarefa com coordenada chegar, e centra o
              aviso nela: um texto espremido no alto de um vão parece defeito.
            */
            <View style={{ minHeight: lado, justifyContent: "center" }}>
              <Vazio
                titulo={
                  naLista.length === 0
                    ? "Nenhuma vistoria designada"
                    : "Nenhuma tarefa sua tem coordenada"
                }
                descricao={
                  naLista.length === 0
                    ? "Quando a coordenação despachar uma ocorrência para a sua equipe, ela aparece aqui."
                    : "A coordenação não informou onde ficam estes imóveis. O endereço e o ponto "
                      + "de referência estão em cada vistoria, e é por eles que se chega."
                }
                icone={
                  naLista.length === 0
                    ? <IconeTarefas cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.vazio} />
                    : <IconeLocalizacao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.vazio} />
                }
              />
            </View>
          )}
        </View>

        {/*
          A LISTA, que é a mesma lista da tela de tarefas, e é a superfície
          desta tela: o resumo de cada uma, e o detalhe com os botões no item
          aberto. Ver "A lista é a superfície" no topo deste arquivo.

          Ela existe aqui porque o mapa responde "onde" e não responde "em que
          ordem": a ordem do dia é uma sequência, e sequência se lê em lista. E
          porque a tarefa sem coordenada não tem pino: sem a lista, ela
          desapareceria desta tela, que é exatamente o tipo de sumiço silencioso
          que este produto não pode ter.

          Não rola sozinha: ela é parte da rolagem única da tela. Uma lista que
          rolasse dentro da tela que rola é o defeito que o reclame descreveu.
        */}
        <View
          testID="lista-do-mapa"
          onLayout={(e) => { posicaoDaLista.current = e.nativeEvent.layout.y; }}
          style={{ gap: espaco.e3 }}
        >
          {mostradas.map((t) => (
            <ItemDaTarefa
              key={t.id}
              tarefa={t}
              aberto={aberta?.id === t.id}
              agente={ondeEstou}
              agora={agora.getTime()}
              metros={distancias.get(t.id) ?? null}
              selo={seloDaColeta(lapides.get(t.id) ?? null)}
              caminho={aberta?.id === t.id ? caminhoDaAberta : null}
              aviso={aviso?.ocorrenciaId === t.id ? aviso : null}
              reduzir={reduzirMovimento}
              aoMedir={(y) => { aoMedirItem(t.id, y); }}
              aoAlternar={() => { alternar(t.id); }}
              aoVerOCaminho={() => { setFolha({ tipo: "caminho", ocorrenciaId: t.id }); }}
              aoAbrirVistoria={() => { abrirVistoria(t.id); }}
            />
          ))}
          {restantes > 0 && (
            <View style={{ gap: espaco.e2 }}>
              <View testID="quantas-na-pagina">
                <Txt nivel="apoio" alinhamento="center">
                  {`${visiveis} de ${oDia.ordenadas.length} vistorias na lista`}
                </Txt>
              </View>
              <Botao
                titulo={`Mostrar mais ${Math.min(restantes, TAMANHO_DA_PAGINA)}`}
                tipo="secundario"
                testID="mostrar-mais"
                descricao={`Mostrar mais ${Math.min(restantes, TAMANHO_DA_PAGINA)} vistorias na lista, que tem ${oDia.ordenadas.length}`}
                onPress={() => { setPagina(visiveis + TAMANHO_DA_PAGINA); }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/*
        AS DUAS FOLHAS, fora da rolagem porque são modais. Cada uma só existe
        com uma tarefa e um ponto resolvidos: uma folha que oferecesse "copiar a
        coordenada" para uma tarefa sem coordenada estaria oferecendo copiar o
        nada, e o pino só existe para quem tem ponto.

        A saída nomeia o que faz ("Continuar no mapa"), pela mesma razão que a
        da vistoria diz "Continuar na vistoria": "Cancelar" num aplicativo de
        campo é ambíguo do jeito mais caro.
      */}
      {tarefaDaFolha && pontoDaFolha && (
        <FolhaDeEscolha
          aberto={folha?.tipo === "caminho"}
          testID="folha-do-caminho"
          titulo="Como chegar até lá?"
          assunto={assuntoDaFolha}
          opcoes={opcoesDoCaminho}
          saida={{ titulo: "Continuar no mapa", testID: "caminho-continuar" }}
          aoEscolher={responderCaminho}
          aoFechar={fecharFolha}
        />
      )}
      {tarefaDaFolha && pontoDaFolha && (
        <FolhaDeEscolha
          aberto={folha?.tipo === "pino"}
          testID="folha-do-pino"
          titulo="O que fazer com esta tarefa?"
          assunto={assuntoDaFolha}
          opcoes={opcoesDoPino}
          saida={{ titulo: "Continuar no mapa", testID: "pino-continuar" }}
          aoEscolher={responderPino}
          aoFechar={fecharFolha}
        />
      )}
    </>
  );
}
