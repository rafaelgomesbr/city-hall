# Resumo da linha de base

Gerado em 2026-10-07T04:20:49.540Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 3 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-console | `npm run test:console` (.) | 0 | 162 s | confere | - |
| test-scripts | `npm run test:scripts` (.) | 0 | 12 s | confere | - |
| conferir-numeros | `npm run conferir:numeros` (.) | 0 | 56 s | confere | - |

Divergentes: 0 de 5.
