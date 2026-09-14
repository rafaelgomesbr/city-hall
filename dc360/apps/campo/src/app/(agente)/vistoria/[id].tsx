import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated, Easing, Image, ScrollView, TextInput, View,
} from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import {
  CAMPOS_PESSOAS, CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA,
  ROTULO_TIPO_COBRADE,
  montarMinuta,
  type EnvelopeSincronizacao, type PessoasAtingidas,
} from "@dc360/shared";
import type { ColetaLocal, FotoLocal } from "@dc360/campo";
import {
  SemSinal, enderecoDaApi, type OrgaoDoCatalogo, type Pendencia,
} from "../../../dados/api";
import {
  atualizarPendencias, orgaosGuardados, pendenciaGuardada,
} from "../../../dados/pendencias";
import { arquivarColeta, coletaDe, marcarColetada } from "../../../dados/coletas";
import { guardarFotoNoAparelho } from "../../../dados/evidencia-no-disco";
import { obterFila } from "../../../dados/fila";
import { abrirNoMapa } from "../../../dados/mapa";
import {
  descartarRascunho, lerRascunho, rascunhoNovo, salvarRascunho, type Rascunho,
} from "../../../dados/rascunho";
import { useSessao } from "../../../dados/sessao";
import { Assinatura } from "../../../ui/Assinatura";
import { MinutaDoLaudo } from "../../../ui/MinutaDoLaudo";
import {
  Aviso, Botao, Cartao, Carregando, Separador, Tocavel, Txt, Vazio, useTema,
} from "../../../ui/componentes";
import { Campo, CampoDeTexto } from "../../../ui/Campo";
import { Chip, SeloSeveridade } from "../../../ui/Chip";
import { Dialogo } from "../../../ui/Dialogo";
import {
  IconeAlerta, IconeAssinatura, IconeChecklist, IconeEnvio, IconeFoto, IconeGps,
  IconeLocalizacao, IconeOrgao, IconePerigo, IconePrazoVencido, IconeSucesso,
} from "../../../ui/icones";
import { OrgaosParaAcionar } from "../../../ui/OrgaosParaAcionar";
import {
  borda, easing, elevacao, espaco, icone, movimento, peso, raio, toque, visor } from "../../../ui/tokens";
import { useReducaoDeMovimento } from "../../../ui/useReducaoDeMovimento";
import { retornoTatil } from "../../../ui/retornoTatil";
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
 * O lado da miniatura de fotografia, em pontos.
 *
 * Estava escrito 96 duas vezes na mesma linha. Não é token de sistema (não
 * existe escala de miniatura no produto, e inventar uma aqui seria decidir por
 * todas as telas a partir de uma), mas é uma medida com nome, num lugar só.
 * Grande o bastante para o agente reconhecer a parede que fotografou, e pequena
 * o bastante para caber três por linha no aparelho estreito.
 */
const MINIATURA = 96;

/** De onde a miniatura recém guardada cresce. Perto de 1: entrada, não salto. */
const ESCALA_DA_FOTO_ENTRANDO = 0.8;

/**
 * As âncoras de rolagem desta tela, e por que elas existem.
 *
 * O formulário da vistoria passa de dois mil pontos de altura no aparelho. A
 * frase "falta tirar ao menos uma fotografia" ficava no FIM dessa rolagem, e o
 * agente que a lia subia a tela procurando onde. Agora cada pendência tem um
 * caminho: um toque leva ao cartão que a resolve.
 *
 * São três e não sete porque só existem três lugares onde uma pendência de
 * conclusão se resolve. `checklist` recebe também a indicação de órgão, que é o
 * desdobramento de um item dele e mora dentro do mesmo cartão, colado na
 * pergunta que o abriu.
 */
type SecaoDaVistoria = "progresso" | "checklist" | "fotos" | "assinatura";

/**
 * De qual pendência o texto fala, e para onde ela leva.
 *
 * A lista do que falta é `faltaParaConcluir`, no pacote compartilhado, e não
 * pode virar uma segunda lista escrita aqui: foi assim que a assinatura sumiu
 * de uma e não da outra, e três vistorias reais chegaram ao servidor sem o
 * traço de quem assinou. Então a TELA não decide o que falta, só decide para
 * onde cada falta leva.
 *
 * O casamento é por trecho estável do texto, e a fragilidade disso é conhecida:
 * se alguém reescrever a frase no pacote, o caminho some em silêncio. Por isso
 * existe o caso de teste que gera TODAS as saídas possíveis de
 * `faltaParaConcluir` e exige que cada uma encontre seção aqui. Sem ele, esta
 * tabela seria um mapeamento que dá verde para sempre.
 *
 * A ordem importa: "coletar e confirmar a assinatura de quem estava no local"
 * contém os dois trechos de assinatura, e os dois levam ao mesmo cartão.
 */
const CAMINHO_DA_FALTA: ReadonlyArray<{ trecho: string; secao: SecaoDaVistoria }> = [
  { trecho: "checklist", secao: "checklist" },
  { trecho: "órgão", secao: "checklist" },
  { trecho: "fotografia", secao: "fotos" },
  { trecho: "assinatura", secao: "assinatura" },
  { trecho: "quem estava no local", secao: "assinatura" },
];

export function secaoDaFalta(falta: string): SecaoDaVistoria | null {
  return CAMINHO_DA_FALTA.find((c) => falta.includes(c.trecho))?.secao ?? null;
}

/**
 * Um requisito de conclusão, do ponto de vista de QUEM ESTÁ PREENCHENDO.
 *
 * `faltaParaConcluir` responde "dá para concluir, e o que impede". Esta lista
 * responde outra pergunta, que ela não tem como responder: "quanto do trabalho
 * já está feito". Para isso é preciso conhecer também o que está PRONTO, e a
 * função devolve só o que falta.
 *
 * Duas listas para o mesmo fato divergem na primeira pressa, e este arquivo já
 * pagou esse preço uma vez. O que impede a repetição não é disciplina: é o caso
 * de teste que exige a EQUIVALÊNCIA das duas (nenhum requisito pendente se e
 * somente se `faltaParaConcluir` devolve lista vazia), varrendo os estados
 * intermediários. Barra cheia com botão travado é o defeito que ele guarda.
 */
type RequisitoDeConclusao = {
  chave: string;
  rotulo: string;
  secao: SecaoDaVistoria;
  feito: boolean;
};

/**
 * O título de cartão com ícone, montado aqui e não dentro de `Cartao`.
 *
 * `Cartao` recebe `titulo` como texto e mora em `src/ui`, que é faixa de outra
 * frente. Enquanto ele não aceitar um desenho, o cartão entra sem `titulo` e a
 * linha do título é desenhada aqui. O texto continua sendo o mesmo texto: o
 * ícone acompanha a palavra, nunca a substitui, porque quem usa este
 * aplicativo o abre duas vezes por semana e não decora pictograma.
 *
 * No nível do módulo, e não dentro da tela: componente declarado dentro de
 * outro é um tipo novo a cada renderização, e o React desmonta e remonta a
 * subárvore inteira a cada toque do checklist.
 */
function TituloDoCartao({ desenho, texto }: { desenho: ReactNode; texto: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
      {desenho}
      <Txt variante="h3">{texto}</Txt>
    </View>
  );
}

