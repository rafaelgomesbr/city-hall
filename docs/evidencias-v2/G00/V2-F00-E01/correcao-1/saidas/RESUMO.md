# Resumo da linha de base

Gerado em 2026-10-13T11:51:43.440Z. Resultado esperado: o da árvore verde de hoje (a linha vermelha de 2026-09-30, REL:01 seção 3.4, é o histórico). Situações: confere; divergente-explicada (achado nomeado, ver o detalhe); divergente (sem explicação, reprova).

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 20 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 3 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 32 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 0 | 108 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 66 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 8 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 0 | 61 s | confere | - |
| test-campo | `npm run test:campo` (.) | 0 | 41 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 4 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 31 s | confere | - |
| auditar | `npm run auditar` (.) | 0 | 10 s | confere | - |
| audit-raiz | `npm audit` (.) | 1 | 1 s | confere | - |
| audit-campo | `npm audit` (apps/campo) | 1 | 3 s | confere | - |
| expo-doctor | `npx expo-doctor` (apps/campo) | 1 | 25 s | divergente-explicada | código de saída 1, esperado 0; a saída não contém "21/21 checks passed" EXPLICADA por V-DEP-4 (dc360/apps/campo/PENDENCIAS.md, item 17): seis pacotes do Expo um patch atrás do que o SDK 57 exige hoje (deriva externa, o 21 de 21 era de 2026-10-08); atualizar é decisão do Rafael |
| e2e | `npm run test:e2e` (.) | 0 | 39 s | confere | - |
| e2e-api | `npm run test:e2e:api` (.) | 0 | 148 s | confere | - |

Conferem: 16 de 17. Divergentes sem explicação: 0. Divergentes explicadas: 1 (expo-doctor por V-DEP-4).
