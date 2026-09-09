import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import type { FilaDeSincronizacao, ItemFila } from "@dc360/campo";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Separador, Txt, Vazio,
} from "../../ui/componentes";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
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

/**
 * Uma lista só decide a palavra, o símbolo e o tom de cada estado.
 *
 * Antes eram duas: este `switch` escolhia a palavra, e trezentas linhas abaixo
 * uma cadeia de ternários escolhia as cores do selo. Quando o estado
 * "arquivado" nasceu, ele entrou aqui e não entrou lá, e o resultado é o defeito
 * que o teste desta tela agora trava: uma coleta ARQUIVADA (a ocorrência foi
 * encerrada no painel enquanto ela esperava sinal, e ela nunca vai chegar)
 * ficava com exatamente o mesmo desenho de uma coleta AGUARDANDO envio, que vai
 * chegar assim que houver sinal. Os dois estados são opostos, e o agente lia os
 * dois como o mesmo.
 *
 * O símbolo não é enfeite e por isso é campo obrigatório do `Chip`: esta tela é
 * lida em pé, na rua, com sol na tela, onde âmbar e verde são a mesma mancha.
 */
function descreverEstado(item: ItemFila): {
  rotulo: string; explicacao: string; simbolo: string; tom: TomDoChip;
} {
  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Aguardando",
        simbolo: "…",
        tom: "neutro",
        explicacao: item.tentativas === 0
          ? "Ainda não saiu do aparelho. Vai sair assim que houver sinal."
          : `Já tentou ${item.tentativas}x. Vai tentar de novo em instantes.`,
      };
    case "enviando":
      return {
        rotulo: "Enviando", simbolo: "↑", tom: "neutro",
        explicacao: "Saindo do aparelho agora.",
      };
    case "confirmado":
      return {
        rotulo: "Enviada",
        simbolo: "✓",
        tom: "ok",
        explicacao: "A coordenação recebeu. Some desta lista em instantes.",
      };
    case "bloqueado":
      return {
        rotulo: "Precisa de atenção",
        simbolo: "!",
        tom: "perigo",
        explicacao: item.ultimaFalha?.mensagem
          ?? "O servidor recusou por um motivo que repetir não resolve.",
      };
    /*
      Coleta arquivada é a que perdeu o destino: a ocorrência foi encerrada no
      painel enquanto ela esperava sinal. Precisa de rótulo próprio porque
      "Precisa de atenção" seria mentira duas vezes: o agente não errou nada, e
      não existe nada que ele possa fazer para o envio passar.

      O caso não é decoração. Sem ele o `switch` fica sem saída para um estado
      que já existe no motor, e a tela renderiza um cartão sem rótulo nem
      explicação para uma coleta que a pessoa acabou de fazer, que é
      exatamente a dúvida ("cadê a minha vistoria?") que esta tela existe para
      dissolver.
    */
    case "arquivado":
      return {
        rotulo: "Arquivada",
        /*
          Símbolo e tom próprios, e não os de "Aguardando". Arquivada não é uma
          espera mais longa: é uma coleta que perdeu o destino e nunca vai
          chegar. Repetir o desenho da espera aqui seria prometer ao agente uma
          entrega que não vem.
        */
        simbolo: "✕",
        tom: "alerta",
        explicacao: item.ultimaFalha?.mensagem
          ?? "A ocorrência foi encerrada no painel enquanto esta coleta esperava sinal. "
             + "Ela fica guardada aqui como registro do que foi feito.",
      };
  }
}

export default function TelaDaFila() {
  const sinal = useSinal();
  const { obterToken } = useSessao();

  const [fila, setFila] = useState<FilaDeSincronizacao | null>(null);
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /*
    Qual item está sendo perguntado, e não "o diálogo está aberto".

    Guardar o item inteiro em vez de uma bandeira é o que permite o diálogo
    dizer o protocolo, que é a única coisa que distingue uma coleta da outra
    nesta lista. Enquanto isto vale `null`, nada foi descartado: o descarte
    acontece só no toque do botão, e é isso que o teste desta tela cobra.
  */
  const [aDescartar, setADescartar] = useState<ItemFila | null>(null);

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
                  <Chip
                    texto={estado.rotulo}
                    simbolo={estado.simbolo}
                    tom={estado.tom}
                    descricao={`Protocolo ${item.protocolo}: ${estado.rotulo}`}
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
                        onPress={() => { setADescartar(item); }}
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

      {/*
        Um diálogo só para a lista inteira, e não um por cartão.

        A lista pode ter dezenas de itens, e um `Modal` por item seria uma
        dezena de modais montados por trás da tela o tempo todo. Quem responde
        qual coleta está em questão é o estado, e o protocolo aparece no texto.
      */}
      <Dialogo
        aberto={aDescartar !== null}
        titulo="Descartar esta coleta?"
        texto={
          `A vistoria do protocolo ${aDescartar?.protocolo ?? ""} será apagada deste ` +
          "aparelho e não chegará à coordenação. Não dá para desfazer."
        }
        acao={{
          rotulo: "Descartar esta coleta",
          destrutiva: true,
          aoTocar: () => void (async () => {
            const alvo = aDescartar;
            if (!alvo || !fila) return;
            await fila.descartar(alvo.id);
            await recarregar(fila);
          })(),
        }}
        recusa={{ rotulo: "Manter na fila" }}
        aoFechar={() => { setADescartar(null); }}
      />
    </ScrollView>
  );
}
