import { defineConfig } from "vitest/config";

/**
 * A suíte da API precisa de teto de paralelismo, e não é preferência.
 *
 * O defeito, medido em 09/09/2026 numa máquina de 8 núcleos e 8 GB **com a
 * máquina ocupada**: sem esta configuração, `npm test` em `apps/api` reprovou em
 * DUAS de três rodadas, com "Test timed out in 5000ms" em arquivos que ninguém
 * tinha tocado (`test/api.test.ts`, `test/log.test.ts`). Com o teto abaixo, a
 * mesma árvore passou nas três.
 *
 * Dito com precisão, porque a diferença importa: **na máquina ociosa a suíte
 * passa sem esta configuração**, e isso foi conferido duas vezes. A reprovação
 * apareceu com outros processos pesados disputando a máquina. Isso não
 * enfraquece o motivo, fortalece: máquina de integração contínua nunca está
 * ociosa, e o portão que só funciona quando ninguém mais está trabalhando é o
 * portão que vai falhar exatamente no dia da entrega.
 *
 * A causa não é lentidão de teste, é memória. A derivação de senha usa scrypt
 * com N = 2^17, que custa cerca de **128 MB por derivação** (ver o comentário em
 * `src/auth/senha.ts`, onde o número é escolhido de propósito para ficar caro
 * para quem ataca). O vitest, sem teto, abre uma thread por núcleo: oito
 * arquivos derivando senha ao mesmo tempo pedem mais de um giga só nisso, a
 * máquina começa a trocar memória com o disco, e um teste que leva 300 ms passa
 * dos cinco segundos sem nada de errado ter acontecido.
 *
 * Suíte que reprova duas de três vezes é pior que suíte que não existe: ela
 * ensina a equipe a rodar de novo até passar, e a partir daí o portão não
 * bloqueia mais nada. Todo o método deste projeto ("marca o check apenas com a
 * prova") depende de a suíte dizer a verdade.
 *
 * Duas decisões, e não uma:
 *
 * 1. `maxThreads: 4` limita a memória em voo. Quatro, e não um, porque a suíte
 *    ainda precisa terminar em tempo humano; e não oito, porque oito foi o que
 *    reprovou.
 * 2. `testTimeout` de 30 s dá folga para o caso legítimo: um teste que abre
 *    servidor, semeia banco e deriva senha três vezes não cabe em cinco
 *    segundos nem numa máquina descansada.
 *
 * O que este arquivo NÃO faz, de propósito: baixar o custo do scrypt em
 * ambiente de teste. Testar com parâmetro diferente do de produção esconderia
 * exatamente a classe de defeito que só aparece sob o custo real.
 */
export default defineConfig({
  test: {
    /*
      O complemento de teste da migração 038 (ver `test/duble-da-migracao-038.ts`):
      enquanto nenhuma migração definir a função de contagem que `/saude` lê,
      a lista que `carregarMigracoes` devolve ganha essa função no fim. Some
      sozinho no dia em que uma migração a trouxer.
    */
    /*
      E o "falha alto" da guarda das respostas de acesso (V2-F00-E05, correção 3):
      caso que passou por uma resposta 401 ou 403 fora do catálogo reprova. Ver
      `test/guarda-falha-alto.ts`.
    */
    setupFiles: ["./test/duble-da-migracao-038.ts", "./test/guarda-falha-alto.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    poolOptions: {
      threads: { maxThreads: 4 },
    },
  },
});
