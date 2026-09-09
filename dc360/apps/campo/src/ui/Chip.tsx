import { View } from "react-native";

import { Txt, useTema } from "./componentes";
import { espaco, raio } from "./tokens";

/**
 * O selo de estado, com símbolo obrigatório.
 *
 * O que este componente substitui é um padrão que estava remontado à mão em
 * cada tela: um `Selo` genérico recebendo `fundo` e `cor` decididos ali mesmo,
 * numa cadeia de ternários, ao lado de uma segunda lista (o `switch` que
 * escolhe a palavra) que precisava concordar com a primeira. Duas listas para
 * um fato só é a forma exata do defeito que já custou caro neste aplicativo, e
 * ele apareceu de novo aqui: a fila de envio ganhou o estado "arquivado" no
 * `switch` das palavras e ninguém acrescentou o caso na cadeia das cores, então
 * uma coleta ARQUIVADA (a ocorrência foi encerrada no painel enquanto ela
 * esperava sinal) ficava com o mesmo desenho de uma coleta AGUARDANDO envio.
 * Os dois estados são opostos: um ainda vai chegar, o outro nunca vai.
 *
 * Duas decisões, e as duas vêm da rua:
 *
 * 1. **`simbolo` é obrigatório, e não opcional com padrão.** A regra da casa é
 *    que nada se comunica só por cor, e um padrão silencioso seria o jeito
 *    curto de furá-la sem ninguém perceber na revisão. Sob sol forte na tela do
 *    aparelho, verde e âmbar são a mesma mancha clara, e para quem não separa
 *    as duas cores eles nunca foram diferentes. Exigir o símbolo obriga quem
 *    escreve a tela a responder "e sem cor, como isto se distingue?".
 * 2. **O texto não desce abaixo de `fonteMinima`.** O selo antigo usava
 *    `legenda`, que é 12: é o tamanho que se lê sentado numa mesa, não em pé
 *    com o aparelho molhado a meio metro do rosto.
 *
 * Para o leitor de tela o chip é UM elemento com uma frase em português. O
 * símbolo sozinho seria lido como "sinal de exclamação", que é ruído, e por
 * isso o `accessible` está no invólucro e não nos dois textos.
 */

export type TomDoChip = "neutro" | "ok" | "alerta" | "perigo";

export function Chip({
  texto,
  simbolo,
  tom = "neutro",
  descricao,
  testID,
}: {
  texto: string;
  /**
   * O segundo canal, além da cor. Curto e de alto contraste: "✓", "!", "↑".
   * Obrigatório de propósito, ver o comentário acima.
   */
  simbolo: string;
  tom?: TomDoChip;
  /** A frase que o leitor de tela fala, quando o texto do chip não bastar. */
  descricao?: string;
  testID?: string;
}) {
  const tema = useTema();
  const cores = {
    neutro: { fundo: tema.superficie2, cor: tema.textoDiscreto },
    ok: { fundo: tema.okFundo, cor: tema.okTexto },
    alerta: { fundo: tema.alertaFundo, cor: tema.alertaTexto },
    perigo: { fundo: tema.perigoFundo, cor: tema.perigoTexto },
  }[tom];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={descricao ?? texto}
      style={{
        backgroundColor: cores.fundo,
        borderRadius: raio.pilula,
        paddingHorizontal: espaco.e3,
        paddingVertical: espaco.e1,
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e2,
        alignSelf: "flex-start",
      }}
    >
      <Txt variante="corpoP" negrito cor={cores.cor}>{simbolo}</Txt>
      <Txt variante="corpoP" negrito cor={cores.cor}>{texto}</Txt>
    </View>
  );
}

