import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, RefreshControl, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { enderecoDaApi, type Pendencia } from "../../dados/api";
import {
  comoContarAFalha, motivoDaFalha, type MotivoDaFalha,
} from "../../dados/falha-de-atualizacao";
import {
  atualizarPendencias, baixadasEm, esquecerPendencia, pendenciasGuardadas, tetoAtingido,
} from "../../dados/pendencias";
import { listarColetas, marcarEnviada } from "../../dados/coletas";
import { obterFila } from "../../dados/fila";
import { listarRascunhos, type Rascunho } from "../../dados/rascunho";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Dado, Tocavel, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { useRecuoDoMenu } from "../../ui/BarraDeAbas";
import { useComecarDoTopo } from "../../ui/CenaDaAba";
import { ItemDeLista } from "../../ui/ItemDeLista";
import {
  ItemDeTarefa, RodapeDaPagina, TAMANHO_DA_PAGINA, alternarEscolha, itemAberto, quantasMostrar,
  type Escolha,
} from "../../ui/ItemDeTarefa";
import { atrasoEmCascata } from "../../ui/hierarquia";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAlerta, IconeAparelho, IconeInformacao, IconePerigo, IconeSemSinal, IconeSinal,
  IconeTarefas,
} from "../../ui/icones";
import { espaco, icone as tamanhoDeIcone, movimento, peso, raio, toque } from "../../ui/tokens";
import {
  INTERVALO_PADRAO_MS, deveAtualizar, idadeEmPalavras, listaEnvelheceu,
} from "../../dados/atualizacao";
import { type Ponto } from "../../dados/mapa";
import {
  AVISO_SEM_DISTANCIA, coletadasNoAparelho, ordemDoDia, pontoQueSeMede, tarefasDoDia,
  type OrdemDoDia,
} from "../../dados/ordem-do-dia";
import {
  FRASE_DO_IMPEDIMENTO,
  devolucoesPorOcorrencia,
  impedimentoParaDevolver,
  quantoFalta,
  seloDaColeta,
  temColetaNaFila,
  type ColetaLocal,
  type DevolucaoNoAparelho,
  type FilaDeSincronizacao,
  type ItemFila,
} from "@dc360/campo";
import { DialogoDeDevolucao, type PedidoDeDevolucao } from "../../ui/DialogoDeDevolucao";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";

/**
 * As tarefas do agente.
 *
 * A tela abre do DISCO, sempre, e só depois tenta atualizar pela rede. A ordem
 * inversa é o erro clássico de aplicativo offline: a tela fica girando
 * esperando uma rede que não existe, e o agente, que tem a lista guardada ali
 * no aparelho, não consegue vê-la.
 *
 * ## A LISTA NÃO PODE PULAR, e por isso a tela está desenhada assim
 *
 * O relato veio do aparelho, com estas palavras: "a lista dá uma rolada
 * sozinha". Eram TRÊS causas somadas, e consertar uma conserta um terço, então
 * a forma desta tela existe para matar as três:
 *
 * 1. **A roda de "puxar para atualizar" só liga no DEDO.** Antes, `atualizando`
 *    era um estado só, ligado por cinco gatilhos automáticos (foco, montagem,
 *    sinal que volta, volta do segundo plano e o relógio de 60 s), e ia direto
 *    para o `refreshing` do `RefreshControl`. Com `refreshing` verdadeiro sem o
 *    dedo puxando, o iOS desloca o `contentOffset` para revelar a roda: a lista
 *    anda sozinha uma vez por minuto. Agora são dois estados, `puxando` (só o
 *    gesto) e `atualizando` (qualquer busca, e ele só pinta texto e botão).
 * 2. **Nada nasce nem some ACIMA da lista.** Eram sete blocos condicionais
 *    dentro do conteúdo rolável, e o pior deles era o "esta lista tem mais de
 *    meia hora": ele sumia assim que a rede respondia, três linhas evaporavam
 *    do topo e tudo subia debaixo do dedo. Agora o cabeçalho é FIXO (fora da
 *    rolagem) e os avisos moram numa faixa de ALTURA RESERVADA, que existe
 *    sempre e nunca muda de tamanho: quando não há o que avisar, ela mostra o
 *    município e a idade da lista. Nenhuma informação se perdeu: a faixa mostra
 *    o aviso mais urgente e o `ⓘ` abre todos.
 * 3. **A lista é uma `FlatList` com `maintainVisibleContentPosition`.** É para
 *    isto que essa propriedade existe. A lista encurta sozinha no meio da
 *    rolagem (a leitura da fila chama `esquecerPendencia`, que apaga a linha da
 *    tarefa devolvida), e sem a âncora o item que estava debaixo dos olhos do
 *    agente sobe. Junto vêm duas medidas contra o mesmo defeito: leituras de
 *    disco simultâneas são COALESCIDAS (a fila avisa a cada mudança de estado,
 *    e eram N reconstruções seguidas da lista inteira), e o estado só é
 *    trocado quando o conteúdo mudou de verdade, senão cada leitura idêntica
 *    produzia uma lista nova e uma renderização a mais.
 *
 * Nada disto substitui a prova no aparelho, que é onde o `contentOffset`
 * existe: aqui os testes provam a ESTRUTURA que evita o pulo, não o pulo.
 *
 * ## O MAPA SAIU DAQUI, e o que ficou no lugar dele
 *
 * Até 15/09/2026 esta tela tinha duas LENTES, e estava escrito aqui o
 * argumento contra a aba própria: "mapa não é lugar aonde se vai, é jeito de
 * olhar as tarefas que já se tem". O medo era concreto: duas telas dizendo
 * "minhas tarefas" podem discordar, e no dia em que discordarem o agente vai
 * acreditar na que estiver na frente dele.
 *
 * O que derrubou a lente não foi o medo, foi a FORMA que ela tinha tomado.
 * Quem paga, com o aparelho na mão: "o botão mapa dentro da tela tarefas ficou
 * zuado demais, por quê? Porque surge um bottom-sheet com as tarefas e outro
 * com o mapa por cima". Eram duas folhas empilhadas na mesma tela, e a de cima
 * cobria justamente o que a de baixo existia para mostrar. O mapa virou tela
 * própria, em `app/(agente)/mapa.tsx`, sem folha nenhuma.
 *
 * **A defesa continua montada, e mudou de lugar.** O que impedia as duas
 * visões de discordar nunca foi estarem na mesma tela: era consumirem a mesma
 * regra. A regra mora em `src/dados/ordem-do-dia.ts` (`tarefasDoDia`,
 * `coletadasNoAparelho` e `ordemDoDia`, usadas pelas duas telas sobre a mesma
 * leitura de disco), e o caso que compara as duas item a item continua
 * existindo: era entre as duas lentes, agora é entre as duas telas
 * (`hoje-lista-e-mapa.test.tsx` e `mapa-tela-dedicada.test.tsx`).
 *
 * O que saiu daqui junto com o mapa: a folha arrastável, o enquadramento, a
 * tarefa focada e o subsistema do token do mapa (que não é do mapa, é da
 * promessa da seção 2.2 do `docs/SUBPROCESSADORES.md`). Esta tela voltou a ser
 * a lista, que é o que ela faz sem GPS, sem sinal e com o aparelho no bolso.
 *
 * ## A ORDEM DO DIA
 *
 * O critério mora em `src/dados/ordem-do-dia.ts`, com a razão de cada degrau
 * escrita lá, e esta tela só o consome. Aqui ficam as duas decisões que são de
 * TELA e não de regra:
 *
 * 1. **A sugestão não é um bloco acima da lista, é a PRIMEIRA da lista.** Um
 *    cartão de "faça isto agora" nascendo e sumindo acima da rolagem seria a
 *    causa 2 do pulo de volta, com outro nome. A ordem já é a sugestão; o que
 *    a primeira posição ganha é um rótulo e a frase do porquê, dentro do
 *    próprio item, e o direito de abrir já aberta.
 * 2. **A posição do agente é lida uma vez por foco, e não seguida em tempo
 *    real.** Uma lista que se reordena enquanto o agente caminha é a mesma
 *    lista que pula debaixo do dedo. E esta tela NÃO PEDE permissão de
 *    localização: ela usa a última posição conhecida, se houver. Quem pede é a
 *    vistoria, onde a coordenada é prova e o agente sabe por que está dando.
 *
 * ## A LISTA É UMA SANFONA PAGINADA
 *
 * O pedido, na letra de quem paga, logo depois de aprovar o mesmo desenho na
 * tela do mapa: "na tela tarefas o item da tarefa deve aparecer fechado na
 * lista paginada, e só ao clicar nele ele expande e mostra os detalhes e os
 * btns abrir vistoria e tudo mais". A régua dele veio de uma reclamação de
 * redundância ("mostra o item expandido com os botões e abaixo o mesmo item
 * resumido"), então a lista É a superfície: nenhum cartão à parte repete o
 * item.
 *
 * O item é a MESMA peça do mapa (`ui/ItemDeTarefa.tsx`), pela mesma razão
 * que a ordem é a mesma regra: a mesma tarefa precisa parecer a mesma coisa
 * nas duas abas. Fechado, é o resumo (protocolo, severidade, endereço numa
 * linha, os estados). Tocado, expande no lugar, um por vez, com o detalhe
 * (tipo, prazo com data, referência, distância e rumo) e os botões desta
 * tela: "Abrir a vistoria" em primário, "Enviar agora" e "Devolver" quando
 * cabem. Tocar no resumo só expande; quem navega é o botão.
 *
 * A sugerida do dia é a primeira e entra ABERTA, com "Comece por aqui" dentro
 * dela. É assim que o cartão de antes deixa de existir sem o convite sumir, e
 * o botão roxo que quem paga gostou continua sendo a primeira coisa que se
 * faz na tela.
 *
 * Cinco por página, com "Mostrar mais" no FIM: a âncora da `FlatList` segura
 * o primeiro item visível, e acrescentar no fim não move nada acima dele. É
 * a mesma aritmética que fez o cabeçalho ficar fora da rolagem.
 */

