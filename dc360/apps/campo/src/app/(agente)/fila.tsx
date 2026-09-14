import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from "react";
import { Animated, Easing, ScrollView, View } from "react-native";
import {
  autoriaDaColeta,
  type Autoria,
  type FilaDeSincronizacao,
  type ItemDeDevolucao,
  type ItemFila,
} from "@dc360/campo";
import { ROTULO_MOTIVO_DE_DEVOLUCAO } from "@dc360/shared";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Separador, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAguardando, IconeAlerta, IconeArquivado, IconeDevolucao, IconeEnvio,
  IconeEquipe, IconeInformacao, IconePerigo, IconeSucesso,
  type ComponenteDeIcone,
} from "../../ui/icones";
import {
  borda, easing, espaco, icone as tamanhoDeIcone, movimento, peso, raio,
} from "../../ui/tokens";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";
import { ESCALA_NA_BORDA, ItemDeLista } from "../../ui/ItemDeLista";
import { retornoTatil } from "../../ui/retornoTatil";

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
 *
 * ## O que mudou nesta passagem, e por quê
 *
 * O TEXTO CONTINUA O MESMO, a FORMA dele é que mudou. Metade deste arquivo era
 * copywriting bom escrito no formato errado: dezesseis parágrafos corridos,
 * cada um entregue a um único `Txt` cinza dentro do cartão. O pior deles tinha
 * quarenta e cinco palavras, e as últimas vinte eram instrução operacional
 * ("peça para fulano entrar neste aparelho", "avise a coordenação") enterrada
 * no fim de um parágrafo em cor discreta. Instrução que se lê em pé, na rua,
 * não pode estar no fim de um parágrafo.
 *
 * Então cada estado passou a responder três perguntas separadas, e cada uma
 * tem um lugar próprio no cartão:
 *
 * - **quem**, quando o fato tem dono (a coleta é de outra pessoa);
 * - **por quê**, uma frase, que é o estado explicado;
 * - **o que fazer**, em passos, e só quando existe algo a fazer.
 *
 * Nenhuma palavra foi jogada fora: as frases que estavam grudadas foram
 * separadas nos pontos finais que elas já tinham.
 */

/**
 * Uma lista só decide a palavra, o símbolo, o desenho e o tom de cada estado.
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
 * O ícone entrou AO LADO do símbolo, e não no lugar dele: o `Chip` continua
 * carregando o segundo canal dele (símbolo mais palavra), e o desenho é o
 * terceiro, na margem esquerda do cartão, onde o olho varre a lista de cima a
 * baixo sem ler.
 */
/**
 * Depois de quantas tentativas a frase muda de "vai tentar de novo" para "a
 * conexão daqui não está dando conta".
 *
 * Oito era o antigo teto que BLOQUEAVA a coleta, e ele mentia: cerca de cinco
 * minutos de sinal ruim pintavam o cartão de vermelho com "repetir o envio não
 * resolve sozinho" ao lado de um botão "Descartar", sobre uma vistoria que
 * subiria sozinha na janela de sinal seguinte. O número continua sendo oito,
 * mas agora ele só troca a frase: a coleta continua tentando, e a frase manda a
 * pessoa procurar sinal, que é a única coisa que resolve.
 */
const TENTATIVAS_ATE_AVISAR = 8;

/**
 * Quanto tempo a confirmação de um toque fica na tela.
 *
 * Oito segundos, e não um valor de `movimento`: isto não é animação, é quanto
 * tempo uma frase fica legível para quem está lendo em pé e distraído. Curto
 * demais e o agente perde a única prova de que o toque pegou; longo demais e a
 * confirmação de um minuto atrás vira ruído em cima de um estado que já mudou.
 */
const RETORNO_NA_TELA_MS = 8_000;


/**
 * O que a tela sabe dizer sobre um item, separado em campos.
 *
 * Era uma string só, chamada `explicacao`, e é por isso que o texto virava
 * parágrafo: um campo só não tem onde guardar hierarquia. Com quatro campos, a
 * mesma frase de antes se distribui, e o cartão ganha forma sem ninguém
 * reescrever nada.
 */
type EstadoDoItem = {
  /** A palavra do selo. */
  rotulo: string;
  /** O segundo canal do selo, além da cor. Obrigatório no `Chip`. */
  simbolo: string;
  tom: TomDoChip;
  /** O desenho, na margem do cartão, para a lista ser varrida sem leitura. */
  Icone: ComponenteDeIcone;
  /** Quem, quando o fato tem dono. Vazio quando o item é de quem está logado. */
  quem?: string;
  /** Por que o item está assim. Uma frase, e não um parágrafo. */
  porque: string;
  /** O que dá para fazer, em passos. Ausente quando não há nada a fazer. */
  oQueFazer?: readonly string[];
};

/**
 * O cartão de uma devolução, estado por estado.
 *
 * Separado de `descreverEstado` para caber a explicação de cada desfecho sem
 * transformar aquele `switch` num labirinto de ternários, que foi exatamente
 * como o estado "arquivado" nasceu sem desenho próprio.
 */
