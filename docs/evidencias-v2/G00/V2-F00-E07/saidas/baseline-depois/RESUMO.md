# Resumo da linha de base

Gerado em 2026-10-06T15:22:03.572Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 4 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 50 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 3 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 129 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 1 | 12 s | confere | - |

Divergentes: 0 de 5.
