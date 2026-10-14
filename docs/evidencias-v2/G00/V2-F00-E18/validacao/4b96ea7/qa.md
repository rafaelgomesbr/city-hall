---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, INFRA, ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
Veredito: PASS. Os três e2e de navegador fecham verdes (modo local em Chromium e em Firefox, e contra a API em Chromium e em Firefox), e o CORS do PUT de evidência libera exatamente o cabeçalho necessário e nenhum outro. Não consegui mutar o `servidor.ts` (fora do que eu podia alterar nesta rodada), então a prova de que o teste de preflight morde é a de outro validador, conferida por leitura (ver "Não verificado").

Saídas e temporários em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). Nenhuma das portas proibidas foi usada: o `scripts/e2e-api.mjs` fixa 3691 e 4691, então rodei uma cópia dele, `qa-painel/e2e-api-sombra.mjs`, com a raiz do repositório fixa, as portas 3993 e 4993 e o painel construído numa pasta do scratchpad (o script original reconstrói `apps/web/dist`). Nada foi commitado e a árvore ficou limpa.

## Critérios verificados

| # | Critério | Resultado |
| --- | --- | --- |
| 1 | `npm run test:e2e` em Chromium | PASS. Painel em modo local (construído sem `VITE_API_URL`, porta 4173): 70 de 70, zero erro de console (`qa-painel/e2e-local-chromium.txt`; `baseline/16-e2e.txt`, mesmo resultado) |
| 2 | `MOTOR=firefox npm run test:e2e` | PASS. 70 de 70, zero erro de console (`qa-painel/e2e-local-firefox.txt`) |
| 3 | `npm run test:e2e:api` (Chromium) | PASS. Suíte principal 279 aprovadas e 0 falha, mais `layout-estreito` 50 e 0 falha, zero erro de console (`qa-painel/e2e-api-chromium.txt`; `baseline/17-e2e-api.txt` do gatekeeper: mesma conta). A seção 13 (galeria de evidência, foto subindo pelo painel) está dentro e verde |
| 4 | O mesmo contra a API em Firefox | PASS. 279 mais 50, 0 falha, zero erro de console (`qa-painel/e2e-api-firefox.txt`), uma execução (a instabilidade V-INS-06 não apareceu) |
| 5 | Preflight do PUT de envio libera `if-none-match` | PASS. Black-box contra a minha API: `OPTIONS` com `Access-Control-Request-Headers: content-type,if-none-match` e origem do painel dá 204, `access-control-allow-origin` igual à origem, `access-control-allow-headers: content-type, authorization, accept, if-none-match` |
| 6 | Origem fora da lista não recebe `access-control-allow-origin` | PASS. `http://painel-falso.exemplo`, `null` e `http://localhost:4991.evil.com` não recebem a origem de volta |
| 7 | Cabeçalho qualquer fora da lista não é liberado | PASS. Com `x-qualquer` no pedido a lista devolvida continua fixa (quatro nomes, sem curinga, sem eco) |
| 8 | Teste de preflight da etapa | PASS. `apps/api/test/cors-do-envio-de-evidencia.test.ts`: 8 de 8 (`qa-painel/cors-teste.txt`): preflight com `if-none-match`, todo cabeçalho assinado liberado, origem estranha sem allow-origin, `x-qualquer` fora, segundo PUT 412 `objeto_ja_existe`, URL vencida 403, assinatura trocada 403, chave de outro município 403 |
| 9 | Documentação: três execuções e pré-requisito `npx playwright install chromium firefox` | PASS. `README.md` linhas 1077 e 1078, 1395 e 1396, 1444 e 1445, 1498 |

## Evidência

