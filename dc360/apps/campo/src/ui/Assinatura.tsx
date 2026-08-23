import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { File, Paths } from "expo-file-system";
import { Botao, Txt, useTema } from "./componentes";
import { espaco, raio } from "./tokens";

/**
 * Assinatura de próprio punho, com o dedo.
 *
 * O termo de interdição restringe o direito de alguém entrar na própria casa.
 * A assinatura de quem estava no local é o que sustenta o ato depois, quando
 * alguém contesta, e ela precisa existir como imagem, e não só como nome
 * digitado por quem conduziu a vistoria.
 *
 * Duas decisões que parecem detalhe:
 *
 * 1. **Os traços ficam em estado local e a gravação em arquivo só acontece ao
 *    confirmar.** Escrever a cada movimento do dedo travaria o desenho num
 *    aparelho de entrada, que é o que a prefeitura compra.
 * 2. **O arquivo vai para o diretório de documentos, e não para o cache.** O
 *    sistema apaga cache sem avisar quando o armazenamento aperta, e a coleta
 *    pode passar horas no aparelho antes de sincronizar.
 */

type Props = {
  /** Chamado com o caminho do PNG gravado no aparelho. */
  aoConfirmar(uriLocal: string): void;
  aoLimpar(): void;
  /** Já assinada: mostra o estado e o caminho de refazer. */
  jaAssinada: boolean;
};

const ALTURA = 180;

export function Assinatura({ aoConfirmar, aoLimpar, jaAssinada }: Props) {
  const tema = useTema();
  const [tracos, setTracos] = useState<string[]>([]);
  const [tracoAtual, setTracoAtual] = useState<string>("");
  const [gravando, setGravando] = useState(false);
  const svgRef = useRef<Svg>(null);

  /*
    `PanResponder` e não um gesto de biblioteca: o desenho precisa de cada
    quadro do movimento, sem passar por reconhecimento de gesto que pode
    decidir que aquilo era uma rolagem e cancelar o traço no meio.
  */
  const gesto = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evento) => {
        const { locationX, locationY } = evento.nativeEvent;
        setTracoAtual(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderMove: (evento) => {
        const { locationX, locationY } = evento.nativeEvent;
        setTracoAtual((t) => `${t} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderRelease: () => {
        setTracoAtual((t) => {
          if (t) setTracos((anteriores) => [...anteriores, t]);
          return "";
        });
      },
    }),
  ).current;

  const vazia = tracos.length === 0 && !tracoAtual;

  function limpar(): void {
    setTracos([]);
    setTracoAtual("");
    aoLimpar();
  }

  async function confirmar(): Promise<void> {
    if (vazia || !svgRef.current) return;
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
        alvo.toDataURL((dados) => resolver(dados));
      });

      const arquivo = new File(Paths.document, `assinatura-${Date.now()}.png`);
      arquivo.create({ overwrite: true });
      arquivo.write(base64ParaBytes(base64));
      aoConfirmar(arquivo.uri);
    } finally {
      setGravando(false);
    }
  }

  if (jaAssinada) {
    return (
      <View style={{ gap: espaco.e3 }}>
        <View style={{
          backgroundColor: tema.okFundo,
          borderRadius: raio.normal,
          padding: espaco.e3,
          flexDirection: "row",
          gap: espaco.e2,
          alignItems: "center",
        }}>
          <Txt variante="corpoP" negrito cor={tema.okTexto}>✓</Txt>
          <Txt variante="corpoP" cor={tema.okTexto}>Assinatura coletada</Txt>
        </View>
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
        accessibilityLabel="Quadro de assinatura. Arraste o dedo para assinar."
        style={{
          height: ALTURA,
          borderWidth: 1,
          borderColor: tema.borda,
          borderRadius: raio.normal,
          backgroundColor: tema.superficie,
          overflow: "hidden",
        }}
      >
        <Svg ref={svgRef} width="100%" height={ALTURA}>
          {[...tracos, tracoAtual].filter(Boolean).map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={tema.texto}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      <View style={{ flexDirection: "row", gap: espaco.e2 }}>
        <Botao
          titulo="Limpar"
          tipo="secundario"
          onPress={limpar}
          desabilitado={vazia}
          estilo={{ flex: 1 }}
        />
        <Botao
          titulo="Confirmar assinatura"
          onPress={() => void confirmar()}
          desabilitado={vazia}
          carregando={gravando}
          estilo={{ flex: 2 }}
        />
      </View>
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
