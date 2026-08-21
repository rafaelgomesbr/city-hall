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

export function depositoSobreChaveValor(loja: ChaveValor): Deposito {
  return {
    async listar() {
      const chaves = (await loja.chaves()).filter((c) => c.startsWith(PREFIXO));
      const itens: ItemFila[] = [];
      for (const chave of chaves) {
        const bruto = await loja.ler(chave);
        if (!bruto) continue;
        try {
          itens.push(JSON.parse(bruto) as ItemFila);
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
