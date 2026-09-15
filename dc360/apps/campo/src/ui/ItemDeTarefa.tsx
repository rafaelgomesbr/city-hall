import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { dataDoPrazo, quantoFalta } from "@dc360/campo";
import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";

import { distanciaEmTexto, rotaEsquematica, type Ponto } from "../dados/mapa";
import { pontoDaTarefa } from "../dados/ordem-do-dia";
import { Chip, SeloSeveridade } from "./Chip";
import { Botao, Tocavel, Txt, useTema } from "./componentes";
import { IconePrazo, IconePrazoVencido, IconeVulnerabilidade } from "./icones";
import {
  borda, easing, elevacao, espaco, icone as tamanhoDeIcone, movimento, peso, raio, toque,
} from "./tokens";

/**
 * O ITEM DE TAREFA EM SANFONA: resumo que se toca, detalhe que aparece embaixo.
 *
 * ## Por que é uma peça, e não um pedaço de cada tela
 *
 * Ele nasceu dentro da tela do mapa, em 15/09/2026, como resposta a uma
 * reclamação de redundância de quem paga ("mostra o item expandido com os
 * botões e abaixo o mesmo item só que resumido. Minha proposta: fazer uma
 * lista paginada com itens resumidos e ao expandir mostrar os botões"). Ele
 * aprovou o desenho no mapa e pediu o mesmo na tela de tarefas, na letra: "na
 * tela tarefas o item da tarefa deve aparecer fechado na lista paginada, e só
 * ao clicar nele ele expande e mostra os detalhes e os btns abrir vistoria e
 * tudo mais".
 *
 * Duas telas dizendo "minhas tarefas" já consomem a MESMA regra de ordem
 * (`dados/ordem-do-dia.ts`), pela razão escrita lá: duas cópias divergem, e a
 * que diverge é a que ninguém abre. O desenho do item obedece à mesma lógica.
 * Se o resumo da tela de tarefas dissesse o protocolo de um jeito e o do mapa
 * de outro, a mesma tarefa pareceria duas coisas diferentes conforme a aba.
 *
 * A peça sabe o que TODA tarefa tem (protocolo, severidade, endereço, prazo,
 * referência, coordenada, o selo da coleta, se está começada, se há
 * vulnerabilidade) e desenha isso igual nas duas telas. O que é de cada tela
 * entra por três portas: o `cabecalho` acima do protocolo (a lista de tarefas
 * põe "Comece por aqui" na sugerida), o `titulo` que abre o detalhe (o tipo
 * COBRADE) e os `children`, que são o resto do detalhe e os botões (o mapa
 * põe "Ver o caminho", a lista põe "Enviar agora" e "Devolver").
 *
 * ## O resumo é um `Tocavel`, e o detalhe é IRMÃO dele
 *
 * Não é detalhe de leiaute: um `Pressable` com rótulo é um elemento só para o
 * leitor de tela, e botões dentro dele ficam inalcançáveis por voz. Os botões
 * precisam ser botões de verdade, cada um com o rótulo dele, fora do resumo.
 *
 * O resumo cumpre a regra de severidade: a gravidade aparece por extenso, no
 * `SeloSeveridade`, com ícone e nome, e nada aqui depende de enxergar cor.
 *
 * A distância e o rumo saem de `rotaEsquematica`, com a frase já pronta, e
 * não de uma segunda conta escrita aqui: duas contas para o mesmo fato
 * divergem, e a que diverge é a que manda o agente para o lado errado do
 * morro.
 */