`qa-painel/e2e-local-chromium.txt`, `e2e-local-firefox.txt`, `e2e-api-chromium.txt`, `e2e-api-firefox.txt`, `cors-teste.txt`; o preflight black-box foi feito por `curl -i -X OPTIONS` contra a API da 3991, em `qa-painel/cors-preflight-blackbox.txt` (cinco pedidos: 204 e os quatro cabeçalhos fixos; só a origem do painel recebe `access-control-allow-origin`); `baseline/16-e2e.txt` e `baseline/17-e2e-api.txt` do gatekeeper no mesmo SHA; CI 38445527075, job "Fluxo ponta a ponta no navegador" verde.

## Cenários positivos

Os quatro e2e, o preflight do painel, o PUT de evidência pelo navegador (seção 13).

## Cenários negativos

Origem estranha, origem `null`, origem com sufixo (`localhost:4991.evil.com`), `x-qualquer`, segundo PUT na mesma chave (412), URL vencida (403), assinatura trocada (403), URL assinada para a chave de outro município (403).

## Tentativas de reprovar

1. Tentei afrouxar o CORS por origem: três origens maliciosas, nenhuma recebe `access-control-allow-origin`.
2. Tentei fazer o servidor ecoar o cabeçalho pedido: a lista devolvida é fixa.
3. Repeti o e2e contra a API nos dois motores com banco e portas novos (cópia do script), para não depender do ambiente do gatekeeper.
4. Tentei o modo local em WebKit: estoura o tempo na seção 4 (registrar ocorrência, `fluxo.e2e.mjs:167`). É a limitação que o README documenta na seção "O modo local não serve para o Safari" (linha 1403), e a etapa só exige Chromium e Firefox.
5. Procurei o "Failed to fetch" da seção 13: não aparece em nenhum dos dois motores.
6. Não verifiquei se a lista de console esperado do Firefox no e2e contra a API engole erro de verdade (ver "Não verificado"); o filtro do modo local é só para download de fonte abortado (`status=2152398850`).

## Achados

Primeiro balde, BLOQUEIA: vazio.

Segundo balde, CORRIGE ANTES DE CRESCER: vazio.

Terceiro balde, ANOTADO:

1. A DoD ainda diz "as 103 verificações da API completas"; a suíte tem hoje 279 (mais 50 de layout). O texto da etapa envelheceu, não o produto.
2. O filtro novo de console em `fluxo.e2e.mjs` (download de fonte abortado no Firefox) é afrouxamento declarado do "zero erro de console"; estreito e justificado.
3. `scripts/e2e-api.mjs` fixa as portas 3691 e 4691 e reconstrói `apps/web/dist` a cada execução; quem roda em paralelo com outro processo nessas portas é recusado pelo portão de porta (comportamento correto, só vale saber).
4. O e2e de modo local em WebKit não passa (limite documentado).

## Não verificado

- Mutação do CORS (`allowedHeaders` sem `if-none-match`) por mim: não pude tocar em `apps/api`. A prova de que o preflight morde é a do validador de testes, feita em cópia sombra fora do repositório (3 de 8 reprovam sem o conserto, as mesmas que o implementador arquivou em `saidas/07`), e a do e2e original, que morria na seção 13 com "Failed to fetch" antes do conserto (`saidas/01`). Li os dois e não os refiz.
- CORS do armazenamento externo real (S3, F06-E15), CORS por ambiente (F01-E10): fora do escopo.
- Se a lista de console esperado do `fluxo-api.e2e.mjs` engole um bloqueio de CORS de verdade (o validador de testes diz que não; não refiz).
- Repetição dos e2e em Linux (o CI cobre Chromium e Firefox no modo local e Chromium contra a API; o Firefox contra a API só roda na máquina).
- Mais de uma execução do Firefox contra a API para medir a taxa da instabilidade V-INS-06.

## Risco residual

O Firefox contra a API não está no CI; a instabilidade registrada (1 falha em 8 rodadas) não reapareceu em mim.

## Motivo do humano

Nenhum. O upload da foto pelo painel concluindo na seção 13 foi provado por e2e nos dois motores (substituição já registrada no VEREDITO).
