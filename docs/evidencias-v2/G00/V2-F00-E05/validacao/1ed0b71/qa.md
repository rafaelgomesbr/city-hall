---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `SCRATCH/validadores/qa-r6/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`). Árvore principal em `5044e7a`, produto idêntico a `1ed0b71`.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Token vencido responde 401 `nao_autenticado` | atende | `35-sonda-e05-codigos.txt` (token com as mesmas claims e `exp` no passado, assinado com o segredo da instância: leitura e escrita 401 `nao_autenticado`); `codigos-de-erro.test.ts` 171 de 171 em `10-test-api.txt` |
| Sessão encerrada por quem administra responde 401 `sessao_encerrada` | atende | `35-...`: escrita com o token de acesso ainda assinado e renovação, ambos 401 `sessao_encerrada`; e2e seção 23 em `40-e2e-api-chromium.txt` |
| Conta desativada responde 403 `conta_desativada` | atende | `35-...`: escrita com token vivo e `/auth/renovar`, ambos 403 `conta_desativada`; e2e seção 23 (incluindo token vencido mais conta desativada) |
| Teste compara o catálogo do shared com o que o servidor emite | atende nas formas que a varredura lê | `codigos-de-erro.test.ts`; mutação C (`RegraDeNegocio("sessao_encerrada", .., 409)`) reprova 7 casos (`e05/05-mutacao-C-catalogo-com-409.txt`) |
| Negativo: `/auth/entrar` com conta desativada tem a recusa genérica, mesmo status e mensagem da senha errada | atende | `35-...`: corpo idêntico ao da senha errada e ao do email inexistente |
| Negativo: código fora do catálogo reprova o teste de catálogo | NÃO atende | Achado 1: `new RegraDeNegocio("vazou_fracregra", "x", 403.5)` plantado em `rotas/orgaos.ts` deixa `codigos-de-erro.test.ts` e a prova dinâmica verdes (172 de 172, `e05/02-mutacao-A-regra-403.5.txt`) e o servidor responde 403 com o código fora do catálogo, passando pela guarda nos dois modos (`e05/01-sonda-status-fracionario.txt`) |
| Autorização e isolamento: token de conta desativada do município A escrevendo em ocorrência do B recebe `conta_desativada` sem confirmar nada sobre B | atende | `36-sonda-e05-isolamento-desativada.txt`: cinco rotas de escrita de ocorrência, ocorrência de outro município e id inexistente, respostas idênticas, 403 `conta_desativada` |
| O 404 de recurso de outro município não muda | atende | `35-...`: coordenador do outro município lê ocorrência alheia, 404 idêntico ao do id inexistente |
| Regressão obrigatória | atende | `test:api` 1590 aprovados e 34 pulados, código 0 (`10`); `test:isolamento` 345 e 3 pulados (`11`); web 688 de 688 (`12`); `test:campo` 139 suítes, 1997 testes (`13`); `superficie.test.ts` 9 de 9 dentro do `test:api` |
| E2E: desativar um usuário e a próxima chamada dele levar à entrada com a frase certa | atende | `40-e2e-api-chromium.txt`, seção 23, 19 verificações OK; suíte principal 288 aprovadas, 0 falha, zero erro de console |
| DoD: nenhuma ocorrência do texto `sessao` como código | atende | varredura (`codigos-de-erro.test.ts`) e leitura: nenhum `FalhaAutenticacao("sessao"` no fonte |
| Documentação diz a verdade (README seção "Códigos de erro de acesso" e cabeçalho do catálogo) | NÃO atende | Achado 1: `dc360/README.md:150-151` ("toda resposta 401 ou 403 do servidor tem código nele. Quem GARANTE isto é uma guarda em tempo de execução") e o item 0 do cabeçalho de `packages/shared/src/codigos-de-erro.ts` são desmentidos; a lista do que a guarda "NÃO vê" (`README.md:239-246`) não cita o caso |
| Validação humana (Rafael aprova as três frases) | pendente | fora do alcance do validador |

