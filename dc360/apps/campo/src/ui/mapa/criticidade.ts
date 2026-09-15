import { ROTULO_SEVERIDADE, SEVERIDADES, type Severidade } from "@dc360/shared";

import type { Tema } from "../tokens";

/**
 * O VOCABULÁRIO DO PINO DE CRITICIDADE, num lugar só.
 *
 * ## O argumento que este arquivo desfaz, e com o que ele é substituído
 *
 * Até 15/09/2026 estava escrito, com estas palavras, em `MapaDoImovel.tsx` e em
 * `PlanoEsquematico.tsx`: "o marcador NÃO leva cor de severidade (...) severidade
 * tem selo com ícone e palavra na própria tela, e repeti-la só em cor, num
 * desenho sem legenda, é comunicar estado por cor sozinha".
 *
 * A regra continua valendo inteira. O que mudou foi a segunda metade da frase:
 * o desenho passou a ter legenda. Quem paga pediu o pino por criticidade, e a
 * resposta certa a esse pedido não é afrouxar a regra, é CUMPRI-LA por três
 * canais ao mesmo tempo:
 *
 * 1. **Cor**, da paleta de severidade do tema (`sevBaixa` a `sevCritica`), que
 *    já é medida par a par no portão de contraste e é a única paleta que o
 *    produto autoriza para gravidade (nunca a cor de marca);
 * 2. **Forma**, e é ela que faz o pino funcionar sob sol forte e para quem não
 *    separa âmbar de vermelho: triângulo, losango, quadrado, círculo e anel são
 *    distinguíveis de relance, em preto e branco, com a tela molhada;
 * 3. **Palavra**, em dois lugares: na legenda que fica VISÍVEL na tela ao lado
 *    do mapa, e no `SeloSeveridade` que o toque no pino abre, com ícone e nome
 *    por extenso.
 *
 * A tela de vistoria continua como sempre foi, com o marcador em tinta de
 * texto: lá há UM imóvel, não há escala de comparação nenhuma e não há legenda,
 * então colorir o pino ali seria exatamente o defeito que a frase antiga
 * descrevia. Quem passa criticidade é só quem também desenha a legenda, e isso
 * não é convenção: `MapaDoImovel` desenha a legenda SEMPRE que recebe pinos com
 * criticidade, no mesmo componente, de forma que os dois não se separam.
 *
 * ## Por que é um módulo de dados, e não um punhado de ternários na tela
 *
 * Porque o par cor/forma precisa ser o MESMO no marcador do Google, no pino do
 * plano esquemático e na chave da legenda. Três lugares escolhendo por conta
 * própria é como a legenda passa a descrever um mapa que não existe, e é o
 * defeito que o `Chip` já documenta ter custado caro neste aplicativo (duas
 * listas para um fato só).
 */

/**
 * A forma de cada criticidade.
 *
 * Cinco formas para cinco estados, e a escala é lida também pela SILHUETA: o
 * triângulo aponta (é o sinal de alerta que todo mundo já reconhece), o losango
 * é a mesma figura girada e mais fechada, o quadrado é estável, o círculo é
 * neutro e o anel é o vazio de quem ainda não foi classificado. De relance, sem
 * cor, elas não se confundem.
 */
export type FormaDaCriticidade = "triangulo" | "losango" | "quadrado" | "circulo" | "anel";

export type AparenciaDaCriticidade = {
  /** A cor de preenchimento, da paleta de severidade do tema. */
  fundo: string;
  /** A tinta que vai POR CIMA do fundo, com contraste já medido no portão. */
  tinta: string;
  forma: FormaDaCriticidade;
  /** A palavra, que é o canal que não depende de enxergar cor nem forma. */
  palavra: string;
};

/**
 * A ordem em que as criticidades aparecem na legenda: da mais grave para a
 * menos.
 *
 * `SEVERIDADES` vem do pacote compartilhado na ordem crescente de gravidade
 * (baixa a crítica), e a legenda é lida de cima para baixo, então ela inverte.
 * Inverter aqui, uma vez, é o que impede cada tela de escolher uma ordem: a
 * primeira chave da legenda precisa ser a mesma que o agente procura primeiro.
 *
 * `null` é a ocorrência SEM CLASSIFICAÇÃO, e ela fica no fim porque não é um
 * degrau da escala: é a triagem que ainda não aconteceu.
 */
export const CRITICIDADES_DA_LEGENDA: readonly (Severidade | null)[] = [
  ...[...SEVERIDADES].reverse(),
  null,
];

const FORMA: Record<Severidade, FormaDaCriticidade> = {
  critica: "triangulo",
  alta: "losango",
  media: "quadrado",
  baixa: "circulo",
};

export function aparenciaDaCriticidade(
  tema: Tema,
  severidade: Severidade | null,
): AparenciaDaCriticidade {
  if (!severidade) {
    /*
      Sem classificação é um ESTADO, e não a ausência de um: a ocorrência
      chegou e ninguém decidiu ainda. É a mesma decisão que o `SeloSeveridade`
      já tomou, com as mesmas palavras, e por isso ela também tem forma e nome
      em vez de ser o único pino que se distingue por ser cinza.
    */
    return {
      fundo: tema.superficie2,
      tinta: tema.textoDiscreto,
      forma: "anel",
      palavra: "Sem classificação",
    };
  }
  const paleta: Record<Severidade, { fundo: string; tinta: string }> = {
    baixa: { fundo: tema.sevBaixaFundo, tinta: tema.sevBaixaTexto },
    media: { fundo: tema.sevMediaFundo, tinta: tema.sevMediaTexto },
    alta: { fundo: tema.sevAltaFundo, tinta: tema.sevAltaTexto },
    critica: { fundo: tema.sevCriticaFundo, tinta: tema.sevCriticaTexto },
  };
  return {
    ...paleta[severidade],
    forma: FORMA[severidade],
    palavra: ROTULO_SEVERIDADE[severidade],
  };
}

/**
 * Quais criticidades a legenda precisa explicar: as que estão no mapa, e nada
 * além delas.
 *
 * Uma legenda com os cinco degraus sempre desenhados é uma legenda que descreve
 * um mapa que não está ali. Ela ocupa a altura que falta ao mapa e ensina o
 * agente a não olhar para ela, que é o contrário do que ela existe para fazer.
 *
 * A ordem de saída é sempre a de `CRITICIDADES_DA_LEGENDA`, e não a ordem em
 * que os pinos apareceram: legenda que se reordena a cada despacho novo é
 * legenda que se lê de novo toda vez.
 */
export function criticidadesNoMapa(
  severidades: readonly (Severidade | null)[],
): (Severidade | null)[] {
  const presentes = new Set(severidades);
  return CRITICIDADES_DA_LEGENDA.filter((c) => presentes.has(c));
}
