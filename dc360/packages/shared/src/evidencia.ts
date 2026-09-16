import { z } from "zod";
import { uuidSchema } from "./schemas.js";

/**
 * O contrato do ARQUIVO de evidência (fotografia e traço da assinatura), nas
 * duas pontas.
 *
 * Isto morava só na rota `POST /evidencias/autorizar-envio`, e o preço de
 * morar só lá apareceu em produção em 15/09/2026: o aparelho concluiu a
 * vistoria 000009/2026, gravou a coleta, disse "ela sobe sozinha", e a fila
 * pediu a autorização da fotografia três vezes. Três vezes 422. O aparelho
 * produzia dois valores que o servidor recusa por contrato:
 *
 *   - `tamanhoBytes: 0`, porque o tamanho vinha de `File.size ?? 0`, e o
 *     `size` da API nova do `expo-file-system` é documentado como "0 se o
 *     arquivo não existe ou não pôde ser lido". Zero era enviado como se
 *     fosse tamanho.
 *   - `idempotencyKey: "<chave-da-coleta>-assinatura"` no traço, que não é
 *     UUID.
 *
 * A regra é uma só e mora aqui: o aparelho confere ANTES de enfileirar
 * exatamente o que o servidor confere na chegada, com a mesma frase. Se a
 * conferência só existisse na tela, ela não existiria; se só existisse na
 * rota, o agente descobriria no morro, pela fila, sem ter como agir.
 */

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

/**
 * A folga de relógio, em milissegundos, e o piso de datas.
 *
 * Cópia deliberada de `coletada_em_plausivel` (migração 009), que instalou
 * exatamente esta regra no campo IRMÃO desta foto. `vistorias.coletada_em` e
 * `evidencias.capturada_em` saem impressos no MESMO documento, um como data do
 * ato e outro como data do registro fotográfico.
 *
 * As doze horas para frente não são desleixo: relógio trocado, fuso errado e
 * aparelho sem sinal por horas são rotina em campo, e recusar uma evidência
 * legítima em dia de temporal é pior do que aceitar uma hora imprecisa. Quem
 * resolve a precisão é `enviada_em`, que é do servidor e ninguém escolhe.
 *
 * A mesma regra está no banco (migração 024). Aqui ela existe para a resposta
 * ser 422 com explicação, e não 500 vindo de uma restrição de CHECK.
 */
export const FOLGA_DE_RELOGIO_MS = 12 * 60 * 60 * 1000;
export const PISO_DE_CAPTURA = Date.parse("2020-01-01T00:00:00Z");

export function capturaPlausivel(iso: string): boolean {
  const instante = Date.parse(iso);
  return Number.isFinite(instante)
    && instante > PISO_DE_CAPTURA
    && instante < Date.now() + FOLGA_DE_RELOGIO_MS;
}

/**
 * O pedido de autorização de envio de um arquivo, como a rota o recebe e como
 * o aparelho o monta.
 *
 * As mensagens são em português de propósito. Elas viajam no 422 (`campos`),
 * aparecem no cartão da fila do aparelho e na lista "corrija antes de
 * concluir" da tela de vistoria, e quem as lê está em pé na rua.
 */
export const pedidoDeEvidenciaSchema = z.object({
  ocorrenciaId: uuidSchema,
  /**
   * Gerada no aparelho no momento da captura. Pedir autorização duas vezes
   * para a mesma foto é o caso comum, não a exceção: o sinal cai entre
   * autorizar e enviar, a URL vence esperando a rede, o aplicativo é fechado
   * no meio. Sem a chave, cada tentativa deixaria uma linha órfã.
   */
  idempotencyKey: z.string()
    .uuid("A chave de envio deste arquivo precisa ser um UUID.")
    .optional(),
  nomeArquivo: z.string()
    .min(1, "Informe o nome do arquivo.")
    .max(200, "O nome do arquivo passa de 200 caracteres."),
  tipoConteudo: z.enum(TIPOS_ACEITOS, {
    errorMap: () => ({
      message: "Tipo de arquivo não aceito: só entram JPEG, PNG, WebP e HEIC.",
    }),
  }),
  tamanhoBytes: z.number({
    invalid_type_error: "O tamanho do arquivo precisa ser um número de bytes.",
    required_error: "O tamanho do arquivo não foi informado.",
  })
    .int("O tamanho do arquivo precisa ser um número inteiro de bytes.")
    /*
      Zero é arquivo perdido, nunca um tamanho. Um arquivo de zero bytes não é
      fotografia nem assinatura, e o aparelho que chega aqui com zero não mediu
      nada: ele não achou o arquivo.
    */
    .positive("O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele.")
    .max(TAMANHO_MAXIMO_BYTES, "O arquivo passa de 15 MB, que é o teto por arquivo."),
  legenda: z.string().max(300, "A legenda passa de 300 caracteres.").optional(),
  capturadaEm: z.string()
    .datetime("A data de captura precisa estar no formato ISO 8601.")
    .refine(capturaPlausivel, {
      message:
        "A data de captura não é plausível: precisa ser posterior a 2020 e não "
        + "pode estar a mais de doze horas no futuro.",
    }),
  coordenada: z.object({ lat: z.number(), lng: z.number() }).optional(),
  ordem: z.number()
    .int("A ordem da fotografia precisa ser um número inteiro.")
    .min(0, "A ordem da fotografia não pode ser negativa.")
    .max(200, "Uma vistoria não pode ter mais de 200 fotografias.")
    .default(0),
});

export type PedidoDeEvidencia = z.infer<typeof pedidoDeEvidenciaSchema>;
/** O pedido como ENTRA, antes dos valores padrão. */
export type PedidoDeEvidenciaBruto = z.input<typeof pedidoDeEvidenciaSchema>;
