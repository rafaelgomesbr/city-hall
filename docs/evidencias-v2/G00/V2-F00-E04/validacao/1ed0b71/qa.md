---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Todos os comandos rodaram no produto de `1ed0b71` (árvore principal em `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`). As mutações e as sondas rodaram num worktree meu destacado em `1ed0b71`, com os pacotes `@dc360/*` apontando para o próprio worktree; a árvore principal não foi tocada. Saídas em `SCRATCH/validadores/qa/` (SCRATCH é o scratchpad da sessão do gatekeeper).

| Critério do bloco | Prova | Resultado |
| --- | --- | --- |
| DoD: sonda de conta desativada não escreve | sonda própria `zz-qa-varredura-vigencia` (153 pedidos: toda rota registrada fora de `SEM_TOKEN`, em todo método, mais o HEAD de cada GET, com identificadores reais): 59 escritas respondem 403 `conta_desativada`, nenhuma tabela do esquema público muda (`saidas/34`) | PASS |
| Negativo: conta desativada, papel rebaixado, sessão encerrada por quem administra recebem recusa ao escrever | `vigencia-na-escrita` 13 de 13, `get-com-efeito` 10 de 10, `familia-da-sessao` 20 de 20, `acesso-suspenso` 20 de 20 (`saidas/01`); a mesma varredura com a sessão encerrada PELA ROTA de quem administra: 59 escritas 401 `sessao_encerrada`, nenhuma tabela muda (`saidas/34`) | PASS |
| Negativo: a pessoa que encerra "as outras sessões" mantém a sua | `vigencia-na-escrita` e o último caso de `get-com-efeito` verdes (`saidas/01`) | PASS |
| Positivo: conta ativa escreve | controle de `get-com-efeito` e casos positivos de `vigencia-na-escrita` verdes (`saidas/01`) | PASS |
| Autorização e isolamento: B contra ocorrência de A continua 404; `test:isolamento` verde | `vigencia-na-escrita` (caso de B com a vigência ligada) verde; `npm run test:isolamento` 345 aprovados e 3 pulados de 348, código 0 (`saidas/03`) | PASS |
| DoD: zero `skip` em vigência | `grep skip` nos três arquivos da vigência: só a menção histórica no comentário; `test:api` com `DC360_POSTGRES_DE_PROVA` apontando para Postgres 17.6: 1624 de 1624, nenhum pulado (`saidas/01`) | PASS |
| DoD: comentários batem com o código | `servidor.ts` (escrita = método ou `comEfeito`, vigência e suspensão na mesma ida), linha do token do `README.md` (lista dos GET marcados, dossiê e busca fora) lidos contra o código e contra a varredura comportamental | PASS |
| Regressão obrigatória | `npm run test:api` 106 arquivos, 1624 de 1624 (`saidas/01`); `test:isolamento` (`saidas/03`); `superficie.test.ts` 9 de 9 dentro da API; `npm run test:e2e:api` 288 e 149 `OK`, 0 falha, zero erro de console (`saidas/08`) | PASS |
| E2E: desativar no painel e o próximo pedido dele falhar | seção 23 do e2e: "a coordenacao desativa o Marcos pelo painel", "conta desativada leva a tela de entrada", "e diz que a conta foi desativada" (`saidas/08`) | PASS |
| Regressão desde a rodada 4 (`bb0f654..1ed0b71` tocou `auth/`, `servidor.ts`, `rotas/administracao.ts`) | nenhuma rota nova; a guarda de códigos de erro (`onRequest` que envolve a resposta do Node) não muda o código de nenhuma recusa da vigência (os 4 do catálogo); a varredura comportamental cobre a superfície inteira, inclusive HEAD | PASS |

## Evidência

- `saidas/01-test-api.txt`: `npm run test:api` com Postgres 17.6 real (cluster descartável em 127.0.0.1:55937), código 0, 106 arquivos, 1624 de 1624.
- `saidas/03-isolamento.txt`: `npm run test:isolamento`, código 0, 345 aprovados, 3 pulados.
- `saidas/08-e2e-api.txt`: `npm run test:e2e:api`, código 0, "Passou: 288 Falhou: 0" e "Passou: 149 Falhou: 0", zero erro de console.
- `saidas/34-sonda-varredura-vigencia.txt`: sonda própria (`sondas/zz-qa-varredura-vigencia.test.ts`), código 0.
- `saidas/38-varredura-com-mutacao-sem-comEfeito.txt`: a mesma sonda com a marca `comEfeito` tirada da decisão de escrita, código 1 de propósito.
- `mut/E04-M1` a `mut/E04-M4`: mutações, roteiro `mutar.py`.

