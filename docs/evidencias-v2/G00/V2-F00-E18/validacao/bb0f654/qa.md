---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). Mac, Node v24.15.0, Playwright com Chromium e Firefox já instalados.

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| `if-none-match` em `allowedHeaders`, nome a nome, sem curinga, `origin` intacto | PASS | `apps/api/src/servidor.ts:402-421`: `origin: config.origens`, lista `content-type, authorization, accept, if-none-match` |
| Teste de preflight cobre e morde | PASS | `npx vitest run --root apps/api test/cors-do-envio-de-evidencia.test.ts`: 8 de 8 (`e18-01`); sem `if-none-match`: 3 de 8 reprovam (`e18-02`) |
| Origem fora da lista sem `access-control-allow-origin` | PASS | mutação `origin: true`: o caso "origem fora da lista" reprova (`e18-04`) |
| `x-qualquer` não liberado | PASS | mutação acrescentando `x-qualquer` à lista: o caso "cabeçalho qualquer fora da lista" reprova (`e18-03`) |
| Segundo PUT na mesma chave, URL vencida, assinatura trocada, chave de outro município | PASS (testes verdes) | os casos do arquivo de preflight passam; não mutei o armazenamento |
| `npm run test:e2e` Chromium | PASS | passo `e2e`: "Passou: 70 Falhou: 0", código 0 |
| `MOTOR=firefox npm run test:e2e` | PASS | passo `e2e-firefox`: "Passou: 70 Falhou: 0", código 0 |
| `npm run test:e2e:api` com a foto subindo na seção 13 | PASS | passo `e2e-api`: "Passou: 288" e "Passou: 64", código 0; seção 13 "os bytes sobem direto para o armazenamento", "o servidor confirma o envio", "a imagem carrega pela URL assinada" (`SAIDAS/baseline-completo/18-e2e-api.txt`) |
| E2E contra a API morde sem o conserto | PASS | `servidor.ts` sem `if-none-match`: `npm run test:e2e:api` código 1, morre na seção 13 com "TypeError: Failed to fetch" (`e18-05`); restaurado |
| Extra: e2e contra a API em Firefox | PASS | `node scripts/e2e-api.mjs firefox`: "Passou: 288" e "Passou: 64", código 0, seção 13 inteira (`e18-06`) |
| Regressão `test:api` e painel | PASS | API 1326 aprovados, 20 pulados, 1 falha só de máquina (LibreSSL, `openssl-do-teste.test.ts`); painel 665 de 665 |
| `INDEX.md` byte a byte | PASS | raiz 27 de 27, `saidas/baseline-depois/INDEX.md` 9 de 9 |

## Evidência

Linha de base completa (`SAIDAS/baseline-completo/16-e2e.txt`, `17-e2e-firefox.txt`, `18-e2e-api.txt`, `05-teste-api.txt`, `07-teste-web.txt`); `SAIDAS/e18-01` a `e18-06`. Cada mutação de `apps/api/src/servidor.ts` desfeita com `git restore`; nenhuma porta 4173, 3691 ou 4691 ficou ocupada; `git status` limpo.

## Cenários positivos

Os três e2e pedidos verdes, mais o e2e contra a API em Firefox; preflight 8 de 8.

## Cenários negativos

Sem `if-none-match` (unidade e e2e), origem aberta, cabeçalho extra na lista: todos reprovam.

## Tentativas de reprovar

1. Abri a origem (`origin: true`) para ver se o teste percebe CORS frouxo: percebe.
2. Acrescentei um cabeçalho fora do necessário: o teste que fixa a lista exata reprova.
3. Rodei o e2e inteiro contra a API sem o conserto para provar que a seção 13 depende dele.
4. Rodei o e2e contra a API também em Firefox, que a etapa não exige, para procurar a instabilidade registrada na rodada 1: verde nesta rodada.

## Achados

Nenhum.

## Não verificado

- CORS do armazenamento externo (S3 real) e por ambiente: fora da etapa (F06-E15, F01-E10).
- Mutação no armazenamento local para provar que os casos de URL vencida, assinatura trocada e chave de outro município mordem: não feita (não é código desta etapa); os casos passam.
- O e2e no CI: run não lido.

## Risco residual

Baixo.

## Motivo do humano

Nenhum: a foto subindo na seção 13 foi observada pela execução real do e2e nos dois motores.
