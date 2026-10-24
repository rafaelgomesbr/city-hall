# V2-F01-E17: Lint e formatação do monorepo (ESLint e Prettier) com baseline que só diminui

## Fatos

**O que passou a existir.** ESLint 9 com `typescript-eslint` tipado e
`eslint-plugin-react-hooks`, e Prettier 3, nos dois lados do produto (o monorepo e o
aplicativo de campo), com os achados de hoje numa baseline cujo teto só desce. Nenhum
arquivo do produto foi reformatado nem corrigido: o diff em código de produto é zero.

**Dependências novas (só `devDependencies` da raiz `dc360/package.json`, instaladas por
`npm install --ignore-scripts`, lockfile gerado pelo npm):** `eslint@^9.39.5`,
`@eslint/js@^9.39.5`, `typescript-eslint@^8.72.0`, `eslint-plugin-react-hooks@^7.1.1`,
`globals@^17.13.0`, `prettier@^3.9.10`. Comparado o lockfile antigo com o novo:
0 pacotes existentes mudaram de versão, 108 entradas novas. `node scripts/auditar.mjs`
fecha igual a antes: runtime 0 vulnerabilidades, desenvolvimento 3 (as três já aceitas
com dono e prazo: `vitest`, `@vitest/mocker`, `tinypool`), aplicativo sem advisory nova
(`saidas/13-auditar.txt`). O lockfile do aplicativo (`apps/campo/package-lock.json`) NÃO
foi tocado: o aplicativo é medido com o ESLint e os plugins da raiz (a configuração dele
importa de `../../eslint.base.mjs` e o Node resolve os pacotes subindo até `dc360/node_modules`).
Desvio consciente do roteiro, que dizia "lockfile próprio": evita acrescentar 108
pacotes à árvore do Expo e à lista de exceções do `auditar` do aplicativo.

**Arquivos novos (em `dc360/`, salvo indicação):**

- `eslint.base.mjs`: as regras e o porquê, compartilhadas. Regras de segurança do núcleo
  (`no-eval`, `no-new-func`, `no-script-url`, `no-proto`, `no-caller`, `no-extend-native`,
  `no-new-wrappers`, `no-debugger`), `@typescript-eslint/no-explicit-any`, e as regras
  com tipo `no-floating-promises` (com exceção para `test`, `describe`, `it` do
  `node:test`), `no-misused-promises`, `await-thenable`, `no-implied-eval`,
  `only-throw-error`, `no-for-in-array`, `no-array-delete`, `no-base-to-string`; no React,
  `rules-of-hooks` e `exhaustive-deps`. Tudo `error`; `eslint-disable` sem efeito também.
- `eslint.config.mjs`: api, console, web, db, packages e scripts. Código de produção é
  tipado pelo `tsconfig.json` mais próximo (`projectService`); testes e scripts `.mjs`
  são tipados por `tsconfig.lint.json` (novo, só para lint, nunca compila).
- `apps/campo/eslint.config.mjs`: o aplicativo, com baseline própria.
- `eslint-suppressions.json` (140 achados) e `apps/campo/eslint-suppressions.json`
  (292), gerados por `eslint --suppress-all`.
- `lint-teto.json`: total 432, por projeto e por regra.
- `.prettierrc.json` (largura 100, resto padrão do Prettier 3), `.prettierignore`.
- `formato-baseline.json`: 664 dos 736 arquivos de código (ts, tsx, js, mjs, cjs, css)
  já estavam fora do Prettier. Ficam na lista; os 72 restantes e todo arquivo novo são
  conferidos. A lista só desce.
- `scripts/lint.mjs` (roda os dois lados e reprova se `apps/campo/node_modules` faltar),
  `scripts/lint-teto.mjs` (`conferir`, `contra-base <ref>`, `atualizar`),
  `scripts/formato-conferir.mjs` (`--criar`, `--podar`, `--formatar`).
- `.git-blame-ignore-revs` (na raiz do repositório), vazio de SHAs: a E17 não reformatou nada.
- Testes: `scripts/lint-teto.test.mjs` (20), `scripts/formato-conferir.test.mjs` (8),
  `scripts/lint-regras.test.mjs` (10).

**Arquivos editados:** `package.json` (devDependencies e os scripts `lint`, `lint:campo`,
`lint:podar`, `lint:teto`, `formato:conferir`; o `verificar` chama `lint`, `lint:teto` e
`formato:conferir` depois do typecheck), `package-lock.json`, `scripts/baseline.mjs`
(as três linhas de teste novo, nas duas tabelas), `scripts/conferir-workflows.test.mjs`
(a lista dos comandos do `verificar` passou de seis para nove, como o próprio teste
manda), `README.md` (seção "Lint e formatação" e a ordem de comandos),
`docs/COLOCAR-DE-PE.md` (a linha do `verificar`), `.github/workflows/verificar.yml`
(só os jobs `produto` e `aplicativo`: no `produto`, três passos depois do typecheck,
`Lint`, `Teto da baseline de lint` e `Formatação`; no `aplicativo`, um passo
`Lint do aplicativo`. Nenhum nome de job mudou; o job `imagens` não foi tocado).

