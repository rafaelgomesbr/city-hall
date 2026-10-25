import type { FastifyRateLimitOptions, FastifyRateLimitStore } from "@fastify/rate-limit";
import { semPrefixoDeVersao } from "./versao-v1.js";

/**
 * O armazém do limitador de taxa que NÃO dobra o orçamento quando a mesma
 * rota existe em `/v1` e no espelho sem prefixo (V2-F02-E01).
 *
 * O `@fastify/rate-limit` dá a cada rota que declara limite próprio um armazém
 * NOVO (`store.child`). Com as rotas registradas duas vezes, `POST /auth/entrar`
 * e `POST /v1/auth/entrar` passariam a ter um balde cada, e quem tenta adivinhar
 * senha ganharia o dobro de tentativas por endereço no mesmo intervalo, só por
 * escolher o prefixo. O limite do login existe justamente contra isso.
 *
 * Aqui o armazém filho é guardado por `MÉTODO caminho-sem-versão`: as duas
 * cópias da mesma rota dividem o balde, e rotas diferentes (`/entrar` e
 * `/segundo-fator`) continuam com um balde cada, como já era. O limitador
 * global não passa por `child`: já é um armazém só, nos dois prefixos.
 *
 * É a mesma contagem do armazém local da biblioteca (janela fixa por chave,
 * com teto de entradas), sem `continueExceeding` nem recuo exponencial, que
 * esta API não usa.
 */
export class LimitePorRotaSemVersao implements FastifyRateLimitStore {
  private readonly baldes = new Map<
    string,
    { current: number; ttl: number; iterationStartMs: number }
  >();
  private readonly filhos: Map<string, LimitePorRotaSemVersao>;

  constructor(_opcoes?: FastifyRateLimitOptions, filhos?: Map<string, LimitePorRotaSemVersao>) {
    this.filhos = filhos ?? new Map();
  }

  // A biblioteca chama com quatro argumentos (janela e teto), apesar de a
  // declaração de tipos dela listar dois.
  incr(
    chave: string,
    resposta: (erro: Error | null, resultado?: { current: number; ttl: number }) => void,
    ...[janelaMs]: [number?, number?]
  ): void {
    const janela = janelaMs ?? 60_000;
    const agora = Date.now();
    let balde = this.baldes.get(chave);
    if (!balde) {
      balde = { current: 1, ttl: janela, iterationStartMs: agora };
    } else if (balde.iterationStartMs + janela <= agora) {
      balde = { current: 1, ttl: janela, iterationStartMs: agora };
    } else {
      balde.current += 1;
      balde.ttl = janela - (agora - balde.iterationStartMs);
    }
    // Reinsere para a chave mais recente ficar por último, e poda a mais antiga
    // acima do teto (o mesmo limite de 5000 entradas da biblioteca).
    this.baldes.delete(chave);
    this.baldes.set(chave, balde);
    if (this.baldes.size > 5000) {
      const maisAntiga = this.baldes.keys().next().value;
      if (maisAntiga !== undefined) this.baldes.delete(maisAntiga);
    }
    resposta(null, balde);
  }

  child(opcoes: unknown): FastifyRateLimitStore {
    const info =
      (opcoes as { routeInfo?: { url?: string; method?: string | string[] } }).routeInfo ?? {};
    const metodo = Array.isArray(info.method) ? info.method.join(",") : (info.method ?? "");
    const chave = `${metodo} ${semPrefixoDeVersao(info.url ?? "")}`;
    let filho = this.filhos.get(chave);
    if (!filho) {
      filho = new LimitePorRotaSemVersao(undefined, this.filhos);
      this.filhos.set(chave, filho);
    }
    return filho;
  }
}
