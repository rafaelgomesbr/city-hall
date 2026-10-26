---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Saídas em `SCRATCH/val-qa-r7b/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`). Nenhum arquivo da etapa mudou entre `1ed0b71` e `fd17ff4`; o que mudou no caminho dela é a guarda de códigos de erro (agora também na porta dos bytes, `_writeRaw` e `_flushOutput`), os construtores de `RegraDeNegocio` e `AcessoSuspenso` (recusam status não inteiro) e `codigos-de-erro.ts`. Procurei a regressão nesse caminho.

| Critério | Prova | Resultado |
| --- | --- | --- |
| 401 `sessao_encerrada` e 403 `conta_desativada` deixam os itens `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado | `npm run test --workspace @dc360/campo` 11 arquivos, 238 de 238 (`50-campo-verde.txt`); mutação abaixo | PASS |
| Sem token vira `FalhaDeSessao`; 403 `sem_permissao` ainda bloqueia | mesmos arquivos (`pausa-de-sessao`, `pausa-por-senha-provisoria`) e `campo-integracao.test.ts` | PASS |
| `campo-integracao.test.ts`: desativar entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica | dentro de `npm run test:api` (17 de 17; o transporte usa `fetch` contra o servidor real em porta efêmera, com a guarda instalada): 106 arquivos, 1685 aprovados e 34 pulados, código 0 (`40-test-api.txt`) | PASS |
| App de campo: renovação única com piso, frase de conta desativada | `npm run test:campo` 139 suítes, 1997 de 1997, código 0 (`44-test-campo.txt`) | PASS |
| O diff não muda o status nem o corpo do que a fila lê | varredura de todas as 126 construções de `RegraDeNegocio` e `AcessoSuspenso` em `apps/api/src` pela árvore sintática: nenhuma com status fora de inteiro de 400 a 599 além das duas de `AcessoSuspenso` com variável tipada `403 \| 503`, que só recebem literais 403 ou 503 (`45-status-das-regras.txt`); a nova recusa dos construtores não alcança nenhuma rota da fila | PASS |
| E2E no emulador e a frase no aparelho | não executável aqui (sem emulador nem aparelho) | pendência humana |

## Evidência

- CI: run 39420436042 sobre `55209ab`, 9 de 9 jobs `success`, inclusive "Aplicativo de campo" e "A API sobe contra Postgres real" (`05-ci-jobs.txt`).
- `npm run test --workspace @dc360/campo`: 0 (`50`); com a mutação: 1 (`51-MUTACAO-E06-conta-desativada.txt`); restaurado: 0 (`52`).
- `npm run test:api -- --maxWorkers=4`: 0 (`40`). `npm run test:campo`: 0 (`44`). `npm run test --workspace @dc360/shared`: 223 de 223 (`42`).

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e envia; depois de entrar de novo os itens pausados sobem sem duplicar (casos de `pausa-de-sessao` e de `campo-integracao`, verdes).

## Cenários negativos

- Mutação (risco alto, prova de que o teste morde): apaguei em `packages/campo/src/transporte.ts` a linha `if (acao === "parar_e_avisar") return falhaDeSessao("conta_desativada", corpo);`. Resultado: 6 de 238 falham, entre eles "403 conta_desativada vira FalhaDeSessao", "403 conta_desativada pelo fio: pausa por conta desativada, item pendente" e os dois da matriz de classificação ("o item termina no estado certo na fila"). `git restore`, 238 de 238 de novo, árvore limpa.
- Autoria: o caso "item do outro autor espera o autor e não sobe com a sessão de quem entrou" segue verde no pacote e em `campo-integracao`.

## Tentativas de reprovar

1. Regressão pela porta dos bytes da guarda: o transporte do campo fala HTTP real (`fetch`, keep-alive do undici) com o servidor que tem a guarda nova; `campo-integracao` 17 de 17. A troca de resposta da guarda fecha a conexão, mas só sai em desvio, e nenhum desvio aconteceu em toda a suíte (o apoio `guarda-falha-alto.ts` reprovaria).
2. Regressão pelos construtores: procurei status calculado em `RegraDeNegocio` e `AcessoSuspenso` (a recusa nova viraria 500 e a fila trataria como temporária); não há nenhum (`45`).
3. Modo de produção da guarda: em "corrigir", um 403 fora do catálogo vira `sem_permissao`, que a fila trata como permanente (bloqueia o item). Procurei, por HTTP real, 403 fora do catálogo nas rotas: o achado 1 da E05 (resposta contrabandeada pelo `content-length`) só existe com código plantado; nenhuma rota da fila o produz hoje.

## Achados

- Nenhum que bloqueie esta etapa.
- anotado: o achado 2 da E05 (403 com `trailer` e código fora do catálogo derruba o processo por exceção não tratada) não alcança a fila hoje, porque nenhuma rota usa `trailer`.

## Não verificado

- O E2E da etapa no emulador (desativar o agente durante uma coleta e ver a frase no aparelho) e a validação humana: sem emulador Android nem aparelho nesta máquina.
- Os testes do app de campo rodam em Jest com React Native simulado, não no aparelho.
- Node 24.15.0 local, contra o 22 do `.nvmrc` (o job "Aplicativo de campo" do CI, verde, roda no 22).

## Risco residual

O comportamento no aparelho real (ciclo de vida do Expo, rede caindo no meio da renovação) só a validação humana cobre.

## Motivo do humano

A etapa pede que Rafael veja a frase no aparelho e o item preservado, e o E2E é no emulador: nenhum dos dois existe nesta máquina, e a leitura da frase é conteúdo de produto.