/** Só o que a peça precisa saber de uma tarefa. `Pendencia` serve inteira. */
export type TarefaDoItem = {
  id: string;
  protocolo: string;
  severidade: Severidade | null;
  endereco: string;
  ponto_referencia: string | null;
  prazo_em: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * QUANTOS ITENS A LISTA MOSTRA de cada vez.
 *
 * Cinco cabe numa tela de aparelho pequeno sem que a lista pareça infinita, e
 * é mais do que o agente resolve num turno sem voltar à lista. Quem quer ver o
 * resto pede ("Mostrar mais"), e o item aberto além da página faz a página
 * crescer até ele, porque abrir um item que não está na tela é um toque que
 * parece não ter feito nada.
 *
 * A página é do DESENHO. O cabeçalho conta a lista inteira, e o mapa desenha
 * o dia inteiro: esconder trabalho seria esconder trabalho.
 */
export const TAMANHO_DA_PAGINA = 5;

/**
 * QUAL ITEM ESTÁ ABERTO.
 *
 * Três estados e não dois, porque "nenhum" e "ainda não escolhi" são coisas
 * diferentes. A tela abre com a sugerida do dia aberta sem ninguém tocar em
 * nada, e a sugerida só é conhecida depois da leitura do disco: `"sugerida"` é
 * o estado que resolve para ela no momento em que ela existir. Tocar no item
 * aberto recolhe (`"nenhuma"`). Um `id` que saiu da lista (a coordenação
 * encerrou, outra equipe pegou) volta para a sugerida, para a tela não falar
 * de uma casa que não é mais da conta dele.
 */
export type Escolha = "sugerida" | "nenhuma" | { id: string };

/** O item aberto, resolvido a partir da escolha e da lista de agora. */
export function itemAberto<T extends { id: string }>(
  escolha: Escolha,
  ordenadas: readonly T[],
  sugerida: T | null,
): T | null {
  if (escolha === "nenhuma") return null;
  if (escolha === "sugerida") return sugerida;
  return ordenadas.find((t) => t.id === escolha.id) ?? sugerida;
}

/**
 * O que o toque num item faz com a escolha: abre ele, ou recolhe se era ele
 * que estava aberto. Compara com o item RESOLVIDO, e não com o `id` guardado:
 * se a escolhida saiu da lista, o que está aberto na tela é a sugerida, e é
 * ela que o toque precisa recolher.
 */
export function alternarEscolha<T extends { id: string }>(
  antes: Escolha,
  id: string,
  ordenadas: readonly T[],
  sugerida: T | null,
): Escolha {
  return itemAberto(antes, ordenadas, sugerida)?.id === id ? "nenhuma" : { id };
}

/**
 * Quantos itens a lista desenha: a página, ou até o item aberto, e nunca mais
 * que a lista. `indiceDaAberta` é `-1` quando nenhum está aberto.
 */
export function quantasMostrar(total: number, pagina: number, indiceDaAberta: number): number {
  return Math.min(total, Math.max(pagina, indiceDaAberta + 1));
}

/**
 * A GRAVIDADE EM PALAVRA, para rótulos.
 *
 * Quem ouve a tela não vê nem a cor nem a forma do selo ou do pino. As
 * palavras são as MESMAS do `SeloSeveridade` ("Severidade crítica",
 * "Severidade ainda não classificada"), e não uma segunda redação: a mesma
 * tarefa lida no pino e no item precisa soar igual.
 */
export function gravidadeEmPalavra(severidade: Severidade | null): string {
  return severidade
    ? `Severidade ${ROTULO_SEVERIDADE[severidade].toLowerCase()}`
    : "Severidade ainda não classificada";
}

/**
 * A SETA DO ITEM, que diz "isto abre" e vira quando abriu.
 *
 * É o sinal visual da sanfona. Sem ele, um item resumido é um cartão que
 * parece completo, e o agente não descobre que tocar mostra os botões. Vira
 * de ponta-cabeça quando o item está aberto, em transformação com driver
 * nativo, e sem interpolação quando o sistema pediu menos movimento.
 *
 * Ela só anima na MUDANÇA, nunca na montagem. Numa `FlatList` o item monta e
 * desmonta conforme a lista rola, e uma animação de zero para zero a cada
 * montagem é trabalho na thread de interface que ninguém vê.
 *
 * Desenhada aqui, e não em `icones.tsx`, porque aquele arquivo está com outra
 * frente. Segue as regras do conjunto (grade de 24, traço de 1,8, sem
 * preenchimento) para o dia em que for morar lá.
 */
const TRACO_DA_SETA = 1.8;
const ROTACAO_DA_SETA_ABERTA = "180deg";

function SetaDoItem({ aberto, cor, reduzir }: { aberto: boolean; cor: string; reduzir: boolean }) {
  const giro = useRef(new Animated.Value(aberto ? 1 : 0)).current;
  const desenhado = useRef(aberto);

  useEffect(() => {
    if (desenhado.current === aberto) return;
    desenhado.current = aberto;
    if (reduzir) { giro.stopAnimation(); giro.setValue(aberto ? 1 : 0); return; }
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
 *
 * `primeiraPintura` é a outra chave que só a tela sabe: a lista de tarefas
 * abre com a sugerida do dia já aberta, e a primeira pintura daquela tela não
 * anima nada (vinte itens entrando ao mesmo tempo é o engasgo que o
 * `CLAUDE.md` proíbe, e a lista abrindo não é nada chegando). O detalhe que
 * nasce junto com a tela obedece à mesma regra: aparece pronto.
 */
function DetalheDoItem({ children, reduzir, primeiraPintura }: {
  children: ReactNode;
  reduzir: boolean;
  primeiraPintura: boolean;
}) {
  const semTransicao = reduzir || primeiraPintura;
  const presenca = useRef(new Animated.Value(semTransicao ? 1 : 0)).current;
  /* A entrada acontece UMA vez. Sem esta trava, a tela trocar `primeiraPintura`
     de verdadeiro para falso no quadro seguinte reanimaria um detalhe que já
     está inteiro na tela. */
  const entrou = useRef(semTransicao);

  useEffect(() => {
    if (reduzir) { presenca.stopAnimation(); presenca.setValue(1); entrou.current = true; return; }
    if (entrou.current) return;
    entrou.current = true;
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

export function ItemDeTarefa({
  tarefa, aberto, agora, agente, metros, selo, comecada = false, vulneravel = false,
  reduzir, primeiraPintura = false, nivel = "cartao", cabecalho, cabecalhoEmPalavras, titulo,
  children, aoAlternar, aoMedir,
}: {
  tarefa: TarefaDoItem;
  aberto: boolean;
  /** O relógio da tela, em milissegundos. */
  agora: number;
  /** Onde o agente está, ou nada. Sem ele não há rumo nem distância. */
  agente: Ponto | null;
  /** Metros até o agente, já medidos pela ordem do dia, ou nada. */
  metros: number | null;
  /** O selo da coleta (`seloDaColeta`), ou nada. */
  selo: string | null;
  /** Há rascunho de vistoria desta tarefa neste aparelho. */
  comecada?: boolean;
  /** Há quem precise de cuidado prioritário neste endereço. */
  vulneravel?: boolean;
  /** A chave de redução de movimento, resolvida pela tela. Ver `DetalheDoItem`. */
  reduzir: boolean;
  /** A tela está na primeira pintura: nada entra animado. Ver `DetalheDoItem`. */
  primeiraPintura?: boolean;
  /** A elevação da caixa. A sugerida da lista sobe um degrau. */
  nivel?: "cartao" | "flutuante";
  /** O que a tela põe ACIMA do protocolo, dentro do resumo. */
  cabecalho?: ReactNode;
  /** O que o cabeçalho diz, para quem ouve: o resumo é um elemento só. */
  cabecalhoEmPalavras?: string;
  /** O que abre o detalhe, quando a tela tem um título para a tarefa. */
  titulo?: string;
  /** O resto do detalhe e os botões, que são da tela. */
  children?: ReactNode;
  aoAlternar: () => void;
  /** Onde o item ficou, em pontos, a partir do topo da lista. Para rolar até ele. */
  aoMedir?: (y: number) => void;
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
    que distância, quando vence, o que já se sabe dela, e se está aberto. Tudo
    numa frase, porque quem ouve não pode passar o olho pela linha de baixo.
  */
  const rotulo =
    `Protocolo ${tarefa.protocolo}, ${gravidadeEmPalavra(tarefa.severidade).toLowerCase()}, `
    + `${tarefa.endereco}`
    + (metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`)
    + `. ${prazo.texto}`
    + (selo ? `. ${selo}` : comecada ? ". Vistoria começada" : "")
    + (vulneravel ? ". Vulnerabilidade social" : "")
    /* Sem o ponto final do cabeçalho: a frase seguinte traz o dela, e ".." é
       o leitor de tela fazendo uma pausa que ninguém pediu. */
    + (cabecalhoEmPalavras ? `. ${cabecalhoEmPalavras.replace(/\.\s*$/, "")}` : "")
    + (aberto ? ". Expandido, mostrando as ações" : ". Recolhido, toque para ver as ações");

  return (
    <View
      testID={`tarefa-${tarefa.id}`}
      onLayout={(e) => { aoMedir?.(e.nativeEvent.layout.y); }}
      style={{
        /*
          A CAIXA É O CARTÃO, pela H4: a superfície sai INTEIRA do token, nos
          dois temas. Aberto, o contorno engrossa e acende, que é o estado
          perceptível sem depender de cor. É o ÚNICO significado da borda
          acesa nesta peça: "vistoria começada" tem o chip dele, e uma borda
          que acendesse para duas coisas não diria nenhuma.
        */
        ...elevacao(tema)[nivel],
        ...(aberto ? { borderWidth: borda.enfase, borderColor: tema.destaque } : {}),
        borderRadius: raio.cartao,
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
        {cabecalho}
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
        {(metros !== null || selo || comecada) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
            {metros !== null && (
              <Txt nivel="apoio">{`a ${distanciaEmTexto(metros)} de você`}</Txt>
            )}
            {/*
              O chip do ESTADO DA COLETA, e nunca só uma borda: nada se
              comunica só por cor, e o `Chip` leva isso no tipo. O selo vem
              ANTES de "vistoria começada", e os dois nunca aparecem juntos:
              quando existe lápide que barra, a tela de vistoria não retoma
              rascunho nenhum, e dizer "começada" seria prometer uma tela que
              não vai abrir.
            */}
            {selo ? (
              <Chip texto={selo} simbolo="✓" tom="ok" />
            ) : comecada ? (
              /*
                Reticências como símbolo, e não seta: seta neste aplicativo
                significa ENVIO (é o símbolo da fila), e "vistoria começada" é
                o contrário disso, é trabalho que nem saiu do aparelho ainda.
              */
              <Chip
                texto="Vistoria começada"
                simbolo="…"
                tom="neutro"
                descricao="Vistoria começada neste aparelho"
              />
            ) : null}
          </View>
        )}
        {/*
          A VULNERABILIDADE tem linha própria, e não entra na fileira dos
          chips: ela fala do LUGAR (há quem precise de cuidado prioritário
          naquele endereço) e os chips falam do MEU TRABALHO. Misturar as duas
          faria a mais grave parecer mais uma etiqueta. Peso leve, pela régua
          de densidade: o fundo cheio da peça é da severidade, e ela continua
          com os dois canais, ícone e palavra. O nome de quem é NÃO aparece
          (`docs/PRIVACIDADE.md`): a lista diz que há cuidado, e nunca quem.
        */}
        {vulneravel && (
          <Chip
            texto="Vulnerabilidade social"
            tom="alerta"
            peso="leve"
            simbolo={(cor) => <IconeVulnerabilidade cor={cor} tamanho={tamanhoDeIcone.rotulo} />}
          />
        )}
      </Tocavel>

      {aberto && (
        <View style={{ paddingHorizontal: espaco.e3, paddingBottom: espaco.e3 }}>
          <DetalheDoItem reduzir={reduzir} primeiraPintura={primeiraPintura}>
            {!!titulo && <Txt variante="h3">{titulo}</Txt>}
            {/*
              O PRAZO COM A DATA. "Vence em 9h" não diz ao agente se o prazo
              cai dentro do turno dele ou já na madrugada, e é essa distinção
              que decide se ele sobe hoje ou passa a tarefa. A data fica ao
              lado, em legenda discreta, porque ela QUALIFICA o prazo em vez
              de competir com ele.
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
              e é a linha de medida que funciona sem sinal e sem Google. O que a
              tela acrescentar (o caminho por ruas, no mapa) entra ABAIXO dela e
              não no lugar dela: se o Google errar, a reta é a segunda opinião
              que o agente tem na tela.
            */}
            <Txt variante="corpoP">{ondeFica}</Txt>
            {children}
          </DetalheDoItem>
        </View>
      )}
    </View>
  );
}

/**
 * O RODAPÉ DA PÁGINA: quantas estão na lista, e o pedido de mostrar mais.
 *
 * Uma peça para as duas telas, pelo mesmo motivo do item: "5 de 12" precisa
 * ser a mesma frase na lista e no mapa. Só existe enquanto há o que mostrar;
 * no fim da lista, some.
 */
export function RodapeDaPagina({ visiveis, total, aoMostrarMais }: {
  visiveis: number;
  total: number;
  aoMostrarMais: () => void;
}) {
  const restantes = total - visiveis;
  if (restantes <= 0) return null;
  const proximas = Math.min(restantes, TAMANHO_DA_PAGINA);

  return (
    <View style={{ gap: espaco.e2 }}>
      <View testID="quantas-na-pagina">
        <Txt nivel="apoio" alinhamento="center">
          {`${visiveis} de ${total} vistorias na lista`}
        </Txt>
      </View>
      <Botao
        titulo={`Mostrar mais ${proximas}`}
        tipo="secundario"
        testID="mostrar-mais"
        descricao={`Mostrar mais ${proximas} vistorias na lista, que tem ${total}`}
        onPress={aoMostrarMais}
      />
    </View>
  );
}