## Evidência

- `npm run test:api`: código 0, 106 arquivos, 1590 aprovados, 34 pulados (`10-test-api.txt`).
- `npm run test:isolamento`: código 0, 345 aprovados e 3 pulados (`11-test-isolamento.txt`).
- `npm run test --workspace @dc360/web`: código 0, 688 de 688 (`12-test-web.txt`).
- `npm run test:campo`: código 0, 1997 testes (`13-test-campo.txt`); pacote do campo 238 de 238 (`15`); console 274 de 274 (`16`).
- `npm run test:e2e:api` (Chromium): código 0, suíte principal 288 aprovadas, geometria 149 aprovadas, zero erro de console (`40-e2e-api-chromium.txt`).
- Sonda de status fracionário na API (arquivo de teste temporário posto em `apps/api/test/` e apagado; cópia em `e05/zz-qa-sonda-e05.test.ts`), HTTP real e `inject`, modos "falhar" e "corrigir": `e05/01-sonda-status-fracionario.txt`.
- Mesma sonda no console (arquivo temporário apagado): `e05/04-sonda-console-status-fracionario.txt`.
- Mutações no fonte real, cada uma restaurada com `git restore` e conferida com `git diff --stat` vazio: A (`e05/02`), B (`e05/03`), C (`e05/05`); guarda desligada (`24-mutacao-e05-guarda-desligada.txt`: 54 falham e 17 passam, igual ao declarado pelo implementador).
- Sondas HTTP contra API própria (PGlite, porta 3795): `35-sonda-e05-codigos.txt` (12 de 12), `36-sonda-e05-isolamento-desativada.txt`.

## Cenários positivos

- Os três códigos saem do servidor real com o status do catálogo, por requisição (`35`), e o painel leva cada um à frase certa na tela de entrada (e2e seção 23).
- Rota com código do catálogo e status certo passa intacta pela guarda; o controle `code(403).send({ erro: "vazou_controle" })` é pego nos dois modos (500 em teste, 403 `sem_permissao` em produção), na API e no console (`e05/01`, `e05/04`).
- A guarda morde: desligada, 54 casos do teste dela reprovam (`24`).

## Cenários negativos

- Entrar com conta desativada: corpo e status iguais aos da senha errada e do email inexistente (`35`).
- Conta desativada do município B escrevendo em ocorrência do município A: 403 `conta_desativada`, idêntico ao de id inexistente, nas rotas de triagem, despacho, providência, encerramento e coordenada (`36`).
- Coordenador ativo do outro município: 404 idêntico ao inexistente (`35`).
- Código do catálogo com status trocado (409): a varredura reprova (`e05/05`).

## Tentativas de reprovar

1. Status fracionário na resposta (forma não listada nos relatórios anteriores). O Node trunca o status no `writeHead` (`statusCode |= 0`), o Fastify aceita qualquer número entre 100 e 599 em `reply.code`, e a guarda compara com `=== 401 || === 403` (`apps/api/src/guarda-de-codigos-de-erro.ts`, `ehAcesso`, e a mesma linha na cópia do console). Resultado, por HTTP real e por `inject`, nos dois modos: `reply.code(403.5).send({ erro: "vazou_frac" })` sai 403 com o código fora do catálogo; `reply.code(401.9)` sai 401; `reply.code("403.2")` sai 403; `throw new RegraDeNegocio("vazou_fracregra", "x", 403.5)` sai 403 pelo tratador global (`resposta.code(erro.status)`); zero desvio registrado em todos. Console: `code(403.5)` sai 403 `vazou_frac_console` com zero desvio. Só `Object.assign(new Error, { statusCode: 403.5 })` vira 500.
2. A mesma forma contra as duas linhas anteriores, no fonte real: mutação A (`RegraDeNegocio` com 403.5 dentro do handler de `rotas/orgaos.ts`): varredura e prova dinâmica verdes, 172 de 172. Mutação B (`app.get("/qa-frac", ... code(403.5).send(...))` no mesmo arquivo): varredura verde; só a prova dinâmica reprova, porque a rota é pública e trivial de alcançar.
3. Conferi se o README promete o que o teste prende sobre status trocado: mutação C reprova, a frase vale.
4. Formas da rodada 5 e da revisão (constante reatribuída, colchete, `onSend` acrescentado, tratador de reserva): cobertas pelo teste da guarda (71 casos) e pela varredura (171), verdes no SHA; não repeti as dezesseis formas uma a uma.
5. Isolamento com conta desativada e enumeração pela entrada: sem defeito (`35`, `36`).

