import {
  envelopeSincronizacaoSchema,
  pedidoDeEvidenciaSchema,
  type EnvelopeSincronizacao,
  type PedidoDeEvidenciaBruto,
} from "@dc360/shared";
import type { FalhaRegistrada, FotoLocal } from "./tipos.js";

/**
 * A conferência que o aparelho faz ANTES de enfileirar, com os esquemas do
 * servidor.
 *
 * Existe por causa da vistoria 000009/2026, em 15/09/2026. O agente concluiu no
 * iPhone, a tela disse "ela sobe sozinha", e a coleta foi para a fila com a
 * fotografia em `tamanhoBytes: 0` e a assinatura com chave fora de UUID. O
 * servidor recusou a fotografia três vezes com 422, a fila marcou "precisa de
 * atenção", e a única saída na tela era descartar uma vistoria feita no local.
 *
 * O aparelho tinha uma lista do que falta (`faltaParaConcluir`), e ela responde
 * outra pergunta: "o agente terminou de preencher?". A pergunta daqui é "o
 * servidor vai aceitar o que ele preencheu?", e a única forma honesta de
 * responder é perguntar ao MESMO esquema que o servidor usa. Duas listas para o
 * mesmo fato divergem na primeira pressa, e foi exatamente isso que aconteceu:
 * a tela achava que estava tudo pronto e a rota achava que não.
 *
 * Nada aqui é regra nova. É a regra do pacote compartilhado, aplicada mais cedo.
 */

export type CampoRecusado = { campo: string; mensagem: string };

export type ConferenciaDaColeta =
  | { aprovada: true }
  | { aprovada: false; campos: CampoRecusado[] };

/**
 * O corpo do pedido de autorização, montado a partir da foto local.
 *
 * É UMA função para as duas pontas do aparelho: o transporte manda exatamente
 * isto ao servidor, e a conferência acima valida exatamente isto. Se cada um
 * montasse o seu, a conferência aprovaria um pedido e o transporte enviaria
 * outro, que é a divergência que este arquivo existe para impedir.
 */
export function pedidoDeEvidenciaDaFoto(
  ocorrenciaId: string,
  foto: FotoLocal,
  coletadaPor?: string,
): PedidoDeEvidenciaBruto {
  return {
    ocorrenciaId,
    idempotencyKey: foto.idempotencyKey,
    nomeArquivo: foto.nomeArquivo,
    tipoConteudo: foto.tipoConteudo as PedidoDeEvidenciaBruto["tipoConteudo"],
    tamanhoBytes: foto.tamanhoBytes,
    capturadaEm: foto.capturadaEm,
    ...(foto.legenda !== undefined ? { legenda: foto.legenda } : {}),
    ...(foto.coordenada !== undefined ? { coordenada: foto.coordenada } : {}),
    ordem: foto.ordem,
    // Ausente (e não nulo) quando a coleta não tem autor: ver `Transporte.autorizarFoto`.
    ...(coletadaPor !== undefined ? { coletadaPor } : {}),
  };
}

function camposDe(
  resultado: { success: true } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } },
  prefixo: string,
): CampoRecusado[] {
  if (resultado.success) return [];
  return resultado.error.issues.map((i) => ({
    campo: [prefixo, ...i.path.map(String)].filter((p) => p !== "").join("."),
    mensagem: i.message,
  }));
}

/**
 * Confere o envelope e cada arquivo com os esquemas do servidor.
 *
 * Os caminhos dizem ONDE está o problema, e não só qual campo: `fotos.2.tamanhoBytes`
 * e `assinatura.idempotencyKey` separam a terceira fotografia da assinatura,
 * que é o que a tela precisa para levar o dedo até a seção certa. Os do
 * envelope saem como o servidor os devolveria (`vistoria.assinanteNome`), sem
 * prefixo a mais, porque é a mesma lista que o cartão da fila já sabe ler.
 */
export function conferirColeta(coleta: {
  envelope: EnvelopeSincronizacao;
  fotos: ReadonlyArray<FotoLocal>;
  assinatura?: FotoLocal;
}): ConferenciaDaColeta {
  const campos: CampoRecusado[] = [
    ...camposDe(envelopeSincronizacaoSchema.safeParse(coleta.envelope), ""),
    ...coleta.fotos.flatMap((f, i) => camposDe(
      pedidoDeEvidenciaSchema.safeParse(pedidoDeEvidenciaDaFoto(coleta.envelope.ocorrenciaId, f)),
      `fotos.${i}`,
    )),
    ...(coleta.assinatura
      ? camposDe(
        pedidoDeEvidenciaSchema.safeParse(
          pedidoDeEvidenciaDaFoto(coleta.envelope.ocorrenciaId, coleta.assinatura),
        ),
        "assinatura",
      )
      : []),
  ];
  return campos.length === 0 ? { aprovada: true } : { aprovada: false, campos };
}

/**
 * Códigos de falha permanente em que o problema está no DADO da coleta, e
 * corrigir a vistoria é o que resolve.
 *
 * A distinção decide qual botão é o principal no cartão da fila. "Tentar de
 * novo" em cima de um 422 não faz sentido algum (palavras do dono do produto,
 * com a tela na mão): o servidor vai recusar igual. Já `sem_sessao` (entrar de
 * novo resolve) e `nao_encontrada` (a coordenação pode mexer na ocorrência)
 * não são do dado: repetir pode dar certo sem mudar uma vírgula.
 *
 * `dados_invalidos` é o `erro` que `servidor.ts` põe em todo 422. `arquivo_sumiu`
 * entra porque a saída dele passa pela tela de vistoria (tirar a foto de novo)
 * ou pela decisão de enviar sem o arquivo, nunca por repetir.
 */
export const CODIGOS_DE_DADO_RECUSADO = ["dados_invalidos", "arquivo_sumiu"] as const;

export function recusaEstaNoDado(falha: FalhaRegistrada | null | undefined): boolean {
  if (!falha) return false;
  if ((CODIGOS_DE_DADO_RECUSADO as readonly string[]).includes(falha.codigo)) return true;
  // Um 4xx que trouxe a lista de campos é recusa de dado mesmo sem o código
  // canônico: a lista só existe quando o servidor apontou o que corrigir.
  return falha.campos.length > 0;
}
