import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import type { FilaDeSincronizacao, ItemFila } from "@dc360/campo";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Selo, Separador, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { espaco } from "../../ui/tokens";

/**
 * A fila de envio, item a item.
 *
 * Esta tela existe por uma razão de confiança, e não de função. Uma coleta
 * guardada e ainda não enviada é indistinguível, para quem olha de fora, de
 * uma coleta perdida. Se o agente não puder ver a dela ali, com nome e estado,
 * ele vai refazer a vistoria por precaução, e refazer é o custo que este
 * produto inteiro existe para evitar.
 *
 * Por isso cada item mostra o protocolo, o que aconteceu na última tentativa e
 * quantas vezes já tentou. Nada de "sincronizando" genérico.
 */

function descreverEstado(item: ItemFila): { rotulo: string; explicacao: string } {
  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Aguardando",
        explicacao: item.tentativas === 0
          ? "Ainda não saiu do aparelho. Vai sair assim que houver sinal."
          : `Já tentou ${item.tentativas}x. Vai tentar de novo em instantes.`,
      };
    case "enviando":
      return { rotulo: "Enviando", explicacao: "Saindo do aparelho agora." };
    case "confirmado":
      return {
        rotulo: "Enviada",
        explicacao: "A coordenação recebeu. Some desta lista em instantes.",
      };
    case "bloqueado":
      return {
        rotulo: "Precisa de atenção",
        explicacao: item.ultimoErro
          ?? "O servidor recusou por um motivo que repetir não resolve.",
      };
  }
}

export default function TelaDaFila() {
  const tema = useTema();
  const sinal = useSinal();
  const { obterToken } = useSessao();

  const [fila, setFila] = useState<FilaDeSincronizacao | null>(null);
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const recarregar = useCallback(async (f: FilaDeSincronizacao) => {
    setItens(await f.itens());
  }, []);

  useEffect(() => {
    let vivo = true;
    let desassinar: (() => void) | undefined;
    void (async () => {
      const f = await obterFila(enderecoDaApi(), obterToken);
      if (!vivo) return;
      setFila(f);
      await recarregar(f);
      // A fila avisa a cada mudança de estado; a tela relê a lista inteira.
      // Reler tudo é barato aqui, e evita o estado da tela divergir do disco.
      desassinar = f.assinar(() => { void recarregar(f); });
    })();
    return () => { vivo = false; desassinar?.(); };
  }, [obterToken, recarregar]);

  async function sincronizarAgora(): Promise<void> {
    if (!fila) return;
    setSincronizando(true);
    try {
      await fila.drenar();
    } finally {
      setSincronizando(false);
      await recarregar(fila);
    }
  }

  if (!itens) return <Carregando mensagem="Abrindo a fila" />;

  const bloqueados = itens.filter((i) => i.estado === "bloqueado");
  const emEspera = itens.filter((i) => i.estado !== "bloqueado");

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
      {!sinal.temSinal && (
        <Aviso tom="alerta">
          Sem sinal agora. Nada se perde: o que está aqui sai sozinho quando a
          conexão voltar, sem você precisar fazer nada.
        </Aviso>
      )}

      {itens.length === 0 ? (
        <Vazio
          titulo="Nada esperando envio"
          descricao="Toda vistoria concluída neste aparelho já chegou à coordenação."
        />
      ) : (
        <>
          <Txt variante="h2">
            {itens.length === 1 ? "1 coleta na fila" : `${itens.length} coletas na fila`}
          </Txt>

          {bloqueados.length > 0 && (
            <Aviso tom="perigo">
              {bloqueados.length === 1
                ? "Uma coleta precisa de atenção: repetir o envio não resolve sozinho."
                : `${bloqueados.length} coletas precisam de atenção: repetir o envio não resolve sozinho.`}
            </Aviso>
          )}

          {[...bloqueados, ...emEspera].map((item) => {
            const estado = descreverEstado(item);
            const fotosEnviadas = item.fotos.filter((f) => f.enviada).length;
            return (
              <Cartao key={item.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                  <Txt variante="corpoP" mono negrito>{item.protocolo}</Txt>
                  <View style={{ flex: 1 }} />
                  <Selo
                    texto={estado.rotulo}
                    fundo={
                      item.estado === "bloqueado" ? tema.perigoFundo
                      : item.estado === "confirmado" ? tema.okFundo
                      : tema.superficie2
                    }
                    cor={
                      item.estado === "bloqueado" ? tema.perigoTexto
                      : item.estado === "confirmado" ? tema.okTexto
                      : tema.textoDiscreto
                    }
                  />
                </View>

                <Txt variante="corpoP" discreto>{estado.explicacao}</Txt>

                {item.fotos.length > 0 && (
                  <Txt variante="legenda" discreto>
                    {fotosEnviadas} de {item.fotos.length} arquivos já subiram
                  </Txt>
                )}

                <Txt variante="legenda" discreto>
                  Coletada em {new Date(item.criadoEm).toLocaleString("pt-BR")}
                </Txt>

                {item.estado === "bloqueado" && (
                  <>
                    <Separador />
                    <View style={{ flexDirection: "row", gap: espaco.e2 }}>
                      <Botao
                        titulo="Tentar de novo"
                        tipo="secundario"
                        estilo={{ flex: 1 }}
                        onPress={() => void (async () => {
                          await fila?.reenviar(item.id);
                          if (fila) await recarregar(fila);
                        })()}
                      />
                      {/*
                        Descartar existe, e pergunta duas vezes. Sem a saída, um
                        item bloqueado ficaria para sempre na tela, e o agente
                        aprenderia a ignorar a fila inteira. Com ela sem
                        confirmação, um toque errado apagaria a vistoria.
                      */}
                      <Botao
                        titulo="Descartar"
                        tipo="perigo"
                        estilo={{ flex: 1 }}
                        onPress={() => Alert.alert(
                          "Descartar esta coleta?",
                          `A vistoria do protocolo ${item.protocolo} será apagada deste ` +
                          "aparelho e não chegará à coordenação. Não dá para desfazer.",
                          [
                            { text: "Manter na fila", style: "cancel" },
                            {
                              text: "Descartar",
                              style: "destructive",
                              onPress: () => void (async () => {
                                await fila?.descartar(item.id);
                                if (fila) await recarregar(fila);
                              })(),
                            },
                          ],
                        )}
                      />
                    </View>
                  </>
                )}
              </Cartao>
            );
          })}
        </>
      )}

      <Botao
        titulo="Tentar enviar agora"
        onPress={() => void sincronizarAgora()}
        carregando={sincronizando}
        desabilitado={itens.length === 0 || !sinal.temSinal}
      />

      <Txt variante="legenda" discreto alinhamento="center">
        O envio acontece sozinho, em segundo plano. Este botão é para quando
        você quer ver acontecer.
      </Txt>
    </ScrollView>
  );
}
