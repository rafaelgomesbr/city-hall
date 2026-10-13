import {
  CODIGOS_DE_ERRO_DE_ACESSO, acaoParaOCodigo,
  type DevolucaoDeTarefa, type EnvelopeSincronizacao,
} from "@dc360/shared";
import { pedidoDeEvidenciaDaFoto } from "./conferencia.js";
import {
  FalhaDeSessao, FalhaPermanente, FalhaTemporaria,
  type AutorizacaoFoto, type MotivoDeSessao, type ObterToken, type Recibo,
  type ReciboDeDevolucao, type Transporte,
} from "./tipos.js";

/**
 * Transporte HTTP contra a API.
 *
 * A tradução de resposta em tipo de falha acontece aqui, e é a decisão que
 * governa o comportamento inteiro da fila:
 *
 * - Rede indisponível, tempo esgotado, 5xx, 429: temporário. A rua tem sombra
 *   de sinal, o servidor reinicia em deploy. Insistir resolve.
 * - 400, 403 `sem_permissao`, 404, 409, 422: permanente. Dado inválido, papel
 *   sem permissão, ocorrência já encerrada. Insistir só gasta bateria e enche
 *   o log.
 * - 401 e 403 DE SESSÃO ou de conta: nem temporário nem permanente, e sim
 *   `FalhaDeSessao` (V2-F00-E06). A decisão é pelo CÓDIGO do catálogo
 *   (`@dc360/shared`, `codigos-de-erro.ts`), e não pelo status:
 *     - 401 `nao_autenticado` (token vencido ou ilegível): pede UM token novo e
 *       repete o pedido, uma vez. Se o token não mudou ou o pedido falha de
 *       novo, vira `sessao_encerrada`. Repetir sem limite contra um servidor
 *       que disse não é o laço que bloqueia a conta de quem está trabalhando.
 *     - 401 `sessao_encerrada`: a pessoa entra de novo, e a fila espera.
 *     - 403 `conta_desativada`: entrar de novo não resolve, e a fila espera a
 *       coordenação.
 *     - 403 `troca_de_senha_obrigatoria`: a pessoa entrou com a senha
 *       provisória e precisa defini-la; a fila espera ela fazer isso. Foi o
 *       código que a rodada 1 da validação provou cair em permanente e bloquear
 *       toda a fila (correção 1).
 *     - 403 `acesso_suspenso`: o contrato do município; temporário, a coleta
 *       espera.
 *   Nos casos de sessão e de conta a fila para e MANTÉM o item pendente. Até a E06 isso era
 *   `FalhaPermanente`: o item virava `bloqueado` com "Descartar" ao lado, e a
 *   vistoria feita no morro por quem foi desativado (ou cuja sessão caiu) ficava
 *   marcada como recusada.
 *   O 401 sem código reconhecido (corpo vazio, servidor antigo) segue o mesmo
 *   caminho do `nao_autenticado`: na dúvida entre perder coleta e pausar, pausa.
 */
