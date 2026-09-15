import type { Severidade } from "./dominio.js";

/**
 * O DESENHO DA SEVERIDADE, numa fonte só para o painel e para o aplicativo.
 *
 * ## Por que isto mora no pacote compartilhado
 *
 * Até 15/09/2026 cada canal desenhava a gravidade do seu jeito. O painel
 * punha um ponto colorido na pílula e, no mapa, círculo, triângulo, quadrado
 * e losango. O aplicativo punha um medidor com ponteiro (o mesmo para os
 * quatro níveis, mudando só a cor) na pílula e, no mapa, triângulo, losango,
 * quadrado, círculo e anel, com a escala em ordem DIFERENTE da do painel:
 * lá o círculo era crítica, aqui era baixa. O coordenador e o agente abriam
 * os dois no mesmo dia e viam duas linguagens para o mesmo fato. Quem paga
 * pediu, com estas palavras, "ícones iguais nos dois canais".
 *
 * A resposta não é copiar o caminho de um lado para o outro: cópia diverge na
 * primeira mudança, e foi assim que os dois se afastaram. É ter UM lugar de
 * onde os dois leem. Este arquivo é só dado (caminhos SVG e como preenchê-los);
 * quem desenha é cada canal, com a sua biblioteca (`<svg>` no painel,
 * `react-native-svg` no aplicativo, o símbolo do marcador do Google nos dois).
 * O portão `scripts/paridade-de-severidade.test.mjs` reprova qualquer caminho
 * de severidade escrito fora daqui.
 *
 * ## As regras do desenho, herdadas dos 24 ícones do aplicativo
 *
 * Grade de 24, traço de 1,8, cantos e pontas arredondados, sem preenchimento
 * no ícone de pílula (`stroke`, nunca `fill`). O alvo de leitura é 12 a 16,
 * que é o tamanho dentro de uma pílula ou de um cartão de lista: por isso
 * nenhum vão interno fica abaixo de uns 2 na grade, e nenhum glifo passa de
 * três traços.
 *
 * ## Os cinco glifos, e por que a FORMA muda em cada degrau
 *
 * Cor é o primeiro canal, e a regra da casa é que nada se comunica só por
 * ela: sob sol forte, âmbar e vermelho são a mesma mancha clara, e cerca de
 * um em doze homens não separa as duas. A silhueta é o segundo canal, a
 * palavra ao lado é o terceiro. As silhuetas leem como uma escala que SOBE:
 *
 * - **baixa**: círculo com um ponto no centro. Calmo, fechado, sem aresta.
 * - **média**: quadrado de cantos arredondados com um traço horizontal. O
 *   traço é a marca de "nível": está no meio da escala, nem ponto nem alerta.
 * - **alta**: triângulo de cantos arredondados com exclamação. É a placa de
 *   alerta que todo mundo reconhece, e a mesma silhueta de `IconeAlerta`.
 * - **crítica**: octógono com exclamação. É a placa de PARE, a mais pesada
 *   das quatro, e a mesma silhueta de `IconePerigo`: gravidade crítica e
 *   perigo são o mesmo tom, e não faria sentido desenhá-los diferente.
 * - **sem classificação**: círculo tracejado, vazio. É um ESTADO (a
 *   ocorrência chegou e ninguém decidiu), e não a ausência de um; por isso
 *   tem forma própria, e a forma diz "ainda por fechar".
 *
 * A marca de dentro também sobe: ponto, traço, exclamação, exclamação. A
 * exclamação repete em alta e crítica de propósito, porque as duas são alerta
 * e o que as separa é a silhueta (triângulo e octógono são as duas mais
 * diferentes do conjunto).
 *
 * O tracejado de sem classificação é desenhado com quatro arcos separados, e
 * não com `stroke-dasharray`: o símbolo do marcador do Google não entende
 * dasharray, e o pino tem de ser o mesmo glifo da pílula.
 *
 * ## Como cada canal preenche
 *
 * Na PÍLULA e no ícone de lista, tudo é traço na cor da severidade, sem
 * preenchimento. No PINO DO MAPA, o contorno vira mancha cheia (fundo da
 * severidade, contorno na tinta de texto ou na superfície) e a marca vai por
 * cima em cor de contraste; é para isso que `contorno` e `marca` são campos
 * separados, e `preenche` diz que sem classificação continua vazado mesmo
 * como pino: um círculo cinza cheio pareceria mais um degrau da escala.
 */

/** A grade em que todo glifo é desenhado: a mesma dos ícones do aplicativo. */
export const GRADE_DO_GLIFO = 24;

