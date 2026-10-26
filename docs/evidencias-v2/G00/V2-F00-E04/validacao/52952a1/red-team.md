---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Árvore: HEAD 95f09f6 (só `STATUS.md` difere de 52952a1). Ambiente: Postgres 17.10 descartável (porta 55541, papéis como o job `implantavel`: `dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER migra e semeia, `dc360_api` restrito membro de `dc360_app`), API do SHA por `tsx src/index.ts` com `dc360_api` (porta 55641). Saídas em `$SP/val/red-team/` (abaixo, só o nome).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Conta desativada não escreve (sonda da DoD) | PASS | varredura própria, `e04/estado-desativada.*`: 67 de 67 pedidos de escrita (todo POST, PATCH, PUT, DELETE fora de `SEM_TOKEN`, mais GET e HEAD das 8 rotas com efeito) com 403 `conta_desativada` e banco intacto |
| Papel rebaixado e sessão encerrada por quem administra não escrevem | PASS | `estado-papel-rebaixado` (67 de 67, 401 `nao_autenticado`), `estado-sessao-encerrada` (67 de 67, 401 `sessao_encerrada`), banco intacto |
| Cadeia encerrada com o token anterior à renovação | PASS | `estado-cadeia-encerrada-token-rotacionado`: 67 de 67, 401 `sessao_encerrada` |
| Senha provisória vencida | PASS | `estado-provisoria-vencida`: 67 de 67, 401 `sessao_encerrada`; as 86 leituras com a marca `sp` respondem 403 `troca_de_senha_obrigatoria` |
| Quatro rotas da fila respondem 503 com o município suspenso; o resto 403 `acesso_suspenso` | PASS | `estado-suspenso-token-vivo`: 67 de 67 (as 4 da fila 503, as demais 403); `estado-suspenso-token-vencido`: 153 de 153 (toda rota, leitura incluída, 403 ou 503) |
| GET com efeito (laudo, termos, PDFs, CSV, `/avisos` e `/avisos/`) passa pela vigência, GET e HEAD | PASS | mesma varredura, linhas marcadas `E` com método GET e HEAD |
| Nenhum GET fora da lista escreve | PASS com a exceção já decidida | `estado-vigente-*-get.txt`: com token vigente, foto de 35 tabelas antes e depois de cada um dos 102 GET e HEAD; só escrevem o dossiê (`ocorrencia_consultas`, decisão registrada) e as rotas marcadas |
| Zero `skip` em vigência | PASS | `01-suites-alvo-pglite.txt`: 14 arquivos, 216 aprovados; os 9 pulados são o bloco de Postgres real de `renovacao-contra-encerramento`, rodado por mim em Postgres 17 (14 de 14, `30-e07-prova-pg17.txt`) |
| Comentários batem com o código (defeito da rodada 2) | PASS, NÃO MORDE MAIS | li `auth/suspensao.ts` frase a frase contra o código e contra a varredura: escrita com token vivo 403 e 503 na fila, token vencido autêntico 403 e 503 na fila, leitura sem a marca não confere, renovar com sessão já revogada 401 `sessao_encerrada`, `ESPERA_MAXIMA_MS` de 5 minutos em `packages/campo/src/fila.ts:205`, `recuperacao_desligada` existe. `vigencia.ts`, `sessoes.ts`, o bloco de `servidor.ts` e a linha do README conferem |
| Defeito da rodada 1 (GET com efeito fora da vigência) | NÃO MORDE MAIS | varredura acima e mutação M1 |
| Isolamento: B contra A continua 404 | PASS | `40-e08-agente-e-cruzamento.txt` (dossiê, laudo, termo, usuário, equipe de outro município: 404, banco intacto); `npm run test:isolamento` 345 aprovados e 3 pulados, código 0 (`60-test-isolamento.txt`) |
| O teste morde | PASS | mutações M1, M2, M3 abaixo |

## Evidência

- `05-printroutes.txt`: árvore de rotas lida do servidor montado (script `scripts/rotas.mts`).
- `10-e04-estados.txt`, `11-e04-analise.txt` e `e04/estado-*.{txt,json}`: varredura (scripts `scripts/e04-estados.mjs`, `varredura.mjs`, `analisar.mjs`), código 0. Cada pedido tem foto (contagem e md5 de todas as linhas) de todas as tabelas do `public` antes e depois. O ritmo respeita o limite de 300 pedidos por minuto por usuário (a primeira rodada sem pausa levou 429 e foi descartada).
- `01-suites-alvo-pglite.txt`: 14 arquivos da API (vigência, GET com efeito, suspensão, família, códigos, senha provisória, sino, ofícios, superfície), 216 aprovados, código 0.
- Mutações (diff e saída arquivados; `git restore` depois de cada uma, `git status --porcelain` só com os relatórios):
  - M1 `20-*`: sem a metade `comEfeito` em `servidor.ts`: `get-com-efeito` e `acesso-suspenso`, 6 de 30 vermelhos.
  - M2 `21-*`: sem `exigirVigencia`: 29 de 65 vermelhos em 4 arquivos.
  - M3 `22-*`: suspensão sempre 403 (fila sem 503): 3 de 20 vermelhos em `acesso-suspenso`.
  - Verde de novo: `01` (antes) e `55-e08-verde-depois.txt`, `60-test-isolamento.txt` (depois).

## Cenários positivos

Conta vigente: os GET marcados emitem e gravam (laudo e termos gravam `ocorrencia_consultas`, CSV grava `exportacoes`), o que prova que a foto enxerga escrita. Renovação normal: o token anterior escreve (prova em Postgres 17, caso 5).

## Cenários negativos

Sete estados de conta contra as 153 combinações de método e rota que exigem token: nenhuma escrita aceita, nenhuma linha mudou em nenhuma tabela. Coordenadora de A contra recursos de B: 404, nunca 403.

## Tentativas de reprovar

1. Procurei GET ou HEAD que escreve fora da lista, pelo comportamento (foto do banco inteiro), não pelo texto: só o dossiê, que é decisão registrada.
2. Variantes com barra final (`/avisos/`, `/ocorrencias/`, `/aparelhos/`, `/oficios/`) e HEAD gerado pelo Fastify: herdam a marca.
3. Token vencido de município suspenso em leitura pura: 403, como o comentário diz.
4. Rotas que autenticam por outro caminho: `rotas/segundo-fator.ts` (desafio de ativação) e `rede.ts` (só chave do limitador). O desafio não é aceito por rota de escrita comum.
5. Desfiz a marca, a conferência e o 503 (M1 a M3): os testes mordem.

## Achados

- ANOTADO: `GET /ocorrencias/:id` grava `ocorrencia_consultas` com token de conta desativada, papel rebaixado ou cadeia encerrada (visto na varredura); decisão registrada, vigência em leitura é da F03-E03.
- ANOTADO: a sessão aberta por um login simultâneo à troca ou redefinição de senha (achado do banco nesta rodada, E07) passa pela vigência porque a sessão está de pé; o defeito é de revogação (E07), não da conferência desta etapa.

## Não verificado

- Corrida entre a leitura da vigência e a escrita da rota (duas transações): não medi.
- O mesmo em Postgres 16 e em pooler de transação.
- Navegador (desativar pelo painel e ver o POST seguinte falhar): coberto pelo e2e de outras dimensões, não por mim.

## Risco residual

Leitura pura segue confiando no token por até 15 minutos (F03-E03). Portão de GET com efeito continua heurístico para rota nova (achado das rodadas anteriores, F03-E12).

## Motivo do humano

Não se aplica.
