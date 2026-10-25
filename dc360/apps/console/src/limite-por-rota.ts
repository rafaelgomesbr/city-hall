/**
 * O contador do limite por endereço, um por ROTA LÓGICA e não por caminho.
 *
 * Desde a V2-F02-E02 cada rota do console existe duas vezes: sob `/v1` e no
 * espelho sem prefixo, que serve a página que alguém deixou aberta antes da
 * troca. O `@fastify/rate-limit` guarda um contador por rota registrada, então
 * `/entrar` e `/v1/entrar` teriam um teto cada um, e quem martela a porta
 * (cada tentativa gasta uma derivação scrypt de cerca de 128 MB) teria o dobro
 * do que o desenho permite só por alternar o prefixo.
 *
 * Esta loja devolve o MESMO contador para as duas cópias da mesma rota: a
 * chave da rota é o método mais o caminho sem o `/v1`. Rotas diferentes
 * continuam com contadores diferentes, como antes (`/entrar` e `/entrar/codigo`
 * não dividem o teto).
 *
 * Mesma semântica do contador local da biblioteca (janela fixa, `ttl` o que
 * resta da janela), sem as opções de banimento que o console não usa.
 */

type Contagem = { current: number; ttl: number; inicio: number };
type Retorno = (erro: Error | null, resultado?: { current: number; ttl: number }) => void;

/**
 * A biblioteca sempre passa a janela (quarto argumento é o teto); o valor padrão
 * existe só porque a tipagem dela declara `incr(chave, retorno)`.
 */
const JANELA_PADRAO = 60_000;

/** Teto de endereços lembrados por rota; o mais antigo sai primeiro. */
const ENDERECOS_POR_ROTA = 5000;

class ContadorDaRota {
  private readonly contagens = new Map<string, Contagem>();

  incr(chave: string, retorno: Retorno, janela: number = JANELA_PADRAO): void {
    const agora = Date.now();
    let c = this.contagens.get(chave);
    if (!c || c.inicio + janela <= agora) {
      c = { current: 1, ttl: janela, inicio: agora };
    } else {
      c.current += 1;
      c.ttl = janela - (agora - c.inicio);
    }
    // Reinserir move a chave para o fim: a ordem de inserção é a de uso.
    this.contagens.delete(chave);
    this.contagens.set(chave, c);
    if (this.contagens.size > ENDERECOS_POR_ROTA) {
      const maisAntiga = this.contagens.keys().next().value;
      if (maisAntiga !== undefined) this.contagens.delete(maisAntiga);
    }
    retorno(null, { current: c.current, ttl: c.ttl });
  }

  /** A biblioteca exige o método na tipagem; o contador de uma rota não tem filhos. */
  child(): ContadorDaRota {
    return this;
  }
}

/** O que a biblioteca entrega a `child`: os parâmetros mesclados, com a rota em `routeInfo`. */
type ParametrosDaRota = { routeInfo?: { method?: string | string[]; url?: string } };

/** Tira o prefixo de versão: a rota lógica é a mesma sob `/v1` e sem ele. */
export function rotaLogica(url: string | undefined): string {
  return (url ?? "").replace(/^\/v1(?=\/|$)/, "");
}

export class LojaDeLimitePorRotaLogica {
  private readonly porRota = new Map<string, ContadorDaRota>();
  private readonly avulso = new ContadorDaRota();

  // A biblioteca instancia a classe com os parâmetros globais; não há o que guardar deles.
  constructor(_parametros?: unknown) {}

  /** Só é usada por rota sem `config.rateLimit` próprio, o que o console não tem. */
  incr(chave: string, retorno: Retorno, janela?: number): void {
    this.avulso.incr(chave, retorno, janela);
  }

  /**
   * Tipado como `unknown` porque a tipagem da biblioteca descreve o argumento
   * como as opções da rota, mas em execução ela entrega os parâmetros mesclados,
   * e a rota vem em `routeInfo` (ver `mergeParams` em `@fastify/rate-limit`).
   */
  child(recebido: unknown): ContadorDaRota {
    const parametros = (recebido ?? {}) as ParametrosDaRota;
    const metodo = [parametros.routeInfo?.method ?? ""].flat().sort().join(",");
    const rota = `${metodo} ${rotaLogica(parametros.routeInfo?.url)}`;
    let contador = this.porRota.get(rota);
    if (!contador) {
      contador = new ContadorDaRota();
      this.porRota.set(rota, contador);
    }
    return contador;
  }
}
