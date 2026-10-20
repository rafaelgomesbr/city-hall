---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo desta dimensão na E05: o que a etapa pôs no banco, a migração `048_dono_do_token_diz_se_a_conta_esta_ativa.sql` (correção 1), e o portão CA-06. O catálogo de códigos, a guarda das respostas e as telas são de outras dimensões. Ambiente: PostgreSQL 17.6 real, clusters descartáveis em `SCRATCH/validadores/banco-de-dados/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`), papéis como o job `implantavel`. Entre `4ce0433` e `1ed0b71` nada mudou em `dc360/db`. Saídas em `SCRATCH/validadores/banco-de-dados/saidas/`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| `npm run test:isolamento` verde (regressão obrigatória) | `01-test-isolamento.txt` | 345 aprovados, 3 pulados, código 0 |
| 048 aplica do zero e sobre banco existente | `04-migrar-do-zero.txt`, `07-banco-existente-na-046.txt` | do zero, 51 aplicadas; num banco parado na 046 com sessões abertas, `migrar` aplica 047 a 051 e `--conferir` diz "Esquema em dia." |
| `dono_do_token` com a coluna `usuario_ativo`, sem função privilegiada a mais | `35-sonda-048-dono-do-token.txt`, `11-estrutura-zero.txt` | devolve `TABLE(usuario_id, revogada_em, motivo_revogacao, expira_em, usuario_ativo boolean)`; SECURITY DEFINER com `search_path` fixo; ACL só `dc360_setup` e `dc360_app`; 27 definers no total (teto mantido) |
| A resposta lê o estado da conta AGORA | `35-...` | como `dc360_app` sem município no contexto (como a renovação): sessão revogada por desativação devolve `usuario_ativo = f`; sessão encerrada por administrador de conta ativa devolve `t`; depois de reativar, a mesma sessão devolve `t` com o motivo antigo; token desconhecido: 0 linha |
| A leitura não abre a tabela | `35-...` | no mesmo contexto, `SELECT count(*) FROM usuarios` dá 0; `dc360_console` recebe `permission denied for function dono_do_token` |
| Isolamento e 404 de outro município não mudam | `01-`, `40-test-api.txt` | CA-06 verde; `codigos-de-erro.test.ts` 171 de 171 e `npm run test:api` 1590 aprovados, 34 pulados (o bloco de Postgres real da E07), código 0 |

## Evidência

- `01-test-isolamento.txt` (código 0), `04-`, `07-`, `11-estrutura-zero.txt`, `35-sonda-048-dono-do-token.txt` (código 0, `ferramentas/sonda-048.sql`, como superusuário para preparar e com `SET ROLE dc360_app` e `dc360_console` para as leituras), `40-test-api.txt` (código 0), `42-mutacao-e05-048-sempre-ativo.txt` (código 1).

## Cenários positivos

- Conta desativada pelo endpoint: a pergunta ao banco devolve `usuario_ativo = f` e a renovação responde 403 `conta_desativada` (casos "Renovar depois de desativar PELO ENDPOINT real", verdes em `40-`).

## Cenários negativos

- Token desconhecido: nenhuma linha (a renovação cai em 401 `sessao_encerrada`, igual à de conta ativa encerrada).
- `dc360_console` não executa a função; `dc360_app` não lê `usuarios` sem contexto.

## Tentativas de reprovar

1. Mutação no banco: troquei `u.ativo` por `true` na 048 (o teste aplica as migrações do disco num banco novo): `codigos-de-erro.test.ts` fica com 4 vermelhos, todos do bloco da correção 1 (403 esperado, 401 obtido) (`42-`). Restaurado com `git restore`.
2. Procurei vazamento entre municípios pela função: ela só responde a quem tem o hash do token de renovação (segredo de 256 bits do cliente) e devolve só o id do dono, o motivo, as datas e o booleano, sem nome, email ou município.
3. Conferi que a reativação não deixa a conta presa como desativada (a resposta segue `usuarios.ativo`, não o motivo gravado na sessão).

## Achados

Nenhum que bloqueie. Anotado: `dono_do_token` não confere município (não há contexto na renovação, e é por isso que é SECURITY DEFINER); a porta é estreita pela forma da saída, como dito acima.

## Não verificado

- O catálogo de códigos, a guarda das respostas, as telas e o app de campo: fora desta dimensão.
- Postgres 16 do CI e o run do CI (ausente).

## Risco residual

Baixo no banco: uma função a mais na saída de uma porta já existente, com o teto de definers mantido e a mordida provada.

## Motivo do humano

não se aplica
