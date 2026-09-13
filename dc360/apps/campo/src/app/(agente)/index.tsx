import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, View } from "react-native";
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
import { espaco, raio, toque } from "../../ui/tokens";
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
 */


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
  const [atualizando, setAtualizando] = useState(false);
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

  const lerDoDisco = useCallback(async () => {
    const naFila = await lerAFila();
    const [guardadas, marcadas, emAndamento, coletadas, cortada] = await Promise.all([
      pendenciasGuardadas(), baixadasEm(), listarRascunhos(), listarColetas(), tetoAtingido(),
    ]);
    setTarefas(guardadas);
    setAtualizadoEm(marcadas);
    setTeto(cortada);
    setRascunhos(emAndamento);
    setColetas(coletadas);
    setItensDaFila(naFila);
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

  const buscarNaRede = useCallback(async () => {
    emVoo.current = true;
    ultimaTentativa.current = Date.now();
    setAtualizando(true);
    setAvisoDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;
      const novas = await atualizarPendencias(token);
      ultimaDeuCerto.current = true;
      setTarefas(novas);
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
      setAvisoDaDevolucao(
        r.motivo === "coleta_na_fila"
          ? FRASE_DO_IMPEDIMENTO.coleta_no_aparelho
          : "Você não está mais com a sessão aberta neste aparelho. Entre de novo "
            + "para devolver a tarefa: a devolução leva o seu nome.",
      );
      return;
    }
    setAvisoDaDevolucao(null);
    await lerDoDisco();
  }

  if (tarefas === null) return <Carregando mensagem="Abrindo suas tarefas" />;

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

  return (
    <ScrollView
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => void buscarNaRede()}
          tintColor={tema.destaque}
        />
      }
    >
      {avisoDeRede && <Aviso tom="alerta">{avisoDeRede}</Aviso>}

      {!atualizadoEm && (
        <Aviso tom="perigo">
          Você ainda não baixou nenhuma tarefa neste aparelho. Faça isso com
          sinal, antes de sair, ou não haverá o que vistoriar lá fora.
        </Aviso>
      )}

      <View style={{ gap: espaco.e1 }}>
        <Txt variante="h2">
          {naLista.length === 1 ? "1 vistoria para fazer" : `${naLista.length} vistorias para fazer`}
        </Txt>
        {/*
          A idade da lista, e não a data cheia.

          O agente decide uma coisa só olhando isto: dá para confiar nesta
          lista, ou preciso procurar sinal antes de subir? "28/08/2026,
          20:52:41" não responde essa pergunta enquanto ele calcula a
          diferença de cabeça, em pé, na chuva. "há 3 min" responde.
        */}
        <Txt variante="legenda" discreto>
          {identidade?.municipio}
          {`, atualizada ${idadeEmPalavras(atualizadoEm ? new Date(atualizadoEm) : null, agora)}`}
          {atualizando ? " (buscando)" : ""}
        </Txt>
        {listaEnvelheceu(atualizadoEm ? new Date(atualizadoEm) : null, agora)
          && !!atualizadoEm && (
          <Aviso tom="alerta">
            Esta lista tem mais de meia hora. Se você tem sinal agora, puxe a
            tela para baixo antes de subir: pode ter chegado despacho novo.
          </Aviso>
        )}
        {/*
          O aviso de lista cortada, e ele existe porque o silêncio é o defeito.

          A rota devolve no máximo um número de tarefas por resposta, para o
          aparelho não baixar tudo no 3G do morro. Sem este aviso, o agente veria
          uma lista aparentemente completa, subiria confiando nela, e as tarefas
          que ficaram de fora simplesmente não existiriam para ele. Cortar é
          aceitável; cortar calado não é.
        */}
        {teto !== null && (
          <Aviso tom="alerta">
            {`Esta lista mostra as ${teto} tarefas mais urgentes da sua equipe, e há mais além delas. `}
            Trate estas primeiro e atualize a lista: as próximas aparecem quando
            estas saírem.
          </Aviso>
        )}
      </View>

      {avisoDaDevolucao && <Aviso tom="alerta">{avisoDaDevolucao}</Aviso>}

      {naLista.length === 0 ? (
        <Vazio
          titulo="Nenhuma vistoria designada"
          descricao="Quando a coordenação despachar uma ocorrência para a sua equipe, ela aparece aqui. Puxe a tela para baixo para procurar de novo."
        />
      ) : (
        naLista.map((t) => {
          const prazo = quantoFalta(t.prazo_em, Date.now());
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
          return (
            <View key={t.id} style={{ gap: espaco.e2 }}>
            <Pressable
              onPress={() => router.push({ pathname: "/(agente)/vistoria/[id]", params: { id: t.id } })}
              accessibilityRole="button"
              /* O selo entra no rotulo tambem: quem usa leitor de tela nao ve
                 nem a borda nem o tique, e a informacao de "isso ja foi
                 coletado" e justamente a que evita a segunda vistoria. */
              accessibilityLabel={
                `Abrir a vistoria do protocolo ${t.protocolo}, ${t.endereco}`
                + (selo ? `. ${selo}` : "")
              }
              style={({ pressed }) => ({
                minHeight: toque,
                backgroundColor: tema.superficie,
                borderRadius: raio.cartao,
                borderWidth: 1,
                // Borda de destaque no que já foi começado: é para lá que o
                // agente volta, e procurar isso numa lista longa custa tempo
                // que ele não tem.
                borderColor: comecada || selo ? tema.destaque : tema.borda,
                padding: espaco.e4,
                gap: espaco.e2,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                <Txt variante="corpoP" mono negrito>{t.protocolo}</Txt>
                <View style={{ flex: 1 }} />
                <SeloSeveridade severidade={t.severidade} />
              </View>

              <Txt variante="h3">{ROTULO_TIPO_COBRADE[t.tipo]}</Txt>
              <Txt variante="corpoP">{t.endereco}</Txt>

              <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
                <Txt
                  variante="legenda"
                  negrito={prazo.atrasado}
                  cor={prazo.atrasado ? tema.perigoTexto : tema.textoDiscreto}
                >
                  {prazo.atrasado ? "! " : ""}{prazo.texto}
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
                {t.vulnerabilidade_presente && (
                  <Txt variante="legenda" negrito cor={tema.alertaTexto}>
                    ! Vulnerabilidade social
                  </Txt>
                )}
                {/*
                  O selo da coleta vem ANTES do "vistoria começada", e os dois
                  nunca aparecem juntos: quando existe lápide que barra, a tela
                  de vistoria não retoma rascunho nenhum, e convidar a
                  "continuar" seria prometer uma tela que não vai abrir.

                  Texto, e nunca só a borda de destaque: a regra do aplicativo
                  é que nada se comunica só por cor, e aqui o que se comunica é
                  se o trabalho está feito.
                */}
                {selo ? (
                  <Txt variante="legenda" negrito cor={tema.destaque}>
                    ✓ {selo}
                  </Txt>
                ) : comecada && (
                  <Txt variante="legenda" negrito cor={tema.destaque}>
                    Vistoria começada, toque para continuar
                  </Txt>
                )}
              </View>
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
              <Aviso tom="perigo">
                {"A coordenação não recebeu esta devolução. "}
                {devolucaoRecusada.mensagem
                  ?? "O servidor recusou o pedido, e a tarefa continua sua."}
                {" O pedido continua na fila de envio, onde você pode tentar de novo ou descartar."}
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
                  Com coleta esperando envio, o botão não existe e a razão fica
                  escrita. Esconder sem dizer nada faria o agente procurar o
                  botão que o colega tem; devolver ali jogaria fora, em silêncio,
                  a vistoria que ele fez no morro.
                */
                <Txt variante="legenda" discreto>
                  {FRASE_DO_IMPEDIMENTO[impedimento]}
                </Txt>
              )
            )}
            </View>
          );
        })
      )}

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
          const alvo = aDevolver;
          if (!alvo) return;
          await devolver(alvo, pedido);
        })()}
        aoFechar={() => { setADevolver(null); }}
      />

    </ScrollView>
  );
}
