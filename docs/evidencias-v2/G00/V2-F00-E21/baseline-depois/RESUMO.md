# Resumo da linha de base

Gerado em 2026-10-07T05:59:03.020Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| typecheck | `npm run typecheck` (.) | 0 | 16 s | confere | - |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 3 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 30 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-api | `npm run test:api` (.) | 0 | 96 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 72 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 0 | 8 s | confere | - |
| test-campo | `npm run test:campo` (.) | 0 | 32 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 24 s | confere | - |

Divergentes: 0 de 10.
