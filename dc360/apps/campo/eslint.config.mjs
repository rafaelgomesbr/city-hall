// Lint do aplicativo de campo. V2-F01-E17.
//
// O aplicativo fica fora do `workspaces` (lockfile próprio), mas o ESLint, o
// Prettier e os plugins moram na raiz `dc360/` e são resolvidos dali: o mesmo
// binário mede os dois lados e o lockfile do Expo não ganha nenhuma dependência
// de lint. Por isso o lint do aplicativo roda com este diretório como raiz
// (`node scripts/lint.mjs`), baseline própria em `eslint-suppressions.json` e
// tipos lidos do `node_modules` do aplicativo (o CI instala os dois).
//
// A F23-E02 acrescenta aqui as regras de acessibilidade do React Native.
import globals from "globals";
import { montarConfiguracao } from "../../eslint.base.mjs";

const base = montarConfiguracao({
  raiz: import.meta.dirname,
  ignorar: ["assets/**", "android/**", "ios/**", "segredos/**"],
  codigo: ["src/**/*.{ts,tsx}"],
  scripts: ["**/*.{mjs,cjs,js}"],
  react: ["src/**/*.{ts,tsx}"],
});

export default [
  ...base,
  {
    // Configuração do Metro, do Babel e do Jest roda em Node; os mocks e o
    // `jest.setup.js` usam as globais do Jest.
    files: ["__mocks__/**/*.js", "jest.setup.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
];
