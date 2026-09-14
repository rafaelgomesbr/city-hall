import { Platform } from "react-native";

import { peso as pesoDoToken, type Peso } from "./tokens";

/**
 * A tipografia do produto, dentro do aplicativo.
 *
 * `CLAUDE.md` fixa Work Sans no corpo e Roboto Mono em protocolo, matrícula e
 * número tabular. O painel carrega as duas há meses; o aplicativo carregava
 * NENHUMA e desenhava tudo com a fonte do sistema. O efeito não é sutil: o
 * coordenador abre o painel e o agente abre o aplicativo no mesmo dia, sobre a
 * mesma ocorrência, e os dois não parecem o mesmo produto. Identidade de
 * produto público é o que faz o servidor acreditar que aquilo é um sistema e
 * não um formulário improvisado.
 *
 * Três decisões moram aqui, e nenhuma é de gosto.
 *
 * **1. Uma FAMÍLIA por peso, e não `fontWeight` sobre uma família só.** É a
 * parte que costuma sair errada. No iOS o sistema sintetiza peso e quase
 * funciona; no Android, não: `fontFamily: "WorkSans"` com `fontWeight: "700"`
 * desenha o arquivo regular, sem erro, sem aviso, em silêncio. O aparelho de
 * campo é justamente o Android barato. Por isso cada peso de `tokens.peso` tem
 * um arquivo, e o que resolve o par (peso, monoespaçada) é a função abaixo, e
 * não o componente.
 *
 * **2. A reserva é DECLARADA, e não o silêncio do `undefined`.** Se a fonte
 * não carregar, o aplicativo precisa abrir do mesmo jeito, e o texto precisa
 * sair numa família escolhida por alguém: `PILHA_DO_SISTEMA` nomeia qual, por
 * plataforma. Deixar o campo vazio funcionaria igual e esconderia o fato de
 * que a identidade do produto caiu, que é coisa que se quer saber.
 *
 * **3. Os arquivos são embarcados, e não baixados.** Nenhuma chamada de rede,
 * pelo motivo de sempre neste aplicativo: ele é usado no morro, sem sinal, e
 * um produto cuja tipografia depende de rede é um produto que muda de cara
 * justamente no dia de temporal. Os cinco `.ttf` estão em `assets/fontes/`,
 * com a licença OFL ao lado deles.
 */

/**
 * Os arquivos embarcados, com o nome pelo qual o React Native vai chamá-los.
 *
 * A chave é o nome da família registrada. Ela é o nome do arquivo de
 * propósito: qualquer outra convenção vira uma segunda tabela para manter em
 * sincronia, e a divergência só aparece no aparelho.
 */
export const ARQUIVOS_DE_FONTE = {
  "WorkSans-Regular": require("../../assets/fontes/WorkSans-Regular.ttf") as number,
  "WorkSans-SemiBold": require("../../assets/fontes/WorkSans-SemiBold.ttf") as number,
  "WorkSans-Bold": require("../../assets/fontes/WorkSans-Bold.ttf") as number,
  "RobotoMono-Regular": require("../../assets/fontes/RobotoMono-Regular.ttf") as number,
  "RobotoMono-Bold": require("../../assets/fontes/RobotoMono-Bold.ttf") as number,
};

/**
 * Peso para família, nas duas pilhas.
 *
 * A monoespaçada tem dois arquivos e não três, e o `forte` dela cai no
 * negrito. Isso é escolha, não descuido: Roboto Mono aparece em protocolo,
 * matrícula e número tabular, onde só existem dois papéis (o número e o número
 * que manda). Embarcar um terceiro arquivo custaria 78 kB no aparelho para uma
 * diferença que ninguém pediu.
 */
export const FAMILIA_POR_PESO: Record<"texto" | "mono", Record<Peso, string>> = {
  texto: {
    [pesoDoToken.normal]: "WorkSans-Regular",
    [pesoDoToken.forte]: "WorkSans-SemiBold",
    [pesoDoToken.negrito]: "WorkSans-Bold",
  },
  mono: {
    [pesoDoToken.normal]: "RobotoMono-Regular",
    [pesoDoToken.forte]: "RobotoMono-Bold",
    [pesoDoToken.negrito]: "RobotoMono-Bold",
  },
};

/**
 * A reserva, dita em voz alta.
 *
 * São os nomes que cada plataforma entende para "a fonte do sistema". No iOS,
 * `System` resolve para a San Francisco; no Android, `sans-serif` e
 * `monospace` são as famílias que o próprio sistema registra. A monoespaçada
 * do iOS continua sendo Menlo, que é o que este aplicativo já usava antes de
 * existir Roboto Mono aqui.
 *
 * Sem entrada para `web` de propósito: o aplicativo não é servido em
 * navegador, e inventar uma pilha CSS aqui seria descrever uma plataforma em
 * que ele não roda.
 */
export const PILHA_DO_SISTEMA = {
  texto: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
} as const;

/**
 * Que família o texto usa, agora.
 *
 * `fontesProntas` é a única coisa que separa a identidade do produto da
 * reserva do sistema, e ela vem do provedor em `fontes.tsx`, nunca de um
 * palpite do componente.
 */
export function familiaDoTexto({ mono = false, peso = pesoDoToken.normal, fontesProntas }: {
  mono?: boolean;
  peso?: Peso;
  fontesProntas: boolean;
}): string {
  const pilha = mono ? "mono" : "texto";
  return fontesProntas ? FAMILIA_POR_PESO[pilha][peso] : PILHA_DO_SISTEMA[pilha];
}