export function requisitosDeConclusao(estado: {
  checklist: Readonly<Record<string, unknown>>;
  orgaosParaAcionar: ReadonlyArray<{ nome: string }>;
  quantasFotos: number;
  assinanteNome: string;
  assinaturaUri: string | null;
}): RequisitoDeConclusao[] {
  return [
    ...CHECKLIST_OBRIGATORIO.map((item) => ({
      chave: `checklist:${item.chave}`,
      rotulo: item.rotulo,
      secao: "checklist" as const,
      feito: item.chave in estado.checklist,
    })),
    /*
      O órgão só é requisito depois de o agente ter respondido "sim". Contá-lo
      sempre faria a barra nascer em "0 de 8" e nunca chegar a oito na vistoria
      em que ninguém precisa ser acionado, que é a maioria delas.
    */
    ...(estado.checklist[CHAVE_ACIONAR_ORGAO] === true
      ? [{
          chave: "orgaos",
          rotulo: "Órgão a acionar indicado",
          secao: "checklist" as const,
          feito: estado.orgaosParaAcionar.length > 0,
        }]
      : []),
    {
      chave: "fotos",
      rotulo: "Ao menos uma fotografia",
      secao: "fotos" as const,
      feito: estado.quantasFotos > 0,
    },
    {
      chave: "assinante",
      rotulo: "Nome de quem assina",
      secao: "assinatura" as const,
      feito: estado.assinanteNome.trim().length > 0,
    },
    {
      chave: "assinatura",
      rotulo: "Traço da assinatura",
      secao: "assinatura" as const,
      feito: Boolean(estado.assinaturaUri),
    },
  ];
}

