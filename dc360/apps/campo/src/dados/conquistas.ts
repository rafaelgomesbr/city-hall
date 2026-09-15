/**
 * CONQUISTAS: os selos por marco de vistorias concluídas.
 *
 * O pedido, na letra de quem paga: "conquistas e histórico". E a restrição,
 * que é o desenho inteiro: SEM TABELA NOVA. O total de vistorias que o agente
 * assinou já desce em `GET /campo/meu-trabalho` (`totalConcluidas`, que é o
 * número de verdade e não o tamanho da lista cortada), e um selo é só uma
 * leitura desse número. Guardar "conquistou o selo dos cinquenta" no banco
 * seria guardar uma segunda cópia de um fato que o próprio total já afirma, e
 * a segunda cópia é a que diverge.
 *
 * ## O que um selo é, e o que ele não é
 *
 * É reconhecimento do trabalho: quem assinou cinquenta vistorias subiu
 * cinquenta morros. Não é ranking, não é meta, não compara com o colega e não
 * chega à coordenação como número. A tela do agente é a única que o desenha,
 * e a razão está na régua da casa: cor de marca nunca comunica severidade, e
 * um selo nunca comunica cobrança.
 *
 * ## Por que o progresso é medido do marco anterior
 *
 * Com 62 concluídas o próximo marco é 100, e a barra mostra 12 de 50 (de 50
 * a 100), não 62 de 100. Medida do zero, a barra da centena nasceria meio
 * cheia no dia em que o agente ganhou o selo dos cinquenta, e um marco que
 * começa pela metade não parece um marco: parece que falta pouco quando falta
 * exatamente o mesmo tanto que se acabou de andar.
 */

export type Marco = {
  /** Quantas vistorias concluídas o marco pede. */
  total: number;
  /** A palavra do selo, uma por marco, curta o bastante para caber num círculo. */
  titulo: string;
};

/**
 * Os cinco marcos, combinados com quem paga: 1, 10, 50, 100, 500.
 *
 * Cinco e não dez, e sem "1000": um marco que ninguém alcança em anos de
 * produto é uma barra que nunca enche. Quando alguém chegar aos quinhentos, é
 * hora de conversar sobre o sexto.
 */
export const MARCOS: readonly Marco[] = [
  { total: 1, titulo: "Primeira" },
  { total: 10, titulo: "Dez" },
  { total: 50, titulo: "Cinquenta" },
  { total: 100, titulo: "Cem" },
  { total: 500, titulo: "Quinhentas" },
];

export type ProximoMarco = {
  marco: Marco;
  /** Quantas vistorias faltam para ele. Sempre pelo menos 1. */
  faltam: number;
  /** De 0 a 1, medido do marco anterior até este. */
  progresso: number;
};

export type Conquistas = {
  /** Os marcos já alcançados, na ordem. */
  conquistadas: Marco[];
  /** O próximo marco, ou nulo depois do último. */
  proxima: ProximoMarco | null;
};

export function conquistas(totalConcluidas: number): Conquistas {
  /* Total torto vira zero em vez de estourar: o número vem do servidor e da
     cópia em disco, e uma cópia gravada por versão antiga pode não tê-lo. */
  const total = Number.isFinite(totalConcluidas) ? Math.max(0, Math.floor(totalConcluidas)) : 0;

  const conquistadas = MARCOS.filter((m) => total >= m.total);
  const proxima = MARCOS.find((m) => total < m.total) ?? null;
  if (!proxima) return { conquistadas, proxima: null };

  const anterior = conquistadas[conquistadas.length - 1]?.total ?? 0;
  const percurso = proxima.total - anterior;
  return {
    conquistadas,
    proxima: {
      marco: proxima,
      faltam: proxima.total - total,
      progresso: percurso > 0 ? (total - anterior) / percurso : 0,
    },
  };
}