function descreverDevolucao(item: ItemDeDevolucao): EstadoDoItem {
  const motivo = ROTULO_MOTIVO_DE_DEVOLUCAO[item.devolucao.motivo];
  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Devolução aguardando",
        simbolo: "…",
        tom: "neutro",
        Icone: IconeAguardando,
        porque: item.tentativas === 0
          ? `Motivo: ${motivo}. Ainda não saiu do aparelho, e vai sair assim que `
            + "houver sinal. A tarefa já saiu da sua lista."
          : `Motivo: ${motivo}. Já tentou ${item.tentativas}x e vai continuar `
            + "tentando sozinha. Enquanto ela não chegar, a coordenação não sabe "
            + "que esta tarefa voltou.",
      };
    case "enviando":
      return {
        rotulo: "Devolução saindo", simbolo: "↑", tom: "neutro", Icone: IconeEnvio,
        porque: `Motivo: ${motivo}. Saindo do aparelho agora.`,
      };
    case "confirmado":
      return {
        rotulo: "Devolvida",
        simbolo: "✓",
        tom: "ok",
        Icone: IconeSucesso,
        porque:
          "A coordenação recebeu e a ocorrência voltou para quem despacha. Some "
          + "desta lista em instantes.",
      };
    /*
      Recusada, e a tarefa JÁ VOLTOU para a lista de tarefas. Dizer isso aqui não
      é redundância: sem a frase, o agente lê "precisa de atenção" e não sabe se
      a tarefa continua com ele ou não, que é a única coisa que ele precisa
      decidir agora. E ela é PASSO, e não explicação: é o que ele faz a seguir.
    */
    case "bloqueado":
    case "arquivado":
      return {
        rotulo: "Devolução recusada",
        simbolo: "!",
        tom: "perigo",
        Icone: IconePerigo,
        porque: item.ultimaFalha?.mensagem
          ?? "O servidor recusou a devolução por um motivo que repetir não resolve.",
        oQueFazer: [
          "A tarefa voltou para a sua lista: ou você a vistoria, ou tenta devolver "
          + "de novo por aqui.",
        ],
      };
  }
}

/** O primeiro nome, que é como o colega é chamado no plantão. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function descreverEstado(item: ItemFila, autoria: Autoria): EstadoDoItem {
  /*
    A AUTORIA VEM ANTES DO ESTADO, e a ordem é o conteúdo.

    Um item de outro agente fica em `pendente` no disco, e "Aguardando" prometia
    que ele sai assim que houver sinal. Não sai: o dreno não toca em coleta que
    não é de quem está logado, porque o servidor tira o autor da vistoria de
    quem apresentou o token. Mostrar a promessa da espera aqui seria a mesma
    mentira de sempre, só que na tela em vez de no laudo.

    Este é o cartão que tinha quarenta e cinco palavras num parágrafo só, e é o
    que mais ganha com a separação: o nome de quem coletou é a primeira coisa
    que o agente precisa ler, e estava na quinta linha.
  */
  if (autoria === "de_outro" && item.autor) {
    return {
      rotulo: "De outro agente",
      simbolo: "⏸",
      tom: "alerta",
      Icone: IconeEquipe,
      /*
        A devolução também é uma declaração assinada: quem devolveu responde
        pelo ato na trilha, que é append-only. Enviá-la com a credencial de
        quem está no aparelho agora atribuiria a decisão à pessoa errada, do
        mesmo jeito que o laudo com autor trocado.
      */
      quem: item.tipo === "devolucao"
        ? `Devolvida por ${item.autor.nome}`
        : `Coletada por ${item.autor.nome}`,
      porque: item.tipo === "devolucao"
        ? "Ela só pode ser enviada pela conta de quem decidiu devolver, porque é "
          + "esse nome que vai para a coordenação."
        : "Ela só pode ser enviada pela conta de quem fez a vistoria, porque é "
          + "esse nome que vai para o laudo.",
      oQueFazer: [
        `Peça para ${primeiroNome(item.autor.nome)} entrar neste aparelho com sinal.`,
        "Se isso não for possível, avise a coordenação e informe o protocolo acima.",
      ],
    };
  }

  /*
    A DEVOLUÇÃO TEM AS PALAVRAS DELA, e não as da coleta.

    "Aguardando", no cartão de uma devolução, seria lido como vistoria esperando
    envio, e é o contrário: aqui o agente está dizendo que NÃO vistoriou. Um
    rótulo que descreve outro ato é uma frase falsa numa tela que existe para
    dissolver a dúvida "cadê o que eu fiz?".
  */
  if (item.tipo === "devolucao") return descreverDevolucao(item);
  if (autoria === "sem_autor") {
    return {
      rotulo: "Sem autor registrado",
      simbolo: "?",
      tom: "alerta",
      Icone: IconeAlerta,
      porque:
        "Esta coleta ficou guardada por uma versão anterior do aplicativo, que não "
        + "registrava quem tinha feito a vistoria.",
      oQueFazer: [
        "Se ela é sua, toque em \"Esta coleta é minha\" para enviá-la com o seu "
        + "nome no laudo.",
        "Se não for sua, avise a coordenação antes de descartar.",
      ],
    };
  }

  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Aguardando",
        simbolo: "…",
        tom: "neutro",
        Icone: IconeAguardando,
        porque: item.tentativas === 0
          ? "Ainda não saiu do aparelho. Vai sair assim que houver sinal."
          : item.tentativas < TENTATIVAS_ATE_AVISAR
            ? `Já tentou ${item.tentativas}x. Vai tentar de novo em instantes.`
            /*
              Muitas tentativas não viram acusação nem convite ao descarte: a
              coleta continua tentando sozinha, e o que falta é sinal. A frase
              diz isso, e a única ação que resolve saiu do fim do parágrafo e
              virou passo.
            */
            : `Já tentou ${item.tentativas}x e vai continuar tentando sozinha. A `
              + "conexão daqui não está completando o envio.",
        oQueFazer: item.tentativas >= TENTATIVAS_ATE_AVISAR
          ? ["Procure um lugar com sinal melhor ou uma rede Wi-Fi que funcione."]
          : undefined,
      };
    case "enviando":
      return {
        rotulo: "Enviando", simbolo: "↑", tom: "neutro", Icone: IconeEnvio,
        porque: "Saindo do aparelho agora.",
      };
    case "confirmado":
      return {
        rotulo: "Enviada",
        simbolo: "✓",
        tom: "ok",
        Icone: IconeSucesso,
        porque: "A coordenação recebeu. Some desta lista em instantes.",
      };
    case "bloqueado":
      return {
        rotulo: "Precisa de atenção",
        simbolo: "!",
        tom: "perigo",
        Icone: IconePerigo,
        /*
          O 404 ganha frase própria, e não a do servidor.

          "Ocorrência não encontrada" não diz nada a quem está na rua, e o
          aplicativo não tem como saber o motivo: a API responde 404 (nunca 403)
          também para recurso de outro município, justamente para não confirmar
          que ele existe. Então a frase diz o que se sabe e o passo diz o que
          fazer, em vez de inventar um motivo como o "Arquivada" fazia.
        */
        porque: item.ultimaFalha?.codigo === "nao_encontrada"
          ? "O servidor não encontrou esta ocorrência para a sua conta."
          : item.ultimaFalha?.mensagem
            ?? "O servidor recusou por um motivo que repetir não resolve.",
        oQueFazer: item.ultimaFalha?.codigo === "nao_encontrada"
          ? [
            "Fale com a coordenação e informe o protocolo acima antes de "
            + "descartar: a coleta continua guardada aqui.",
          ]
          : undefined,
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
          Símbolo, desenho e tom próprios, e não os de "Aguardando". Arquivada
          não é uma espera mais longa: é uma coleta que perdeu o destino e nunca
          vai chegar. Repetir o desenho da espera aqui seria prometer ao agente
          uma entrega que não vem.
        */
        simbolo: "✕",
        tom: "alerta",
        Icone: IconeArquivado,
        porque: item.ultimaFalha?.mensagem
          ?? "A ocorrência foi encerrada no painel enquanto esta coleta esperava sinal. "
             + "Ela fica guardada aqui como registro do que foi feito.",
      };
  }
}

