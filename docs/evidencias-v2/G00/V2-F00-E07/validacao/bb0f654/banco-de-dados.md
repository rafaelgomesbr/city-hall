---
validador: banco-de-dados (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Ambiente (tudo meu, nada herdado): cluster PostgreSQL 17.6 descartável (a versão da produção), `initdb` próprio no scratchpad, porta 55741, `log_lock_waits=on`, `deadlock_timeout=200ms`, superusuário com a senha de exemplo do workflow. Papéis provisionados exatamente como o job `implantavel` de `verificar.yml` (`dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER, dono do schema, CREATE no banco; `dc360_api` login restrito, `GRANT dc360_app TO dc360_api WITH SET TRUE`). API do SHA rodando por `tsx src/index.ts` como `dc360_api` contra esse banco (porta 55841; `LOGIN_POR_IP=10000`, `RECUPERACAO_POR_EMAIL_HORA=60`, notificador de arquivo para ler o link de recuperação, `SEGUNDO_FATOR_ATIVO=sim` com chave sorteada). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/banco-de-dados-E07/` (abaixo, só o nome do arquivo). Cluster e API desligados no fim, portas livres conferidas.

1. **O defeito da rodada 3 (login com a senha ANTIGA no mesmo instante de uma mudança de credencial) NÃO MORDE MAIS, em Postgres 17 real, por quatro caminhos de mudança.** Campanha própria pela API (`corrida.cjs`), disparando o login com a senha antiga e a mudança com atraso sorteado (nas duas ordens onde cabia), e conferindo depois: nenhuma sessão viva fora da preservada, e a renovação do par do login (quando houve) recusada.
   - troca de senha pela própria pessoa: 60 rodadas, 0 sobra, 0 renovação aceita; 13 logins 200 (todos com a sessão encerrada pela troca, renovação 401) e 24 logins recusados DEPOIS de o scrypt aceitar a senha antiga (`ultimo_acesso` carimbado e 401 `credenciais`): é a releitura sob a trava agindo, prova de que a janela foi atingida (`20-corrida-troca.txt`);
   - redefinição por quem administra: 60 + 60 rodadas (a segunda com a ordem invertida também), 0 sobra, 0 renovação; 18 logins 200 encerrados pela redefinição e 55 recusas pela releitura (`20-corrida-redefinicao.txt`, `21-corrida-redefinicao-duas-ordens.txt`);
   - redefinição pelo link de recuperação (`consumir_recuperacao`): 45 rodadas, 0 sobra, 0 renovação; 21 logins 200 encerrados, 10 recusas pela releitura (`22-corrida-link.txt`). A rodada 3 não tinha conseguido medir este caminho;
   - desativação: 60 rodadas, 0 sobra, 0 renovação; 21 logins 200 encerrados, 39 recusas pela releitura (`20-corrida-desativacao.txt`).
2. **Segundo fator, as três pontas.**
   - desafio emitido antes da redefinição, código certo depois: 5 de 5 recusados (401 `credenciais`), 0 sessão (`23-corrida-sf-deterministico.txt`);
   - `/auth/segundo-fator` disputando com a redefinição por quem administra: 40 rodadas, 0 sobra, 0 renovação; 16 entradas 200 (encerradas pela redefinição), 24 recusas, que nesse caminho só podem vir da comparação da impressão `cr` dentro de `emitirPar` (`23-corrida-sf-redefinicao.txt`);
   - `/auth/segundo-fator` disputando com a desativação, atraso de 25 ms para cada lado: 40 rodadas, 0 sobra; 18 entradas 200 e 22 recusas (`23-corrida-sf-desativacao.txt`);
   - confirmação da ATIVAÇÃO pelo desafio (`/segundo-fator/confirmar`, administradora obrigada) disputando com a redefinição: 40 rodadas, 0 sobra, 0 renovação; 22 confirmações 200 (sessão encerrada pela redefinição logo depois) e 18 recusas 401 `nao_autenticado`, nenhuma delas com o segundo fator ficando ligado (`23-corrida-ativ-redefinicao.txt`).
3. **Renovação, sem regressão do que a rodada 3 deu como consertado.** Renovação contra "encerrar sessões" de quem administra, 100 rodadas nas duas ordens: 47 renovações 200 e 53 401 `sessao_encerrada`, 0 sessão viva, 0 par novo que renova (`24-corrida-renovacao-encerrar.txt`). Renovação contra desativação, 40 rodadas: 21 200 e 19 403 `conta_desativada`, nenhuma 401 `sessao_encerrada` (achado 2 da rodada 3 fechado), 0 sobra (`23-corrida-renovacao-desativacao.txt`).
4. **O teste do repositório em Postgres 17 real** (`apps/api/test/renovacao-contra-encerramento.test.ts` com `DC360_POSTGRES_DE_PROVA` apontando para o meu cluster): 30 de 30 (10 de PGlite e 20 de Postgres real), nenhum pulado, três vezes seguidas e uma quarta depois de desfeitas todas as mutações (`10-corrida-repo-1..3.txt`, `11-corrida-repo-depois-das-mutacoes.txt`). Os casos 14 a 19 só passam se o teste VER, em `pg_locks`, o outro lado parado na trava.
5. **Os testes mordem** (desfeito o conserto, vermelho; restaurado com `git restore`, verde): ver "Tentativas de reprovar", mutações M1 a M4.
6. **Sonda em SQL puro, como `dc360_app`, independente do código de teste** (`sonda-sql.cjs`, `62-sonda-sql.txt`): com a sequência de `emitirPar` (abrir_sessao, trava, releitura), contra `trocar_senha` e contra a desativação (UPDATE de `usuarios` e `revogar_sessoes_do_usuario`):
   - ordem A (o login já tem a trava e releu a credencial antiga): a mudança fica parada na trava consultiva (visto em `pg_locks`), o login confirma, e a sessão dele termina revogada pela mudança ("senha trocada pelo proprio usuario", "usuario desativado");
   - ordem B (a mudança tem a trava): o login abre a sessão e para na trava; solta a mudança, a releitura vê a credencial nova e a transação volta atrás, sem sessão;
   - controle sem a trava: a mudança termina em 2 ms sem esperar, e a sessão do login fica VIVA nos dois casos. É a prova de que a trava é o que fecha o caminho, e de que a releitura sozinha não basta.
7. **Impasse (deadlock): nenhum.** Caos de 160 rodadas (`caos.cjs`, `40-caos.txt`): a cada rodada, ao mesmo tempo e com atraso sorteado de 0 a 250 ms, três logins com a senha antiga, uma renovação, "encerrar minhas sessões", uma troca de papel por quem administra e uma mudança em rodízio (troca de senha, redefinição, desativação, e `console_suspender_municipio` chamada com um dono de console de prova no contexto). 0 resposta 500, 0 sobra depois da mudança, e o log do Postgres da rodada inteira sem nenhuma linha "deadlock" ou 40P01; os únicos ERROR do log são 5 DC367 (município suspenso, esperados) e o `1/0` de controle que eu disparei para provar que o log grava erro (`pg17.log`). Nenhum dos logs da API tem status 500 ou nível de erro (`api*.log`).
8. **Migrações 049 e 050: nenhuma migração aplicada foi editada.** `git diff --name-status 52952a1..bb0f654 -- dc360/db/migrations` vazio; `afde25c..bb0f654` só ACRESCENTA 047 a 050. Do zero em Postgres 17 com o papel de setup: `--conferir` no banco vazio acusa as 50 e sai 1; `migrar` aplica as 50; `--conferir` "Esquema em dia."; segunda execução "Nada a fazer: 50" (`02` a `05`). Sobre banco existente: banco levado só até a 048 pelo `aplicarMigracoes` do repositório, semeado, com três sessões antigas (viva, de família encerrada, de outro município) (`70`, `71`, `72`); `--conferir` acusa 049 e 050; `migrar` aplica só as duas; depois "Esquema em dia." e "Nada a fazer: 50" (`73`); sessões intactas, diff vazio (`74`). Como `dc360_app` no banco migrado: herdar a família encerrada recusa com a mensagem da DC369; herdar a família viva aceita; herdar a família de outro município recusa com a MESMA mensagem; sem contexto de município, 0 sessão visível (`75`).
9. **Trava por pessoa, RLS e grants** (`61-catalogo.txt`, no banco migrado do zero): `travar_sessoes_do_usuario` SECURITY INVOKER, dono `dc360_setup`, `search_path` fixo, EXECUTE só para `dc360_app`; `abrir_sessao` (uma só, de sete argumentos), `trocar_senha`, `consumir_recuperacao`, `revogar_sessoes_do_usuario`, `revogar_sessao`, `sessao_por_token`, `dono_do_token` com dono `dc360_setup`, SECURITY DEFINER, `search_path` fixo e EXECUTE só para `dc360_app`; `console_suspender_municipio` só para `dc360_console`. 27 funções SECURITY DEFINER (o teto de `isolamento.test.ts`), nenhuma sem `search_path`. Nenhum papel `dc360_*` é superusuário; só `dc360_setup` tem BYPASSRLS; todas as tabelas são de `dc360_setup`. `dc360_app` sem DELETE em `sessoes`. Policies de `sessoes` por `app_organizacao_atual()`; nenhuma policy de UPDATE, DELETE ou ALL nas tabelas de trilha (append-only preservado). Índice parcial `sessoes_familia_viva_idx` e `familia_id` não nula com padrão.
10. **Nenhuma tabela de negócio perdeu RLS forçada:** 36 tabelas no `public`, 35 com RLS ativada E forçada; a de fora é `schema_migracoes` (controle do aplicador). `npm run test:isolamento`: 345 aprovados e 3 pulados de 348, 14 arquivos, código 0 (`60-test-isolamento.txt`). A única mudança em `db/test/isolamento.test.ts` desde a rodada 3 é da E03 (`9a47509`: ceder o laço de eventos e prazo de 240 s no caso da varredura), sem asserção mudada.
11. **Arquivos de autenticação do pacote**: `segundo-fator`, `senha-provisoria`, `familia-da-sessao`, `vigencia-na-escrita` e `corpo-ilegivel`, 67 de 67, código 0 (`50-testes-auth-verde.txt`).

## Evidência

Comandos (no `dc360/`, com o cluster do item acima; a URL do superusuário e a dos papéis ficam só no scratchpad):
- `initdb` e `pg_ctl start` do 17.6 (`00-initdb.txt`); provisionamento como o CI (`01-provisionar.txt`, código 0).
- `npm run migrar -- --conferir` em banco vazio, código 1 (`02`); `npm run migrar`, código 0 (`03`); `--conferir`, código 0, "Esquema em dia." (`04`); `npm run migrar` de novo, código 0, "Nada a fazer: 50" (`05`); `--semear` (`06`).
- `npx vitest run --root apps/api test/renovacao-contra-encerramento.test.ts` com `DC360_POSTGRES_DE_PROVA`: código 0, 30 de 30, quatro vezes (`10-corrida-repo-1..3.txt`, `11-...depois-das-mutacoes.txt`).
- `node corrida.cjs <cenário> <rodadas>`, código 0 em todos (`20` a `24`).
- `node caos.cjs 160`, código 0 (`40-caos.txt`).
- `node sonda-sql.cjs`, código 0 (`62-sonda-sql.txt`).
- Mutações e restauração: `30` a `34`, `51` a `56` (diffs e saídas).
- `npx vitest run --root apps/api test/segundo-fator.test.ts test/senha-provisoria.test.ts test/familia-da-sessao.test.ts test/vigencia-na-escrita.test.ts test/corpo-ilegivel.test.ts`, código 0, 67 de 67 (`50`).
- `npm run test:isolamento`, código 0 (`60`).
- Catálogo (`61`), banco até a 048 e migração por cima (`70` a `75`, script `ate048.mjs`).
- Logs: `pg17.log` (servidor inteiro), `api.log`, `api-M1.log`, `api-M3.log`, `api-caos.log`, `api-final.log`.

## Cenários positivos

- Login com a senha certa e nenhuma mudança em curso abre família nova e renova (caso 5 do repositório; campanhas, rodadas em que a mudança chega depois).
- Renovação normal não é expulsão: o token de antes escreve durante e depois dela (casos 5 dos dois blocos, verdes em Postgres 17).
- Segundo fator e ativação pelo desafio entram quando a senha não mudou (rodadas 200 das campanhas `sf-*` e `ativ-*`).
- 049 e 050 aplicam do zero e sobre banco existente com sessões, idempotentes.
- Renovação que perde a trava para a desativação responde 403 `conta_desativada` (19 de 40 rodadas caíram desse lado).

## Cenários negativos

- Login, desafio do segundo fator e confirmação da ativação com a credencial que acabou de mudar: recusados, ou com a sessão encerrada pela mudança; 0 sessão sobrevivente em 410 disputas pela API (285 de login com senha, 85 do segundo fator, 40 da ativação), nos quatro caminhos de mudança.
- Família de outro usuário, de outro município ou encerrada: recusada com a mesma mensagem (DC369), sem dizer qual condição falhou.
- Sem contexto de município, `dc360_app` não vê sessão nenhuma.
- Encerramento por quem administra no meio da renovação: 0 sessão viva, 0 par que renova depois.

## Tentativas de reprovar

1. **Mutação M1, desfazer o conserto do login** (`emitirPar` sem a trava e sem a releitura, `30-mutacao-M1.diff`): o teste do repositório em Postgres 17 fica 14 de 30 vermelhos, entre eles os casos 6 a 8 e 10 a 12 por sessão viva do login disputado, os 14 a 19 por "a disputa não aconteceu" e o 20 (`31-M1-corrida-repo.txt`). A minha campanha, com a API reiniciada sobre o código mutado, volta a deixar sessão viva: troca 8 de 30 (as 8 renovam), redefinição 8 de 30 (as 8 renovam), desativação 19 de 30 (`32-M1-corrida-*.txt`). Restaurado com `git restore`, `git status --porcelain` vazio.
2. **Mutação M2, só a trava fora** (releitura mantida, `33-mutacao-M2.diff`): 8 de 30 vermelhos, o 10 pela sequência de comandos e os 14 a 20 por "a disputa não aconteceu" (`34-M2-corrida-repo.txt`). Que isso é defeito real, e não só de forma, está no controle da sonda em SQL (item 6 dos critérios): sem a trava a sessão do login sobrevive à troca e à desativação. Restaurado, `git status --porcelain` vazio.
3. **Mutação M3, a impressão `cr` do desafio sempre confere** (`51-mutacao-M3.diff`): `segundo-fator.test.ts` fica 3 de 23 vermelhos, os três casos da correção 3 (`52-M3-segundo-fator.txt`); a campanha em Postgres 17 com a API mutada abre sessão sobrevivente em 5 de 5 no desafio determinístico e em 13 de 20 na disputa com a redefinição, todas renovando (`53`, `54`). Restaurado, `git status --porcelain` vazio, API reiniciada sobre o código do SHA.
4. **Mutação M4, a renovação que perde a trava sem perguntar pela conta** (`55-mutacao-M4.diff`): casos 9 e 13 vermelhos (401 onde se exige 403) (`56-M4-corrida-repo.txt`). Restaurado, `git status --porcelain` vazio.
5. **Caça ao impasse** com todos os caminhos ao mesmo tempo, inclusive a suspensão pelo console contra o login que agora toma linha do município e trava na mesma transação: 160 rodadas, 0 40P01 (item 7). Também conferido por leitura que nenhum caminho toma a linha de `segundo_fator` antes da trava (a única nova ordem, a de `confirmarAtivacao`).
6. **Procurei caminho de mudança de credencial ou de `ativo` que não passe pela trava depois do UPDATE de `usuarios`**: `grep` em `apps/api/src` e em todas as migrações. Só há quatro escritas de `senha_hash`/`ativo` em `usuarios` (troca, redefinição por quem administra, link de recuperação, desativação), e as quatro tomam a trava depois do UPDATE de `usuarios` e antes do de `sessoes`; a escrita de `senha_hash` da 039 é em `console_operadores`, outra tabela. A edição de cadastro (`PATCH /usuarios/:id`) não mexe em senha nem em `ativo`.
7. **Janela que a correção podia ter deixado na ativação**: disputei a confirmação pelo desafio com a redefinição (40 rodadas) procurando 401 com o segundo fator ligado; não apareceu (item 2).
8. **Testes que podiam passar sem disputar**: os casos seguros exigem ver o outro lado em `pg_locks`; com M1 e M2 eles reprovam por esse motivo, então não passam calados.

## Achados

Nenhum que bloqueie.

1. ANOTADO (leitura, não reproduzido, não é defeito da disputa): na confirmação da ativação pelo desafio, se a mudança de credencial confirmar exatamente entre o COMMIT de `confirmarAtivacao` e a transação de `emitirPar` de `sessaoAposAtivacao`, a resposta é 401 e o segundo fator fica ligado com o aparelho de quem tinha a senha anterior, sem sessão. Equivale a ativar um instante antes da mudança, que o desenho já permite (reset do segundo fator de outra pessoa é F03-E11). Não apareceu em 40 rodadas. Dono, se quiserem fechar: F03-E11.
2. ANOTADO (rodada 3, continuam fora desta correção, não retestados): `/auth/sair` com token já rotacionado e a vigência sem conferir `expira_em` da sessão viva da família.

## Não verificado

- O run do CI (39143791434) não foi lido; o passo "Corrida de renovação contra encerramento, em Postgres real" do job `implantavel` (Postgres 16) é afirmação do implementador. Eu provei em Postgres 17.6, a versão da produção, não em 16.
- As recusas do segundo fator na disputa com a redefinição são atribuídas à comparação de `cr` em `emitirPar` por leitura do caminho (é a única conferência de credencial nesse caminho); a API não expõe qual linha recusou.
- A disputa da confirmação da ativação com a mudança PARADA na trava (a metade "mudança chega depois da trava" de `credencialDoDesafioValeSobTrava`) não teve disputa segurada própria; a campanha pela API cobre por sorteio.
- `LOGIN_POR_IP` de produção (10): medi o mecanismo com o limite alto, não a probabilidade real.
- Pooler da Supabase em modo transação: as travas são de transação, compatíveis por desenho; não medido.
- Os 3 testes pulados de `test:isolamento` (busca com `pg_trgm`, por ambiente).
- `npm run test:api` inteiro não foi rodado por mim (dimensão QA); rodei os cinco arquivos de autenticação tocados.
- Suspensão pelo console disputando com o login só no caos e no caso 20 do repositório; não fiz campanha dirigida só dela.

## Risco residual

Baixo. O caminho que reprovou a rodada 3 está fechado e provado em Postgres 17 real: 410 disputas pela API nos quatro caminhos de mudança e nas três pontas do segundo fator com 0 sessão sobrevivente, sonda em SQL que mostra a trava como causa, caos sem impasse, e quatro mutações que deixam os testes do repositório vermelhos e a minha campanha com sobra. Ficam o Postgres 16 do CI não visto por mim e uma janela de ativação equivalente a ativar um instante antes da mudança, que é desenho e não disputa.

## Motivo do humano

Não se aplica: tudo nesta dimensão é verificável por execução e foi executado.
