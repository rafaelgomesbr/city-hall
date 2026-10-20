---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI: run do CI do SHA, job a job, com artefato. NÃO EXISTE (run 39366804765 do registro `7644420` recusado pelo GitHub por faturamento, H32; `gh` sem login). BLOCKED pela seção 6 de `28`.
- O workflow cobre a etapa? Sim, por leitura do job `navegador` de `.github/workflows/verificar.yml` no SHA (linhas 281 a 390): instala Chromium e Firefox com `--with-deps`, compila `@dc360/shared`, `@dc360/db` e o painel, serve o painel na 4173 com espera por resposta (não `sleep` fixo), e roda `npm run test:e2e` (Chromium), `MOTOR=firefox npm run test:e2e` e `npm run test:e2e:api`; os dois últimos rodam mesmo se o Chromium falhar (`!cancelled() && steps.esperar.outcome == 'success'`), e cada um vai ao artefato `navegador-<sha>`. São as três execuções que a etapa pede.
- O `test:e2e:api` precisa da API compilada? Não: `scripts/e2e-api.mjs:158` sobe a API com `npx tsx src/index.ts`, então o job não precisar compilar `@dc360/api` está certo.
- Rodei os comandos do job no SHA, no Mac (Node 24, Chromium e Firefox do Playwright), na mesma ordem: builds de shared, db e painel (código 0), `vite preview --port 4173 --strictPort`, e2e local Chromium "Passou: 70   Falhou: 0" (código 0), e2e local Firefox "Passou: 70   Falhou: 0" (código 0), `npm run test:e2e:api` "Passou: 288   Falhou: 0" e "Passou: 149   Falhou: 0" (código 0), com a seção 13 ("a foto do agente aparece para o coordenador") OK.
- Teste de preflight (`apps/api/test/cors-do-envio-de-evidencia.test.ts`): 8 de 8. Morde: tirei `"if-none-match"` de `allowedHeaders` em `apps/api/src/servidor.ts:442`, rodei, 3 de 8 falham (código 1); restaurei com `git restore`, `git diff` vazio.

## Evidência

Em `SCRATCH/validadores/engenharia-entrega/`:

- `e18-00-builds.txt`: os três builds do job, código 0.
- `e18-01-e2e-local-chromium.txt`: código 0, "Passou: 70   Falhou: 0".
- `e18-02-e2e-local-firefox.txt`: código 0, "Passou: 70   Falhou: 0".
- `e18-05-e2e-api.txt`: código 0, "Passou: 288   Falhou: 0" (linha 392) e "Passou: 149   Falhou: 0" (linha 569); seção 13 nas linhas 109 a 115.
- `e18-03-cors-preflight.txt`: código 0, 8 de 8.
- `e18-04-cors-MUTANTE.txt`: código 1, 3 falhas e 5 passam, com o cabeçalho tirado.

## Cenários positivos

- Os três e2e verdes no SHA com os comandos do CI.
- O preflight devolve `if-none-match`, e a foto sobe pela seção 13 contra a API real.

## Cenários negativos

- Sem `if-none-match` na lista, o teste de preflight reprova (mutante acima).
- Os 8 casos do teste incluem origem fora da lista sem `access-control-allow-origin`, cabeçalho qualquer fora da lista não liberado, segundo PUT na mesma chave recusado, URL vencida recusada, assinatura trocada recusada e URL assinada para um município que não grava na chave de outro (linhas 129 a 193 do teste); todos verdes no SHA.

## Tentativas de reprovar

- Procurei dependência do job que a imagem limpa não teria: o painel importa `@dc360/shared` pelo `dist`, e o job compila shared e db antes do painel; a API do e2e roda por `tsx`, sem `dist`.
- Procurei passo que esconde vermelho: nenhum `continue-on-error` nem `|| true` nos passos de teste; `shell: bash` dá `pipefail`, então o `tee` não engole o código.
- Procurei colisão de porta: as portas do e2e da API (3691 e 4691) são fixas, e o roteiro recusa subir com porta ocupada (provado no `test:scripts`); aqui elas estavam tomadas por uma sessão alheia e só rodei depois que ficaram livres.

## Achados

- Anotado: o job `navegador` roda o `test:e2e:api` só em Chromium; a etapa só pede Chromium para ele, então não reprova.
- Nenhum achado bloqueia. O bloqueio é a falta do run.

## Não verificado

- O job `navegador` em Linux (o run do SHA não existe, H32), incluindo `npx playwright install --with-deps` numa imagem limpa.
- A validação humana (Rafael vendo a foto subir pela seção 13 no painel).

## Risco residual

Os e2e passaram no Mac com Node 24; em Linux com Node 22 e as fontes e bibliotecas do runner, a geometria da tela estreita (149 verificações) é a parte mais sensível a ambiente e só o run confirma.

## Motivo do humano

O run do CI do SHA só existe depois de o Rafael resolver o faturamento do GitHub (H32). A etapa também pede que o Rafael veja a foto subir na seção 13.
