import { configDefaults, defineConfig } from "vitest/config";

/**
 * A suíte do banco precisa de teto de gancho maior que o padrão, e a razão
 * é a mesma escrita em `apps/api/vitest.config.ts`: portão que reprova por
 * máquina ocupada ensina a equipe a rodar de novo até passar, e a partir daí
 * não bloqueia mais nada.
 *
 * O que aconteceu, medido em 15/09/2026: o `beforeAll` de
 * `test/isolamento.test.ts` aplica as 42 migrações num PGlite novo, e
 * `test/busca.test.ts` sobe DOIS PGlite (com e sem `pg_trgm`) na mesma
 * rodada, em paralelo, enquanto o `npm run verificar` acabava de rodar a
 * suíte da API. Sob essa carga o `beforeAll` passou de 10 s (o teto padrão
 * de gancho do vitest) e os 132 casos do CA-06 foram PULADOS, com o portão
 * inteiro dando vermelho num arquivo que ninguém tinha tocado. Na máquina
 * ociosa o mesmo gancho leva de 3 a 5 s.
 *
 * `hookTimeout` de 120 s dá folga para o caso legítimo (42 migrações com
 * função, coluna gerada e índice GIN num banco em WebAssembly); `testTimeout`
 * de 30 s cobre os casos de carga (`test/carga.test.ts`) que já eram lentos
 * de propósito. Nenhum caso do banco espera por relógio, então teto largo
 * não esconde travamento: um teste que trava reprova do mesmo jeito, só que
 * depois. `maxThreads: 4` pelo mesmo motivo da API: quatro PGlite em voo
 * cabem na memória; oito, com a suíte da API ao lado, não.
 *
 * Junção do lote 1 da F03 (DV-67): o `testTimeout` sobe para 120 s. As
 * sondas 12 e 19 de `catalogo-nominal.test.ts` e a varredura de privilégio
 * por coluna de `isolamento.test.ts` (parte 0G) levam de 5 a 12 s cada no
 * PGlite ocioso e passaram de 30 s com o `npm test` inteiro carregando a
 * máquina. A mesma razão do `hookTimeout`: teto largo não esconde
 * travamento.
 */
export default defineConfig({
  test: {
    // Os `*.espacial.test.ts` (V2-F01-E21) pedem Postgres real com PostGIS e
    // têm a própria suíte: `vitest.espacial.config.ts`, `npm run test:espacial`.
    exclude: [...configDefaults.exclude, "**/*.espacial.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    poolOptions: {
      threads: { maxThreads: 4 },
    },
  },
});
