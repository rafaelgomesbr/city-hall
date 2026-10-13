---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

| Critério (DoD e testes da etapa) | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde no Windows (antes morria com ENOENT) | PASS | `cd dc360 && npm run auditar`: saída 0, "Runtime: 0", "Runtime limpo, e o aplicativo sem advisory nova". O ENOENT não existe mais (`shell: process.platform === "win32"` em `scripts/auditar.mjs`). |
| `npm audit --omit=dev` zero na raiz | PASS | "found 0 vulnerabilities". Sem `--omit=dev`: 3 moderadas de desenvolvimento (vitest), só avisa. |
| Campo conforme a política | PASS com ressalva | `npm audit --omit=dev` em `apps/campo`: 55 (8 moderadas, 46 altas, 1 crítica `shell-quote`). Todas caem nos 6 pacotes com advisory própria da lista nomeada (brace-expansion, braces, decode-uri-component, node-forge, shell-quote, sprintf-js). Coerente com o CP-03 (STATUS seção 7). |
| Cada exceção tem nome, dono e prazo | PASS nos dados, FAIL no portão | As 6 entradas têm `dono: Rafael` e `ate: 2027-01-05`. Mas o portão não exige que `ate` exista (achado 1). |
| Exceção vencida reprova | PASS (sonda) | `PRAZO` trocado para 2020-01-05: "REPROVADO: o prazo da exceção venceu para brace-expansion, braces, ...", saída 1. Arquivo restaurado. NÃO há teste automatizado disso (o comentário de `auditar.test.mjs` admite). |
| Exceção SEM prazo reprova (teste negativo da etapa) | FAIL | Achado 1. |
| Exceção com correção disponível reprova | PASS | `auditar.test.mjs`, caso 6; `comCorrecao: true` só em brace-expansion e shell-quote, com justificativa do CP-03. |
| `expo-doctor` 21 de 21 sem pular a checagem de versões | FAIL hoje | Achado 2. |
| `auditar.test.mjs` com JSON sintético | PASS parcial | `node --test scripts/auditar.test.mjs`: 7 de 7. Cobre runtime, só desenvolvimento, advisory nova, aceita com dono e prazo, correção disponível. NÃO cobre "sem prazo" nem "vencida". |

## Evidência

- `npm run auditar` (dc360): saída 0.
- `npm audit --omit=dev` (raiz): 0. (apps/campo): 55, todas nas 6 aceitas.
- `node --test scripts/auditar.test.mjs`: 7 passam, 0 falham.
- `npx expo-doctor` (apps/campo): "20/21 checks passed", 6 pacotes com patch atrasado (expo ~57.0.28 contra 57.0.27, expo-crypto, expo-location, expo-router, expo-splash-screen, jest-expo).
- CI run 37739535524: job "Dependências com vulnerabilidade conhecida (auditar)" verde.
- Evidência do implementador em `docs/evidencias-v2/G00/V2-F00-E19/` (21/21 medido em 2026-10-08).

## Cenários positivos

Runtime limpo passa; aceita nomeada com prazo futuro passa; só desenvolvimento avisa e passa.

## Cenários negativos

- Prazo vencido (sonda real): reprova, saída 1.
- Runtime vulnerável, advisory nova, aceita com correção: reprovam (teste sintético).
- Exceção sem `ate` (sonda real): passa com saída 0. Defeito.

## Tentativas de reprovar

1. Troquei `PRAZO` para 2020-01-05 em `scripts/auditar.mjs`: o portão reprovou como devia. `cp` de volta, `git status` limpo.
2. Removi `ate: PRAZO` das entradas que o `sed` alcançou (4 de 6): `auditar` saiu 0. Em JavaScript `undefined < "2026-10-13"` é falso, então a checagem `ate < hoje` nunca dispara. Restaurado.
3. Rodei `expo-doctor` hoje: 20 de 21.
4. Procurei o `baseline.mjs`: `auditar` ainda tem `esperado: { codigo: "falha" }` e `expo-doctor` espera `20/21 checks passed` (linha 414). O roteiro de baseline ficou com expectativa obsoleta, ou passa a divergir.

## Achados

1. **Corrige antes de crescer (descumpre texto da etapa).** `scripts/auditar.mjs`: exceção sem `ate` (ou sem `dono`/`motivo`) não reprova. Reprodução: remover `ate: PRAZO` de uma entrada de `ACEITAS_NO_APLICATIVO` e rodar `node scripts/auditar.mjs`; saída 0. A etapa pede "exceção sem prazo reprova" e "cada exceção com dono, motivo e ate", e o teste negativo "exceção sem prazo reprova" e "exceção vencida reprova" não existe em `auditar.test.mjs`. Hoje todas as 6 têm prazo, então não há dano presente; é buraco no portão. Dono: E19.
2. **Corrige antes de crescer.** `npx expo-doctor` dá 20 de 21 hoje (2026-10-13), porque o Expo publicou patches novos depois de 2026-10-08. O README e o LEIA-ME dizem "21 de 21 (medido em 2026-10-08)", datado e honesto, mas o DoD ("21 de 21 sem pular a checagem") não se reproduz, e o CI liga `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (`verificar.yml:535`), então nada vigia esse drift. Reprodução: `cd dc360/apps/campo && npx expo-doctor`. Dono: E19 (decidir fixar via `expo.install.exclude`/atualizar de novo, ou rebaixar o critério a "medido em data").
3. **Anotado.** `dc360/scripts/baseline.mjs` ainda espera `auditar` em falha e `expo-doctor` com "20/21 checks passed" (linhas 411 a 414). Não rodei o baseline (35 a 50 min).
4. **Anotado.** O portão do aplicativo olha só pacotes com advisory "própria"; os 55 listados incluem `jest*`, `react-native*` e `expo` como dependências de runtime do campo. A justificativa (cadeia) está comentada no código e é decisão do CP-03; apenas registro.

## Não verificado

- `npm run test:e2e:api`, `test:campo`, `test:isolamento`, `typecheck` depois do `audit fix`: não reexecutei (carga alta; o CI do SHA está 9 de 9 verde e o implementador arquivou as saídas). Confio no CI, não em mim.
- Se `npm run auditar` passa no Linux: só pelo CI (job verde).
- A lista de exceções foi lida por mim, não por Rafael (validação humana da etapa).

## Risco residual

Exceções do Expo vencem em 2027-01-05; o portão reprova no vencimento (provado por sonda), mas sem teste. A saída definitiva (subir o SDK) exige novo binário.

## Motivo do humano

A etapa pede que Rafael leia a lista de exceções com dono e prazo; isso só uma pessoa faz.
