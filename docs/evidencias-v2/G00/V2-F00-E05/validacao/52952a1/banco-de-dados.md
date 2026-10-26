---
validador: banco-de-dados (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Dimensão acrescentada pelo gatekeeper por causa da migração 048 e do que a 049 e a 050 mudaram nas funções que a E05 usa. Ambiente: Postgres 17.10 descartável com os papéis do job `implantavel`, API do SHA com o login restrito `dc360_api` (detalhes no relatório de banco da E07 desta rodada). Saídas em `$SP/val/banco-de-dados/`.

1. 048 reconferida no SHA: `dono_do_token(text)` SECURITY DEFINER, `search_path=public, pg_temp`, dono `dc360_setup`, EXECUTE só `dc360_app`; teto de 27 funções privilegiadas mantido (`06-catalogo.txt`). 049 e 050 não tocam `dono_do_token` nem `sessao_por_token` (conferido no texto das duas migrações e no `git diff 4b96ea7..52952a1 -- db/migrations`, que só acrescenta 049 e 050). A 048 aplica do zero e o banco existente até a 048 recebe 049 e 050 sem perder sessão (relatório da E07, itens 7 e 8).
2. Os três códigos, em Postgres 17 pela API real (`95-e05-codigos-pg17.txt`):
   - token desconhecido: 401 `sessao_encerrada`;
   - sessão encerrada por quem administra: renovar 401 `sessao_encerrada`; escrita com o token de acesso 401 `sessao_encerrada`;
   - conta desativada pela rota real (`PATCH /usuarios/:id/situacao`): renovar 403 `conta_desativada` (repetível), escrita 403 `conta_desativada`;
   - entrar com a conta desativada: 401 `credenciais`, "Email ou senha inválidos.", corpo idêntico ao de e-mail inexistente e de senha errada (sem oráculo);
   - desativada e reativada: o token antigo volta a `sessao_encerrada`.
3. `test/codigos-de-erro.test.ts` e `test/saida-de-municipio.test.ts`: 54 de 54, código 0 (`99-saida-e-codigos-vitest.txt`). Campanha de corrida da E07 contra a desativação: 150 disputas, 0 sessão viva, 50 renovações com 403 `conta_desativada` (`20-corrida-verde-pg17.txt`).
4. Isolamento: `npm run test:isolamento` 345 aprovados e 3 pulados, código 0 (`50`); sem contexto, `dc360_app` não lê sessão nenhuma (`94`).
5. Defeitos das rodadas anteriores nesta dimensão: o FAIL da rodada 1 (desativar pela rota real dava `sessao_encerrada`) NÃO morde mais (item 2). O achado "corrigir antes de crescer" da rodada 2 (nenhum teste trava as colunas que `dono_do_token` devolve) continua: não há teste de contrato da função em `db/test` (só a API a usa em `senha-e-sessoes.test.ts`); não reexecutei a mutação, conferido por leitura.

## Evidência

- `95-e05-codigos-pg17.txt` (script `e05.mjs`): os códigos acima, um por linha, com status e corpo.
- `96-e05-renovacao-perde-para-desativacao.txt` (script `e05-corrida-desativacao.mjs`): achado 1.
- `06-catalogo.txt`, `50-test-isolamento.txt`, `99-saida-e-codigos-vitest.txt`, `20-corrida-verde-pg17.txt`.

## Cenários positivos

Conta desativada pela rota recebe 403 `conta_desativada` na renovação e na escrita; conta reativada entra de novo.

## Cenários negativos

Token desconhecido e token de conta ativa encerrada saem iguais (`sessao_encerrada`); entrar com conta desativada, com e-mail inexistente e com senha errada saem com o mesmo corpo; sem contexto de município, 0 linha.

## Tentativas de reprovar

1. Renovação que lê a conta ATIVA e perde a trava da 049 para a desativação (disputa segurada: segurei `travar_sessoes_do_usuario` numa conexão, disparei a desativação, depois a renovação, conferi em `pg_locks` as duas paradas e soltei): 5 de 5 com 401 `sessao_encerrada` na renovação; o mesmo token reapresentado em seguida leva 403 `conta_desativada` (`96`). Ver achado 1.
2. Oráculo de conta por `/auth/entrar`: não quebrou (corpos idênticos).
3. Reativação devolvendo o token antigo: não quebrou (`sessao_encerrada`).

## Achados

1. CORRIGE ANTES DE CRESCER (dono E07, `apps/api/src/auth/servico.ts`, ramo `sessaoNova === null` da renovação): o caminho novo da correção 2 da E07 responde 401 `sessao_encerrada` a quem perde a trava para a desativação, sem perguntar a `dono_do_token`. O painel trata isso como "entre de novo", e a pessoa lê depois a recusa genérica: o desfecho que a correção 1 desta etapa consertou, de volta numa janela de milissegundos (a renovação já estava em voo quando a conta foi desativada). Não reprova a E05: o critério "conta desativada responde 403" vale fora da disputa, e uma nova tentativa com o mesmo token já recebe 403; a segurança não muda (nenhum par é emitido). Conserto: chamar `tratarTokenRecusado(hash)` antes de responder no ramo `null`.
2. CORRIGE ANTES DE CRESCER (herdado da rodada 2, continua aberto): teste de contrato das colunas de `dono_do_token`.
3. ANOTADO (fora do escopo, dono provável API): corpo vazio com `content-type: application/json` responde 500 `erro_interno` em vez de 400, código fora do catálogo de erros.

## Não verificado

- A frase e a tela do painel e do app (dimensões UX, acessibilidade e QA).
- A mutação do contrato de `dono_do_token` (achado 2), só por leitura.
- A desativação concorrente com a renovação no aplicativo de campo (como a fila reage ao 401 da disputa).

## Risco residual

Na disputa estreita do achado 1 a pessoa desativada pode ver "sessão encerrada" em vez de "conta desativada". Fora dela, os códigos estão corretos em Postgres real.

## Motivo do humano

Não se aplica.
