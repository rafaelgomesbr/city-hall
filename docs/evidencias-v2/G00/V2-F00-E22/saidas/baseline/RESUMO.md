# Resumo da linha de base

Gerado em 2026-10-07T06:29:39.033Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 16 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 3 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 32 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 0 | 96 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 72 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 8 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 23 s | confere | - |
| auditar | `npm run auditar` (.) | 1 | 0 s | confere | - |
| audit-raiz | `npm audit` (.) | 1 | 2 s | confere | - |
| audit-campo | `npm audit` (apps/campo) | 1 | 7 s | confere | - |
| expo-doctor | `npx expo-doctor` (apps/campo) | 1 | 8 s | confere | - |

Divergentes: 0 de 13.
