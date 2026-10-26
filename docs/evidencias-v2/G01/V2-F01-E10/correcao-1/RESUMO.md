# V2-F01-E10, correção 1 (parte B): o conferidor de domínio confere métodos e cabeçalhos do preflight

Revisão independente da F01 (Codex, somente leitura), achado 11 de
`codex-f01-B`. Ramo `trab/f01-corr-b`, sobre `v2/f01` em `e483a22`.

## Fatos

- **Confirmado** com uma sonda sem rede (`saidas/02-sonda-preflight-sem-metodos-antes.txt`):
  uma API que responde o preflight com a origem exata e credenciais, mas SEM
  `Access-Control-Allow-Methods` e SEM `Access-Control-Allow-Headers`, passava
  nas dez conferências de `dc360/scripts/conferir-dominio.mjs`. O navegador
  barraria o `PATCH` e toda chamada com `authorization` do painel. O preflight
  pedia `GET`, que nem exige autorização de método.
- **Conserto:**
  1. `METODOS_DO_PAINEL` (`GET`, `POST`, `PATCH`) e `CABECALHOS_DO_PAINEL`
     (`accept`, `authorization`, `content-type`) dizem o que o painel manda
     (`apps/web/src/dados/http.ts`). O preflight pede o que o navegador pediria:
     o método fora da lista segura do CORS (`PATCH`) e os cabeçalhos fora dela
     (`authorization,content-type`).
  2. `avaliarPreflightAceito` exige, além da origem exata e das credenciais,
     que `access-control-allow-methods` autorize `PATCH` e que
     `access-control-allow-headers` autorize `authorization` e `content-type`.
     Com credenciais, `*` é literal para o navegador e não autoriza nada. A
     falha nomeia o que falta.
  3. Um teste varre o painel (`metodo:`/`method:` em `apps/web/src` e os
     cabeçalhos de `http.ts`) e reprova se ele passar a usar método ou
     cabeçalho fora das duas listas.
- A API de hoje (`apps/api/src/servidor.ts`, `@fastify/cors` com
  `methods: GET, POST, PUT, PATCH, DELETE` e
  `allowedHeaders: content-type, authorization, accept, if-none-match`) já
  responde o que a régua nova exige; o dublê dos testes usa esses valores. A
  conferência contra a rede de verdade NÃO foi refeita nesta correção (sem rede,
  por regra da rodada); a arquivada na E10 é anterior à régua nova.

Testes: `dc360/scripts/conferir-dominio.test.mjs`, 24 casos (eram 20; 4
novos). Os casos que já existiam com o preflight "bom" passaram a exigir os dois
cabeçalhos; nenhum foi afrouxado.

Saídas:

- `saidas/01-testes-antes-do-conserto.txt`: os testes novos contra o código
  antigo (o arquivo não carrega: as listas que os testes exigem não existem).
- `saidas/02-sonda-preflight-sem-metodos-antes.txt`: dez verdes com o preflight
  sem métodos e cabeçalhos (o defeito).
- `saidas/03-testes-depois-do-conserto.txt`: 24 de 24.
- `saidas/04-sonda-preflight-sem-metodos-depois.txt`: a mesma sonda reprova a
  aceitação, dizendo que `PATCH` não está autorizado.

## Justificativa

- O defeito era do portão, não da API: a régua precisava medir o que o
  navegador mede. Pedir `PATCH` e `authorization,content-type` no preflight é
  o pedido real do painel.
- A lista no conferidor, presa ao código do painel por teste, impede que o
  painel ganhe um método ou cabeçalho novo e o portão continue verde sem
  conferi-lo.
- O achado 2 (o `vercel.json` ainda fixa a API de PROD em `build.env`, H63)
  depende de conta e de pessoa e não foi tocado.
