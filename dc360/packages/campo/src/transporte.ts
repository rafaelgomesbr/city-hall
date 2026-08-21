import type { EnvelopeSincronizacao } from "@dc360/shared";
import { FalhaPermanente, FalhaTemporaria, type Recibo, type Transporte } from "./tipos.js";

/**
 * Transporte HTTP contra a API.
 *
 * A tradução de resposta em tipo de falha acontece aqui, e é a decisão que
 * governa o comportamento inteiro da fila:
 *
 * - Rede indisponível, tempo esgotado, 5xx, 429: temporário. A rua tem sombra
 *   de sinal, o servidor reinicia em deploy. Insistir resolve.
 * - 400, 403, 404, 409, 422: permanente. Dado inválido, papel sem permissão,
 *   ocorrência já encerrada. Insistir só gasta bateria e enche o log.
 * - 401: permanente TAMBÉM, e de propósito. Sessão expirada não se resolve
 *   repetindo o envio, se resolve entrando de novo. Reenviar em laço com
 *   token morto é o caminho mais rápido para bloquear a conta do agente pelo
 *   limite de tentativas.
 */
export type OpcoesTransporte = {
  baseUrl: string;
  /** Buscado a cada envio: entre uma tentativa e outra o token pode ter mudado. */
  obterToken: () => Promise<string | null>;
  buscar?: typeof fetch;
  tempoLimiteMs?: number;
};

/** Corpo que não é JSON não deve derrubar o envio: vira objeto vazio. */
async function lerCorpo(resposta: Response): Promise<Record<string, unknown>> {
  try {
    const corpo: unknown = await resposta.json();
    return typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function transporteHttp(opcoes: OpcoesTransporte): Transporte {
  const { baseUrl, obterToken, buscar = fetch, tempoLimiteMs = 30_000 } = opcoes;
  const base = baseUrl.replace(/\/$/, "");

  return {
    async enviar(envelope: EnvelopeSincronizacao): Promise<Recibo> {
      const token = await obterToken();
      if (!token) {
        throw new FalhaPermanente("Sessão encerrada. Entre novamente para sincronizar.", "sem_sessao");
      }

      const cancelador = new AbortController();
      const relogio = setTimeout(() => cancelador.abort(), tempoLimiteMs);

      let resposta: Response;
      try {
        resposta = await buscar(`${base}/sincronizacao/vistoria`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(envelope),
          signal: cancelador.signal,
        });
      } catch (erro) {
        // Rede fora, DNS falhando, tempo esgotado: tudo isso melhora sozinho.
        throw new FalhaTemporaria("Sem conexão com o servidor.", erro);
      } finally {
        clearTimeout(relogio);
      }

      if (resposta.ok) {
        const corpo = await lerCorpo(resposta);
        return {
          vistoriaId: String(corpo["vistoriaId"] ?? ""),
          duplicada: Boolean(corpo["duplicada"]),
        };
      }

      if (resposta.status >= 500 || resposta.status === 429) {
        throw new FalhaTemporaria(`Servidor indisponível (${resposta.status}).`);
      }

      const corpo = await lerCorpo(resposta);
      throw new FalhaPermanente(
        String(corpo["mensagem"] ?? `O servidor recusou o envio (${resposta.status}).`),
        String(corpo["erro"] ?? `http_${resposta.status}`),
      );
    },
  };
}
