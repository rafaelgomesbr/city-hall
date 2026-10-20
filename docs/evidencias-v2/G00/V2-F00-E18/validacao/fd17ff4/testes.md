---
validador: testes (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-testes`. Execução numa CÓPIA de `fd17ff4` (`git archive`), `node_modules` por link simbólico com `@dc360/*` da cópia; mutações por `$V/bin/mutar.sh` (aplica, roda, restaura por `git show fd17ff4:<arquivo>`, confere por `cmp`). A cópia final é idêntica a uma extração limpa do SHA. Portas usadas: 4173 (painel do modo local), 3691 e 4691 (as próprias de `e2e-api.mjs`); nunca 5811 nem 5812. Tudo o que subi foi derrubado (conferido por `lsof` nas três portas e por `ps`).

Entre `1ed0b71` e `fd17ff4`, o que toca esta etapa: `scripts/e2e-api.mjs` (novo `--so-layout` e motor `webkit`), `scripts/baseline.mjs` (o `e2e-api` passou a esperar "Passou: 197" na tela estreita, era 149) e o workflow (instala `webkit` e ganha os passos do Firefox e do WebKit contra a API). `servidor.ts` mudou só em `RegraDeNegocio` (status inteiro), fora do CORS; `cors-do-envio-de-evidencia.test.ts`, `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs` não mudaram.

| Campo do bloco | Teste | Rodou no SHA | Mutação que o morde |
| --- | --- | --- | --- |
| Positivo: o preflight devolve `if-none-match` | `apps/api/test/cors-do-envio-de-evidencia.test.ts` (8 casos) | verde | r01 (`if-none-match` fora de `allowedHeaders`) 3 vermelhos |
| Positivo: `npm run test:e2e` (Chromium) | `apps/web/test/fluxo.e2e.mjs` | Passou 70, Falhou 0, zero erro de console, código 0 | (o conserto do `/` é da E13) |
| Positivo: `MOTOR=firefox npm run test:e2e` | idem | Passou 70, Falhou 0, código 0 | idem |
| Positivo: `npm run test:e2e:api` verde, seção 13 sobe a foto pelo painel | `scripts/e2e-api.mjs` com `fluxo-api.e2e.mjs` e `layout-estreito.e2e.mjs` | 2x: Passou 288 e Passou 197, Falhou 0, código 0; seção 13 com "os bytes sobem direto para o armazenamento" e "o servidor confirma o envio" | r01 no e2e: morre na seção 13 com "TypeError: Failed to fetch" e o roteiro sai 1 |
| Negativo: origem fora da lista sem `access-control-allow-origin` | "origem fora da lista não recebe ..." | verde | r03 (`origin: true`) 1 |
| Negativo: `x-qualquer` não é permitido | "cabeçalho qualquer fora da lista não é liberado" | verde | r02 (sem `allowedHeaders`, o cors reflete o pedido) 1; r02b (`x-qualquer` na lista) 1; r01 também o derruba (a lista exata não bate) |
| Negativo: segundo PUT na mesma chave recusado | "o primeiro PUT grava, e um segundo ... é recusado" | verde | r04 (escrita única desligada) 1 |
| Autorização: URL vencida recusada | "URL de envio vencida é recusada" | verde | r05 (sem conferência de validade) 1 |
| Autorização: assinatura trocada recusada | "assinatura trocada é recusada" | verde | r06 (sem conferência da assinatura) 2 |
| Isolamento: URL assinada para a chave de A não grava na chave de B | "URL assinada para a chave de um município não grava na chave de outro" | verde | r07b (a assinatura deixa de cobrir o segmento do município da chave) 1 |
| DoD: três e2e verdes no CI | run 39420436042, job "Fluxo ponta a ponta no navegador" | passos 11 (local Chromium), 12 (local Firefox), 13 (contra a API), 14 (contra a API no Firefox) e 15 (WebKit, só tela estreita), todos `success` | n/a |
| Regressão: `test:api`, `test --workspace @dc360/web` | | `test:api` 1685 e 34 pulados por ambiente, código 0; web no CI ("Suíte completa", `success`) | n/a |

## Evidência

- `npx vitest run test/cors-do-envio-de-evidencia.test.ts`: 8 de 8 dentro de `npm run test:api` (`$V/02-test-api-1.txt`) e de novo isolado (`$V/17-api-arquivos-das-etapas.txt`).
- `npm run build --workspace @dc360/web` e `vite preview --port 4173` na cópia; `npm run test:e2e` (`$V/09-e2e-local-chromium.txt`) e `MOTOR=firefox npm run test:e2e` (`$V/10-e2e-local-firefox.txt`): 70 de 70 cada, código 0.
- `npm run test:e2e:api` 2x (`$V/11-e2e-api-chromium.txt`, `$V/13-e2e-api-chromium-2.txt`) e `node scripts/e2e-api.mjs firefox` (`$V/12-e2e-api-firefox.txt`): "Passou: 288   Falhou: 0" e "Passou: 197   Falhou: 0", código 0 nas três. O Firefox contra a API, que na rodada 6 saía 1 pela seção 10 da tela estreita (defeito da E09), agora fecha.
- Mutações: `$V/mut/e18-r01.txt` a `e18-r07b.txt` (teste de CORS) e `$V/mut/e18-r01-e2e.txt` (e2e contra a API com r01). `r07` (primeira forma, que tirava o segmento `tenant` e não o do município) não mordeu, como devia: o município continuava na assinatura; refeita como `r07b`, que morde.
- O roteiro reprova de verdade: `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs` saem com `process.exit(falhou > 0 || erros.length > 0 ? 1 : 0)`; `e2e-api.mjs` rejeita quando um filho sai diferente de 0, o que derruba o `await` de topo (visto em r01: "Error: saiu com 1").
- CI, run 39420436042 (sobre `55209ab`, que só difere de `fd17ff4` em `STATUS.md` e `ESTADO-ATUAL.md`): 9 de 9 jobs `success`, passo a passo (`$V/03-ci-jobs.txt`), 9 artefatos públicos listados, entre eles `navegador-55209ab...` (`$V/03b-ci-artefatos.txt`). O job do navegador usa `shell: bash` (com `pipefail`), então `npm run test:e2e:api 2>&1 | tee ...` não esconde o código. Log e zip do artefato exigem token: não lidos.

## Cenários positivos

- O preflight do PUT de envio libera `if-none-match` para a origem do painel.
- No navegador, contra a API real, a foto sobe direto ao armazenamento, o servidor confirma e a imagem carrega pela URL assinada (seção 13), em Chromium e Firefox.

## Cenários negativos

- Origem fora de `ORIGENS_PERMITIDAS` e cabeçalho fora da lista são recusados no preflight.
- Segundo PUT na mesma chave (412), URL vencida, assinatura trocada e chave trocada para outro município (403, nada gravado).

## Tentativas de reprovar

- Tirei `if-none-match` do CORS: o teste de preflight reprova 3 casos e o e2e contra a API morre na seção 13 com "Failed to fetch", que é o defeito original.
- Afrouxei o CORS de três jeitos (sem lista, com `x-qualquer`, `origin: true`): cada um reprova.
- Desliguei a escrita única, a validade, a assinatura e a cobertura do município na assinatura: cada uma reprova. Uma primeira versão da última mutação sobreviveu porque eu tirei o segmento errado da chave; corrigida, morde.
- Procurei se o `--so-layout` novo podia pular a suíte principal sem querer: só liga com o argumento literal, e o CI só o passa no passo do WebKit; os passos de Chromium e Firefox rodam a suíte inteira (288).

## Achados

- anotado: com `--so-layout`, `e2e-api.mjs` imprime "== Suíte principal PULADA (--so-layout), em <motor> ==" e, no fim, a mesma frase "TUDO CERTO: o caminho de produção passou de ponta a ponta." Quem ler só o fim da saída do passo do WebKit pode achar que o caminho de produção inteiro passou nele. Não afeta esta etapa (Chromium e Firefox rodam tudo), mas é frase que diz mais do que o passo prova.
- anotado: o bloco fala em "as 103 verificações da API"; hoje são 288 na suíte principal e 197 na tela estreita (o número do bloco é da E01, como o RESUMO já registra).

Nenhum achado bloqueia.

## Não verificado

- Log de cada passo do CI e o zip do artefato `navegador-...` (exigem token): o veredito do CI vem da situação dos jobs e dos passos pela API pública.
- WebKit contra a API: só rodou no CI (passo 15, `success`), e só a tela estreita; não é critério desta etapa.
- CORS do armazenamento externo de verdade (F06-E15) e CORS por ambiente (F01-E10): fora do escopo.

## Risco residual

Baixo: o conserto é um nome na lista do CORS, preso por teste que reprova com cada forma de afrouxar ou desfazer, e pelo e2e no navegador contra a API, que reprova no ponto exato do defeito.

## Motivo do humano

O bloco pede que o Rafael veja o upload da foto pelo painel concluir na seção 13. É validação humana explícita (E4), que agente não produz.
