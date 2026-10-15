# VEREDITO de V2-F00-E07

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 2026-10-15 | 52952a1 | 7585801 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 3 (2026-10-15, SHA 52952a1)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael. Candidato `52952a1` (produto de `7c97881`; o diff `7c97881..52952a1` só toca `docs/roadmap-v2/`). Base do lote: `afde25c`; o que mudou desde a rodada 2: `git diff 4b96ea7..52952a1` (correção 2 e correções 3 e 4). Herança: NENHUMA dimensão herdada da rodada 2 (`impacto.mjs --herdavel` deu "NÃO herdável" em todos os relatórios PASS: o diff toca `auth/servico.ts`, as migrações 049 e 050, `componentes/comuns.tsx`, `apps/campo/package-lock.json` e `.github/workflows/verificar.yml`), por isso todas as dimensões rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas na rodada 2 (mantidas). Os agentes de dimensão do Windows (`~/.claude/agents/`) não existem no Mac: cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt do validador (`prompt-do-validador.md`, adaptado para lote e para o Mac), em sequência estrita, um por vez, sobre a árvore principal. Modelo: Opus em todas as dimensões (gatilho 5 da seção 12 de `28`, terceira rodada, e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, que rodou em Claude Sonnet 5.5 (claude-sonnet-5-5) porque é o padrão da política para LGPD não estrutural (nenhuma das cinco etapas toca manifesto, retenção ou eliminação) e a dimensão não reprovou nas rodadas 1 e 2; a primeira tentativa dela foi interrompida pelo limite de sessão da API sem gravar nada e foi refeita do zero no mesmo modelo. Os validadores receberam o bloco da etapa, só a seção Fatos dos RESUMOs (inicial e correções), a lista da evidência, as decisões da seção 9 do STATUS e D1 a D8, os VEREDITOs das rodadas 1 e 2 e o run do CI.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | FAIL | media | E1, E2 | E1, E2 |  | validacao/52952a1/banco-de-dados.md |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/52952a1/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | FAIL | media | E1, E2 | E1, E2, E3a |  | validacao/52952a1/red-team.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/52952a1/seguranca-aplicacao.md |

### Motivo do veredito

- Banco, Red-team, Segurança e QA FAIL (Opus), concordantes, pela mesma causa, reproduzida de forma independente por três deles: o login com a senha ANTIGA, no mesmo instante de uma troca de senha, de uma redefinição (por link ou por quem administra) ou de uma desativação, abre uma sessão que sobrevive à revogação. `entrar` (`apps/api/src/auth/servico.ts`) confere a senha numa transação e abre a sessão em outra, sem a trava por pessoa da 049 e sem reler a credencial nem `ativo`. Medido pelo Banco em Postgres 17 real: 13 de 30 na troca pela própria pessoa (a sobrevivente renova por 14 dias e ESCREVE), 30 de 60 e 14 de 30 na redefinição por quem administra (escrita leva 403 `troca_de_senha_obrigatoria`, leitura e renovação seguem), 18 de 30 na desativação (sessão viva no banco, inerte). O Segurança mostrou que o segundo fator também não fecha. É o critério "sessão revogada" da E07 e do G00, e o item 2 da seção 7 de `28`: não admite risco aceito.
- O FAIL da rodada 2 (renovação concorrente com o encerramento) está CONSERTADO: 0 sobra em 890 disputas em Postgres 17, nenhum impasse em 160 iterações de caos, 14 de 14 no bloco de Postgres real, e o teste morde.
- Conserto mínimo apontado (o gatekeeper não implementa): abrir a sessão do login na mesma transação da releitura da credencial, sob `travar_sessoes_do_usuario`, conferindo que o hash e `ativo` ainda são os que o scrypt conferiu (ou uma versão da credencial que a troca incrementa); o mesmo no desafio do segundo fator; caso no bloco de Postgres real com a disputa segurada.
- Formato: o relatório de Segurança não tem a seção `## Evidência` (a evidência está em Critérios e Achados); pela regra, a dimensão conta como inconclusiva pelo formato, o que não muda o FAIL, sustentado pelas outras três.

### CI (job a job)

Run 38618369218 do SHA `7585801` (registro do candidato; o diff `52952a1..7585801` só toca `docs/roadmap-v2/STATUS.md`, lista permitida), CI completo, 9 de 9 verdes. HEAD durante a validação: `95f09f6`, que só muda `STATUS.md` (o run 38622326015 dele também foi disparado).

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | |
| A API sobe contra Postgres real | success | QA, Banco | inclui a corrida de renovação em Postgres real, 14 de 14 sem pular |
| Fluxo ponta a ponta no navegador | success | QA, UX | Chromium e Firefox |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | 19 de 19, código 0 |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | 50 migrações, 27 conferências; roda `scripts/ensaiar-restore.sh`, não o documento |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | |
| Aplicativo de campo | success | QA, Testes | |
| Pacote da demonstração | success | QA | |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | nenhum job roda `conferir-evidencia` (achado da E21) |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E07 --sha 52952a1`: sem falha, 0 aviso.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- Quem perde a trava para a desativação recebe 401 `sessao_encerrada` em vez de 403 (efeito na E05; conserto: chamar `tratarTokenRecusado` no ramo `sessaoNova === null`).
- Mutação M7 (prazo da senha provisória fora da vigência) fica toda verde: falta teste para esse ramo (Red-team).
- `/auth/sair` com token já rotacionado responde 204 e não encerra a cadeia.
- A vigência não confere `expira_em` da sessão viva da família (rodada 2).
- Corpo JSON vazio em `POST /usuarios/:id/encerrar-sessoes` responde 500.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |
| 4 (risco alto com AUTH, AUTHZ, TENANT ou RLS) | red-team, segurança e banco em Opus | feito |
| pedido de arbitragem de escopo pelo Banco (gatilho 9) | não acionada: as quatro dimensões concordam em FAIL e a DoD cita "sessão revogada" | FAIL consolidado pelo gatekeeper |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: nenhuma além do script (banco-de-dados em Opus). Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arbitragem (Opus) | arquiteto-software | claude-opus-5-5 | FAIL | alta |  |  | | validacao/4b96ea7/arbitragem.md |
| Banco | banco-de-dados | claude-opus-5-5 | FAIL | media | E1, E2 | E1, E2 | | validacao/4b96ea7/banco-de-dados.md |
| QA | qa | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/seguranca-aplicacao.md |

### Motivo do veredito

- Banco (Opus) FAIL, confirmado pela arbitragem em Opus (confiança alta): a renovação concorrente com o "encerrar sessões" do administrador deixa uma sessão viva numa família já encerrada. Em `apps/api/src/auth/servico.ts:684-711` revogar a antiga e abrir a nova são duas transações separadas, e `abrir_sessao` (migração 047) herda até família encerrada. Sobrou sessão viva em 5 de 60 corridas, e em 3 de 6 com quem renova sem parar. É item 2 da seção 7 de `28` (sessão revogada): não admite risco aceito.
- QA, Segurança e Red-team deram PASS sem exercitar a corrida; a arbitragem decidiu que o defeito é da E07 (objetivo "sessão rotacionada só vale enquanto a cadeia vive" e o item do G00) e que a nota da seção 11 do STATUS que manda a "janela na renovação" para a F03-E02 trata de outro defeito, no sentido oposto.

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Serializar renovação e encerramento por usuário ou família (trava comum, por exemplo `pg_advisory_xact_lock` ou `SELECT ... FOR UPDATE` da família) e `abrir_sessao` recusar família encerrada; teste de corrida que repete a disputa muitas vezes e exige zero sessão viva.

### CI (job a job)

Run 38445527075 do SHA `c9895e9` (registro do candidato; o diff `4b96ea7..c9895e9` só toca `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md`, lista permitida), CI completo, 9 de 9 verdes. Também verde o run 38449152610 de `24aed19` (HEAD durante a validação).

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | |
| A API sobe contra Postgres real | success | QA, Banco | |
| Fluxo ponta a ponta no navegador | success | QA, UX | |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | 19 de 19, código 0 (engenharia-entrega da E01) |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | Postgres 17.11, 48 migrações, 27 conferências (E25) |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | verde, mas o `auditar` sai 0 sem auditar se o registro npm cai (FAIL da E19) |
| Aplicativo de campo | success | QA, Testes | |
| Pacote da demonstração | success | QA | |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-Enn --sha 4b96ea7` sem falha e 0 aviso nas 25 etapas (INDEX.md e SHA-256, segredos, travessão, capturas, sonda).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados por ambiente; `npm run conferir:numeros` 24 conferidas e 0 divergência. Kit completo (o diff `7005a60..4b96ea7` toca `scripts/roadmap/**` e três caminhos sem regra no mapa, `.gitignore`, `apps/web/src/devolucao.ts` e `db/PENDENCIAS.md`): `node scripts/baseline.mjs --sem-instalar` 17 de 17 conferem (typecheck, shared, banco, motor do campo, API, console, painel, jest do app, `test:campo`, `test:scripts`, `conferir:numeros`, `auditar`, dois `npm audit`, `expo-doctor` 21 de 21, e2e local e e2e contra a API).
- Herança: nenhuma dimensão herdada da rodada 1 (o diff toca `scripts/roadmap/**`, regra que mudou, e caminhos sem regra no mapa).
- Árvore: conferida antes e depois de cada validador; nenhum validador deixou mudança fora de `validacao/4b96ea7/`. DESVIO DA SEÇÃO 5 DE `28`, registrado: para caber no prazo, os validadores rodaram em três trilhas paralelas na mesma árvore (API e banco; painel; scripts e campo), cada uma restrita a mutar só a sua área. O efeito colateral apareceu: uma mutação temporária da segurança em `apps/api/src/rotas/avisos.ts` foi carregada pela API do agente de navegador e gerou um falso alarme de vazamento no sino (E08), investigado e descartado com prova (`V2-F00-E08/validacao/4b96ea7/red-team-sino.md`). Próxima rodada: worktree por validador ou sequência estrita.
- Um travamento do computador interrompeu dois validadores no meio (QA do campo e LGPD); os dois foram retomados com o contexto preservado e a árvore conferida antes da retomada (só restava uma sonda não rastreada do próprio QA, apagada por ele).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| Rafael vê as três sondas | sondas reexecutadas por QA, Segurança, Red-team e Banco no SHA | verificável por execução |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 4 (risco alto com AUTH, DB e MIGRATION) | red-team e banco-de-dados em Opus | red-team PASS, banco FAIL |
| 6 (vereditos opostos) | arbitragem em Opus (arquiteto-software) | FAIL, confiança alta |

### Métricas da rodada

Ver os relatórios de cada dimensão.

## Rodada 1 (2026-10-13, SHA 7005a60)

Gatekeeper: sessão nova, Claude Opus 5.5 (claude-opus-5-5), consolidação em Opus por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `665b2be`, descendente que só muda `docs/roadmap-v2/STATUS.md` (lista permitida). A fase foi implementada em lote (base `afde25c`); o diff de cada etapa é o `diff-da-etapa.patch` quando existe, senão os arquivos prováveis do bloco dentro de `afde25c..7005a60`. Os `RESUMO.md` são anteriores à separação Fatos e Justificativa da D-30: foram entregues aos validadores como alegações a derrubar, nunca como prova.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Banco | banco-de-dados | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/7005a60/banco-de-dados.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |
| UX | ux | claude-sonnet-5-5 | PASS | media | E2, E3a | E2, E3a | | validacao/7005a60/ux.md |
| Segurança | seguranca-aplicacao | n/a | NÃO EXECUTADA | n/a | n/a | n/a | | não executada: FAIL já consolidado e o conserto toca `servidor.ts`, que está no mapa dela; roda inteira na rodada 2 |
| Red-team | red-team | n/a | NÃO EXECUTADA | n/a | n/a | n/a | | não executada: idem; roda em Opus na rodada 2 |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, seguranca-aplicacao, ux (o teto cortou banco-de-dados e acessibilidade). Acrescentados pelo gatekeeper: banco-de-dados (migração 047 e RLS). Lote: ux com E05, E08 a E11 e E13.

### Motivo do veredito

- QA FAIL pela mesma causa da E04: `servidor.ts:478` classifica escrita pelo método, então com o token de uma cadeia encerrada pelo administrador o POST dá 401 e o `GET /documentos/:id/termo-de-interdicao` dá 200 e grava `documento_emitido`; com o token de um coordenador rebaixado a operador o GET dá 200. Anula os critérios "a cadeia morre" e "papel antigo não escreve".

### CI (job a job)

Run 37739535524 do SHA 7005a60, 9 de 9 verdes.

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | |
| A API sobe contra Postgres real | success | QA, Banco | só prova `/saude` e o login |
| Fluxo ponta a ponta no navegador | success | QA, UX | |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | trata o código 1 do roteiro como aviso, de propósito (ver E01) |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | aceita exceção sem prazo (ver E19) |
| Aplicativo de campo | success | QA, Testes | pula `expo-doctor`, documentado |
| Pacote da demonstração | success | QA | |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E07 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| folha de contato do fluxo de sessão e papel | Rafael | gatilho visual na dúvida (fluxo de erro crítico de sessão) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `/auth/encerrar-sessoes` com o token anterior à renovação derruba a própria cadeia e a mensagem diz que a sessão continua aberta
- a migração 047 não tem SQL de reversão escrito
- `abrir_sessao` não confere o tenant e aceita família já encerrada (desenho anterior à etapa)

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
