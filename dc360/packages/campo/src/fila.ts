import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  type Deposito,
  type ItemFila,
  type ResultadoDreno,
  type ResumoFila,
  type Transporte,
} from "./tipos.js";

export type OpcoesFila = {
  deposito: Deposito;
  transporte: Transporte;
  /** Injetáveis para o teste poder controlar o tempo em vez de esperar por ele. */
  agora?: () => Date;
  dormir?: (ms: number) => Promise<void>;
  /** Ruído no tempo de espera. Injetável para o teste ser determinístico. */
  ruido?: () => number;
  /** Depois de quantas falhas seguidas o item é bloqueado. */
  maximoTentativas?: number;
  /** Quanto tempo um item confirmado fica visível antes de sair da fila. */
  reterConfirmadoMs?: number;
};

const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

/**
 * Espera exponencial com ruído.
 *
 * Sem o exponencial, um servidor fora do ar recebe uma tentativa por segundo
 * de cada aparelho em campo, e a fila vira ataque contra a própria
 * prefeitura. Sem o ruído, todos os aparelhos que perderam sinal no mesmo
 * temporal voltam no mesmo instante e derrubam o servidor de novo justo na
 * hora em que ele está subindo.
 */
export function esperaAteProximaTentativa(tentativas: number, ruido = Math.random): number {
  const cheia = Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1), ESPERA_MAXIMA_MS);
  // Ruído completo (entre metade e o total) espalha melhor que uma margem
  // estreita em torno do valor cheio.
  return Math.round(cheia / 2 + ruido() * (cheia / 2));
}