**O que o lint achou hoje (baseline, por regra, 432 no total):**
`no-floating-promises` 249 (238 no aplicativo, das quais 202 são `fireEvent` do Testing Library 14.0.1 em
teste, que devolve promessa e ninguém aguarda; e 11 em `apps/web/src`), `no-misused-promises` 25 (24 em `apps/web/src`, 1 em `scripts/baseline.mjs`),
`no-base-to-string` 32, `no-explicit-any` 23, `no-regex-spaces` 20,
`no-require-imports` 36 (aplicativo), `no-loss-of-precision` 7, `prefer-const` 6,
`no-unused-vars` 7, `exhaustive-deps` 5, `only-throw-error` 5, `no-extend-native` 4,
`no-useless-escape` 4, `no-irregular-whitespace` 5 e 4 achados avulsos (`no-control-regex`, `no-script-url`, `no-sparse-arrays`, `no-var`). A lista exata
está em `lint-teto.json`. Os 5 `exhaustive-deps`, os 25 `no-misused-promises` e os 11
`no-floating-promises` fora de teste são candidatos a defeito real e valem leitura do Rafael.

**Como o teto só desce (três travas, todas provadas):**

1. O ESLint reprova achado novo (a contagem por arquivo e regra passou da registrada) e
   reprova supressão sobrando (`saidas/07`: depois de corrigir um achado, é preciso
   `npm run lint:podar`).
2. `lint-teto.json` é EXATAMENTE a soma das duas baselines (`npm run lint:teto`); folga
   ou falta reprova, por total e por regra.
3. Em pull request, `lint-teto.mjs contra-base <sha da base>` reprova se o total, a
   contagem de uma regra, uma regra nova ou um arquivo novo na baseline de formatação
   subiu em relação ao ramo-base. É a trava que fecha o buraco de regenerar a baseline
   com `--suppress-all` depois de introduzir um defeito (`saidas/04`: nesse caso o ESLint
   sozinho passa verde, e a trava reprova).

**Desvio do roteiro na formatação.** O roteiro dizia "`prettier --check` só nos arquivos
do PR". A baseline de arquivos faz o mesmo trabalho sem precisar saber o ramo-base
(que muda entre pull request e push) e ainda pega o arquivo que uma mudança estragou sem
tocá-lo. O efeito prático para quem escreve: arquivo NOVO tem de nascer formatado
(`node scripts/formato-conferir.mjs --formatar`), e arquivo já formatado tem de continuar.

**Prova de que as regras mordem ("PR de prova" feito na árvore e desfeito)**, com a saída
em `saidas/`:

- chamada assíncrona sem `await` em `apps/api/src` reprova com `no-floating-promises` (`01`);
- hook com dependência faltando em `apps/web/src` reprova com `react-hooks/exhaustive-deps` (`02`);
- `eval` e `any` explícito novos reprovam (`03`);
- baseline regenerada com defeito novo: o lint passa, `lint:teto` e `atualizar` reprovam, e
  subir o teto à mão fecha o `conferir` mas reprova em `contra-base HEAD` (`04`);
- arquivo novo fora do Prettier reprova, e baselinar o arquivo novo reprova em `contra-base` (`05`);
- depois de restaurar, tudo volta a verde (`06`).

**Testes e portões, com números (todos no worktree, Node 24, em macOS):**

- `npm run lint`: monorepo OK, aplicativo OK (`saidas/10-lint.txt`).
- `npm run lint:teto`: 432 supressões, confere (`saidas/11-lint-teto.txt`).
- `npm run formato:conferir`: 739 arquivos de código, 664 na baseline (`saidas/12-formato.txt`).
- `npm run typecheck`: verde (`saidas/14-typecheck.txt`).
- `npm run test:campo`: 139 suítes, 1997 de 1997, jest e leitura do código concordam
  (`saidas/17-test-campo.txt`).
- `npm run conferir:numeros`: "Todos os números da documentação batem" (`saidas/16-conferir-numeros.txt`).
  Nenhum total do README mudou: o conferidor não conta `scripts/` no total.
- `npm run test:scripts`: ver "Resultado final" logo abaixo.
- `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`: 9 de 10. O
  caso que reprova é `nenhum travessão em texto nenhum`, por
  `docs/evidencias-v2/G01/V2-F01-E16/RESUMO.md:53`, arquivo de OUTRA etapa já presente em
  `origin/v2/f01` (a linha cita o caractere de travessão literal entre crases). É anterior a
  esta etapa e não foi tocado aqui; ver "Para o orquestrador". Nenhum arquivo desta etapa
  traz o caractere (`saidas/15-regras-de-conteudo.txt`).

**Limitações.**

- O lint com tipos do aplicativo só mede de verdade com `apps/campo/node_modules` e os
  pacotes `@dc360/shared` e `@dc360/campo` compilados (`dist`). Sem isso `scripts/lint.mjs`
  reprova (aplicativo) e a baseline não bate. O CI já instala e compila antes (job `produto`
  depois do typecheck, job `aplicativo` depois do `test:campo`).
