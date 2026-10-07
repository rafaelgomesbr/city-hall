# Resumo da linha de base

Gerado em 2026-10-07T05:26:39.631Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 0 | 3 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 1 | 8 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 3 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 24 s | confere | - |

Divergentes: 0 de 4.