## Achados

1. **bloqueia.** A guarda em tempo de execução, apresentada como a GARANTIA do catálogo, não vê resposta 401 ou 403 cujo status chega fracionário ao `writeHead`, e as duas linhas anteriores também não. Reprodução: plantar `throw new RegraDeNegocio("vazou_fracregra", "x", 403.5);` em qualquer handler (feito em `apps/api/src/rotas/orgaos.ts`, no lugar do 404 do PATCH): `npx vitest run test/codigos-de-erro.test.ts test/prova-dinamica-dos-codigos-de-erro.test.ts` fica 172 de 172 verde (`e05/02`), e o servidor responde `403 {"erro":"vazou_fracregra",...}` em teste e em produção, sem desvio (`e05/01`). O mesmo vale para `reply.code(403.5)`, `reply.code(401.9)`, `reply.code("403.2")` e para o console (`e05/04`). Isso viola o teste negativo da etapa ("código fora do catálogo reprova o teste de catálogo") e desmente `dc360/README.md:150-151` e o item 0 do cabeçalho de `packages/shared/src/codigos-de-erro.ts`; a lista do que a guarda não vê não cita o caso. É a mesma classe de defeito que reprovou as rodadas 4 e 5 (texto que promete mais do que o teste prende), agora na guarda. Conserto mínimo: a guarda normalizar o status como o Node faz antes de decidir (truncar para inteiro, e converter texto) nos três métodos da API e do console, com caso de mordida para `403.5`, `401.9` e `"403"`; ou a varredura reprovar status não inteiro em `code`/`status`/`RegraDeNegocio`, e o README dizer a lacuna.
2. **anotado.** No SHA, nenhum ponto do produto usa status fracionário; o defeito é da garantia contra código novo, que é o que o critério negativo pede. Achado herdado sem mudança: a frase do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.", `apps/api/src/auth/servico.ts:793`, `:824`, `:914`) segue diferente da do catálogo.
3. **anotado.** O achado "corrige antes de crescer" da rodada 4 (GUIA-DO-COORDENADOR dizendo que trocar o papel encerra a sessão) está consertado: `dc360/docs/GUIA-DO-COORDENADOR.md:171-172` diz que não encerra.

## Não verificado

- Não rodei `npm run test:e2e:api` em Firefox nem WebKit; só Chromium.
- Não planto status fracionário na varredura do console (só confirmei a guarda do console em execução).
- Não repeti uma a uma as 16 formas da primeira revisão e os 16 escapes da segunda; confiei nos 71 casos do teste da guarda, que rodei e cuja mordida conferi desligando a guarda.
- App de campo em aparelho ou emulador: indisponível nesta máquina; o que a etapa toca no app ficou na suíte jest (`13`).
- CI do SHA ausente (H32).

## Risco residual

Enquanto a guarda comparar o status por igualdade estrita, uma regra de negócio escrita com status não inteiro, ou um repasse de status calculado por conta, publica 401 ou 403 com código que nenhum cliente conhece, e nem o teste nem o log de produção avisam. Os clientes tratam código desconhecido como erro comum, então o efeito é o aparelho ou o painel não reconhecer sessão morta ou conta desativada naquele ponto.

## Motivo do humano

Rafael precisa ler e aprovar as três frases mostradas ao usuário (validação humana da etapa: mensagem é conteúdo de produto); isso não é verificável por execução.
