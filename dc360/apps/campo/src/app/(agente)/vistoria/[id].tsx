import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import Svg, { Circle, Path } from "react-native-svg";
import {
  CAMPOS_PESSOAS, CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA, ROTULO_TIPO_COBRADE,
  montarMinuta,
  type EnvelopeSincronizacao, type PessoasAtingidas,
} from "@dc360/shared";
import type { ColetaLocal, FotoLocal } from "@dc360/campo";
import { enderecoDaApi, type Pendencia } from "../../../dados/api";
import { pendenciaGuardada } from "../../../dados/pendencias";
import { arquivarColeta, coletaDe, marcarColetada } from "../../../dados/coletas";
import { obterFila } from "../../../dados/fila";
import { abrirNoMapa } from "../../../dados/mapa";
import {
  descartarRascunho, lerRascunho, rascunhoNovo, salvarRascunho, type Rascunho,
} from "../../../dados/rascunho";
import { useSessao } from "../../../dados/sessao";
import { Assinatura } from "../../../ui/Assinatura";
import { MinutaDoLaudo } from "../../../ui/MinutaDoLaudo";
import {
  Aviso, Botao, Cartao, Carregando, Selo, SeloSeveridade, Separador, Txt, useTema,
} from "../../../ui/componentes";
import { Chip } from "../../../ui/Chip";
import { Dialogo } from "../../../ui/Dialogo";
import { espaco, fonte, raio, toque } from "../../../ui/tokens";
import {
  concluirColetaEmOrdem, dataDoPrazo, decidirAberturaDaVistoria, faltaParaConcluir, quantoFalta,
} from "@dc360/campo";

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

/**
 * O que a pessoa digitou vira número, ou não vira nada.
 *
 * Campo vazio devolve `undefined`, que é NÃO CONTADO, e não zero. `Number("")`
 * é zero em JavaScript, e é assim que um laudo passa a afirmar que ninguém
 * saiu de casa porque o agente não preencheu o campo.
 *
 * Texto que não é número inteiro também vira `undefined`: melhor o servidor
 * gravar "não contado" do que gravar um número que ninguém digitou.
 */
function contagensDoRascunho(pessoas: Record<string, string>): PessoasAtingidas {
  const saida: Record<string, number> = {};
  for (const campo of CAMPOS_PESSOAS) {
    const bruto = (pessoas[campo.chave] ?? "").trim();
    if (!bruto) continue;
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 0) continue;
    saida[campo.chave] = n;
  }
  return saida as PessoasAtingidas;
}

/**
 * Alfinete de mapa, desenhado aqui e não no arquivo dos ícones da barra.
 *
 * `ui/icones.tsx` guarda os três destinos do menu, que são de navegação. Este
 * é de uma ação de uma tela só, e mora junto de quem o usa.
 *
 * Traço e não preenchimento, para acompanhar os outros, e sempre ao lado da
 * palavra "Abrir no mapa": o agente abre este aplicativo duas vezes por semana
 * e não decora pictograma. Ícone sozinho seria recurso que existe no código e
 * não existe para quem está na rua.
 */
function IconeMapa({ cor, tamanho = 20 }: { cor: string; tamanho?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.5s7-6.53 7-11.5a7 7 0 1 0-14 0c0 4.97 7 11.5 7 11.5Z"
        stroke={cor} strokeWidth={1.8} strokeLinejoin="round"
      />
      <Circle cx="12" cy="10" r="2.6" stroke={cor} strokeWidth={1.8} />
    </Svg>
  );
}

