---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas desta validação (todas citadas abaixo pelo nome):
`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E07/`
(abreviada como `QA/` nas linhas seguintes). Árvore em `0290af5`, que só difere de `bb0f654` em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md`. Postgres real usado: 18.4 descartável (binários do pacote `embedded-postgres` que já existia em outro projeto da máquina), pasta de dados em `QA/pgdata`, porta 55931, só local, superusuário sem senha e com confiança local, desligado no fim.

## Critérios verificados

| # | Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- | --- |
| C1 | Positivo: renovação normal, o token antigo escreve até vencer e o novo também | `familia-da-sessao.test.ts` (20 de 20) e mutação M1 | PASS no caminho da escrita comum; ver achado A2 (troca de senha com o token antigo mata o novo) |
| C2 | Positivo: papel rebaixado, 401 `nao_autenticado`, `/auth/renovar` traz o papel novo, a escrita do papel novo passa | `familia-da-sessao.test.ts`, `codigos-de-erro.test.ts`, sonda Q3 (papel trocado no meio de uma renovação em voo), e2e seção 24 (9 de 9) e mutação M3 | PASS |
| C3 | Positivo: senha provisória no prazo troca a senha | `familia-da-sessao.test.ts` e `senha-provisoria.test.ts` | PASS |
| C4 | Negativo: administrador, a própria pessoa, reuso e troca de senha encerram a cadeia; o token pré-renovação recebe 401 `sessao_encerrada` | `familia-da-sessao.test.ts`, `get-com-efeito.test.ts`, mutação M1 (8 vermelhos, todos de cadeia) | PASS |
| C5 | Negativo: trocar senha com provisória vencida responde 401 `sessao_encerrada`, e renovar também | `senha-provisoria.test.ts`, `familia-da-sessao.test.ts` (pelo serviço), sonda Q4, mutação M2 | PASS |
| C6 | Negativo: rebaixado a operador, o ex-coordenador renovado não despacha (403 `sem_permissao`) | `familia-da-sessao.test.ts`, sonda Q3, e2e seção 24 | PASS |
| C7 | Autorização e isolamento: A rebaixado não despacha e não vê B (404); `test:isolamento` verde com a migration | `familia-da-sessao.test.ts` (A x B), `npm run test:isolamento` 345 aprovados e 3 pulados de 348 | PASS |
| C8 | Regressão obrigatória: `test:api`, `test:isolamento`, `api.test.ts`, `test:console`, `test:e2e:api` | saídas `01`, `03`, `04`, `05`, `06` | PASS (1 falha de ambiente conhecida, LibreSSL) |
| C9 | DoD: migration aplicada do zero e sobre banco existente, `--conferir` | `QA/20`, `QA/21` em Postgres 18.4 real | PASS (só 18.4; 16 e 17 não provados aqui) |
| C10 | DoD: zero `skip` | o bloco de Postgres real (20 casos) pula sem `DC360_POSTGRES_DE_PROVA`; rodado aqui com a variável: 30 de 30, nenhum pulado, duas vezes | PASS local; no CI não lido |
| C11 | Sessão revogada e troca de senha em disputa com pedidos em voo (pedido do gatekeeper; item 2 da seção 7 de `28`, critério "sessão revogada" do G00) | sondas Q2 (PGlite com gancho) e Q2 em Postgres real sem gancho, 20 rodadas | **FAIL**, achado A1 |
| C12 | Documentação diz o que o código faz (`README.md`, `apps/api/PENDENCIAS.md`, `docs/COLOCAR-DE-PE.md`, `docs/DICIONARIO-DE-DADOS.md`) | leitura contra o código e `conferir:numeros` | PASS, com ressalva do achado A2 (a mensagem "As outras sessões foram encerradas") |
| C13 | Números novos da linha de base batem com a contagem real | `esperadoDoTesteApi()` = 1347 total e 20 pulados, medido 1347 e 20; `esperadoDoTesteDb()` = 348 e 3, medido 348 e 3; `conferir:numeros` código 0; `baseline.test.mjs` 29 de 29 | PASS |
| C14 | Validação humana: Rafael vê as três sondas antes e depois | não é do validador | pendente (humano) |

## Evidência

Comandos (em `dc360/`, salvo indicação), código de saída e saída:

- `npm run build:shared`: código 0 (`QA/00-build-shared.txt`). Muda `dist` ignorado pelo git.
- `npm run test:api`: código 1; 101 arquivos, 1347 casos: 1326 aprovados, 1 falha, 20 pulados (`QA/01-test-api.txt`). A falha é `test/openssl-do-teste.test.ts` (LibreSSL do macOS, divergência de máquina conhecida). Os 20 pulados são todos do bloco de Postgres real de `renovacao-contra-encerramento.test.ts`.
- Mesmo arquivo com `DC360_POSTGRES_DE_PROVA` apontando para o Postgres 18.4 local: `npx vitest run test/renovacao-contra-encerramento.test.ts` em `apps/api`, código 0, 30 de 30, nenhum pulado (`QA/02-corrida-pg18-rodada1.txt`).
- Arquivos da etapa e da correção 3 com Postgres real: `renovacao-contra-encerramento`, `familia-da-sessao`, `senha-provisoria`, `vigencia-na-escrita`, `segundo-fator`, `corpo-ilegivel`, `codigos-de-erro`, `get-com-efeito`, `api.test.ts`: código 0, 9 arquivos, 181 de 181 (`QA/03-arquivos-da-etapa-pg18.txt`). É a segunda rodada inteira do arquivo da corrida em Postgres real (30 de 30 de novo).
- `npm run test:isolamento`: código 0, 345 aprovados e 3 pulados de 348 (os 3 são de `busca.test.ts`, fora da etapa) (`QA/04-test-isolamento.txt`).
- `npm run test:console`: código 0, 259 de 259 (`QA/05-test-console.txt`).
- `npm run test:e2e:api`: código 0, 352 linhas `OK`, "Passou: 64 Falhou: 0", zero erro de console; seção 24 (papel alterado com a tela aberta) 9 de 9 (`QA/06-e2e-api.txt`). O roteiro roda `npm run build` (muda `dist` ignorado) e sobe API e painel nas portas 3691 e 4691, ambas livres depois.
- `npm run conferir:numeros`: código 0, "Todos os números da documentação batem com a realidade" (`QA/07-conferir-numeros.txt`).
- `node --test scripts/baseline.test.mjs`: código 0, 29 de 29 (`QA/08-baseline-test.txt`). Esperados calculados por `scripts/baseline.mjs` nesta sessão: API 1347, 0 falhas, 20 pulados; banco 348 e 3 pulados.
- `npx tsc -p tsconfig.json --noEmit` em `apps/api`: código 0 (`QA/09-tsc-api.txt`).
- Migração do zero em Postgres 18.4: `npm run migrar` aplicou 001 a 050, `--conferir` "Esquema em dia.", código 0 (`QA/20-migrar-do-zero.txt`).
- Banco existente: criado até a 046 com 3 sessões antigas (uma viva, uma rotacionada, uma de outra pessoa) por `QA/sondas/ate-046.mjs`; `--conferir` antes: "Faltam 4 migração(ões)" com código 1; `npm run migrar` aplicou 047 a 050; `--conferir` depois "Esquema em dia." com código 0; as 3 sessões ficaram com `familia_id = id`; coluna não nula com padrão `gen_random_uuid()`; índice parcial `sessoes_familia_viva_idx` onde `revogada_em IS NULL`; uma só `abrir_sessao`; 27 funções SECURITY DEFINER (`QA/21-migrar-banco-existente.txt`).
- Log do Postgres de toda a sessão: 0 linha com `deadlock` ou 40P01; só 2 ERROR, ambos a recusa esperada de município suspenso (`QA/22-log-do-postgres-resumo.txt`).
- Mutações (prova de que os testes mordem), cada uma aplicada, rodada e desfeita com `git restore` (árvore conferida limpa depois):
  - M1, a sessão rotacionada vale sem olhar a família (o `AND EXISTS` de `lerVigencia` removido, diff em `QA/30-mutacao-M1.diff`): 8 vermelhos de 43, todos de cadeia (`familia-da-sessao` e o caso 4 de `get-com-efeito`) (`QA/30-mutacao-M1-cadeia.txt`).
  - M2, `trocarSenha` sem a recusa da provisória vencida (`QA/31-mutacao-M2.diff`): 1 vermelho de 28, o caso "vencida no meio, pelo SERVIÇO" (`QA/31-mutacao-M2-provisoria.txt`).
  - M3, papel diferente responde `sessao_encerrada` em vez de `nao_autenticado` (`QA/32-mutacao-M3.diff`): 4 vermelhos de 55 (`QA/32-mutacao-M3-papel.txt`).
  - M4, `emitirPar` sem a releitura da credencial e de `ativo` (`QA/33-mutacao-M4.diff`): 4 vermelhos (casos 6, 7 e 8 do bloco de PGlite e o desafio do segundo fator com a senha antiga) (`QA/33-mutacao-M4-releitura.txt`).
- Sondas próprias (fora do repositório): `QA/sondas/sonda-qa-e07.test.ts` (PGlite, com gancho depois do COMMIT de cada transação, como o grampo do arquivo da corrida), rodada com `npx vitest run --root . --dir QA/sondas --globals` em `apps/api`: código 1, 3 vermelhos e 3 verdes (`QA/10-sonda-qa.txt`); `QA/sondas-pg/sonda-qa-e07-pg.test.ts` (Postgres 18.4 real, sem gancho, tempo natural do scrypt), 20 rodadas: código 1 (`QA/11-sonda-qa-pg18.txt`).

## Cenários positivos

- Renovação normal: o token anterior e o novo escrevem (`familia-da-sessao.test.ts`, verde; vermelho com M1 só nos casos de cadeia encerrada, o que mostra que o positivo não depende da regra relaxada).
- Papel rebaixado com a tela aberta, no painel construído contra a API: a escrita seguinte leva 401, renova em silêncio, repete e passa; o menu Usuários some; o token renovado leva 403 `sem_permissao` no despacho (e2e seção 24, 9 de 9).
- Sonda Q3: o papel trocado ENTRE a leitura de `sessao_por_token` e a rotação de uma renovação em voo; o token que nasce traz `coordenador` (papel velho), o despacho com ele leva 401 `nao_autenticado`, a renovação seguinte traz `operador` e o despacho leva 403 `sem_permissao` (`QA/10`). O desenho se corrige sozinho.
- Provisória no prazo troca a senha (verde nos arquivos da etapa).
- Controle da sonda Q1: troca de senha com o token ATUAL (pós-renovação): 200, e o token atual e o devolvido continuam escrevendo (200 e 200) (`QA/10`).
- Migração do zero e sobre banco existente, com `--conferir` antes (código 1) e depois (código 0) (`QA/20`, `QA/21`).

## Cenários negativos

- Cadeia encerrada por administrador, pela pessoa, por sair, por reuso e por troca de senha: o token pré-renovação leva 401 `sessao_encerrada` (verde; M1 deixa os 8 casos vermelhos).
- Provisória vencida (sonda Q4, `QA/10`): `/auth/encerrar-sessoes` (rota aberta à provisória) 401 `sessao_encerrada`; `/auth/trocar-senha` 401 `sessao_encerrada`; `/auth/renovar` 401 `sessao_encerrada`; `GET /avisos` (GET com efeito) 401 `sessao_encerrada`.
- Login com a senha antiga contra troca, redefinição e desativação, nas duas ordens e na janela entre `abrir_sessao` e a trava: verde em Postgres real (casos 10 a 20), e M4 deixa os casos de PGlite vermelhos.
- Rebaixado não despacha (403) e A rebaixado não vê B (404): verde.
- Troca de senha em voo contra redefinição por quem administra (Q2) e contra desativação (Q2b): **reprova**, ver A1.
- Troca de senha com o token pré-renovação (Q1): **reprova**, ver A2.

## Tentativas de reprovar

1. Tirei a regra da família da vigência (M1), a recusa da provisória no serviço (M2), o código do papel (M3) e a releitura sob a trava no login (M4): todas mordem, nos casos certos e só neles.
2. Rodei o bloco de Postgres real que o `test:api` pula: duas rodadas inteiras, 30 de 30 cada, sem pulo e sem impasse no log.
3. Ataquei a troca de papel com uma renovação em voo (Q3): não quebrou.
4. Ataquei a provisória vencida nas rotas que a lista `ROTAS_ABERTAS_COM_SENHA_PROVISORIA` deixa passar e num GET com efeito (Q4): não quebrou.
5. Ataquei a troca de senha com o token de acesso emitido antes da renovação (Q1): **quebrou** (A2). Causa lida no código: `trocar_senha` (049) preserva só a linha `p_sessao_preservada`, e o `sid` do token pré-renovação é a sessão já rotacionada; a viva da mesma família é outra linha e cai. `encerrarSessoes` (`auth/sessoes.ts`) já preserva a família desde a correção 1; `trocar_senha` não.
6. Ataquei a troca de senha em voo contra a redefinição por quem administra (Q2), primeiro deterministicamente em PGlite (a redefinição confirmada logo depois da leitura da senha atual de `trocarSenha`), depois em Postgres real sem gancho, disparando a redefinição de 20 a 140 ms depois da troca: **quebrou nas 20 de 20 rodadas** (A1).
7. Ataquei o mesmo com a desativação no meio (Q2b): **quebrou** (A1, mesma causa).
8. Conferi os números da linha de base contra a medição real e a documentação contra o código (README linhas 130 a 188 e 267, `PENDENCIAS.md` seção da E07, `DICIONARIO-DE-DADOS.md` linha 318, `COLOCAR-DE-PE.md` ordem da 047): batem, salvo a frase da troca de senha que A2 desmente.

## Achados

**A1 (bloqueia; item 2 da seção 7 de `28`, critério "sessão revogada"): a troca de senha em voo desfaz a redefinição de quem administra.**
`trocarSenha` (`apps/api/src/auth/servico.ts`, linhas 1065 em diante) lê `senha_hash` numa transação, gasta dois scrypt (conferir a atual e derivar a nova) e chama `trocar_senha` em OUTRA transação; `trocar_senha` (`db/migrations/049_renovacao_e_encerramento_na_mesma_trava.sql`, linha 130) grava o hash sem conferir que a credencial lida ainda é a do banco nem que a sessão que pede ainda está de pé. É a mesma classe do FAIL da rodada 3 (credencial conferida numa transação, efeito em outra, sem reler sob a trava), consertada no login pela correção 3 e não na troca de senha.
Reprodução em Postgres 18.4 real, sem gancho (`QA/sondas-pg/sonda-qa-e07-pg.test.ts`, saída `QA/11-sonda-qa-pg18.txt`): Helena (ou quem tem a sessão e a senha dela) pede `POST /auth/trocar-senha`; 20 a 140 ms depois a administradora pede `POST /usuarios/:id/redefinir-senha`. Nas 20 rodadas: as duas respondem 200; a redefinição revogou as sessões e gravou a temporária com prazo de 72 horas; a troca confirma depois, com a sessão já revogada, e grava a senha escolhida por quem trocou. Resultado medido: entrar com a temporária da administração 401, entrar com a senha de quem trocou 200, `senha_provisoria_ate` nulo. A trilha diz "senha redefinida", e a senha que vale é a do outro. Em PGlite com a redefinição confirmada no meio (determinístico): mesmo desfecho (`QA/10`, Q2).
Por que bloqueia: o caso que a redefinição existe para resolver é a conta invadida (comentário da própria rota em `rotas/administracao.ts`). Quem tem a sessão e a senha pode manter um pedido de troca sempre em voo (cada um dura o tempo de dois scrypt); a redefinição que cair no meio é desfeita e o invasor entra de novo com a senha que escolheu. A sessão revogada praticou, depois da revogação, a escrita que mais importa. Nenhuma ordem serial produz esse estado: antes da redefinição a troca seria sobrescrita, depois dela a troca seria recusada (sessão morta e senha atual errada).
Variante Q2b (mesma causa, `QA/10`): desativação confirmada no meio; a troca responde 200 e grava a senha numa conta desativada; reativada a conta, a senha escolhida durante a desativação entra (200).
Conserto mínimo apontado (o validador não implementa): conferir sob `travar_sessoes_do_usuario`, na mesma transação do UPDATE, que o hash ainda é o lido, que a conta está ativa e que a sessão (ou a família dela) de quem pede ainda está de pé, como `emitirPar` faz; caso de teste com a redefinição e a desativação no meio, nas duas ordens, no bloco de Postgres real. Provavelmente anterior à E07 (não medido em SHA antigo); a etapa e a correção 3 mexeram em `trocarSenha` e no padrão exato, e o gatekeeper pediu este ataque.

**A2 (corrige antes de crescer; toca o positivo C1): trocar a senha com o token de acesso de antes da renovação derruba a própria cadeia, e a resposta diz o contrário.**
Reprodução (`QA/10`, Q1, PGlite): login, renovação (p0 antigo, p1 novo), `POST /auth/trocar-senha` com p0: 200, "Senha trocada. As outras sessões foram encerradas." Depois: escrita com p1 401 `sessao_encerrada`, escrita com o token que a própria troca devolveu 401 `sessao_encerrada`, renovar p1 401, 0 sessão viva da pessoa. Controle com p1: tudo 200. Causa: `trocar_senha` preserva a linha `p_sessao_preservada` (o `sid` rotacionado) e não a família; é o mesmo defeito que a correção 1 consertou em `encerrarSessoes`. Efeito: quem troca a senha no painel ou no aparelho com um token emitido antes da última renovação (a fila do campo, outra aba) é expulso e recebe um token que já nasce morto, contrariando o positivo "o token antigo escreve até vencer e o novo também" e a frase da tabela de segurança do README ("derruba as outras sessões").

**A3 (anotado, só leitura de código, não executado):** `conferirSegundoFator` e `sessaoAposAtivacao` não perguntam se a senha provisória venceu nos cinco minutos do desafio; a sessão nasce com a marca `sp`, mas não escreve, não renova e não troca (vigência, `renovar` e `trocarSenha` recusam). Não quebra o critério "nem escreve nem se troca".

## Não verificado

- O run do CI 39143791434 (sem `gh` autenticado nesta sessão); o passo do job `implantavel` que roda o bloco de Postgres real no Postgres 16 não foi lido.
- Postgres 16 (CI) e 17 (produção): as provas em Postgres real desta sessão são em 18.4.
- A1 não foi medido em SHA anterior à E07 (para dizer se é regressão ou herança); não foi medido contra a redefinição pelo link de e-mail (`consumir_recuperacao`), só contra a de quem administra e a desativação.
- A3 não foi executado (exigiria montar o segundo fator com relógio controlado).
- O aplicativo de campo (Expo) e a fila offline diante de `nao_autenticado`: não rodados nesta dimensão (`test:campo` e jest do app não fazem parte da regressão obrigatória da etapa).
- Capturas do painel: não refeitas (portão visual não se aplica à etapa pela matriz; a seção 24 do e2e prova o comportamento).
- Não li as outras dimensões em `validacao/bb0f654/` (regra do prompt).

## Risco residual

- A1 em produção: redefinição de senha por quem administra pode ser desfeita por quem tem a sessão e a senha, de forma repetível; é o remédio da conta invadida.
- A2: logout inesperado depois de trocar a senha a partir de token pré-renovação; sem perda de dado (a fila guarda), mas a mensagem engana.
- Leitura com token vivo continua confiando na assinatura até a F03-E03 (declarado pela etapa).
- O bloco de Postgres real só roda com a variável; no `test:api` local ele sai pulado (20), e a garantia de "zero skip" depende do passo do CI, não lido.

## Motivo do humano

A etapa pede que Rafael veja as três sondas (rotacionada, papel, provisória) antes e depois; é validação E4 declarada no bloco da etapa e não é substituída por esta dimensão. Fora isso, nada aqui depende de humano: A1 e A2 são reproduzíveis pelos arquivos de sonda citados.
