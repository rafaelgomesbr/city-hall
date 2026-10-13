---
validador: banco-de-dados
modelo: claude-sonnet-5-5
etapa: V2-F00-E07
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, TENANT, RLS, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo: a dimensão banco (migração 047 e o que ela toca). O furo de GET com efeito em `servidor.ts` é da API (já no `qa.md`) e não foi reavaliado aqui.

Prova em Postgres 18.3 REAL, num cluster descartável meu (porta 55471, `initdb` próprio). A porta 4002 não foi tocada (senha desconhecida). Papéis como no job de CI: `dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER, `dc360_api` login NOSUPERUSER, membro de `dc360_app WITH SET TRUE`. Cluster e pasta apagados no fim.

1. Aplica do zero: `npm run migrar` aplicou 001 a 047, rc 0; `--conferir` diz "Esquema em dia" (`scratchpad/m-zero.txt`).
2. Idempotente: segunda execução rc 0, "Nada a fazer: 47 migração(ões) já aplicada(s)" (`m-idem.txt`).
3. Sobre banco com dados: apliquei 001 a 046 pelo `aplicarMigracoes`, semeei 2 municípios, 2 usuários e 3 sessões (uma viva, uma rotacionada, uma de outro município). `--conferir` antes: sai 1 (pendente). `migrar` aplicou só a 047. Depois: "Esquema em dia". As 3 sessões ficaram com `familia_id = id`; coluna `uuid NOT NULL DEFAULT gen_random_uuid()` (`existente.txt`).
4. Colunas e índices: `sessoes_familia_viva_idx (familia_id) WHERE revogada_em IS NULL`. Com 20 mil sessões encerradas e seqscan desligado, `EXPLAIN (ANALYZE, BUFFERS)` da subconsulta de `vigencia.ts` dá Index Only Scan nesse índice, 1 buffer, 0,018 ms (`explain.txt`). Não há FK nova, então a regra 4 (FK indexada) não se aplica.
5. `abrir_sessao`: uma só função (7 argumentos), `SECURITY DEFINER`, `search_path=public, pg_temp`, dono `dc360_setup`. EXECUTE: `dc360_app` sim, `dc360_console` não, PUBLIC não. Total de funções `SECURITY DEFINER` = 27 (o teto). A recusa de município suspenso (038) segue no corpo da função.
6. RLS: `sessoes`, `usuarios` e `organizacoes` com `relrowsecurity` e `relforcerowsecurity` = t, dono `dc360_setup`. A única tabela do schema `public` sem RLS forçada é `schema_migracoes` (controle do aplicador, pré-existente, sem dado de município). Policies de `sessoes`: só INSERT, UPDATE e SELECT, todas por `organizacao_id = app_organizacao_atual()`; a 047 não criou policy. `dc360_app`: NOSUPERUSER, NOBYPASSRLS, não é dono (`sondas.txt`).
7. Trilha append-only: `trilha_eventos` e `trilha_administrativa` seguem só com INSERT e SELECT. A 047 não as toca.
8. Isolamento da consulta da cadeia (sondas como `dc360_api` com `SET LOCAL ROLE dc360_app` e `set_config('app.organizacao_atual')`, `sondas-app.txt`):
   - sem contexto: 0 sessões visíveis;
   - contexto B: 0 sessões de A; a consulta de `vigencia.ts` com o `sid` de A devolve `false`;
   - UPDATE de A sob contexto B: 0 linhas; DELETE em `sessoes`: "permissão negada";
   - login em A seguido de `abrir_sessao` com a família do login: a renovação herda (`familia_id` igual); família de B pedida por A, usuário de B com família de A e família inexistente: os três recebem o mesmo erro (mensagem idêntica, sem dizer qual condição falhou);
   - cadeia: revogar a sessão viva A1 deixa a rotacionada A2 viva enquanto a família tem a sessão nova; revogar a nova derruba a família inteira.
9. Rollback: o cabeçalho da 047 e o bloco dizem "aditiva; reverter a função por nova migração, nunca editando a aplicada". Não há SQL de reversão escrito (ver Achados).
10. `npm run test:isolamento`: rc 0, 12 arquivos, 327 passaram, 3 puladas por ambiente (`isolamento.txt`). `isolamento.test.ts` está intacto e o teto de 27 definers vale.

## Evidência

Todos os arquivos estão em `scratchpad/` (`m-zero.txt`, `m-idem.txt`, `existente.txt`, `sondas.txt`, `sondas-app.txt`, `trilha.txt`, `explain.txt`, `isolamento.txt`). Todos os comandos retornaram 0, exceto os `--conferir` esperados com migração pendente (1).

Teste morde (feito e desfeito com `git restore`; `db/test/familia-da-sessao.test.ts` tem 12 casos e dá 12/12 na base):
- M1, remover `AND usuario_id = p_usuario_id` da 047: 1 caso reprova (recusa da família de outro usuário).
- M3, `coalesce(p_familia_id, v_id)` trocado por `v_id`: 1 caso reprova (herda).
- M4, índice sem `WHERE revogada_em IS NULL`: 1 caso reprova.
- M5, `GRANT ... TO PUBLIC`: 1 caso reprova (permissões).
- M6, remover o `EXISTS` da família em `auth/vigencia.ts`: 7 de 20 casos de `apps/api/test/familia-da-sessao.test.ts` reprovam.
- M2, remover `AND organizacao_id = p_organizacao_id`: o teste NÃO reprova (12/12). É mutante equivalente, não furo: a FK composta `(organizacao_id, usuario_id)` de `sessoes` já impede que o usuário exista em outro município, e a condição de `usuario_id` cobre o caso.

## Cenários positivos

Login abre família nova; renovação herda; encerrar a viva derruba a cadeia; migração sobre banco com dados não perde sessão alguma; `abrir_sessao` com 6 argumentos continua funcionando (coberto no teste do banco).

## Cenários negativos

Contexto de outro município, sem contexto, família de outro usuário, de outro município e inexistente, DELETE direto, UPDATE de linha alheia, GRANT a PUBLIC. Todos negam. Nenhum devolveu 403 sobre recurso alheio; no nível do banco o resultado é 0 linhas.

## Tentativas de reprovar

- Usar a `abrir_sessao` para enfiar sessão na família de outra pessoa ou de outro município: recusado de forma uniforme.
- Ler ou alterar sessão de A com contexto de B: 0 linhas.
- Ver se o papel de aplicação é dono, superusuário ou BYPASSRLS: não é.
- Achar tabela de negócio sem RLS forçada: só `schema_migracoes`.
- Achar policy de UPDATE ou DELETE na trilha: nenhuma.
- Rodar a 047 duas vezes: o aplicador pula; o corpo da migração em si não é idempotente (ALTER TABLE sem `IF NOT EXISTS`), mas o histórico por soma de verificação protege.
- Derrubar o teste com 5 mutações no banco e 1 na API: todas, exceto o mutante equivalente, derrubaram.

## Achados

- anotado: não há SQL de reversão escrito. O plano de reversão da persona pede um. A reversão seria `DROP FUNCTION` de 7 argumentos, `CREATE` da de 6 (corpo da 038) e re-`GRANT`, como migração 048; a coluna pode ficar. O bloco declara isso e a migração é aditiva, então não bloqueia.
- anotado: `abrir_sessao` é `SECURITY DEFINER` e não compara `p_organizacao_id` com `app_organizacao_atual()`. Com contexto A, o papel de aplicação consegue abrir sessão em B se informar `p_usuario_id` de B. É desenho pré-existente (002 e 038) e não regrediu: a 047 só acrescentou a exigência de que a família herdada seja do mesmo usuário e município. A aplicação é o único chamador. Vale endurecer depois (F03).
- anotado: a função aceita herdar família que já está TOTALMENTE encerrada (todas as sessões revogadas). Isso reviveria a cadeia se o chamador fosse mal-intencionado. Só `renovar` chama, depois de validar o refresh token e detectar reuso. Mesma natureza do item anterior.
- anotado: a vigência (e a nova subconsulta) não confere `expira_em`. Já anotado na E04.
- anotado: M2 sobrevive por ser mutante equivalente (acima).

## Não verificado

- Postgres 16 (CI) e 17 (produção): só o 18.3 local, conforme `29`. O CI de 9 de 9 verdes cobre o 16.
- A porta 4002 e o banco de produção ou Supabase (pooler em modo transação com `SET LOCAL ROLE`).
- O caminho da API sobre o Postgres real em HTTP (renovar e escrever): validado pela dimensão de API e pelos testes PGlite; aqui só a SQL da cadeia e a função, via psql.
- Concorrência: duas renovações simultâneas com o mesmo refresh token e leitura da família antes da rotação.
- Desempenho em volume realista: medi 20 mil linhas, sem carga concorrente.
- Os 3 testes pulados do `test:isolamento` (por ambiente, anteriores à etapa; não os rastreei um a um).

## Risco residual

Troca de uma função de autenticação: erro nela trava todo login. Reduzido pela prova em Postgres real do zero e sobre banco com dados, pelo teste do banco que morde e pela compatibilidade com o código antigo (a assinatura nova aceita a chamada de 6 argumentos). Deploy: migrar ANTES do código, como `COLOCAR-DE-PE.md` registra.

## Motivo do humano

Não se aplica.
