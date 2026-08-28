import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import {
  CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA, ROTULO_TIPO_COBRADE, montarMinuta,
  type EnvelopeSincronizacao,
} from "@dc360/shared";
import type { FotoLocal } from "@dc360/campo";
import { enderecoDaApi, type Pendencia } from "../../../dados/api";
import { pendenciaGuardada } from "../../../dados/pendencias";
import { obterFila } from "../../../dados/fila";
import {
  descartarRascunho, lerRascunho, rascunhoNovo, salvarRascunho, type Rascunho,
} from "../../../dados/rascunho";
import { useSessao } from "../../../dados/sessao";
import { Assinatura } from "../../../ui/Assinatura";
import { MinutaDoLaudo } from "../../../ui/MinutaDoLaudo";
import {
  Aviso, Botao, Cartao, Carregando, SeloSeveridade, Separador, Txt, useTema,
} from "../../../ui/componentes";
import { espaco, fonte, raio, toque } from "../../../ui/tokens";

/**
 * A coleta em campo. É por esta tela que o produto existe.
 *
 * O princípio que governa cada linha aqui: **nada depende de sinal, e nada se
 * perde**. Toda alteração vai para o disco no mesmo toque que a produz, e ao
 * concluir a coleta inteira entra na fila de sincronização, que já sabe
 * esperar, repetir e não duplicar.
 *
 * O que NÃO acontece aqui, de propósito: nenhuma chamada à API. A tela nem
 * tenta. Tentar e falhar no alto do morro gastaria bateria e ensinaria o
 * agente a desconfiar de uma coleta que está perfeitamente guardada.
 */

