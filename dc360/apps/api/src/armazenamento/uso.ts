import type { Consulta } from "../banco/tipos.js";

/**
 * Quanto um município ocupa de armazenamento, e o que fazer a respeito.
 *
 * A CONTA QUE MOTIVA ISTO, medida na produção: uma ocorrência com vida
 * completa custa cerca de 8 KB no banco, e 2.000 atendimentos por ano dão 16 MB
 * por ano. As fotografias não estão no banco: seis fotos de 2 MB por vistoria
 * dão 24 GB por ano nos mesmos 2.000 atendimentos. Três ordens de grandeza
 * acima, e é essa a conta que chega para o fornecedor.
 *
 * TODA A DECISÃO MORA NO BANCO, em `situacao_de_armazenamento` (migração 035).
 * Este arquivo não soma nada, não sabe o teto de ninguém e não escolhe
 * situação: ele lê a função e traduz os nomes. Isso é deliberado, porque a
 * mesma decisão precisa valer para o gatilho que protege qualquer escrita
 * futura em `evidencias`, e duas cópias de uma regra divergem em silêncio.
 */

export type SituacaoDeArmazenamento =
  /** O contrato não fixou número. É o estado de todos os municípios hoje. */
  | "sem_teto"
  | "normal"
  /** Passou do limiar de aviso. Avisa, e não recusa. */
  | "aviso"
  /** Passou do teto contratado. Continua não recusando: ver abaixo. */
  | "acima_do_teto"
  /** Passou da margem. Aqui a autorização é negada. */
  | "recusado";

export type UsoDeArmazenamento = {
  bytesUsados: number;
  tetoBytes: number | null;
  margemBytes: number | null;
  situacao: SituacaoDeArmazenamento;
};

/**
 * A partir de quanto o aviso acende: 80% do teto.
 *
 * O número precisa dar tempo de a renegociação de contrato acontecer, e não de
 * o balde encher: quem age é quem está na mesa, e a resposta dele leva dias.
 * Vinte por cento de um teto anual são semanas de vistoria, mesmo num mês de
 * temporal.
 *
 * A AUTORIDADE É O SQL. Esta constante existe para a rota montar a frase e para
 * o teste conferir; a decisão de qual situação vale é da função do banco. Um
 * caso de teste compara os dois e reprova se divergirem.
 */
export const LIMIAR_DE_AVISO = 0.8;

/**
 * Quanto acima do teto ainda passa: 50%.
 *
 * ESTA É A DECISÃO QUE PROTEGE O TRABALHO DE CAMPO. O teto contratado é freio
 * de mão e não de pé: passar dele acende o aviso e entra no relatório, e não
 * arranca a vistoria da mão de quem já subiu o barranco. O que recusa é a
 * margem, bem acima, e ela existe só para o balde não virar infinito por
 * omissão de quem devia ter renegociado.
 *
 * Metade do teto cobre com folga o evento que justifica o estouro: uma semana
 * de temporal com o dobro das vistorias de um mês normal.
 *
 * Mesma observação da constante acima: a autoridade é o SQL.
 */
export const MARGEM_DO_TETO = 1.5;

type LinhaDaSituacao = {
  bytes_usados: string;
  teto_bytes: string | null;
  margem_bytes: string | null;
  situacao: SituacaoDeArmazenamento;
};

/**
 * Lê a situação DENTRO do contexto de município já aberto por quem chama.
 *
 * Recebe `Consulta` e não `Banco` de propósito: assim ela entra na MESMA
 * transação da rota que vai autorizar o envio. Lida numa transação própria, a
 * conta seria de um instante e a gravação de outro, e dois agentes enviando ao
 * mesmo tempo passariam os dois por uma margem que só cabia um.
 */
export async function lerUso(c: Consulta, bytesNovos = 0): Promise<UsoDeArmazenamento> {
  const r = await c.query<LinhaDaSituacao>(
    `SELECT bytes_usados::text, teto_bytes::text, margem_bytes::text, situacao
       FROM situacao_de_armazenamento($1)`,
    [bytesNovos],
  );
  const linha = r.rows[0]!;
  return {
    bytesUsados: Number(linha.bytes_usados),
    tetoBytes: linha.teto_bytes === null ? null : Number(linha.teto_bytes),
    margemBytes: linha.margem_bytes === null ? null : Number(linha.margem_bytes),
    situacao: linha.situacao,
  };
}

