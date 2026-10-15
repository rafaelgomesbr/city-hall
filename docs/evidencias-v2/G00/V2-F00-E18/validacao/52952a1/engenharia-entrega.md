---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- **Três e2e verdes no CI.** Job "Fluxo ponta a ponta no navegador" (116039196287), artefato `navegador-7585801...`: modo local em Chromium "Passou: 70   Falhou: 0" (`04-e2e-local-chromium.txt`), modo local em Firefox "Passou: 70   Falhou: 0" (`05-e2e-local-firefox.txt`), contra a API "Passou: 288   Falhou: 0" e "Geometria da tela estreita ... Passou: 64   Falhou: 0" (`06-e2e-contra-a-api.txt`). Nenhum passo do job tem `continue-on-error`; os passos de Firefox e da API rodam mesmo se o Chromium falhar (`if: !cancelled() && steps.esperar.outcome == 'success'`), então o run traz as três saídas. O job "Linha de base" repete `e2e` e `e2e-api` e os dois "conferem".
- **Seção 13 (foto pelo painel contra a API) conclui.** No mesmo artefato: "os bytes sobem direto para o armazenamento", "o servidor confirma o envio", "a foto do agente aparece para o coordenador", "a imagem carrega pela URL assinada", todos OK. É o PUT com `if-none-match` passando pelo preflight num navegador real.
- **Preflight coberto por teste e o teste morde.** `apps/api/test/cors-do-envio-de-evidencia.test.ts`, 8 casos, verde no CI ("✓ ... (8 tests)") e aqui (`e18-01-cors-verde.txt`). Mutação 1: tirei `"if-none-match"` de `allowedHeaders` em `apps/api/src/servidor.ts:420`: 3 de 8 falham, entre eles "libera if-none-match para a origem do painel" (`e18-02-cors-MUTANTE-sem-if-none-match.txt`). Mutação 2: acrescentei `"x-qualquer"`: 1 de 8 falha, "cabeçalho qualquer fora da lista não é liberado" (`e18-03-cors-MUTANTE-x-qualquer.txt`). Restaurado com `git restore` depois de cada uma.
- **Negativos e autorização da etapa.** Os casos existem e passam: origem fora da lista sem `access-control-allow-origin`, `x-qualquer` recusado, segundo PUT na mesma chave recusado, URL vencida recusada, assinatura trocada recusada, chave de outro município recusada (linhas 129 a 193 do teste).
- **Instabilidade da rodada 1 (Firefox contra a API).** Registrada na política T42 como V-INS-06, dono `rafael` (`V2-F00-E03/classificacao-dos-vermelhos.md:266`). O CI roda o e2e contra a API só em Chromium; a DoD pede os dois locais em Chromium e Firefox e o da API, o que o CI cobre.

## Evidência

- Log do job em `$SP/val/engenharia-entrega/ci-job-116039196287.log`; artefato em `$SP/val/engenharia-entrega/art/navegador/`.
- `npm run build:shared` código 0; `npx vitest run --root apps/api test/cors-do-envio-de-evidencia.test.ts`: verde 8 de 8; mutante 1, 3 falhas; mutante 2, 1 falha (arquivos `e18-01` a `e18-03` em `$SP/val/engenharia-entrega/`).
- `git status --porcelain` depois das mutações: só as pastas `validacao/52952a1/`.

## Cenários positivos

- Os três e2e no Linux do CI; o preflight com `content-type,if-none-match` devolve os dois cabeçalhos.

## Cenários negativos

- Origem estranha, cabeçalho estranho, escrita repetida, URL vencida, assinatura trocada e chave de outro município: todos recusados pelos casos do teste.

## Tentativas de reprovar

- Removi o cabeçalho do CORS e acrescentei um curinga nominal: o teste pegou os dois.
- Conferi se o job e2e podia passar sem ter rodado o Firefox (passo condicionado ao preview): o artefato tem a saída do Firefox com 70 verificações.
- Procurei `continue-on-error` e `|| true` nos passos do e2e: não há.
- O diff `4b96ea7..52952a1` toca `apps/web/test/fluxo-api.e2e.mjs` (+89 linhas, de outras etapas): o e2e contra a API seguiu verde no CI com a seção 13 inteira.

## Achados

- anotado. O e2e contra a API em Firefox não roda no CI (só no Windows, à mão), e é onde a instabilidade V-INS-06 foi vista; continua registrada com dono.

## Não verificado

- Não subi API e painel nesta máquina para repetir os e2e: a prova é o run do CI (Linux) e a linha de base do gatekeeper no Mac (`e2e` e `e2e-api` "conferem").
- `MOTOR=firefox npm run test:e2e:api`: não rodado nesta rodada.

## Risco residual

- CORS por ambiente e domínios continua para a F01-E10, como a etapa diz.

## Motivo do humano

Não se aplica.
