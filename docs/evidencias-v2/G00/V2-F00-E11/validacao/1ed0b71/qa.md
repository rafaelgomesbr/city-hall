---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Árvore em `5044e7a`, que só difere de `1ed0b71` em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md` (`git diff --stat 1ed0b71 HEAD`). Node v24.15.0. SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Botão baixa o ZIP contra a API real, Chromium | PASS | seção 28 do `fluxo-api.e2e.mjs` dentro do roteiro completo, 36 de 36 OK, arquivo total 288 de 288, código 0: `SCRATCH/r6-e2e-api-chromium.txt` linhas 336 a 392 |
| Botão baixa o ZIP contra a API real, Firefox | PASS | `node scripts/e2e-api.mjs firefox`, fluxo-api 288 de 288 (seção 28 com 36 OK), duas rodadas: `SCRATCH/r6-e2e-api-firefox.txt` e `r6-e2e-api-firefox-2.txt` linha 388. O código de saída do roteiro foi 1 por causa de outra suíte (ver Achados, item 3) |
| Nome `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, tamanho maior que zero, `tabelas/ocorrencias.csv`, laudo em `documentos/` | PASS | verificações correspondentes da seção 28 nos dois motores |
| 401 no primeiro pedido renova uma vez e baixa | PASS | e2e "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP" nos dois motores; `apps/web/test/pacote-de-saida.test.ts` 7 de 7 (`SCRATCH/r6-web-vitest.txt`) |
| Negativo: `/pacote.zip` na raiz responde 404 | PASS | sonda direta: POST e GET `/pacote.zip` 404 `nao_encontrado`, e `GET /saida/pacote.zip` 404 (`SCRATCH/r6-sonda-e11-api.txt`) |
| Negativo: coordenador recebe 403 e a tela mostra a frase | PASS | sonda: 403 `sem_permissao`; e2e: a tela mostra a frase do servidor e a sessão continua |
| Negativo: município suspenso recebe `acesso_suspenso` com a frase de contrato | PASS (servidor por teste, tela por interceptação) | `apps/api/test/pacote-de-saida-contrato.test.ts` 8 de 8 dentro de `npm run test:api`; na tela, o e2e intercepta com o texto do catálogo, igual ao de `packages/shared/src/codigos-de-erro.ts:228-234` |
| Isolamento: pacote do município A sem linha do B | PASS | sonda: 27 tabelas JSON, 51 linhas, zero fora de Serra Alta, todas com o campo de organização (`SCRATCH/r6-sonda-e11-api.txt`, `sondas/conferir-json.mjs`) |
| Autorização: coordenador de A recebe 403 | PASS | sonda, e mutação M2 prova que o contrato morde |
| Rota continua exigindo `exportar_dados` e `gerenciar_organizacao` | PASS | `apps/api/src/rotas/saida.ts:57-58`; operador e agente recebem 403 "exportar dados", coordenadores (Serra Alta e Vale Fundo) recebem 403 "alterar os dados do município" |
| Regressão obrigatória | PASS | `npm run test:api` código 0 (1590 passaram, 34 pulados, 0 falhas; `saida-de-municipio.test.ts` 37 de 37); `npm run test --workspace @dc360/web` código 0 (688 de 688); `npm run test:e2e:api` código 0; `npm run test:isolamento` código 0 (345 passaram, 3 pulados) |

## Evidência

- `npm run test --workspace @dc360/web`, código 0, 45 arquivos e 688 testes: `SCRATCH/r6-web-vitest.txt`.
- `npm run typecheck`, código 0, todos os workspaces (inclui campo): `SCRATCH/r6-typecheck.txt`.
- `npm run test:api`, código 0, 106 arquivos, 1590 passaram, 34 pulados: `SCRATCH/r6-test-api.txt`.
- `npm run test:isolamento`, código 0, 345 passaram, 3 pulados: `SCRATCH/r6-isolamento.txt`.
- `npm run test:e2e:api` (Chromium), código 0, 288 mais 149 verificações: `SCRATCH/r6-e2e-api-chromium.txt`.
- `node scripts/e2e-api.mjs firefox`, duas rodadas, código 1 nas duas, fluxo-api 288 de 288, `layout-estreito` 142 com 7 falhas: `SCRATCH/r6-e2e-api-firefox.txt`, `SCRATCH/r6-e2e-api-firefox-2.txt`.
- Sonda contra a API real (PGlite semeado, porta 3791, sem `NODE_ENV`, isto é, a guarda de acesso no modo "corrigir" de produção): `SCRATCH/sondas/sonda-e11-api.mjs`, saída `SCRATCH/r6-sonda-e11-api.txt`, API derrubada no fim e o ZIP baixado apagado.
- Mutações (feitas e desfeitas com `git restore`, árvore conferida limpa depois): `SCRATCH/r6-mutacao-m1-caminho.txt`, `SCRATCH/r6-mutacao-m2-permissao.txt`.

## Cenários positivos

