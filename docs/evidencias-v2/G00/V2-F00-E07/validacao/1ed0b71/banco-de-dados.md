---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Ambiente, todo meu: PostgreSQL 17.6 real (os binários de `SCRATCH/pg17/pgsql/bin`), clusters descartáveis criados por `initdb` em `SCRATCH/validadores/banco-de-dados/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`), só em 127.0.0.1, portas 56471 a 56476, autenticação por confiança, `log_lock_waits=on`, `deadlock_timeout=200ms`. Papéis como o job `implantavel` (`dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER, dono do schema, CREATE no banco; `dc360_api` restrito; `GRANT dc360_app TO dc360_api WITH SET TRUE`). Árvore principal em `5044e7a`, cujo produto é o de `1ed0b71` (conferido: `git diff 1ed0b71 HEAD` só toca `STATUS.md` e `ESTADO-ATUAL.md`). Entre `4ce0433` e `1ed0b71` nada mudou em `dc360/db`; em `auth/servico.ts` só mudou o texto de três mensagens. Saídas brutas em `SCRATCH/validadores/banco-de-dados/saidas/` (abaixo, só o nome).

| Critério da etapa (dimensão banco) | Prova | Resultado |
| --- | --- | --- |
| `npm run test:isolamento` (CA-06) verde com as migrações | `01-test-isolamento.txt` | 345 aprovados, 3 pulados (os três `runIf` de trigramas de `busca.test.ts`), 14 arquivos, código 0 |
| Coluna `sessoes.familia_id`, não nula, padrão, backfill `familia_id = id`, índice parcial onde `revogada_em IS NULL` | `11-estrutura-zero.txt`, `07-banco-existente-na-046.txt` | `uuid NOT NULL DEFAULT gen_random_uuid()`; `sessoes_familia_viva_idx ... WHERE (revogada_em IS NULL)`; as três sessões gravadas ANTES da 047 (viva, rotacionada, de outro município) ficaram com `familia_id = id` |
| Uma só `abrir_sessao` (a de sete argumentos), mesma permissão, teto de 27 `SECURITY DEFINER` | `11-estrutura-zero.txt` | uma assinatura; dono `dc360_setup`; ACL `dc360_app=X`; 27 definers, 0 sem `search_path` fixo |
| Migração aplicada do zero e sobre banco existente na 046; `migrar --conferir` | `04-migrar-do-zero.txt`, `05-migrar-ate-046.txt`, `07-banco-existente-na-046.txt`, `12-diff-esquema-zero-x-046-migrado.txt` | do zero: 51 aplicadas, `--conferir` "Esquema em dia.", segundo `migrar` "Nada a fazer: 51". Na 046 com sessões: `--conferir` antes acusa as 5 pendentes (código 1), `migrar` aplica 047 a 051 (código 0), depois "Esquema em dia.". `pg_dump -s` dos dois bancos idêntico (o diff só tem as chaves aleatórias do `\restrict`) |
| Migração aplicada nunca é editada (`HistoricoAlterado`) | `17-historico-alterado.txt` | uma linha a mais na 049: `migrar` recusa com `HistoricoAlterado` (código 1); arquivo restaurado com `git restore` |
| `abrir_sessao` recusa família alheia | `13-sonda-banco-como-dc360_app.txt` (P1) | como `dc360_app`, sem município no contexto (como `emitirPar`): login abre família = id; renovação herda; família de outra pessoa, de outro município, com organização trocada, inexistente e família encerrada por administrador: as cinco DC369, mesma mensagem; 2 sessões gravadas, as duas legítimas |
| `trocar_senha` toma a trava da pessoa | `13-...` (P3) | segurando só a trava consultiva da Helena noutra conexão, `trocar_senha` atualiza `usuarios` (transactionid concedida) e fica parada em `advisory granted=false`; solta, termina |
| A troca relê hash, `ativo` e sessão sob a trava (achado da rodada 4) | `38b-sequencia-da-troca-aceita.txt`, `38-sequencia-da-troca-de-senha.txt` (log do Postgres com `log_statement=all`, uma corrida real pela API) | numa só transação, como `dc360_app` e com o município: `SELECT ativo, senha_hash, senha_provisoria_ate, papel FROM usuarios ... FOR NO KEY UPDATE`, `SELECT travar_sessoes_do_usuario`, `SELECT v.id` (a sessão viva da cadeia), `SELECT trocar_senha`, `COMMIT`; quando a releitura recusa, a mesma sequência termina em `ROLLBACK` sem chamar `trocar_senha` |
| A transação da troca segura cada reação no ponto certo | `13-...` (P2) | com a transação da troca parada depois da linha e da trava: encerrar sessões (`revogar_sessoes_do_usuario`) espera na `advisory`; a redefinição (UPDATE de `usuarios`) espera em `transactionid`; `trocar_senha` de outra aba e a desativação esperam em `tuple`; soltas, as quatro terminam |
| Disputas reais sem grampo, sem sobrevivente | `09-sonda-caos-troca-do-invasor.txt` | 60 rodadas pela API em Postgres 17.6, pool de 16 conexões, troca do invasor contra redefinição, link do email, desativação, troca pela própria pessoa e encerrar sessões (12 de cada), atraso sorteado de 0 a 300 ms nos dois lados: 0 sobrevivente, 0 erro 500 |
| Impasse | `pgA-log-completo.txt` | 4 `deadlock detected` no log inteiro, todos na execução da mutação C (abaixo, 05:52 a 05:53); 0 em todas as execuções do código real |
| Testes de corrida do repositório em Postgres real | `08-corrida-pg17-real.txt` | `renovacao-contra-encerramento`, `recuperacao-morre-com-a-credencial`, `familia-da-sessao`, `senha-provisoria`, `vigencia-na-escrita` com `DC360_POSTGRES_DE_PROVA`: 102 de 102, nenhum pulado (o bloco de Postgres real com os 34 casos rodou) |
| Regressão da API | `40-test-api.txt` | `npm run test:api` 1590 aprovados, 34 pulados (o bloco de Postgres real, sem a variável; rodado à parte acima), 106 arquivos, código 0 |
| Link de recuperação morre com a credencial (051) | `11-estrutura-zero.txt`, `08-...` | gatilho `recuperacoes_morrem_com_a_credencial AFTER UPDATE OF senha_hash, ativo` presente, função do gatilho SECURITY INVOKER (fora do teto); `recuperacao-morre-com-a-credencial.test.ts` 7 de 7 em Postgres real |

## Evidência

- `npm run test:isolamento`, código 0: `01-test-isolamento.txt`.
- `npm run migrar` do zero, `--conferir`, de novo: `04-migrar-do-zero.txt` (códigos 0, 0, 0).
- Banco até a 046 por `ferramentas/migrar-ate.mts` (aplicador do próprio repositório, lista cortada na 046), semente, três sessões antigas, `--conferir` (1), `migrar` (0), `--conferir` (0): `05-`, `06-`, `07-`.
- Estrutura nos dois bancos e diff: `11-estrutura-zero.txt`, `11-estrutura-ate046.txt` (diff vazio), `12-diff-esquema-zero-x-046-migrado.txt`.
- Sonda de banco como `dc360_app` (`ferramentas/sonda-banco.mjs`): `13-sonda-banco-como-dc360_app.txt`, código 0.
- Testes de corrida em Postgres 17.6: `08-corrida-pg17-real.txt`, código 0.
- Sonda de caos minha (`ferramentas/zz-sonda-validador-banco.test.ts`, copiada para `apps/api/test/` só durante a execução e apagada): `09-sonda-caos-troca-do-invasor.txt` (código 0) e `10-sonda-caos-ANTES-servico-de-bb0f654.txt` (código 1).
- Mutações: `14-mutacao-A-sem-comparar-hash.txt`, `15-mutacao-B-revogar-sem-trava-no-banco.txt`, `16-mutacao-C-troca-sem-for-no-key-update.txt` (códigos 1).
- Sequência real da transação da troca: `37-log-postgres-trecho.txt`, `38-`, `38b-`.
- `npm run test:api`: `40-test-api.txt`, código 0.

## Cenários positivos

- Login abre família nova (família = id), renovação herda a família (P1).
- Renovação normal continua escrevendo com os dois tokens e sem impasse (casos 5 e 34 do bloco real, verdes em `08-`).
- Troca de senha legítima, sem disputa, grava pela sequência linha, trava, releitura, `trocar_senha`, `COMMIT` (`38b-`).
- Banco migrado na 046 com sessões abertas recebe a 047 a 051 sem perder nada (`07-`).

## Cenários negativos

- `abrir_sessao` com família de outra pessoa, de outro município, organização trocada, inexistente ou encerrada: DC369, nada gravado (P1).
- Troca do invasor contra cada reação, sem grampo: 0 sobrevivente em 60 rodadas; a do invasor só confirmou quando chegou antes (redefinição 1 de 12, troca pela própria pessoa 5 de 12, e nesses casos a reação veio depois e valeu, ou a vítima recebeu 401 às claras) (`09-`).
- Com o contexto de Vale Fundo, `dc360_app` não vê a Helena (0 linha) e UPDATE direto em `usuarios` e `sessoes` dela afeta 0 linha (P4, controle).
- Editar a 049 já aplicada: `migrar` recusa (`17-`).

## Tentativas de reprovar

1. Rodei a minha sonda de caos com o `auth/servico.ts` de `bb0f654` (o candidato reprovado), restaurado depois com `git restore`: 22 de 40 rodadas com sobrevivente (a senha do invasor valendo depois da redefinição, do link ou da troca pela própria pessoa, ou a cadeia dele viva). Com o código de `1ed0b71`: 0 de 60. A sonda morde.
2. Mutação A (comparação do hash relido desligada em `servico.ts`): 2 vermelhos (16 e 26, a mesma sessão trocando duas vezes), em Postgres real.
3. Mutação B, no BANCO: tirei o `PERFORM travar_sessoes_do_usuario` de `revogar_sessoes_do_usuario` na 049 (o teste aplica as migrações do disco num banco novo): 2 vermelhos (4, reúso, e 16, desativação contra login segurado).
4. Mutação C (`FOR NO KEY UPDATE` tirado da releitura): 5 vermelhos (19, 7, 28, 29, 30) e 4 `deadlock detected` no log do Postgres, todos nessa execução.
5. Procurei impasse no log de todas as execuções verdes: nenhum.
6. Chamei as funções privilegiadas fora do município do contexto (P4): `trocar_senha` e `revogar_sessoes_do_usuario` aceitam a Helena com o contexto de Vale Fundo (achado 1, abaixo).
7. Conferi se `migrar --conferir` pega migração aplicada e editada: não pega (achado 3).
Todos os arquivos mutados foram restaurados com `git restore`; `git status` limpo no fim (só as pastas `validacao/1ed0b71/` não rastreadas).

## Achados

1. Corrige antes de crescer (pré-existente desde a 002 e a 005, mantido pela 049): `trocar_senha(uuid,text,uuid)` e `revogar_sessoes_do_usuario(uuid,text)` são `SECURITY DEFINER` e não conferem o município do contexto. Reprodução (`13-`, P4): como `dc360_app` com `app.organizacao_atual` de Vale Fundo, `SELECT trocar_senha('<id da Helena, Serra Alta>', '<marcador>', NULL)` grava o hash da Helena, e `revogar_sessoes_do_usuario` revoga a sessão dela; o UPDATE direto, no mesmo contexto, afeta 0 linha. Hoje a API só passa o `usuarioId` do token, e quem executa SQL como `dc360_app` já pode trocar o contexto por `set_config`, então não é furo explorável pela API nem privilégio novo; é uma porta da parede do RLS sem a conferência barata `organizacao_id = app_organizacao_atual()` que a chamada (sempre sob `comTenant`) permitiria. Não é critério da E07 (que pede "mesma permissão").
2. Anotado: a releitura de hash, `ativo` e sessão mora na transação de `trocarSenha` (API), e não dentro de `trocar_senha`; a função, chamada sozinha, grava qualquer hash sem conferir. O conserto mínimo da rodada 4 admitia "ou a transação que a chama", e a sequência foi provada no banco real (`38b-`), mas a regra fica dependente de todo chamador futuro repetir a sequência.
3. Anotado (pré-existente, fora da etapa): `npm run migrar -- --conferir` responde "Esquema em dia." com uma migração aplicada e editada no disco; só o `migrar` acusa `HistoricoAlterado` (`17-`).

Nenhum achado bloqueia.

## Não verificado

- Postgres 16 (o do job `implantavel` do CI): não rodei; tudo foi em 17.6.
- O CI do SHA (ausente, H32).
- A janela documentada de milissegundos e as limitações já anotadas pela etapa (vigência sem `expira_em` da sessão viva, leitura com token rebaixado até a F03-E03, `/auth/sair` com token rotacionado) não foram remedidas aqui.
- Não rodei `npm run test:console` nem `npm run test:e2e:api`.
- A sonda de caos não exercitou suspensão pelo console contra a troca (os casos 8 e 20 do bloco real cobrem a suspensão contra renovação e login).

## Risco residual

Baixo para a etapa. O isolamento depende de a aplicação chamar as funções privilegiadas com o usuário do token (achado 1) e de a troca de senha continuar passando pela transação provada (achado 2). A prova de concorrência é amostral (60 rodadas sem grampo mais os casos segurados), não exaustiva.

## Motivo do humano

não se aplica