/** O `viewBox` pronto para o `<svg>` e o `<Svg>`. */
export const VIEWBOX_DO_GLIFO = `0 0 ${GRADE_DO_GLIFO} ${GRADE_DO_GLIFO}`;

/** A espessura do traço, uma só para os cinco, igual à dos ícones do aplicativo. */
export const TRACO_DO_GLIFO = 1.8;

/** O nome da silhueta, para legenda, teste e quem precisa dizer a forma por escrito. */
export type SilhuetaDoGlifo =
  | "circulo"
  | "quadrado"
  | "triangulo"
  | "octogono"
  | "circulo_tracejado";

export type GlifoDeSeveridade = {
  silhueta: SilhuetaDoGlifo;
  /**
   * O contorno, num único `d`. Fechado com `Z` nos quatro níveis; no
   * tracejado são arcos abertos, um `M` por dente.
   */
  contorno: string;
  /**
   * Os traços de dentro (ponto, barra, exclamação), um `d` cada. Sempre em
   * traço, nunca cheios: o ponto é um círculo minúsculo cuja espessura de
   * traço o fecha, que é como os ícones do aplicativo já desenham o ponto da
   * exclamação.
   */
  marca: readonly string[];
  /** Se o contorno vira mancha cheia quando o glifo é pino de mapa. */
  preenche: boolean;
};

/** A chave de sem classificação no registro, já que `null` não serve de chave. */
export const SEM_CLASSIFICACAO = "sem_classificacao";

export type ChaveDeGlifo = Severidade | typeof SEM_CLASSIFICACAO;

/*
  Os pontos, escritos como círculo de raio pequeno: com traço de 1,8, um
  círculo de raio 0,9 fecha num disco de raio 1,8, e o ponto solto do centro
  (raio 1,4) num disco de 3,2. É o truque que `IconeAlerta` e `IconePerigo`
  já usam para não precisar de `fill`.
*/
const PONTO_DA_EXCLAMACAO = (cy: number) =>
  `M11.1 ${cy}a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0Z`;

export const GLIFOS_DE_SEVERIDADE: Record<ChaveDeGlifo, GlifoDeSeveridade> = {
  baixa: {
    silhueta: "circulo",
    contorno: "M3.8 12a8.2 8.2 0 1 0 16.4 0a8.2 8.2 0 1 0-16.4 0Z",
    marca: ["M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0Z"],
    preenche: true,
  },
  media: {
    silhueta: "quadrado",
    contorno: "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z",
    marca: ["M8.5 12h7"],
    preenche: true,
  },
  alta: {
    silhueta: "triangulo",
    /* A mesma silhueta de `IconeAlerta` do aplicativo, com os cantos em arco de raio 2. */
    contorno: "M10.3 4.9 2.7 18.1a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z",
    marca: ["M12 9.5v3.1", PONTO_DA_EXCLAMACAO(17.5)],
    preenche: true,
  },
  critica: {
    silhueta: "octogono",
    /* O octógono ocupa a grade inteira (3 a 21): é o mais pesado dos quatro de propósito. */
    contorno: "M8.3 3h7.4l5.3 5.3v7.4l-5.3 5.3H8.3L3 15.7V8.3Z",
    marca: ["M12 8v4", PONTO_DA_EXCLAMACAO(16.8)],
    preenche: true,
  },
  sem_classificacao: {
    silhueta: "circulo_tracejado",
    /*
      Quatro dentes centrados nos pontos cardeais, cada um de 42,5 graus, com
      vãos de 47,5: nesta grade o vão visível (descontadas as pontas redondas)
      é de 5, que a 12 pontos ainda são 2,5 pixels de respiro.
    */
    contorno:
      "M9.03 4.36A8.2 8.2 0 0 1 14.97 4.36"
      + "M19.64 9.03A8.2 8.2 0 0 1 19.64 14.97"
      + "M14.97 19.64A8.2 8.2 0 0 1 9.03 19.64"
      + "M4.36 14.97A8.2 8.2 0 0 1 4.36 9.03",
    marca: [],
    preenche: false,
  },
};

/** O glifo de uma severidade, com `null` respondendo por sem classificação. */
export function glifoDeSeveridade(severidade: Severidade | null | undefined): GlifoDeSeveridade {
  return GLIFOS_DE_SEVERIDADE[severidade ?? SEM_CLASSIFICACAO];
}

/** Todos os caminhos de um glifo, contorno primeiro: para quem desenha tudo em traço. */
export function caminhosDoGlifo(glifo: GlifoDeSeveridade): readonly string[] {
  return [glifo.contorno, ...glifo.marca];
}
