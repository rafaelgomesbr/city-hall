# Resumo da linha de base

Gerado em 2026-10-13T10:24:16.203Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 16 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 3 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 30 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 0 | 94 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 67 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 8 s | divergente | total: obtido 649, esperado 643 |
| teste-campo-app | `npx jest --silent` (apps/campo) | 0 | 52 s | divergente | total: obtido 1903, esperado 1880 |
| test-campo | `npm run test:campo` (.) | 0 | 46 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 4 s | divergente | total: obtido 230, esperado 226 |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 24 s | confere | - |
| auditar | `npm run auditar` (.) | 0 | 10 s | divergente | código de saída 0, esperado falha (ficou verde) |
| audit-raiz | `npm audit` (.) | 1 | 1 s | confere | - |
| audit-campo | `npm audit` (apps/campo) | 1 | 2 s | confere | - |
| expo-doctor | `npx expo-doctor` (apps/campo) | 1 | 6 s | confere | - |
| e2e | `npm run test:e2e` (.) | 0 | 37 s | confere | - |
| e2e-api | `npm run test:e2e:api` (.) | 0 | 147 s | divergente | a saída não contém "Passou: 271   Falhou: 0" |

Divergentes: 5 de 17.
