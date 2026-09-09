import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { SemSinal, enderecoDaApi, type Pendencia } from "../../dados/api";
import { atualizarPendencias, baixadasEm, pendenciasGuardadas } from "../../dados/pendencias";
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
import { quantoFalta, seloDaColeta, type ColetaLocal } from "@dc360/campo";

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
  const { obterToken, identidade } = useSessao();

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
  const promoverColetasConfirmadas = useCallback(async () => {
    try {
      const fila = await obterFila(enderecoDaApi(), obterToken);
      for (const item of await fila.itens()) {
        if (item.estado === "confirmado") await marcarEnviada(item.ocorrenciaId);
      }
    } catch {
      /* A fila indisponivel deixa o selo como esta, e nada mais. */
    }
  }, [obterToken]);

  const lerDoDisco = useCallback(async () => {
    await promoverColetasConfirmadas();
    const [guardadas, marcadas, emAndamento, coletadas] = await Promise.all([
      pendenciasGuardadas(), baixadasEm(), listarRascunhos(), listarColetas(),
    ]);
    setTarefas(guardadas);
    setAtualizadoEm(marcadas);
    setRascunhos(emAndamento);
    setColetas(coletadas);
  }, [promoverColetasConfirmadas]);

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

  if (tarefas === null) return <Carregando mensagem="Abrindo suas tarefas" />;

  const emAndamento = new Set(rascunhos.map((r) => r.ocorrenciaId));
  const lapides = new Map(coletas.map((c) => [c.ocorrenciaId, c]));

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
          {tarefas.length === 1 ? "1 vistoria para fazer" : `${tarefas.length} vistorias para fazer`}
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
      </View>

      {tarefas.length === 0 ? (
        <Vazio
          titulo="Nenhuma vistoria designada"
          descricao="Quando a coordenação despachar uma ocorrência para a sua equipe, ela aparece aqui. Puxe a tela para baixo para procurar de novo."
        />
      ) : (
        tarefas.map((t) => {
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
          return (
            <Pressable
              key={t.id}
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

    </ScrollView>
  );
}
