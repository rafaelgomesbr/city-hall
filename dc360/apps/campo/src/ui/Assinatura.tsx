import { useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { File, Paths } from "expo-file-system";
import { Aviso, Botao, LinhaDeAcoes, Txt } from "./componentes";
import { Chip } from "./Chip";
import { IconeSucesso } from "./icones";
import { borda, espaco, icone, papel, raio } from "./tokens";

/**
 * Assinatura de próprio punho, com o dedo.
 *
 * O termo de interdição restringe o direito de alguém entrar na própria casa.
 * A assinatura de quem estava no local é o que sustenta o ato depois, quando
 * alguém contesta, e ela precisa existir como imagem, e não só como nome
 * digitado por quem conduziu a vistoria.
 *
 * Quatro decisões que parecem detalhe:
 *
 * 1. **Os traços ficam em estado local e a gravação em arquivo só acontece ao
 *    confirmar.** Escrever a cada movimento do dedo travaria o desenho num
 *    aparelho de entrada, que é o que a prefeitura compra.
 * 2. **O arquivo vai para o diretório de documentos, e não para o cache.** O
 *    sistema apaga cache sem avisar quando o armazenamento aperta, e a coleta
 *    pode passar horas no aparelho antes de sincronizar.
 * 3. **O quadro é papel, e não superfície de aplicativo.** Ver `papel` em
 *    `tokens.ts`: o traço saía branco no tema escuro e sumia no laudo, que é
 *    impresso em papel branco.
 * 4. **A largura do SVG é medida e passada em pixels.** Ver o comentário sobre
 *    `onLayout` mais abaixo.
 */

type Props = {
  /** Chamado com o caminho do PNG gravado no aparelho. */
  aoConfirmar(uriLocal: string): void;
  aoLimpar(): void;
  /** Já assinada: mostra o estado e o caminho de refazer. */
  jaAssinada: boolean;
  /*
    Cinto e suspensório para o roubo de gesto.

    Os callbacks de captura do PanResponder já ganham a disputa, mas desligar o
    ScrollView pai enquanto o dedo desenha remove a disputa inteira. Só pode
    virar DUAS vezes por traço, no início e no fim: quem amarrar isso ao
    movimento faz o ScrollView remontar a cada quadro.
  */
  aoComecarDesenho?: () => void;
  aoTerminarDesenho?: () => void;
};

const ALTURA = 180;

/**
 * Teto de espera da rasterização.
 *
 * `toDataURL` recebe callback e não tem caminho de erro: se a implementação
 * nativa não chamar de volta, a promessa nunca resolve, `gravando` fica true
 * para sempre e o botão de confirmar trava, com o morador parado esperando
 * para assinar. Oito segundos é folgado até para o aparelho mais lento que a
 * prefeitura compra, e curto o bastante para o agente decidir o que fazer.
 */
const LIMITE_DE_GRAVACAO_MS = 8000;

export function Assinatura(
  { aoConfirmar, aoLimpar, jaAssinada, aoComecarDesenho, aoTerminarDesenho }: Props,
) {
  const [tracos, setTracos] = useState<string[]>([]);
  const [tracoAtual, setTracoAtual] = useState<string>("");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [largura, setLargura] = useState(0);
  const svgRef = useRef<Svg>(null);

  /*
    Os avisos vao por ref, e nao direto no PanResponder.

    `useRef(PanResponder.create(...))` congela a closure na primeira renderização.
    Se os callbacks fossem capturados ali, uma tela que trocasse a função
    passaria a ter um ScrollView que nunca mais volta a ser desligado, e o
    defeito voltaria calado.
  */
  const aoComecarDesenhoRef = useRef(aoComecarDesenho);
  aoComecarDesenhoRef.current = aoComecarDesenho;
  const aoTerminarDesenhoRef = useRef(aoTerminarDesenho);
  aoTerminarDesenhoRef.current = aoTerminarDesenho;

  /** Fecha o traço em curso. Um lugar só, porque soltar e ser interrompido
      pelo sistema precisam terminar exatamente igual. */
  function encerrarTraco(): void {
    setTracoAtual((t) => {
      if (t) setTracos((anteriores) => [...anteriores, t]);
      return "";
    });
    aoTerminarDesenhoRef.current?.();
  }

  /*
    `PanResponder` e não um gesto de biblioteca: o desenho precisa de cada
    quadro do movimento, sem passar por reconhecimento de gesto que pode
    decidir que aquilo era uma rolagem e cancelar o traço no meio.
  */
  const gesto = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      /*
        A FASE DE CAPTURA e o que resolve o defeito relatado no primeiro uso em
        aparelho: "onde pede a assinatura esta rolando a tela, e o usuario nao
        consegue assinar".

        Sem captura, o ScrollView que embrulha a tela de vistoria avalia o
        movimento ANTES do quadro de assinatura e reivindica o gesto assim que o
        dedo passa do limiar de rolagem. Num traco de assinatura isso acontece em
        milimetros: a pessoa comeca a escrever e a tela sobe.

        `onStartShouldSetPanResponderCapture` e seguro aqui porque o quadro nao
        tem nenhum filho tocavel. Num container com botoes dentro, ele engoliria
        os filhos.
      */
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,

      /*
        A recusa formal quando o ScrollView pede o responder no meio do traco.
        Sem ela, mesmo tendo ganhado o gesto na captura, o traco e cortado ao
        meio quando o pai insiste.
      */
      onPanResponderTerminationRequest: () => false,

      /* So age no Android, e e justamente o Android que rouba o gesto. */
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evento) => {
        aoComecarDesenhoRef.current?.();
        const { locationX, locationY } = evento.nativeEvent;
        setTracoAtual(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderMove: (evento) => {
        const { locationX, locationY } = evento.nativeEvent;
        setTracoAtual((t) => `${t} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderRelease: () => {
        encerrarTraco();
      },

      /*
        O sistema arranca o responder quando entra ligacao ou quando alguem puxa
        a central de notificacoes. Sem tratar, o traco em curso desaparecia e
        `tracoAtual` ficava pendurado: o quadro deixava de estar vazio sem ter
        nenhum traco na lista, e o botao de confirmar liberava uma assinatura
        que nao existia.
      */
      onPanResponderTerminate: () => {
        encerrarTraco();
      },
    }),
  ).current;

  const vazia = tracos.length === 0 && !tracoAtual;

  function limpar(): void {
    setTracos([]);
    setTracoAtual("");
    setErro(null);
    aoLimpar();
  }

  /*
    A largura chega medida, e não como "100%".

    Em parte dos aparelhos Android o `toDataURL` rasteriza errado quando a
    largura do SVG é percentual: a tela mostra o traço no lugar certo e o PNG
    sai cortado ou esticado. O defeito só aparece no laudo, dias depois, quando
    já não dá para chamar o morador de volta para assinar de novo.
  */
  function medir(evento: LayoutChangeEvent): void {
    setLargura(Math.round(evento.nativeEvent.layout.width));
  }

  async function confirmar(): Promise<void> {
    if (vazia || !svgRef.current) return;
    setErro(null);
    setGravando(true);
    try {
      /*
        `toDataURL` do react-native-svg rasteriza o que está desenhado. É o
        caminho sem dependência nova: a alternativa seria uma biblioteca de
        captura de tela, que traz permissão e tamanho para resolver o que já
        está resolvido aqui.
      */
      const base64 = await new Promise<string>((resolver, rejeitar) => {
        const alvo = svgRef.current;
        if (!alvo?.toDataURL) {
          rejeitar(new Error("Este aparelho não conseguiu gerar a imagem da assinatura."));
          return;
        }
        const relogio = setTimeout(() => {
          rejeitar(new Error(
            "O aparelho não respondeu ao gerar a imagem da assinatura. Tente confirmar de novo.",
          ));
        }, LIMITE_DE_GRAVACAO_MS);
        alvo.toDataURL((dados) => {
          clearTimeout(relogio);
          resolver(dados);
        });
      });

      const arquivo = new File(Paths.document, `assinatura-${Date.now()}.png`);
      arquivo.create({ overwrite: true });
      arquivo.write(base64ParaBytes(base64));
      aoConfirmar(arquivo.uri);
    } catch (falha) {
      /*
        A falha vira texto na tela, e o traço fica onde está.

        Antes disto a promessa rejeitada morria sem dono e a tela não mudava:
        o agente via o botão voltar ao normal e não sabia se a assinatura tinha
        sido guardada. Limpar o desenho aqui seria pior ainda, porque obrigaria
        o morador a assinar de novo por um defeito que não é dele.
      */
      setErro(falha instanceof Error
        ? falha.message
        : "Não foi possível gravar a assinatura neste aparelho.");
    } finally {
      setGravando(false);
    }
  }

  if (jaAssinada) {
    return (
      <View style={{ gap: espaco.e3 }}>
        {/*
          Era uma tarja verde CHEIA montada à mão aqui dentro, com um "✓"
          tipográfico e o texto em `okTexto`. Ela tinha os dois defeitos que a
          régua do peso visual existe para acabar: pintava fundo para confirmar
          o caso normal (R3), e era a quarta cópia de um desenho que o `Chip` já
          faz, com tamanho de fonte e símbolo decididos aqui e em nenhum outro
          lugar. O `Chip` traz junto o rótulo de acessibilidade num elemento só
          e o símbolo obrigatório no tipo.
        */}
        <Chip
          tom="ok"
          texto="Assinatura coletada"
          simbolo={(cor) => <IconeSucesso cor={cor} tamanho={icone.inline} />}
        />
        <Botao titulo="Assinar de novo" tipo="secundario" onPress={limpar} />
      </View>
    );
  }

  return (
    <View style={{ gap: espaco.e3 }}>
      <Txt variante="corpoP" discreto>
        Peça para quem está no local assinar com o dedo, no quadro abaixo.
      </Txt>

      <View
        {...gesto.panHandlers}
        onLayout={medir}
        testID="quadro-de-assinatura"
        accessibilityLabel="Quadro de assinatura. Arraste o dedo para assinar."
        style={{
          height: ALTURA,
          borderWidth: borda.fio,
          /*
            Papel, e não `tema.superficie`. O que está aqui dentro é o que vai
            para o laudo, e o laudo é impresso em branco nos dois temas.
          */
          borderColor: papel.linha,
          borderRadius: raio.normal,
          backgroundColor: papel.fundo,
          overflow: "hidden",
        }}
      >
        <Svg ref={svgRef} width={largura} height={ALTURA} testID="tela-de-assinatura">
          {/*
            O fundo é pintado DENTRO do SVG, e não só no `View` de fora.

            `toDataURL` rasteriza o SVG, e mais nada: o `backgroundColor` do
            `View` fica de fora do arquivo. Sem este retângulo opaco o PNG sai
            com fundo transparente, e aí o traço aparece ou some conforme o que
            estiver atrás dele em cada visualizador que abrir o laudo.
          */}
          <Rect
            testID="papel-da-assinatura"
            x={0} y={0} width={largura} height={ALTURA}
            fill={papel.fundo}
          />
          {[...tracos, tracoAtual].filter(Boolean).map((d, i) => (
            <Path
              key={i}
              testID="traco-da-assinatura"
              d={d}
              stroke={papel.tinta}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      {/*
        Era a quinta cópia do `Aviso`, montada à mão: retângulo vermelho, texto
        vermelho e nenhum sinal. Sem o sinal, ela furava a regra mais antiga
        deste aplicativo (nada se comunica só por cor) no único bloco da tela
        que fala de uma falha ao gravar a prova de uma interdição. O `Aviso`
        traz o "×", traz a palavra "Perigo" para quem ouve a tela e traz o mesmo
        `accessibilityRole="alert"` que estava escrito aqui.
      */}
      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      {/*
        O PAR DE BOTÕES QUE QUEBRAVA, e a conta que explica por quê.

        Era uma linha escrita à mão com `flex: 1` no "Limpar" e `flex: 2` no
        "Confirmar assinatura". Num aparelho de 390 pontos, dentro de um
        `Cartao` que come 32 de recuo, dentro de um `ScrollView` que come outros
        32, sobravam 326: o "Confirmar assinatura" ficava com uns 209 e, tirando
        o recuo dele, uns 177 para vinte e um caracteres que pedem perto de 163
        no tamanho de corpo. A margem era pequena demais, e em aparelho mais
        estreito ela virava negativa: o rótulo quebrava em duas linhas e, como o
        `Botao` usa `minHeight` e não `height`, o botão CRESCIA e ficava mais
        alto que o vizinho. Foi a reclamação literal de quem paga.

        `LinhaDeAcoes` decide isto medindo, em vez de o arquivo apostar: aqui os
        dois rótulos não cabem lado a lado em aparelho nenhum que a prefeitura
        compra, então eles empilham, e "Confirmar assinatura" passa a ter a
        largura inteira do cartão, onde ele cabe com folga e em uma linha.
      */}
      <LinhaDeAcoes
        testID="acoes-da-assinatura"
        acoes={[
          {
            titulo: "Limpar",
            tipo: "secundario",
            onPress: limpar,
            desabilitado: vazia,
            descricao: "Limpar a assinatura: apagar o traço e começar de novo",
            testID: "limpar-assinatura",
          },
          {
            titulo: "Confirmar assinatura",
            onPress: () => void confirmar(),
            desabilitado: vazia,
            carregando: gravando,
            /*
              SEM `descricao`, e isso é decisão e não esquecimento. O rótulo
              visível já diz exatamente o que o botão faz, e um rótulo falado
              diferente do escrito quebra o Controle por Voz: quem diz "tocar em
              Confirmar assinatura" deixa de acertar o botão que está lendo.
            */
            testID: "confirmar-assinatura",
          },
        ]}
      />
    </View>
  );
}

/**
 * Converte a data URL do SVG em bytes.
 *
 * `Buffer` não existe em React Native sem polyfill, e `atob` existe. O prefixo
 * `data:image/png;base64,` precisa sair antes: gravá-lo junto produziria um
 * arquivo que nenhum visualizador abre, e o defeito só apareceria no laudo,
 * semanas depois.
 */
function base64ParaBytes(dataUrl: string): Uint8Array {
  const virgula = dataUrl.indexOf(",");
  const puro = virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl;
  const binario = globalThis.atob(puro);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