## Cenários positivos

- Quem está vigente continua emitindo o termo (interdita e grava), o laudo e o CSV (controle de `get-com-efeito`).
- Na varredura, as 30 leituras puras com token de conta desativada seguem 200 (decisão da etapa: leitura fica para a F03-E03) e não mudam tabela nenhuma, exceto o registro da própria leitura do dossiê.

## Cenários negativos

- Conta desativada: 59 escritas (POST, PATCH, PUT, DELETE e os GET com efeito) 403 `conta_desativada`; nenhuma tabela muda, comparando a impressão digital (md5 de todas as linhas) de todas as tabelas do esquema público antes e depois de cada pedido.
- Sessão encerrada por quem administra, pela rota `POST /usuarios/:id/encerrar-sessoes`: as mesmas 59, 401 `sessao_encerrada`; nenhuma tabela muda.
- HEAD dos GET com efeito (laudo, termos, PDFs, CSV, avisos): recusados (14 HEAD 403 com a conta desativada, 8 HEAD 401 com a sessão encerrada), sem gravar.

## Tentativas de reprovar

- Mutações no worktree, cada uma restaurada com `git checkout` e conferida limpa:
  - M1, vigência desligada (`if (escrita)` vira `if (false)`): 34 de 234 reprovam em `vigencia-na-escrita`, `get-com-efeito`, `familia-da-sessao`, `acesso-suspenso`, `codigos-de-erro` (`mut/E04-M1`).
  - M2, escrita só por método (sem `comEfeito`): 6 de 30 reprovam (`mut/E04-M2`); a minha varredura também reprova, com 11 escapes por conta desativada (GET e HEAD do laudo, termos, PDFs, CSV e `GET /avisos` gravando `trilha_eventos`, `ocorrencias`, `ocorrencia_consultas`, `exportacoes`, `avisos`) (`saidas/38`). A sonda morde.
  - M3, `GET /avisos` sem a marca: 3 de 30 reprovam (`mut/E04-M3`).
  - M4, senha provisória só pelo token: 1 de 22 reprova (`mut/E04-M4`).
- Procurei rota com efeito escapando da conferência depois das mudanças desde a rodada 4: a varredura passa por todas as rotas registradas, inclusive as que a rodada 4 não tinha, em GET, HEAD e escrita, com identificadores reais (ocorrência vistoriada com interdição indicada, a própria coordenadora, a equipe). Nenhum escape.
- Conferi se a guarda nova de códigos de erro (`guarda-de-codigos-de-erro.ts`) poderia trocar uma recusa da vigência por outro código em produção: os códigos da vigência estão no contrato com o status certo, então ela não reescreve; e em teste (modo "falhar") qualquer desvio teria virado 500 e reprovado a suíte, o que não aconteceu em 1624 casos.

## Achados

- Anotado (já registrado, decisão da etapa): com a conta desativada ou a sessão encerrada, `GET /ocorrencias/:id` E `HEAD /ocorrencias/:id` gravam `ocorrencia_consultas` (o registro da própria leitura). Reproduzido na varredura nos dois estados (`saidas/34`). README e `PENDENCIAS.md` falam do dossiê; o HEAD segue o GET.
- Nenhum achado que bloqueia.

## Não verificado

- A janela da escrita em voo (a escrita que passou pela vigência confirma depois da desativação, até 223 ms medidos pelo red-team da rodada 4) não foi medida de novo por mim; é risco residual registrado para a F03-E03, fora do critério escrito ("responde no pedido seguinte").
- Leitura pura com token de conta desativada (fora do escopo, F03-E03).
- O e2e do painel não foi rodado no navegador do aparelho; o roteiro de ponta a ponta usa Chromium.
- CI do SHA ausente (H32); Node local 24.15.0, o `.nvmrc` pede 22: nenhuma divergência observada nas suítes.

## Risco residual

A vigência é conferida no começo do pedido; uma escrita longa que já passou por ela pode confirmar depois da desativação (classe registrada para a F03-E03). Fora disso, a superfície inteira está coberta por teste que morde e por varredura comportamental.

## Motivo do humano

não se aplica
