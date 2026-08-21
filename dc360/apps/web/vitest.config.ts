import { defineConfig } from "vite";

/**
 * A suíte de unidade cobre só `test/*.test.ts`.
 *
 * `test/fluxo*.e2e.mjs` fica de fora de propósito: são scripts de navegador
 * que exigem servidor de pé, e rodam por `npm run test:e2e`. Misturar os dois
 * faria a suíte rápida depender de infraestrutura e ela deixaria de ser rodada.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
