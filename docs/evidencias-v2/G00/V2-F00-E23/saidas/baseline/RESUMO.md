# Resumo da linha de base

Gerado em 2026-10-07T06:51:50.561Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 16 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 29 s | confere | - |
| teste-api | `npm run test:api` (.) | 0 | 92 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 8 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 24 s | confere | - |

Divergentes: 0 de 6.
