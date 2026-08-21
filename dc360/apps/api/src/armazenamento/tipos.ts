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
};

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
