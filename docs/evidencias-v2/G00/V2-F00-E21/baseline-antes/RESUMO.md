# Resumo da linha de base

Gerado em 2026-10-07T05:34:45.684Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 16 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 92 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 1 | 8 s | confere | - |
| test-campo | `npm run test:campo` (.) | 2 | 15 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | confere | - |

Divergentes: 0 de 5.
