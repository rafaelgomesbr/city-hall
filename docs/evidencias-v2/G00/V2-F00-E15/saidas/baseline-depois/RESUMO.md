# Resumo da linha de base

Gerado em 2026-10-07T03:45:26.068Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 18 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 3 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 116 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 1 | 45 s | confere | - |
| test-campo | `npm run test:campo` (.) | 2 | 7 s | confere | - |

Divergentes: 0 de 6.