export type OpcoesTransporte = {
  baseUrl: string;
  /**
   * Buscado a cada envio: entre uma tentativa e outra o token pode ter mudado.
   * Com `{ renovarJa: true }` é o pedido de um token novo depois de um 401
   * `nao_autenticado` (ver `ObterToken`).
   */
  obterToken: ObterToken;
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
 *
 * A falha de SESSAO sai daqui pelo mesmo motivo: e o unico lugar que diz qual
 * resposta e da sessao e qual e do dado. Quando chega aqui um 401, o caminho
 * de renovar e repetir ja foi percorrido (ou o servidor ja disse que a sessao
 * foi encerrada), entao ele e `sessao_encerrada` sem mais perguntas.
 */
function falhaDaResposta(
  status: number,
  corpo: Record<string, unknown>,
): FalhaPermanente | FalhaDeSessao | FalhaTemporaria {
  if (status === 401) return falhaDeSessao("sessao_encerrada", corpo);
  if (status === 403) {
    /*
      O 403 é lido pela AÇÃO que o catálogo manda o cliente tomar, e não por
      uma lista de códigos escrita aqui: foi uma lista que deixou
      `troca_de_senha_obrigatoria` cair em `FalhaPermanente` e bloquear a fila
      inteira (correção 1 da E06). Toda ação do catálogo, menos `nenhuma`
      (`sem_permissao`, que é do PAPEL e continua recusa do dado), é um estado da
      CONTA ou do CONTRATO, e nunca da coleta.
    */
    const acao = acaoParaOCodigo(corpo["erro"]);
    if (acao === "parar_e_avisar") return falhaDeSessao("conta_desativada", corpo);
    if (acao === "trocar_a_senha") return falhaDeSessao("troca_de_senha_obrigatoria", corpo);
    /*
      A suspensão do contrato: a API já responde 503 nas rotas da fila (que o
      cliente trata como temporário), e este ramo é a defesa em profundidade
      para o dia em que um 403 `acesso_suspenso` chegar a elas. A coleta espera
      o contrato voltar; bloqueá-la convidaria a apagar prova por um problema
      que não é dela.
    */
    if (acao === "aguardar_o_contrato") {
      return new FalhaTemporaria(String(corpo["mensagem"] ?? "O acesso está suspenso."));
    }
  }

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

/** A frase do servidor quando veio, e a do catalogo quando nao veio. */
function falhaDeSessao(
  motivo: MotivoDeSessao,
  corpo: Record<string, unknown> = {},
): FalhaDeSessao {
  const doServidor = corpo["mensagem"];
  return new FalhaDeSessao(
    typeof doServidor === "string" && doServidor !== ""
      ? doServidor
      : CODIGOS_DE_ERRO_DE_ACESSO[motivo].mensagem,
    motivo,
  );
}

export function transporteHttp(opcoes: OpcoesTransporte): Transporte {
  const { baseUrl, obterToken, buscar = fetch, tempoLimiteMs = 30_000 } = opcoes;
  const base = baseUrl.replace(/\/$/, "");

  /**
   * Um pedido com token, tempo limite e a renovacao de uma vez so.
   *
   * Devolve a resposta (ok ou nao) e, quando ja precisou ler o corpo para
   * decidir, o corpo lido: o corpo de uma resposta so se le uma vez.
   *
   * Sem token e `FalhaDeSessao`, e nao `FalhaPermanente` como era
   * (`sem_sessao`): a pessoa nao tem sessao aberta agora, e a coleta que ela
   * fez antes de a sessao cair nao e uma coleta recusada. Nem chega a sair
   * pela rede.
   */
  async function pedir(
    caminho: string,
    corpoDoPedido: unknown,
    metodo: string,
    mensagemDeRede: string,
  ): Promise<{ resposta: Response; corpo: Record<string, unknown> | null }> {
    const token = await obterToken();
    if (!token) throw falhaDeSessao("sessao_encerrada");

    async function uma(comToken: string): Promise<Response> {
      const cancelador = new AbortController();
      const relogio = setTimeout(() => cancelador.abort(), tempoLimiteMs);
      try {
        return await buscar(`${base}${caminho}`, {
          method: metodo,
          headers: { "content-type": "application/json", authorization: `Bearer ${comToken}` },
          body: corpoDoPedido === undefined ? undefined : JSON.stringify(corpoDoPedido),
          signal: cancelador.signal,
        });
      } catch (erro) {
        // Rede fora, DNS falhando, tempo esgotado: tudo isso melhora sozinho.
        throw new FalhaTemporaria(mensagemDeRede, erro);
      } finally {
        clearTimeout(relogio);
      }
    }

    const primeira = await uma(token);
    if (primeira.ok || primeira.status !== 401) return { resposta: primeira, corpo: null };

    const corpo = await lerCorpo(primeira);
    /*
      O servidor ja disse que a sessao acabou: renovar so gastaria o token de
      renovacao (rotativo) contra uma sessao que ele mesmo encerrou. Quem diz o
      que e "entrar de novo" e o catalogo.
    */
    if (acaoParaOCodigo(corpo["erro"]) === "entrar_de_novo") {
      return { resposta: primeira, corpo };
    }

    /*
      UMA renovacao, e so uma. O `obterToken` do aplicativo respeita a trava e o
      piso entre tentativas, e devolve o MESMO token quando nao renovou (piso,
      renovacao recusada, sem sinal). Token igual ao que acabou de ser recusado
      e a prova de que repetir seria inutil, e o pedido nao sai de novo.
    */
    const novo = await obterToken({ renovarJa: true });
    if (!novo || novo === token) return { resposta: primeira, corpo };

    const segunda = await uma(novo);
    const corpoDaSegunda = segunda.ok || segunda.status !== 401 ? null : await lerCorpo(segunda);
    return { resposta: segunda, corpo: corpoDaSegunda };
  }

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
    const { resposta, corpo: lido } = await pedir(
      caminho, corpo, metodo, "Sem conexao com o servidor.",
    );

    if (resposta.ok) return (await lerCorpo(resposta)) as T;

    if (resposta.status >= 500 || resposta.status === 429) {
      throw new FalhaTemporaria(`Servidor indisponivel (${resposta.status}).`);
    }

    throw falhaDaResposta(resposta.status, lido ?? await lerCorpo(resposta));
  }

  return {
    async autorizarFoto({ ocorrenciaId, foto, coletadaPor }): Promise<AutorizacaoFoto> {
      /*
        O corpo é montado por `pedidoDeEvidenciaDaFoto`, a MESMA função que a
        conferência de antes de enfileirar valida com o esquema do servidor.
        Montado aqui à mão, a conferência aprovaria um pedido e o fio levaria
        outro, e a vistoria 000009/2026 voltaria a parar na fila com 422.
      */
      const r = await chamar<{
        evidenciaId: string; chave: string; url: string;
        cabecalhos: Record<string, string>; jaEnviada: boolean;
      }>("/evidencias/autorizar-envio", pedidoDeEvidenciaDaFoto(ocorrenciaId, foto, coletadaPor));
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
      const { resposta, corpo: lido } = await pedir(
        "/sincronizacao/vistoria", envelope, "POST", "Sem conexão com o servidor.",
      );

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

      /*
        Pela MESMA tradução das outras rotas, e não por uma cópia: esta era a
        cópia que ainda lia só `mensagem` e `erro`, e o 422 do envelope chegava
        ao cartão da fila sem a lista de campos que o servidor mandou.
      */
      throw falhaDaResposta(resposta.status, lido ?? await lerCorpo(resposta));
    },
  };
}
