import type { Deposito, ItemFila } from "./tipos.js";

/**
 * Depósito sobre qualquer armazenamento de chave e valor assíncrono.
 *
 * No aparelho isso é `expo-sqlite`; no navegador seria IndexedDB; no teste é
 * um mapa. A fila não precisa saber qual: o que ela exige é que o registro
 * sobreviva ao aplicativo fechar, porque coleta perdida significa subir o
 * morro de novo.
 */
export type ChaveValor = {
  ler(chave: string): Promise<string | null>;
  escrever(chave: string, valor: string): Promise<void>;
  remover(chave: string): Promise<void>;
  chaves(): Promise<string[]>;
};

const PREFIXO = "dc360:fila:";

/**
 * Traz para o formato de hoje um item gravado por uma versao anterior.
 *
 * Este e o unico ponto por onde item persistido entra na fila, entao a
 * migracao acontece por mecanismo e nao por disciplina: nenhuma tela precisa
 * lembrar de tratar formato antigo.
 *
 * O que mudou em 09/09/2026: `ultimoErro`, que era uma string, virou
 * `ultimaFalha`, que carrega tambem o codigo e a lista de campos recusados.
 * Sem esta conversao, o aparelho de um agente que atualizou o aplicativo com
 * coleta na fila leria `undefined` no lugar da falha e a tela quebraria com o
 * trabalho dele dentro, no morro, que e exatamente o desfecho que a fila
 * inteira existe para impedir.
 *
 * Note que `JSON.parse` nao falha com formato antigo: ele devolve um objeto com
 * a propriedade errada. Por isso a conversao precisa ser explicita, e por isso
 * ela nao podia ficar no `catch` de registro corrompido logo abaixo.
 */
function normalizar(bruto: Record<string, unknown>): ItemFila {
  if (bruto["ultimaFalha"] !== undefined || bruto["ultimoErro"] === undefined) {
    return bruto as unknown as ItemFila;
  }
  const antigo = bruto["ultimoErro"];
  const { ultimoErro: _descartado, ...resto } = bruto;
  return {
    ...resto,
    ultimaFalha: typeof antigo === "string"
      ? {
        codigo: "desconhecido",
        mensagem: antigo,
        campos: [],
        // Formato antigo nao guardava o codigo. Item que ja estava bloqueado
        // continua bloqueado; o resto vira falha temporaria, que e a leitura
        // conservadora: ela deixa o item ser tentado de novo em vez de
        // aposentar coleta boa por falta de informacao.
        permanente: bruto["estado"] === "bloqueado",
        em: String(bruto["criadoEm"] ?? new Date(0).toISOString()),
      }
      : null,
  } as unknown as ItemFila;
}

export function depositoSobreChaveValor(loja: ChaveValor): Deposito {
  return {
    async listar() {
      const chaves = (await loja.chaves()).filter((c) => c.startsWith(PREFIXO));
      const itens: ItemFila[] = [];
      for (const chave of chaves) {
        const bruto = await loja.ler(chave);
        if (!bruto) continue;
        try {
          itens.push(normalizar(JSON.parse(bruto) as Record<string, unknown>));
        } catch {
          // Registro corrompido não pode derrubar a fila inteira: o resto da
          // coleta do dia continua valendo. O item quebrado sai de circulação.
          await loja.remover(chave);
        }
      }
      return itens;
    },
    async salvar(item) {
      await loja.escrever(PREFIXO + item.id, JSON.stringify(item));
    },
    async remover(id) {
      await loja.remover(PREFIXO + id);
    },
  };
}

/** Armazenamento em memória, para teste e para o modo de demonstração. */
export function lojaEmMemoria(inicial: Record<string, string> = {}): ChaveValor {
  const mapa = new Map(Object.entries(inicial));
  return {
    async ler(c) { return mapa.get(c) ?? null; },
    async escrever(c, v) { mapa.set(c, v); },
    async remover(c) { mapa.delete(c); },
    async chaves() { return [...mapa.keys()]; },
  };
}
