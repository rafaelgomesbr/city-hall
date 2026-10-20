---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Produto de `fd17ff4` (árvore em `55209ab`). Sondas e mutações numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca `servidor.ts`, `auth/suspensao.ts` e a guarda.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Conta desativada não escreve com o token vivo | HTTP real (`20-sonda-http.txt`): `403 conta_desativada` na escrita seguinte à desativação pela rota `PATCH /usuarios/:id/situacao` | PASS |
| Papel rebaixado não escreve com o papel velho | HTTP real: `401 nao_autenticado` na escrita e no despacho com o token de coordenador depois de `PATCH /usuarios/:id` para operador | PASS |
| Sessão encerrada por quem administra ou pela própria pessoa nega; a de quem clicou sobrevive | HTTP real: sessão um `200`, sessão dois `401 sessao_encerrada`, renovação da dois `401` | PASS |
| Token de B contra ocorrência de A continua 404 | HTTP real: ler, escrever e despachar `404 nao_encontrada`, corpo igual ao de ocorrência inexistente | PASS |
| Organização só do token verificado | HTTP real: token com `org` trocada para B (assinatura velha) e token `alg: none`: `401 nao_autenticado` | PASS |
| Rotas administrativas com `:id` de conta de B (encerrar sessões, redefinir senha, desativar, mudar papel) | HTTP real: as quatro `404`, e a conta de B continua escrevendo e entrando com a senha de sempre | PASS |
| O teste morde (risco alto) | mutação M1: `exigirVigencia` desligada em `servidor.ts` da cópia | PASS: `vigencia-na-escrita.test.ts` 6 de 13 reprovam |
| Zero `skip` em vigência; suíte verde | `30-base-verde.txt` 463 de 463; `renovacao-contra-encerramento` 53 de 53 em PostgreSQL 17.6 real (`81`) | PASS |

## Evidência

- `20-sonda-http.txt` / `20-sonda-http-vitest.txt`: sonda própria `zz-seg7-http.test.ts`, servidor real escutando em porta efêmera, `fetch` real, PGlite com a semente e `SET LOCAL ROLE dc360_app`; 13 de 13, código 0.
- `31-m1-e04-vigencia.txt`: M1, código 1, 6 reprovados (conta desativada, papel rebaixado, sessões encerradas, leitura até vencer, suspensão primeiro, `sid` de outra pessoa). Arquivo restaurado e conferido com `cmp` contra o do SHA.
- `30-base-verde.txt`: 463 de 463, código 0. `70-regressao-seg.txt`: 126 aprovados e 34 pulados (Postgres real), código 0; `81-renovacao-postgres-real.txt`: 53 de 53 contra PostgreSQL 17.6 real (cluster meu em 127.0.0.1:55431, derrubado ao fim).
- `scripts/args-regra.cjs` (AST): todo status de `RegraDeNegocio`, `AcessoSuspenso` e `FalhaAutenticacao` na API e no console é literal válido ou `403 | 503` de origem fixa: a validação nova do construtor não transforma nenhuma recusa da vigência em 500.
- CI: run 39420436042, 9 de 9 `success` (`05-ci-jobs.txt`).

## Cenários positivos

- Helena escreve antes da desativação (`200`); depois de restaurada volta a escrever.
- Rotação não é expulsão: o token anterior à renovação escreve enquanto a cadeia vive.
- A leitura com token vivo de conta desativada segue `200` até vencer (troca declarada na etapa).

## Cenários negativos

- Desativada: `403 conta_desativada` em A, em B e em inexistente com corpo idêntico; renovar `403 conta_desativada`; entrar igual à senha errada.
- Rebaixada: `401 nao_autenticado`; renovada como operadora, despacho `403 sem_permissao`; B `404` com o token velho e o novo.
- Sessão de outra máquina encerrada: `401 sessao_encerrada`.
- Município suspenso com conta desativada responde a suspensão primeiro (`vigencia-na-escrita.test.ts`, verde e mordido por M1).

## Tentativas de reprovar

1. Procurei a regressão do diff na vigência: status de erro que passasse a sair 500 pela validação nova de `RegraDeNegocio` (AST de todas as construções: nenhum caso) e `AcessoSuspenso` com status calculado (só `403 | 503` de `filaDoCampo ? 503 : 403`).
2. Forjei a organização no token (troca do `org` no payload sem reassinar; `alg: none`): `401`.
3. Tentei, como administradora de A, agir sobre a conta de B pelas rotas que acabam nas funções `SECURITY DEFINER` (encerrar sessões, redefinir senha): `404` antes de tocar nelas; a conta de B segue viva.
4. Encerrar "as outras" e depois renovar a sessão encerrada: `401`.
5. Desliguei a conferência na cópia (M1) para ver o teste morder: morde.

## Achados

1. **anotado (pré-existente, não decide esta rodada).** `revogar_sessoes_do_usuario` e `trocar_senha` (`SECURITY DEFINER`, migrações 005 e 049) não conferem o município do contexto: no PGlite, como `dc360_app` com `app.organizacao_atual` = A, a função revogou 1 sessão de um usuário de B e trocou a senha dele, embora a RLS esconda esse usuário (`60-sonda-banco.txt`). O diff desta rodada não mexe em `db/`. Não é alcançável pela API: as rotas conferem o usuário sob a RLS antes e respondem 404 (tentativa 3).

## Não verificado

- A sonda HTTP rodou com PGlite e `SET LOCAL ROLE dc360_app`; a API inteira contra Postgres real com o papel de aplicação de produção não foi subida por mim (o job "A API sobe contra Postgres real" do run 39420436042 está `success`).
- Node 22 do `.nvmrc` (rodei em 24.15.0).
- A janela de 15 minutos em que a LEITURA segue com token de conta desativada é troca declarada da etapa (F03-E03), não conferida como defeito.

## Risco residual

O achado pré-existente das funções `SECURITY DEFINER` vira explorável no dia em que uma rota chamar essas funções com identificador vindo da requisição sem conferir o usuário sob a RLS antes. Leituras com efeito fora da vigência (`GET /avisos`) seguem até a F03-E03, como a etapa declara.

## Motivo do humano

Nada nesta dimensão depende de pessoa: todos os critérios de segurança da etapa foram executados por requisição real e por mutação.