export default function TelaDeVistoria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navegacao = useNavigation();
  const tema = useTema();
  const { obterToken, identidade } = useSessao();

  const [ocorrencia, setOcorrencia] = useState<Pendencia | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  const [permissaoCamera, pedirCamera] = useCameraPermissions();
  const [cameraAberta, setCameraAberta] = useState(false);
  const [fotografando, setFotografando] = useState(false);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [minutaAberta, setMinutaAberta] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    void (async () => {
      const alvo = await pendenciaGuardada(id);
      if (!alvo) {
        setErro(
          "Esta ocorrência não está guardada neste aparelho. Volte, conecte-se " +
          "e baixe as tarefas de novo.",
        );
        setCarregando(false);
        return;
      }
      setOcorrencia(alvo);
      navegacao.setOptions({ title: alvo.protocolo });

      const guardado = await lerRascunho(id);
      setRascunho(
        guardado ?? rascunhoNovo(id, alvo.protocolo, Crypto.randomUUID()),
      );
      setCarregando(false);
    })();
  }, [id, navegacao]);

  /**
   * Toda mudança passa por aqui, e toda mudança grava.
   *
   * Uma função só, e não um `useEffect` que salva quando o estado muda: com o
   * efeito, o React pode agrupar atualizações e o processo pode morrer entre a
   * mudança na tela e a gravação. Assim, o disco vai junto com a tela.
   */
  const alterar = useCallback(async (mudanca: Partial<Rascunho>) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...mudanca };
      void salvarRascunho(novo);
      return novo;
    });
  }, []);

  async function capturarGps(): Promise<void> {
    setCapturandoGps(true);
    setErro(null);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) {
        setErro(
          "Sem permissão de localização. O laudo pode ser concluído sem a " +
          "coordenada, mas ela é o que prova onde a vistoria foi feita.",
        );
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({
        // Alta precisão custa bateria e tempo, e é o que um laudo técnico
        // exige: coordenada de cem metros não identifica qual casa do morro.
        accuracy: Location.Accuracy.High,
      });
      await alterar({
        coordenada: {
          lat: Number(posicao.coords.latitude.toFixed(6)),
          lng: Number(posicao.coords.longitude.toFixed(6)),
        },
        gpsPrecisaoMetros: posicao.coords.accuracy
          ? Math.round(posicao.coords.accuracy)
          : null,
      });
    } catch {
      setErro("O aparelho não conseguiu obter a localização. Tente de novo a céu aberto.");
    } finally {
      setCapturandoGps(false);
    }
  }

  async function fotografar(): Promise<void> {
    if (!cameraRef.current || fotografando) return;
    setFotografando(true);
    try {
      /*
        Qualidade 0,6 e sem base64. A foto precisa mostrar a trinca, não render
        pôster: cada megabyte a mais é um megabyte que sobe pela rede da rua,
        no plano de dados da prefeitura, e que ocupa espaço no aparelho até
        sincronizar. `base64: true` dobraria o uso de memória sem serventia,
        porque o envio lê os bytes do arquivo.
      */
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
      });
      if (foto?.uri) await guardarFoto(foto.uri);
    } catch {
      setErro("O aparelho não conseguiu tirar a foto. Tente de novo.");
      setCameraAberta(false);
    } finally {
      setFotografando(false);
    }
  }

  async function guardarFoto(uri: string): Promise<void> {
    if (!rascunho) return;
    const arquivo = new File(uri);
    const foto: FotoLocal = {
      // A chave nasce aqui, com a foto, e não no envio: é ela que impede o
      // servidor de aceitar a mesma imagem duas vezes se o envio for repetido.
      idempotencyKey: Crypto.randomUUID(),
      uriLocal: uri,
      nomeArquivo: `vistoria-${rascunho.protocolo.replace("/", "-")}-${rascunho.fotos.length + 1}.jpg`,
      tipoConteudo: "image/jpeg",
      tamanhoBytes: arquivo.size ?? 0,
      capturadaEm: new Date().toISOString(),
      ordem: rascunho.fotos.length,
      ...(rascunho.coordenada ? { coordenada: rascunho.coordenada } : {}),
    };
    await alterar({ fotos: [...rascunho.fotos, foto] });
    setCameraAberta(false);
  }

  async function concluir(): Promise<void> {
    if (!rascunho || !ocorrencia) return;
    setConcluindo(true);
    setErro(null);
    try {
      const envelope: EnvelopeSincronizacao = {
        idempotencyKey: rascunho.idempotencyKey,
        ocorrenciaId: rascunho.ocorrenciaId,
        coletadaEm: rascunho.coletadaEm,
        vistoria: {
          checklist: CHECKLIST_VISTORIA.map((item) => ({
            chave: item.chave,
            resposta: Boolean(rascunho.checklist[item.chave]),
          })),
          /*
            Vazio aqui de propósito. O envelope referencia as fotos pela chave
            que o SERVIDOR devolve na autorização, e essa chave só existe
            depois do envio. A fila remonta esta lista quando sobe os arquivos;
            preencher agora seria inventar chave que não existe.
          */
          fotos: [],
          gpsPrecisaoMetros: rascunho.gpsPrecisaoMetros,
          assinanteNome: rascunho.assinanteNome.trim(),
          // A chave do traço é resolvida pela fila, junto com as fotos: aqui
          // ainda existe só o caminho local.
          assinaturaChave: null,
          coletadaEm: rascunho.coletadaEm,
          ...(rascunho.observacoes.trim() ? { observacoes: rascunho.observacoes.trim() } : {}),
        },
      };

      const fila = await obterFila(enderecoDaApi(), obterToken);

      /*
        A assinatura vai por fora da lista de fotos. Ela sobe pelo mesmo
        caminho, com a mesma idempotência e a mesma retomada, mas o envelope a
        guarda noutro campo: no laudo, uma é o registro fotográfico e a outra é
        o traço acima da linha de assinatura.
      */
      const assinatura: FotoLocal | undefined = rascunho.assinaturaUri
        ? {
            idempotencyKey: `${rascunho.idempotencyKey}-assinatura`,
            uriLocal: rascunho.assinaturaUri,
            nomeArquivo: `assinatura-${rascunho.protocolo.replace("/", "-")}.png`,
            tipoConteudo: "image/png",
            tamanhoBytes: new File(rascunho.assinaturaUri).size ?? 0,
            capturadaEm: new Date().toISOString(),
            legenda: "Assinatura de quem estava no local",
            ordem: rascunho.fotos.length,
          }
        : undefined;

      await fila.enfileirar(envelope, {
        protocolo: rascunho.protocolo,
        fotos: rascunho.fotos,
        ...(assinatura ? { assinatura } : {}),
      });
      /*
        Só descarta o rascunho DEPOIS de a fila aceitar. Na ordem inversa, uma
        falha ao enfileirar apagaria a vistoria inteira, que é o pior desfecho
        possível desta tela.
      */
      await descartarRascunho(rascunho.ocorrenciaId);

      Alert.alert(
        "Vistoria guardada",
        "Ela vai ser enviada assim que houver sinal. Você pode acompanhar na fila de envio.",
        [{ text: "Entendi", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      setErro(
        e instanceof Error
          ? `Não foi possível guardar a vistoria: ${e.message}`
          : "Não foi possível guardar a vistoria.",
      );
    } finally {
      setConcluindo(false);
    }
  }

  if (carregando) return <Carregando mensagem="Abrindo a vistoria" />;
  if (erro && !ocorrencia) return <View style={{ padding: espaco.e4 }}><Aviso tom="perigo">{erro}</Aviso></View>;
  if (!ocorrencia || !rascunho) return null;

  const obrigatoriosFeitos = CHECKLIST_OBRIGATORIO.every((i) => i.chave in rascunho.checklist);
  const temFoto = rascunho.fotos.length > 0;
  const temAssinante = rascunho.assinanteNome.trim().length > 0;
  const podeConcluir = obrigatoriosFeitos && temFoto && temAssinante;

  if (minutaAberta) {
    /*
      A minuta é uma SOBREPOSIÇÃO, e não uma rota.

      A câmera nesta mesma tela já faz assim, e a razão é a mesma: `concluir()`
      precisa estar em escopo. Levar a minuta para outra rota significaria ou
      duplicar a conclusão, ou devolver um sinal pela navegação para que esta
      tela conclua depois, e as duas saídas colocam a gravação da vistoria a
      depender de estado de navegação. Numa tela em que perder o rascunho
      custa outra subida ao morro, isso não se faz por elegância de rotas.

      A minuta é montada AQUI, na hora, do rascunho que está no disco. Nenhuma
      chamada, nenhum dado que não esteja no aparelho.
    */
    const minuta = montarMinuta({
      organizacao: {
        nome: identidade?.organizacaoNome ?? "Defesa Civil municipal",
        municipio: identidade?.municipio ?? "",
        uf: identidade?.uf ?? "",
      },
      ocorrencia: {
        protocolo: ocorrencia.protocolo,
        tipo: ocorrencia.tipo,
        severidade: ocorrencia.severidade,
        endereco: ocorrencia.endereco,
        pontoReferencia: ocorrencia.ponto_referencia,
        // A coordenada da MINUTA é a que o agente capturou no local, e não a
        // que veio da abertura: é ela que vai para o laudo.
        latitude: rascunho.coordenada?.lat ?? ocorrencia.latitude,
        longitude: rascunho.coordenada?.lng ?? ocorrencia.longitude,
        solicitanteNome: ocorrencia.solicitante_nome,
        criadoEm: ocorrencia.criado_em,
        descricao: ocorrencia.descricao,
        vulnerabilidadePresente: ocorrencia.vulnerabilidade_presente,
        vulnerabilidadeDescricao: ocorrencia.vulnerabilidade_descricao,
      },
      vistoria: {
        checklist: CHECKLIST_VISTORIA.map((item) => ({
          chave: item.chave,
          resposta: Boolean(rascunho.checklist[item.chave]),
        })),
        observacoes: rascunho.observacoes,
        assinanteNome: rascunho.assinanteNome.trim(),
        gpsPrecisaoMetros: rascunho.gpsPrecisaoMetros,
        coletadaEm: rascunho.coletadaEm,
        agenteNome: identidade?.nome ?? "não identificado",
        agenteMatricula: identidade?.matricula ?? "não informada",
      },
      quantasFotos: rascunho.fotos.length,
    });

    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo }}>
        <MinutaDoLaudo minuta={minuta} />
        {/*
          As duas ações ficam FORA da rolagem, presas no rodapé.

          A minuta é longa e o agente lê com alguém esperando na porta. Se o
          botão de concluir estivesse no fim do texto, ele rolaria o documento
          inteiro de novo só para achá-lo, e quem está lendo em voz alta perde
          a linha. Voltar vem primeiro porque é a ação reversível.
        */}
        <View style={{
          flexDirection: "row", gap: espaco.e3,
          padding: espaco.e4, paddingBottom: espaco.e5,
          borderTopWidth: 1, borderTopColor: tema.borda,
          backgroundColor: tema.superficie,
        }}>
          <View style={{ flex: 1 }}>
            <Botao
              titulo="Corrigir"
              tipo="secundario"
              onPress={() => setMinutaAberta(false)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Botao
              titulo="Concluir vistoria"
              onPress={() => void concluir()}
              carregando={concluindo}
            />
          </View>
        </View>
      </View>
    );
  }

  if (cameraAberta) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={{
          padding: espaco.e5, gap: espaco.e3,
          backgroundColor: "#000", alignItems: "center",
        }}>
          {/*
            Disparador redondo e grande, no lugar onde o polegar já está. Um
            botão de tamanho normal aqui seria errado a cada duas fotos, e cada
            erro é uma foto perdida com o morador esperando.
          */}
          <Pressable
            onPress={() => void fotografar()}
            disabled={fotografando}
            accessibilityRole="button"
            accessibilityLabel="Tirar a fotografia"
            style={({ pressed }) => ({
              width: 84, height: 84, borderRadius: raio.pilula,
              backgroundColor: "#FFFFFF",
              borderWidth: 5, borderColor: tema.destaque,
              opacity: fotografando ? 0.5 : pressed ? 0.8 : 1,
            })}
          />
          <Botao
            titulo="Cancelar"
            tipo="secundario"
            onPress={() => setCameraAberta(false)}
            estilo={{ alignSelf: "stretch" }}
          />
        </View>
      </View>
    );
  }

  const campo = {
    minHeight: toque,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.normal,
    backgroundColor: tema.superficie,
    color: tema.texto,
    paddingHorizontal: espaco.e3,
    paddingVertical: espaco.e2,
    fontSize: fonte.corpo,
  } as const;

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: espaco.e8 }}>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      <Cartao>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>
          <View style={{ flex: 1 }} />
          <SeloSeveridade severidade={ocorrencia.severidade} />
        </View>
        <Txt variante="h3">{ROTULO_TIPO_COBRADE[ocorrencia.tipo]}</Txt>
        <Txt variante="corpoP">{ocorrencia.endereco}</Txt>
        {/*
          A referência vem logo abaixo do endereço, e não no fim do cartão.

          É com ela que o agente acha a casa quando a rua não tem placa, e ele
          lê isso dentro do carro, no morro, muitas vezes sem sinal. Enterrá-la
          depois do relato seria escondê-la exatamente de quem precisa dela.
        */}
        {ocorrencia.ponto_referencia && (
          <Txt variante="corpoP" discreto>
            Referência: {ocorrencia.ponto_referencia}
          </Txt>
        )}
        <Separador />
        <Txt variante="legenda" discreto>Relato recebido</Txt>
        <Txt variante="corpoP">{ocorrencia.descricao}</Txt>
        {ocorrencia.vulnerabilidade_presente && (
          <Aviso tom="alerta">
            Vulnerabilidade social registrada.
            {ocorrencia.vulnerabilidade_descricao ? ` ${ocorrencia.vulnerabilidade_descricao}` : ""}
          </Aviso>
        )}
      </Cartao>

      <Cartao titulo="Checklist técnico">
        <Txt variante="legenda" discreto>
          {CHECKLIST_OBRIGATORIO.filter((i) => i.chave in rascunho.checklist).length}
          {" de "}{CHECKLIST_OBRIGATORIO.length} itens obrigatórios respondidos
        </Txt>
        {CHECKLIST_VISTORIA.map((item) => {
          const resposta = rascunho.checklist[item.chave];
          return (
            <View key={item.chave} style={{ gap: espaco.e2 }}>
              <Txt variante="corpoP">
                {item.rotulo}
                {!item.obrigatorio && <Txt variante="legenda" discreto>  opcional</Txt>}
              </Txt>
              {/*
                Sim e não explícitos, e não um interruptor. Interruptor
                desligado é indistinguível de pergunta não respondida, e a
                diferença entre "não há risco iminente" e "ninguém olhou" é o
                que decide se alguém dorme na casa hoje.
              */}
              <View style={{ flexDirection: "row", gap: espaco.e2 }}>
                {[
                  { valor: true, rotulo: "Sim" },
                  { valor: false, rotulo: "Não" },
                ].map((opcao) => {
                  const marcada = resposta === opcao.valor;
                  return (
                    <Pressable
                      key={opcao.rotulo}
                      onPress={() => void alterar({
                        checklist: { ...rascunho.checklist, [item.chave]: opcao.valor },
                      })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: marcada }}
                      accessibilityLabel={`${item.rotulo}: ${opcao.rotulo}`}
                      style={{
                        flex: 1,
                        minHeight: toque,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: raio.normal,
                        borderWidth: marcada ? 0 : 1,
                        borderColor: tema.borda,
                        backgroundColor: marcada ? tema.destaque : "transparent",
                      }}
                    >
                      <Txt
                        variante="corpo"
                        negrito={marcada}
                        cor={marcada ? tema.sobreDestaque : tema.texto}
                      >
                        {marcada ? `✓ ${opcao.rotulo}` : opcao.rotulo}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              <Separador />
            </View>
          );
        })}
      </Cartao>

      <Cartao titulo={`Fotografias (${rascunho.fotos.length})`}>
        {rascunho.fotos.length === 0 ? (
          <Txt variante="corpoP" discreto>
            Pelo menos uma fotografia é obrigatória. É ela que o coordenador
            olha antes de decidir o despacho.
          </Txt>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e2 }}>
            {rascunho.fotos.map((f) => (
              <View key={f.idempotencyKey} style={{ gap: espaco.e1 }}>
                <Image
                  source={{ uri: f.uriLocal }}
                  style={{ width: 96, height: 96, borderRadius: raio.normal }}
                  accessibilityLabel={`Fotografia ${f.ordem + 1} da vistoria`}
                />
                <Pressable
                  onPress={() => void alterar({
                    fotos: rascunho.fotos
                      .filter((o) => o.idempotencyKey !== f.idempotencyKey)
                      .map((o, i) => ({ ...o, ordem: i })),
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`Apagar a fotografia ${f.ordem + 1}`}
                  style={{ minHeight: 32, alignItems: "center", justifyContent: "center" }}
                >
                  <Txt variante="legenda" cor={tema.perigoTexto}>Apagar</Txt>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <Botao
          titulo="Tirar foto"
          tipo="secundario"
          onPress={() => void (async () => {
            if (!permissaoCamera?.granted) {
              const resultado = await pedirCamera();
              if (!resultado.granted) {
                setErro(
                  "Sem permissão de câmera. Libere nas configurações do aparelho " +
                  "para poder fotografar a vistoria.",
                );
                return;
              }
            }
            setCameraAberta(true);
          })()}
        />
      </Cartao>

      <Cartao titulo="Localização">
        {rascunho.coordenada ? (
          <>
            <Txt variante="corpoP" mono>
              {rascunho.coordenada.lat.toFixed(6)}, {rascunho.coordenada.lng.toFixed(6)}
            </Txt>
            <Txt variante="legenda" discreto>
              {rascunho.gpsPrecisaoMetros
                ? `Precisão de ${rascunho.gpsPrecisaoMetros} metros`
                : "Precisão não informada pelo aparelho"}
            </Txt>
          </>
        ) : (
          <Txt variante="corpoP" discreto>
            Ainda não capturada. Ela é o que prova, no laudo, onde a vistoria
            aconteceu.
          </Txt>
        )}
        <Botao
          titulo={rascunho.coordenada ? "Capturar de novo" : "Capturar localização"}
          tipo="secundario"
          onPress={() => void capturarGps()}
          carregando={capturandoGps}
        />
      </Cartao>

      <Cartao titulo="Quem estava no local">
        <View style={{ gap: espaco.e1 }}>
          <Txt variante="corpoP" negrito>Nome de quem acompanhou e assina</Txt>
          <TextInput
            value={rascunho.assinanteNome}
            onChangeText={(t) => void alterar({ assinanteNome: t })}
            style={campo}
            placeholder="Nome completo"
            placeholderTextColor={tema.textoDiscreto}
            accessibilityLabel="Nome de quem estava no local"
          />
        </View>

        <Assinatura
          jaAssinada={Boolean(rascunho.assinaturaUri)}
          aoConfirmar={(uri) => void alterar({ assinaturaUri: uri })}
          aoLimpar={() => void alterar({ assinaturaUri: null })}
        />
      </Cartao>

      <Cartao titulo="Observações do agente">
        <TextInput
          value={rascunho.observacoes}
          onChangeText={(t) => void alterar({ observacoes: t })}
          style={[campo, { minHeight: toque * 2, textAlignVertical: "top" }]}
          multiline
          placeholder="O que o checklist não cobre e o laudo precisa registrar"
          placeholderTextColor={tema.textoDiscreto}
          accessibilityLabel="Observações do agente"
        />
      </Cartao>

      {!podeConcluir && (
        <Aviso tom="alerta">
          Falta{" "}
          {[
            !obrigatoriosFeitos && "responder o checklist obrigatório",
            !temFoto && "tirar pelo menos uma foto",
            !temAssinante && "informar quem estava no local",
          ].filter(Boolean).join(", ")}
          .
        </Aviso>
      )}

      {/*
        A conclusão passa pela minuta, e isso não é uma tela a mais por gosto.

        Antes, "Concluir vistoria" gravava direto: o agente descia o morro sem
        nunca ter visto o que ficou escrito, e quem assinou dizendo que estava
        presente também não. Um item marcado errado só aparecia no dia
        seguinte, quando voltar lá custa outra viagem.

        Agora o último toque abre o texto do laudo, montado no próprio
        aparelho, para ser lido em voz alta na porta. Concluir de verdade é o
        botão que fica lá dentro.
      */}
      <Botao
        titulo="Revisar e concluir"
        onPress={() => setMinutaAberta(true)}
        desabilitado={!podeConcluir}
      />

      <Txt variante="legenda" discreto alinhamento="center">
        Tudo o que você preencheu já está guardado neste aparelho. O próximo
        passo mostra a minuta do laudo para você conferir com quem está no
        local, antes de a vistoria entrar na fila de envio.
      </Txt>
    </ScrollView>
  );
}
