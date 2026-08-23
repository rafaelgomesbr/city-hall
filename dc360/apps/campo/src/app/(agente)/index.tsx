import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { SemSinal, type Pendencia } from "../../dados/api";
import { atualizarPendencias, baixadasEm, pendenciasGuardadas } from "../../dados/pendencias";
import { listarRascunhos, type Rascunho } from "../../dados/rascunho";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, SeloSeveridade, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { espaco, raio, toque } from "../../ui/tokens";

/**
 * As tarefas do agente.
 *
 * A tela abre do DISCO, sempre, e só depois tenta atualizar pela rede. A ordem
 * inversa é o erro clássico de aplicativo offline: a tela fica girando
 * esperando uma rede que não existe, e o agente, que tem a lista guardada ali
 * no aparelho, não consegue vê-la.
 */

function quantoFalta(prazo: string | null): { texto: string; atrasado: boolean } {
  if (!prazo) return { texto: "Sem prazo definido", atrasado: false };
  const restante = new Date(prazo).getTime() - Date.now();
  const horas = Math.round(restante / 3_600_000);
  if (restante < 0) {
    const atraso = Math.abs(horas);
    return {
      texto: atraso < 1 ? "Prazo vencido" : `Vencido há ${atraso}h`,
      atrasado: true,
    };
  }
  if (horas < 1) return { texto: "Vence em menos de 1h", atrasado: true };
  return { texto: `Vence em ${horas}h`, atrasado: horas <= 4 };
}

export default function Tarefas() {
  const tema = useTema();
  const sinal = useSinal();
  const { obterToken, identidade } = useSessao();

  const [tarefas, setTarefas] = useState<Pendencia[] | null>(null);
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [avisoDeRede, setAvisoDeRede] = useState<string | null>(null);

  const lerDoDisco = useCallback(async () => {
    const [guardadas, marcadas, emAndamento] = await Promise.all([
      pendenciasGuardadas(), baixadasEm(), listarRascunhos(),
    ]);
    setTarefas(guardadas);
    setAtualizadoEm(marcadas);
    setRascunhos(emAndamento);
  }, []);

  const buscarNaRede = useCallback(async () => {
    setAtualizando(true);
    setAvisoDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;
      const novas = await atualizarPendencias(token);
      setTarefas(novas);
      setAtualizadoEm(await baixadasEm());
    } catch (erro: unknown) {
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
      setAtualizando(false);
    }
  }, [obterToken]);

  // Ao voltar de uma vistoria, os rascunhos mudaram: relê o disco.
  useFocusEffect(useCallback(() => { void lerDoDisco(); }, [lerDoDisco]));

  useEffect(() => {
    void (async () => {
      await lerDoDisco();
      if (sinal.temSinal) await buscarNaRede();
    })();
    // Só na montagem: atualizar a cada mudança de sinal encheria a rede de
    // requisições numa área de sombra, onde o sinal pisca a cada segundo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tarefas === null) return <Carregando mensagem="Abrindo suas tarefas" />;

  const emAndamento = new Set(rascunhos.map((r) => r.ocorrenciaId));

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
        <Txt variante="legenda" discreto>
          {identidade?.municipio}
          {atualizadoEm
            ? `, lista baixada em ${new Date(atualizadoEm).toLocaleString("pt-BR")}`
            : ""}
        </Txt>
      </View>

      {tarefas.length === 0 ? (
        <Vazio
          titulo="Nenhuma vistoria designada"
          descricao="Quando a coordenação despachar uma ocorrência para a sua equipe, ela aparece aqui. Puxe a tela para baixo para procurar de novo."
        />
      ) : (
        tarefas.map((t) => {
          const prazo = quantoFalta(t.prazo_em);
          const comecada = emAndamento.has(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: "/(agente)/vistoria/[id]", params: { id: t.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir a vistoria do protocolo ${t.protocolo}, ${t.endereco}`}
              style={({ pressed }) => ({
                minHeight: toque,
                backgroundColor: tema.superficie,
                borderRadius: raio.cartao,
                borderWidth: 1,
                // Borda de destaque no que já foi começado: é para lá que o
                // agente volta, e procurar isso numa lista longa custa tempo
                // que ele não tem.
                borderColor: comecada ? tema.destaque : tema.borda,
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
                {comecada && (
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

      <Botao
        titulo="Minha conta"
        tipo="discreto"
        onPress={() => router.push("/(agente)/conta")}
      />
    </ScrollView>
  );
}
