# V2-F00-E19, correção 5: `expo` e `expo-router` um patch atrás de novo, `expo-doctor` volta a 21 de 21

## Fatos

- **PREMISSA (dita como premissa, não como decisão):** o Rafael decidiu em 2026-10-13 (D1 do roteiro de aprovação) atualizar os seis pacotes do Expo que estavam um patch atrás, e a correção 4 aplicou o mesmo tratamento a outros cinco por analogia (pendência H24). A deriva de 2026-10-18 tem dois pacotes novos, e o mesmo tratamento foi aplicado a eles por analogia. **O Rafael não decidiu isso para estes dois pacotes.** A correção está feita e provada, e o patch desta pasta reverte com `git apply -R`.
- **Antes (`saidas/01-expo-doctor-ANTES.txt`, medido de novo no começo desta correção, sobre `6d9d09f`):** `npx expo-doctor` em `apps/campo` deu 20 de 21. Falhou a verificação de versões: `expo` esperado ~57.0.30, achado 57.0.29; `expo-router` esperado ~57.0.28, achado 57.0.27. O código do produto não mudou: o Expo publicou os patches depois da correção 4 (2026-10-14).
- **O que mudou:** `npx expo install expo@~57.0.30 expo-router@~57.0.28` em `dc360/apps/campo` (`saidas/02-expo-install.txt`; código 0, "changed 2 packages"). Mudaram só dois arquivos, e o `diff-da-correcao.patch` é o `git diff` deles:
  - `apps/campo/package.json`: `expo` ~57.0.29 para ~57.0.30 e `expo-router` ~57.0.27 para ~57.0.28. Nenhuma outra linha.
  - `apps/campo/package-lock.json` (44 linhas a mais, 34 a menos): a raiz do aplicativo com as duas versões novas, e o que esses dois pacotes puxam pela árvore: `expo` 57.0.30, `expo-router` 57.0.28, `@expo/cli` 57.0.31, `babel-preset-expo` 57.0.16, `@expo/router-server` 57.0.13, `@expo/metro-runtime` 57.0.17, `@expo/ui` 57.0.25, `expo-widgets` 57.0.26, `expo-constants` ^57.0.22 como exigência, `@expo/osascript` 2.7.1 para 2.8.1, `@expo/package-manager` 1.13.1 para 1.14.2 e um `@expo/json-file` 11.2.1 aninhado dentro do `@expo/package-manager`. Todos são ferramentas e módulos do próprio Expo SDK 57; o SDK continua o 57.
  - `dc360/package-lock.json` não foi tocado pelo comando (`git status` mostra só os dois arquivos acima como código). Nenhum outro `package.json` mudou.
- **Depois:**
  - `npx expo-doctor`: **21 de 21**, código 0 (`saidas/03-expo-doctor-DEPOIS.txt`).
  - `npm run test:campo` (TypeScript do aplicativo e jest inteiro): 134 suítes e 1927 testes, todos passando, código 0 (`saidas/04-test-campo.txt`).
  - `npm run test --workspace @dc360/campo` (pacote de campo): 10 arquivos e 223 testes, todos passando (`saidas/05-test-workspace-campo.txt`).
  - Portões do aplicativo, `node --test scripts/portao-*.test.mjs`: 79 testes, 79 passando, 0 falhas, 0 pulados (`saidas/06-portoes-do-aplicativo.txt`).
  - `npm run auditar`: código 0, "Runtime limpo, e o aplicativo sem advisory nova" (`saidas/07-auditar-DEPOIS.txt`).
  - `npm audit` em `apps/campo`, antes e depois: 59 avisos nos dois (8 moderados, 50 altos, 1 crítico), os mesmos pacotes e os mesmos pares (pacote, advisory); nenhum aviso novo, nenhum de runtime novo (`saidas/10-npm-audit-campo-antes-e-depois.txt`). O código de saída do `npm audit` cru é 1 antes e depois: é o estado já documentado do aplicativo (o CP-03 trata isso por `npm run auditar`).
  - `npm run conferir:numeros`: 25 afirmações conferidas, 0 divergência, rodado depois dos acertos de texto (`saidas/08-conferir-numeros.txt`).
  - Portão de conteúdo `regras-de-conteudo.test.ts`: 10 de 10 (`saidas/09-regras-de-conteudo.txt`).
- **Textos acertados:** `dc360/apps/campo/PENDENCIAS.md` (item 17, bloco novo no topo), `dc360/apps/campo/LEIA-ME.md`, `dc360/README.md` (a frase do estado do `expo-doctor`), `dc360/docs/COLOCAR-DE-PE.md` e `docs/roadmap-v2/pendencias-humanas.md` (H24). Os registros históricos datados (correções 2 e 4, "57.0.29" e "57.0.27" em texto de 2026-10-14) foram mantidos, porque são fato daquele dia. Nenhum esperado do `baseline.mjs` mudou.
- **Não verificado aqui:** o CI em Linux com os pacotes novos (nada commitado); o aplicativo num aparelho físico (pendência humana, V2-F14-E12); e se o próximo binário nativo compila, já que `expo` e `expo-router` têm código nativo e mudar versão exige recompilar. A suíte do aplicativo roda em jest, não em aparelho.
- **Limitação:** a deriva volta a cada patch novo do Expo (esta é a terceira vez em cinco dias). O 21 de 21 vale para o dia 2026-10-18 e para o registro do Expo naquele dia.

## Justificativa

O critério "`expo-doctor` 21 de 21" do gate G00 voltou a ficar aberto por deriva externa. A subida é de patch dentro do mesmo SDK 57, mudou só `package.json` e `package-lock.json` do aplicativo, e o jest do aplicativo (1927 testes), o pacote de campo (223), os portões do aplicativo (79) e a política de auditoria (código 0, sem aviso novo) passam. Fechar é mais barato que carregar uma exceção que reabriria a cada patch. A ressalva honesta é a premissa: a analogia com a D1 é do coordenador, e a confirmação do Rafael fica pendente em H24.
