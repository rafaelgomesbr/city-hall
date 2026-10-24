// Lint do monorepo (api, console, web, db, packages, scripts). V2-F01-E17.
// O aplicativo de campo tem configuração e baseline próprias em
// `apps/campo/eslint.config.mjs` (lockfile próprio, regras de React Native
// entram na F23-E02). Regras e racional em `eslint.base.mjs`.
import { montarConfiguracao } from "./eslint.base.mjs";

export default montarConfiguracao({
  raiz: import.meta.dirname,
  ignorar: [
    // Aplicativo de campo: configuração própria.
    "apps/campo/**",
    // Fontes e imagens do painel são binários; o resto de `public` não é código.
    "apps/web/public/**",
    // Documentação não é o produto.
    "docs/**",
  ],
  codigo: [
    "apps/api/src/**/*.ts",
    "apps/console/src/**/*.ts",
    "apps/web/src/**/*.{ts,tsx}",
    "db/src/**/*.ts",
    "packages/*/src/**/*.ts",
  ],
  testes: [
    "apps/*/test/**/*.{ts,tsx,mjs}",
    "db/test/**/*.ts",
    "packages/*/test/**/*.ts",
    "apps/*/*.config.ts",
    "scripts/**/*.mjs",
    "apps/web/scripts/**/*.mjs",
  ],
  tsconfigDeTestes: "./tsconfig.lint.json",
  scripts: ["**/*.{mjs,cjs,js}"],
  react: ["apps/web/src/**/*.{ts,tsx}"],
  // Os scripts do Playwright do painel passam funções para `page.evaluate`,
  // que roda no navegador: `document` e `location` existem ali.
  globaisDeNavegador: [
    "apps/web/src/**/*.{ts,tsx}",
    "apps/web/test/**/*.{ts,tsx,mjs}",
    "apps/web/scripts/**/*.mjs",
  ],
});
