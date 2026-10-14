---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Os três e2e de navegador verdes em Linux no SHA: PASS. Job "Fluxo ponta a ponta no navegador" (115462783787) success; artefato `navegador-c9895e9...`: `04-e2e-local-chromium.txt` "Passou: 70 Falhou: 0", `05-e2e-local-firefox.txt` "Passou: 70 Falhou: 0", `06-e2e-contra-a-api.txt` "Passou: 279 Falhou: 0" e "Passou: 50 Falhou: 0" (dois arquivos de verificação), todos com "Zero erro de console". A linha de base de Linux (`18-e2e.txt`, `19-e2e-api.txt`) repete 70, 279 e 50.
- CORS do PUT de evidência: PASS. `apps/api/src/servidor.ts:420` tem `allowedHeaders: ["content-type", "authorization", "accept", "if-none-match"]`, nome a nome, sem curinga; `origin: config.origens` não mudou. O teste `cors-do-envio-de-evidencia.test.ts` (8 casos) passou no job `produto` do CI (`05-suite-completa.txt`).
- A instabilidade do e2e da API em Firefox da rodada 1 (1 falha em 4, `CONNECTION_REFUSED` na seção 23): REGISTRADA. Está como `V-INS-06` em `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md` (seção 8.3, tabela com Dono `rafael`, Issue `V2-F00-E18`, Prazo `2026-10-27`, causa "NÃO medida", hipóteses e tratamento) e na seção 8.4 (4 de 4 verdes depois, total "1 falha em 8 rodadas em Firefox"). É o lugar que a R6 de `POLITICA-DE-TESTE-VERMELHO.md` manda usar (registro vivo, uma linha com dono, issue e prazo). O `portao-de-skip.mjs` não a lê, e não precisa: não é teste pulado.
- Nenhum teste foi pulado ou mascarado: PASS (sem `continue-on-error`; `e2e-api.mjs` não repete tentativa).

## Evidência

Run 38445527075 (sobre `c9895e9`, evento push, success, 9 de 9). `git diff 4b96ea7..c9895e9` só toca `ROTEIRO-G00.md`, `ESTADO-ATUAL.md` e `STATUS.md`. Os passos do e2e usam `tee` sob o `bash -e -o pipefail` do GitHub (`defaults.run.shell: bash`); Firefox e API rodam com `!cancelled()` para trazer a saída de todos os motores sem esconder falha. `git diff 7005a60..4b96ea7` nesta área acrescenta 72 linhas a `fluxo-api.e2e.mjs` e 12 a `e2e-api.mjs` (verificações novas de outras etapas, 271 para 279 e 50).

## Cenários positivos

Os três e2e verdes no Linux do CI; preflight com `if-none-match` aprovado pelo teste de API; upload da foto da seção 13 concluído no e2e contra a API.

## Cenários negativos

O teste de API cobre origem fora da lista sem `access-control-allow-origin`, cabeçalho `x-qualquer` fora da lista, segundo PUT recusado (escrita única), URL vencida, assinatura trocada e chave de outro município (linhas 129 a 193 do arquivo). A prova de que o e2e morde sem o conserto é a do implementador: `saidas/01-e2e-api-chromium-antes.txt` morre na seção 13 com "Failed to fetch". Não a refiz (pede mutar `servidor.ts` e rodar a API, fora do que posso nesta rodada).

## Tentativas de reprovar

1. Procurei CORS frouxo: `origin` continua a lista de `ORIGENS_PERMITIDAS`; só um cabeçalho nominal entrou; `credentials: true` já existia.
2. Procurei o e2e da API em Firefox no CI para ver a instabilidade em Linux: o CI só roda `test:e2e:api` em Chromium (o bloco não pede mais). O Firefox da API é Windows, manual.
3. Procurei repetição escondendo falha: `e2e-api.mjs` não tem retry; `grep` de `retry` nada.
4. Procurei a instabilidade fora do registro: achei `V-INS-06` com dono, issue e prazo, e a próxima ação ("na próxima falha arquivar bruta e trace, depois esperar o servidor responder com limite").
5. Procurei verificações do e2e que dependam de ordem entre o primeiro e o segundo contexto do navegador (a causa suspeita da seção 23): não medido, ver "Não verificado".

## Achados

Nenhum bloqueia. Anotado: o registro da instabilidade diz "causa NÃO medida"; é aceito pela R6 enquanto for hipótese e tiver dono e prazo (2026-10-27). Se a falha voltar, a política do gatekeeper (mais de uma instabilidade na mesma suíte no mesmo gate) vira BLOCKED.

## Não verificado

Executar `test:e2e`, `test:e2e:api` e o teste de preflight localmente (proibido nesta rodada: a API e o navegador competem com o outro validador). Mutação do CORS (`allowedHeaders` sem `if-none-match`). Firefox da API em Linux. WebKit. CORS do S3 real (F06-E15, fora do escopo).

## Risco residual

Intermitência de `CONNECTION_REFUSED` no Firefox do Windows, sem causa medida (registrada, com dono e prazo).

## Motivo do humano

O bloco pede que Rafael veja o upload de foto concluir na seção 13. O e2e já exercita o upload e fecha verde, então o que sobra é conferência visual; fica a critério do gatekeeper.
