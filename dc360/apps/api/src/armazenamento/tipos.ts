/**
 * Onde a evidência fotográfica fica guardada.
 *
 * Duas regras governam tudo aqui, e as duas vêm do levantamento técnico:
 *
 * 1. **O arquivo nunca passa pelo servidor.** O aparelho envia direto para o
 *    armazenamento, com uma URL pré-assinada de vida curta. Passar dezenas de
 *    fotos de vistoria por dentro da API significaria pagar banda duas vezes e
 *    derrubar o servidor no dia de temporal, que é justamente quando o sistema
 *    precisa funcionar.
 * 2. **Nunca existe URL pública.** Toda leitura é pré-assinada, com expiração
 *    curta, gerada só depois de conferir permissão. Foto de vistoria mostra a
 *    casa e a rua de uma família em situação de risco.
 */

export type PedidoEnvio = {
  chave: string;
  tipoConteudo: string;
  tamanhoBytes: number;
};

export type Envio = {
  /** Para onde o aparelho manda o PUT. */
  url: string;
  /**
   * Cabeçalhos que o aparelho é OBRIGADO a repetir. Eles entram na
   * assinatura, então o armazenamento recusa o envio se vierem diferentes: é
   * assim que o limite de tamanho é imposto, e não só pedido.
   */
  cabecalhos: Record<string, string>;
  expiraEm: string;
};

export type Armazenamento = {
  /** URL de escrita, válida por poucos minutos. */
  urlParaEnviar(pedido: PedidoEnvio): Promise<Envio>;
  /** URL de leitura, válida por poucos minutos. */
  urlParaLer(chave: string, segundos?: number): Promise<string>;
  /** Confere se o objeto realmente chegou, e com que tamanho. */
  descrever(chave: string): Promise<{ existe: boolean; tamanhoBytes: number | null }>;
  /**
   * Traz os bytes PARA DENTRO do servidor.
   *
   * Isto contraria a regra 1 lá de cima de propósito, e o lugar onde a exceção
   * vale é um só: a exportação de saída de município. Ali o destino do arquivo
   * não é um navegador (que poderia buscar direto, com URL assinada), é um
   * pacote único que o município leva embora, e não existe como montar esse
   * pacote sem os bytes passarem por aqui.
   *
   * A exceção é aceitável porque o ato é raro (uma vez na vida do contrato),
   * exige administrador e deixa trilha. Não use isto para servir foto na tela:
   * lá continua valendo a URL assinada, senão o servidor paga a banda de toda
   * vistoria aberta e cai no dia de temporal.
   */
  baixar(chave: string): Promise<ResultadoDeLeitura>;
};

/**
 * O que aconteceu ao tentar ler um objeto, e por que são TRÊS situações e não
 * duas.
 *
 * Isto já foi `objeto | null`, e o `null` juntava numa coisa só duas coisas
 * opostas: "este arquivo não existe" e "eu não consegui ler este arquivo". O
 * `baixar` do S3 fazia `.catch(() => null)` e devolvia `null` para erro de
 * rede, DNS, conexão cortada, 429 de limite de taxa e 503 do provedor, e o
 * pacote de saída imprimia todos eles sob o texto "O banco referia estes
 * arquivos e eles NÃO foram encontrados no armazenamento".
 *
 * O cenário que isso produz é o pior dia possível do produto. Um município com
 * três anos pede a saída; o pacote faz milhares de GET assinados seguidos; o
 * provedor devolve 429 em quarenta deles. Quarenta fotografias que EXISTEM
 * saem declaradas inexistentes, com soma de verificação ao lado dando
 * aparência de conferência feita, e o passo 6 do procedimento (a eliminação
 * das nossas cópias) acontece depois disso, sem volta. É destruição de prova
 * por engolir erro, no dia em que o produto está provando que não aprisiona
 * ninguém.
 */
export type ResultadoDeLeitura =
  | { situacao: "encontrado"; corpo: Uint8Array; tipoConteudo: string | null }
  /** O armazenamento respondeu, e respondeu que o objeto não está lá. */
  | { situacao: "ausente" }
  /**
   * Ninguém conseguiu dizer se o objeto existe. Quem recebe isto NÃO PODE
   * escrever "não encontrado": precisa dizer que não conseguiu ler, e o que
   * houve.
   */
  | { situacao: "falha"; motivo: string; tentativas: number };

/** Tipos aceitos. Lista fechada: o que não está aqui não sobe. */
export const TIPOS_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

/**
 * Teto por arquivo. Foto de celular moderno passa dos 5 MB com facilidade, e
 * 15 MB cobre o caso de câmera boa sem abrir espaço para alguém usar o balde
 * do município como disco pessoal.
 */
export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

export function tipoAceito(tipo: string): tipo is TipoAceito {
  return (TIPOS_ACEITOS as readonly string[]).includes(tipo);
}
