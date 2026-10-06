# Resumo da linha de base

Gerado em 2026-10-05T21:33:07.708Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 22 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 7 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 38 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 105 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 84 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 1 | 10 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 1 | 68 s | confere | - |
| test-campo | `npm run test:campo` (.) | 2 | 20 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 1 | 4 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 1 | 28 s | confere | - |
| auditar | `npm run auditar` (.) | 1 | 0 s | confere | - |
| audit-raiz | `npm audit` (.) | 1 | 2 s | confere | - |
| audit-campo | `npm audit` (apps/campo) | 1 | 6 s | confere | - |
| expo-doctor | `npx expo-doctor` (apps/campo) | 1 | 21 s | confere | - |
| e2e | `npm run test:e2e` (.) | 1 | 53 s | confere | - |
| e2e-api | `npm run test:e2e:api` (.) | 1 | 46 s | confere | - |

Divergentes: 0 de 17.
