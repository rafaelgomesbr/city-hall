import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import {
  quantoFalta, seloDaColeta, type ColetaLocal, type ItemFila,
} from "@dc360/campo";

import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";

import { enderecoDaApi, type Pendencia } from "../../dados/api";
import { listarColetas } from "../../dados/coletas";
import { obterFila } from "../../dados/fila";
import { pendenciasGuardadas } from "../../dados/pendencias";
import { useSessao } from "../../dados/sessao";
import { distanciaEmTexto, rotaEsquematica, type Ponto } from "../../dados/mapa";
import {
  AVISO_SEM_DISTANCIA,
  coletadasNoAparelho,
  ordemDoDia,
  pontoDaTarefa,
  pontoQueSeMede,
  tarefasDoDia,
} from "../../dados/ordem-do-dia";
import {
  Botao, Cartao, Carregando, Dado, Tocavel, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { Chip, SeloSeveridade } from "../../ui/Chip";
import { MapaDoImovel, useMapaDoMunicipio, type PinoNoMapa } from "../../ui/mapa";
import { IconeLocalizacao, IconeTarefas } from "../../ui/icones";
import {
  borda, espaco, icone as tamanhoDeIcone, raio, toque,
} from "../../ui/tokens";

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
 * existia para mostrar. Uma tela dedicada não tem folha nenhuma: o mapa, o
 * cartão da escolhida e a lista dividem a tela, e nada fica por cima de nada.
 *
 * **A defesa continua montada, e mudou de lugar.** O que impedia as duas visões
 * de discordar nunca foi estarem na mesma tela: era consumirem a mesma regra.
 * A regra está em `src/dados/ordem-do-dia.ts` (`tarefasDoDia`,
 * `coletadasNoAparelho`, `ordemDoDia`), as duas telas a consomem sobre a mesma
 * leitura de disco, e `src/__tests__/mapa-tela-dedicada.test.tsx` compara as
 * duas item a item, que é o mesmo caso que comparava as duas lentes antes.
 *
 * **E ela continua sendo o mapa DELE, não o do coordenador.** O outro argumento
 * que existia no código ("um mapa só, do imóvel focado, e não N pinos
 * espalhados") tinha esse medo dentro: o agente cair na visão geral do
 * município. Nada aqui busca ocorrência nenhuma. Os pinos são exatamente as
 * tarefas da lista dele, na ordem da lista dele; ocorrência de outra equipe não
 * está no aparelho e não aparece aqui.
 *
 * ## O que ela não faz: rede
 *
 * Esta tela LÊ o disco e não baixa nada. Quem baixa é a tela de tarefas, que
 * tem o gesto de puxar, o relógio e a conversa com a fila. O disco é a fonte
 * das duas, e o foco relê: como as abas não aparecem ao mesmo tempo, não há
 * instante em que uma mostre uma lista e a outra mostre outra.
 */

/**
 * QUANTO DA TELA É MAPA, e por que isto não é `flex: 1`.
 *
 * Três blocos dividem a altura: o mapa, o cartão da escolhida e a lista. Com
 * dois `flex: 1` (mapa e lista) e um cartão de altura natural no meio, num
 * aparelho pequeno os dois flexíveis dividem o que sobra do cartão e o mapa
 * fica com uma faixa de nada, que é o contrário do que esta tela existe para
 * fazer. Com fração da tela, o mapa tem presença garantida e quem se ajusta é a
 * lista, que ROLA: espremer o que rola custa um gesto, espremer o que não rola
 * custa a informação.
 *
 * O piso e o teto existem pelas duas pontas do parque de aparelhos: num
 * telefone pequeno a fração deixaria o mapa menor do que a legenda que ele
 * carrega, e num tablet ela empurraria o cartão para fora da tela.
 */
const FRACAO_DA_TELA_NO_MAPA = 0.38;
const MAPA_MINIMO = 200;
const MAPA_MAXIMO = 420;

/** Só o que esta tela precisa saber de uma tarefa para desenhá-la. */
type TarefaNoMapa = Pendencia;

/**
 * A GRAVIDADE EM PALAVRA, para o rótulo do pino.
 *
 * Quem ouve a tela não vê nem a cor nem a forma do pino: sem esta frase, o mapa
 * dele é um punhado de botões sem gravidade nenhuma. As palavras são as MESMAS
 * do `SeloSeveridade` ("Severidade crítica", "Severidade ainda não
 * classificada"), e não uma segunda redação: a mesma tarefa lida no pino e no
 * cartão precisa soar igual, senão parecem duas coisas diferentes.
 */
function gravidadeEmPalavra(severidade: Severidade | null): string {
  return severidade
    ? `Severidade ${ROTULO_SEVERIDADE[severidade].toLowerCase()}`
    : "Severidade ainda não classificada";
}

/**
 * A LINHA DA LISTA, que escolhe e não navega.
 *
 * Tocar aqui NÃO abre a vistoria, e isso é deliberado: nesta tela a lista é o
 * roteiro e o mapa é a resposta. Quem abre é o botão do cartão da escolhida,
 * que está no alcance do polegar e não se move. Se a linha abrisse a vistoria,
 * a tela seria uma lista com um mapa em cima, e olhar onde fica a terceira
 * tarefa custaria sair da tela e voltar.
 *
 * No nível do módulo, e não dentro da tela, porque componente declarado dentro
 * de outro é um tipo novo a cada renderização: o React desmonta e remonta a
 * subárvore inteira a cada toque.
 */
function LinhaDaTarefa({ tarefa, escolhida, prazo, metros, selo, aoEscolher }: {
  tarefa: TarefaNoMapa;
  escolhida: boolean;
  prazo: string;
  metros: number | null;
  selo: string | null;
  aoEscolher: () => void;
}) {
  const tema = useTema();
  return (
    <Tocavel
      testID={`escolher-${tarefa.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected: escolhida }}
      accessibilityLabel={
        `Ver no mapa o protocolo ${tarefa.protocolo}, ${tarefa.endereco}. ${prazo}`
        + (metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`)
        + (selo ? `. ${selo}` : "")
      }
      onPress={aoEscolher}
      estilo={{
        minHeight: toque,
        padding: espaco.e3,
        gap: espaco.e1,
        borderRadius: raio.cartao,
        borderWidth: escolhida ? borda.enfase : borda.fio,
        borderColor: escolhida ? tema.destaque : tema.borda,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
        <Txt variante="corpoP" mono negrito>{tarefa.protocolo}</Txt>
        <View style={{ flex: 1 }} />
        <SeloSeveridade severidade={tarefa.severidade} />
      </View>
      <Txt variante="corpoP" numeroDeLinhas={1}>{tarefa.endereco}</Txt>
      <Txt nivel="apoio">
        {prazo}
        {metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`}
      </Txt>
      {/* O mesmo `Chip` do cartão da lista de tarefas, e não um texto parecido:
          duas peças para o mesmo fato divergem na primeira edição. */}
      {!!selo && (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Chip texto={selo} simbolo="✓" tom="ok" />
        </View>
      )}
    </Tocavel>
  );
}

/**
 * O CARTÃO DA ESCOLHIDA: o que o toque no pino abre.
 *
 * É ele que cumpre a outra metade da regra de severidade. O pino leva cor e
 * forma, a legenda ao lado do mapa diz a palavra de cada forma, e aqui a
 * gravidade aparece por extenso, no `SeloSeveridade`, com ícone e nome. Nenhum
 * dos três canais depende de enxergar cor.
 *
 * A distância e o rumo saem de `rotaEsquematica`, com a frase já pronta, e não
 * de uma segunda conta escrita aqui: duas contas para o mesmo fato divergem, e
 * a que diverge é a que manda o agente para o lado errado do morro.
 */
function CartaoDaEscolhida({ tarefa, agente, prazo, selo }: {
  tarefa: TarefaNoMapa;
  agente: Ponto | null;
  prazo: string;
  selo: string | null;
}) {
  const ponto = pontoDaTarefa(tarefa);
  const rota = ponto ? rotaEsquematica(agente, ponto) : null;

  const ondeFica = !ponto
    ? "A coordenação não informou onde fica este imóvel. O endereço e o ponto de "
      + "referência estão na vistoria, e é por eles que se chega."
    : rota
      ? rota.frase
      : "Sem GPS: sem distância e sem rumo até este imóvel. O endereço e o ponto "
        + "de referência estão na vistoria.";

  return (
    <Cartao nivel="flutuante">
      <View testID="cartao-da-escolhida" style={{ gap: espaco.e2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          <Txt variante="corpoP" mono negrito>{tarefa.protocolo}</Txt>
          <View style={{ flex: 1 }} />
          <SeloSeveridade severidade={tarefa.severidade} />
        </View>
        <Txt variante="corpo">{tarefa.endereco}</Txt>
        {/*
          O PONTO DE REFERÊNCIA cabe em UMA linha, e é o que faz achar a casa.

          Endereço de morro raramente tem placa, e "a casa azul depois da
          padaria" é o que resolve a chegada. Uma linha só porque o campo é
          livre e vem do telefone da coordenação: sem o corte, um parágrafo
          empurraria o botão para fora da tela num aparelho pequeno.
        */}
        {!!tarefa.ponto_referencia && (
          <Txt nivel="apoio" numeroDeLinhas={1}>{`Referência: ${tarefa.ponto_referencia}`}</Txt>
        )}
        <Txt nivel="apoio">{prazo}</Txt>
        {/*
          A frase de `rotaEsquematica` traz a distância E o rumo por extenso, e
          é a única linha de medida do cartão. A versão em sigla e grau
          ("1,1 km · rumo N (0°)") existe no desenho do plano, embaixo do mapa,
          e repeti-la aqui seria dizer o mesmo número duas vezes numa tela em
          que cada linha custa altura da lista.
        */}
        <Txt variante="corpoP">{ondeFica}</Txt>
        {!!selo && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Chip texto={selo} simbolo="✓" tom="ok" />
          </View>
        )}
        <Botao
          titulo="Abrir a vistoria"
          testID="abrir-a-vistoria"
          descricao={`Abrir a vistoria do protocolo ${tarefa.protocolo}, ${tarefa.endereco}`}
          onPress={() => router.push({
            pathname: "/(agente)/vistoria/[id]",
            params: { id: tarefa.id },
          })}
        />
      </View>
    </Cartao>
  );
}

export default function Mapa() {
  const tema = useTema();
  const { height: alturaDaTela } = useWindowDimensions();
  const alturaDoMapa = Math.min(
    MAPA_MAXIMO, Math.max(MAPA_MINIMO, alturaDaTela * FRACAO_DA_TELA_NO_MAPA),
  );
  const { obterToken, lerIdentidade } = useSessao();

  const [tarefas, setTarefas] = useState<TarefaNoMapa[] | null>(null);
  const [coletas, setColetas] = useState<ColetaLocal[]>([]);
  const [itensDaFila, setItensDaFila] = useState<ItemFila[]>([]);
  const [desistiuDeAbrir, setDesistiuDeAbrir] = useState(false);
  /** Qual tarefa o cartão está mostrando. Nulo quer dizer "a sugerida do dia". */
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);

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

  /** Metros até cada tarefa, quando há como medir. Para a linha não recalcular. */
  const distancias = useMemo(
    () => new Map(oDia.lugares.map((l) => [l.tarefa.id, l.distanciaM])),
    [oDia],
  );
  const lapides = useMemo(
    () => new Map(coletas.map((c) => [c.ocorrenciaId, c])),
    [coletas],
  );

  /*
    A ESCOLHIDA volta a ser a sugerida do dia quando a que estava escolhida sai
    da lista (a coordenação encerrou, outra equipe pegou). Sem isto, o cartão
    ficaria falando de uma casa que não é mais da conta dele, e o mapa apontaria
    para ela, sem nada na tela dizendo por quê.
  */
  const escolhida = oDia.ordenadas.find((t) => t.id === escolhidaId) ?? oDia.sugerida;

  /*
    OS PINOS, que são as tarefas da lista que TÊM ponto, na ordem da lista.

    `pontoDaTarefa` é `pontoQueSeMede` aplicado à ocorrência: coordenada nula,
    ilegível ou 0,0 não é ponto, é ausência de ponto. Um pino na ilha nula seria
    o mapa afirmando um lugar que ninguém informou, e ele arrastaria o
    enquadramento de todos os outros para o meio do Atlântico.
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
      escolhido: escolhida?.id === t.id,
      /*
        O pino é UM elemento para quem ouve a tela, e o rótulo dele carrega o
        que o cartão vai mostrar: protocolo, endereço, prazo e distância. Sem
        isso, quem navega por leitor de tela ouviria "botão" numa figura no meio
        de um mapa e teria que tocar para descobrir o que é.
      */
      rotulo:
        `Ver o protocolo ${t.protocolo}, ${t.endereco}. ${gravidadeEmPalavra(t.severidade)}`
        + `. ${prazo.texto}`
        + (metros === null ? "" : `, a ${distanciaEmTexto(metros)} de você`),
      aoTocar: () => { setEscolhidaId(t.id); },
    }];
  }), [oDia, agora, distancias, escolhida]);

  const semCoordenada = naLista.length - pinos.length;

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
    <View style={{ flex: 1 }} testID="tela-do-mapa">
      <View style={{ paddingHorizontal: espaco.e4, paddingTop: espaco.e4, gap: espaco.e2 }}>
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

      <View
        testID="area-do-mapa"
        /*
          A altura fixa é do MAPA. O estado vazio ocupa o que sobra, e não a
          mesma faixa: um aviso de "nenhuma tarefa sua tem coordenada" preso
          numa moldura do tamanho de um mapa fica com o texto espremido em cima
          e um vão embaixo, e parece defeito de desenho em vez de resposta.
        */
        style={{
          ...(pinos.length > 0 ? { height: alturaDoMapa } : { flex: 1 }),
          paddingHorizontal: espaco.e4,
          paddingTop: espaco.e3,
        }}
      >
        {pinos.length > 0 ? (
          <MapaDoImovel
            pinos={pinos}
            agente={ondeEstou}
            mapa={mapaDaTela}
            /*
              A moldura ocupa o que sobra, e as legendas ficam FORA dela. Ver
              `altura` em `MapaDoImovel`: a de modo não pode ser empurrada para
              fora da tela por um mapa que cresceu, porque é ela que responde
              para onde a coordenada das famílias está indo.
            */
            altura="preencher"
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center" }}>
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

      {escolhida && (
        <View style={{ paddingHorizontal: espaco.e4, paddingTop: espaco.e3 }}>
          <CartaoDaEscolhida
            tarefa={escolhida}
            agente={ondeEstou}
            prazo={quantoFalta(escolhida.prazo_em, agora.getTime()).texto}
            selo={seloDaColeta(lapides.get(escolhida.id) ?? null)}
          />
        </View>
      )}

      {/*
        A LISTA INTEIRA embaixo, e ela é a mesma lista da tela de tarefas.

        Ela existe aqui porque o mapa responde "onde" e não responde "em que
        ordem": a ordem do dia é uma sequência, e sequência se lê em lista. E
        porque a tarefa sem coordenada não tem pino: sem a lista, ela
        desapareceria desta tela, que é exatamente o tipo de sumiço silencioso
        que este produto não pode ter.
      */}
      <ScrollView
        testID="lista-do-mapa"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: espaco.e4, gap: espaco.e3 }}
      >
        {oDia.ordenadas.map((t) => (
          <LinhaDaTarefa
            key={t.id}
            tarefa={t}
            escolhida={escolhida?.id === t.id}
            prazo={quantoFalta(t.prazo_em, agora.getTime()).texto}
            metros={distancias.get(t.id) ?? null}
            selo={seloDaColeta(lapides.get(t.id) ?? null)}
            aoEscolher={() => { setEscolhidaId(t.id); }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
