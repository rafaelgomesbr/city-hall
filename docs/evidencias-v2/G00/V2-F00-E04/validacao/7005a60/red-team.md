---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [AUTH, AUTHZ, TENANT, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: conflito com qa, seguranca-aplicacao e banco-de-dados (os tres deram PASS); arbitragem Opus da secao 7 de 28
---
## Critérios verificados

HEAD 665b2be difere de 7005a60 só em `docs/roadmap-v2/STATUS.md` (`git diff --stat 7005a60 HEAD`). Toda prova abaixo roda o código de 7005a60.

- **Objetivo e DoD "sonda de conta desativada não escreve"**: VIOLADO. Conta desativada, papel rebaixado e sessão encerrada por administrador continuam praticando ATO ADMINISTRATIVO com efeito de estado e registro na trilha append-only, por `GET` e `HEAD` em `/documentos/:id/termo-de-interdicao`. A rota é, por desenho, o ÚNICO caminho que interdita imóvel (`trilha.ts:114-121`, `marcarInterditada` faz `UPDATE ocorrencias SET interditada_em`), e `registrarEmissao` grava `documento_emitido` em `trilha_eventos` com `autor_papel` do TOKEN. `servidor.ts:478` define escrita pelo verbo (`req.method !== "GET" && req.method !== "HEAD"`), então essa escrita passa sem `lerVigencia`. Ver Achado 1.
- **Escrita por POST, PATCH, PUT e DELETE nega fora da vigência**: confirmado no SHA (varredura de 51 rotas do relatório de segurança, que reli, e as minhas sondas A, B, C: POST com conta desativada 403 `conta_desativada`, papel rebaixado 401 `nao_autenticado`, sessão encerrada 401 `sessao_encerrada`).
- **Zero `skip` em vigência**: `vigencia-na-escrita.test.ts`, `familia-da-sessao.test.ts` e `segunda-via-nao-reinterdita.test.ts`: 3 arquivos, 39 de 39 verdes, nenhum skip executável.
- **Comentários batem com o código**: VIOLADO. `auth/vigencia.ts:47-50` afirma que "quinze minutos de leitura com token vivo não produzem registro (a exceção conhecida é `GET /avisos`)". No SHA, ao menos cinco GETs produzem registro: termo de interdição (interdita e grava trilha), laudo e termo de desinterdição (trilha `documento_emitido` e `ocorrencia_consultas`), `GET /ocorrencias/:id` e `GET /busca` (`ocorrencia_consultas`), `GET /relatorios/ocorrencias.csv` (`exportacoes` e `trilha_administrativa`). `apps/api/PENDENCIAS.md` repete a lista incompleta.
- **Isolamento e 404 entre municípios**: mantido. Token do coordenador de Vale Fundo (Aurelio) com `x-organizacao-id`, `x-tenant-id`, `organizacao-id`, `?organizacaoId=`, `?organizacao_id=` e `organizacaoId` no corpo apontando para Serra Alta: ocorrência REAL de A e id inexistente devolvem corpo e status idênticos em `GET /ocorrencias/:id` (404), `GET /documentos/:id/laudo` (404), `GET /documentos/:id/termo-de-interdicao` (404) e `POST /ocorrencias/:id/coordenada` (422 idêntico, corpo inválido antes do lookup). Nenhum 403.
- **Renovação depois de desativada não rende token novo**: `POST /auth/renovar` com o refresh da conta desativada: 401 `sessao_encerrada` (a desativação revogou as sessões; o caminho de `!sessao.ativo` em `servico.ts:626` é a segunda barreira).

## Evidência

Tudo em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/rt/`:
- `ataque.test.ts` (sonda, fora do repositório) e `vitest.config.mjs`.
- `npx vitest run --config rt/vitest.config.mjs` (em `apps/api`, depois de `npm run build:shared`, rc 0): `saida1.txt`. Linhas `RT|` são o resultado.
- Prova de que a sonda morde: mudei `servidor.ts:478` para também tratar `/documentos/*` como escrita, rodei A, B e C (`saida2-com-correcao-provisoria.txt`, rc 0): os três GET/HEAD de termo passam a 403/401 e a ocorrência fica sem interdição e sem `documento_emitido`. `git restore src/servidor.ts`; `git status --porcelain` final: só `?? docs/evidencias-v2/G00/V2-F00-E04/validacao/`.
- `npx vitest run --root apps/api test/vigencia-na-escrita.test.ts test/familia-da-sessao.test.ts test/segunda-via-nao-reinterdita.test.ts`: rc 0, 39 de 39 (`saida3-suites.txt`).

## Cenários positivos

- Coordenadora ativa cria, tria, despacha; agente sincroniza vistoria com interdição indicada (201): base das sondas A, B e C.
- Corrigindo provisoriamente a definição de escrita, a conta ativa continua emitindo (a correção só muda o ramo de quem está fora da vigência).

## Cenários negativos

Saída `saida1.txt`, PGlite semeado (Serra Alta e Vale Fundo), tokens obtidos por `/auth/entrar`:

| Sonda | Resultado no SHA |
| --- | --- |
| A. Helena desativada por Rita (`PATCH /usuarios/:id/situacao`, 200); POST com o token vivo | 403 `conta_desativada` (correto) |
| A. mesma Helena, `GET /documentos/:id/termo-de-interdicao` | **200, 13123 bytes; `interditada` false para true; `documento_emitido` 0 para 1, autor "Helena Vasques Coutinho/coordenador"** |
| A. mesma Helena, `GET /ocorrencias/:id` | 200 com o nome do solicitante; `ocorrencia_consultas` 1 para 2 |
| A. mesma Helena, `POST /auth/renovar` | 401 `sessao_encerrada` (correto) |
| B. Helena rebaixada a `operador` no banco (operador NÃO tem `emitir_documento`, `packages/shared/src/permissoes.ts`); POST | 401 `nao_autenticado` (correto) |
| B. mesma Helena, `HEAD /documentos/:id/termo-de-interdicao` | **200; imóvel interditado; trilha grava `autor_papel` = coordenador, papel que ela já não tem** |
| C. sessões de Helena encerradas por Rita (`POST /usuarios/:id/encerrar-sessoes`, 200); POST | 401 `sessao_encerrada` (correto) |
| C. mesma Helena, `GET /documentos/:id/termo-de-interdicao` | **200; imóvel interditado; `documento_emitido` gravado** |
| D. conta desativada: `GET` com cabeçalho `x-http-method-override: POST`, `GET` com `x-http-method: DELETE`, `PROPFIND`, `SEARCH`, `HEAD` e `get` na rota de escrita | 404 de rota (Fastify não honra override); `OPTIONS` 400 do preflight |
| D. conta desativada: barra dupla no início, barra final, maiúsculas, sufixo `;x` | 404 de rota; `%63oordenada` e `?_method=POST` chegam à rota e recebem 403 `conta_desativada` |
| E. sessão com `expira_em` no passado e sem revogação; POST /ocorrencias | **201** (ver Achado 3c) |
| F. troca de organização por cabeçalho, query e corpo; A real x inexistente | idênticos, 404 ou 422, nunca 403 |

## Tentativas de reprovar

1. Procurei escrita escondida em GET pelo código, não pela contagem de linhas com id de mentira (o que os três relatórios anteriores fizeram, e por isso não acharam): `grep` de `registrarConsulta`, `registrarEmissao`, `marcarInterditada`, `INSERT` e `UPDATE` dentro dos handlers `app.get`. Achei o termo de interdição (ato com efeito), laudo e desinterdição (trilha), detalhe e busca (`ocorrencia_consultas`). Provei o termo em três estados fora da vigência (A, B, C), por GET e por HEAD.
2. Métodos e override: Fastify não implementa override de método por cabeçalho nem `_method`; verbos fora da lista dão 404; HEAD só existe onde há GET, e lá ele EXECUTA o handler do GET (sonda B), então HEAD herda toda escrita escondida em GET.
3. Prefixos e normalização de caminho: nenhuma variação chegou à rota de escrita sem passar por `exigirAutenticacao`.
4. Renovação para obter token novo depois da desativação: negada.
5. Troca de organização por cabeçalho, query e corpo, e diferença 403 x 404 entre municípios: nada vazou.
6. Rotas sem token (`SEM_TOKEN`): li a lista no relatório de segurança e o `PUT /armazenamento/objeto` (URL assinada); não reexecutei.
7. Corrida entre desativar e escrever: não executada (PGlite é de conexão única). Por leitura, `lerVigencia` (`servidor.ts:481`) abre transação própria e a rota abre outra; a janela existe e é de milissegundos.

## Achados

1. **bloqueia: conta desativada, papel rebaixado e sessão encerrada interditam imóvel por `GET` e `HEAD /documentos/:id/termo-de-interdicao`, e a trilha append-only recebe o ato.**
   Reprodução: `saida1.txt`, sondas A, B, C (passos na tabela acima). `interditada_em` sai de NULL e `trilha_eventos` ganha `documento_emitido` com `autor_papel` do token (inclusive "coordenador" para quem o banco já diz operador, papel que não tem `emitir_documento`).
   Por que é FAIL desta etapa e não dívida da F03-E03:
   - O objetivo da etapa é que essas três contas "deixam de escrever"; a DoD é "sonda de conta desativada não escreve". Interditar é escrita de estado de negócio com efeito jurídico (o termo é o ato), não leitura que deixa rastro. A exclusão do bloco é "vigência em LEITURAS" e "leituras que escrevem (`GET /avisos`)": avisos grava fato derivado, sem autor; o termo grava ato de pessoa. O próprio `vigencia.ts:11-16` justifica a etapa com "em quinze minutos se encerra uma ocorrência com motivo inventado, e a trilha não se corrige", que é o que acontece aqui com uma interdição.
   - Seção 7 de `28`, itens 2 (vigência, conta desativada, sessão revogada) e 4 (trilha append-only): não admite RISCO ACEITO.
   - A correção cabe nesta etapa e é pequena. Opção mínima, provada em `saida2-com-correcao-provisoria.txt`: tratar a rota como escrita na conferência. Opção recomendada: marca na configuração da rota (`config: { comEfeito: true }`, mesmo padrão de `filaDoCampo`) e, em `servidor.ts:478`, escrita passa a ser "verbo de escrita OU rota marcada", aplicada a termo de interdição, termo de desinterdição, laudo e PDFs, e de quebra ao CSV e a `GET /avisos`. Teste que morde: as sondas A, B e C como teste do repositório, mais uma varredura que falhe se nascer GET que chame `registrarEmissao` ou `marcarInterditada` sem a marca.
2. **bloqueia (DoD "comentários batem com o código"): `auth/vigencia.ts:47-50`, o bloco de `servidor.ts:464-477` e `apps/api/PENDENCIAS.md` dizem que leitura não produz registro exceto `GET /avisos`.** Falso no SHA (lista em Critérios verificados). Corrige junto com o Achado 1.
3. **Severidade final dos achados dos outros validadores:**
   - (a) CSV `GET /relatorios/ocorrencias.csv` com conta desativada: **corrige antes de crescer, e NÃO admite risco aceito** (seção 7, itens 2 e 3; a sugestão de `RISCO-ACEITO.md` do relatório de segurança é incompatível com a política). Não é FAIL desta etapa: é leitura de dado que a pessoa via minutos antes, o registro que produz (`exportacoes`, `trilha_administrativa`) é VERDADEIRO sobre o que aconteceu, e a vigência de leitura foi excluída pelo bloco. Mas precisa fechar antes de qualquer implantação, não só na F03-E03: a mesma marca do Achado 1 o fecha agora sem custo para a leitura comum. Se não fechar aqui, vira condição de implantação registrada, nunca aceite.
   - (b) nenhum teste de PATCH, PUT e DELETE na vigência: **corrige antes de crescer**. O código está certo hoje (varredura de 51 rotas do relatório de segurança e leitura de `servidor.ts:478`), mas em risco alto o teste tem de morder a definição de escrita, e a mutação "só POST" passa em 232 testes. A varredura por rota (verbo de escrita OU marca de efeito) resolve (b) e o Achado 1 juntos.
   - (c) `sessoes.expira_em` não conferido: **anotado**. Provei (sonda E, 201). Janela limitada ao token de 15 minutos, a renovação confere o prazo, e "sessão encerrada" no bloco é revogação, não vencimento.
4. **anotado: corrida entre desativar e escrever.** `lerVigencia` e a transação da rota são separadas; inerente a não ter lista de revogação (excluída pelo bloco). Fecha de fato quando a vigência entrar em `comTenant` (F03-E03).
5. **anotado: HEAD executa o handler do GET** (Fastify, rotas HEAD expostas por padrão). Inofensivo para o que só lê, mas toda escrita escondida em GET ganha um segundo verbo; a correção por marca de rota cobre os dois, a por verbo não.

## Não verificado

- Corrida real entre desativação e escrita em voo: PGlite é de conexão única; sem Postgres com conexões paralelas nesta sessão.
- `termo-de-interdicao.pdf` e `laudo.pdf`: exigem o gerador de PDF, ausente no ambiente de teste; pelo código (`responderPdf` chama a mesma `efetivarEmissao`) interditam igual, mas não executei.
- Termo de desinterdição e laudo com conta desativada: pelo código gravam `documento_emitido` e `ocorrencia_consultas`; executei só o termo de interdição e o detalhe.
- Postgres 17 de produção: tudo em PGlite (a consulta de vigência foi provada em Postgres 18.3 pelo relatório de banco).
- Suíte inteira da API e `test:e2e:api` neste SHA: confiei no CI 37739535524 e no relatório de QA; rodei só os três arquivos citados.
- Console (`apps/console`) e envio por URL assinada do armazenamento: não reexecutados.
- E2E de navegador "desativar no painel e o próximo POST falha": não existe; não criei.

## Risco residual

Até a correção: quem perde a conta, o papel ou a sessão interdita imóvel por até 15 minutos (60 se `ACESSO_MINUTOS` subir), e a trilha guarda um ato que não se corrige, com papel falso no caso do rebaixamento; também lê o dossiê e exporta CSV com dado pessoal. A etapa já não podia ir sozinha para produção (E05 e E06); com o Achado 1 aberto não vai de jeito nenhum.

## Motivo do humano

Não se aplica a este veredito: a prova é E1 e E2 reproduzível. A validação humana do bloco (Rafael vê a sonda antes e depois) continua pendente, como registrou o QA.