export default function TelaDeVistoria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navegacao = useNavigation();
  const tema = useTema();
  const { obterToken, identidade } = useSessao();

  const [ocorrencia, setOcorrencia] = useState<Pendencia | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  /**
   * A lapide da coleta que este aparelho ja fez desta ocorrencia.
   *
   * Enquanto ela existe e nao esta arquivada, esta tela NAO abre formulario
   * nenhum: mostra o aviso e as duas saidas. Ver `decidirAberturaDaVistoria`.
   */
  const [jaColetada, setJaColetada] = useState<ColetaLocal | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  const [permissaoCamera, pedirCamera] = useCameraPermissions();
  const [cameraAberta, setCameraAberta] = useState(false);
  const [fotografando, setFotografando] = useState(false);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [minutaAberta, setMinutaAberta] = useState(false);
  /*
    As duas perguntas desta tela são ESTADO, e não efeito colateral do toque.

    Enquanto elas valem `false`, nada aconteceu: a tela não voltou para a lista
    e a lápide da coleta anterior continua de pé. É o que os testes desta tela
    cobram, e é a diferença entre "o agente foi perguntado" e "o aplicativo já
    fez", que era invisível enquanto isto era `Alert.alert`.
  */
  const [avisandoQueGuardou, setAvisandoQueGuardou] = useState(false);
  const [perguntandoNovaVistoria, setPerguntandoNovaVistoria] = useState(false);
  /** Enquanto true, o ScrollView desta tela nao rola: o dedo esta assinando. */
  const [desenhando, setDesenhando] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  /*
    O relógio do prazo, dentro da vistoria.

    Sem ele, a conta seria feita uma vez, quando a tela abriu, e ficaria
    congelada ali. Uma vistoria de morro dura quarenta minutos: o selo diria
    "vence em 1h" durante a coleta inteira e continuaria dizendo isso depois de
    o prazo já ter passado. Trinta segundos é bem mais curto que a menor faixa
    que o texto distingue (minutos), então nunca dá para ver a frase errada.
  */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => { clearInterval(t); };
  }, []);

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

      /*
        A pergunta que faltava, e a ausencia dela produzia dois laudos para o
        mesmo protocolo: alem de "existe rascunho?", esta tela precisa saber
        "esta ocorrencia ja foi coletada neste aparelho?".

        Sem a lapide, o caminho era este: o agente conclui a vistoria, ela entra
        na fila, o rascunho e apagado, e a lista de tarefas continua a mesma por
        horas porque nao ha sinal. Um toque na tarefa caia aqui, `lerRascunho`
        devolvia nulo, e a linha abaixo cunhava chave de idempotencia NOVA. Duas
        chaves diferentes sao, para o servidor, duas coletas legitimas.

        A decisao mora em `@dc360/campo` e tem teste sem Expo. Aqui a tela so
        obedece: quando a resposta e `ja_coletada`, nenhum rascunho e criado,
        porque criar rascunho e exatamente o que produz a segunda vistoria.
      */
      const [guardado, lapide] = await Promise.all([lerRascunho(id), coletaDe(id)]);
      const decisao = decidirAberturaDaVistoria({ rascunho: guardado, coleta: lapide });
      if (decisao === "ja_coletada") {
        setJaColetada(lapide);
        setCarregando(false);
        return;
      }
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

  /**
   * A saida deliberada da tela de "ja coletada".
   *
   * Arquiva a lapide em vez de apaga-la: apagar perderia o unico registro local
   * de que houve uma coleta antes, e e ele que explica, na fila de envio, por
   * que existem duas coletas do mesmo protocolo esperando para subir.
   *
   * Rele o rascunho do disco antes de criar um novo, e isso nao e zelo vazio.
   * Existe um caso real em que os dois convivem: a conclusao morreu entre
   * gravar a lapide e apagar o rascunho. Ali, criar rascunho novo por cima
   * jogaria fora o que o agente digitou no morro. Arquivar devolve o rascunho
   * preso em vez de destrui-lo.
   */
  async function refazerVistoria(): Promise<void> {
    if (!ocorrencia) return;
    try {
      await arquivarColeta(id);
      const guardado = await lerRascunho(id);
      setRascunho(
        guardado ?? rascunhoNovo(id, ocorrencia.protocolo, Crypto.randomUUID()),
      );
      setJaColetada(null);
    } catch {
      setErro(
        "Não foi possível liberar uma nova vistoria neste aparelho. Tente de novo.",
      );
    }
  }

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

  /**
   * A saída nomeada, e ela não apaga nada.
   *
   * A barra de abas some dentro desta tela de propósito: um caminho de fuga
   * permanente embaixo do polegar, ao lado de um rolamento longo, é como se
   * produz vistoria pela metade. Só que esconder a barra respondia à pergunta
   * "como eu saio daqui?" com uma justificativa em vez de uma saída, e o dono
   * do aparelho reclamou disso com razão.
   *
   * Então a saída existe, tem nome e diz o que faz. Sair daqui nunca foi
   * perder trabalho: `alterar()` grava no disco a cada toque, e o rascunho
   * continua na lista de tarefas com a marca de vistoria começada. Por isso
   * também não há confirmação: pedir "tem certeza?" para uma ação que não
   * destrói nada ensina o agente a responder "sim" sem ler, e no dia em que a
   * pergunta for séria ele responde igual.
   *
   * `descartarRascunho` NÃO é chamado aqui, e não é esquecimento: quem apaga o
   * rascunho é a conclusão, depois de a fila aceitar a coleta.
   */
  function salvarESair(): void {
    /*
      Sem histórico não adianta voltar.

      A vistoria também é aberta direto, sem passar pela lista, quando o agente
      chega nela por um link. Nesse caso `back()` não tem para onde ir e o
      botão não faria absolutamente nada, que é o pior comportamento possível
      para o botão que existe justamente para provar que dá para sair.
    */
    if (router.canGoBack()) router.back();
    else router.replace("/(agente)");
  }

  /**
   * Entrega a coordenada da ocorrência ao aplicativo de mapas do aparelho.
   *
   * A coordenada usada é a da OCORRÊNCIA, e não a do rascunho. A do rascunho é
   * onde o agente está de pé; a da ocorrência é onde ele precisa chegar. Levar
   * alguém até onde ele já está não é uma rota.
   */
  async function abrirRota(): Promise<void> {
    if (ocorrencia?.latitude == null || ocorrencia.longitude == null) return;
    setErro(null);
    const abriu = await abrirNoMapa(
      ocorrencia.latitude, ocorrencia.longitude, ocorrencia.endereco,
    );
    if (!abriu) {
      /*
        A coordenada vai no texto do aviso, e isso é o que salva a ida.

        Se nenhum aplicativo de mapas atendeu, dizer "não deu" deixaria o
        agente sem nada. Com os números na tela ele copia para onde quiser, ou
        lê por rádio para a base.
      */
      setErro(
        "Nenhum aplicativo de mapas atendeu neste aparelho. A coordenada da " +
        `ocorrência é ${ocorrencia.latitude.toFixed(6)}, ${ocorrencia.longitude.toFixed(6)}.`,
      );
    }
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
          ...contagensDoRascunho(rascunho.pessoas),
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

      /*
        A ORDEM DOS TRES PASSOS E OBRIGATORIA: enfileirar, gravar a lapide,
        apagar o rascunho. Cada inversao perde alguma coisa que ninguem
        recupera em campo.

        Apagar o rascunho antes de enfileirar apagaria a vistoria inteira se a
        fila recusasse, que e o pior desfecho possivel desta tela.

        Apagar o rascunho antes de gravar a lapide e o erro mais discreto e o
        mais caro: uma falha ao gravar a lapide deixaria a coleta na fila, o
        rascunho apagado e a tarefa parecendo intocada na lista. O toque
        seguinte abriria a segunda vistoria, que e o defeito que a lapide
        existe para impedir.

        Na ordem certa toda falha para num ponto seguro. Se a lapide falhar, o
        rascunho continua no disco; se o descarte falhar, a lapide ja barra a
        abertura. Ela esta em `concluirColetaEmOrdem`, e nao solta em tres
        linhas aqui, porque ordem sem teste e ordem que a proxima edicao
        inverte sem ninguem perceber.
      */
      await concluirColetaEmOrdem({
        enfileirar: () => fila.enfileirar(envelope, {
          protocolo: rascunho.protocolo,
          fotos: rascunho.fotos,
          ...(assinatura ? { assinatura } : {}),
        }),
        registrarColeta: () => marcarColetada({
          ocorrenciaId: rascunho.ocorrenciaId,
          idempotencyKey: rascunho.idempotencyKey,
          protocolo: rascunho.protocolo,
          coletadaEm: rascunho.coletadaEm,
        }),
        descartarRascunho: () => descartarRascunho(rascunho.ocorrenciaId),
      });

      setAvisandoQueGuardou(true);
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

  /*
    A ocorrencia ja foi coletada neste aparelho, e por isso esta tela nao e o
    formulario.

    Nao ha formulario nenhum montado por baixo: a decisao de abertura impediu a
    criacao do rascunho la em cima. Isso importa, porque um formulario montado
    "so para mostrar" seria um formulario que grava no disco no primeiro toque,
    e ai a coleta nova ja teria comecado antes de qualquer confirmacao.

    Revistoriar continua sendo possivel, e de proposito: a mesma ocorrencia pode
    precisar de segunda vistoria depois de uma chuva nova, e a migracao 009 do
    banco trata disso. O que nao pode e a segunda vistoria acontecer por
    acidente de um toque numa lista velha. Por isso a saida existe, fica em
    segundo lugar, e passa por confirmacao.
  */
  if (ocorrencia && jaColetada) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
            <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>
            <View style={{ flex: 1 }} />
            <SeloSeveridade severidade={ocorrencia.severidade} />
          </View>
          <Txt variante="h3">{ROTULO_TIPO_COBRADE[ocorrencia.tipo]}</Txt>
          <Txt variante="corpoP">{ocorrencia.endereco}</Txt>
        </Cartao>

        {/*
          O estado da coleta anterior num selo, e não só na frase.

          A frase abaixo diz a mesma coisa, e ela continua ali para quem lê. O
          selo existe para quem NÃO lê: o agente que abriu esta tela por engano,
          de relance, no meio da rua, precisa distinguir "já subiu" de "ainda
          está no aparelho" antes de decidir se vale a pena refazer.
        */}
        <Chip
          texto={jaColetada.situacao === "enviada" ? "Enviada" : "Na fila de envio"}
          simbolo={jaColetada.situacao === "enviada" ? "✓" : "↑"}
          tom={jaColetada.situacao === "enviada" ? "ok" : "neutro"}
          descricao={
            jaColetada.situacao === "enviada"
              ? "A vistoria já foi enviada ao servidor"
              : "A vistoria está na fila de envio deste aparelho"
          }
        />

        <Aviso tom="info">
          Esta ocorrência já foi coletada neste aparelho.
          {jaColetada.situacao === "enviada"
            ? " A vistoria já foi enviada ao servidor."
            : " A vistoria está na fila de envio e sobe assim que houver sinal."}
        </Aviso>

        <Txt variante="corpoP" discreto>
          A tarefa continua aparecendo na sua lista porque ela só sai de lá
          quando o aparelho conseguir falar com o servidor. Isso pode demorar
          horas sem sinal, e não significa que a vistoria se perdeu.
        </Txt>

        <Botao
          titulo="Ver na fila de envio"
          onPress={() => router.push("/(agente)/fila")}
        />

        {/*
          A saida deliberada. Segundo lugar, tipo secundario e confirmacao, os
          tres pela mesma razao: ela e legitima e e rara, e o custo de errar
          para o lado dela e um segundo laudo do mesmo protocolo, que o
          coordenador so descobre quando ja assinou um dos dois.
        */}
        <Botao
          titulo="Fazer nova vistoria desta ocorrência"
          tipo="secundario"
          onPress={() => { setPerguntandoNovaVistoria(true); }}
        />

        <Dialogo
          aberto={perguntandoNovaVistoria}
          titulo="Fazer nova vistoria?"
          texto={
            "A vistoria que você já fez continua guardada e vai ser enviada do " +
            "mesmo jeito. Esta será uma SEGUNDA vistoria da mesma ocorrência, e " +
            "as duas vão aparecer no protocolo."
          }
          /*
            "Cancelar" some, e no lugar dele entra o que a recusa realmente faz.
            Num diálogo lido com pressa, "Cancelar" é ambíguo do jeito mais caro
            possível: cancelar a nova vistoria, ou cancelar a que já foi feita?
          */
          acao={{
            rotulo: "Fazer nova vistoria",
            destrutiva: true,
            aoTocar: () => void refazerVistoria(),
          }}
          recusa={{ rotulo: "Manter só a vistoria que já fiz" }}
          aoFechar={() => { setPerguntandoNovaVistoria(false); }}
        />
      </ScrollView>
    );
  }

  if (!ocorrencia || !rascunho) return null;

  /*
    A confirmação é montada UMA vez e colocada em DUAS telas, e isso é a
    diferença entre um diálogo do aplicativo e o alerta do sistema.

    `Alert.alert` flutuava por cima de qualquer coisa: não importava se a tela
    embaixo era o formulário ou a minuta. Um `Modal` do aplicativo só existe na
    árvore em que foi montado, e a conclusão acontece com a MINUTA aberta, que é
    outro `return` desta função. Montar a confirmação só no formulário deixava a
    coleta entrar na fila e nada aparecer na tela: o agente ficava olhando a
    minuta, sem saber se apertou o botão certo, e o toque seguinte era em
    "Concluir vistoria" de novo.

    O botão diz para onde leva em vez de dizer "Entendi". Quem lê isto acaba de
    descer o morro e quer saber o que fazer agora, não confirmar que entendeu
    uma frase.
  */
  const confirmacaoDeGuardado = (
    <Dialogo
      aberto={avisandoQueGuardou}
      titulo="Vistoria guardada"
      texto={
        "Ela vai ser enviada assim que houver sinal. Você pode acompanhar na " +
        "fila de envio."
      }
      acao={{
        rotulo: "Voltar para a lista de tarefas",
        aoTocar: () => { router.back(); },
      }}
      aoFechar={() => { setAvisandoQueGuardou(false); }}
    />
  );

  /*
    Uma lista so, calculada fora da tela.

    Antes eram duas: a condicao do botao (`obrigatoriosFeitos && temFoto &&
    temAssinante`) e a frase do aviso, escrita a mao trezentas linhas abaixo com
    os mesmos tres itens. As duas esqueceram a assinatura, e `temAssinante`
    olhava o campo de TEXTO com o nome, nunca o traco.

    Consequencia medida em producao em 09/09/2026: as tres vistorias reais do
    piloto de Florianopolis chegaram ao servidor com `assinatura_chave` nula. O
    agente desenhou e o botao ja estava liberado.
  */
  const faltas = faltaParaConcluir(
    {
      checklist: rascunho.checklist,
      quantasFotos: rascunho.fotos.length,
      assinanteNome: rascunho.assinanteNome,
      assinaturaUri: rascunho.assinaturaUri ?? null,
    },
    CHECKLIST_OBRIGATORIO,
  );
  const podeConcluir = faltas.length === 0;

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
        pessoas: contagensDoRascunho(rascunho.pessoas),
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
        {confirmacaoDeGuardado}
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

  /*
    O prazo, dentro do formulário.

    Ele existia só na lista de tarefas. Uma vez dentro da vistoria, o agente
    perdia de vista exatamente a informação que decide se ele para para
    fotografar mais uma parede ou se desce para a próxima ocorrência.

    A conta é a mesma da lista, e vem do pacote compartilhado de propósito:
    duas contagens regressivas escritas separadamente divergem, e o dia em que
    divergirem a lista vai dizer uma coisa e a tela aberta outra.

    O selo diz a PALAVRA junto com a cor. Âmbar e vermelho são
    indistinguíveis sob sol forte na tela do aparelho, e para quem não separa
    as duas cores eles nunca foram distinguíveis.
  */
  const prazo = quantoFalta(ocorrencia.prazo_em, agora);
  /*
    A DATA entra junto com o relativo, e não no lugar dele.

    "Vence em 9h" responde "tenho tempo?"; "10/09, 12:30" responde "cai dentro
    do meu turno?". As duas perguntas são feitas no mesmo instante por quem está
    decidindo se para para fotografar mais uma parede, e o agente é justamente
    quem está mais longe de um calendário.
  */
  const rotuloDoPrazo = ocorrencia.prazo_em
    ? `${prazo.atrasado ? "! " : ""}Prazo `
      + prazo.texto.charAt(0).toLowerCase() + prazo.texto.slice(1)
      + ` (${dataDoPrazo(ocorrencia.prazo_em)})`
    : prazo.texto;
  const coresDoPrazo = prazo.vencido
    ? { fundo: tema.perigoFundo, cor: tema.perigoTexto }
    : prazo.atrasado
      ? { fundo: tema.alertaFundo, cor: tema.alertaTexto }
      : { fundo: tema.superficie2, cor: tema.textoDiscreto };

  const temCoordenada = ocorrencia.latitude != null && ocorrencia.longitude != null;

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
    <ScrollView
      /*
        Desligado enquanto o dedo desenha a assinatura. Os callbacks de
        captura do PanResponder ja ganham a disputa pelo gesto; isto remove a
        disputa. So vira duas vezes por traco, no inicio e no fim.
      */
      scrollEnabled={!desenhando}
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: espaco.e8 }}
    >
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2, flexWrap: "wrap" }}>
          <Selo texto={rotuloDoPrazo} fundo={coresDoPrazo.fundo} cor={coresDoPrazo.cor} />
        </View>

        {/*
          As duas ações da cabeça da tela: chegar lá, e sair daqui.

          Ficam no alto, e não no fim do rolamento. "Abrir no mapa" é lido
          dentro do carro, antes de a vistoria começar, e procurá-lo depois de
          rolar o formulário inteiro seria escondê-lo de quem só precisa dele
          antes de sair. "Salvar e sair" fica junto pelo motivo oposto: no alto
          ele exige um gesto deliberado, enquanto uma barra fixa embaixo do
          polegar é a escotilha de fuga que produz vistoria pela metade.
        */}
        <View style={{ flexDirection: "row", gap: espaco.e2 }}>
          {temCoordenada && (
            <Pressable
              onPress={() => void abrirRota()}
              accessibilityRole="button"
              accessibilityLabel={`Abrir a rota até ${ocorrencia.endereco} no aplicativo de mapas`}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: toque,
                paddingHorizontal: espaco.e3,
                borderRadius: raio.normal,
                borderWidth: 1,
                borderColor: tema.borda,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: espaco.e2,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <IconeMapa cor={tema.texto} />
              <Txt variante="corpo" negrito>Abrir no mapa</Txt>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Botao
              titulo="Salvar e sair"
              tipo="secundario"
              onPress={salvarESair}
              descricao="Salvar e sair, voltando para a lista de tarefas sem perder o que já foi preenchido"
            />
          </View>
        </View>

        {!temCoordenada && (
          <Txt variante="legenda" discreto>
            Esta ocorrência chegou sem coordenada. Use o endereço e a
            referência para chegar.
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
          aoComecarDesenho={() => setDesenhando(true)}
          aoTerminarDesenho={() => setDesenhando(false)}
        />
      </Cartao>

      {/*
        A contagem de pessoas, e ela vem ANTES das observações.

        Não é ordem de formulário, é ordem de conversa. O agente está na porta
        com alguém, e é essa pessoa que sabe quantos dormiram fora ontem. As
        observações ele escreve depois, sozinho, no carro.

        Cada campo pode ficar vazio, e vazio significa NÃO CONTADO. O laudo
        imprime "não informado", nunca zero: dizer "0 desabrigados" quando
        ninguém contou é uma afirmação falsa num documento que vai para
        processo.

        A ajuda fica embaixo de cada campo em vez de num cabeçalho geral,
        porque a diferença entre desalojado e desabrigado é exatamente o que
        alguém que nunca trabalhou em Defesa Civil não sabe, e ela precisa
        estar visível no instante em que o dedo vai digitar.
      */}
      <Cartao titulo="Pessoas atingidas">
        <Txt variante="legenda" discreto>
          Deixe em branco o que você não contou. Em branco não é zero.
        </Txt>
        {CAMPOS_PESSOAS.map((c) => (
          <View key={c.chave} style={{ gap: espaco.e1 }}>
            <Txt variante="corpoP" negrito>{c.rotulo}</Txt>
            <TextInput
              value={rascunho.pessoas[c.chave] ?? ""}
              onChangeText={(t) => void alterar({
                // Só dígito entra. Teclado numérico de Android ainda oferece
                // vírgula, ponto e sinal, e "2,5 feridos" não existe.
                pessoas: { ...rascunho.pessoas, [c.chave]: t.replace(/[^0-9]/g, "") },
              })}
              style={[campo, { minHeight: toque }]}
              keyboardType="number-pad"
              placeholder="não contado"
              placeholderTextColor={tema.textoDiscreto}
              maxLength={5}
              accessibilityLabel={`${c.rotulo}. ${c.ajuda}`}
            />
            <Txt variante="legenda" discreto>{c.ajuda}</Txt>
          </View>
        ))}
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
          Falta {faltas.join(", ")}.
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

      {/*
        A mesma confirmação da minuta. É o único diálogo desta tela sem recusa:
        não existe desfazer aqui, a vistoria já está na fila.
      */}
      {confirmacaoDeGuardado}
    </ScrollView>
  );
}