export default function TelaDeVistoria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navegacao = useNavigation();
  const tema = useTema();
  const { obterToken, identidade, lerIdentidade } = useSessao();

  const [ocorrencia, setOcorrencia] = useState<Pendencia | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  /**
   * A lapide da coleta que este aparelho ja fez desta ocorrencia.
   *
   * Enquanto ela existe e nao esta arquivada, esta tela NAO abre formulario
   * nenhum: mostra o aviso e as duas saidas. Ver `decidirAberturaDaVistoria`.
   */
  const [jaColetada, setJaColetada] = useState<ColetaLocal | null>(null);
  /**
   * O catálogo de órgãos do município, lido do DISCO ao abrir a tela.
   *
   * Estado, e não leitura na hora de desenhar: a tela é redesenhada a cada toque
   * do checklist, e uma consulta ao SQLite por renderização disputaria o banco
   * com a gravação do rascunho, que é a escrita que não pode falhar aqui.
   *
   * Começa vazio e assim permanece no aparelho que nunca sincronizou. Isso é
   * previsto: o campo livre da seleção conclui a vistoria sozinho.
   */
  const [catalogoDeOrgaos, setCatalogoDeOrgaos] = useState<OrgaoDoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A tarefa existe no servidor e ainda não chegou a este aparelho.
   *
   * Estado próprio, e não uma frase dentro de `erro`, porque as duas coisas
   * pedem telas diferentes: erro mostra tarja vermelha e não oferece saída,
   * enquanto isto aqui é ordem de chegada e tem conserto de um toque.
   */
  const [faltaBaixar, setFaltaBaixar] = useState(false);
  const [baixando, setBaixando] = useState(false);
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
  /*
    Trocar a resposta para "não" APAGA os órgãos que o agente já indicou, e por
    isso passa por pergunta. Não é zelo: a lista precisa mesmo sair (uma coleta
    que diz "não é necessário acionar ninguém" e lista três órgãos é uma
    contradição que o servidor recusa), e apagar em silêncio um nome digitado à
    mão é perder trabalho por causa de um toque errado numa tela pequena.
  */
  const [perguntandoDescartarOrgaos, setPerguntandoDescartarOrgaos] = useState(false);
  /*
    Apagar fotografia passa a PERGUNTAR, e a comparação que decidiu isto está
    dentro do próprio aplicativo: descartar um item da fila de envio, que é
    menos grave (a coleta ainda pode ser refeita do rascunho), já perguntava.
    Aqui o toque errado apaga a prova de uma interdição, que não se refaz sem
    subir o morro de novo com o morador esperando.
  */
  const [fotoParaApagar, setFotoParaApagar] = useState<FotoLocal | null>(null);
  /*
    A última fotografia guardada, para ela ter ENTRADA na tela.

    Antes daqui a câmera fechava e a miniatura simplesmente estava lá, sem
    flash, sem som e sem movimento: o agente não sabia se o obturador tinha
    pegado, e a reação natural é tirar a mesma foto de novo. Guardar a chave (e
    não um booleano) faz a animação valer para a foto CERTA quando duas são
    tiradas em seguida.
  */
  const [fotoRecemGuardada, setFotoRecemGuardada] = useState<string | null>(null);
  /** Enquanto true, o ScrollView desta tela nao rola: o dedo esta assinando. */
  const [desenhando, setDesenhando] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const reduzirMovimento = useReducaoDeMovimento();

  /*
    A rolagem e as âncoras: como um toque em "falta a fotografia" leva ao
    cartão das fotografias.

    As alturas ficam numa `ref` e não em estado. Elas são escritas pelo
    `onLayout` de cada cartão, que dispara a cada medição; em estado, cada
    medição provocaria uma renderização nova, e a renderização nova mediria de
    novo. Nada aqui é lido durante o desenho: só no instante do toque.
  */
  const rolagem = useRef<ScrollView>(null);
  const alturaDaSecao = useRef<Partial<Record<SecaoDaVistoria, number>>>({});
  /*
    Onde o agente ACABOU DE CHEGAR.

    Rolar sozinho até um cartão, num formulário com sete deles, deixa quem está
    olhando sem saber se a tela obedeceu ou se ela se mexeu por conta própria (é
    a mesma reclamação que a lista de tarefas recebeu: "dá uma rolada sozinha").
    O destino acende um contorno por alguns segundos, e o contorno é espessura
    MAIS cor, nunca só cor.
  */
  const [secaoEmDestaque, setSecaoEmDestaque] = useState<SecaoDaVistoria | null>(null);

  /*
    O CLÍMAX da conclusão, e a guarda que impede a comemoração de acontecer à
    toa.

    O vocabulário é o da `FaixaDeSincronizacao`, que já acertou isto uma vez:
    `movimento.climax` partido em 40% de ida e 60% de volta, `Easing.out(
    Easing.back(2))` só na ida (a curva que passa do alvo é o que separa "o
    estado mudou" de "conseguimos", e por isso ela não é emprestada para mais
    nada nesta tela), e `useNativeDriver` porque escala é propriedade que a
    camada nativa anima sozinha. Sem isso cada quadro atravessa a ponte, e num
    aparelho fraco de prefeitura a comemoração sai travada, que é pior do que
    não ter comemoração nenhuma.

    **Por que a guarda existe, se o efeito já depende de `avisandoQueGuardou`.**
    O arranjo de dependências sozinho NÃO garante "uma vez", e vale dizer com
    precisão por quê: o efeito depende também de `reduzirMovimento`, que é lido
    de um evento do SISTEMA e muda no meio do plantão (quem liga essa chave
    quase sempre liga porque começou a passar mal, e este aplicativo fica aberto
    o dia inteiro). Ligar e desligar a chave com a tela de conclusão aberta faria
    o efeito rodar de novo, e o emblema pularia sozinho sem nada ter sido
    concluído.

    A `ref` torna "comemora uma vez por conclusão" verdade por CONSTRUÇÃO, e não
    por acidente de quais valores estão no arranjo hoje: a dependência que
    alguém acrescentar amanhã não traz a comemoração de volta junto. Ela volta a
    `false` quando o estado volta, que é o que permite uma segunda vistoria
    comemorar de novo.

    O valor de repouso é 1, e não 0: se por qualquer motivo o efeito não rodar,
    o emblema aparece no tamanho certo em vez de sumir da tela.
  */
  const emblemaDaConclusao = useRef(new Animated.Value(1)).current;
  const jaComemorou = useRef(false);

  useEffect(() => {
    if (!avisandoQueGuardou) {
      jaComemorou.current = false;
      return;
    }
    if (jaComemorou.current) return;
    jaComemorou.current = true;

    if (reduzirMovimento) {
      // Quem pediu menos movimento continua vendo o emblema, o título e o
      // resumo. O que some é a interpolação, nunca o fato.
      emblemaDaConclusao.setValue(1);
      return;
    }

    emblemaDaConclusao.setValue(0.6);
    Animated.sequence([
      Animated.timing(emblemaDaConclusao, {
        toValue: 1.12,
        duration: movimento.climax * 0.4,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
      Animated.timing(emblemaDaConclusao, {
        toValue: 1,
        duration: movimento.climax * 0.6,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [avisandoQueGuardou, reduzirMovimento, emblemaDaConclusao]);

  /*
    A entrada da miniatura recém guardada.

    Um valor só para todas as fotos, porque só UMA é a nova a cada instante:
    um valor por foto seria uma animação por miniatura viva na tela o plantão
    inteiro, sem ninguém olhando para elas.
  */
  const entradaDaFoto = useRef(new Animated.Value(1)).current;
  const escalaDaFotoNova = entradaDaFoto.interpolate({
    inputRange: [0, 1],
    outputRange: [ESCALA_DA_FOTO_ENTRANDO, 1],
  });

  useEffect(() => {
    if (!fotoRecemGuardada) return;
    if (reduzirMovimento) {
      entradaDaFoto.setValue(1);
      return;
    }
    entradaDaFoto.setValue(0);
    Animated.timing(entradaDaFoto, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      // Opacidade e escala: a camada nativa desenha as duas sozinha, e o
      // JavaScript deste aplicativo pode estar ocupado drenando a fila.
      useNativeDriver: true,
    }).start();
  }, [fotoRecemGuardada, reduzirMovimento, entradaDaFoto]);

  /*
    A confirmação da fotografia guardada some sozinha.

    Ela é retorno de um ato que acabou de acontecer, não um estado da vistoria:
    deixada na tela, vira mais uma linha permanente num formulário que já é
    longo, e o agente para de enxergá-la justamente na foto seguinte, que é
    quando ela precisa ser vista.
  */
  useEffect(() => {
    if (!fotoRecemGuardada) return;
    const relogio = setTimeout(() => { setFotoRecemGuardada(null); }, movimento.climax * 8);
    return () => { clearTimeout(relogio); };
  }, [fotoRecemGuardada]);

  useEffect(() => {
    if (!secaoEmDestaque) return;
    const relogio = setTimeout(() => { setSecaoEmDestaque(null); }, movimento.climax * 6);
    return () => { clearTimeout(relogio); };
  }, [secaoEmDestaque]);

  const irPara = useCallback((secao: SecaoDaVistoria) => {
    setSecaoEmDestaque(secao === "progresso" ? null : secao);
    const y = alturaDaSecao.current[secao];
    if (y == null) return;
    /*
      Sobe um respiro acima do cartão para o título dele aparecer inteiro. Sem
      isso o destino fica colado no topo da tela e parece meia seção.
    */
    rolagem.current?.scrollTo({
      y: Math.max(0, y - espaco.e4),
      animated: !reduzirMovimento,
    });
  }, [reduzirMovimento]);

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

  const carregarDoDisco = useCallback(async () => {
    /*
      A leitura do disco passa a ter caminho de falha, e antes não tinha.

      Se o banco local não abrisse (armazenamento cheio, arquivo corrompido,
      migração do SQLite no meio), a promessa era rejeitada e ninguém pegava:
      `setCarregando(false)` nunca rodava e a tela ficava com a roda girando
      PARA SEMPRE, sem uma palavra. O agente em pé no barranco não tem como
      distinguir isso de sinal ruim, e o que ele faz é matar o aplicativo, que
      é o único jeito de perder coleta neste produto.

      Agora a falha vira a tela desenhada de erro, com nome e com saída.
    */
    setErro(null);
    try {
      const alvo = await pendenciaGuardada(id);
      if (!alvo) {
        /*
          Não é erro, é ORDEM DE CHEGADA, e a diferença muda o que a tela diz.

          Este caminho ficou muito mais comum depois que tocar na notificação
          passou a abrir a tarefa: o aviso de push chega no segundo em que a
          coordenação despacha, e a lista de tarefas deste aparelho só é
          reescrita na próxima atualização. Entre um instante e outro a
          ocorrência existe no servidor e não existe no disco, e isso é o
          sistema funcionando, não falhando.

          A tela anterior dizia "Esta ocorrência não está guardada neste
          aparelho", em tarja vermelha, o que soa a defeito e não sugere ação
          nenhuma. Agora ela nomeia a causa e oferece o botão que resolve.
        */
        setFaltaBaixar(true);
        setCarregando(false);
        return;
      }
      setFaltaBaixar(false);
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
      /*
        O catálogo desce do DISCO junto com a tarefa, e nunca da rede: esta tela
        não faz chamada nenhuma, porque tentar e falhar no alto do morro gasta
        bateria e ensina o agente a desconfiar de uma coleta que está guardada.
      */
      const [guardado, lapide, orgaos] = await Promise.all([
        lerRascunho(id), coletaDe(id), orgaosGuardados(),
      ]);
      setCatalogoDeOrgaos(orgaos);
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
    } catch {
      setErro(
        "Não foi possível ler esta vistoria no aparelho. O que já estava "
        + "guardado continua guardado: nada foi apagado.",
      );
      setCarregando(false);
    }
  }, [id, navegacao]);

  useEffect(() => { void carregarDoDisco(); }, [carregarDoDisco]);

  /**
   * Busca a lista de tarefas e tenta abrir de novo.
   *
   * É a única ida à rede desta tela, e ela só existe neste estado: a tela de
   * coleta continua sem tocar na rede, porque tentar e falhar no alto do morro
   * gasta bateria e ensina o agente a desconfiar de uma coleta que está
   * perfeitamente guardada. Aqui a rede é o ponto: sem ela não há o que abrir.
   */
  const baixarEAbrir = useCallback(async () => {
    setBaixando(true);
    setErro(null);
    try {
      const token = await obterToken();
      if (!token) {
        setErro("A sua sessão expirou. Entre de novo para baixar as tarefas.");
        return;
      }
      await atualizarPendencias(token);
      await carregarDoDisco();
    } catch (e: unknown) {
      setErro(
        e instanceof SemSinal
          ? "Sem sinal para baixar a lista agora. Procure sinal e tente de novo."
          : "Não deu para baixar a lista agora. Tente de novo em alguns minutos.",
      );
    } finally {
      setBaixando(false);
    }
  }, [obterToken, carregarDoDisco]);

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
      if (foto?.uri) {
        await guardarFoto(foto.uri);
        /*
          O visor é preto e a câmera fecha: sem flash, sem som e sem toque, o
          agente não sabe se a foto pegou, e a resposta natural é fotografar de
          novo a mesma parede. A miniatura entrando já dá o retorno para quem
          está olhando; isto é para quem está olhando o barranco.
        */
        retornoTatil("confirmado");
      }
    } catch {
      setErro("O aparelho não conseguiu tirar a foto. Tente de novo.");
      setCameraAberta(false);
    } finally {
      setFotografando(false);
    }
  }

  async function guardarFoto(uri: string): Promise<void> {
    if (!rascunho) return;
    /*
      A foto sai do cache do sistema ANTES de entrar no rascunho.

      A câmera devolve um caminho de cache, e cache é o que o sistema apaga
      sozinho quando o armazenamento aperta. Guardar esse caminho aqui faria a
      coleta apontar, por horas, para um arquivo que pode sumir sem aviso, e o
      envio inteiro morreria nele. O porquê está inteiro em
      `dados/evidencia-no-disco.ts`.
    */
    const guardada = guardarFotoNoAparelho(uri, rascunho.fotos.length);
    const foto: FotoLocal = {
      // A chave nasce aqui, com a foto, e não no envio: é ela que impede o
      // servidor de aceitar a mesma imagem duas vezes se o envio for repetido.
      idempotencyKey: Crypto.randomUUID(),
      uriLocal: guardada.uriLocal,
      nomeArquivo: `vistoria-${rascunho.protocolo.replace("/", "-")}-${rascunho.fotos.length + 1}.jpg`,
      tipoConteudo: "image/jpeg",
      tamanhoBytes: guardada.tamanhoBytes,
      capturadaEm: new Date().toISOString(),
      ordem: rascunho.fotos.length,
      ...(rascunho.coordenada ? { coordenada: rascunho.coordenada } : {}),
    };
    await alterar({ fotos: [...rascunho.fotos, foto] });
    /*
      O RETORNO do obturador, e ele é a correção de um defeito relatado com o
      aparelho na mão: a câmera fechava e a miniatura aparecia, sem flash, sem
      som e sem movimento nenhum. Quem está de luva, na chuva, com o morador
      esperando, não confere miniatura de 96 pontos: tira a foto de novo.

      Duas coisas, e as duas de propósito. A chave alimenta a ENTRADA da
      miniatura (escala e opacidade, que a camada nativa anima sozinha), e a
      linha de confirmação, com região viva, diz em PALAVRA o que aconteceu,
      porque movimento não chega a quem usa leitor de tela nem a quem desligou
      a animação no sistema.
    */
    setFotoRecemGuardada(foto.idempotencyKey);
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
          /*
            A lista só viaja quando a resposta foi SIM.

            Mandar uma lista com o item respondido "não" é contradição dentro do
            mesmo documento, e o servidor recusa (ver `vistoriaSchema`). O
            caminho normal já limpa a lista ao trocar a resposta; isto é o
            segundo fecho, para que um rascunho gravado num estado intermediário
            de uma versão anterior não vire coleta bloqueada na fila.
          */
          ...(rascunho.checklist[CHAVE_ACIONAR_ORGAO] === true
              && rascunho.orgaosParaAcionar.length > 0
            ? { orgaosParaAcionar: rascunho.orgaosParaAcionar }
            : {}),
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

      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);

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

      /*
        Quarenta minutos de morro terminam aqui, e o aparelho pode estar no
        bolso enquanto o agente fala com o morador. Este é o `concluido`, com a
        forma de dois toques do sistema, e não o mesmo toque curto da foto:
        "terminou" e "pegou" são fatos de tamanhos diferentes.
      */
      retornoTatil("concluido");
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

  /*
    A espera com saída, que é metade do componente e não estava ligada.

    `Carregando` sabe declarar a demora aos seis segundos e oferecer uma porta;
    sem `aoDesistir`, a porta fecha a espera e deixa o agente numa tela que só
    diz "você parou de esperar", sem levar a lugar nenhum. Aqui a saída é a
    mesma de "Salvar e sair": volta para a lista, e nada do que estava no disco
    é tocado. O rótulo diz para onde leva, e não "parar de esperar", porque
    quem está em pé no morro quer saber o que fazer agora.
  */
  if (carregando) {
    return (
      <Carregando
        mensagem="Abrindo a vistoria"
        aoDesistir={salvarESair}
        rotuloDaSaida="Voltar para as tarefas"
      />
    );
  }

  /*
    A tarefa ainda não desceu para este aparelho.

    Tela inteira, e não uma tarja: o agente chegou aqui tocando numa
    notificação, então ele TEM sinal neste instante, e a coisa mais provável de
    ele querer é justamente baixar. A frase nomeia a causa (a lista é mais
    velha que o despacho) porque "não está guardada neste aparelho" sugere
    defeito, e defeito é o que faz o agente ligar para a coordenação em vez de
    tocar no botão que resolve.

    Vem ANTES da checagem de erro para que uma falha de rede na tentativa
    anterior não substitua esta tela pela tarja vermelha: o aviso da falha entra
    aqui dentro, ao lado do botão de tentar de novo.
  */
  if (faltaBaixar) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Vazio
          titulo="Esta tarefa ainda não está neste aparelho"
          descricao={
            "Ela foi despachada depois da última vez que você baixou a lista. "
            + "Com sinal, baixe agora e ela abre em seguida."
          }
        />
        {erro && <Aviso tom="alerta">{erro}</Aviso>}
        <Botao
          titulo="Baixar tarefas agora"
          onPress={() => void baixarEAbrir()}
          carregando={baixando}
          testID="baixar-para-abrir"
        />
        <Botao
          titulo="Voltar para as tarefas"
          tipo="secundario"
          onPress={() => { router.back(); }}
        />
      </ScrollView>
    );
  }

  /*
    A vistoria não abriu, e esta é a tela disso.

    Antes era uma tarja vermelha órfã dentro de um `View` com recuo: sem
    título, sem ícone, sem nenhuma indicação do que fazer e sem saída. Era a
    tela menos acabada do aplicativo, e ela aparece justamente no pior momento,
    que é o agente tocando na tarefa com alguém esperando na porta.

    O desenho é o mesmo do estado de "ainda não baixada", logo acima, e isso é
    deliberado: as duas são a mesma pergunta ("por que isto não abriu?") com
    respostas diferentes, e responder as duas com formatos diferentes ensina o
    agente a não reconhecer nenhuma das duas.

    As duas saídas, nesta ordem: tentar de novo (quase sempre resolve, porque a
    falha típica é o banco local ocupado por uma gravação da fila) e voltar,
    que é o que salva quem está preso aqui.
  */
  if (erro && !ocorrencia) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Vazio
          titulo="Não deu para abrir esta vistoria"
          descricao={erro}
          icone={<IconePerigo cor={tema.perigoTexto} tamanho={icone.vazio} />}
        />
        <Botao
          titulo="Tentar de novo"
          onPress={() => { setCarregando(true); void carregarDoDisco(); }}
          testID="tentar-abrir-de-novo"
        />
        <Botao
          titulo="Voltar para as tarefas"
          tipo="secundario"
          onPress={salvarESair}
        />
      </ScrollView>
    );
  }

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
        {/*
          O símbolo é DESENHO e não caractere. Eram "✓" e "↑" tipográficos,
          que herdam o peso e a altura da fonte em vez do traço do conjunto, e
          que no aparelho ficavam com dois pesos diferentes lado a lado. O
          `Chip` passou a aceitar um nó, então o selo usa os mesmos ícones do
          resto do produto. A palavra continua ali: o desenho é a segunda
          pista, nunca a única.

          A COR do desenho vem do chip, e não daqui. Enquanto vinha daqui
          (`cor={tema.okTexto}` escrito ao lado de `tom="ok"`), esta linha era
          uma segunda cópia do mapa de cores do `Chip`, e o dia em que o tom
          "ok" mudasse deixaria este ícone com a cor antiga, sem nada acusar.
        */}
        <Chip
          texto={jaColetada.situacao === "enviada" ? "Enviada" : "Na fila de envio"}
          simbolo={(cor) => (jaColetada.situacao === "enviada"
            ? <IconeSucesso cor={cor} tamanho={icone.inline} />
            : <IconeEnvio cor={cor} tamanho={icone.inline} />)}
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
    A CONCLUSÃO, e por que ela é uma tela e não mais um diálogo.

    Ela era o mesmo `Dialogo` de "Sair da conta?": duas frases cinzas e um
    botão, com o desenho de uma pergunta de rotina. Quarenta minutos de
    trabalho no morro, uma casa interditada, a assinatura de quem mora nela, e
    o aplicativo respondia com a caixa de confirmação mais barata que ele tem.

    Três coisas mudam, e nenhuma é enfeite:

    1. **É tela inteira, e vem antes de qualquer outro `return`.** A conclusão
       acontece com a MINUTA aberta, e o diálogo montado só no formulário
       deixava a coleta entrar na fila sem nada aparecer, com o agente olhando
       a minuta e tocando em "Concluir vistoria" de novo. Sendo o primeiro
       `return`, ela cobre os dois caminhos por construção, e não por lembrança.
    2. **Ela RESUME o que foi guardado.** A dúvida de quem desce o morro não é
       "deu certo?", é "foi tudo?". Fotografias, assinatura e checklist ditos em
       número respondem isso sem abrir a fila.
    3. **Ela tem o clímax**, com a guarda de origem escrita lá em cima.

    As duas saídas continuam nomeando o destino em vez de dizer "Entendi": quem
    acaba de descer o morro quer saber o que fazer agora.
  */
  if (avisandoQueGuardou) {
    const quantasFotos = rascunho.fotos.length;
    const respondidos = CHECKLIST_VISTORIA.filter((i) => i.chave in rascunho.checklist).length;

    return (
      <ScrollView
        testID="vistoria-guardada"
        contentContainerStyle={{
          flexGrow: 1,
          padding: espaco.e5,
          gap: espaco.e4,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tema.fundo,
        }}
      >
        {/*
          O emblema é DECORAÇÃO do título que vem logo abaixo: anunciá-lo de
          novo faria o leitor de tela dizer "concluído" duas vezes seguidas.
        */}
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="emblema-da-conclusao"
          style={{
            width: espaco.e8 + espaco.e5,
            height: espaco.e8 + espaco.e5,
            borderRadius: raio.pilula,
            backgroundColor: tema.okFundo,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: emblemaDaConclusao }],
          }}
        >
          <IconeSucesso cor={tema.okTexto} tamanho={icone.vazio} />
        </Animated.View>

        <Txt variante="h1" alinhamento="center">Vistoria guardada</Txt>
        <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>

        {/*
          O resumo em três linhas com ícone, e não um parágrafo. Cada linha
          responde uma pergunta que o agente faria à fila de envio se não
          estivesse escrita aqui.
        */}
        <View style={{
          ...elevacao(tema).cartao,
          borderRadius: raio.cartao,
          padding: espaco.e4,
          gap: espaco.e3,
          alignSelf: "stretch",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeChecklist cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP">
              {respondidos} de {CHECKLIST_VISTORIA.length} itens do checklist respondidos
            </Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeFoto cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP">
              {quantasFotos === 1 ? "1 fotografia guardada" : `${quantasFotos} fotografias guardadas`}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeAssinatura cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <View style={{ flex: 1 }}>
              <Txt variante="corpoP">
                Assinada por {rascunho.assinanteNome.trim()}
              </Txt>
            </View>
          </View>
        </View>

        <Aviso tom="info" titulo="Ela sobe sozinha">
          Nada depende de sinal agora. A coleta está na fila de envio deste
          aparelho e sobe assim que houver rede, mesmo com o aplicativo fechado.
        </Aviso>

        <View style={{ alignSelf: "stretch", gap: espaco.e3 }}>
          <Botao
            titulo="Voltar para a lista de tarefas"
            testID="voltar-depois-de-guardar"
            onPress={() => { setAvisandoQueGuardou(false); salvarESair(); }}
          />
          <Botao
            titulo="Ver na fila de envio"
            tipo="secundario"
            onPress={() => { setAvisandoQueGuardou(false); router.push("/(agente)/fila"); }}
          />
        </View>
      </ScrollView>
    );
  }

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
      orgaosParaAcionar: rascunho.orgaosParaAcionar,
      quantasFotos: rascunho.fotos.length,
      assinanteNome: rascunho.assinanteNome,
      assinaturaUri: rascunho.assinaturaUri ?? null,
    },
    CHECKLIST_OBRIGATORIO,
  );
  const podeConcluir = faltas.length === 0;

  /*
    O mesmo estado visto pelo outro lado: o que já está FEITO.

    `faltaParaConcluir` não tem como responder isso, porque ela devolve só o
    que falta, e o agente precisa saber quanto do trabalho já entrou. As duas
    listas ficam amarradas por um caso de teste, e não por disciplina: nenhum
    requisito pendente se e somente se `faltas` está vazia. Barra cheia com
    botão travado é o defeito exato que ele guarda.
  */
  const requisitos = requisitosDeConclusao({
    checklist: rascunho.checklist,
    orgaosParaAcionar: rascunho.orgaosParaAcionar,
    quantasFotos: rascunho.fotos.length,
    assinanteNome: rascunho.assinanteNome,
    assinaturaUri: rascunho.assinaturaUri ?? null,
  });
  const feitos = requisitos.filter((r) => r.feito).length;

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
        /*
          Os órgãos entram na minuta que o agente lê em voz alta na porta da
          casa, e não só no envelope. É ali que quem está presente ouve "vamos
          acionar a concessionária de energia" e corrige se estiver errado, que é
          a única chance de corrigir antes de o laudo virar documento.
        */
        orgaosParaAcionar: rascunho.orgaosParaAcionar,
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
          borderTopWidth: borda.fio, borderTopColor: tema.borda,
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
      <View style={{ flex: 1, backgroundColor: visor.fundo }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={{
          padding: espaco.e5, gap: espaco.e3,
          backgroundColor: visor.fundo, alignItems: "center",
        }}>
          {/*
            Disparador redondo e grande, no lugar onde o polegar já está. Um
            botão de tamanho normal aqui seria errado a cada duas fotos, e cada
            erro é uma foto perdida com o morador esperando.
          */}
          <Tocavel
            accessibilityRole="button"
            onPress={() => void fotografar()}
            desabilitado={fotografando}
            accessibilityLabel="Tirar a fotografia"
            /*
              As duas opacidades daqui eram números soltos, 0,5 e 0,8, escritos
              à mão no único lugar do aplicativo onde o dedo dispara algo
              irreversível. Agora saem de `opacidade`, pelo `Tocavel`: o
              desabilitado é `inativo` e o toque é `aoToque`, os mesmos do botão
              que fica logo abaixo, na mesma tela.
            */
            estilo={{
              width: 84, height: 84, borderRadius: raio.pilula,
              backgroundColor: visor.obturador,
              /*
                O anel do obturador não é contorno de superfície. Ele tem a
                espessura que uma câmera de telefone desenha, junto com os 84
                pontos de diâmetro logo acima, e não a de um cartão:
                `borda.marca` (4) é a faixa que classifica um cartão, e usá-la
                aqui amarraria o desenho do obturador à régua de contorno do
                produto, que muda por outra razão. Mesma família de exceção que
                `visor`, na linha de cima: o que está desenhado aqui é uma
                câmera, e não uma superfície deste aplicativo.
              */
              /* design-system: excecao */
              borderWidth: 5, borderColor: tema.destaque,
            }}
          >
            <View />
          </Tocavel>
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
  /*
    O "! " que abria o rótulo era um caractere tipográfico fazendo trabalho de
    ícone, e ele era o mesmo "!" que o aviso de alerta usa: dois sinais iguais
    para duas coisas diferentes na mesma tela. Agora o prazo estourado leva o
    desenho do relógio vencido, que tem forma própria, e a PALAVRA "vencido"
    continua no texto, porque o ícone é a segunda pista e nunca a única.
  */
  const rotuloDoPrazo = ocorrencia.prazo_em
    ? "Prazo "
      + prazo.texto.charAt(0).toLowerCase() + prazo.texto.slice(1)
      + ` (${dataDoPrazo(ocorrencia.prazo_em)})`
    : prazo.texto;
  const coresDoPrazo = prazo.vencido
    ? { fundo: tema.perigoFundo, cor: tema.perigoTexto }
    : prazo.atrasado
      ? { fundo: tema.alertaFundo, cor: tema.alertaTexto }
      : { fundo: tema.superficie2, cor: tema.textoDiscreto };

  const temCoordenada = ocorrencia.latitude != null && ocorrencia.longitude != null;


  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      {/*
        A TARJA DE ERRO SAI DE DENTRO DA ROLAGEM.

        Ela é o destino de seis falhas diferentes (permissão de localização,
        GPS, câmera, aplicativo de mapas, nova vistoria e conclusão) e morava
        no topo do conteúdo rolável. O formulário passa de dois mil pontos: um
        erro de GPS disparado no cartão da localização era desenhado onde
        ninguém estava olhando, e para o agente o toque simplesmente não fazia
        nada. Ele tocava de novo, e de novo.

        Fora da rolagem, ela fica presa no alto da TELA, e por isso aparece
        onde quer que o dedo esteja. Em fluxo e não sobreposta, de propósito: o
        conteúdo desce em vez de ser coberto, e nenhum campo some atrás dela.

        Com botão de fechar, porque tarja que não sai é tarja que o agente
        aprende a ignorar, e a próxima que importar ele também ignora.
      */}
      {erro && (
        <View
          testID="tarja-de-erro"
          accessibilityLiveRegion="assertive"
          style={{
            ...elevacao(tema).flutuante,
            borderWidth: 0,
            borderBottomWidth: borda.fio,
            borderBottomColor: tema.borda,
            padding: espaco.e3,
          }}
        >
          <Aviso
            tom="perigo"
            titulo="Não deu certo"
            acao={{
              titulo: "Fechar",
              onPress: () => { setErro(null); },
              descricao: "Fechar este aviso de erro",
              testID: "fechar-erro",
            }}
          >
            {erro}
          </Aviso>
        </View>
      )}

    <ScrollView
      ref={rolagem}
      testID="formulario-da-vistoria"
      /*
        Desligado enquanto o dedo desenha a assinatura. Os callbacks de
        captura do PanResponder ja ganham a disputa pelo gesto; isto remove a
        disputa. So vira duas vezes por traco, no inicio e no fim.
      */
      scrollEnabled={!desenhando}
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: espaco.e8 }}
    >
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
          {/*
            A pílula é desenhada aqui, e não com `Selo`, por duas razões que se
            somam. `Selo` recebe texto e não aceita desenho, e ele usa `legenda`
            de 12 pontos, dois abaixo do `fonteMinima` que o próprio
            `tokens.ts` declara: o prazo é justamente o que se lê de relance, em
            pé, com chuva na tela.
          */}
          <View
            style={{
              backgroundColor: coresDoPrazo.fundo,
              borderRadius: raio.pilula,
              paddingHorizontal: espaco.e3,
              paddingVertical: espaco.e1,
              flexDirection: "row",
              alignItems: "center",
              gap: espaco.e2,
            }}
          >
            {prazo.atrasado && (
              <IconePrazoVencido cor={coresDoPrazo.cor} tamanho={icone.inline} />
            )}
            <Txt variante="corpoP" peso={peso.negrito} cor={coresDoPrazo.cor}>
              {rotuloDoPrazo}
            </Txt>
          </View>
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
            <Tocavel
              accessibilityRole="button"
              onPress={() => void abrirRota()}
              accessibilityLabel={`Abrir a rota até ${ocorrencia.endereco} no aplicativo de mapas`}
              estilo={{
                flex: 1,
                minHeight: toque,
                paddingHorizontal: espaco.e3,
                borderRadius: raio.normal,
                borderWidth: borda.fio,
                borderColor: tema.borda,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: espaco.e2,
              }}
            >
              {/*
                O alfinete era desenhado à mão neste arquivo, com o mesmo
                traçado que `ui/icones.tsx` já tinha. Dois desenhos iguais em
                dois lugares é como o produto inteiro acabou com três ícones:
                quem precisa de um não acha o que existe e desenha o seu.
              */}
              <IconeLocalizacao cor={tema.texto} tamanho={icone.rotulo} />
              <Txt variante="corpo" negrito>Abrir no mapa</Txt>
            </Tocavel>
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

      {/*
        O PROGRESSO, que era um indicador só e cobria menos da metade do que a
        conclusão exige.

        A tela inteira tinha UM contador, em legenda cinza de 12 pontos, dizendo
        quantos itens obrigatórios do checklist estavam respondidos. Fotografia,
        órgão, nome de quem assina e traço da assinatura não tinham contador
        nenhum: o agente só descobria que faltavam quando chegava ao fim da
        rolagem e o botão estava travado.

        E a lista do que falta mora AQUI, no alto, e não lá embaixo. Ela era uma
        frase corrida de até cinco cláusulas separadas por vírgula, no fim de um
        formulário de dois mil pontos: o agente lia "falta responder 2 itens
        obrigatórios do checklist, tirar ao menos uma fotografia, coletar e
        confirmar a assinatura" e subia a tela procurando onde. Agora cada
        pendência é uma linha com caminho: um toque leva ao cartão que a
        resolve.
      */}
      <View
        onLayout={(e) => { alturaDaSecao.current.progresso = e.nativeEvent.layout.y; }}
        testID="ancora-progresso"
      >
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
            <Txt variante="h3">Progresso da vistoria</Txt>
            <View style={{ flex: 1 }} />
            <Txt variante="corpoP" mono negrito>{feitos}/{requisitos.length}</Txt>
          </View>

          {/*
            A barra é a SEGUNDA pista, nunca a única: a contagem em número
            tabular está ao lado e o rótulo de acessibilidade diz a mesma coisa
            em palavra, porque desenho de barra não chega a quem ouve a tela.
          */}
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${feitos} de ${requisitos.length} requisitos concluídos`}
            accessibilityValue={{ min: 0, max: requisitos.length, now: feitos }}
            testID="barra-de-progresso"
            style={{
              height: espaco.e2,
              borderRadius: raio.pilula,
              backgroundColor: tema.superficie2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round((feitos / requisitos.length) * 100)}%`,
                height: espaco.e2,
                borderRadius: raio.pilula,
                backgroundColor: podeConcluir ? tema.okTexto : tema.destaque,
              }}
            />
          </View>

          {podeConcluir ? (
            <Aviso
              tom="sucesso"
              titulo="Tudo pronto"
              /*
                O rótulo é DIFERENTE do botão que está no fim da rolagem, e de
                propósito. Os dois levam ao mesmo lugar, mas dois textos iguais
                na mesma tela obrigam quem lê (e quem ouve) a descobrir se são
                a mesma coisa, e foi assim que esta tela já colou a mesma frase
                em dois lugares e pareceu repetição ao dono do aparelho.
              */
              acao={{
                titulo: "Revisar o laudo agora",
                onPress: () => { setMinutaAberta(true); },
                testID: "concluir-pelo-progresso",
              }}
            >
              Nada mais é exigido para concluir. O próximo passo é a minuta do
              laudo, para ler com quem está no local.
            </Aviso>
          ) : (
            <View style={{ gap: espaco.e2 }} testID="lista-do-que-falta">
              <Txt variante="corpoP" peso={peso.forte}>
                {faltas.length === 1 ? "Falta 1 item:" : `Faltam ${faltas.length} itens:`}
              </Txt>
              {faltas.map((falta) => {
                const secao = secaoDaFalta(falta);
                return (
                  <Tocavel
                    accessibilityRole="button"
                    key={falta}
                    onPress={() => { if (secao) irPara(secao); }}
                    /*
                      A linha SEM caminho não responde ao dedo, e é assim que
                      ela diz que não leva a lugar nenhum. `Tocavel` já trata
                      desabilitado como imóvel: a seta some e o toque também.
                    */
                    desabilitado={!secao}
                    accessibilityLabel={`Falta ${falta}. Toque para ir até onde isso se resolve.`}
                    testID={`falta-${secao ?? "sem-caminho"}`}
                    estilo={{
                      minHeight: toque,
                      paddingHorizontal: espaco.e3,
                      borderRadius: raio.normal,
                      borderWidth: borda.fio,
                      borderColor: tema.borda,
                      backgroundColor: tema.superficie2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: espaco.e3,
                    }}
                  >
                    <IconeAlerta cor={tema.alertaTexto} tamanho={icone.rotulo} />
                    <View style={{ flex: 1 }}>
                      <Txt variante="corpoP">{falta}</Txt>
                    </View>
                    {/*
                      A seta diz que a linha LEVA a algum lugar, e some quando
                      não leva: uma linha que parece tocável e não é ensina o
                      agente a desconfiar das que são.
                    */}
                    {secao && <Txt variante="corpoP" peso={peso.negrito} discreto>›</Txt>}
                  </Tocavel>
                );
              })}
            </View>
          )}
        </Cartao>
      </View>

      <View
        onLayout={(e) => { alturaDaSecao.current.checklist = e.nativeEvent.layout.y; }}
        testID="ancora-checklist"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "checklist" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeChecklist cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Checklist técnico"
        />
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
                    <Tocavel
                      key={opcao.rotulo}
                      onPress={() => {
                        /*
                          Responder "não" depois de ter indicado órgãos apaga a
                          indicação, e apagar em silêncio o nome que alguém
                          digitou à mão é perder trabalho por um toque errado
                          numa tela pequena. A lista precisa mesmo sair: coleta
                          que diz "não é necessário acionar ninguém" e lista três
                          órgãos é contradição que o servidor recusa.
                        */
                        if (
                          item.chave === CHAVE_ACIONAR_ORGAO
                          && opcao.valor === false
                          && rascunho.orgaosParaAcionar.length > 0
                        ) {
                          setPerguntandoDescartarOrgaos(true);
                          return;
                        }
                        void alterar({
                          checklist: { ...rascunho.checklist, [item.chave]: opcao.valor },
                        });
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: marcada }}
                      accessibilityLabel={`${item.rotulo}: ${opcao.rotulo}`}
                      /*
                        Aqui o retorno do dedo não é enfeite: a gravação da
                        resposta passa pelo rascunho em disco, então entre o
                        toque e o fundo mudar de cor existe uma ida ao SQLite.
                        Sem nada acontecendo no meio, o agente de luva toca de
                        novo, e o segundo toque cai no "Não" que ele não quis.
                      */
                      estilo={{
                        flex: 1,
                        minHeight: toque,
                        flexDirection: "row",
                        gap: espaco.e2,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: raio.normal,
                        borderWidth: marcada ? 0 : borda.fio,
                        borderColor: tema.borda,
                        backgroundColor: marcada ? tema.destaque : "transparent",
                      }}
                    >
                      {/*
                        O visto era o caractere "✓" colado na frente do rótulo,
                        dentro da mesma string. Caractere tipográfico fazendo
                        trabalho de ícone é o que fez o aplicativo inteiro
                        parecer "só texto", e ele herda o peso e a altura da
                        fonte em vez do traço do conjunto.
                      */}
                      {marcada && (
                        <IconeSucesso cor={tema.sobreDestaque} tamanho={icone.inline} />
                      )}
                      <Txt
                        variante="corpo"
                        negrito={marcada}
                        cor={marcada ? tema.sobreDestaque : tema.texto}
                      >
                        {opcao.rotulo}
                      </Txt>
                    </Tocavel>
                  );
                })}
              </View>

              {/*
                O desdobramento nasce COLADO no item que o produziu, e não numa
                seção separada do formulário.

                Longe dali, ele seria mais um cartão no meio de um rolamento
                longo, e o agente que respondeu "sim" desceria a tela sem ver a
                pergunta que a resposta dele abriu. A conclusão travaria depois,
                lá embaixo, dizendo que falta uma coisa que está trezentos pixels
                acima.
              */}
              {item.chave === CHAVE_ACIONAR_ORGAO && resposta === true && (
                <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                  <IconeOrgao cor={tema.textoDiscreto} tamanho={icone.rotulo} />
                  <Txt variante="corpoP" peso={peso.forte}>Órgãos a acionar</Txt>
                </View>
                <OrgaosParaAcionar
                  catalogo={catalogoDeOrgaos}
                  escolhidos={rascunho.orgaosParaAcionar}
                  aoMudar={(lista) => void alterar({ orgaosParaAcionar: lista })}
                />
                </>
              )}
              <Separador />
            </View>
          );
        })}
      </Cartao>
      </View>

      <Dialogo
        aberto={perguntandoDescartarOrgaos}
        titulo="Apagar os órgãos indicados?"
        texto={
          `Você indicou ${rascunho.orgaosParaAcionar.length === 1
            ? "um órgão"
            : `${rascunho.orgaosParaAcionar.length} órgãos`} para acionar. `
          + "Responder que não é necessário acionar outro órgão apaga essa lista."
        }
        acao={{
          rotulo: "Responder não e apagar a lista",
          destrutiva: true,
          aoTocar: () => void alterar({
            checklist: { ...rascunho.checklist, [CHAVE_ACIONAR_ORGAO]: false },
            orgaosParaAcionar: [],
          }),
        }}
        recusa={{ rotulo: "Manter os órgãos que indiquei" }}
        aoFechar={() => { setPerguntandoDescartarOrgaos(false); }}
      />

      <View
        onLayout={(e) => { alturaDaSecao.current.fotos = e.nativeEvent.layout.y; }}
        testID="ancora-fotos"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "fotos" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeFoto cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto={`Fotografias (${rascunho.fotos.length})`}
        />

        {/*
          O RETORNO DO OBTURADOR, em palavra.

          A animação da miniatura abaixo é para quem olha; esta linha é para
          quem ouve a tela, para quem desligou movimento no sistema e para quem
          está com o aparelho longe do rosto. Região viva, porque ela aparece
          sem ninguém ter mudado de tela.
        */}
        {fotoRecemGuardada && (
          <View
            accessibilityLiveRegion="polite"
            testID="foto-guardada"
            style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}
          >
            <IconeSucesso cor={tema.okTexto} tamanho={icone.rotulo} />
            <Txt variante="corpoP" peso={peso.forte} cor={tema.okTexto}>
              Fotografia {rascunho.fotos.length} guardada neste aparelho
            </Txt>
          </View>
        )}

        {rascunho.fotos.length === 0 ? (
          <Txt variante="corpoP" discreto>
            Pelo menos uma fotografia é obrigatória. É ela que o coordenador
            olha antes de decidir o despacho.
          </Txt>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e2 }}>
            {rascunho.fotos.map((f) => {
              const recemGuardada = f.idempotencyKey === fotoRecemGuardada;
              return (
              <View key={f.idempotencyKey} style={{ gap: espaco.e1 }}>
                {/*
                  A miniatura da foto recém guardada ENTRA na tela em vez de
                  simplesmente estar lá. É o único sinal visual de que o
                  obturador pegou, e ele acontece depois de a câmera fechar,
                  que é onde o olho do agente está.
                */}
                <Animated.View
                  style={{
                    opacity: recemGuardada ? entradaDaFoto : 1,
                    transform: [{ scale: recemGuardada ? escalaDaFotoNova : 1 }],
                  }}
                >
                  <Image
                    source={{ uri: f.uriLocal }}
                    style={{
                      width: MINIATURA, height: MINIATURA, borderRadius: raio.normal,
                    }}
                    accessibilityLabel={`Fotografia ${f.ordem + 1} da vistoria`}
                  />
                </Animated.View>
                <Tocavel
                  accessibilityRole="button"
                  /*
                    Apagar passa a PERGUNTAR. Era imediato e irreversível,
                    enquanto descartar item da fila de envio, que é menos grave,
                    já perguntava: o mesmo aplicativo tratava a prova de uma
                    interdição com menos cuidado do que um item que pode ser
                    reenviado.
                  */
                  onPress={() => { setFotoParaApagar(f); }}
                  accessibilityLabel={`Apagar a fotografia ${f.ordem + 1}`}
                  testID={`apagar-foto-${f.ordem + 1}`}
                  /*
                    `toque`, e não 32. Estava escrito 32 à mão, vinte pontos
                    abaixo da régua que o próprio `tokens.ts` declara, e nada
                    reclamava porque o aplicativo não tinha portão nenhum. O
                    alvo pequeno aqui é o pior lugar possível: errar este botão
                    apaga uma fotografia de vistoria, que é prova de uma
                    interdição e não se refaz sem subir o morro de novo.
                  */
                  estilo={{ minHeight: toque, alignItems: "center", justifyContent: "center" }}
                >
                  <Txt variante="corpoP" cor={tema.perigoTexto}>Apagar</Txt>
                </Tocavel>
              </View>
              );
            })}
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
      </View>

      {/*
        A pergunta antes de apagar. `Dialogo` e não `Alert.alert`: o alerta
        nativo ignora o tema, ignora a régua de tipografia do produto e usa a
        área de toque do sistema, e não os 52 pontos que este aplicativo exige.

        O texto nomeia QUAL fotografia, porque "apagar esta foto?" num cartão
        com cinco miniaturas não responde a única pergunta que importa.
      */}
      <Dialogo
        aberto={fotoParaApagar !== null}
        titulo="Apagar esta fotografia?"
        texto={
          `A fotografia ${(fotoParaApagar?.ordem ?? 0) + 1} sai da vistoria e o `
          + "arquivo é descartado deste aparelho. Refazer significa voltar ao "
          + "local: não há como recuperar depois."
        }
        acao={{
          rotulo: "Apagar a fotografia",
          destrutiva: true,
          aoTocar: () => {
            const alvo = fotoParaApagar;
            if (!alvo) return;
            void alterar({
              fotos: rascunho.fotos
                .filter((o) => o.idempotencyKey !== alvo.idempotencyKey)
                .map((o, i) => ({ ...o, ordem: i })),
            });
          },
        }}
        recusa={{ rotulo: "Manter a fotografia" }}
        aoFechar={() => { setFotoParaApagar(null); }}
        testID="dialogo-apagar-foto"
      />

      <Cartao>
        <TituloDoCartao
          desenho={<IconeGps cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Localização"
        />
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

      <View
        onLayout={(e) => { alturaDaSecao.current.assinatura = e.nativeEvent.layout.y; }}
        testID="ancora-assinatura"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "assinatura" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeAssinatura cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Quem estava no local"
        />
        {/*
          O estilo deste campo estava copiado verbatim aqui e em `entrar.tsx`,
          oito propriedades iguais em dois arquivos, e a borda em repouso era a
          MESMA borda do campo em foco: num formulário de nove campos rolado
          dois mil pontos, o agente não tinha como saber onde o teclado ia
          escrever. `Campo` resolve os dois de uma vez.
        */}
        <CampoDeTexto
          rotulo="Nome de quem acompanhou e assina"
          ajuda="É este nome que sai acima da linha de assinatura no laudo."
          valor={rascunho.assinanteNome}
          aoMudar={(t) => void alterar({ assinanteNome: t })}
          placeholder="Nome completo"
          capitalizacao="words"
          testID="nome-de-quem-assina"
        />

        <Assinatura
          jaAssinada={Boolean(rascunho.assinaturaUri)}
          aoConfirmar={(uri) => {
            /*
              O morador acabou de tirar o dedo da tela e o traço foi aceito.
              Quem está olhando para o aparelho é ELE; quem precisa saber que
              deu certo é o agente, que está segurando o aparelho e olhando
              para a pessoa.
            */
            retornoTatil("confirmado");
            void alterar({ assinaturaUri: uri });
          }}
          aoLimpar={() => void alterar({ assinaturaUri: null })}
          aoComecarDesenho={() => setDesenhando(true)}
          aoTerminarDesenho={() => setDesenhando(false)}
        />
      </Cartao>
      </View>

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
          /*
            Aqui é `Campo` com o controle por função, e não `CampoDeTexto`,
            porque este campo precisa de `maxLength`, que a peça curta não
            aceita de fora de propósito: aceitar tudo seria reabrir a porta da
            cópia de estilo que ela existe para fechar.
          */
          <Campo
            key={c.chave}
            rotulo={c.rotulo}
            ajuda={c.ajuda}
            opcional
            testID={`pessoas-${c.chave}`}
          >
            {(ligacoes) => (
              <TextInput
                {...ligacoes}
                value={rascunho.pessoas[c.chave] ?? ""}
                onChangeText={(t) => void alterar({
                  // Só dígito entra. Teclado numérico de Android ainda oferece
                  // vírgula, ponto e sinal, e "2,5 feridos" não existe.
                  pessoas: { ...rascunho.pessoas, [c.chave]: t.replace(/[^0-9]/g, "") },
                })}
                keyboardType="number-pad"
                placeholder="não contado"
                maxLength={5}
              />
            )}
          </Campo>
        ))}
      </Cartao>

      <Cartao titulo="Observações do agente">
        <CampoDeTexto
          rotulo="Observações do agente"
          opcional
          ajuda="O que o checklist não cobre e o laudo precisa registrar."
          multilinhas
          valor={rascunho.observacoes}
          aoMudar={(t) => void alterar({ observacoes: t })}
          placeholder="O que o checklist não cobre e o laudo precisa registrar"
          testID="observacoes-do-agente"
        />
      </Cartao>

      {/*
        A tarja do fim da rolagem deixa de LISTAR e passa a APONTAR.

        Ela era a frase corrida de até cinco cláusulas coladas com vírgula, e
        morava justamente no pior lugar para uma lista: o fim de um formulário
        de dois mil pontos. A lista inteira, com o caminho de cada item, está no
        cartão de progresso, no alto. Aqui fica só o FATO (o botão está travado,
        e por quantos itens) mais um toque que leva até ela.

        O texto não repete a lista, e isso é deliberado: a mesma frase em dois
        lugares da mesma tela foi exatamente o que o dono do aparelho leu como
        repetição, na lista de tarefas.
      */}
      {!podeConcluir && (
        <Aviso
          tom="alerta"
          titulo={faltas.length === 1
            ? "Falta 1 item para concluir"
            : `Faltam ${faltas.length} itens para concluir`}
          acao={{
            titulo: "Ver o que falta",
            onPress: () => { irPara("progresso"); },
            descricao: "Ir para a lista do que falta, no alto desta tela",
            testID: "ver-o-que-falta",
          }}
        >
          A lista, com o caminho para cada item, está no alto desta tela.
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
    </View>
  );
}
