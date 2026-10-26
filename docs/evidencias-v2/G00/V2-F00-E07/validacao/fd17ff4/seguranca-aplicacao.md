---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Sondas e mutações numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca `servidor.ts`, `auth/suspensao.ts` e a guarda (não toca `auth/vigencia.ts`, `auth/servico.ts` nem `db/`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Rotação não é expulsão: o token anterior à renovação escreve enquanto a cadeia vive | HTTP real (`20-sonda-http.txt`, "família da sessão") | PASS |
| Reuso do refresh derruba a cadeia: o token pré-renovação e o novo levam 401 `sessao_encerrada` | HTTP real | PASS |
| A família é por login: outro login segue escrevendo | HTTP real | PASS |
| Papel alterado: token velho 401 `nao_autenticado`; renovado como operador não despacha (403 `sem_permissao`); B continua 404 | HTTP real | PASS |
| Senha provisória vencida: trocar senha 401 `sessao_encerrada`, renovar 401, escrita comum 401 `sessao_encerrada` | HTTP real | PASS |
| O teste morde (risco alto) | mutação M2: a cláusula da família passa a aceitar a rotacionada sempre | PASS: 7 de 33 reprovam |
| Corrida entre renovação e encerramento em Postgres real | `renovacao-contra-encerramento.test.ts` com PostgreSQL 17.6 real | PASS: 53 de 53 (os 34 que o PGlite pula, incluídos) |
| `npm run test:isolamento` verde | rodado pelo gatekeeper neste SHA (345 e 3 pulados); a sonda da RLS abaixo | PASS |

## Evidência

- `20-sonda-http.txt` / `20-sonda-http-vitest.txt`: sonda própria `zz-seg7-http.test.ts` (servidor real em porta efêmera, `fetch`, PGlite com `SET LOCAL ROLE dc360_app`), 13 de 13, código 0.
- `32-m2-e07-familia.txt`: M2 em `auth/vigencia.ts` da cópia (`AND v.revogada_em IS NULL` virou `AND true`), código 1, 7 reprovados em `familia-da-sessao.test.ts` (várias rotações, encerramento pelo administrador, pela própria pessoa, sair, reuso, troca de senha, família por login). Restaurado e conferido com `cmp` contra o do SHA.
- `81-renovacao-postgres-real.txt`: `DC360_POSTGRES_DE_PROVA` apontando para um cluster meu (127.0.0.1:55431, autenticação local de confiança, sem senha), 53 de 53, código 0; cluster derrubado.
- `30-base-verde.txt` (inclui `familia-da-sessao` e `senha-provisoria`): 463 de 463.
- CI: run 39420436042, 9 de 9 `success`, incluindo "Restore do banco, Postgres 17 (CA-08)" e "A API sobe contra Postgres real" (`05-ci-jobs.txt`).

## Cenários positivos

- Renovar devolve par novo; o token pré-renovação escreve (`200`).
- Outro login de Helena, família nova, escreve depois que a primeira cadeia caiu.
- Rebaixada e renovada, Helena recebe token de operadora (o papel do banco).

## Cenários negativos

- Reuso do refresh antigo: `401 sessao_encerrada`; depois disso o token novo da cadeia e o pré-renovação: `401 sessao_encerrada`.
- Token de coordenadora depois do rebaixamento: escrita e despacho `401 nao_autenticado`; token renovado: despacho `403 sem_permissao`; B `404` com os dois tokens.
- Provisória vencida: `trocar-senha` `401 sessao_encerrada`, `renovar` `401`, coordenada `401 sessao_encerrada`; entrar com a provisória vencida diz `senha_provisoria_vencida` só a quem tem a provisória.

## Tentativas de reprovar

1. Procurei sessão rotacionada que sobrevive à morte da cadeia (reuso, encerramento, sair, troca de senha): todas caem por HTTP real e na suíte.
2. Mutação M2 para confirmar que a cláusula da família é a que segura: a suíte reprova.
3. Corrida renovação contra encerramento: só reproduzível em Postgres real (o PGlite serializa); rodei os 34 casos pulados contra Postgres 17.6: verdes.
4. Tentei usar a rota administrativa contra a conta de B (redefinir senha, encerrar sessões): `404`, e B segue intacto.
5. Conferi que a validação nova de `RegraDeNegocio` no diff não muda o 401 ou 403 destes caminhos (AST: nenhum status calculado).

## Achados

1. **anotado (pré-existente, não decide esta rodada).** `revogar_sessoes_do_usuario` e `trocar_senha` (`SECURITY DEFINER`) não conferem o município do contexto: como `dc360_app` com contexto de A, revogaram sessão e trocaram a senha de um usuário de B que a RLS esconde (`60-sonda-banco.txt`). O diff não mudou isso (sem mudança em `db/`). Não alcançável pela API (rotas respondem 404 antes).

## Não verificado

- A migração da família aplicada do zero e sobre banco existente em Postgres real: é da dimensão Banco; aqui só a corrida rodou em Postgres real (a suíte cria banco novo e aplica as migrações).
- A API inteira de pé contra Postgres real com o papel de aplicação de produção (o job do CI está `success`).
- Node 22 do `.nvmrc` (rodei em 24.15.0).

## Risco residual

O achado pré-existente das funções `SECURITY DEFINER` depende de toda rota futura conferir o usuário sob a RLS antes de chamá-las. A troca de papel não revoga sessões (decisão registrada): o token velho fica até 15 minutos podendo LER com o papel antigo.

## Motivo do humano

Nada nesta dimensão depende de pessoa.
