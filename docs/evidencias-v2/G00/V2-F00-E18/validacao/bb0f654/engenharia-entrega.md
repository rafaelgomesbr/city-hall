---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

| Critério | Prova local (Mac) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| Preflight devolve `if-none-match` | `npx vitest run --root apps/api test/cors-do-envio-de-evidencia.test.ts`: 8 de 8 (`<V>/09-cors-e-mutante.txt`) | job `produto` (suíte completa) | local PASS |
| O teste morde | mutante: `if-none-match` tirado de `allowedHeaders` em `apps/api/src/servidor.ts:420`: 3 falham, 5 passam; desfeito com `git restore`, 8 de 8 de novo | n/a | PASS |
| Negativos (origem fora da lista, `x-qualquer`, segundo PUT 412) e autorização (URL vencida, assinatura trocada, chave de outro município) | os 5 casos passam na árvore e continuam passando no mutante (são independentes do cabeçalho), o que mostra que medem outra coisa | n/a | PASS |
| E2E local Chromium | passo `e2e`: "Passou: 70   Falhou: 0", código 0 | job `navegador`, passo "Modo local, no Chromium" | local PASS; CI BLOCKED |
| E2E local Firefox | passo `e2e-firefox`: "Passou: 70   Falhou: 0", código 0 | passo "Modo local, no Firefox" | local PASS; CI BLOCKED |
| E2E contra a API (seção 13, foto pelo navegador) | passo `e2e-api`: "Passou: 288   Falhou: 0" e "Passou: 64   Falhou: 0", código 0 | passo "Caminho de produção, contra a API" | local PASS; CI BLOCKED |
| Workflow roda as três execuções | lido: job `navegador` com Chromium, Firefox e API, cada um com artefato; Firefox e API rodam mesmo se o Chromium falhar | execução | estrutura PASS |

## Evidência

- `<V>/09-cors-e-mutante.txt` (árvore, mutante, depois de desfazer). Observação: a linha `codigo=` ficou vazia porque o shell da ferramenta é zsh (sem `PIPESTATUS`); o resultado está na própria saída do vitest ("8 passed", "3 failed | 5 passed").
- `<V>/baseline/16-e2e.txt`, `17-e2e-firefox.txt`, `18-e2e-api.txt`.
- `<V>/baseline/05-teste-api.txt`: a API inteira com 1326 aprovados, 20 pulados e 1 falha (a de LibreSSL, ver E21), nenhuma no CORS.

## Cenários positivos

- Preflight com `content-type,if-none-match` liberado para a origem do painel; os três e2e verdes no macOS.

## Cenários negativos

- Origem fora da lista sem `access-control-allow-origin`; cabeçalho fora da lista não liberado e lista exata sem curinga; segundo PUT recusado; URL vencida, assinatura trocada e chave de outro município recusadas.

## Tentativas de reprovar

1. Tirei o conserto (mutante no `allowedHeaders`): o teste de unidade reprova 3 de 8.
2. Procurei curinga ou `origin` afrouxado: `allowedHeaders` é a lista nominal de 4; o teste trava a lista exata.
3. Conferi que o workflow não deixa o Firefox e a API de fora quando o Chromium falha (`if: !cancelled() && steps.esperar.outcome == 'success'`).

## Achados

- Nenhum que quebre critério da etapa.

## Não verificado

- O run do CI (job `navegador` em Linux, com artefato): não lido.
- E2E contra a API no Firefox (`node scripts/e2e-api.mjs firefox`): não rodei; o roteiro e o CI rodam a API no Chromium.
- PUT contra armazenamento externo real (fora do escopo, F06-E15).

## Risco residual

Baixo. Falta só a leitura do CI.

## Motivo do humano

Nenhum para esta dimensão: a seção 13 do e2e prova o upload por execução; a leitura do CI é do gatekeeper.