/** Altura da faixa de estado da lista. Ver `FAIXA_RESERVADA`, logo abaixo. */
const ALTURA_DA_FAIXA = toque;

/**
 * Troca o estado só quando o conteúdo mudou de verdade.
 *
 * A tela relê o disco a cada foco, a cada volta do segundo plano, a cada
 * janela do relógio e a cada evento da fila. Quase sempre a leitura devolve
 * exatamente o que já estava na tela, e devolver um array NOVO com o mesmo
 * conteúdo troca a identidade, o React renderiza de novo e a lista inteira é
 * reconstruída sem nada ter mudado. Numa `FlatList` isso é trabalho jogado
 * fora; numa lista que o agente está rolando, é a chance de o desenho
 * escorregar.
 *
 * A comparação é por texto, e não campo a campo, de propósito: campo a campo é
 * uma segunda lista de campos que diverge da primeira no dia em que a
 * pendência ganhar uma coluna, e aí a tela para de se atualizar sem ninguém
 * entender por quê. São dezenas de itens, não milhares.
 */
function manterSeIgual<T>(anterior: T, novo: T): T {
  return JSON.stringify(anterior) === JSON.stringify(novo) ? anterior : novo;
}

/**
 * O que a lista precisa dizer sobre si mesma, em uma linha e por extenso.
 *
 * `resumo` cabe numa linha só, porque a faixa tem altura reservada e altura
 * reservada só existe se o conteúdo couber sempre. `detalhe` é o texto inteiro,
 * que o agente lê no diálogo quando quiser: é a mesma decisão do parágrafo de
 * impedimento no cartão, e vale pelo mesmo motivo (a explicação não pode ocupar
 * o lugar da informação).
 */
type NotaDaLista = {
  chave: string;
  tom: "alerta" | "perigo";
  resumo: string;
  detalhe: string;
  /**
   * O que fazer quando o agente pedir para este aviso sair. Ausente: não sai.
   *
   * Era um booleano, e o ato de dispensar morava no diálogo, escrito na mão
   * para o aviso da devolução. Com dois avisos dispensáveis isso viraria um
   * `if` por aviso dentro do diálogo, longe da nota que ele apaga. Cada nota
   * traz o próprio ato.
   */
  aoDispensar?: () => void;
  /**
   * O ATO QUE RESOLVE, quando existe um e ele não é "tentar de novo".
   *
   * Sessão encerrada é o caso que obrigou isto. A faixa mostra uma linha só,
   * com o resto atrás do `ⓘ`, e no aparelho o resumo saiu cortado em "Sua
   * sessão terminou neste aparel…". O que fazer estava no texto de dentro, ou
   * seja, escondido atrás de um toque, num aviso que interrompe TUDO o que a
   * tela existe para fazer: nenhum despacho novo desce até a pessoa entrar de
   * novo.
   *
   * Quando a nota traz um ato, ela deixa de ser faixa e vira bloco, com o
   * botão à vista. Gravidade e tamanho passam a combinar.
   */
  acao?: { rotulo: string; aoTocar: () => void };
};

/** O que o `ⓘ` abre: um texto com título, e às vezes com um ato junto. */
type Explicacao = {
  titulo: string;
  texto: string;
  extras?: NotaDaLista[];
  /** O ato de fazer o aviso sair, quando a nota trouxer um. */
  dispensar?: () => void;
};

/**
 * O `ⓘ` que abre a explicação.
 *
 * Existe porque o Rafa pediu, olhando o aparelho: um parágrafo de 41 palavras
 * ocupava o lugar do botão em toda tarefa impedida, e com duas tarefas
 * impedidas na tela aquilo parecia o mesmo texto escrito duas vezes. A
 * explicação não sumiu, ela saiu do fluxo: fica a um toque, com o alvo de 52
 * pontos do produto, e a linha volta a ter espaço para o que se FAZ.
 */
function BotaoDeInformacao({ rotulo, onPress, testID }: {
  rotulo: string;
  onPress: () => void;
  testID: string;
}) {
  const tema = useTema();
  return (
    <Tocavel
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      accessibilityLabel={rotulo}
      estilo={{
        minHeight: toque,
        minWidth: toque,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: raio.normal,
      }}
    >
      <IconeInformacao cor={tema.destaque} tamanho={tamanhoDeIcone.acao} />
    </Tocavel>
  );
}

/**
 * O RÓTULO E O PORQUÊ DA SUGESTÃO DO DIA, que entra no RESUMO do item.
 *
 * É o `cabecalho` que esta tela passa para `ItemDeTarefa` na sugerida, acima
 * do protocolo, dentro do tocável: fica visível com o item aberto ou fechado,
 * porque a sugestão é da posição e não do estado, e o convite não pode sumir
 * quando o agente abre outra para ler.
 *
 * A honestidade da ordem viaja JUNTO com a frase, e não ao lado dela: sem GPS,
 * uma ordem por urgência se apresentaria como se também tivesse considerado o
 * caminho, e o agente decidiria por onde subir o morro confiando nisso. E as
 * mesmas palavras vão no rótulo do resumo (`cabecalhoEmPalavras`), porque o
 * tocável é um elemento só para quem ouve.
 */
function PorqueComecarAqui({ motivo, usouDistancia, testID }: {
  motivo: string;
  usouDistancia: boolean;
  testID?: string;
}) {
  return (
    <View style={{ gap: espaco.e1 }} testID={testID}>
      <Txt nivel="rotulo">Comece por aqui</Txt>
      <Txt nivel="apoio">{motivo}</Txt>
      {!usouDistancia && <Txt nivel="apoio">{AVISO_SEM_DISTANCIA}</Txt>}
    </View>
  );
}