- A administradora (Rita) baixa o pacote pelo botão nos dois motores; o ZIP abre pelo diretório central, as somas SHA-256 conferem, só há Serra Alta.
- Pela API, a administradora recebe 200 `application/zip`, 247 611 bytes, 113 arquivos, assinatura `PK`.
- 401 provocado no primeiro pedido: renova uma vez, baixa, e a pessoa fica no painel.
- Enquanto gera, o botão diz "Gerando" e fica desabilitado; depois volta.

## Cenários negativos

- `POST /pacote.zip` e `GET /pacote.zip` na raiz: 404. `GET /saida/pacote.zip`: 404.
- Sem token: 401 `nao_autenticado` "Informe o token de acesso."; token inválido: 401 "Token inválido ou expirado.".
- Coordenadora de Serra Alta: 403 `sem_permissao`. Operador e agente: 403 `sem_permissao`. Coordenador de Vale Fundo: 403 `sem_permissao`.
- Administradora de Serra Alta mandando o id de Vale Fundo em `x-organizacao-id`, `x-tenant`, `?organizacao_id=`, `?organizacaoId=` e no corpo: o pacote continua só de Serra Alta (nome `saida-serra-alta-mg-...`, zero linha de outro município).
- Município suspenso: 403 `acesso_suspenso` sem registro de exportação, pelo contrato da API (servidor real em teste).
- Sem rede: a tela diz que o arquivo não foi baixado.

## Tentativas de reprovar

- M1: voltei o cliente para `chamar("/pacote.zip")` em `apps/web/src/dados/http.ts:1106`. `pacote-de-saida.test.ts` reprova 2 de 7 (o caminho e o 401 que renova). Restaurado.
- M2: comentei `exigirPermissao(quem.papel, "gerenciar_organizacao")` em `apps/api/src/rotas/saida.ts:58`. O contrato reprova "coordenadora ... recebe 403 e a frase". Restaurado.
- Forja de organização por cabeçalho, query e corpo (acima): ignorada.
- Regressão da guarda de códigos de erro nova (`apps/api/src/guarda-de-codigos-de-erro.ts`, diff `bb0f654..1ed0b71`): ela segura `writeHead`, `write` e `end` em toda resposta. Conferi que o 200 binário do ZIP passa inteiro (assinatura e somas conferem) e que as recusas 401 e 403 da rota saem com o código e a frase do catálogo, sem serem trocadas pelo genérico, no modo de produção.
- Procurei os arquivos do pacote que citam Vale Fundo: só os 7 arquivos `esquema/*.sql` (texto das migrações, por exemplo o comentário "vincular uma ocorrência de Serra Alta a uma de Vale Fundo" em `008_chaves_coerentes_por_municipio.sql`). Nenhum dado; o e2e restringe a checagem a "arquivo de dado" pelo mesmo motivo.
- Conferi se o achado de data UTC da rodada 4 foi consertado: não foi (item 1 de Achados).

## Achados

1. Corrige antes de crescer (herdado da rodada 4, continua): o nome do ZIP usa a data UTC, `new Date().toISOString().slice(0, 10)` em `apps/web/src/dados/http.ts:1109`. Reprodução: baixar depois das 21:00 no horário de Brasília dá o dia seguinte no nome. Não viola o DoD (o e2e confere a forma do nome).
2. Anotado: o caso de município suspenso é provado no servidor pelo teste de contrato e, na tela, por interceptação com o texto copiado do catálogo; se a frase do catálogo mudar, o e2e não acusa. Não reprova a etapa.
3. Anotado, fora desta etapa (para o gatekeeper encaminhar à V2-F00-E09): `node scripts/e2e-api.mjs firefox` sai com código 1 nas duas rodadas, porque a suíte `layout-estreito.e2e.mjs`, seção 10 (correção 4 da E09), falha 7 verificações só no Firefox: depois do envio com senha errada em "Minha conta" e em "Defina a sua senha", o foco fica em BODY e não no campo (`SCRATCH/r6-e2e-api-firefox.txt` linhas 511 a 535; em Chromium a mesma seção passa). A seção 28 desta etapa passa nas duas rodadas e não depende disso.

## Não verificado

- O download por um navegador WebKit (a etapa pede dois navegadores, e Chromium e Firefox foram rodados).
- A suspensão de um município de verdade ponta a ponta pelo painel: o e2e não tem como suspender, e eu não subi API com Postgres real para isso; a prova do servidor é o teste de contrato.
- CI do SHA: ausente (H32).
- Node 22 do `.nvmrc`: rodado em Node 24.15.0.

## Risco residual

Baixo. O que segura a regressão do defeito original (caminho e renovação) são o teste de unidade do cliente e a seção 28, e os dois mordem. O pacote continua montado inteiro na memória (F07-E06, fora do escopo) e o nome do arquivo pode sair com o dia seguinte à noite.

## Motivo do humano

A etapa pede validação humana: Rafael baixa o pacote pelo painel com a API local e abre o ZIP. A abertura do arquivo num descompactador de verdade, no computador dele, e o julgamento de que o conteúdo faz sentido para um município não são automatizáveis por mim.
