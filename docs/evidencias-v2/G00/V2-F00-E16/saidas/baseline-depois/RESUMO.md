# Resumo da linha de base

Gerado em 2026-10-07T03:58:33.394Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 2 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 0 | 30 s | confere | - |
| test-campo | `npm run test:campo` (.) | 2 | 6 s | confere | - |

Divergentes: 0 de 3.