/**
 * O bloco "o que fazer", que é a metade operacional do texto.
 *
 * Ele tem fundo próprio de propósito: o que o agente precisa FAZER não pode
 * ter o mesmo peso visual da explicação de por que aquilo aconteceu. Antes os
 * dois eram o mesmo parágrafo cinza, e a instrução ficava no fim dele.
 *
 * Numeração só quando há mais de um passo. Um "1." sozinho é ruído, e dois
 * passos sem número viram um parágrafo de novo, que é justamente o que se está
 * desfazendo aqui.
 */
function OQueFazer({ passos }: { passos: readonly string[] }) {
  const tema = useTema();
  return (
    <View
      style={{
        backgroundColor: tema.superficie2,
        borderRadius: raio.normal,
        padding: espaco.e3,
        gap: espaco.e2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
        {/* O desenho é a segunda pista da palavra ao lado, nunca o lugar dela.
            Escondido do leitor de tela porque "O que fazer" já está escrito. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <IconeInformacao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
        </View>
        <Txt variante="corpoP" peso={peso.forte}>O que fazer</Txt>
      </View>
      {passos.map((passo, i) => (
        <View key={passo} style={{ flexDirection: "row", gap: espaco.e2 }}>
          {passos.length > 1 && (
            <Txt variante="corpoP" mono discreto>{`${i + 1}.`}</Txt>
          )}
          <View style={{ flex: 1 }}>
            <Txt variante="corpoP">{passo}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * O cabeçalho de uma seção, que deixou de ser um `h2` solto no meio do fluxo.
 *
 * As quatro seções desta tela são semanticamente MUITO diferentes (o que é meu
 * e vai sair, o que eu devolvi, o que é de outra pessoa, e o que já não tem
 * para onde ir) e se distinguiam só por um texto de vinte e um pontos. Três
 * coisas resolvem isso sem barulho: a régua acima, que declara onde uma seção
 * termina e a outra começa; o desenho, que dá identidade à seção antes da
 * leitura; e o contador em pílula, que tira o número de dentro da frase.
 *
 * O contador é lido junto com o título pelo leitor de tela, numa frase só: dois
 * elementos separados fariam o leitor anunciar "Arquivadas" e, depois, um "3"
 * solto sem dono.
 */
function Secao({ Icone, titulo, quantos, children }: {
  Icone: ComponenteDeIcone;
  titulo: string;
  quantos: number;
  children: ReactNode;
}) {
  const tema = useTema();
  return (
    <View style={{ gap: espaco.e3 }}>
      {/* A régua. Ela é o que faz duas seções vizinhas pararem de parecer uma
          lista só com um texto maior no meio. */}
      <View style={{ height: borda.fio, backgroundColor: tema.borda }} />
      <View
        /*
          `accessible` junta o desenho, o título e o contador num elemento só.
          Sem ele o leitor de tela percorre três paradas (um SVG mudo, o texto e
          um número solto) e o papel de cabeçalho não chega a lugar nenhum.
        */
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${titulo}, ${quantos === 1 ? "1 item" : `${quantos} itens`}`}
        style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icone cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.acao} />
        </View>
        <Txt variante="h3">{titulo}</Txt>
        <View style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: tema.superficie2,
            borderRadius: raio.pilula,
            paddingHorizontal: espaco.e3,
            paddingVertical: espaco.e1,
          }}
        >
          <Txt variante="corpoP" mono negrito discreto>{String(quantos)}</Txt>
        </View>
      </View>
      {children}
    </View>
  );
}

/*
  O CARTÃO QUE SAI MUDOU DE ENDEREÇO, e o porquê vale mais que a mudança.

  Ele nasceu aqui, e enquanto morou aqui foi a única lista do aplicativo com
  saída desenhada: a de tarefas continuou perdendo item no quadro seguinte, e
  lá o item que some acabou de ser DEVOLVIDO para a coordenação. Duas listas
  vizinhas com saídas diferentes (ou com uma saída e um corte seco) é o defeito
  que ninguém relata e todo mundo sente. Agora as duas chamam a mesma peça, em
  `ui/ItemDeLista.tsx`.
*/

/**
 * A chegada do estado vazio, que é o clímax desta tela.
 *
 * `movimento.climax` existe, nas palavras do próprio `tokens.ts`, "para um
 * momento só: a fila esvaziando". É este. O agente subiu o morro, coletou sem
 * sinal e desceu sem saber se o trabalho chegou; a lista zerando é a resposta,
 * e ela merece ser vista acontecendo em vez de aparecer pronta.
 */
function ChegadaDoVazio({ children }: { children: ReactNode }) {
  const reduzirMovimento = useReducaoDeMovimento();
  const entrada = useRef(new Animated.Value(reduzirMovimento ? 1 : 0)).current;

  useEffect(() => {
    if (reduzirMovimento) {
      entrada.setValue(1);
      return;
    }
    Animated.timing(entrada, {
      toValue: 1,
      duration: movimento.climax,
      easing: Easing.bezier(...easing.climax),
      useNativeDriver: true,
    }).start();
  }, [reduzirMovimento, entrada]);

  return (
    <Animated.View
      style={{
        opacity: entrada,
        transform: [{
          scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [ESCALA_NA_BORDA, 1] }),
        }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function TelaDaFila() {
  const sinal = useSinal();
  const { obterToken, lerIdentidade, identidade } = useSessao();
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();

  const [fila, setFila] = useState<FilaDeSincronizacao | null>(null);
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /*
    Os itens que JÁ saíram do disco e ainda estão desaparecendo da tela.

    Eles não entram em contagem nenhuma: para a tela, eles já foram. O que
    sobra deles é o desenho saindo, e por isso a lista visível é a união das
    duas, enquanto os números vêm só da primeira.
  */
  const [saindo, setSaindo] = useState<ItemFila[]>([]);
  /*
    Qual item está sendo perguntado, e não "o diálogo está aberto".

    Guardar o item inteiro em vez de uma bandeira é o que permite o diálogo
    dizer o protocolo, que é a única coisa que distingue uma coleta da outra
    nesta lista. Enquanto isto vale `null`, nada foi descartado: o descarte
    acontece só no toque do botão, e é isso que o teste desta tela cobra.
  */
  const [aDescartar, setADescartar] = useState<ItemFila | null>(null);
  /*
    O RETORNO DO TOQUE, por item.

    "Tentar de novo" e "Esta coleta é minha" executavam e recarregavam a lista
    sem marca nenhuma na tela. Quando o reenvio falha de novo (que é o caso
    comum: o que falta é sinal) nada muda, e quem tocou não tem como saber se o
    toque pegou. Aqui ficam as duas metades disso: o que está em curso, que
    apaga o botão e põe a roda nele, e o que acabou de acontecer, que vira uma
    frase dentro do cartão.
  */
  const [emCurso, setEmCurso] = useState<{ id: string; verbo: string } | null>(null);
  const [retorno, setRetorno] = useState<{ id: string; texto: string } | null>(null);
  /*
    O agente desistiu de esperar a fila abrir.

    `Carregando` sabe oferecer a saída aos seis segundos, e esta tela nunca
    passava `aoDesistir`, o que desligava metade do componente: a espera
    continuava pendurada e a tela não tinha para onde ir. A contagem existe
    para o efeito de abertura poder rodar de novo quando a pessoa pedir.
  */
  const [desistiu, setDesistiu] = useState(false);
  const [tentativaDeAbrir, setTentativaDeAbrir] = useState(0);

  /*
    A lista da leitura anterior, para saber o que SUMIU.

    Ela é `ref` e não estado porque ninguém desenha a partir dela: ela só serve
    para a comparação de uma leitura para a outra. Como estado, ela dispararia
    uma renderização a mais a cada evento da fila.
  */
  const listaAnterior = useRef<ItemFila[]>([]);
  const reduzirRef = useRef(reduzirMovimento);
  reduzirRef.current = reduzirMovimento;
  /* Os temporizadores vivos, para o desmonte não deixar nenhum escrevendo
     estado em componente que já saiu da tela. */
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  const agendar = useCallback((quando: number, oQue: () => void) => {
    const relogio = setTimeout(oQue, quando);
    relogios.current.push(relogio);
  }, []);

  useEffect(() => () => {
    for (const relogio of relogios.current) clearTimeout(relogio);
    relogios.current = [];
  }, []);

  /**
   * Relê a fila inteira do disco.
   *
   * `comemorarSeZerar` é falso só no descarte, e a distinção é de produto: a
   * fila zerar porque o servidor recebeu tudo é o momento que este aplicativo
   * inteiro existe para produzir, e a fila zerar porque o agente jogou o último
   * item fora é o oposto disso. Um retorno tátil igual nos dois casos
   * comemoraria um trabalho apagado.
   */
  const recarregar = useCallback(async (
    f: FilaDeSincronizacao,
    { comemorarSeZerar = true }: { comemorarSeZerar?: boolean } = {},
  ) => {
    const novos = await f.itens();
    const aindaExiste = new Set(novos.map((i) => i.id));
    const sumiram = listaAnterior.current.filter((i) => !aindaExiste.has(i.id));
    const tinhaAlgo = listaAnterior.current.length > 0;
    listaAnterior.current = novos;
    setItens(novos);

    /*
      A GUARDA DE ORIGEM, e ela é a mesma da `FaixaDeSincronizacao`: só
      comemora a TRANSIÇÃO. Abrir a aba com a fila já vazia não é a fila tendo
      esvaziado, e um aparelho que vibra toda vez que o agente entra aqui
      ensina depressa a ignorar a vibração, levando junto os outros três
      momentos em que ela informa alguma coisa.
    */
    if (comemorarSeZerar && tinhaAlgo && novos.length === 0) retornoTatil("concluido");

    /* Com redução de movimento ligada não há saída para animar: o item some na
       hora, que é exatamente o que quem ligou a opção pediu. */
    if (sumiram.length === 0 || reduzirRef.current) return;
    setSaindo((antes) => [...antes, ...sumiram]);
    const idsQueSaem = new Set(sumiram.map((i) => i.id));
    agendar(movimento.mudancaDeEstado, () => {
      setSaindo((antes) => antes.filter((i) => !idsQueSaem.has(i.id)));
    });
  }, [agendar]);

  useEffect(() => {
    let vivo = true;
    let desassinar: (() => void) | undefined;
    void (async () => {
      const f = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      if (!vivo) return;
      setFila(f);
      await recarregar(f);
      // A fila avisa a cada mudança de estado; a tela relê a lista inteira.
      // Reler tudo é barato aqui, e evita o estado da tela divergir do disco.
      desassinar = f.assinar(() => { void recarregar(f); });
    })();
    return () => { vivo = false; desassinar?.(); };
  }, [obterToken, lerIdentidade, recarregar, tentativaDeAbrir]);

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

  /**
   * Um verbo do cartão, com começo e fim visíveis.
   *
   * O começo é a roda dentro do próprio botão que foi tocado (e não uma roda no
   * topo da tela, que fica fora do campo de visão de quem acabou de tocar aqui
   * embaixo). O fim é uma frase dentro do cartão, que some sozinha. Sem os
   * dois, um reenvio que falha de novo é indistinguível de um toque que não
   * pegou.
   */
  async function agir(item: ItemFila, verbo: string, oQue: () => Promise<void>, texto: string) {
    setEmCurso({ id: item.id, verbo });
    setRetorno(null);
    try {
      await oQue();
      if (fila) await recarregar(fila);
      setRetorno({ id: item.id, texto });
      agendar(RETORNO_NA_TELA_MS, () => { setRetorno(null); });
    } finally {
      setEmCurso(null);
    }
  }

  if (!itens) {
    if (desistiu) {
      return (
        <View style={{ padding: espaco.e4 }}>
          <Vazio
            icone={<IconeAlerta cor={tema.destaque} tamanho={tamanhoDeIcone.vazio} />}
            titulo="A fila não abriu"
            descricao={
              "Nada se perdeu: o que estava guardado continua no aparelho e sai "
              + "sozinho quando a conexão voltar. Dá para tentar abrir de novo."
            }
            acao={{
              titulo: "Tentar abrir de novo",
              descricao: "Tentar abrir a fila de envio de novo",
              testID: "abrir-a-fila-de-novo",
              onPress: () => {
                setDesistiu(false);
                setTentativaDeAbrir((n) => n + 1);
              },
            }}
          />
        </View>
      );
    }
    return (
      <Carregando
        mensagem="Abrindo a fila"
        rotuloDaSaida="Parar de esperar"
        aoDesistir={() => { setDesistiu(true); }}
      />
    );
  }

  /*
    Quem está logado agora, no formato que o motor da fila compara.

    A comparação em si NÃO é feita aqui: ela mora em `autoriaDaColeta`, no
    pacote, e é a mesma linha que o dreno usa para decidir o que enviar. Duas
    listas para o mesmo fato divergem na primeira pressa, e a divergência aqui
    seria a tela prometer "sai assim que houver sinal" num item que o dreno
    nunca vai tocar.
  */
  const eu = identidade
    ? {
        usuarioId: identidade.usuarioId,
        nome: identidade.nome,
        organizacaoId: identidade.organizacaoId,
      }
    : null;

  /*
    O que a tela DESENHA inclui o que já saiu do disco e ainda está saindo da
    tela; o que a tela CONTA, não. Um item confirmado precisa sumir do número
    no mesmo instante em que a fila o largou, senão o contador mente por um
    quarto de segundo em cima da única tela que existe para não mentir.
  */
  /* O disco manda: um item que voltou para a lista antes de o temporizador
     disparar sai da despedida, senão ele apareceria duas vezes na mesma tela,
     com a mesma chave. */
  const idsNoDisco = new Set(itens.map((i) => i.id));
  const aindaSaindo = saindo.filter((i) => !idsNoDisco.has(i.id));
  const idsSaindo = new Set(aindaSaindo.map((i) => i.id));
  const visiveis = [...itens, ...aindaSaindo];
  const contar = (lista: ItemFila[]) => lista.filter((i) => !idsSaindo.has(i.id)).length;

  const daSessao = visiveis.filter((i) => autoriaDaColeta(i, eu) === "propria");
  const deOutroAutor = visiveis.filter((i) => autoriaDaColeta(i, eu) !== "propria");
  /*
    A DEVOLUÇÃO TEM SEÇÃO PRÓPRIA, e sai das contagens de coleta.

    Somá-la em "3 coletas na fila" seria contar como vistoria um pedido que
    afirma o contrário, e é justamente essa confusão que a tela existe para não
    criar. Seção própria também é o que deixa as frases de coleta intactas: elas
    já dizem a coisa certa sobre coleta.
  */
  const devolucoes = daSessao.filter((i) => i.tipo === "devolucao");
  const coletas = daSessao.filter((i) => i.tipo === "vistoria");
  const bloqueados = coletas.filter((i) => i.estado === "bloqueado");
  const arquivados = coletas.filter((i) => i.estado === "arquivado");
  const emEspera = coletas.filter(
    (i) => i.estado !== "bloqueado" && i.estado !== "arquivado",
  );
  const minhasColetas = [...bloqueados, ...emEspera];

  /*
    O título conta o que ainda tem destino, e a arquivada fica FORA dele.

    Coleta arquivada não vai ser enviada por ninguém: somá-la aqui produzia um
    "3 coletas na fila" que nunca descia para zero, e contador que nunca zera é
    contador que a pessoa aprende a ignorar. Ela tem a própria seção, com o
    próprio número e com saída pelo botão.
  */
  const naFila = contar(minhasColetas)
    /* Devolução de outro agente existe (aparelho de plantão troca de turno) e
       continua visível na seção dela, mas não entra numa contagem que diz
       "coletas": ela afirma o contrário de uma coleta. */
    + contar(deOutroAutor.filter((i) => i.tipo === "vistoria"));

  /*
    O que o botão "Tentar enviar agora" de fato faz sair.

    Era `itens.length === 0`, o que deixava o botão aceso numa fila que só tinha
    coleta arquivada ou de outro agente: a pessoa tocava, o dreno não pegava
    nada, e a tela não mudava. Botão que responde ao toque sem fazer nada ensina
    a desconfiar da tela inteira.
  */
  const prontasParaSair = [...emEspera, ...devolucoes].filter(
    (i) => !idsSaindo.has(i.id)
      && (i.estado === "pendente" || i.estado === "enviando"),
  ).length;

  /*
    POR QUE O BOTÃO ESTÁ APAGADO, na tela e não num comentário do código.

    A razão das duas travas estava escrita aqui em cima, para quem lê o
    arquivo, e em lugar nenhum para quem está em pé na chuva tocando num botão
    que não responde. `DialogoDeDevolucao` já fazia o certo: botão travado com a
    frase do que falta ao lado.

    A ordem importa, e a falta de sinal vem primeiro porque é a comum. E a
    frase dela NÃO repete o aviso do topo da tela: aquele já disse que não há
    sinal, e repetir o mesmo texto em dois lugares da mesma tela foi defeito
    relatado neste aplicativo. Esta aqui fala do botão.
  */
  const porQueApagado = !sinal.temSinal
    ? "Este botão volta assim que a conexão voltar."
    : prontasParaSair === 0
      ? "Nada aqui sai por este botão: o que está na lista espera outra conta ou "
        + "já não tem para onde ir."
      : null;

  /**
   * O cartão de um item, um só para todas as seções.
   *
   * Era código repetido dentro de um `map` que só sabia de dois grupos, e é
   * assim que o defeito nasceu: a linha inteira de botões estava atrás de
   * `item.estado === "bloqueado"`, então o estado "arquivado" chegou à tela sem
   * nenhuma saída. O motor já aceitava os dois verbos para ele.
   */
  function cartaoDaColeta(item: ItemFila) {
    const autoria = autoriaDaColeta(item, eu);
    const estado = descreverEstado(item, autoria);
    const fotosEnviadas = item.fotos.filter((f) => f.enviada).length;
    /*
      QUEM TEM SAÍDA PELA TELA, e por quê.

      Todo item que não sai sozinho precisa de botão, sem exceção: é a regra que
      o produto inteiro afirma ter e que esta tela furava. Bloqueado e arquivado
      não saem porque o dreno não os pega; coleta de outro autor não sai porque
      a credencial é de outra pessoa.
    */
    const podeReenviar = item.estado === "bloqueado" || item.estado === "arquivado";
    const podeAssumir = autoria === "sem_autor";
    const podeDescartar = podeReenviar || autoria !== "propria";
    const ocupado = emCurso?.id === item.id;

    return (
      <ItemDeLista key={item.id} saindo={idsSaindo.has(item.id)}>
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
            {/*
              O desenho do estado, na margem, em cor discreta e não na cor do
              tom. O tom já está no `Chip`, que tem fundo próprio e contraste
              verificado; a mesma cor solta sobre o cartão seria um par que
              ninguém mediu. Aqui o ícone faz o que ícone faz bem: dar forma
              para o olho varrer a lista sem ler.
            */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <estado.Icone cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
            </View>
            <Txt variante="corpoP" mono negrito>{item.protocolo}</Txt>
            <View style={{ flex: 1 }} />
            {/*
              A devolução se declara ANTES do estado dela. "Devolvida" e
              "Enviada" são dois desfechos diferentes de dois atos diferentes, e
              o selo sozinho não diz qual dos dois atos está em jogo.
            */}
            {item.tipo === "devolucao" && (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconeDevolucao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
              </View>
            )}
            {/*
              O SELO É O ÚNICO BLOCO PREENCHIDO DESTE CARTÃO, e a régua do peso
              visual (`ui/regua.ts`) é o que garante isso sem esta tela pedir.

              Dois dos quatro tons que chegam aqui são `ok` ("Enviada" e
              "Devolvida"), e eles são o caso NORMAL de uma fila de envio: numa
              tela em que quase tudo dá certo, uma coluna de pílulas verdes
              cheias acende a lista inteira e deixa a coleta bloqueada, que é a
              única que precisa do dedo do agente, com o mesmo peso das outras.
              A R3 tira o fundo de todo tom `ok` dentro do próprio `Chip`, então
              o verde continua com ícone e palavra e o vermelho continua sendo o
              único que pinta.

              Por isso o tom continua vindo de `estado`, e não de um cálculo
              feito aqui: a lista de estados é uma só (a razão está no comentário
              dela, lá em cima), e a régua é do componente.
            */}
            <Chip
              texto={estado.rotulo}
              simbolo={estado.simbolo}
              tom={estado.tom}
              descricao={`Protocolo ${item.protocolo}: ${estado.rotulo}`}
            />
          </View>

          {/* QUEM. Primeira linha do cartão quando o fato tem dono, e não a
              quinta, que era onde o nome de quem coletou estava. */}
          {estado.quem && <Txt variante="corpoP" peso={peso.forte}>{estado.quem}</Txt>}

          {/* POR QUÊ. */}
          <Txt variante="corpoP" discreto>{estado.porque}</Txt>

          {/* O QUE FAZER. */}
          {estado.oQueFazer && <OQueFazer passos={estado.oQueFazer} />}

          {item.fotos.length > 0 && (
            <Txt variante="legenda" discreto>
              {fotosEnviadas} de {item.fotos.length} arquivos já subiram
            </Txt>
          )}

          <Txt variante="legenda" discreto>
            {item.tipo === "devolucao" ? "Devolvida em " : "Coletada em "}
            {new Date(item.criadoEm).toLocaleString("pt-BR")}
          </Txt>

          {retorno?.id === item.id && (
            /* A região viva é o que faz a confirmação chegar a quem não vê a
               tela: sem ela, o leitor só leria a frase se a pessoa voltasse
               com o dedo até este ponto do cartão. */
            <View accessibilityLiveRegion="polite">
              {/*
                A confirmação também não pinta fundo, pela mesma R3, e aqui ela
                empilhava de verdade: o cartão de uma coleta bloqueada mostrava
                a pílula vermelha do estado E, logo abaixo, um retângulo verde
                cheio confirmando o toque de "Tentar de novo", dois blocos
                preenchidos a três linhas de distância dizendo coisas opostas.
                Agora o retângulo virou filete, o verde ficou no sinal e no
                título, e quem pinta continua sendo o estado.
              */}
              <Aviso tom="sucesso" titulo="Pronto">{retorno.texto}</Aviso>
            </View>
          )}

          {(podeReenviar || podeAssumir || podeDescartar) && (
            <>
              <Separador />
              <View style={{ flexDirection: "row", gap: espaco.e2 }}>
                {podeReenviar && (
                  <Botao
                    titulo="Tentar de novo"
                    tipo="secundario"
                    estilo={{ flex: 1 }}
                    carregando={ocupado && emCurso?.verbo === "reenviar"}
                    desabilitado={ocupado}
                    descricao={item.estado === "arquivado"
                      ? `Tentar enviar de novo a coleta do protocolo ${item.protocolo}, `
                        + "para o caso de a ocorrência ter sido reaberta"
                      : `Tentar enviar de novo a coleta do protocolo ${item.protocolo}`}
                    onPress={() => void agir(
                      item,
                      "reenviar",
                      async () => { await fila?.reenviar(item.id); },
                      /*
                        A frase não promete chegada, porque o reenvio não
                        garante nenhuma: ele devolve o item para a espera, e
                        quem completa o envio é o sinal. Prometer aqui seria
                        criar a mesma dúvida que esta tela dissolve.
                      */
                      "O envio foi pedido de novo. Se houver sinal, ela sai agora; "
                      + "se não, ela volta para a espera e continua tentando.",
                    )}
                  />
                )}
                {podeAssumir && (
                  /*
                    Assumir a autoria é um ato da pessoa, com o dedo, e por isso é
                    botão e não automatismo: o nome que ficar aqui é o nome que vai
                    para o laudo e para a trilha, que é append-only.
                  */
                  <Botao
                    titulo="Esta coleta é minha"
                    tipo="secundario"
                    estilo={{ flex: 1 }}
                    carregando={ocupado && emCurso?.verbo === "assumir"}
                    desabilitado={ocupado}
                    descricao={`Assumir a autoria da coleta do protocolo ${item.protocolo} `
                      + "e enviá-la com o seu nome"}
                    onPress={() => void agir(
                      item,
                      "assumir",
                      async () => { await fila?.assumir(item.id); },
                      "A coleta é sua: ela vai subir com o seu nome no laudo.",
                    )}
                  />
                )}
                {podeDescartar && (
                  /*
                    Descartar existe, e pergunta duas vezes. Sem a saída, um item
                    parado ficaria para sempre na tela, e o agente aprenderia a
                    ignorar a fila inteira. Com ela sem confirmação, um toque
                    errado apagaria a vistoria.
                  */
                  <Botao
                    titulo="Descartar"
                    tipo="perigo"
                    estilo={{ flex: 1 }}
                    desabilitado={ocupado}
                    descricao={`Descartar a coleta do protocolo ${item.protocolo}`}
                    onPress={() => { setADescartar(item); }}
                  />
                )}
              </View>
            </>
          )}
        </Cartao>
      </ItemDeLista>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
      {!sinal.temSinal && (
        <Aviso tom="alerta" titulo="Sem sinal agora">
          Nada se perde: o que está aqui sai sozinho quando a conexão voltar, sem
          você precisar fazer nada.
        </Aviso>
      )}

      {visiveis.length === 0 ? (
        /*
          A RESPOSTA FINAL À PERGUNTA "O MEU TRABALHO CHEGOU?".

          Era um título, uma frase cinza e, logo abaixo, um botão apagado com um
          parágrafo de rodapé: a tela mais importante do produto desenhada como
          se fosse "nenhum resultado para este filtro". Agora o vazio é uma
          afirmação, com desenho, e o botão apagado saiu daqui: não há nada para
          enviar, e um botão travado embaixo de "está tudo enviado" só produz a
          dúvida que a frase acabou de resolver.
        */
        <ChegadaDoVazio>
          <Vazio
            icone={<IconeSucesso cor={tema.destaque} tamanho={tamanhoDeIcone.vazio} />}
            titulo="Tudo o que você fez já chegou"
            descricao={
              "Nenhuma coleta esperando envio neste aparelho. Toda vistoria "
              + "concluída aqui já está com a coordenação, e o envio do que vier "
              + "depois acontece sozinho, em segundo plano."
            }
          />
        </ChegadaDoVazio>
      ) : (
        <>
          {naFila > 0 && (
            <Txt variante="h2">
              {naFila === 1 ? "1 coleta na fila" : `${naFila} coletas na fila`}
            </Txt>
          )}

          {minhasColetas.length > 0 && (
            <Secao Icone={IconeEnvio} titulo="Minhas coletas" quantos={contar(minhasColetas)}>
              {/* O número do aviso é o contado, e não o desenhado: uma coleta
                  que já saiu do disco não "precisa de atenção" de ninguém, mesmo
                  enquanto o cartão dela ainda está desaparecendo. */}
              {contar(bloqueados) > 0 && (
                <Aviso
                  tom="perigo"
                  titulo={contar(bloqueados) === 1
                    ? "Uma coleta precisa de atenção"
                    : `${contar(bloqueados)} coletas precisam de atenção`}
                >
                  Repetir o envio não resolve sozinho: cada cartão abaixo diz o que
                  aconteceu e o que fazer.
                </Aviso>
              )}
              {minhasColetas.map(cartaoDaColeta)}
            </Secao>
          )}

          {/*
            As devoluções, com seção própria e número próprio.

            Elas ficam aqui embaixo das coletas de propósito: coleta é trabalho
            feito que pode se perder, e é o que o agente abre esta tela para ver.
            A devolução é uma decisão que já foi tomada e que só precisa chegar.
          */}
          {devolucoes.length > 0 && (
            <Secao
              Icone={IconeDevolucao}
              titulo="Minhas devoluções"
              quantos={contar(devolucoes)}
            >
              {devolucoes.map(cartaoDaColeta)}
            </Secao>
          )}

          {/*
            A seção de quem não é da sessão aberta.

            Ela existe para o aparelho de plantão compartilhado: a coleta do
            turno anterior continua guardada (o diálogo de saída promete isso) e
            continua VISÍVEL, com o nome de quem a fez. Escondê-la seria repetir
            o defeito por outro caminho: uma vistoria parada no aparelho que
            ninguém vê é uma vistoria perdida.

            O título diz "envios" e não "coletas" porque a seção mistura os dois:
            chamar de coleta um pedido que declara que a vistoria NÃO foi feita
            seria a tela afirmando o contrário do que o item diz. Antes isso era
            um ternário dentro do título, que contava a mesma coisa de quatro
            jeitos conforme a composição da lista.
          */}
          {deOutroAutor.length > 0 && (
            <Secao
              Icone={IconeEquipe}
              titulo="Envios de outro agente"
              quantos={contar(deOutroAutor)}
            >
              <Aviso tom="alerta" titulo="Não saem pela sua conta">
                O nome de quem fez a vistoria é o nome que vai para o laudo. Eles
                ficam guardados aqui até quem coletou entrar neste aparelho.
              </Aviso>
              {deOutroAutor.map(cartaoDaColeta)}
            </Secao>
          )}

          {arquivados.length > 0 && (
            <Secao
              Icone={IconeArquivado}
              titulo="Arquivadas"
              quantos={contar(arquivados)}
            >
              {arquivados.map(cartaoDaColeta)}
            </Secao>
          )}

          <Botao
            titulo="Tentar enviar agora"
            onPress={() => void sincronizarAgora()}
            carregando={sincronizando}
            desabilitado={porQueApagado !== null}
            /* Quem ouve a tela precisa ouvir a razão junto com o nome do botão:
               a frase abaixo é desenho, e desenho não chega a quem não vê. */
            descricao={porQueApagado
              ? `Tentar enviar agora. ${porQueApagado}`
              : undefined}
          />

          {porQueApagado ? (
            <View style={{ flexDirection: "row", gap: espaco.e2, alignItems: "flex-start" }}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconeAlerta cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variante="corpoP" discreto>{porQueApagado}</Txt>
              </View>
            </View>
          ) : (
            <Txt variante="legenda" discreto alinhamento="center">
              O envio acontece sozinho, em segundo plano. Este botão é para quando
              você quer ver acontecer.
            </Txt>
          )}
        </>
      )}

      {/*
        Um diálogo só para a lista inteira, e não um por cartão.

        A lista pode ter dezenas de itens, e um `Modal` por item seria uma
        dezena de modais montados por trás da tela o tempo todo. Quem responde
        qual coleta está em questão é o estado, e o protocolo aparece no texto.
      */}
      <Dialogo
        aberto={aDescartar !== null}
        titulo={aDescartar?.tipo === "devolucao"
          ? "Descartar esta devolução?"
          : "Descartar esta coleta?"}
        /*
          Quando a coleta é de outra pessoa, a pergunta diz o nome dela.

          Sem o nome, o agente da noite apagaria a vistoria que a colega fez no
          morro achando que estava limpando a própria fila. O protocolo sozinho
          não conta essa parte, e é a parte que faz a pessoa parar.
        */
        texto={
          aDescartar?.tipo === "devolucao"
            /*
              Descartar uma devolução não apaga trabalho nenhum: ela é um pedido
              que não chegou. O que a frase precisa dizer é o que sobra depois,
              e o que sobra é a tarefa, com o agente. Repetir aqui a frase da
              coleta ("a vistoria será apagada") assustaria com uma perda que
              não existe e esconderia a consequência que existe.
            */
            ? (aDescartar.autor && aDescartar.autor.usuarioId !== identidade?.usuarioId
              ? `Esta devolução foi decidida por ${aDescartar.autor.nome}. ` : "")
              + `O pedido de devolução do protocolo ${aDescartar.protocolo} sai deste `
              + "aparelho e a coordenação não vai saber dele. A tarefa continua na sua "
              + "lista, para vistoriar ou devolver de novo."
            : (aDescartar?.autor && aDescartar.autor.usuarioId !== identidade?.usuarioId
              ? `Esta vistoria foi feita por ${aDescartar.autor.nome}. ` : "")
              + `A vistoria do protocolo ${aDescartar?.protocolo ?? ""} será apagada deste `
              + "aparelho e não chegará à coordenação. Não dá para desfazer."
        }
        acao={{
          rotulo: aDescartar?.tipo === "devolucao"
            ? "Descartar esta devolução"
            : "Descartar esta coleta",
          destrutiva: true,
          aoTocar: () => void (async () => {
            const alvo = aDescartar;
            if (!alvo || !fila) return;
            await fila.descartar(alvo.id);
            await recarregar(fila, { comemorarSeZerar: false });
          })(),
        }}
        recusa={{ rotulo: "Manter na fila" }}
        aoFechar={() => { setADescartar(null); }}
      />
    </ScrollView>
  );
}
