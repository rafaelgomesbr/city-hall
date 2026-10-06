# Resumo da linha de base

Gerado em 2026-10-06T00:01:57.441Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 5 s | confere | - |
| teste-db | `npm run test:isolamento` (.) | 0 | 57 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 11 s | confere | - |
| teste-api | `npm run test:api` (.) | 1 | 190 s | divergente | falhas: obtido 3, esperado 2 |
| teste-console | `npm run test:console` (.) | 0 | 96 s | confere | - |
| teste-web | `npm run test --workspace @dc360/web` (.) | 1 | 9 s | confere | - |

Divergentes: 1 de 6.
