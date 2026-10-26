---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
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
- `npm run test:e2e:api` (Chromium), Windows: saiu 0, "Passou: 271 Falhou: 0, Zero erro de console", seção 13 inclusa.
- `npm run test:e2e:api -- firefox`: 3 de 4 execuções saíram 0 com 271/0; 1 falhou (achado 1).
- `npm run test:e2e` Chromium: 70/0, zero erro de console. `MOTOR=firefox npm run test:e2e`: 70/0 (precisei de `build` do painel e `vite preview` na 4173, encerrado depois).
- CI (run 37739535524, job "Fluxo ponta a ponta no navegador", verde): e2e local Chromium 70/0, e2e local Firefox 70/0, e2e:api 271/0 (Chromium; o CI não roda e2e:api em Firefox).
- Preflight do PUT de evidência: `apps/api/test/cors-do-envio-de-evidencia.test.ts` 8 de 8; `servidor.ts:389` tem `allowedHeaders: [content-type, authorization, accept, if-none-match]`, sem curinga, com `origin: config.origens` intacto.

## Evidência
Scratchpad: `e2eapi_c.txt` (0), `e2eapi_f2.txt`, `e2eapi_f3_1.txt`, `e2eapi_f3_2.txt` (0), `e2eapi_f.txt` (falha), `e2e_c.txt`, `e2e_f.txt`, `e2eapi_mut.txt`.
Mutações (desfeitas, `git status` limpo):
- `if-none-match` removido de `allowedHeaders`: vitest MORTA (3 falhas) E `test:e2e:api` reprova na seção 13 com "TypeError: Failed to fetch" (reproduz o defeito original no navegador real).
- `x-qualquer` adicionado: MORTA. `allowedHeaders: ["*"]`: MORTA. `origin: true`: MORTA ("origem fora da lista").
- `memoria.ts` com assinatura sem a chave: MORTA ("chave de um município não grava na de outro").

## Cenários positivos
Preflight devolve `if-none-match`; o primeiro PUT grava; o navegador sobe a foto pelo painel na seção 13.

## Cenários negativos
Origem fora da lista sem `access-control-allow-origin`; cabeçalho fora da lista não liberado; segundo PUT na mesma chave 412; URL vencida 403; assinatura trocada 403; URL do município A usada na chave do B 403, e nenhuma das duas chaves gravada.

## Tentativas de reprovar
Removi o conserto e rodei o navegador real: reprova onde o relatório original dizia. Afrouxei origem e cabeçalhos: tudo pego. Rodei Firefox 4 vezes à procura de intermitência: achei 1.

## Achados
1. corrige antes de crescer: `test:e2e:api -- firefox` no Windows falhou 1 de 4 vezes, na seção 23, `page.goto: NS_ERROR_CONNECTION_REFUSED` em `http://localhost:4691/entrar` (`fluxo-api.e2e.mjs:904`, `abrirComoMarcos`), depois de 22 seções passarem: o painel deixou de responder no meio da execução. Não repetiu nas 3 execuções seguintes nem no CI (Chromium). A E18 arquivou rodadas de Firefox com problema (`saidas/11`, `saidas/12`), então o tema é conhecido. Candidato à política T42. Saída em `e2eapi_f.txt`.
2. anotado: o CI não roda `test:e2e:api` em Firefox, só Chromium; o bloco pede só Chromium para a API, dentro do contrato.
3. anotado: o CORS do bucket S3 real não é coberto; adiado para F06-E15 e registrado em `apps/web/PENDENCIAS.md` seção 10.

## Não verificado
`npm run test:api` completo e `npm run test --workspace @dc360/web` (rodei só o arquivo de CORS e os e2e; confiei no CI verde, jobs "A API sobe contra Postgres real" e "Testes, tipos e scripts"). WebKit. Preflight contra S3 real. Linux por execução própria.

## Risco residual
Intermitência do e2e:api em Firefox no Windows; CORS do armazenamento externo.

## Motivo do humano
O bloco pede que o Rafael veja o upload de foto pelo painel concluir na seção 13 (conferência visual).
