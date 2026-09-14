import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { SemSinal, enderecoDaApi, type Pendencia } from "../../dados/api";
import {
  atualizarPendencias, baixadasEm, esquecerPendencia, pendenciasGuardadas, tetoAtingido,
} from "../../dados/pendencias";
import { listarColetas, marcarEnviada } from "../../dados/coletas";
import { obterFila } from "../../dados/fila";
import { listarRascunhos, type Rascunho } from "../../dados/rascunho";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, SeloSeveridade, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { Chip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAlerta, IconeAparelho, IconeInformacao, IconePerigo, IconePrazo, IconePrazoVencido,
  IconeSemSinal, IconeSinal, IconeTarefas, IconeVulnerabilidade,
} from "../../ui/icones";
import {
  borda, elevacao, espaco, icone as tamanhoDeIcone, opacidade, peso, raio, toque,
} from "../../ui/tokens";
import {
  INTERVALO_PADRAO_MS, deveAtualizar, idadeEmPalavras, listaEnvelheceu,
} from "../../dados/atualizacao";
import {
  FRASE_DO_IMPEDIMENTO,
  dataDoPrazo,
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
  /** O agente pode fazer este aviso sair. Só o que fala de um ato dele. */
  dispensavel?: boolean;
};

/** O que o `ⓘ` abre: um texto com título, e às vezes com um ato junto. */
type Explicacao = {
  titulo: string;
  texto: string;
  extras?: NotaDaLista[];
  dispensar?: boolean;
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
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={({ pressed }) => ({
        minHeight: toque,
        minWidth: toque,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: raio.normal,
        opacity: pressed ? opacidade.aoToque : 1,
      })}
    >
      <IconeInformacao cor={tema.destaque} tamanho={tamanhoDeIcone.acao} />
    </Pressable>
  );
}