- Não rodei o CI: o workflow é validado por `conferir-workflows.test.mjs` e pelos casos
  novos de `lint-teto.test.mjs`, não por uma execução no GitHub. O passo `contra-base` em
  pull request depende de `git fetch --depth=1 origin <sha-da-base>` funcionar no runner; a
  primeira execução real é a prova.
- O lint do `windows` não existe (só `produto` e `aplicativo`, Linux). `lint-regras.test.mjs`
  e os demais rodam no `test:scripts` do job `windows`; não foram executados em Windows aqui.
- Reformatar o repositório inteiro, corrigir achados em massa, regras de acessibilidade do
  React Native (F23-E02) e lint do `mockup/` não fazem parte desta etapa.
- Disco: `node_modules` do worktree apagados no fim.

**Resultado final de `npm run test:scripts`** (`saidas/18-test-scripts.txt`): 585 casos, 581 passam, 0 falham, 4 pulados por ambiente (os mesmos de antes), código 0. Antes desta etapa eram 547; os 38 a mais são os três arquivos novos. `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/19-baseline-test.txt`).

## Justificativa

- **Baseline nativa do ESLint e não script próprio.** O `--suppress-all` do ESLint 9.24+
  já guarda a contagem por arquivo e regra e reprova achado novo e supressão sobrando.
  Reimplementar isso seria mais código para manter. O que ele não cobre (regenerar a baseline
  junto com o defeito) ganhou a trava `lint-teto` contra o ramo-base.
- **Raiz única de ESLint para o aplicativo.** Dá um binário, uma versão e zero dependência
  nova no lockfile do Expo; a F23-E02 acrescenta as regras de React Native em
  `apps/campo/eslint.config.mjs` sem mexer na raiz.
- **Lista curta de regras com tipo.** `recommendedTypeChecked` inteiro produz milhares de
  achados de estilo (`no-unsafe-*`) que escondem a promessa solta e o `await` que falta, que
  são o que o SAST (E05) não pega.
- **Baseline de formatação por arquivo.** 90% do código está fora do Prettier; exigir
  formatação só "nos arquivos do PR" obrigaria cada PR a reformatar arquivos inteiros e a
  conflitar com os outros. Com a lista, só o arquivo novo e o já formatado são cobrados.
- **`tsconfig.lint.json` à parte.** Testes e scripts não entram nos `tsconfig.json` de
  compilação; sem um projeto para eles o lint com tipos não os alcança (e é nos testes que
  `fireEvent` sem `await` aparece).

## Para o orquestrador

Linha sugerida do STATUS: `V2-F01-E17 | IMPLEMENTADA | candidato <sha7> (sem push) | ESLint 9 tipado + Prettier nos dois lados; baseline de 432 achados e 664 arquivos sem formatação que só desce (lint-teto.json, lint-teto.test.mjs e contra-base); PR de prova reprovado; 38 casos novos`.

Baseline de testes: `"V2-F01-E17": 20`, `"V2-F01-E17-formato": 8`, `"V2-F01-E17-regras": 10` em
`TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`, e os três arquivos em
`ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. O total esperado de `test-scripts` sobe 38.
Nenhum total do README ou do `COLOCAR-DE-PE.md` mudou.

Conflitos prováveis na integração: `dc360/package.json` (E09 acrescenta `engines`; a minha
mudança é só `devDependencies` e cinco scripts, mais o `verificar`), `dc360/package-lock.json`
(se outra etapa instalar pacote, regenerar com `npm install` e rodar o `auditar`),
`scripts/baseline.mjs` (as duas tabelas, no fim), `scripts/conferir-workflows.test.mjs` (a
lista de comandos do `verificar`: se outra etapa também acrescentar comando, somar), e
`verificar.yml` (só jobs `produto` e `aplicativo`).

Efeito colateral para as outras etapas do lote: depois de integrada, todo arquivo de código
NOVO que elas criarem tem de estar formatado (`node scripts/formato-conferir.mjs --formatar`
formata só os que não estão na baseline) e passar no `npm run lint`; achado novo reprova.
O texto de um arquivo novo que as outras etapas criaram sem Prettier fará o job `produto`
ficar vermelho até serem formatados.

Falha anterior a esta etapa que o orquestrador deve resolver (não é minha): o portão de
conteúdo reprova por `docs/evidencias-v2/G01/V2-F01-E16/RESUMO.md:53` (travessão literal
entre crases).

Pendências humanas (o Rafael faz fora do repositório):

1. Ler a baseline por regra (`lint-teto.json`, `eslint-suppressions.json`) e decidir quais
   dos 5 `exhaustive-deps`, 25 `no-misused-promises` e 11 `no-floating-promises` de
   `apps/web/src` são defeito (viram trabalho de correção, descendo o teto).
2. Decidir quando fazer o PR único de reformatação (esvazia `formato-baseline.json`) e, depois
   de mesclado, acrescentar o SHA em `.git-blame-ignore-revs` e rodar
   `git config blame.ignoreRevsFile .git-blame-ignore-revs` em cada clone.
3. Depois da integração no ramo da fase, conferir o primeiro run do CI (os três passos novos
   do job `produto` e o do `aplicativo`, em especial o `contra-base` em pull request).
