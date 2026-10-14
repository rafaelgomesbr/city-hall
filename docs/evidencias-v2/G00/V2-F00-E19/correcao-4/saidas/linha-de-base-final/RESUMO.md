# Resumo da linha de base

Gerado em 2026-10-14T18:08:06.982Z. Resultado esperado: o da árvore verde de hoje (a linha vermelha de 2026-09-30, REL:01 seção 3.4, é o histórico). Situações: confere; divergente-explicada (achado nomeado, ver o detalhe); divergente (sem explicação, reprova).

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 8 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 1 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 23 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 1 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 84 s | divergente | código de saída 1, esperado 0; falhas: obtido 1, esperado 0 |
| teste-console | `npm run test:console` (.) | 0 | 42 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 5 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 0 | 20 s | confere | - |
| test-campo | `npm run test:campo` (.) | 0 | 19 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | divergente | puladas: obtido 0, esperado 4 |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 14 s | confere | - |
| auditar | `npm run auditar` (.) | 0 | 3 s | confere | - |
| audit-raiz | `npm audit` (.) | 1 | 1 s | confere | - |
| audit-campo | `npm audit` (apps/campo) | 1 | 1 s | confere | - |
| expo-doctor | `npx expo-doctor` (apps/campo) | 0 | 2 s | confere | - |
| e2e | `npm run test:e2e` (.) | 0 | 26 s | confere | - |
| e2e-api | `npm run test:e2e:api` (.) | 0 | 118 s | confere | - |

Conferem: 15 de 17. Divergentes sem explicação: 2. Divergentes explicadas: 0.
