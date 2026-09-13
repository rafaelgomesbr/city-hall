import type { DevolucaoDeTarefa, EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente, FalhaTemporaria,
  type AutorizacaoFoto, type Recibo, type ReciboDeDevolucao, type Transporte,
} from "./tipos.js";

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

/**
 * Traduz uma resposta recusada numa falha que a fila sabe explicar.
 *
 * Existe em um lugar so de proposito. Antes a classificacao estava escrita
 * duas vezes, no `chamar` e no `enviar`, e as duas copias liam apenas
 * `mensagem` e `erro`. A lista `campos`, que o servidor sempre mandou no 422 e
 * que e a unica parte da resposta que diz QUAL campo esta errado, era lida e
 * descartada na mesma linha. Duas copias tambem sao duas chances de divergir.
 */
function falhaDaResposta(status: number, corpo: Record<string, unknown>): FalhaPermanente {
  const brutos = Array.isArray(corpo["campos"]) ? corpo["campos"] : [];
  const campos = brutos
    .filter((c): c is { campo: string; mensagem: string } =>
      typeof c === "object" && c !== null
      && typeof (c as { campo?: unknown }).campo === "string"
      && typeof (c as { mensagem?: unknown }).mensagem === "string")
    .map((c) => ({ campo: c.campo, mensagem: c.mensagem }));

  return new FalhaPermanente(
    String(corpo["mensagem"] ?? `O servidor recusou o envio (${status}).`),
    String(corpo["erro"] ?? `http_${status}`),
    campos,
  );
}

export function transporteHttp(opcoes: OpcoesTransporte): Transporte {
  const { baseUrl, obterToken, buscar = fetch, tempoLimiteMs = 30_000 } = opcoes;
  const base = baseUrl.replace(/\/$/, "");

  /**
   * Uma chamada, com token, tempo limite e a mesma traducao de erro para
   * todas as rotas da API. Centralizar isso evita que uma rota nova classifique
   * um 503 como permanente por descuido e faca a fila descartar coleta.
   */
  async function chamar<T>(
    caminho: string,
    corpo: unknown,
    metodo = "POST",
  ): Promise<T> {
    const token = await obterToken();
    if (!token) {
      throw new FalhaPermanente("Sessao encerrada. Entre novamente para sincronizar.", "sem_sessao");
    }

    const cancelador = new AbortController();
    const relogio = setTimeout(() => cancelador.abort(), tempoLimiteMs);

    let resposta: Response;
    try {
      resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: cancelador.signal,
      });
    } catch (erro) {
      throw new FalhaTemporaria("Sem conexao com o servidor.", erro);
    } finally {
      clearTimeout(relogio);
    }

    if (resposta.ok) return (await lerCorpo(resposta)) as T;

    if (resposta.status >= 500 || resposta.status === 429) {
      throw new FalhaTemporaria(`Servidor indisponivel (${resposta.status}).`);
    }

    throw falhaDaResposta(resposta.status, await lerCorpo(resposta));
  }

  return {
    async autorizarFoto({ ocorrenciaId, foto }): Promise<AutorizacaoFoto> {
      const r = await chamar<{
        evidenciaId: string; chave: string; url: string;
        cabecalhos: Record<string, string>; jaEnviada: boolean;
      }>("/evidencias/autorizar-envio", {
        ocorrenciaId,
        idempotencyKey: foto.idempotencyKey,
        nomeArquivo: foto.nomeArquivo,
        tipoConteudo: foto.tipoConteudo,
        tamanhoBytes: foto.tamanhoBytes,
        capturadaEm: foto.capturadaEm,
        legenda: foto.legenda,
        coordenada: foto.coordenada,
        ordem: foto.ordem,
      });
      return r;
    },

    /**
     * Os bytes vao direto para o armazenamento, sem passar pela API e sem
     * token: quem autoriza e a assinatura embutida na URL, que vence em
     * minutos. Os cabecalhos sao repetidos como vieram porque entram nessa
     * assinatura: mudar um invalida a URL.
     */
    async enviarBytes(url, cabecalhos, corpo): Promise<void> {
      const cancelador = new AbortController();
      // Foto e maior que payload de negocio, e rede de campo e lenta: o tempo
      // limite aqui precisa ser mais generoso que o das outras chamadas.
      const relogio = setTimeout(() => cancelador.abort(), tempoLimiteMs * 4);

      let resposta: Response;
      try {
        resposta = await buscar(url, {
          method: "PUT",
          headers: cabecalhos,
          body: corpo,
          signal: cancelador.signal,
        });
      } catch (erro) {
        throw new FalhaTemporaria("Sem conexao com o armazenamento.", erro);
      } finally {
        clearTimeout(relogio);
      }

      if (resposta.ok) return;

      if (resposta.status >= 500 || resposta.status === 429) {
        throw new FalhaTemporaria(`Armazenamento indisponivel (${resposta.status}).`);
      }
      // 403 aqui costuma ser URL vencida, e a proxima tentativa pede outra.
      if (resposta.status === 403) {
        throw new FalhaTemporaria("A autorizacao de envio venceu.");
      }
      throw new FalhaPermanente(
        `O armazenamento recusou o arquivo (${resposta.status}).`,
        `storage_${resposta.status}`,
      );
    },

    async confirmarFoto(evidenciaId: string): Promise<void> {
      await chamar("/evidencias/confirmar-envio", { evidenciaId });
    },

    /**
     * A devolução da tarefa vencida.
     *
     * Passa por `chamar`, e não por uma cópia da tradução de erro como o
     * `enviar` abaixo faz: é ali que 5xx e 429 viram falha temporária e o
     * 4xx vira permanente com código e campos. Uma segunda cópia dessa regra
     * seria a que classifica um 503 como permanente por descuido, e nesta rota
     * isso significaria a tarefa voltar para a lista do agente porque o
     * servidor estava reiniciando.
     *
     * `duplicada` vem do servidor: a devolução é idempotente por chave (a
     * migração 028 impõe isso), e o reenvio da fila responde o resultado da
     * primeira vez.
     */
    async devolver(devolucao: DevolucaoDeTarefa): Promise<ReciboDeDevolucao> {
      const r = await chamar<{ duplicada?: boolean }>("/sincronizacao/devolucao", devolucao);
      return { duplicada: Boolean(r["duplicada"]) };
    },

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
