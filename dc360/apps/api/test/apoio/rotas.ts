import type { FastifyInstance } from "fastify";
import { semPrefixoDeVersao } from "../../src/versao-v1.js";

/**
 * A leitura da árvore de rotas do servidor MONTADO (V2-F02-E05).
 *
 * Nasceu em `superficie.test.ts` (V2-F00-E23 a moveu para
 * `superficie-registrada.ts`) e agora mora aqui, num lugar que não é "teste de
 * superfície": o portão de autenticação, o contrato do painel e o contrato de
 * cliente x rota precisam da MESMA leitura. Duas cópias do parser divergiriam
 * na primeira atualização do Fastify, e uma delas passaria a conferir endereço
 * nenhum.
 */

export type Rota = { metodo: string; caminho: string };

/**
 * Lê a árvore de rotas do próprio Fastify.
 *
 * `printRoutes` é a única forma pública de enumerar o que foi registrado, e é
 * justamente por vir do servidor montado que ela não pode ficar desatualizada.
 */
export function rotasRegistradas(instancia: FastifyInstance): Rota[] {
  const arvore = instancia.printRoutes({ commonPrefix: false });
  const rotas: Rota[] = [];

  /*
    O caminho de verdade é a CONCATENAÇÃO da árvore, e não o texto de uma
    linha.

    `printRoutes` desenha uma árvore em que cada linha traz só o próprio
    segmento. A versão anterior deste parser tomava o segmento como se fosse o
    caminho inteiro, e o resultado era pedir `GET :id` e `POST /triagem`, que
    não existem: DEZESSETE rotas do produto respondiam 404, e o portão aceitava
    404 como prova de que estavam protegidas.

    Ou seja: o portão que existe para garantir que nenhuma rota responde sem
    token estava, para a maioria delas, verificando endereço nenhum. Isso só
    apareceu quando a régua foi apertada para exigir 401.

    A profundidade sai do prefixo de desenho, contado em blocos de quatro
    caracteres, que é como o Fastify indenta.
  */
  const pilha: string[] = [];

  for (const linha of arvore.split("\n")) {
    const casou = /^([\s│├└─]*)(\S+)\s+\((.+?)\)\s*$/.exec(linha);
    if (!casou) continue;

    const profundidade = Math.floor(casou[1]!.length / 4);
    const segmento = casou[2]!;

    pilha.length = profundidade;
    pilha[profundidade] = segmento;
    const caminho = pilha.slice(0, profundidade + 1).join("");

    for (const metodo of casou[3]!.split(",").map((m) => m.trim())) {
      if (metodo === "HEAD" || metodo === "OPTIONS") continue;
      rotas.push({ metodo, caminho });
    }
  }
  return rotas;
}

/**
 * Todo nome de parâmetro vira `:p`, para `/ocorrencias/:id` (servidor) e
 * `/ocorrencias/:p` (o que o extrator tira do `${id}` do cliente) serem a
 * mesma chave. A barra final sai: o servidor registra `/avisos` e `/avisos/`
 * como a mesma rota, e o cliente escreve sem a barra.
 */
export function normalizarRota(caminho: string): string {
  const semBarra = caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
  return semBarra.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":p");
}

/** `MÉTODO /caminho` com os parâmetros normalizados. */
export function chaveNormalizada(metodo: string, caminho: string): string {
  return `${metodo} ${normalizarRota(caminho)}`;
}

/**
 * As rotas registradas sob `/v1`, com o `/v1` TIRADO do caminho: é o que um
 * cliente escreve, porque o prefixo vive na base (`BASE = ORIGEM + "/v1"`).
 * As do espelho sem prefixo ficam de fora, e é de propósito: o contrato dos
 * clientes é contra a versão, e uma chamada que só existisse no espelho é
 * justamente a que a V2-F28-E11 vai quebrar.
 */
export function rotasDaV1(instancia: FastifyInstance): Rota[] {
  return rotasRegistradas(instancia)
    .filter((r) => r.caminho.startsWith("/v1/"))
    .map((r) => ({ metodo: r.metodo, caminho: semPrefixoDeVersao(r.caminho) }));
}