/**
 * A frase que o agente lê quando a autorização é negada.
 *
 * Ela precisa dizer três coisas, e a segunda é a que importa mais: que o
 * trabalho NÃO se perdeu. Um agente que leia "não foi possível enviar" no meio
 * do morro acredita, com razão, que a manhã inteira foi embora, e o que ele faz
 * a seguir é apagar a coleta e refazer, ou desistir.
 */
export function frasePorTetoEstourado(): string {
  return (
    "O armazenamento deste município passou do limite contratado. A coleta "
    + "continua guardada no aparelho e o envio vai ser tentado sozinho, sem você "
    + "precisar fazer nada: avise a coordenação, que precisa falar com a "
    + "plataforma para ampliar o limite."
  );
}

/**
 * Que fração da margem do município uma pessoa pode ter reservada: um décimo.
 *
 * É a garantia que a H04 pede ("um agente não esgota o teto dos colegas") dita
 * em relação ao contrato, e não só em bytes. Com o padrão de
 * `RESERVA_DE_ENVIO_POR_PESSOA_MB` (90 MB) ela não decide: o menor teto que o
 * banco aceita é 1 GiB (`teto_de_armazenamento_plausivel`, migração 035), e um
 * décimo da margem dele são 153,6 MB. Ela existe para o dia em que alguém
 * configurar aquele número alto demais: dez pessoas com o balde de reservas
 * cheio ao mesmo tempo, sem subir nada, continua sendo o mínimo para ocupar a
 * margem inteira, e isso deixa de ser descuido de um aparelho para ser coisa
 * que a coordenação vê.
 */
export const FRACAO_DA_MARGEM_POR_PESSOA = 10;

/**
 * Quantos bytes de envio uma pessoa pode ter reservados e não concluídos.
 *
 * O MENOR entre o teto configurado (`RESERVA_DE_ENVIO_POR_PESSOA_MB`) e um
 * décimo da margem do município, mas NUNCA menos que uma foto no teto por
 * arquivo: abaixo disso a foto grande ficaria presa no aparelho para sempre,
 * e a fila só para de insistir quando a foto sai. Município sem teto
 * contratado (`margemBytes` nulo, o estado de hoje) fica só com o configurado:
 * lá o balde do município não se esgota, mas a reserva sem fim de uma pessoa
 * passaria a esgotá-lo no dia em que o contrato fixasse número.
 */
export function tetoDeReservasDaPessoa(
  configuradoBytes: number,
  margemBytes: number | null,
  umaFotoNoMaximo: number,
): number {
  const pelaMargem = margemBytes === null
    ? configuradoBytes
    : Math.floor(margemBytes / FRACAO_DA_MARGEM_POR_PESSOA);
  return Math.max(umaFotoNoMaximo, Math.min(configuradoBytes, pelaMargem));
}

/**
 * A frase de quem passou do teto de reservas POR PESSOA.
 *
 * Como a do teto do município, diz primeiro que nada se perdeu: a recusa sai
 * com 429, que a fila do aparelho trata como temporário
 * (`packages/campo/src/transporte.ts`), e a foto sobe sozinha quando as
 * reservas anteriores da pessoa forem concluídas (ou abandonadas pela
 * varredura de órfão). O que ela pede à pessoa é avisar, porque reserva
 * acumulada sem envio quer dizer foto que não chegou.
 */
export function frasePorReservasDaPessoa(): string {
  return (
    "Você tem envios de foto autorizados e ainda não concluídos acima do limite "
    + "por pessoa. A coleta continua guardada no aparelho e o envio vai ser "
    + "tentado de novo sozinho, sem você precisar fazer nada. Se continuar, "
    + "avise a coordenação."
  );
}

/**
 * O recorte que sai pela API.
 *
 * `situacao` vem junto, e não é decoração: sem ela, a tela precisaria comparar
 * bytes com teto por conta própria e reimplementar o limiar, que é a terceira
 * cópia de um número que já tem duas. A frase da tela pendura na palavra.
 */
export function resumirUso(uso: UsoDeArmazenamento): {
  bytesUsados: number;
  tetoBytes: number | null;
  margemBytes: number | null;
  situacao: SituacaoDeArmazenamento;
} {
  return {
    bytesUsados: uso.bytesUsados,
    tetoBytes: uso.tetoBytes,
    margemBytes: uso.margemBytes,
    situacao: uso.situacao,
  };
}
