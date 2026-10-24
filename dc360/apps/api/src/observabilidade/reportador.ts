import { mascararDadoPessoal } from "@dc360/shared";
import { filtrarEventoParaTerceiros } from "./filtro.js";

/**
 * A porta por onde todo erro inesperado da API passa (V2-F01-E14).
 *
 * O desenho: o código do produto fala com `ReportadorDeErros` e não sabe para
 * onde o erro vai. Hoje o único destino é o log em nível `error`. No dia em que
 * o CP-06 decidir a ferramenta e a residência do dado (K13 e J7), o destino
 * externo entra como a função `enviar` de `criarReportador`, passando pelo
 * `filtrarEventoParaTerceiros`, sem tocar em rota nenhuma. Enquanto isso não
 * for decidido NÃO há SDK nem chamada de rede aqui: mandar erro a um terceiro
 * antes da decisão jurídica seria subprocessador novo sem aviso.
 */

/**
 * O nível de uma linha de log de rotina agendada. `error` é falha, e é o único
 * que o alerta do destino de logs deve acordar alguém por causa.
 */
export type NivelDoRegistro = "info" | "warn" | "error";

/** De onde o erro veio: uma requisição, uma rotina agendada ou o processo. */
export type OrigemDoErro = "http" | "rotina" | "processo";

export interface ContextoDoErro {
  origem: OrigemDoErro;
  /** O id da requisição (UUID): é o código de suporte que a pessoa informa. */
  requisicao?: string;
  metodo?: string;
  /** O MOLDE da rota (`/ocorrencias/:id`), nunca a barra de endereço. */
  rota?: string;
  status?: number;
  /** Nome da rotina, quando `origem` é `rotina`. */
  rotina?: string;
}

export interface ReportadorDeErros {
  reportar(erro: unknown, contexto: ContextoDoErro): void;
}

/** O pedaço do logger do Fastify que o reportador usa. */
export interface RegistroDeErro {
  error(objeto: Record<string, unknown>, mensagem: string): void;
}

/** O evento no formato de entrada do Sentry (campos que usamos). */
export type EventoDeErro = Record<string, unknown>;

/**
 * Uma cópia do erro com mensagem e pilha mascaradas. Mensagem de exceção é texto
 * que o produto não escreveu e pode ecoar o que a pessoa digitou; o serializador
 * `err` do Fastify já corta o `detail` do `pg`, e isto cobre o resto.
 */
function erroMascarado(erro: unknown): Error {
  if (!(erro instanceof Error)) {
    return new Error(
      mascararDadoPessoal(typeof erro === "string" ? erro : "valor lançado que não é um Error"),
    );
  }
  const copia = new Error(mascararDadoPessoal(erro.message));
  copia.name = erro.name;
  if (erro.stack) copia.stack = mascararDadoPessoal(erro.stack);
  const bruto = erro as unknown as Record<string, unknown>;
  const alvo = copia as unknown as Record<string, unknown>;
  for (const chave of ["code", "constraint", "table", "statusCode"]) {
    const valor = bruto[chave];
    if (typeof valor === "string" || typeof valor === "number") alvo[chave] = valor;
  }
  return copia;
}

/** Monta o evento (formato Sentry) que o destino externo receberia, já mascarado. */
export function montarEvento(erro: unknown, contexto: ContextoDoErro): EventoDeErro {
  const seguro = erroMascarado(erro);
  const etiquetas: Record<string, string> = { origem: contexto.origem };
  if (contexto.requisicao) etiquetas["requisicao"] = contexto.requisicao;
  if (contexto.rotina) etiquetas["rotina"] = contexto.rotina;
  // `http_status` e não `status`: a varredura de códigos de erro de acesso lê o
  // nome `status` em qualquer forma e não sabe que isto é uma etiqueta.
  if (contexto.status !== undefined) etiquetas["http_status"] = String(contexto.status);
  return {
    level: "error",
    message: seguro.message,
    exception: {
      values: [
        {
          type: seguro.name,
          value: seguro.message,
          ...(seguro.stack ? { stacktrace: seguro.stack } : {}),
        },
      ],
    },
    tags: etiquetas,
    ...(contexto.metodo || contexto.rota
      ? {
          request: {
            ...(contexto.metodo ? { method: contexto.metodo } : {}),
            ...(contexto.rota ? { route: contexto.rota } : {}),
          },
        }
      : {}),
  };
}

/**
 * O reportador do produto: log em `error` sempre, e destino externo se houver.
 *
 * O destino externo NUNCA derruba quem reporta: erro dentro do `enviar` é
 * engolido com uma linha de log. Reportar o erro não pode produzir outro.
 */
export function criarReportador({
  log,
  enviar,
}: {
  log: RegistroDeErro;
  enviar?: (evento: EventoDeErro) => void;
}): ReportadorDeErros {
  return {
    reportar(erro, contexto) {
      const { origem, requisicao, metodo, rota, status, rotina } = contexto;
      log.error(
        {
          err: erroMascarado(erro),
          origem,
          ...(requisicao ? { requisicao } : {}),
          ...(metodo ? { metodo } : {}),
          ...(rota ? { rota } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(rotina ? { rotina } : {}),
        },
        "erro nao tratado",
      );
      if (!enviar) return;
      try {
        enviar(filtrarEventoParaTerceiros(montarEvento(erro, contexto)));
      } catch {
        log.error({ origem: "processo" }, "o destino externo de erros falhou ao receber o evento");
      }
    },
  };
}