export function criarFilaDeSincronizacao(opcoes: OpcoesFila) {
  const {
    deposito,
    transporte,
    agora = () => new Date(),
    dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    ruido = Math.random,
    maximoTentativas = 8,
    reterConfirmadoMs = 30_000,
  } = opcoes;

  let drenando = false;
  /**
   * Cada dreno recebe uma marca. Cancelar troca a marca, e o dreno em
   * andamento percebe a troca e para no próximo passo.
   *
   * Isto é o que impede o defeito clássico: o agente perde o sinal, o dreno
   * antigo continua rodando em segundo plano, o sinal volta, um dreno novo
   * começa, e os dois enviam o mesmo item. A chave de idempotência salvaria o
   * servidor, mas a fila local ficaria contando errado.
   */
  let marcaAtual = 0;

  const ouvintes = new Set<(r: ResumoFila) => void>();

  async function avisar(): Promise<void> {
    if (ouvintes.size === 0) return;
    const r = await resumo();
    for (const ouvinte of ouvintes) ouvinte(r);
  }

  function assinar(ouvinte: (r: ResumoFila) => void): () => void {
    ouvintes.add(ouvinte);
    void avisar();
    return () => ouvintes.delete(ouvinte);
  }

  async function resumo(): Promise<ResumoFila> {
    const itens = await deposito.listar();
    return {
      pendentes: itens.filter((i) => i.estado === "pendente").length,
      enviando: itens.filter((i) => i.estado === "enviando").length,
      confirmados: itens.filter((i) => i.estado === "confirmado").length,
      bloqueados: itens.filter((i) => i.estado === "bloqueado").length,
      sincronizando: drenando,
    };
  }

  /**
   * Coloca uma coleta na fila.
   *
   * Enfileirar a mesma chave duas vezes não cria dois itens. Acontece de
   * verdade: o agente toca em "concluir" e a tela demora a responder porque o
   * aparelho está velho, e ele toca de novo.
   */
  async function enfileirar(
    envelope: EnvelopeSincronizacao,
    dados: { protocolo: string },
  ): Promise<ItemFila> {
    const existente = (await deposito.listar()).find((i) => i.id === envelope.idempotencyKey);
    if (existente) return existente;

    const instante = agora().toISOString();
    const item: ItemFila = {
      id: envelope.idempotencyKey,
      ocorrenciaId: envelope.ocorrenciaId,
      protocolo: dados.protocolo,
      envelope,
      estado: "pendente",
      tentativas: 0,
      criadoEm: instante,
      liberadoEm: instante,
      ultimoErro: null,
      confirmadoEm: null,
    };
    await deposito.salvar(item);
    await avisar();
    return item;
  }

  /** Ordem de coleta, sempre: a primeira vistoria feita é a primeira a subir. */
  function prontos(itens: ItemFila[], instante: Date): ItemFila[] {
    return itens
      .filter((i) => (i.estado === "pendente" || i.estado === "enviando"))
      .filter((i) => new Date(i.liberadoEm) <= instante)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  /**
   * Envia o que estiver pronto, um por vez.
   *
   * Um por vez, e não em paralelo, de propósito: a ordem de coleta é a ordem
   * do laudo, e conexão de borda de cidade não melhora com paralelismo, só
   * multiplica o tempo esgotado.
   */
  async function drenar(): Promise<ResultadoDreno> {
    if (drenando) {
      return { enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0, interrompido: true };
    }

    marcaAtual += 1;
    const minhaMarca = marcaAtual;
    drenando = true;
    await avisar();

    const resultado: ResultadoDreno = {
      enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0, interrompido: false,
    };

    try {
      const fila = prontos(await deposito.listar(), agora());

      for (const item of fila) {
        if (minhaMarca !== marcaAtual) {
          resultado.interrompido = true;
          break;
        }

        /**
         * Um item em "enviando" quando o dreno começa significa que o
         * aplicativo morreu no meio de um envio anterior, e não há como saber
         * se o servidor recebeu. Reenviar é seguro exatamente porque a chave
         * de idempotência é a mesma: se chegou, o servidor devolve o recibo
         * antigo em vez de gravar de novo.
         */
        await deposito.salvar({
          ...item,
          estado: "enviando",
          tentativas: item.tentativas + 1,
        });
        await avisar();

        try {
          const recibo = await transporte.enviar(item.envelope);

          if (minhaMarca !== marcaAtual) {
            // O dreno foi cancelado enquanto esta resposta voltava. O envio
            // deu certo, então o resultado precisa ser gravado do mesmo jeito:
            // descartar aqui faria a próxima rodada reenviar sem necessidade.
            resultado.interrompido = true;
          }

          await deposito.salvar({
            ...item,
            estado: "confirmado",
            tentativas: item.tentativas + 1,
            ultimoErro: null,
            confirmadoEm: agora().toISOString(),
          });
          if (recibo.duplicada) resultado.duplicados += 1;
          else resultado.enviados += 1;
          await avisar();

          if (resultado.interrompido) break;
        } catch (erro) {
          const desfecho = await tratarFalha(item, erro);
          if (desfecho === "bloqueado") resultado.bloqueados += 1;
          else resultado.adiados += 1;
          await avisar();

          if (desfecho === "adiado" && erro instanceof FalhaTemporaria) {
            // Rede caída não melhora no item seguinte. Parar aqui evita
            // gastar bateria tentando a fila inteira contra um servidor que
            // não responde, e preserva a ordem de coleta.
            resultado.interrompido = true;
            break;
          }
        }
      }

      await limparConfirmados();
      return resultado;
    } finally {
      if (minhaMarca === marcaAtual) drenando = false;
      await avisar();
    }
  }

  async function tratarFalha(
    item: ItemFila,
    erro: unknown,
  ): Promise<"adiado" | "bloqueado"> {
    const tentativas = item.tentativas + 1;

    if (erro instanceof FalhaPermanente) {
      await deposito.salvar({
        ...item,
        estado: "bloqueado",
        tentativas,
        ultimoErro: erro.message,
      });
      return "bloqueado";
    }

    if (tentativas >= maximoTentativas) {
      await deposito.salvar({
        ...item,
        estado: "bloqueado",
        tentativas,
        ultimoErro:
          `Não foi possível enviar depois de ${tentativas} tentativas. ` +
          `Último erro: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
      return "bloqueado";
    }

    const espera = esperaAteProximaTentativa(tentativas, ruido);
    await deposito.salvar({
      ...item,
      estado: "pendente",
      tentativas,
      liberadoEm: new Date(agora().getTime() + espera).toISOString(),
      ultimoErro: erro instanceof Error ? erro.message : String(erro),
    });
    return "adiado";
  }

  /** Confirmado some depois de um tempo: a lista é do que falta, não do que já foi. */
  async function limparConfirmados(): Promise<void> {
    const limite = agora().getTime() - reterConfirmadoMs;
    for (const item of await deposito.listar()) {
      if (item.estado === "confirmado" && item.confirmadoEm) {
        if (new Date(item.confirmadoEm).getTime() <= limite) {
          await deposito.remover(item.id);
        }
      }
    }
  }

  /**
   * Interrompe o dreno em andamento. Chamado quando o aparelho perde o sinal
   * ou quando o aplicativo vai para segundo plano.
   */
  function cancelar(): void {
    marcaAtual += 1;
    drenando = false;
  }

  /**
   * Devolve um item bloqueado para a fila, por decisão da pessoa. Serve para
   * o caso "o servidor estava fora e agora voltou", que o aparelho não tem
   * como adivinhar.
   */
  async function reenviar(id: string): Promise<void> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    if (!item || item.estado !== "bloqueado") return;
    await deposito.salvar({
      ...item,
      estado: "pendente",
      tentativas: 0,
      liberadoEm: agora().toISOString(),
      ultimoErro: null,
    });
    await avisar();
  }

  /**
   * Descarta um item bloqueado. Exige confirmação de quem chama, porque
   * descartar coleta de campo é perder trabalho já feito no morro.
   */
  async function descartar(id: string): Promise<void> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    if (!item || item.estado !== "bloqueado") return;
    await deposito.remover(id);
    await avisar();
  }

  async function itens(): Promise<ItemFila[]> {
    return (await deposito.listar()).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  /** Espera até o próximo item ficar liberado. Para o laço de fundo do app. */
  async function aguardarProximaJanela(): Promise<void> {
    const lista = await deposito.listar();
    const pendentes = lista.filter((i) => i.estado === "pendente");
    if (pendentes.length === 0) return;
    const proximo = Math.min(...pendentes.map((i) => new Date(i.liberadoEm).getTime()));
    const espera = proximo - agora().getTime();
    if (espera > 0) await dormir(espera);
  }

  return {
    enfileirar,
    drenar,
    cancelar,
    reenviar,
    descartar,
    itens,
    resumo,
    assinar,
    aguardarProximaJanela,
  };
}

export type FilaDeSincronizacao = ReturnType<typeof criarFilaDeSincronizacao>;
