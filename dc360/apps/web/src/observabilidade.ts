import { mascararDadoPessoal } from "@dc360/shared";

/**
 * O registro de erros globais do painel (V2-F01-E14).
 *
 * Erro que nenhum componente tratou (exceção solta, promessa rejeitada sem
 * `catch`) chega aqui em vez de sumir. Hoje o único destino é o console do
 * navegador: não há envio a ferramenta externa até o CP-06 decidir qual e onde
 * o dado mora, e por isso nada daqui faz chamada de rede.
 *
 * O QUE O REGISTRO LEVA: o tipo do erro, a mensagem MASCARADA (e-mail, telefone,
 * CPF, coordenada e token trocados por marcador) e, se o erro veio da API, o
 * código de suporte. O QUE NÃO LEVA: pilha, endereço da página (a barra de
 * endereço do painel carrega identificador de ocorrência), corpo de pedido.
 * ErrorBoundary de componente é a F10-E10, fora desta etapa.
 */

export type OrigemDoErroDoPainel = "janela" | "promessa";

export interface RegistroDeErroDoPainel {
  origem: OrigemDoErroDoPainel;
  tipo: string;
  mensagem: string;
  requisicao: string | null;
}

export interface ReportadorDoPainel {
  reportar(erro: unknown, origem: OrigemDoErroDoPainel): void;
}

/** Descreve o que foi lançado sem confiar no formato: pode ser qualquer valor. */
export function descreverErroDoPainel(
  erro: unknown,
  origem: OrigemDoErroDoPainel,
): RegistroDeErroDoPainel {
  if (erro instanceof Error) {
    const requisicao = (erro as { requisicao?: unknown }).requisicao;
    return {
      origem,
      tipo: erro.name,
      mensagem: mascararDadoPessoal(erro.message),
      requisicao: typeof requisicao === "string" ? requisicao : null,
    };
  }
  return {
    origem,
    tipo: "valor lançado que não é um Error",
    mensagem: typeof erro === "string" ? mascararDadoPessoal(erro) : "",
    requisicao: null,
  };
}

export function reportadorDeConsole(saida: Pick<Console, "error"> = console): ReportadorDoPainel {
  return {
    reportar(erro, origem) {
      saida.error("[painel] erro não tratado", descreverErroDoPainel(erro, origem));
    },
  };
}

/** O pedaço da janela que o registro usa; o teste passa um duplo. */
export interface AlvoDeErrosGlobais {
  addEventListener(tipo: "error", ouvinte: (evento: ErrorEvent) => void): void;
  addEventListener(
    tipo: "unhandledrejection",
    ouvinte: (evento: PromiseRejectionEvent) => void,
  ): void;
}

export function instalarErrosGlobais(
  alvo: AlvoDeErrosGlobais,
  reportador: ReportadorDoPainel = reportadorDeConsole(),
): void {
  alvo.addEventListener("error", (evento) => {
    // `evento.error` é o objeto lançado; quando o navegador esconde (script de
    // outra origem) só resta `message`, que passa pela mesma máscara.
    reportador.reportar(evento.error ?? evento.message, "janela");
  });
  alvo.addEventListener("unhandledrejection", (evento) => {
    reportador.reportar(evento.reason, "promessa");
  });
}
