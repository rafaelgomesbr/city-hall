---
validador: qa (agente general-purpose com o papel da dimensão)
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

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| `npm run test:e2e` (Chromium) verde | Mac, com o painel servido como o README manda (`npm run build --workspace @dc360/web` e `npx vite preview --port 4173 --strictPort`): "Passou: 70 Falhou: 0", código 0 (`E18-01`). CI: job "Fluxo ponta a ponta no navegador", passo "Modo local, no Chromium": 70 e 0 | PASS |
| `MOTOR=firefox npm run test:e2e` verde | Mac: 70 e 0, código 0 (`E18-02`). CI: passo "Modo local, no Firefox": 70 e 0 | PASS |
| `npm run test:e2e:api` verde, seção 13 sobe a foto pelo painel | Mac, Chromium: "Passou: 288 Falhou: 0" e "Passou: 64 Falhou: 0" (estreito), seção "13. Galeria de evidencia no painel" presente, código 0 (`E18-03`). Mac, Firefox (`npm run test:e2e:api -- firefox`): 288 e 0, 64 e 0, código 0 (`E18-04`). CI: 288 e 0, 64 e 0 | PASS |
| Preflight devolve `if-none-match` | `apps/api/src/servidor.ts:420` `allowedHeaders: ["content-type", "authorization", "accept", "if-none-match"]`, sem curinga, `origin: config.origens`; `test/cors-do-envio-de-evidencia.test.ts` 8 de 8 (`E18-05`) | PASS |
| O teste de preflight morde | mutação 1: `if-none-match` tirado da lista, 3 de 8 vermelhos (`E18-06`); mutação 2: `x-qualquer` acrescentado, o caso "cabeçalho qualquer fora da lista não é liberado" vermelho (`E18-07`); ambas restauradas com `git restore` | PASS |
| Negativos: origem fora da lista sem `access-control-allow-origin`; `x-qualquer` não liberado; segundo PUT na mesma chave recusado | casos `:129`, `:138`, `:154` do teste, verdes; mutação 2 prova que o de `x-qualquer` morde | PASS |
| Autorização e isolamento: URL vencida, assinatura trocada, URL de um município na chave de outro | casos `:168`, `:182`, `:193`, verdes | PASS |
| Curinga de origem recusado em produção | `apps/api/src/config.ts:753-754` lança "ORIGENS_PERMITIDAS não pode conter curinga em produção" | PASS (leitura) |
| Regressão `test:api` e `test --workspace @dc360/web` | `npm test` (`R-01`): painel 665 de 665; API 1309 passam, 9 pulados, 1 falha de ambiente (`openssl-do-teste.test.ts`, LibreSSL do macOS, conhecida) | PASS com a divergência conhecida |
| Documentação: README "Como testar" e pré-requisito | `README.md:1425-1436` (build, `vite preview` e as duas execuções) e `:1482`, `:1536` (`npx playwright install chromium firefox`) | PASS |

Defeitos das rodadas 1 e 2, reexecutados:

- Rodada 1, `test:e2e:api` em Firefox instável (1 em 4 no Windows): reexecutado uma vez no Mac, verde (`E18-04`). Uma execução não prova estabilidade; o registro T42 (V-INS-06) da rodada 2 continua sendo a cobertura.
- Rodada 2: nenhum defeito. O diff `4b96ea7..52952a1` não toca `servidor.ts` nem `scripts/e2e-api.mjs`; toca `fluxo-api.e2e.mjs` e `layout-estreito.e2e.mjs` (outras etapas), e as duas suítes fecharam verdes aqui.

## Evidência

Saídas em `$SP/val/qa/lote4/`:

- `E18-00-build-web.txt` (código 0), `E18-00-preview.log`, `E18-00-playwright-install-firefox.txt`.
- `E18-01-e2e-local-chromium.txt`, `E18-02-e2e-local-firefox.txt`, `E18-03-e2e-api-chromium.txt`, `E18-04-e2e-api-firefox.txt`.
- `E18-05-cors-verde.txt`, `E18-06-cors-mut-sem-if-none-match.txt`, `E18-07-cors-mut-x-qualquer.txt`.
- `CI-116039196287.log`: job "Fluxo ponta a ponta no navegador" do run 38618369218.

Observação de ambiente: o Firefox do Playwright (v1538) não estava instalado nesta máquina; a primeira execução em Firefox morreu com "Executable doesn't exist". Instalei com `npx playwright install firefox` (cache do usuário, fora do repositório e de `node_modules`), que é o pré-requisito documentado no README. A primeira tentativa do modo local também falhou com `ERR_CONNECTION_REFUSED` porque eu não tinha subido o `vite preview`; com o painel servido, como o README manda, passou.

Processos que subi e derrubei: `vite preview` na 4173 (PID guardado e encerrado); as API e painel do `e2e-api.mjs` nas portas 3691 e 4691 são derrubados pelo próprio script (conferido por `lsof`, nada escutando depois).

## Cenários positivos

- As três execuções da etapa (local Chromium, local Firefox, contra a API) verdes; contra a API também em Firefox.

## Cenários negativos

- Origem fora da lista, cabeçalho fora da lista, segundo PUT, URL vencida, assinatura trocada e chave de outro município: todos recusados pelo teste, e dois dos casos provados por mutação.

## Tentativas de reprovar

- Tirei `if-none-match` e acrescentei `x-qualquer` na lista do CORS: o teste reprovou nos dois casos.
- Procurei curinga ou origem frouxa: a lista vem de `ORIGENS_PERMITIDAS` e o curinga é recusado em produção.
- Rodei o e2e contra a API em Firefox, o motor que a rodada 1 achou instável: verde.

## Achados

- Nenhum que bloqueie.
- anotado: o padrão de `ORIGENS_PERMITIDAS` é `http://localhost:5173` (`config.ts:354`); CORS por ambiente é da F01-E10, fora do escopo.

## Não verificado

- Estabilidade do e2e contra a API em Firefox em muitas repetições (uma execução só).
- Windows nesta rodada.

## Risco residual

Baixo. O conserto é uma entrada nominal na lista do CORS, coberta por teste que morde e pelo e2e real.

## Motivo do humano

Não se aplica: a seção 13 sobe a foto pelo painel em Chromium e Firefox nesta máquina e no CI.