export default function Tarefas() {
  const tema = useTema();
  const sinal = useSinal();
  const { obterToken, identidade, lerIdentidade } = useSessao();

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
  const [avisoDeRede, setAvisoDeRede] = useState<string | null>(null);

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
    setAvisoDeRede(null);
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
      setAvisoDeRede(
        erro instanceof SemSinal
          ? "Sem sinal para atualizar. Mostrando a lista que você já tinha baixado."
          : "Não deu para atualizar agora. Mostrando a lista que você já tinha baixado.",
      );
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
  }, [lerDoDisco, atualizarSeValer]));

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
    A tarefa com devolução A CAMINHO sai da lista na hora, e essa é a metade
    visível do pedido. A outra metade é que ela continua no aparelho, visível na
    fila de envio, até o servidor confirmar: item que some antes de o servidor
    saber é a forma mais cara de perder informação neste produto.

    A tarefa com devolução RECUSADA volta para cá, e o cartão dela diz a frase
    que veio do servidor. Some daqui sem a coordenação ter recebido seria o pior
    dos dois mundos: ninguém foi lá e ninguém sabe disso.
  */
  const naLista = tarefas.filter(
    (t) => devolucoes.get(t.id)?.situacao !== "a_caminho",
  );

  /*
    AS NOTAS DA LISTA, por ordem de urgência.

    Eram sete blocos condicionais empilhados acima da lista, e cada um que
    nascia ou morria empurrava tudo. Agora são notas, numa faixa de altura
    reservada: a mais urgente aparece, e o `ⓘ` abre todas. Nenhum aviso se
    perdeu e nenhum deles mexe no desenho.
  */
  const notas: NotaDaLista[] = [];
  if (avisoDaDevolucao) {
    notas.push({
      chave: "devolucao",
      tom: "perigo",
      resumo: "A devolução não foi registrada",
      detalhe: avisoDaDevolucao,
      dispensavel: true,
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
  if (avisoDeRede) {
    notas.push({
      chave: "rede",
      tom: "alerta",
      resumo: sinal.temSinal ? "Não deu para atualizar agora" : "Sem sinal para atualizar",
      detalhe: avisoDeRede,
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
              ...(nota.dispensavel ? { dispensar: true } : {}),
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
        <Txt variante="h2">
          {naLista.length === 1 ? "1 vistoria para fazer" : `${naLista.length} vistorias para fazer`}
        </Txt>
        {FAIXA_RESERVADA}
      </View>

      <FlatList
        testID="lista-de-tarefas"
        data={naLista}
        keyExtractor={(t) => t.id}
        /*
          A ÂNCORA. A lista encurta sozinha (devolução confirmada apaga a linha)
          e cresce sozinha (despacho novo entra no topo), e sem isto o item que
          o agente está lendo escorrega debaixo do dedo dele. `minIndexForVisible: 0`
          ancora no primeiro item visível, que é o comportamento certo para uma
          lista em que o que muda quase sempre está ACIMA do que se está lendo.
        */
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}
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
          <Cartao titulo="Antes de subir">
            <Txt variante="corpoP" discreto>
              Puxe a tela para baixo com sinal para baixar a lista mais recente. O
              que estiver aqui funciona sem conexão nenhuma; o que não estiver, não
              existe no aparelho.
            </Txt>
            <Botao
              titulo="Baixar tarefas agora"
              tipo="secundario"
              onPress={() => void buscarNaRede()}
              carregando={atualizando}
            />
          </Cartao>
        }
        renderItem={({ item: t }) => {
          const prazo = quantoFalta(t.prazo_em, agora.getTime());
          const comecada = emAndamento.has(t.id);
          /*
            O selo da coleta ja feita.

            Ele responde a pergunta que a lista nao respondia: "eu ja subi
            nessa?". Enquanto faltava sinal, a tarefa concluida ficava aqui
            identica as intocadas, e o agente que abrisse de novo comecava, sem
            saber, a segunda vistoria do mesmo protocolo.

            Sai da lapide, e nao da fila, porque e a lapide que sobrevive ao
            aplicativo ser morto pelo sistema e a fila ser limpa.
          */
          const selo = seloDaColeta(lapides.get(t.id) ?? null);

          /*
            A DEVOLUÇÃO só aparece em tarefa VENCIDA, e o prazo aqui é o mesmo
            que a linha acima já mostra: uma conta só, e não duas que divergem.
            Este é um portão de tela, e a tela é a primeira barreira e não a
            única: quem decide de verdade é o relógio do SERVIDOR, que pode
            recusar, porque relógio de aparelho é ajustável e atravessa fuso.
          */
          const lapide = lapides.get(t.id) ?? null;
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

          const IconeDoPrazo = prazo.atrasado ? IconePrazoVencido : IconePrazo;
          const corDoPrazo = prazo.atrasado ? tema.perigoTexto : tema.textoDiscreto;
          const resultadoDoEnvio = envio?.ocorrenciaId === t.id ? envio : null;

          return (
            <View style={{ gap: espaco.e2 }}>
            <Pressable
              onPress={() => router.push({ pathname: "/(agente)/vistoria/[id]", params: { id: t.id } })}
              accessibilityRole="button"
              /* O selo entra no rotulo tambem: quem usa leitor de tela nao ve
                 nem a borda nem o tique, e a informacao de "isso ja foi
                 coletado" e justamente a que evita a segunda vistoria. */
              accessibilityLabel={
                `Abrir a vistoria do protocolo ${t.protocolo}, ${t.endereco}`
                + (selo ? `. ${selo}` : "")
                /* A tarja de vulnerabilidade é desenho, e o cartão inteiro é
                   um elemento só para quem ouve a tela: sem esta linha, o
                   cuidado prioritário simplesmente não existiria ali. */
                + (t.vulnerabilidade_presente ? ". Vulnerabilidade social" : "")
              }
              style={({ pressed }) => ({
                minHeight: toque,
                ...elevacao(tema).cartao,
                /*
                  A BORDA DE DESTAQUE ACENDE SÓ NO TRABALHO COMEÇADO.

                  Antes ela acendia para "começada" E para "coletada", que são
                  estados OPOSTOS: um é trabalho pela metade, para onde o agente
                  precisa voltar, e o outro é trabalho pronto, de onde ele não
                  precisa voltar nunca. Com a mesma borda, a lista destacava as
                  duas coisas do mesmo jeito e não destacava nenhuma. Quem diz
                  "coletada" agora é o chip, que é pílula, tem símbolo e é muito
                  mais visível do que a linha de 12 pontos que havia ali.
                */
                borderColor: comecada ? tema.destaque : tema.borda,
                borderWidth: comecada ? borda.enfase : borda.fio,
                borderRadius: raio.cartao,
                padding: espaco.e4,
                gap: espaco.e3,
                opacity: pressed ? opacidade.aoToque : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                <Txt variante="corpoP" mono negrito>{t.protocolo}</Txt>
                <View style={{ flex: 1 }} />
                <SeloSeveridade severidade={t.severidade} />
              </View>

              <Txt variante="h3">{ROTULO_TIPO_COBRADE[t.tipo]}</Txt>
              <Txt variante="corpoP">{t.endereco}</Txt>

              {/*
                O PRAZO GANHOU A LINHA DELE, e essa é a hierarquia que faltava.

                Antes, prazo, data, vulnerabilidade e estado da coleta eram
                quatro fragmentos de 12 pontos no mesmo `flexWrap`, com o mesmo
                peso: "Vencido há 73h" pesava igual a "10/09, 14:00". Agora o
                prazo é a linha, com ícone e no corpo do texto; a data fica ao
                lado, em legenda discreta, porque ela QUALIFICA o prazo em vez
                de competir com ele; e o que é estado virou chip embaixo.
              */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                <IconeDoPrazo cor={corDoPrazo} tamanho={tamanhoDeIcone.rotulo} />
                <Txt
                  variante="corpoP"
                  peso={prazo.atrasado ? peso.negrito : peso.forte}
                  cor={corDoPrazo}
                >
                  {prazo.texto}
                </Txt>
                {/*
                  A DATA ao lado do relativo. "Vence em 9h" não diz ao agente se
                  o prazo cai dentro do turno dele ou já na madrugada, e é essa
                  distinção que decide se ele sobe hoje ou passa a tarefa.
                */}
                {!!dataDoPrazo(t.prazo_em) && (
                  <Txt variante="legenda" cor={tema.textoDiscreto}>
                    {dataDoPrazo(t.prazo_em)}
                  </Txt>
                )}
              </View>

              {/*
                A VULNERABILIDADE NÃO É UM CHIP, e a diferença é deliberada.

                Ela e o estado da coleta eram dois fragmentos de 12 pontos lado
                a lado, e são coisas de naturezas diferentes: uma fala do LUGAR
                (há quem precise de cuidado prioritário naquele endereço) e a
                outra fala do MEU TRABALHO. Misturar as duas numa fileira de
                pílulas faria a mais grave parecer mais uma etiqueta. Aqui ela
                é uma tarja própria, do lado alerta do tema, com o ícone do
                conjunto e a palavra inteira.

                O nome e a descrição de quem é NÃO aparecem, e isso é decisão
                de privacidade já registrada em `docs/PRIVACIDADE.md`: a lista
                diz que há cuidado prioritário, e nunca quem.
              */}
              {t.vulnerabilidade_presente && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: espaco.e2,
                    backgroundColor: tema.alertaFundo,
                    borderRadius: raio.normal,
                    paddingHorizontal: espaco.e3,
                    paddingVertical: espaco.e2,
                  }}
                >
                  <IconeVulnerabilidade cor={tema.alertaTexto} tamanho={tamanhoDeIcone.rotulo} />
                  <Txt variante="corpoP" peso={peso.forte} cor={tema.alertaTexto}>
                    Vulnerabilidade social
                  </Txt>
                </View>
              )}

              {/*
                O chip do ESTADO DA COLETA, e nunca só a borda de destaque: a
                regra do aplicativo é que nada se comunica só por cor, e o
                `Chip` leva isso no tipo (o símbolo é obrigatório) e no tamanho
                (`corpoP`, acima do mínimo de fonte, contra os 12 pontos de
                antes).

                O selo da coleta vem ANTES do "vistoria começada", e os dois
                nunca aparecem juntos: quando existe lápide que barra, a tela
                de vistoria não retoma rascunho nenhum, e convidar a
                "continuar" seria prometer uma tela que não vai abrir.
              */}
              {(selo || comecada) && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
                  {selo ? (
                    <Chip texto={selo} simbolo="✓" tom="ok" />
                  ) : (
                    /*
                      Reticências como símbolo, e não seta: seta neste
                      aplicativo significa ENVIO (é o símbolo da fila), e
                      "vistoria começada" é o contrário disso, é trabalho que
                      nem saiu do aparelho ainda.
                    */
                    <Chip
                      texto="Vistoria começada"
                      simbolo="…"
                      tom="neutro"
                      descricao="Vistoria começada neste aparelho, toque no cartão para continuar"
                    />
                  )}
                </View>
              )}
            </Pressable>

            {/*
              A RECUSA DO SERVIDOR, no cartão da tarefa que voltou.

              Ela fica aqui, e não só na fila de envio, porque é aqui que o
              agente vai procurar a tarefa que ele achava resolvida. A frase é a
              que veio do servidor, sem tradução: o aplicativo não sabe o motivo
              e inventar um seria repetir o defeito do "Arquivada" (ver a fila
              de envio). O caminho de saída fica na fila, onde o pedido recusado
              continua, com os verbos de tentar de novo e descartar.
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
              <Aviso tom={resultadoDoEnvio.tom} titulo={resultadoDoEnvio.titulo}>
                {resultadoDoEnvio.texto}
              </Aviso>
            )}

            {/*
              Tarefa NO PRAZO não mostra nada disto, nem o botão nem a
              explicação: ela não tem por que falar de devolução, e uma frase a
              mais por tarefa numa lista de vinte é ruído que ensina a não ler.
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

                  O parágrafo de 41 palavras que ficava aqui saiu do fluxo: ele
                  é a resposta para "por que não dá para devolver", que é uma
                  pergunta que quase ninguém faz, e ocupava o lugar da resposta
                  para "e agora?", que é a pergunta de todo mundo. Agora o lugar
                  é do verbo que resolve o caso (a vistoria existe e está presa
                  no aparelho), e a explicação fica a um toque no `ⓘ`.

                  Devolver continua bloqueado, e não é teimosia: devolver ali
                  jogaria fora, em silêncio, o trabalho que o agente já fez no
                  morro, e faria a coordenação receber "não deu para vistoriar"
                  sobre uma vistoria que existe.
                */
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                  {impedimento === "coleta_no_aparelho" && (
                    <View style={{ flex: 1 }}>
                      <Botao
                        titulo="Enviar agora"
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
            </View>
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
                aoTocar: () => { setAvisoDaDevolucao(null); setExplicacao(null); },
              }
            : { rotulo: "Entendi", aoTocar: () => { setExplicacao(null); } }
        }
        aoFechar={() => { setExplicacao(null); }}
      />
    </View>
  );
}
