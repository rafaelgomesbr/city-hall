---
validador: banco-de-dados
modelo: claude-sonnet-5-5
etapa: V2-F00-E04
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [AUTH, AUTHZ, TENANT, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Prova contra Postgres 18.3 REAL, mas num cluster descartável meu (porta 55461), e NÃO na porta 4002: a senha do 4002 é desconhecida (`fe_sendauth: no password supplied`; o `RESUMO.md` da E07 já registra o mesmo) e não tentei adivinhá-la. Mesmo precedente da E07 e da E25. O cluster, os bancos `validacao_e04_a` e `validacao_e04_b` e a pasta foram apagados no fim; o 4002 não recebeu nenhum comando além da tentativa de conexão recusada.

Montagem: papéis iguais aos do job de CI (`dc360_setup` CREATEROLE BYPASSRLS, `dc360_api` login NOSUPERUSER, membro de `dc360_app WITH SET TRUE`), `npm run migrar` (47 migrações aplicadas, `--conferir` diz "Esquema em dia").

1. Papel e contexto da consulta. `lerVigencia` roda em `banco.comTenant(conteudo.org)`: `BEGIN`, `SET LOCAL ROLE dc360_app`, `set_config('app.organizacao_atual', org, true)`, a SELECT, `COMMIT` (capturado: 5 comandos). Dentro da transação medi `session_user=dc360_api`, `current_user=dc360_app`, `rolsuper=f`, `rolbypassrls=f`, contexto = a organização do token. `org` vem de `verificarAcesso` (Zod UUID, assinatura conferida), nunca de cabeçalho ou corpo.
2. RLS. `organizacoes`, `usuarios` e `sessoes`: `relrowsecurity=t`, `relforcerowsecurity=t`, dono `dc360_setup` (não é o papel de aplicação). Políticas SELECT por `organizacao_id = app_organizacao_atual()` (`organizacoes` por `id`). A política `organizacoes_leitura_do_console` é só para `dc360_console`, que a aplicação não assume.
3. Sem contexto e com contexto alheio. Mesma SQL contar linhas: `semTenant` devolve 0 organizações, 0 usuários, 0 sessões; `comTenant(A)` devolve 1 organização, só as linhas de A; bypass (setup) devolve as 2 organizações. A consulta com contexto de B, `sub` e `sid` de A, devolve `usuarioAtivo=false, papel=null, sessaoViva=false` (vira 401 `sessao_encerrada`): nenhuma coluna de A vaza. Saída: `scratchpad/sonda.txt`.
4. Uma ida só. Uma SELECT, uma transação (`organizacoes` LEFT JOIN `usuarios`, `EXISTS` em `sessoes`), a mesma que já conferia a suspensão. Índices que a servem: PKs de `organizacoes`, `usuarios`, `sessoes` e `sessoes_familia_viva_idx` (familia_id WHERE revogada_em IS NULL) para o ramo de rotação.
5. Regras de vigência na linha: desativada (cd=true), sessão encerrada (sv=false), rotacionada com família viva (sv=true), rotacionada com família encerrada (sv=false), `sid` de outra pessoa do mesmo município (sv=false), `sid` de outro município (sv=false), município inexistente (`inexistente`).

## Evidência

- `scratchpad/sonda.txt`: sonda SQL via `bancoPostgres` e `lerVigencia` reais, conectados como `dc360_api` (rc 0).
- `scratchpad/http.txt`: API real (`construirServidor` com `bancoPostgres`, banco semeado Serra Alta e Vale Fundo), tokens emitidos com `emitirAcesso`:
  - 200 conta ativa escreve
  - 404 `nao_encontrada` token do B contra ocorrência do A
  - 401 `sessao_encerrada` token forjado org=B com sub/sid de A
  - 401 `sessao_encerrada` org=A com sub e sid de B
  - 401 `sessao_encerrada` `sid` de Jonas com `sub` de Helena
  - 401 `nao_autenticado` papel rebaixado
  - 403 `conta_desativada`
  - 200 leitura com conta desativada (troca declarada)
  - 401 `sessao_encerrada` sessão encerrada
  - 403 `acesso_suspenso` município suspenso com conta desativada (suspensão primeiro)
- `npm run test:isolamento` (comando do projeto, db): rc 0, 12 arquivos, 327 passaram, 3 puladas (`scratchpad/isolamento.txt`). Esse teste roda em PGlite; o Postgres real foi provado pelas duas sondas acima.
- Teste morde (feito e desfeito com `git restore`): M1, remover `AND s.usuario_id = u.id` de `vigencia.ts`: `vigencia-na-escrita.test.ts` reprova 1 caso ("sid de OUTRA pessoa"). M2, neutralizar a chamada `lerVigencia` em `servidor.ts`: reprova 7 casos. `git status --porcelain` final: só `validacao/`.

## Cenários positivos

Conta ativa com sessão viva escreve e recebe 200 (HTTP real sobre Postgres real). Sessão rotacionada com família viva continua valendo.

## Cenários negativos

Todos os 9 da lista de evidência acima, mais os 5 de SQL cru (contexto de B, conta de B em A, `sid` de B em A, `sid` de colega, organização inexistente). Nenhum deu 403 para recurso de outro município: o recurso alheio deu 404.

## Tentativas de reprovar

- Ler a conta de outro município: com contexto de B a linha de A não aparece; com `semTenant` as três tabelas vêm vazias.
- Ler sem contexto: 0 linhas (RLS forçada, `app_organizacao_atual()` nulo).
- Papel de aplicação como dono ou superusuário: não é (verificado em `pg_roles` e `pg_class`).
- Burlar pelo `sid` alheio, do mesmo município e de outro: nega.
- Forjar `org` no token: o token é assinado, e mesmo assim a combinação org/sub/sid de municípios diferentes nega.
- Fazer o teste passar sem o conserto: M1 e M2 acima derrubaram os testes.
- Procurei segunda ida ao banco na escrita: nenhuma; `senhaProvisoria` vem da mesma linha.

## Achados

- anotado: `sessaoViva` não confere `sessoes.expira_em`. Sessão vencida por prazo e não revogada conta como viva até o token de acesso (15 min) vencer. Janela já limitada pelo token, e o refresh confere o prazo; não bloqueia.
- anotado: "uma ida só" é uma transação de 5 comandos SQL (BEGIN, SET ROLE, set_config, SELECT, COMMIT), o que já valia para a conferência de suspensão. Quem lê "uma ida" como "um comando" lê errado; o bloco diz uma consulta, e é uma.
- anotado: o job do CI "A API sobe contra Postgres real" prova só `/saude` e a conexão, não a SELECT da vigência. Esta validação é a primeira prova dela em Postgres real; vale um passo de CI com uma escrita (pode ser da F01-E03).

## Não verificado

- Postgres 17 (produção) e 16 (CI): só o 18.3 local, conforme `29`.
- A porta 4002 (senha desconhecida); usei cluster próprio equivalente.
- Os bancos de produção/Supabase (pooler, `SET LOCAL ROLE` sob transaction pooling).
- O E2E de navegador (fica para a E05), a suíte completa da API e `superficie.test.ts` (outras dimensões, QA já os cobre).
- Concorrência: revogação de sessão no meio de uma escrita em voo (a consulta é uma leitura de instantâneo; a janela de milissegundos é inerente).

## Risco residual

Janela de 15 minutos para leitura e `GET /avisos` (declarada, F03-E03). Janela do `expira_em` acima. A etapa não pode ir sozinha à produção sem E05 e E06 (já registrado no bloco).

## Motivo do humano

Não se aplica.
