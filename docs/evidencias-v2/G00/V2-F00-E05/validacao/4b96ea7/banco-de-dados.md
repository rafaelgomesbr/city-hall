---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [AUTH, TENANT, RLS, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo da dimensão: a migração 048 (`db/migrations/048_dono_do_token_diz_se_a_conta_esta_ativa.sql`) e o uso dela em `tratarTokenRecusado` (`apps/api/src/auth/servico.ts`, linhas 750 a 781). Ambiente: cluster PostgreSQL 18.3 descartável meu (porta 55491, apagado no fim), papéis como o job `implantavel`, API do SHA por `tsx` contra ele. Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/banco/`.

1. O que a função expõe: saída exatamente `usuario_id, revogada_em, motivo_revogacao, expira_em, usuario_ativo` (`08`). Nada de nome, papel, município, email ou hash. Exige o hash do token (igualdade, `%` não casa; desconhecido devolve 0 linha). PASS.
2. `SECURITY DEFINER` com `search_path = public, pg_temp`; dono `dc360_setup` (BYPASSRLS, NOSUPERUSER). Com uma tabela temporária `usuarios` plantada pelo chamador, a função continua lendo `public.usuarios` (`08`). PASS.
3. Quem tem EXECUTE: `dc360_app` (e `dc360_api` por herança) e o dono. `dc360_console` e um papel qualquer (PUBLIC) recebem `42501 permission denied` (`05`, `08`). Total de funções privilegiadas continua 27. PASS.
4. Leitura de outro município ou de outra pessoa: o papel de aplicação sem contexto lê 0 sessão; com contexto de A, 0 sessão e 0 usuário de B, então não há como obter hash de B para perguntar (`08`). O booleano só sai para quem já tem o token (segredo guardado só como hash). Nenhuma coluna de tabela nem policy nova. PASS.
5. Idempotência e conferência: aplicada do zero e sobre banco existente (046 com sessões, `27`: `dono_do_token` devolve `usuario_ativo = f` para a sessão de conta desativada e `t` com motivo para a rotacionada). `migrar` de novo: "Nada a fazer: 48". `--conferir`: "Esquema em dia." Editar a 048 depois de aplicada: `migrar` recusa com `HistoricoAlterado` (`11`). PASS, com ressalva no achado 2.
6. Rollback: ensaiei a reversão por migração nova (`reversao-048.sql`, a forma da 046 com REVOKE e GRANT) no banco migrado: aplica com código 0, ACL igual; a API do SHA contra o banco revertido não quebra (desativar e renovar dá 401 `sessao_encerrada`, sem 500, como o implementador declarou); reaplicar a 048 volta a forma nova (`09`). PASS.
7. Comportamento ponta a ponta em Postgres real (`07`): desativar pelo endpoint revoga as sessões; renovar responde 403 `conta_desativada`, repetível; token desconhecido 401 `sessao_encerrada`; entrar com a conta desativada dá a mesma recusa e o mesmo corpo de email inexistente; reativada, o token antigo volta a 401 `sessao_encerrada`; token de conta desativada de Vale Fundo responde 403 sem nada de Vale Fundo no corpo. PASS.
8. `npm run test:isolamento` (CA-06): 327 aprovados, 3 pulados, código 0 (`19`). Mutação na forma da função (sem `search_path` e com EXECUTE a PUBLIC, numa 049 temporária): 4 testes reprovam (`23`); removida, verde de novo (`24`). PASS.

## Evidência

`05` (catálogo), `07` (`sonda-e05-e07.mjs`), `08` (`sonda-sql.mjs`), `09` (reversão e reaplicação), `10` e `11` (048 editada: `--conferir` e `migrar`), `19`, `23`, `24`, `25` (`test:isolamento` e mutações), `26` e `27` (banco existente).

## Cenários positivos

Conta desativada pelo endpoint real: 403 `conta_desativada` na renovação, também depois de revogada a sessão; reativada: volta ao 401.

## Cenários negativos

Token desconhecido, curinga, papel de console, papel qualquer, chamador sem contexto, contexto de outro município, tabela temporária plantada: nenhum lê o que não devia.

## Tentativas de reprovar

- Enumerar estado de conta sem token: 0 linha, corpo igual ao desconhecido.
- Usar a função para ler dado de B: sem hash de B não há pergunta possível, e o papel não lê hash de B.
- Sequestro de `search_path`: não pegou.
- EXECUTE por PUBLIC ou pelo console: negado.
- Banco sem a 048 com o código novo: não quebra.
- Alargar a saída da função (mutação 5, `25`): 049 temporária devolvendo também `email` e `senha_hash`, com `search_path` e grants corretos. `test:isolamento` passou verde (327). Ver achado 1.

## Achados

1. CORRIGE ANTES DE CRESCER: nenhum teste trava a FORMA da saída de `dono_do_token`. A promessa da própria 048 ("a saída continua estreita: o dono, três carimbos e um booleano") só vale enquanto ninguém a mudar: a mutação que devolve `email` e `senha_hash` a quem chama sem município passou no CA-06 inteiro. Sugestão: em `db/test/familia-da-sessao.test.ts` ou no bloco de funções privilegiadas de `isolamento.test.ts`, conferir `pg_get_function_result('dono_do_token(text)'::regprocedure)` igual à lista atual. Dono: implementador da E05. Hoje a saída está correta (provado acima).
2. ANOTADO (pré-existente, não é da E05): `npm run migrar -- --conferir` só lista migração pendente por nome (`migracoesPendentes`, `db/src/migrar.ts:260`); com a 048 editada depois de aplicada ele diz "Esquema em dia." e sai 0 (`10`). Quem pega a edição é o `migrar` sem flag (`HistoricoAlterado`, `11`). Quem usa `--conferir` como portão de deploy não é avisado de histórico alterado.
3. ANOTADO: `--conferir` também não detecta a função revertida à mão no banco (a reversão de `09` deixou "Esquema em dia."): ele confere o histórico, não o catálogo.

## Não verificado

- Postgres 17 e 16: só 18.3 local (a 048 em 17.11 só pelo job `restore` do CI).
- Precedência de município suspenso mais conta desativada na renovação (achado do QA): é da API, não executei.
- Plano de execução sob volume: a busca é por `token_hash` (índice único) e `usuarios.id` (PK); não medi.

## Risco residual

Baixo: o booleano novo só é útil a quem já tem um token de renovação emitido para a conta. O risco é de regressão futura da forma da função (achado 1).

## Motivo do humano

Não se aplica.
