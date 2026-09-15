import type { Severidade } from "@dc360/shared";

import type { Ponto } from "../../dados/mapa";

/**
 * O QUE UM PINO É, e a projeção que o coloca no desenho de reserva.
 *
 * Mora em arquivo próprio, e não dentro de `MapaDoImovel`, porque três peças
 * precisam dele e duas delas não podem importar a terceira sem laço: o mapa do
 * Google monta um marcador por pino, o plano das tarefas desenha os mesmos
 * pinos sem rede nenhuma, e a tela do agente monta a lista deles.
 */

export type PinoNoMapa = {
  /**
   * A identidade da ocorrência, e ela é estável.
   *
   * É por ela que a tela sabe qual pino está escolhido, e é ela que o marcador
   * do Google carrega em `identifier`. Índice de vetor não serve: a lista se
   * reordena sozinha quando uma tarefa entra nas quatro horas finais de prazo,
   * e o pino escolhido passaria a ser outro sem ninguém ter tocado na tela.
   */
  id: string;
  ponto: Ponto;
  /** O que o pino anuncia a quem ouve a tela: protocolo, endereço e prazo. */
  rotulo: string;
  /** A gravidade, que decide cor E forma. `null` é "sem classificação". */
  severidade: Severidade | null;
  escolhido?: boolean;
  aoTocar?: () => void;
};

/** Os limites geográficos de um conjunto de pontos. */
export type CaixaDoMapa = {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
};

export function caixaDosPontos(pontos: readonly Ponto[]): CaixaDoMapa | null {
  if (pontos.length === 0) return null;
  const lats = pontos.map((p) => p.latitude);
  const lngs = pontos.map((p) => p.longitude);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/**
 * A margem do desenho, em fração do lado.
 *
 * Sem ela, o ponto mais ao norte encosta na borda de cima e o mais a oeste na
 * da esquerda, porque são eles que DEFINEM a caixa. Um pino cortado pela metade
 * parece um pino a mais fora da tela.
 */
const MARGEM = 0.12;

/**
 * Onde o ponto cai no desenho, em fração do lado (0 à esquerda, 1 à direita;
 * 0 no topo, 1 embaixo).
 *
 * ## Por que aqui a projeção `min/max` é a resposta certa, e no desenho de um
 * imóvel só ela não era
 *
 * `PlanoEsquematico` diz, por escrito, que a projeção do painel
 * (`apps/web/src/paginas/Mapa.tsx`) não se transporta para DOIS pontos: ali
 * `min` e `max` são o agente e o imóvel, a divisão zera quando o agente chega,
 * e dois pontos a quinze metros um do outro iriam para cantos opostos do
 * desenho como se estivessem longe. Aquele parágrafo continua inteiro e
 * continua certo, e é por isso que com UMA tarefa este módulo nem é chamado: o
 * desenho de lá (rosa dos ventos, rumo verdadeiro) é o que responde.
 *
 * Com N tarefas, a mesma frase se inverte, e ela já dizia isso: "o painel
 * projeta N ocorrências entre os seus próprios mínimo e máximo, e ali a posição
 * relativa dentro do conjunto É a informação". É o caso deste desenho. Onde as
 * tarefas do dia ficam UMAS EM RELAÇÃO ÀS OUTRAS é o que o agente usa para
 * montar o roteiro do turno, e isso não depende de rede nenhuma.
 *
 * O que a projeção NÃO diz continua dito na tela, em palavra: não é escala, não
 * é rua e não é caminho. A distância e o rumo de cada tarefa saem de
 * `rotaEsquematica`, com a conta de verdade, no cartão.
 *
 * Eixo degenerado (todas as tarefas na mesma latitude, ou uma só depois do
 * filtro) vira meio: dividir por zero produziria `NaN`, e `NaN` num estilo do
 * React Native não estoura, some. Um pino que some é o pior desfecho possível
 * aqui, porque a tela continua parecendo certa.
 */
export function projetarNoPlano(ponto: Ponto, caixa: CaixaDoMapa): { x: number; y: number } {
  const util = 1 - 2 * MARGEM;
  const fatia = (valor: number, minimo: number, maximo: number): number => {
    const amplitude = maximo - minimo;
    if (!Number.isFinite(amplitude) || amplitude === 0) return 0.5;
    return MARGEM + ((valor - minimo) / amplitude) * util;
  };
  return {
    x: fatia(ponto.longitude, caixa.minLng, caixa.maxLng),
    /* O norte é para CIMA, sempre: latitude maior vira fração menor. */
    y: 1 - fatia(ponto.latitude, caixa.minLat, caixa.maxLat),
  };
}
