---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Ambiente de toda a prova: PostgreSQL 17.6 real (binários da sessão do gatekeeper, só execução), cluster próprio por `initdb` em `val/L03-banco/pgdata`, porta 56317, `log_lock_waits = on`, `deadlock_timeout = 100ms`. Papéis provisionados exatamente como o job `implantavel` do CI (`dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER dono do schema, `dc360_api` restrito, `GRANT dc360_app TO dc360_api WITH SET TRUE`). Código executado num worktree destacado em `4ce0433` (`val/L03-banco/wt`), nunca na árvore principal. Todos os caminhos de saída abaixo são relativos a `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L03-banco/`.

1. **Migração aplicada do zero** (DoD): `npm run migrar` com `dc360_setup` aplicou 001 a 051, código 0 (`saidas/02-migrar-do-zero.txt`); `--conferir` "Esquema em dia.", código 0 (`saidas/03`); segundo `migrar` "Nada a fazer: 51 migração(ões) já aplicada(s)." (`saidas/04`).
2. **Migração aplicada sobre banco existente** (DoD): banco criado até a 050 pelo próprio aplicador, semeado e com um link de recuperação pendente por usuário; `--conferir` antes acusa a 051 faltando (código 1); `migrar` aplica só a 051; `--conferir` depois "Esquema em dia."; dono do gatilho `dc360_setup`, 27 SECURITY DEFINER (`saidas/17-banco-existente-e-historico-alterado.txt`).
3. **Migração aplicada nunca é editada (`HistoricoAlterado`)**: com o texto da 051 alterado em memória (sem tocar o arquivo) contra o banco já migrado, `aplicarMigracoes` recusa com `HistoricoAlterado` (`saidas/17`, passo 6). `git diff --name-status bb0f654 4ce0433 -- dc360/db/migrations` só ADICIONA a 051; `afde25c..4ce0433` só adiciona 047 a 051 (`saidas/05-historico-migracoes.txt`). Ver achado 3 sobre a edição de comentário da 051 entre `0bb347b` e `7b27327`.
4. **RLS ativada e FORÇADA em toda tabela de negócio**: 36 tabelas no `public`, 35 com `relrowsecurity` e `relforcerowsecurity`; a única sem é `schema_migracoes` (dc360_app só tem SELECT nela). Nenhuma tabela com `organizacao_id` sem policy; a única visão (`console_situacao_dos_municipios`) tem `security_invoker=true` e dc360_app não a lê; as policies `USING (true)` são todas `TO dc360_console`, fora `interesse_escrita` (INSERT do formulário público, preexistente) (`saidas/06-catalogo.txt`, `saidas/25-visoes-e-grants-extra.txt`). Papéis: dc360_app e dc360_api sem superusuário e sem BYPASSRLS; único dono de tabela é `dc360_setup`.
5. **Teto de SECURITY DEFINER bate com a realidade**: 27 no Postgres real, teto 27 em `dc360/db/test/isolamento.test.ts:652`; nenhuma sem `search_path` fixo e nenhuma executável por PUBLIC (`saidas/06`, seção 3). A mordida do teto: tornar `invalidar_recuperacoes_pendentes` SECURITY DEFINER numa cópia da 051 no worktree reprova "existem, e são poucas o bastante" (`saidas/20-mordida-gatilho-definer.txt`).
6. **A 051 não abre brecha de RLS**: `invalidar_recuperacoes_pendentes` é SECURITY INVOKER (`prosecdef = f`), dono `dc360_setup`, `search_path = public, pg_temp`, ACL só do dono (dc360_app chamando direto: `permission denied`). O gatilho roda com o papel de quem atualizou `usuarios`: nas rotas é dc360_app sob o município (policy `recuperacoes_atualizacao` filtra por `app_organizacao_atual()`), dentro das funções definidoras é o dono. A FK composta `recuperacao_usuario_do_mesmo_municipio` impede link de pessoa com município trocado. Sonda como dc360_app no município A: UPDATE de usuário de B alcança 0 linhas, desativar a Helena gasta só os links dela, os de Vale Fundo ficam intactos, e sem município no contexto o UPDATE alcança 0 linhas (`saidas/18-isolamento-do-gatilho-051.txt`). Só dc360_app e dc360_setup têm UPDATE em `usuarios` (dc360_console não), e os dois têm UPDATE em `recuperacoes_senha`, então o gatilho não quebra nenhum caminho por privilégio.
7. **Sessão revogada** (critério da etapa, teste negativo): em Postgres real com o papel efetivo `dc360_app` (conferido: `current_user = dc360_app`, não superusuário), o token de antes da renovação, que escreveu 200 durante a renovação normal, recebe 401 `sessao_encerrada` depois de cada um dos quatro encerramentos de cadeia: quem administra, a própria pessoa (sair), reuso do refresh e troca de senha em outra sessão (`saidas/16-tres-sondas-pg-real.txt`).
8. **Papel alterado**: rebaixada a operador no banco, o token velho despacha e recebe 401 `nao_autenticado`; `/auth/renovar` devolve token com `papel = operador`; o renovado despacha e recebe 403 `sem_permissao`; os dois tokens leem a ocorrência de B e recebem 404, e a escrita em B nunca é 403; B lendo ocorrência de A, 404 (`saidas/16`).
9. **Senha provisória**: vencida no meio, trocar 401 `sessao_encerrada` e renovar 401 `sessao_encerrada`, hash intacto; no prazo troca 200 e `senha_provisoria_ate` vira nulo (gatilho da 046) (`saidas/16`).
10. **Troca de senha sob a trava (correção 4) e ordem das travas sem impasse**: os cinco arquivos da autenticação, inclusive o bloco de Postgres real de `renovacao-contra-encerramento.test.ts` (casos 1 a 34) e `recuperacao-morre-com-a-credencial.test.ts`, 101 de 101, 0 pulado, em Postgres 17.6 (`saidas/10-corrida-pg17-real.txt`); 0 `deadlock detected` no log do servidor inteiro (`pglog/pg.log`).
11. **"Zero skip"**: na execução com `DC360_POSTGRES_DE_PROVA` nenhum caso pulado (`saidas/10`). Sem a variável o bloco de Postgres real fica pulado no `test:api` comum; o passo do CI que o roda reprova se houver pulo (`.github/workflows/verificar.yml`, passo "Corrida de renovação contra encerramento, em Postgres real"), não conferido em run porque o run está ausente.
12. **`npm run test:isolamento` verde com a migração**: 345 aprovados e 3 pulados de 348, 14 arquivos, código 0, no worktree (`saidas/19-test-isolamento-no-sha.txt`).

Motivo do veredito da rodada 4 que toca o banco, item a item:
- "a troca de senha com a senha antiga em voo desfaz a redefinição, a troca ou a desativação": CONSERTADO. Prova: trocar o `servico.ts` do worktree pelo de `bb0f654` (a correção 4 inteira só mexe nele no código) deixa 23 de 53 vermelhos no arquivo da corrida em Postgres 17.6, entre eles 11 a 19, 21 a 31, 7, 33 e 34 (`saidas/11-mordida-M0-servico-de-bb0f654.txt`); restaurado com `git checkout`, 101 de 101 (`saidas/10`). E a minha sonda de caos sem grampo, com onze atores (abaixo), 200 rodadas, nenhuma troca do invasor sobrevivendo a redefinição, link, desativação ou troca da vítima.
- "Banco PASS não exercitou a troca de senha em voo contra a redefinição": exercitado nesta rodada (redefinição respondeu 200 em 72 rodadas com a troca do invasor no mesmo instante; nenhuma violação).
- "o mesmo conserto fecha E09 e E10": não é desta etapa; anoto só o achado 1, que é da 051.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `initdb` e `pg_ctl start` (17.6, porta 56317) | 0 | `saidas/00-initdb.txt`, `saidas/pg_ctl.log` |
| provisionamento dos papéis do job `implantavel` | 0 | `saidas/01-provisionar.txt` |
| `npm run migrar` do zero, `--conferir`, `migrar` de novo | 0, 0, 0 | `saidas/02`, `03`, `04` |
| `git diff` e `git log --diff-filter=M` das migrações | 0 | `saidas/05-historico-migracoes.txt` |
| sondas de catálogo (`catalogo.sql`) | 0 | `saidas/06-catalogo.txt` |
| `vitest` com `DC360_POSTGRES_DE_PROVA`: corrida, recuperação, família, provisória, vigência | 0 (101 de 101) | `saidas/10-corrida-pg17-real.txt` |
| mordida M0: `servico.ts` de `bb0f654` no worktree, arquivo da corrida | 1 (23 de 53 vermelhos) | `saidas/11-mordida-M0-servico-de-bb0f654.txt` |
| sonda de caos de onze atores, 80 rodadas, atraso 0 a 150 ms | 0 | `saidas/12-caos-onze-atores.txt` |
| a mesma sonda, 120 rodadas, atraso 0 a 25 ms | 1 (uma violação, achado 1) | `saidas/13-caos-onze-atores-atraso-25ms.txt` |
| sonda determinística do link nascido na desativação | 0 | `saidas/14-sonda-link-nascido-na-desativacao.txt`, variante de conserto em `saidas/15-sonda-link-variante-for-share.txt` |
| as três sondas da etapa em Postgres real | 0 (4 de 4) | `saidas/16-tres-sondas-pg-real.txt` |
| banco existente até a 050, `migrar`, `--conferir`, `HistoricoAlterado` | 1 (esperado no `--conferir` antes), 0, 0 | `saidas/17-banco-existente-e-historico-alterado.txt` |
| isolamento do gatilho da 051 | 0 (o erro de permissão é o esperado) | `saidas/18-isolamento-do-gatilho-051.txt` |
| `npm run test:isolamento` no worktree | 0 | `saidas/19-test-isolamento-no-sha.txt` |
| mordida do teto: gatilho virado SECURITY DEFINER | 1 (1 vermelho, o do teto) | `saidas/20-mordida-gatilho-definer.txt` |
| mordida: 051 sem o gatilho (com `@dc360/db` apontado ao worktree) | 1 (4 vermelhos) | `saidas/21-mordida-sem-gatilho-051.txt` |
| visões, grants, policies | 0 | `saidas/25-visoes-e-grants-extra.txt` |

Sondas e scripts: `sonda-banco-caos.test.ts`, `sonda-banco-tres-sondas.test.ts`, `scripts/sonda-link-na-desativacao.mjs`, `scripts/banco-existente.mjs`, `catalogo.sql`, `isolamento-gatilho.sql` (copiados para `apps/api/test/` só do worktree durante a execução). Log do servidor: `pglog/pg.log` (0 linha com "deadlock").

## Cenários positivos

- Renovação normal: o token antigo escreve 200 depois da renovação e o novo também (`saidas/16`, antes de cada encerramento).
- Papel rebaixado: 401 `nao_autenticado`, renovação com o papel novo, o operador não despacha (`saidas/16`).
- Provisória no prazo troca a senha e deixa de ser provisória (`saidas/16`).
- Migração do zero e sobre banco existente, `--conferir` em dia, idempotente (`saidas/02` a `04`, `17`).
- Caso 34 (troca no meio da renovação da própria cadeia preserva a sessão nova) e caso 18 (troca com o token de antes da renovação preserva a cadeia) verdes em Postgres real (`saidas/10`).

## Cenários negativos

- Cadeia encerrada por quem administra, pela pessoa, por reuso e por troca de senha: token pré-renovação 401 `sessao_encerrada` (`saidas/16`).
- Isolamento: token de A (velho e renovado) em ocorrência de B, 404; B em A, 404; nenhum 403 (`saidas/16`). Gatilho da 051 como dc360_app em A não alcança usuário nem link de B; sem município não alcança nada (`saidas/18`).
- Provisória vencida: trocar e renovar 401, hash intacto (`saidas/16`).
- dc360_app chamando a função do gatilho diretamente: `permission denied for function invalidar_recuperacoes_pendentes` (`saidas/18`).
- Migração aplicada e editada: `HistoricoAlterado` (`saidas/17`).

## Tentativas de reprovar

1. **Desfazer o conserto (mordida do risco alto)**: `servico.ts` de `bb0f654` no worktree, arquivo da corrida em Postgres real: 23 de 53 vermelhos, todos nos casos da troca de senha (`saidas/11`). O teste morde.
2. **Caos com atores que a suíte e a sonda do implementador não juntam**: a cada rodada, um subconjunto sorteado de onze atos ao mesmo tempo (troca do invasor, troca da vítima, redefinição, desativação, encerrar sessões, link do email consumido, link novo pedido por `abrir_recuperacao` como dc360_app, dois logins com a senha antiga, renovação das duas sessões, EDIÇÃO DO EMAIL, que muda chave única e por isso toma FOR UPDATE na linha de `usuarios` e conflita com o FOR KEY SHARE das chaves estrangeiras, e suspensão pelo console como `dc360_console`). Invariantes conferidas no banco depois de cada rodada: desativação 200 implica conta inativa, zero sessão viva e zero link pendente; suspensão implica zero sessão viva; redefinição 200 implica zero sessão viva, nenhuma das quatro senhas conhecidas valendo e o link pré-existente gasto; link 200 sem redefinição implica a senha do link valendo e zero sessão viva; troca 200 implica o link pré-existente gasto (051); nunca duas trocas 200; nunca link 200 e troca 200 na mesma rodada. Resultado: 200 rodadas, 0 resposta 5xx, 0 `40P01` no log do servidor, 0 erro de SQL fora dos DC367 esperados da suspensão, e UMA violação, a do achado 1 (`saidas/12`, `saidas/13`).
3. **Ordem das travas lida contra o código instalado**: `trocarSenha` (linha de `usuarios` FOR NO KEY UPDATE, `dc360/apps/api/src/auth/servico.ts:1154`, depois a trava, depois `trocar_senha`), `consumir_recuperacao` da 051 (linha de `usuarios`, linha do link, trava), redefinição e desativação (UPDATE de `usuarios`, o gatilho nas linhas dos links, trava), login (linha do município FOR SHARE, trava), renovação (trava), suspensão (linha do município, travas em ordem de id). Nenhum caminho segura a trava e depois pede a linha de `usuarios` em modo que conflite, nem segura link e depois espera a linha da pessoa; a edição de email segura a linha forte e não espera nada que outro segure. O caos confirmou: zero impasse.
4. **A 051 como porta na RLS**: procurei gatilho SECURITY DEFINER, dono errado, `search_path` aberto, EXECUTE para PUBLIC, papel com UPDATE em `usuarios` sem UPDATE em `recuperacoes_senha` (o que faria a rota quebrar), visão de dono BYPASSRLS sem `security_invoker`, link de outra organização alcançável pelo gatilho. Nada encontrado (`saidas/06`, `18`, `25`).
5. **O teste da 051 morde**: sem o gatilho (cópia no worktree, com `@dc360/db` reapontado para o worktree, porque pelo link simbólico do `node_modules` o pacote lia as migrações da árvore principal e a primeira tentativa passou verde sem mutar nada), 3 casos de `recuperacao-morre-com-a-credencial.test.ts` e o caso 29 de Postgres real reprovam (`saidas/21`). A desativação não reprova sem o gatilho porque a segunda peça da 051 (`consumir_recuperacao` confere `ativo`) também a cobre.
6. **Teto de SECURITY DEFINER**: mutação que torna o gatilho definidor reprova o teto (`saidas/20`).

## Achados

1. **Corrige antes de crescer (é da E10 e da 051, não decide critério da E07): o link pedido no mesmo instante da desativação sobrevive a ela e troca a senha depois da reativação.** `abrir_recuperacao` (`dc360/db/migrations/005_recuperacao_de_senha.sql:63`, não recriada depois) lê `usuarios ... AND u.ativo` sem trava; o INSERT do link só pede FOR KEY SHARE na linha da pessoa, que não conflita com o FOR NO KEY UPDATE da desativação. Se o pedido lê a linha antes de a desativação confirmar, o gatilho da 051 (que roda no UPDATE, antes do INSERT do link) não vê o link novo, e nenhuma ordem serial produz o desfecho "conta desativada com link pendente". Reprodução determinística (`saidas/14`, `scripts/sonda-link-na-desativacao.mjs`): S1 como dc360_app no município da Helena faz `UPDATE usuarios SET ativo = false` sem confirmar; S2 como dc360_app chama `abrir_recuperacao` e termina sem esperar, devolvendo 1 linha; S1 confirma; estado: `ativo = false`, 1 link pendente; quem administra reativa; `consumir_recuperacao` com o token do passo 2 devolve 1 linha e grava a senha de quem tem o link. Medido também sem grampo: rodada 15 de `saidas/13`. Enquanto a conta está desativada o link não serve (a 051 o gasta sem trocar nada), então o ganho de quem tem o email é pequeno: ele poderia pedir um link novo depois da reativação de qualquer forma. Pesa no caso em que quem administra desativa por suspeita sobre o email e reativa dentro de `RECUPERACAO_MINUTOS` (padrão 30). Conserto pequeno, medido numa base descartável: `FOR SHARE` na leitura da pessoa em `abrir_recuperacao` faz o pedido esperar a desativação e recusar (`saidas/15`); a ordem (linha da pessoa antes das linhas dos links) é a mesma da 051, sem ciclo. Precisa de migração nova (a 005 está aplicada). Sugiro que o gatekeeper leve isto ao validador da E10.
2. **Anotado: trocar o email de uma conta não gasta os links pendentes.** O gatilho da 051 dispara só em `senha_hash` e `ativo`. Quem administra corrige o email de uma conta cujo email vazou, e o link já enviado ao email antigo continua valendo até vencer. Fora do que a 051 promete (o cabeçalho dela diz que trocar nome ou papel não toca os links e não fala de email); registro para a E10 ou a F03.
3. **Anotado: a 051 teve o texto alterado depois de commitada.** `7b27327` mudou só comentários da 051 de `0bb347b` (impressões `bd909e96...` e `b073c871...`; a normalização de `migrar.ts` ignora espaço, não comentário). Os dois commits estão no ramo da fase e a 051 nunca chegou a `master`; um banco de desenvolvimento ou de homologação que tenha aplicado a 051 de `0bb347b` recebe `HistoricoAlterado` ao subir `4ce0433`. Não afeta produção.
4. **Anotado: a 051 não gasta os links que já estavam pendentes na hora da implantação** (`saidas/17`, passo 5: 7 de 7 continuam pendentes). Um link que sobreviveu a uma redefinição antes da implantação vale até vencer (no máximo 30 minutos pelo padrão). Janela curta e conhecida; um `UPDATE` de limpeza na própria migração a fecharia.

## Não verificado

- O run do CI do SHA (ausente nesta sessão; o passo de Postgres real do job `implantavel` só foi reproduzido localmente, em 17.6, e não no 16 do serviço do CI).
- O `npm run test:api` inteiro: rodei os arquivos da autenticação e da recuperação (101 casos em Postgres real) e não a suíte completa, que é da dimensão QA.
- Postgres 16 e o Postgres gerenciado de produção (Supabase): a hipótese de que o dono das funções tem BYPASSRLS vem do job do CI e do que as funções definidoras já exigem; não medi no provedor.
- A ativação do segundo fator pelo desafio dentro da disputa (não entrou no caos).
- A validação humana da etapa (Rafael vê as três sondas) não é desta dimensão.

## Risco residual

Baixo para os critérios da E07: a troca de senha está sob a linha da pessoa e a trava, o teste de Postgres real morde quando o conserto sai, e 200 rodadas de caos com onze atores não produziram impasse, 5xx nem sobrevivente de sessão. O risco que fica é do link de recuperação (achado 1 e 2), que pertence à E10: um link pode sobreviver à desativação do mesmo instante e à troca de email. O passo de CI que prova a corrida roda em Postgres 16 e não foi visto rodando.

## Motivo do humano

Não se aplica a esta dimensão: tudo o que o banco exige foi executado. A validação humana registrada na etapa (Rafael ver as sondas antes e depois) é de produto e segue pendente no STATUS, fora deste relatório.
