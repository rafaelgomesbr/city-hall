# Resumo da linha de base

Gerado em 2026-10-07T03:14:58.653Z. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.

| Passo | Comando | Saída | Duração | Situação | Detalhe |
| --- | --- | --- | --- | --- | --- |
| teste-shared | `npm run test --workspace @dc360/shared` (.) | 1 | 7 s | confere | - |
| teste-campo-pacote | `npm run test --workspace @dc360/campo` (.) | 0 | 20 s | confere | - |
| teste-campo-app | `npx jest --silent` (apps/campo) | 1 | 85 s | confere | - |
| test-campo | `npm run test:campo` (.) | 2 | 25 s | confere | - |

Divergentes: 0 de 4.