export default function Tarefas() {
  const tema = useTema();
  /*
    A pílula do menu PAIRA sobre a cena e não empurra nada: quem reserva o vão
    no fim da rolagem é a tela, com a altura que a barra mediu. Sem isto o
    último cartão morre atrás do vidro.
  */
  const recuoDoMenu = useRecuoDoMenu();
  const sinal = useSinal();
  const { obterToken, identidade, lerIdentidade, sair } = useSessao();

  const [tarefas, setTarefas] = useState<Pendencia[] | null>(null);
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  /**
   * As lapides das coletas ja feitas neste aparelho, por ocorrencia.
   *
   * Sem elas, a tarefa concluida continua na lista identica as intocadas
   * durante todo o tempo em que faltar sinal, e nada na tela diz que o agente
   * ja esteve la.
   */
  const [coletas, setColetas] = useState<ColetaLocal[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  /** Tamanho do teto quando a última baixa foi cortada. Nulo quando veio inteira. */
  const [teto, setTeto] = useState<number | null>(null);
  /** O agente desistiu de esperar a abertura. Ver `Carregando`, mais abaixo. */
  const [desistiuDeAbrir, setDesistiuDeAbrir] = useState(false);
  /** O texto que o `ⓘ` abriu. Enquanto for nulo, nenhum diálogo está de pé. */
  const [explicacao, setExplicacao] = useState<Explicacao | null>(null);
  /** Qual item está aberto. Ver `Escolha` em `ui/ItemDeTarefa.tsx`. */
  const [escolha, setEscolha] = useState<Escolha>("sugerida");
  /** Quantos itens a lista mostra por pedido. Cresce com "Mostrar mais". */
  const [pagina, setPagina] = useState(TAMANHO_DA_PAGINA);
  /* Toda aba começa do topo a cada foco (ver `ui/CenaDaAba.tsx`). */
  const rolagem = useComecarDoTopo<FlatList<Pendencia>>();

  /*
    ONDE O AGENTE ESTÁ, e as duas coisas que esta tela NÃO faz.

    **Não pede permissão.** Abrir a lista de tarefas e levar um pedido de
    localização na cara é o jeito mais rápido de o agente negar para sempre,
    e quem realmente precisa dela é a vistoria, onde a coordenada é prova e a
    tela explica por quê. Aqui só se usa a permissão que já existe.

    **Não liga o GPS.** `getLastKnownPositionAsync` lê a última posição que o
    sistema já tem, sem ligar o rádio, sem esperar fixação e sem gastar
    bateria. Ela pode ser de dez minutos atrás, e para ordenar tarefas numa
    cidade isso é preciso o bastante. Nula é o caso COMUM, e a ordem do dia
    sabe trabalhar sem ela.
  */
  const [ondeEstou, setOndeEstou] = useState<Ponto | null>(null);
  const verOndeEstou = useCallback(async () => {
    try {
      const permissao = await Location.getForegroundPermissionsAsync();
      if (!permissao.granted) return;
      const ultima = await Location.getLastKnownPositionAsync();
      if (!ultima) return;
      /*
        A LEITURA PASSA PELO FILTRO ANTES DE VIRAR ESTADO.

        `getLastKnownPositionAsync` devolve 0,0 em aparelho que ainda não fixou,
        em emulador e em aparelho barato com o rádio recém-ligado, e isso não é
        "onde o agente está": é o sistema dizendo que ainda não sabe. Sem este
        filtro, a ilha nula entra aqui como posição válida, a ordem do dia passa
        a ordenar por latitude (quem está mais ao norte fica mais perto do golfo
        da Guiné, o que num município ao sul sai INVERTIDO) e o mapa desenha o
        agente a seis mil quilômetros do imóvel.

        O filtro é o mesmo da coordenada da tarefa, e é a mesma função: duas
        checagens parecidas em dois arquivos é como um dos dois lados fica sem a
        correção, que foi exatamente o que aconteceu aqui.
      */
      const novo = pontoQueSeMede(ultima.coords.latitude, ultima.coords.longitude);
      if (!novo) return;
      /*
        Só troca o estado quando a posição MUDOU, pela mesma razão de
        `manterSeIgual`: um objeto novo a cada foco reordenaria a lista inteira
        sem o agente ter saído do lugar.
      */
      setOndeEstou((antes) => (
        antes && antes.latitude === novo.latitude && antes.longitude === novo.longitude
          ? antes
          : novo
      ));
    } catch {
      /* Sem localização a ordem cai no prazo, que é o que ela sempre foi. */
    }
  }, []);

  /*
    Relógio da tela, só para a idade da lista não congelar em "agora há pouco"
    enquanto o aparelho fica aberto em cima da mesa. Trinta segundos é bem mais
    curto do que a menor faixa que o texto distingue, então nunca dá para ver a
    frase errada.
  */
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  /*
    DOIS estados para a atualização, e a separação é a correção.

    `atualizando` é qualquer busca em andamento, venha de onde vier: ele pinta
    o "(buscando)" da faixa e o botão do rodapé, que são coisas que não movem
    nada. `puxando` é SÓ o gesto do dedo, e é o único que alimenta o
    `refreshing` do `RefreshControl`. Com `refreshing` verdadeiro sem o dedo
    estar puxando, o iOS desloca o conteúdo para mostrar a roda, e era isso que
    o agente via como a lista rolando sozinha uma vez por minuto.
  */
  const [atualizando, setAtualizando] = useState(false);
  const [puxando, setPuxando] = useState(false);
  /*
    POR QUE a última atualização não aconteceu, e não a frase pronta.

    Guardava a frase, e a faixa escolhia o resumo lendo o INDICADOR DE SINAL,
    que é outra pergunta: dava para o texto por extenso dizer "sem sinal"
    enquanto a linha da faixa dizia "não deu para atualizar agora". Pior, os
    dois casos que exigem atos opostos (esperar o sinal, ou entrar de novo)
    caíam na mesma frase. Guardando o motivo, quem escolhe as duas frases é o
    fracasso, que é quem sabe o que houve. Ver `dados/falha-de-atualizacao`.
  */
  const [falhaDeRede, setFalhaDeRede] = useState<MotivoDaFalha | null>(null);

  /*
    A fila de envio, e o que ela diz sobre estas tarefas.

    A lista PRECISA ler a fila, e não só as lápides: é o item na fila que
    sustenta a devolução entre o toque do agente e a confirmação do servidor. É
    ele que tira a tarefa daqui (o alívio que o agente quer) sem tirá-la do
    aparelho (a garantia de que ninguém perde o que foi decidido no morro).
  */
  const fila = useRef<FilaDeSincronizacao | null>(null);
  const [itensDaFila, setItensDaFila] = useState<ItemFila[]>([]);
  /** Qual tarefa está sendo perguntada. Enquanto for nulo, nada foi devolvido. */
  const [aDevolver, setADevolver] = useState<Pendencia | null>(null);
  /** O que aconteceu com o último pedido, quando ele não pôde ser aceito. */
  const [avisoDaDevolucao, setAvisoDaDevolucao] = useState<string | null>(null);
  /** Qual tarefa está com envio em andamento pelo botão "Enviar agora". */
  const [enviando, setEnviando] = useState<string | null>(null);
  /** O resultado do último "Enviar agora", no cartão da tarefa que o pediu. */
  const [envio, setEnvio] = useState<
    { ocorrenciaId: string; tom: "sucesso" | "alerta" | "perigo"; titulo: string; texto: string }
    | null
  >(null);

  /*
    A fila confirmou: a lapide sobe de "na fila" para "enviada".

    Esta e a unica tela que ja le o disco a cada foco, a cada volta do segundo
    plano e a cada janela do relogio, entao e aqui que a promocao sai de graca.
    Nada de rede acontece: `itens()` le a mesma base local que o resto.

    So promove item CONFIRMADO. Item que sumiu da fila nao serve de prova de
    envio, porque descartar tambem tira da fila, e uma lapide dizendo "enviada"
    sobre uma coleta descartada seria a tela afirmando que o servidor tem o que
    ele nao tem. Errar para o lado de "aguardando envio" custa uma frase velha
    por algumas horas; errar para o outro lado custa um laudo que ninguem
    procura porque a tela disse que ja foi.

    Falhar aqui nao pode custar a lista: a lista e a unica coisa que o agente
    tem no morro.
  */
  const lerAFila = useCallback(async (): Promise<ItemFila[]> => {
    try {
      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      const itens = await fila.itens();

      for (const item of itens) {
        /*
          SÓ VISTORIA promove lápide, e o `tipo` aqui não é zelo: a fila passou
          a levar dois tipos de item, e uma devolução confirmada marcaria como
          "coletada e enviada" uma vistoria que nunca foi feita. A lápide é o
          que impede a segunda vistoria; mentir nela é pior do que não tê-la.
        */
        if (item.tipo === "vistoria" && item.estado === "confirmado") {
          await marcarEnviada(item.ocorrenciaId);
          /*
            E A TAREFA SAI DA LISTA, pelo mesmo direito que a devolução
            confirmada tem logo abaixo.

            Isto foi visto num aparelho, e a pergunta de quem viu era a certa:
            "se a coordenação já recebeu esta vistoria, por que ela está na
            lista de minhas tarefas?". Estava porque ninguém mandava sair. A
            devolução confirmada chamava `esquecerPendencia`; a vistoria
            confirmada só promovia a lápide, e a tarefa ficava, com o contador
            dizendo "2 vistorias para fazer" sobre uma que já chegou.

            Ela acabava saindo na próxima reconciliação com sinal, e "acaba
            saindo" não é resposta para quem está no morro com o aparelho na
            mão.

            CONFIRMADO, e não "sumiu da fila": descartar também tira da fila, e
            esquecer a tarefa por causa de um descarte faria o agente perder de
            vista um trabalho que o servidor nunca recebeu. É a mesma linha que
            governa a promoção da lápide, acima, e pelo mesmo motivo.

            A LÁPIDE FICA. Ela é o que impede a segunda vistoria na mesma
            ocorrência, e some por outro caminho, quando o servidor confirma que
            não precisa mais dela.
          */
          await esquecerPendencia(item.ocorrenciaId);
        }
        /*
          A devolução que o servidor confirmou autoriza o aparelho a esquecer a
          tarefa. Antes disso, quem a esconde da lista é o próprio item na fila;
          depois, o item some (confirmado fica visível um tempo e sai) e sem esta
          linha a tarefa voltaria para a lista, sem explicação, até a próxima
          baixa com sinal.

          É esta linha que ENCURTA a lista, e ela pode acontecer com o agente
          rolando. Quem segura o desenho no lugar é o `maintainVisibleContentPosition`
          da lista, lá embaixo.
        */
        if (item.tipo === "devolucao" && item.estado === "confirmado") {
          await esquecerPendencia(item.ocorrenciaId);
        }
      }
      return itens;
    } catch {
      /* A fila indisponivel deixa o selo como esta, e nada mais. */
      return [];
    }
  }, [obterToken, lerIdentidade]);

  /*
    LEITURA DE DISCO COALESCIDA, e ela é a terceira causa do pulo.

    A fila avisa a cada mudança de estado, e uma sincronização muda vários
    itens em sequência: sem esta trava, cada aviso disparava uma leitura
    inteira, e a lista era reconstruída cinco ou seis vezes seguidas enquanto o
    dedo do agente estava em cima dela. As leituras ainda por cima terminavam
    fora de ordem, então a última a escrever na tela podia ser a mais VELHA.

    Pedido que chega durante uma leitura não é descartado: ele vira uma
    releitura no fim, uma só, que é o que garante que a tela termina com o
    estado mais recente do disco sem passar por todos os intermediários.
  */
  const lendoODisco = useRef(false);
  const releituraPedida = useRef(false);

  const lerDoDisco = useCallback(async () => {
    if (lendoODisco.current) { releituraPedida.current = true; return; }
    lendoODisco.current = true;
    try {
      do {
        releituraPedida.current = false;
        const naFila = await lerAFila();
        const [guardadas, marcadas, emAndamento, coletadas, cortada] = await Promise.all([
          pendenciasGuardadas(), baixadasEm(), listarRascunhos(), listarColetas(), tetoAtingido(),
        ]);
        setTarefas((antes) => (antes === null ? guardadas : manterSeIgual(antes, guardadas)));
        setAtualizadoEm(marcadas);
        setTeto(cortada);
        setRascunhos((antes) => manterSeIgual(antes, emAndamento));
        setColetas((antes) => manterSeIgual(antes, coletadas));
        setItensDaFila((antes) => manterSeIgual(antes, naFila));
      } while (releituraPedida.current);
    } finally {
      lendoODisco.current = false;
    }
  }, [lerAFila]);

  /*
    A tela escuta a fila, e não só o foco.

    Sem isto, a confirmação da devolução chegaria à lista só no próximo foco: o
    agente que ficasse parado nesta tela veria a tarefa reaparecer quando o item
    confirmado saísse da fila, porque a linha local ainda estaria no disco. A
    fila avisa a cada mudança de estado, e reler o disco aqui é barato.
  */
  /*
    A leitura mais recente do disco, guardada em `ref` para a assinatura abaixo
    poder chamá-la sem virar dependência dela. Em dependência, cada renderização
    trocaria a assinatura da fila por uma nova, e o aparelho passaria o dia
    assinando e desassinando enquanto o agente olha a lista.
  */
  const lerDoDiscoAgora = useRef(lerDoDisco);
  lerDoDiscoAgora.current = lerDoDisco;

  useEffect(() => {
    let vivo = true;
    let desassinar: (() => void) | undefined;
    void (async () => {
      try {
        const aberta = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
        if (!vivo) return;
        fila.current = aberta;
        desassinar = aberta.assinar(() => { void lerDoDiscoAgora.current(); });
      } catch {
        /* Sem fila não há devolução possível, e a lista continua servindo. */
      }
    })();
    return () => { vivo = false; desassinar?.(); };
    // Só na montagem, como a leitura inicial logo abaixo: a fila do aplicativo
    // é memoizada e vive o dia inteiro, então reabri-la a cada renderização não
    // traria nada e trocaria a assinatura à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    O que a tela sabe sobre a última ida à rede.

    Fica em `ref` e não em estado porque nada disto se desenha: é a memória que
    a regra de idade consulta. Em estado, cada leitura provocaria renderização
    e o relógio abaixo entraria em laço.
  */
  const ultimaTentativa = useRef<number | null>(null);
  const ultimaDeuCerto = useRef(true);
  const emVoo = useRef(false);

  /**
   * Vai à rede.
   *
   * `puxada` é a única coisa que liga a roda do `RefreshControl`, e ela só é
   * verdadeira quando veio do gesto. Todo o resto (foco, montagem, sinal que
   * volta, volta do segundo plano, relógio, e o botão do rodapé) atualiza em
   * silêncio, mostrando "(buscando)" na faixa, que não desloca nada.
   */
  const buscarNaRede = useCallback(async (puxada = false) => {
    emVoo.current = true;
    ultimaTentativa.current = Date.now();
    setAtualizando(true);
    if (puxada) setPuxando(true);
    setFalhaDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;
      const novas = await atualizarPendencias(token);
      ultimaDeuCerto.current = true;
      setTarefas((antes) => (antes === null ? novas : manterSeIgual(antes, novas)));
      setAtualizadoEm(await baixadasEm());
      setTeto(await tetoAtingido());
    } catch (erro: unknown) {
      ultimaDeuCerto.current = false;
      /*
        Falhar em atualizar NÃO é falhar em mostrar. A lista do disco continua
        na tela, e o aviso diz que ela pode estar velha. Trocar a lista por uma
        mensagem de erro seria tirar do agente a única coisa que ele tem.
      */
      setFalhaDeRede(motivoDaFalha(erro));
    } finally {
      emVoo.current = false;
      setAtualizando(false);
      setPuxando(false);
    }
  }, [obterToken]);

  /*
    Uma porta só para a rede, e ela pergunta pela IDADE da lista.

    Quatro coisas querem atualizar: a tela ganhar foco, o aplicativo voltar do
    segundo plano, o sinal voltar, e o relógio. Se cada uma disparasse por
    conta própria, numa área de sombra onde o sinal pisca a cada segundo o
    aparelho passaria o dia buscando. Todas passam por aqui, e aqui a resposta
    é não enquanto a lista for recente.
  */
  const atualizarSeValer = useCallback(() => {
    const decidir = deveAtualizar({
      ultimaTentativa: ultimaTentativa.current,
      ultimaDeuCerto: ultimaDeuCerto.current,
      emVoo: emVoo.current,
      temSinal: sinal.temSinal,
    }, Date.now());
    if (decidir) void buscarNaRede();
  }, [buscarNaRede, sinal.temSinal]);

  /*
    Ao voltar de uma vistoria os rascunhos mudaram, então relê o disco. E
    aproveita para perguntar se vale ir à rede: se o agente ficou dez minutos
    dentro de uma coleta, a coordenação pode ter despachado outra coisa.
  */
  useFocusEffect(useCallback(() => {
    void lerDoDisco();
    atualizarSeValer();
    /*
      A posição é relida no FOCO, e não a cada quadro. Voltar de uma vistoria é
      o momento exato em que o agente mudou de lugar, e é o único em que
      reordenar a lista não acontece debaixo do dedo dele.
    */
    void verOndeEstou();
  }, [lerDoDisco, atualizarSeValer, verOndeEstou]));

  useEffect(() => {
    void (async () => {
      await lerDoDisco();
      atualizarSeValer();
    })();
    // Só na montagem. As atualizações seguintes vêm dos três gatilhos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    O sinal voltou.

    É o momento de maior valor de todos: o agente desceu do morro, ou saiu da
    sombra, e é justamente aí que ele precisa saber o que mudou enquanto
    esteve fora. A regra de idade protege contra o sinal piscando.
  */
  useEffect(() => {
    if (sinal.temSinal) atualizarSeValer();
  }, [sinal.temSinal, atualizarSeValer]);

  /*
    O aplicativo voltou do segundo plano.

    O agente atende uma ligação, olha o mapa, volta. O Android pode ter matado
    a tela nesse meio tempo, e mesmo que não tenha, a lista envelheceu.
  */
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        void lerDoDisco();
        atualizarSeValer();
      }
    });
    return () => { assinatura.remove(); };
  }, [lerDoDisco, atualizarSeValer]);

  /*
    E o relógio, para o caso mais simples e mais comum de todos: o aparelho
    aberto em cima da mesa da base, com sinal, enquanto a coordenação despacha.
    Sem isto, o agente olha uma tela parada e conclui que não tem trabalho.
  */
  useEffect(() => {
    const relogio = setInterval(atualizarSeValer, INTERVALO_PADRAO_MS);
    return () => { clearInterval(relogio); };
  }, [atualizarSeValer]);

  /**
   * O toque que devolve, depois de o agente ter confirmado o motivo.
   *
   * A devolução NÃO vai para a rede aqui: ela entra na fila, como tudo o que
   * sai deste aplicativo, porque quem decide isto está sem sinal por definição
   * (a tarefa venceu justamente porque ele estava lá fora). O que acontece na
   * hora é a tarefa sair desta lista, e quem a esconde é o item recém-criado.
   */
  async function devolver(alvo: Pendencia, pedido: PedidoDeDevolucao): Promise<void> {
    /*
      O aviso da tentativa ANTERIOR sai antes de qualquer coisa.

      Ele só era zerado no caminho do sucesso, e o resultado era uma frase de
      recusa colada no topo da tela para sempre, ao lado do cartão que já
      explicava a mesma coisa por conta própria. Duas fontes independentes do
      mesmo texto na mesma tela é o que o Rafa viu como "aparece duas vezes".
    */
    setAvisoDaDevolucao(null);

    const aberta = fila.current;
    if (!aberta) {
      setAvisoDaDevolucao(
        "Não deu para abrir a fila de envio deste aparelho, e sem ela a devolução "
        + "não fica guardada. Tente de novo.",
      );
      return;
    }
    const r = await aberta.enfileirarDevolucao(
      {
        idempotencyKey: Crypto.randomUUID(),
        ocorrenciaId: alvo.id,
        /* A hora do APARELHO, para a trilha. Ela não decide nada: quem decide
           se a tarefa venceu é o relógio do servidor. */
        decididaEm: new Date().toISOString(),
        motivo: pedido.motivo,
        ...(pedido.observacao ? { observacao: pedido.observacao } : {}),
      },
      { protocolo: alvo.protocolo },
    );

    if (!r.enfileirada) {
      if (r.motivo === "coleta_na_fila") {
        /*
          A FILA SABE DE UMA COLETA QUE A TELA NÃO VIA, e a resposta certa é
          corrigir o cartão, não escrever um aviso no topo.

          Relendo o disco, o cartão daquela tarefa passa a mostrar o que ela
          realmente precisa ("Enviar agora", porque o que falta é sinal e não
          devolução), e a explicação sai UMA vez, no diálogo, respondendo na
          hora o toque que acabou de não acontecer.
        */
        await lerDoDisco();
        setExplicacao({
          titulo: "Esta tarefa não pode ser devolvida",
          texto: FRASE_DO_IMPEDIMENTO.coleta_no_aparelho,
        });
        return;
      }
      setAvisoDaDevolucao(
        "Você não está mais com a sessão aberta neste aparelho. Entre de novo "
        + "para devolver a tarefa: a devolução leva o seu nome.",
      );
      return;
    }
    await lerDoDisco();
  }

  /**
   * "Enviar agora", na tarefa vencida que JÁ TEM coleta guardada.
   *
   * Decidido com o Rafa, e a decisão é de produto antes de ser de tela: ali o
   * que falta não é devolver, é sinal. A vistoria existe, está presa no
   * aparelho, e devolver jogaria fora o trabalho do morro em silêncio. Então o
   * cartão oferece o verbo que resolve o caso de verdade, em destaque, e
   * devolver continua bloqueado com o `ⓘ` explicando por quê.
   *
   * O dreno manda tudo o que está pronto, e não só esta coleta, porque é assim
   * que a fila funciona. Por isso a frase do resultado é conferida no ITEM
   * desta ocorrência, e não no total do dreno: "enviado" sobre a coleta de
   * outra tarefa seria a tela afirmando o que o servidor não tem.
   */
  async function enviarAgora(alvo: Pendencia): Promise<void> {
    const aberta = fila.current;
    if (!aberta) {
      setEnvio({
        ocorrenciaId: alvo.id,
        tom: "perigo",
        titulo: "Não deu para abrir a fila de envio",
        texto: "A coleta continua guardada no aparelho. Abra a aba Envio para tentar por lá.",
      });
      return;
    }
    setEnviando(alvo.id);
    setEnvio(null);
    try {
      await aberta.drenar();
      const depois = await aberta.itens();
      const meu = depois.find((i) => i.tipo === "vistoria" && i.ocorrenciaId === alvo.id);
      await lerDoDisco();

      if (!meu || meu.estado === "confirmado") {
        /*
          O DESFECHO É SABIDO AQUI, e por isso ele é aplicado aqui.

          A promoção da lápide e a saída da tarefa moram em `lerAFila`, que
          varre a fila procurando item confirmado. Esse caminho cobre o envio
          que acontece sozinho, em segundo plano, sem ninguém tocar em nada.

          Só que ele PERDE A CORRIDA no caminho do dedo: `drenar()` confirma e
          REMOVE o item da fila, então quando a leitura chega não há item
          confirmado para encontrar. O resultado foi fotografado num aparelho:
          tarja verde dizendo "Enviado, a coordenação já recebeu esta vistoria"
          logo acima de um chip dizendo "Coletada, aguardando envio", com o
          botão de volta. Três estados contraditórios no mesmo cartão.

          Quem pediu o envio e recebeu a confirmação já sabe o desfecho, e não
          pode depender de reencontrar um item que a própria confirmação tirou
          da fila. As duas chamadas são idempotentes, então o outro caminho
          continua valendo sem estragar nada.

          `lerDoDisco` é chamado DEPOIS, e não antes, senão a lista seria lida
          antes de o disco saber.
        */
        await marcarEnviada(alvo.id);
        await esquecerPendencia(alvo.id);
        await lerDoDisco();

        setEnvio({
          ocorrenciaId: alvo.id,
          tom: "sucesso",
          titulo: "Enviado",
          texto: "A coordenação já recebeu esta vistoria.",
        });
      } else if (meu.estado === "bloqueado" || meu.estado === "arquivado") {
        setEnvio({
          ocorrenciaId: alvo.id,
          tom: "perigo",
          titulo: "O servidor não aceitou este envio",
          texto: "A coleta continua guardada. Abra a aba Envio para ver o que ele respondeu.",
        });
      } else {
        setEnvio({
          ocorrenciaId: alvo.id,
          tom: "alerta",
          titulo: "Ainda não deu para enviar",
          texto: "A coleta continua guardada no aparelho e sai sozinha assim que houver sinal.",
        });
      }
    } finally {
      setEnviando(null);
    }
  }

  /*
    A LISTA QUE O AGENTE VÊ, e ela não é a lista que está no disco.

    A regra (quem sai por devolução a caminho, quem volta por devolução
    recusada) mora em `tarefasDoDia`, com as razões escritas lá, porque a tela
    do mapa precisa da MESMA lista: duas telas dizendo "minhas tarefas" com duas
    cópias da mesma regra discordam na primeira vez que alguém mexer numa delas.

    `useMemo` não é otimização de gosto aqui: `tarefas` e `itensDaFila` já são
    estáveis quando o conteúdo não mudou (ver `manterSeIgual`), e sem ele esta
    lista seria um array novo a cada renderização, fazendo a comparação de
    entrada e saída, logo abaixo, rodar à toa dezenas de vezes por minuto.
  */
  const naLista = useMemo(
    () => tarefasDoDia(tarefas ?? [], itensDaFila),
    [tarefas, itensDaFila],
  );

  /* Quem este aparelho JÁ vistoriou e ainda não conseguiu enviar. O critério
     (e o porquê de `arquivada` ficar de fora) mora em `coletadasNoAparelho`,
     junto da ordem que o consome. */
  const jaColetadas = useMemo(() => coletadasNoAparelho(coletas), [coletas]);

  /*
    A ORDEM DO DIA, e a razão de ela ser ESTABILIZADA aqui.

    `agora` avança de trinta em trinta segundos (é o relógio que impede a idade
    da lista de congelar em "agora há pouco"), e a ordem depende dele. Sem a
    comparação abaixo, cada tique produziria um vetor NOVO com exatamente as
    mesmas tarefas na mesma ordem, a identidade trocaria, e a `FlatList`
    reconstruiria a lista inteira duas vezes por minuto, com o dedo do agente
    em cima dela. É a mesma aritmética de `manterSeIgual`, e ela existe pelo
    mesmo defeito.

    A comparação é por IDENTIDADE de cada tarefa, e não por texto: os itens já
    chegam estáveis de `manterSeIgual`, então `===` responde certo e custa uma
    passada. Comparar por `JSON.stringify` uma lista de vinte ocorrências duas
    vezes por minuto seria pagar caro por uma resposta que já se tem.

    Escrever na referência durante a renderização é a forma canônica de
    memoização com comparação própria, e este arquivo já faz o mesmo em
    `lerDoDiscoAgora`. O valor guardado nunca é LIDO fora deste bloco.
  */
  const ultimaOrdem = useRef<OrdemDoDia<Pendencia> | null>(null);
  const oDia = useMemo(() => {
    const nova = ordemDoDia(naLista, {
      agora: agora.getTime(),
      de: ondeEstou,
      jaColetadas,
    });
    const antes = ultimaOrdem.current;
    const igual = antes !== null
      && antes.motivo === nova.motivo
      && antes.usouDistancia === nova.usouDistancia
      && antes.ordenadas.length === nova.ordenadas.length
      && antes.ordenadas.every((t, i) => t === nova.ordenadas[i]);
    const resultado = igual ? antes : nova;
    ultimaOrdem.current = resultado;
    return resultado;
  }, [naLista, agora, ondeEstou, jaColetadas]);

  /** Metros até cada tarefa, quando há como medir. Para o item não recalcular. */
  const distancias = useMemo(
    () => new Map(oDia.lugares.map((l) => [l.tarefa.id, l.distanciaM])),
    [oDia],
  );

  /** Abre ou recolhe um item. A regra mora com a peça, e é a mesma do mapa. */
  const alternar = useCallback((id: string) => {
    setEscolha((antes) => alternarEscolha(antes, id, oDia.ordenadas, oDia.sugerida));
  }, [oDia.ordenadas, oDia.sugerida]);

  /*
    UMA navegação, para o botão de todo item aberto. Escrita duas vezes, os
    caminhos divergiriam no primeiro parâmetro novo, e o agente teria dois
    "abrir" que abrem coisas diferentes. O toque no resumo NÃO chama isto:
    ele só expande.
  */
  const abrirAVistoria = useCallback((id: string) => {
    router.push({ pathname: "/(agente)/vistoria/[id]", params: { id } });
  }, []);

  /*
    ENTRADA E SAÍDA DA LISTA DE TAREFAS.

    Uma tarefa devolvida sumia no quadro seguinte. Isso é um corte seco no fim
    de um ato institucional: o agente escolheu o motivo, confirmou no diálogo,
    a devolução entrou na fila com o nome dele, e a resposta da tela foi um
    cartão a menos. Quem estava olhando para a parte de baixo da lista não viu
    nada acontecer, e uma lista que encolhe em silêncio é como um trabalho
    parece perdido.

    A mecânica é a MESMA da fila de envio, de propósito: o item que já saiu do
    disco continua desenhado pelo tempo de `movimento.mudancaDeEstado` e só
    então é largado. Ele não entra em contagem nenhuma, porque para a tela ele
    já foi: o cabeçalho conta `naLista`, e a `FlatList` desenha a união.
  */
  const [saindo, setSaindo] = useState<Pendencia[]>([]);
  /*
    Quem já estava na tela, para saber quem CHEGOU e quem SUMIU.

    São `ref` e não estado porque ninguém desenha a partir delas: servem só
    para a comparação de uma leitura para a outra. Como estado, disparariam uma
    renderização a mais a cada evento da fila, numa tela cujo defeito de origem
    era justamente renderizar demais.

    `jaVistas` começa nula, e é isso que faz a PRIMEIRA pintura não animar
    nada. Vinte cartões entrando ao mesmo tempo seria exatamente o engasgo que o
    `CLAUDE.md` proíbe, num aparelho que não é iPhone novo, e a chegada de
    trabalho novo só quer dizer alguma coisa para quem já estava olhando a lista.
  */
  const jaVistas = useRef<Pendencia[] | null>(null);
  const reduzirMovimento = useReducaoDeMovimento();
  const reduzirRef = useRef(reduzirMovimento);
  reduzirRef.current = reduzirMovimento;
  /* Os temporizadores vivos, para o desmonte não deixar nenhum escrevendo
     estado em componente que já saiu da tela. */
  const relogiosDaSaida = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    for (const relogio of relogiosDaSaida.current) clearTimeout(relogio);
    relogiosDaSaida.current = [];
  }, []);

  useEffect(() => {
    /*
      ENQUANTO A LISTA NÃO FOI PINTADA, ninguém chegou e ninguém saiu.

      Esta guarda não é detalhe: sem ela, a primeira renderização (aquela em
      que `tarefas` ainda é nula e a tela mostra `Carregando`) já marcava a
      lista como "vista", vazia. Quando o disco respondia, as tarefas todas
      apareciam como recém-chegadas e entravam animadas ao mesmo tempo, que é
      exatamente o engasgo em aparelho fraco que o `CLAUDE.md` proíbe, e além
      disso uma mentira: nada chegou, o aparelho é que terminou de ler.
    */
    if (tarefas === null) return;

    const agora = new Set(naLista.map((t) => t.id));
    const antes = jaVistas.current;
    jaVistas.current = naLista;
    /* Primeira pintura: ninguém chegou e ninguém saiu, por definição. */
    if (antes === null) return;

    /* Com redução de movimento ligada não há saída para animar: o item some na
       hora, que é exatamente o que quem ligou a opção pediu. */
    if (reduzirRef.current) return;

    /*
      O cartão que sai é desenhado a partir do que a tela TINHA, e não do disco.

      Guardar a lista inteira, e não só os identificadores, é o que faz a
      despedida funcionar nos DOIS jeitos de uma tarefa sumir. Na devolução, a
      linha continua no disco e só é filtrada aqui. Na reconciliação (a
      coordenação encerrou, trocou de equipe, alguém concluiu), a linha é
      APAGADA do aparelho, e procurá-la em `tarefas` não acharia nada: a tarefa
      sumiria em silêncio justamente no caso em que o agente mais precisa ver
      que ela saiu.
    */
    const sumiram = antes.filter((t) => !agora.has(t.id));
    if (sumiram.length === 0) return;
    const idsQueSaem = new Set(sumiram.map((t) => t.id));
    setSaindo((antesDaSaida) => [...antesDaSaida, ...sumiram]);
    relogiosDaSaida.current.push(setTimeout(() => {
      setSaindo((antesDaSaida) => antesDaSaida.filter((t) => !idsQueSaem.has(t.id)));
    }, movimento.mudancaDeEstado));
  }, [naLista, tarefas]);

  /*
    A abertura, com hora marcada para deixar de ser silenciosa.

    `aoDesistir` existe no componente desde o T4 e esta tela nunca o passava, o
    que desligava metade dele: o agente que desistisse ficava numa folha que
    dizia "Você parou a espera" e não tinha caminho de volta. Aqui a desistência
    vira um estado desenhado, com o verbo para tentar de novo.
  */
  if (tarefas === null) {
    if (!desistiuDeAbrir) {
      return (
        <Carregando
          mensagem="Abrindo suas tarefas"
          rotuloDaSaida="Parar de esperar"
          aoDesistir={() => { setDesistiuDeAbrir(true); }}
        />
      );
    }
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Vazio
          titulo="A lista ainda não abriu"
          descricao="A leitura do aparelho não terminou. Nada foi perdido: o que estava guardado continua guardado."
          icone={<IconeAparelho cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.vazio} />}
          acao={{
            titulo: "Tentar de novo",
            testID: "tentar-abrir-de-novo",
            descricao: "Tentar abrir as suas tarefas de novo",
            onPress: () => { setDesistiuDeAbrir(false); void lerDoDisco(); },
          }}
        />
      </View>
    );
  }

  const emAndamento = new Set(rascunhos.map((r) => r.ocorrenciaId));
  const lapides = new Map(coletas.map((c) => [c.ocorrenciaId, c]));
  const devolucoes = devolucoesPorOcorrencia(itensDaFila);

  /*
    AS NOTAS DA LISTA, por ordem de urgência.

    Eram sete blocos condicionais empilhados acima da lista, e cada um que
    nascia ou morria empurrava tudo. Agora são notas, numa faixa de altura
    reservada: a mais urgente aparece, e o `ⓘ` abre todas. Nenhum aviso se
    perdeu e nenhum deles mexe no desenho.
  */
  /*
    O que a tela DESENHA inclui o que já saiu da lista e ainda está saindo dela;
    o que a tela CONTA, não. "3 vistorias para fazer" precisa cair para 2 no
    mesmo instante em que a devolução entra na fila, senão o cabeçalho mente por
    um quarto de segundo em cima do número que decide o dia do agente.

    O disco manda: uma tarefa que voltou para a lista antes de o temporizador
    disparar (uma devolução recusada, por exemplo) sai da despedida, senão ela
    apareceria duas vezes na mesma tela, com a mesma chave.
  */
  const idsNaLista = new Set(naLista.map((t) => t.id));
  const aindaSaindo = saindo.filter((t) => !idsNaLista.has(t.id));
  const idsSaindo = new Set(aindaSaindo.map((t) => t.id));

  /*
    O ITEM ABERTO, resolvido a partir da escolha (ver `Escolha`): a sugerida
    quando ninguém tocou em nada ou quando a escolhida saiu da lista; nenhum
    quando o agente recolheu.

    A PÁGINA cresce até o item aberto. Um despacho novo pode empurrar a
    escolhida para além da quinta posição, e um item aberto que ninguém vê é
    um estado que a tela afirma e não mostra.
  */
  const aberta = itemAberto(escolha, oDia.ordenadas, oDia.sugerida);
  const indiceDaAberta = aberta ? oDia.ordenadas.findIndex((t) => t.id === aberta.id) : -1;
  const naPagina = quantasMostrar(oDia.ordenadas.length, pagina, indiceDaAberta);

  /*
    A ordem do dia manda na lista, e a página corta só ela. Quem já saiu vai no
    fim, SEMPRE desenhado, porque para a tela aquilo já foi: ordenar o que está
    desaparecendo não significa nada, e contá-lo na página esconderia a
    despedida de quem estava olhando.
  */
  const visiveis = [...oDia.ordenadas.slice(0, naPagina), ...aindaSaindo];

  /*
    Quem CHEGOU depois de a lista já estar na tela.

    `jaVistas` só é atualizado no efeito, que roda depois da pintura: na
    renderização em que o despacho novo aparece, ele ainda guarda a lista
    anterior, e é exatamente por isso que a resposta sai certa no primeiro
    quadro, sem piscar. Nula quer dizer primeira pintura, e primeira pintura não
    anima nada.
  */
  const idsJaVistos = jaVistas.current === null
    ? null
    : new Set(jaVistas.current.map((t) => t.id));
  const recemChegada = (id: string) => idsJaVistos !== null && !idsJaVistos.has(id);

  /*
    A ORDEM DA CASCATA, contada entre as NOVAS e não pela posição na lista.

    Quando a coordenação despacha uma rua inteira, seis tarefas chegam na mesma
    resposta: entrando todas no mesmo instante, o agente vê a lista trocar de
    tamanho num quadro, que é o mesmo nada que ele via antes de existir
    animação. Em cascata ele vê chegar, uma depois da outra.

    Contar pela posição na lista inteira daria o efeito certo no caso fácil e
    errado no comum: uma tarefa só, chegando no fim de uma lista de vinte,
    esperaria o teto inteiro antes de aparecer, e a tela ficaria parada
    justamente quando tem novidade. `atrasoEmCascata` já tem teto próprio, para
    o despacho grande não virar espera.
  */
  const ordemDaCascata = new Map<string, number>();
  visiveis.forEach((t) => {
    if (recemChegada(t.id)) ordemDaCascata.set(t.id, ordemDaCascata.size);
  });

  const notas: NotaDaLista[] = [];
  if (avisoDaDevolucao) {
    notas.push({
      chave: "devolucao",
      tom: "perigo",
      resumo: "A devolução não foi registrada",
      detalhe: avisoDaDevolucao,
      aoDispensar: () => { setAvisoDaDevolucao(null); },
    });
  }
  if (!atualizadoEm) {
    notas.push({
      chave: "nunca-baixou",
      tom: "perigo",
      resumo: "Nenhuma tarefa baixada neste aparelho",
      detalhe:
        "Você ainda não baixou nenhuma tarefa neste aparelho. Faça isso com sinal, "
        + "antes de sair, ou não haverá o que vistoriar lá fora.",
    });
  }
  if (falhaDeRede) {
    const frase = comoContarAFalha(
      falhaDeRede,
      "Mostrando a lista que você já tinha baixado.",
    );
    notas.push({
      chave: "rede",
      /*
        Sessão encerrada não é alerta: é o fim da linha para tudo o que esta
        tela existe para fazer. Nenhum despacho novo chega, e o agente pode
        subir o morro com uma lista de ontem achando que é a de hoje. Os outros
        dois fracassos passam sozinhos; este só passa com um ato dele.
      */
      tom: falhaDeRede === "sessao-encerrada" ? "perigo" : "alerta",
      resumo: frase.resumo,
      detalhe: frase.detalhe,
      /*
        DISPENSÁVEL, inclusive o da sessão, e isso é uma decisão.

        O aviso fala de um fato que continua valendo, então ele não expira por
        tempo: sumir sozinho no relógio esconderia que a lista pode estar
        velha. Dispensar é outra coisa, e fala da ATENÇÃO do agente, não do
        fato: ele leu, entendeu e quer a faixa de volta. A próxima tentativa
        que falhar o traz de volta inteiro, e no caso da sessão encerrada toda
        tentativa falha, então ele volta na primeira.
      */
      aoDispensar: () => { setFalhaDeRede(null); },
      /*
        Só a sessão encerrada traz ato, e é porque só ela tem um ato que
        resolve. Sem sinal e "não deu para atualizar agora" se resolvem sozinhos
        quando a rede voltar, e um botão ali seria um botão que não faz nada.
      */
      ...(falhaDeRede === "sessao-encerrada"
        ? {
          acao: {
            rotulo: "Sair e entrar de novo",
            aoTocar: () => void (async () => {
              await sair();
              router.replace("/entrar");
            })(),
          },
        }
        : {}),
    });
  }
  if (listaEnvelheceu(atualizadoEm ? new Date(atualizadoEm) : null, agora) && !!atualizadoEm) {
    notas.push({
      chave: "idade",
      tom: "alerta",
      resumo: "Esta lista tem mais de meia hora",
      detalhe:
        "Esta lista tem mais de meia hora. Se você tem sinal agora, puxe a tela para "
        + "baixo antes de subir: pode ter chegado despacho novo.",
    });
  }
  if (teto !== null) {
    notas.push({
      chave: "teto",
      tom: "alerta",
      resumo: `Mostrando as ${teto} mais urgentes, e há mais`,
      detalhe:
        `Esta lista mostra as ${teto} tarefas mais urgentes da sua equipe, e há mais além `
        + "delas. Trate estas primeiro e atualize a lista: as próximas aparecem quando "
        + "estas saírem.",
    });
  }

  const nota = notas[0] ?? null;
  const coresDaFaixa = nota === null
    ? { fundo: tema.superficie, texto: tema.textoDiscreto }
    : nota.tom === "perigo"
      ? { fundo: tema.perigoFundo, texto: tema.perigoTexto }
      : { fundo: tema.alertaFundo, texto: tema.alertaTexto };

  const SinalDaFaixa = sinal.temSinal ? IconeSinal : IconeSemSinal;
  const IconeDaFaixa = nota === null
    ? SinalDaFaixa
    : nota.tom === "perigo" ? IconePerigo : IconeAlerta;

  /*
    A faixa é a mesma altura SEMPRE, e é isso que impede o pulo.

    Quando não há o que avisar, ela mostra o município e a idade da lista, que
    é a linha que já existia ali. Quando há, ela troca de cor e de frase no
    mesmo espaço. Nenhum pixel a mais, nenhum a menos, e a lista embaixo nunca
    descobre que alguma coisa mudou.
  */
  const FAIXA_RESERVADA = (
    <View
      testID="faixa-de-estado"
      accessibilityLiveRegion="polite"
      style={{
        height: ALTURA_DA_FAIXA,
        backgroundColor: coresDaFaixa.fundo,
        borderRadius: raio.normal,
        paddingHorizontal: espaco.e3,
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e2,
      }}
    >
      <IconeDaFaixa cor={coresDaFaixa.texto} tamanho={tamanhoDeIcone.rotulo} />
      <View style={{ flex: 1 }}>
        <Txt
          variante="corpoP"
          numeroDeLinhas={1}
          cor={coresDaFaixa.texto}
          peso={nota === null ? peso.normal : peso.forte}
        >
          {nota === null
            ? `${identidade?.municipio ?? "Sem município"}, atualizada `
              + `${idadeEmPalavras(atualizadoEm ? new Date(atualizadoEm) : null, agora)}`
              + (atualizando ? " (buscando)" : "")
            : nota.resumo}
        </Txt>
      </View>
      {/*
        O ATO fica na faixa, ao lado do texto, e não atrás do `ⓘ`.

        A faixa tem altura FIXA, e isso não é detalhe: foi ela que resolveu uma
        das três causas do pulo da lista. Então o botão entra aqui dentro, no
        lugar que já existe, em vez de virar um bloco que nasce e some acima da
        rolagem, que era exatamente a causa 2.
      */}
      {nota?.acao && (
        <Botao
          testID="ato-do-aviso"
          titulo={nota.acao.rotulo}
          tipo="secundario"
          /* Sem largura própria: o `Txt` ao lado tem `flex: 1` e cede o que o
             botão precisar, e o alvo de toque do `Botao` já é o do produto. */
          estilo={{ paddingHorizontal: espaco.e3 }}
          onPress={nota.acao.aoTocar}
        />
      )}
      {nota !== null && (
        <BotaoDeInformacao
          testID="detalhe-da-lista"
          rotulo={
            notas.length === 1
              ? "Ver o aviso desta lista por extenso"
              : `Ver os ${notas.length} avisos desta lista por extenso`
          }
          onPress={() => {
            setExplicacao({
              titulo: nota.resumo,
              texto: nota.detalhe,
              extras: notas.slice(1),
              ...(nota.aoDispensar ? { dispensar: nota.aoDispensar } : {}),
            });
          }}
        />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/*
        CABEÇALHO FIXO: ele não rola, e nada dentro dele muda de altura. É a
        metade estrutural da correção do pulo, junto com a faixa reservada.
      */}
      <View style={{ paddingHorizontal: espaco.e4, paddingTop: espaco.e4, gap: espaco.e2 }}>
        {/*
          O NÚMERO GRANDE COM RÓTULO DISCRETO, que é a H2 da régua de
          hierarquia. Era um `h2` com a frase inteira do mesmo tamanho, e uma
          frase inteira do mesmo tamanho não é hierarquia: o olho não tem por
          onde começar. O número é o protagonista desta tela, e é o único da
          tela inteira, pela H1.

          A altura continua CONSTANTE, que é o que a correção do pulo exige: o
          número tem uma linha e o rótulo tem uma, com uma tarefa ou com vinte.
        */}
        <Dado
          testID="quantas-vistorias"
          valor={String(naLista.length)}
          rotulo={naLista.length === 1 ? "vistoria para fazer" : "vistorias para fazer"}
        />
        {FAIXA_RESERVADA}
      </View>

      <FlatList
        ref={rolagem}
        testID="lista-de-tarefas"
        data={visiveis}
        keyExtractor={(t) => t.id}
        /*
          A ÂNCORA. A lista encurta sozinha (devolução confirmada apaga a linha)
          e cresce sozinha (despacho novo entra no topo), e sem isto o item que
          o agente está lendo escorrega debaixo do dedo dele. `minIndexForVisible: 0`
          ancora no primeiro item visível, que é o comportamento certo para uma
          lista em que o que muda quase sempre está ACIMA do que se está lendo.
        */
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}
        refreshControl={
          <RefreshControl
            testID="puxar-para-atualizar"
            /*
              SÓ O DEDO. Ver o comentário de `puxando`, lá em cima: com a roda
              ligada por atualização automática, o iOS desloca o conteúdo para
              revelá-la, e a lista anda sozinha uma vez por minuto.
            */
            refreshing={puxando}
            onRefresh={() => void buscarNaRede(true)}
            tintColor={tema.destaque}
          />
        }
        ListEmptyComponent={
          <Vazio
            titulo="Nenhuma vistoria designada"
            descricao="Quando a coordenação despachar uma ocorrência para a sua equipe, ela aparece aqui."
            icone={<IconeTarefas cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.vazio} />}
            acao={{
              titulo: "Procurar tarefas agora",
              testID: "procurar-tarefas",
              descricao: "Procurar agora se a coordenação despachou alguma tarefa",
              onPress: () => void buscarNaRede(),
            }}
          />
        }
        ListFooterComponent={
          <View style={{ gap: espaco.e4 }}>
            {/*
              "MOSTRAR MAIS" FICA NO FIM, e isso é da correção do pulo: a
              âncora da lista segura o primeiro item visível, e acrescentar
              abaixo dele não move nada que o agente esteja lendo.
            */}
            <RodapeDaPagina
              visiveis={naPagina}
              total={oDia.ordenadas.length}
              aoMostrarMais={() => { setPagina(naPagina + TAMANHO_DA_PAGINA); }}
            />
            <Cartao titulo="Antes de subir">
              <Txt variante="corpoP" discreto>
                Puxe a tela para baixo com sinal para baixar a lista mais recente. O
                que estiver aqui funciona sem conexão nenhuma; o que não estiver, não
                existe no aparelho.
              </Txt>
              {/*
                O botão SOME quando a lista está vazia, e some porque ali ele
                seria o segundo botão com o mesmo verbo na mesma tela: o estado
                vazio, dois dedos acima, já oferece "Procurar tarefas agora".

                Dois botões que fazem a mesma coisa não são generosidade: eles
                fazem a pessoa parar para descobrir a diferença entre os dois, e
                não há diferença. O texto do cartão continua valendo nos dois
                casos, porque ele não é sobre o botão: é sobre o que está
                guardado no aparelho antes de subir o morro.
              */}
              {visiveis.length > 0 && (
                /*
                  Realce: baixar é o que faz a lista ANDAR, e este é o cartão que
                  explica o que está guardado no aparelho antes de subir o morro.
                  Não é primário porque o primário desta tela é "Abrir a
                  vistoria" do item aberto, e uma tela com dois preenchidos de
                  destaque não tem ação principal nenhuma.
                */
                <Botao
                  titulo="Baixar tarefas agora"
                  tipo="realce"
                  onPress={() => void buscarNaRede()}
                  carregando={atualizando}
                />
              )}
            </Cartao>
          </View>
        }
        renderItem={({ item: t }) => {
          const prazo = quantoFalta(t.prazo_em, agora.getTime());
          const comecada = emAndamento.has(t.id);
          /*
            A SUGESTÃO DO DIA é a PRIMEIRA DA LISTA, e não um bloco acima dela.

            Um cartão de "faça isto agora" nascendo e sumindo acima da rolagem
            seria a causa 2 do pulo de volta, com outro nome: ele sumiria assim
            que a lista esvaziasse ou assim que a tarefa saísse, e tudo debaixo
            subiria. A ordem JÁ é a sugestão; o que a primeira posição ganha é o
            rótulo e a frase do porquê, dentro do próprio item, onde nada do
            que está acima se move. E ela entra ABERTA (ver `Escolha`), porque
            é por ela que o dia começa.
          */
          const ehSugerida = oDia.sugerida?.id === t.id;
          const aberto = aberta?.id === t.id;
          const metros = distancias.get(t.id) ?? null;
          /*
            O selo da coleta ja feita.

            Ele responde a pergunta que a lista nao respondia: "eu ja subi
            nessa?". Enquanto faltava sinal, a tarefa concluida ficava aqui
            identica as intocadas, e o agente que abrisse de novo comecava, sem
            saber, a segunda vistoria do mesmo protocolo.

            Sai da lapide, e nao da fila, porque e a lapide que sobrevive ao
            aplicativo ser morto pelo sistema e a fila ser limpa.
          */
          const lapide = lapides.get(t.id) ?? null;
          const selo = seloDaColeta(lapide);

          /*
            A DEVOLUÇÃO só aparece em tarefa VENCIDA, e o prazo aqui é o mesmo
            que a peça desenha: uma conta só, e não duas que divergem. Este é
            um portão de tela, e a tela é a primeira barreira e não a única:
            quem decide de verdade é o relógio do SERVIDOR, que pode recusar,
            porque relógio de aparelho é ajustável e atravessa fuso.
          */
          const impedimento = impedimentoParaDevolver({
            vencida: prazo.vencido,
            /*
              A fila E a lápide. Só a fila deixaria uma janela: a coleta
              confirmada sai da fila em trinta segundos, e a tarefa vencida da
              lista antiga voltaria a oferecer devolução sobre uma vistoria que
              já está no servidor. Lápide `arquivada` não conta: ali o agente
              pediu, com confirmação, para vistoriar de novo.
            */
            coletaNoAparelho: temColetaNaFila(itensDaFila, t.id)
              || (lapide !== null && lapide.situacao !== "arquivada"),
          });
          const devolucaoRecusada: DevolucaoNoAparelho | undefined =
            devolucoes.get(t.id)?.situacao === "recusada" ? devolucoes.get(t.id) : undefined;
          const resultadoDoEnvio = envio?.ocorrenciaId === t.id ? envio : null;

          return (
            <ItemDeLista
              entrando={recemChegada(t.id)}
              saindo={idsSaindo.has(t.id)}
              atraso={atrasoEmCascata(ordemDaCascata.get(t.id) ?? 0)}
            >
              {/*
                O ITEM É A PEÇA DO MAPA, e o que esta tela põe nele é o
                cabeçalho da sugerida, o tipo COBRADE como título do detalhe,
                e os botões. O resumo (protocolo, severidade, endereço, o
                selo da coleta, "vistoria começada", a vulnerabilidade) e o
                detalhe comum (prazo com data, referência, distância e rumo)
                são dela, para a mesma tarefa parecer a mesma coisa nas duas
                abas.

                A sugerida do dia sobe um degrau de elevação, que é a folga
                que o `CLAUDE.md` autoriza desde a emenda de 2026-08-20. Um
                degrau, e só na primeira: três cartões flutuando na mesma
                tela são três cartões que não flutuam.
              */}
              <ItemDeTarefa
                tarefa={t}
                aberto={aberto}
                agora={agora.getTime()}
                agente={ondeEstou}
                metros={metros}
                selo={selo}
                comecada={comecada}
                vulneravel={t.vulnerabilidade_presente}
                reduzir={reduzirMovimento}
                /*
                  A PRIMEIRA PINTURA NÃO ANIMA NADA, e o detalhe da sugerida,
                  que já nasce aberto, obedece: `jaVistas` ainda é nula na
                  renderização em que a lista aparece, que é a mesma marca que
                  impede os cartões de entrarem animados.
                */
                primeiraPintura={idsJaVistos === null}
                nivel={ehSugerida ? "flutuante" : "cartao"}
                titulo={ROTULO_TIPO_COBRADE[t.tipo]}
                cabecalho={ehSugerida ? (
                  <PorqueComecarAqui
                    testID="comece-por-aqui"
                    motivo={oDia.motivo}
                    usouDistancia={oDia.usouDistancia}
                  />
                ) : undefined}
                /*
                  O PORQUÊ da sugestão vai no rótulo do resumo, que é um
                  elemento só para quem ouve. O aviso de que a ordem não
                  considerou distância vai junto: é o que impede o agente de
                  confiar numa ordem que não mediu caminho nenhum.
                */
                cabecalhoEmPalavras={ehSugerida
                  ? `Comece por aqui: ${oDia.motivo}`
                    + (oDia.usouDistancia ? "" : ` ${AVISO_SEM_DISTANCIA}`)
                  : undefined}
                aoAlternar={() => { alternar(t.id); }}
              >
                {/*
                  A RECUSA DO SERVIDOR, no item da tarefa que voltou.

                  Ela fica aqui, e não só na fila de envio, porque é aqui que o
                  agente vai procurar a tarefa que ele achava resolvida. A
                  frase é a que veio do servidor, sem tradução: o aplicativo
                  não sabe o motivo e inventar um seria repetir o defeito do
                  "Arquivada" (ver a fila de envio). O caminho de saída fica
                  na fila, onde o pedido recusado continua.
                */}
                {devolucaoRecusada && (
                  <Aviso tom="perigo" titulo="A coordenação não recebeu esta devolução">
                    {devolucaoRecusada.mensagem
                      ?? "O servidor recusou o pedido, e a tarefa continua sua."}
                    {" O pedido continua na fila de envio, onde você pode tentar de novo ou descartar."}
                  </Aviso>
                )}

                {/* O que aconteceu com o último "Enviar agora" desta tarefa. */}
                {resultadoDoEnvio && (
                  /* Leve pela régua de densidade: este aviso divide o item com
                     o da devolução recusada, e dois retângulos cheios
                     empilhados num item de lista é a poluição que a régua
                     existe para impedir. */
                  <Aviso tom={resultadoDoEnvio.tom} peso="leve" titulo={resultadoDoEnvio.titulo}>
                    {resultadoDoEnvio.texto}
                  </Aviso>
                )}

                {/*
                  O ROXO, na letra de quem paga: "o botão roxo tá lindo". Ele
                  é a ação principal de todo item aberto, e como só um item
                  abre por vez, continua sendo o único primário da tela: uma
                  tela com dois preenchidos de destaque não tem ação principal
                  nenhuma. O rótulo de quem ouve diz de qual protocolo é.
                */}
                <Botao
                  testID={`abrir-a-vistoria-${t.id}`}
                  titulo="Abrir a vistoria"
                  descricao={`Abrir a vistoria do protocolo ${t.protocolo}, ${t.endereco}`}
                  onPress={() => { abrirAVistoria(t.id); }}
                />

                {/*
                  Tarefa NO PRAZO não mostra nada disto, nem o botão nem a
                  explicação: ela não tem por que falar de devolução, e uma
                  frase a mais por tarefa numa lista de vinte é ruído que
                  ensina a não ler.
                */}
                {prazo.vencido && !devolucaoRecusada && (
                  impedimento === null ? (
                    <Botao
                      titulo="Devolver para a coordenação"
                      tipo="secundario"
                      testID={`devolver-${t.id}`}
                      descricao={
                        `Devolver para a coordenação a tarefa vencida do protocolo ${t.protocolo}, `
                        + `${t.endereco}, informando o motivo`
                      }
                      onPress={() => { setADevolver(t); }}
                    />
                  ) : (
                    /*
                      A TAREFA VENCIDA COM COLETA GUARDADA PEDE SINAL, E NÃO
                      DEVOLUÇÃO. Decidido com o Rafa.

                      O parágrafo de 41 palavras que ficava aqui saiu do fluxo:
                      ele é a resposta para "por que não dá para devolver", que
                      é uma pergunta que quase ninguém faz, e ocupava o lugar da
                      resposta para "e agora?", que é a pergunta de todo mundo.
                      Agora o lugar é do verbo que resolve o caso (a vistoria
                      existe e está presa no aparelho), e a explicação fica a um
                      toque no `ⓘ`.

                      É `realce` e não `primario` porque o primário do item é
                      "Abrir a vistoria", logo acima, e um item com dois
                      preenchidos de destaque não tem ação principal nenhuma.
                      Realce é o degrau do ato importante que ajuda: continua
                      preenchido, continua violeta, e continua sendo o que se
                      vê primeiro depois do roxo.

                      Devolver continua bloqueado, e não é teimosia: devolver
                      ali jogaria fora, em silêncio, o trabalho que o agente já
                      fez no morro, e faria a coordenação receber "não deu para
                      vistoriar" sobre uma vistoria que existe.
                    */
                    <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                      {impedimento === "coleta_no_aparelho" && (
                        <View style={{ flex: 1 }}>
                          <Botao
                            titulo="Enviar agora"
                            tipo="realce"
                            testID={`enviar-${t.id}`}
                            carregando={enviando === t.id}
                            descricao={
                              `Enviar agora a vistoria guardada do protocolo ${t.protocolo}, `
                              + `${t.endereco}`
                            }
                            onPress={() => void enviarAgora(t)}
                          />
                        </View>
                      )}
                      <BotaoDeInformacao
                        testID={`por-que-${t.id}`}
                        rotulo={`Por que não dá para devolver a tarefa do protocolo ${t.protocolo}`}
                        onPress={() => {
                          setExplicacao({
                            titulo: "Esta tarefa não pode ser devolvida",
                            texto: FRASE_DO_IMPEDIMENTO[impedimento],
                          });
                        }}
                      />
                    </View>
                  )
                )}
              </ItemDeTarefa>
            </ItemDeLista>
          );
        }}
      />

      {/*
        Um diálogo só para a lista inteira, e não um por tarefa: a lista pode
        ter vinte itens, e vinte `Modal` montados por trás da tela o tempo todo
        é o que faz o aparelho da prefeitura engasgar. Quem responde de qual
        tarefa se fala é o estado, e o protocolo aparece no texto.
      */}
      <DialogoDeDevolucao
        aberto={aDevolver !== null}
        protocolo={aDevolver?.protocolo ?? ""}
        endereco={aDevolver?.endereco ?? ""}
        aoConfirmar={(pedido) => void (async () => {
          /*
            `alvo` sai do fecho desta renderização, e precisa continuar saindo:
            o `Dialogo` chama `aoFechar` ANTES da ação (ver o comentário lá), o
            que zera `aDevolver` antes desta linha rodar. Ler o estado aqui
            devolveria nulo e a devolução simplesmente não aconteceria.

            É essa mesma ordem que deixa o caminho livre para o diálogo da
            explicação: quando a fila recusa, a folha da devolução já saiu, e
            não há duas folhas empilhadas.
          */
          const alvo = aDevolver;
          if (!alvo) return;
          await devolver(alvo, pedido);
        })()}
        aoFechar={() => { setADevolver(null); }}
      />

      {/*
        O diálogo do `ⓘ`. Um só para a tela inteira, pela mesma razão do de
        cima, e ele serve tanto ao aviso da faixa quanto ao impedimento do
        cartão: é sempre a mesma coisa, um texto que não cabia onde estava.
      */}
      <Dialogo
        aberto={explicacao !== null}
        testID="explicacao"
        titulo={explicacao?.titulo ?? ""}
        texto={explicacao?.texto ?? ""}
        conteudo={
          explicacao?.extras && explicacao.extras.length > 0 ? (
            <View style={{ gap: espaco.e3 }}>
              {explicacao.extras.map((outra) => (
                <View key={outra.chave} style={{ gap: espaco.e1 }}>
                  <Txt variante="corpoP" peso={peso.forte}>{outra.resumo}</Txt>
                  <Txt variante="corpoP" discreto>{outra.detalhe}</Txt>
                </View>
              ))}
            </View>
          ) : undefined
        }
        acao={
          explicacao?.dispensar
            ? {
                rotulo: "Dispensar este aviso",
                aoTocar: () => { explicacao.dispensar?.(); setExplicacao(null); },
              }
            : { rotulo: "Entendi", aoTocar: () => { setExplicacao(null); } }
        }
        aoFechar={() => { setExplicacao(null); }}
      />
    </View>
  );
}
