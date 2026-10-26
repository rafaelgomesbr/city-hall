---
validador: qa
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
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Tudo executado nesta sessão sobre um worktree destacado em `4ce0433` (`node_modules` por link para os da árvore principal), com Postgres 17.6 descartável (binários de `.../ded47d25-.../pg17/pgsql/bin`, cluster próprio, porta 55941), papéis do job `implantavel` (`dc360_setup` CREATEROLE BYPASSRLS, `dc360_api` restrito, membro de `dc360_app`) e a API real (`npx tsx src/index.ts` com `DATABASE_URL` do `dc360_api`). Diretório das saídas: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L04-qa/out/` (abaixo, `out/`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Critério decisivo da rodada 4: troca de senha com a senha antiga em voo contra a redefinição por quem administra, o link, a desativação, a troca pela própria pessoa e o encerramento | sonda própria `scripts/sonda-troca-em-voo.mjs` contra a API real e Postgres 17.6: 125 rodadas sem grampo (`out/10`, análise `out/12`) e 80 rodadas com a reação inteira dentro da janela dos scrypt da troca (`out/13`, análise `out/14`) | 0 defeito em 205 rodadas. Com a reação inteira dentro da troca: redefinição 20 de 20 e link 20 de 20 com a troca recusada (401 `sessao_encerrada`) e a senha da reação valendo; desativação 20 de 20 com 403 `conta_desativada`. CONSERTADO |
| A sonda morde | a mesma sonda contra uma cópia da API com o `servico.ts` de `bb0f654` (só o `trocarSenha` muda, um hunk), banco próprio na 051 (`out/22`) | redefinição 8 de 8, link 8 de 8 e troca pela própria pessoa 8 de 8 com defeito (a senha do invasor vale, a temporária e a do link não entram, duas trocas 200); o 4ce0433 dá 0 nas mesmas condições |
| Positivo: renovação normal, o token antigo escreve até vencer e o novo também | `scripts/sonda-criterios.mjs` (`out/11`, linhas `[E07]`) e bloco de Postgres real, caso 5 (`out/05`) | 200 nos dois tokens |
| Positivo: papel rebaixado, 401 `nao_autenticado`, renovar traz o papel novo e a escrita do papel novo passa | `out/11`; e2e seção 24 em Chromium e Firefox (`out/15`, `out/20`) | 401 `nao_autenticado`; renovado com `operador`; abrir ocorrência 201; no painel, a escrita seguinte renova em silêncio e o menu Usuários some |
| Positivo: senha provisória no prazo troca a senha | `out/11` | escrita comum 403 `troca_de_senha_obrigatoria` antes; troca 200; o token devolvido escreve; a nova entra, a provisória não |
| Negativo: administrador, a própria pessoa, reuso de refresh e troca de senha encerram a cadeia, e o token pré-renovação recebe 401 `sessao_encerrada` | `out/11` (quatro encerramentos, cada um com pessoa nova, renovação antes do ato) | 401 `sessao_encerrada` nos quatro; o token renovado também cai; a renovação da cadeia não volta |
| Negativo: provisória vencida, trocar e renovar respondem 401 | `out/11` (prazo vencido no banco por `UPDATE` do superusuário); `senha-provisoria.test.ts` 8 de 8 (`out/05`) | troca 401 `sessao_encerrada`, renovar 401, escrita 401 `sessao_encerrada` (não 403), entrar 401, a senha nova não passou a valer |
| Negativo: rebaixado a operador, o ex-coordenador renovado não despacha | `out/11`; e2e seção 24 | 403 `sem_permissao` |
| Autorização e isolamento: coordenador de A rebaixado, o token antigo não despacha e não vê B | `out/11` | despacho com o token velho 401 (também contra a ocorrência de B); leitura da ocorrência de B 404 com o token velho e com o renovado |
| Regressão: `npm run test:api` | `out/01` | 104 arquivos, 1451 aprovados, 34 pulados (o bloco de Postgres real, sem a variável), 0 falha, código 0 (até `openssl-do-teste` passou nesta máquina) |
| Regressão: o bloco de Postgres real, sem pulo | `DC360_POSTGRES_DE_PROVA` apontando para o cluster 17.6, 16 arquivos de autenticação, inclusive `renovacao-contra-encerramento.test.ts` (53 casos), `api.test.ts` ("desativar usuário derruba as sessões"), `superficie.test.ts` (`out/05`) | 291 de 291, 0 pulado, código 0 |
| Regressão: `npm run test:isolamento` (inclui `migrar.test.ts`) | `out/09` | 14 arquivos, 345 aprovados, 3 pulados, código 0; `migrar.test.ts` 17 de 17 |
| Regressão: `npm run test:console` | `out/07` | 259 de 259, código 0 |
| Regressão: `npm run test:e2e:api` | cópia do roteiro no worktree com portas 3793 e 4793 (só as portas mudam), Chromium (`out/15`) e Firefox 153 (`out/20`) | suíte principal 288 aprovadas e 0 falha, geometria 64 e 0, nos dois motores, código 0 |
| DoD: migração aplicada do zero e sobre banco existente | do zero com `dc360_setup` (`out/02`: 51 aplicadas, `--conferir` "Esquema em dia.", de novo "Nada a fazer: 51"); por cima de um banco na 046 com semente e duas sessões (uma viva, uma revogada) (`out/23`) | `--conferir` antes sai 1; aplica 047 a 051; depois "Esquema em dia."; as duas sessões com `familia_id = id`; índice parcial `sessoes_familia_viva_idx ... WHERE revogada_em IS NULL`; 27 funções SECURITY DEFINER; login, renovação e escrita com o token de antes da renovação 200 na API sobre esse banco |
| DoD: zero `skip` | `out/05` | com Postgres real, 0 pulado; sem a variável o bloco fica pulado por ambiente (política T42), e o CI declara rodá-lo (não lido) |
| DoD: itens do G00 marcados | não se aplica a esta sessão | marca-se no gate |

Motivo do veredito da rodada 4, item por item:
- "`trocarSenha` confere numa transação e grava em outra, sem trava, sem reler hash, `ativo` ou sessão": consertado. Leitura de `apps/api/src/auth/servico.ts:1150-1189` (linha `FOR NO KEY UPDATE`, `travar_sessoes_do_usuario`, releitura de `ativo`, da cadeia viva e do hash, `trocar_senha` na mesma transação) e, por execução, as 205 rodadas sem defeito contra a API real, com o controle mutante reprovando.
- "Nenhum teste do repositório cobre o caso": consertado. Casos 11 a 17, 21 a 34 de `renovacao-contra-encerramento.test.ts` rodaram verdes em Postgres 17.6 (`out/05`).

## Evidência

- `out/01-test-api.txt`: `npm run test:api`, código 0.
- `out/02-provisionar-e-migrar.txt`: papéis do CI, `migrar --semear`, `--conferir`, `migrar` de novo.
- `out/05-auth-postgres-real.txt`: `DC360_POSTGRES_DE_PROVA=postgres://postgres@127.0.0.1:55941/postgres npx vitest run --root apps/api <16 arquivos>`, código 0.
- `out/07-test-console.txt`, `out/09-test-isolamento.txt`: código 0.
- `out/10` e `out/12`: `API=http://127.0.0.1:3791 RODADAS=25 node scripts/sonda-troca-em-voo.mjs`, código 0.
- `out/13` e `out/14`: a mesma com `MODO=dentro RODADAS=20`, código 0.
- `out/22`: a mesma contra a API mutante (porta 3795), código 1 (esperado: mostra que a sonda pega o defeito da rodada 4).
- `out/11-sonda-criterios-pg17.txt`: `node scripts/sonda-criterios.mjs`, 97 conferências (35 da E07), 0 falha, código 0.
- `out/15` e `out/20`: `node scripts/e2e-api-qa.mjs chromium|firefox`, código 0.
- `out/23-migrar-por-cima.txt`, `out/24-log-do-postgres.txt` (0 linha de impasse no log do cluster; o único ERROR é o DC367 esperado do caso da suspensão; 0 resposta 500 na API).
- Scripts das sondas: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L04-qa/scripts/`.

## Cenários positivos

- Renovação normal: o token de antes da renovação e o novo escrevem.
- Papel rebaixado com a tela aberta: 401 `nao_autenticado`, renovação silenciosa com o papel novo, ação do papel novo passa (API e painel, dois motores).
- Provisória no prazo: troca 200 e o token devolvido escreve.
- A troca de papel não revoga a sessão: a cadeia renova (decisão registrada).
- Troca sem disputa (sonda, rodadas em que a troca confirma antes da reação): 200, e a reação que vem depois prevalece (a temporária e a senha do link valem, a sessão do invasor cai).

## Cenários negativos

- Quatro encerramentos de cadeia: token pré-renovação e renovado 401 `sessao_encerrada`, renovação 401.
- Provisória vencida: troca, renovação, escrita e entrada recusadas, hash intacto.
- Ex-coordenador renovado: despacho 403 `sem_permissao`; recurso do município B 404 (nunca 403) com os dois tokens.
- Troca do invasor em voo: recusada (401 `sessao_encerrada`, 403 `conta_desativada`) em todas as rodadas em que a reação confirmou antes dela.
- Desativada e reativada: o token pré-renovação, o renovado e a renovação continuam mortos (`out/17`, item 3).

## Tentativas de reprovar

1. Reproduzi o cenário exato da rodada 4 contra a API real e Postgres 17.6: a troca sai primeiro e a reação 10 a 150 ms depois, de modo que a reação começa e termina dentro dos dois scrypt da troca (cerca de 470 ms). Redefinição, link e desativação: 60 de 60 com a troca recusada e a reação valendo. Não quebrou.
2. 125 rodadas sem grampo, lado e atraso sorteados (0 a 300 ms), cinco reações, conferindo depois: a senha que deveria valer entra, a do invasor e a antiga não, a sessão do invasor não renova, o token devolvido pela troca não escreve depois da desativação ou do encerramento. 0 defeito.
3. Troca pela própria pessoa contra a do invasor: em nenhuma das 45 rodadas as duas responderam 200; quem perde recebe 401 às claras e a senha de quem respondeu 200 é a que entra.
4. Controle mutante (o `trocarSenha` de `bb0f654` na mesma árvore): a sonda reprova 24 de 24 rodadas de redefinição, link e troca pela própria pessoa. A sonda é capaz de ver o defeito; o 4ce0433 não o tem.
5. Banco existente na 046 com sessões abertas, migrado por cima: não trava login nem renovação.
6. Procurei impasse e erro 500 no log do cluster e da API: nenhum.

## Achados

- anotado: na troca concorrente pela própria pessoa, vence quem grava primeiro; com o invasor primeiro, a vítima recebe 401 `sessao_encerrada` e a senha do invasor vale (45 de 45 rodadas coerentes com isso, `out/10` e `out/13`). É a decisão registrada pelo implementador (ordem serial "invasor, depois vítima"); o remédio que vence sempre é a redefinição por quem administra, que a sonda provou vencer.
- anotado: a sonda da desativação não detecta, nem no controle mutante, o caso "troca confirma antes da desativação e a reativação devolve a senha do invasor"; é ordem serial válida e não foi tratada como defeito.

## Não verificado

- Postgres 16 (o do serviço do job `implantavel`): só 17.6 aqui (a produção é 17).
- O run do CI do SHA (ausente nesta sessão).
- As "três sondas" do implementador antes e depois diante do Rafael (validação humana); rodei sondas próprias equivalentes.
- A disputa segurada por grampo dentro da transação: não refiz por conta própria; ela está nos casos 28 a 34 do arquivo da corrida, que rodaram verdes em 17.6.

## Risco residual

Baixo. A janela da rodada 4 foi exercitada 60 vezes no ponto exato e 125 vezes por sorteio, com o controle mutante provando que a sonda enxerga o defeito. Fica a dependência de que todo caminho futuro que muda credencial ou `ativo` atualize a linha de `usuarios` antes da trava (regra da 049); um caminho novo fora dessa ordem não seria pego por esta sonda.

## Motivo do humano

A etapa pede que o Rafael veja as três sondas (rotacionada, papel, provisória) antes e depois. É validação de leitura e confiança do dono do produto, que esta dimensão não substitui; o veredito técnico não depende dela.
