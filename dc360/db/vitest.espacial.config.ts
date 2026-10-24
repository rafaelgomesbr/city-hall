import { defineConfig } from "vitest/config";

/**
 * A suíte espacial (V2-F01-E21): só os `*.espacial.test.ts`, que precisam de um
 * Postgres REAL com a extensão PostGIS. O PGlite 0.2.17, que roda o resto da
 * suíte do banco, não traz PostGIS, então estes testes não entram em
 * `npm test` (ver `vitest.config.ts`, que os exclui) e rodam por
 * `npm run test:espacial`.
 *
 * Variáveis:
 * - `DC360_POSTGRES_DE_PROVA`: URL de um superusuário de um servidor
 *   descartável onde o teste possa criar banco e papel (a mesma variável da
 *   prova de corrida da API).
 * - `DC360_EXIGE_POSTGIS=1`: no CI. Faltar servidor ou extensão reprova. Sem
 *   ela, local, o teste pula com aviso (regra em `test/postgis-decisao.ts`).
 *
 * Mesmos tetos de tempo da suíte comum, pelo mesmo motivo (ver o comentário de
 * `vitest.config.ts`): criar banco, extensão e papéis num servidor ocupado
 * passa dos 10 s padrão de gancho sem nada de errado ter acontecido.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.espacial.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
