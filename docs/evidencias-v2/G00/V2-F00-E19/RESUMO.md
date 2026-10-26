# V2-F00-E19: npm audit conforme a política do CP-03 e expo-doctor

Medido em 2026-10-08. CP-03 decidido por Rafael em 2026-10-07.

## O que mudou
- `dc360/scripts/auditar.mjs`: invocação portátil no Windows (`shell`), exceções do aplicativo com `motivo`, `dono` e `ate`, prazo vencido reprova, `comCorrecao` para a correção inaplicável.
- `dc360/scripts/auditar.test.mjs` (novo): 7 testes com saída sintética de `npm audit --json`. Não cobre o vencimento do prazo (depende do relógio).
- `npm audit fix` na raiz (sem `--force`): fecha `source-map-js`.
- `apps/campo`: `expo install --fix` e `npm install` dos três pacotes restantes, todos dentro do SDK 57 (patch). Muda pacote nativo: o próximo binário precisa ser recompilado.
- `source-map-js` saiu da lista de exceções do aplicativo porque o alinhamento fechou o aviso.
- README e `apps/campo/LEIA-ME.md` corrigidos (sem "hoje não fecha" nem "20 de 21").

## Resultado
| Passo | Resultado | Saída |
| --- | --- | --- |
| `node scripts/auditar.mjs` | saída 0, runtime 0, app sem advisory nova | 01 |
| `auditar.test.mjs` | 7 de 7 | 02 |
| `expo-doctor` | 21 de 21 (antes 20 de 21) | 03 |
| `test:scripts` | 213 testes, 0 falhas, 4 pulados | 04 |
| `test:campo` | 1861 casos, tipos limpos | 05 |
| `npm test` (workspaces) | 187, 168, 1267, 259, 643, 327 (+3 pulados), sem falha | 06 |
| `test:isolamento` | 327 e 3 pulados | 07 |
| `typecheck` | saída 0 | 08 |
| `npm audit --omit=dev` (raiz) | 0 vulnerabilidades | 09 |
| `test:e2e:api` | 271 passou, 0 falhou | 10 |

## Limitações
- `npm audit` puro continua listando 3 avisos de desenvolvimento na raiz (`vitest`/`tinypool`, salto de major) e 55 na árvore do aplicativo (ferramenta do Expo). A política os aceita: o veredito é do `npm run auditar`.
- Uma execução de `npm test` mostrou 1 falha em `regras-de-conteudo.test.ts` ("nenhum travessão") que não se reproduziu em 4 reexecuções seguintes. A causa não foi identificada (a mensagem não foi capturada); suspeita de arquivo mudando durante a leitura enquanto a árvore do Expo era reinstalada.
- O CI chama `npm audit`, não `npm run auditar`: ligar o portão ao CI é F01-E03/E06.
- Falta validação humana: Rafael ler a lista de exceções (dono, motivo, prazo).
