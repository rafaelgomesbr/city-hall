// Regras de lint compartilhadas entre o monorepo (`eslint.config.mjs`) e o
// aplicativo de campo (`apps/campo/eslint.config.mjs`, que tem lockfile próprio
// e é medido com a própria raiz de execução). V2-F01-E17.
//
// POR QUE EXISTE UMA BASELINE. O código nasceu sem lint. Ligar a régua e
// corrigir tudo de uma vez geraria um diff gigante que conflita com qualquer
// outra mudança em andamento. Então os achados de hoje ficam registrados em
// `eslint-suppressions.json` (gerado por `eslint --suppress-all`, suporte
// nativo do ESLint 9.24+), e o ESLint reprova sozinho:
//   - qualquer achado NOVO (a contagem por arquivo e regra passa do registrado);
//   - supressão que já não é necessária (obriga a podar, então o teto só desce).
// `scripts/lint-teto.mjs` guarda o total em `lint-teto.json` e reprova, no PR,
// quando o teto ou a contagem de uma regra sobe em relação ao ramo-base.
//
// COMO LER AS REGRAS. Tudo aqui é "error": um aviso ninguém lê, e a baseline
// existe justamente para que "error" seja possível sem derrubar o que já
// estava lá. Regra de segurança (eval, Function, any explícito, promessa solta)
// entra como erro desde o primeiro dia: o achado antigo fica na baseline, o
// novo reprova.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export const IGNORADOS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/.expo/**",
  "**/*.d.ts",
];

/** Regras de segurança do núcleo do ESLint: execução de texto como código. */
const regrasDeSeguranca = {
  "no-eval": "error",
  "no-implied-eval": "off", // a versão tipada (@typescript-eslint/no-implied-eval) cobre
  "no-new-func": "error",
  "no-script-url": "error",
  "no-proto": "error",
  "no-caller": "error",
  "no-extend-native": "error",
  "no-new-wrappers": "error",
  "no-debugger": "error",
};

/**
 * Regras que usam informação de tipo. São as que o SAST (E05) não pega: a
 * promessa solta e o `await` que falta. Ficam em lista curta de propósito:
 * a família inteira `recommendedTypeChecked` gera milhares de achados de estilo
 * (`no-unsafe-*`, `restrict-template-expressions`) que escondem os de verdade.
 */
const regrasComTipo = {
  "@typescript-eslint/no-floating-promises": [
    "error",
    {
      // `test()`, `describe()` e `it()` do `node:test` devolvem uma promessa que
      // o próprio executor aguarda. Sem esta exceção, cada caso de teste dos
      // scripts viraria um falso achado e esconderia a promessa solta de verdade.
      allowForKnownSafeCalls: [
        { from: "package", package: "node:test", name: ["test", "describe", "it", "suite"] },
      ],
    },
  ],
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-implied-eval": "error",
  "@typescript-eslint/only-throw-error": "error",
  "@typescript-eslint/no-for-in-array": "error",
  "@typescript-eslint/no-array-delete": "error",
  "@typescript-eslint/no-base-to-string": "error",
};

const regrasDoTypeScript = {
  // `any` explícito: erro. O existente fica na baseline, o novo reprova.
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
    },
  ],
};

/** Hook com dependência faltando e hook fora de ordem reprovam (React). */
const regrasDeHooks = {
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "error",
};

/**
 * Monta a configuração.
 *
 * @param {object} o
 * @param {string} o.raiz              diretório da configuração (`import.meta.dirname`)
 * @param {string[]} o.codigo          globs do código de produção (tipado pelo `tsconfig.json` mais próximo)
 * @param {string[]} [o.testes]        globs de teste e scripts (tipados pelo tsconfig de lint; pode ser vazio)
 * @param {string[]} [o.scripts]       globs de `.mjs`/`.js` (globais do Node)
 * @param {string[]} [o.react]         globs onde as regras de hooks valem
 * @param {string[]} [o.globaisDeNavegador] globs que rodam no navegador
 * @param {string[]} [o.ignorar]       globs a ignorar além dos padrões
 * @param {string} [o.tsconfigDeTestes] caminho do tsconfig dos testes
 */
export function montarConfiguracao({
  raiz,
  codigo,
  testes = [],
  scripts = [],
  react = [],
  globaisDeNavegador = [],
  ignorar = [],
  tsconfigDeTestes,
}) {
  return tseslint.config(
    { ignores: [...IGNORADOS, ...ignorar] },
    {
      linterOptions: {
        // Um `eslint-disable` que já não suprime nada é lixo e mascara o próximo achado.
        reportUnusedDisableDirectives: "error",
      },
    },
    js.configs.recommended,
    {
      files: ["**/*.{ts,tsx,mjs,js,cjs}"],
      rules: regrasDeSeguranca,
    },
    // TypeScript sem tipo (recomendado) para todo .ts/.tsx.
    {
      files: ["**/*.{ts,tsx}"],
      extends: [tseslint.configs.recommended],
      rules: regrasDoTypeScript,
    },
    // TypeScript de produção: tipado pelo tsconfig mais próximo.
    {
      files: codigo,
      plugins: { "@typescript-eslint": tseslint.plugin },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { projectService: true, tsconfigRootDir: raiz },
      },
      rules: regrasComTipo,
    },
    // Testes e scripts: tipados por um tsconfig só de lint (eles não entram nos
    // tsconfigs de compilação).
    ...(testes.length > 0
      ? [
          {
            files: testes,
            // O parser do typescript-eslint também lê `.mjs` (com `allowJs`),
            // então as regras com tipo valem para os scripts.
            plugins: { "@typescript-eslint": tseslint.plugin },
            languageOptions: {
              parser: tseslint.parser,
              parserOptions: { project: [tsconfigDeTestes], tsconfigRootDir: raiz },
            },
            rules: regrasComTipo,
          },
        ]
      : []),
    {
      files: scripts,
      languageOptions: { globals: { ...globals.node } },
    },
    ...(globaisDeNavegador.length > 0
      ? [{ files: globaisDeNavegador, languageOptions: { globals: { ...globals.browser } } }]
      : []),
    ...(react.length > 0
      ? [
          {
            files: react,
            plugins: { "react-hooks": reactHooks },
            rules: regrasDeHooks,
          },
        ]
      : []),
  );
}
