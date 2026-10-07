# Resumo da linha de base

Gerado em 2026-10-07T04:23:36.197Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-db | `npm run test:isolamento` (.) | 1 | 92 s | divergente | código de saída 1, esperado 0; falhas: obtido 1, esperado 0 |
| teste-campo-app | `npx jest --silent` (apps/campo) | 0 | 62 s | confere | - |

Divergentes: 1 de 2.
