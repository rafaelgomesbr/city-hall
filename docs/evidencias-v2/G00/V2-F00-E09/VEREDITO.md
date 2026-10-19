# VEREDITO de V2-F00-E09

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 4 (2026-10-19, SHA bb0f654)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, entre 2026-10-18 e 2026-10-19. Candidato `bb0f654` (correção 3 da F00); HEAD durante a validação `0290af5`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 3: `git diff 52952a1..bb0f654`. Herança: NENHUMA dimensão herdada da rodada 3 (`impacto.mjs --herdavel`, com o nome da dimensão tirado do arquivo, deu "NÃO herdável" em todos os relatórios PASS: o diff toca `dc360/**` e `.github/workflows/verificar.yml`, que estão no mapa de todas as dimensões); todas rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas em rodadas anteriores (mantidas). Cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (mais as instruções comuns da rodada), em sequência estrita, um por vez, sobre a árvore principal, cobrindo uma ou mais etapas por lote e gravando um relatório por etapa. Modelo: Opus em todas as dimensões e arbitragens (gatilho 5 da seção 12 de `28`, quarta rodada; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS dos RESUMOs (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo do veredito da rodada 3, as decisões da seção 9 do STATUS e o estado do CI.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/red-team.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | media | E2, E3a | E2, E3a |  | validacao/bb0f654/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/acessibilidade.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E2, E3a | E1, E2, E3a |  | validacao/bb0f654/privacidade-lgpd.md |

### Motivo do veredito

- Red-team e QA FAIL (Opus, confiança alta), concordantes em dois defeitos: (1) as rotas recusam com 422 quem administra agir sobre a própria conta, mas aceitam o mesmo id em letras maiúsculas (`apps/api/src/rotas/administracao.ts:437` e `:560` comparam o id como texto): a administradora recebe 200 em redefinir-senha e em encerrar-sessoes sobre si mesma e redefine a própria senha sem informar a atual, o que deixa quem senta numa sessão dela aberta tomar a conta; (2) a redefinição por quem administra perde para uma troca de senha em voo da sessão que ela derruba (Red-team 5 de 5, QA 12 de 12): fica valendo a senha de quem foi derrubado. Item 2 da seção 7 de `28`: não admite risco aceito.
- UX, Acessibilidade e LGPD PASS não contradizem: não exercitam autorização nem disputa.
- Nota de independência: o prompt do QA desta etapa foi escrito depois do relatório do Red-team e mandou atacar "variações do identificador" e "a troca em voo"; o QA reproduziu com execução própria, mas a independência dessa reprodução é parcial.
- Falso verde: os dois defeitos já existiam em `52952a1` (nem `administracao.ts` nem `trocarSenha` mudaram desde a rodada 3), que deu PASS a esta etapa.
- Conserto mínimo apontado: comparar o id normalizado (ou como uuid) nas recusas sobre a própria conta; e o mesmo conserto de `trocar_senha` apontado na E07.

### CI (job a job)

Run do SHA NÃO lido nesta sessão: o `gh` em `~/.local/bin/gh` está sem login gravado, e a leitura do token pela credencial do git (o caminho da H25) foi negada pela permissão da sessão; o gatekeeper não contornou. O STATUS registra, pela sessão do implementador, "CI completo do registro `ecaad76` (run 39143791434): 9 de 9 verdes"; isso NÃO foi verificado aqui. A dimensão Infra e CI, onde é obrigatória, ficou BLOCKED por isso; nas demais dimensões o run não é a evidência mínima e as provas foram locais (seção 8 de `28`).

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | não lido | QA, Testes | run 39143791434 citado pelo implementador, não verificado |
| A API sobe contra Postgres real | não lido | QA, Banco | run 39143791434 citado pelo implementador, não verificado |
| Fluxo ponta a ponta no navegador | não lido | QA, UX | run 39143791434 citado pelo implementador, não verificado |
| Linha de base (baseline.mjs) em Linux | não lido | Infra e CI | run 39143791434 citado pelo implementador, não verificado |
| Restore do banco, Postgres 17 (CA-08) | não lido | Banco, Infra e CI | run 39143791434 citado pelo implementador, não verificado |
| Dependências com vulnerabilidade conhecida (auditar) | não lido | Infra e CI | run 39143791434 citado pelo implementador, não verificado |
| Aplicativo de campo | não lido | QA, Testes | run 39143791434 citado pelo implementador, não verificado |
| Pacote da demonstração | não lido | QA | run 39143791434 citado pelo implementador, não verificado |
| Ferramentas do roadmap e estado gerado | não lido | Infra e CI | run 39143791434 citado pelo implementador, não verificado |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0 (25 afirmações). Suítes por impacto rodadas pelos validadores (ver cada relatório). Divergências conhecidas da máquina, não do produto: `openssl-do-teste` com o LibreSSL do macOS e os 4 testes de iOS que no Linux ficam pulados (na E03 a primeira virou critério, ver o VEREDITO dela).
- Formato: os 82 relatórios da rodada (todas as etapas) conferidos por script: cabeçalho com os 14 campos, as nove seções na ordem e nenhuma vazia, sem travessão e sem literal de segredo. Um desvio corrigido pelo próprio autor: o campo `veredito` da arbitragem da E11 tinha texto além de PASS; o gatekeeper pediu ao árbitro que deixasse só `PASS` (a explicação ficou em Achados).
- Árvore: conferida antes e depois de cada um dos 23 validadores e das 6 arbitragens (`git status --porcelain` e `git diff --stat`); nenhum deixou mudança rastreada além dos próprios relatórios; as mutações para provar mordida foram desfeitas com `git restore`. Desvios fora do git: `dist` e caches ignorados foram reconstruídos; o disco do Mac chegou a encher durante o Infra e CI (ENOSPC num `teste-web`, repetido depois com 665 de 665) e o gatekeeper apagou clones e clusters descartáveis do próprio scratchpad, mantendo as saídas citadas e os binários do PostgreSQL 17.6 usados pelos validadores seguintes.
- Capturas: as capturas que o validador de UX (ou a arbitragem) cita para a conferência do Rafael foram copiadas pelo gatekeeper do scratchpad para `validacao/bb0f654/capturas/`, porque o scratchpad é efêmero; os nomes são os citados em "Motivo do humano" dos relatórios.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Fazer o fluxo no painel e aprovar a frase da senha única e as confirmações (capturas em `validacao/bb0f654/capturas/`) | Rafael | texto de produto, jornada nova, mudança grande de UX e erro crítico |
| Prazo de retenção e base legal de guardar IP e user-agent de sessão (CP-10) | DPO e controlador | decisão jurídica |
| Leitor de tela nas confirmações | Rafael ou CP-32 | limite da seção 4 de `28` |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (UX): com o erro 500 real da API a tela pede "Informe o código abaixo ao suporte." e não mostra código (o painel não lê `requisicao`; defeito de todo o painel, anterior à etapa).
- Anotados (UX e Acessibilidade): a janela da senha temporária a 320x568 abre rolada e esconde "Anote agora"; o Toast cobre essa janela a 320 px e, fechado, leva o foco ao BODY; e-mails quebram no meio da palavra na lista de usuários.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (quarta rodada na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| run do CI não lido | Rafael | `gh auth login` (ou autorizar a leitura pela credencial do git) para revalidar Infra e CI |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado). Falsos verdes registrados nesta rodada (seção 11 de `28`): Segurança da E05 (refutada pela arbitragem); QA, Segurança e Red-team da E15 (confiaram no nome do caso); as rodadas 3 de E09 e E10 (os defeitos já existiam em `52952a1`).

## Rodada 3 (2026-10-15, SHA 52952a1)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael. Candidato `52952a1` (produto de `7c97881`; o diff `7c97881..52952a1` só toca `docs/roadmap-v2/`). Base do lote: `afde25c`; o que mudou desde a rodada 2: `git diff 4b96ea7..52952a1` (correção 2 e correções 3 e 4). Herança: NENHUMA dimensão herdada da rodada 2 (`impacto.mjs --herdavel` deu "NÃO herdável" em todos os relatórios PASS: o diff toca `auth/servico.ts`, as migrações 049 e 050, `componentes/comuns.tsx`, `apps/campo/package-lock.json` e `.github/workflows/verificar.yml`), por isso todas as dimensões rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas na rodada 2 (mantidas). Os agentes de dimensão do Windows (`~/.claude/agents/`) não existem no Mac: cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt do validador (`prompt-do-validador.md`, adaptado para lote e para o Mac), em sequência estrita, um por vez, sobre a árvore principal. Modelo: Opus em todas as dimensões (gatilho 5 da seção 12 de `28`, terceira rodada, e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, que rodou em Claude Sonnet 5.5 (claude-sonnet-5-5) porque é o padrão da política para LGPD não estrutural (nenhuma das cinco etapas toca manifesto, retenção ou eliminação) e a dimensão não reprovou nas rodadas 1 e 2; a primeira tentativa dela foi interrompida pelo limite de sessão da API sem gravar nada e foi refeita do zero no mesmo modelo. Os validadores receberam o bloco da etapa, só a seção Fatos dos RESUMOs (inicial e correções), a lista da evidência, as decisões da seção 9 do STATUS e D1 a D8, os VEREDITOs das rodadas 1 e 2 e o run do CI.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/52952a1/acessibilidade.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E3a | E1, E2, E3a |  | validacao/52952a1/privacidade-lgpd.md |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/52952a1/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1 | E1 |  | validacao/52952a1/red-team.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a |  | validacao/52952a1/ux.md |

### Motivo do veredito

- QA, Red-team, UX, Acessibilidade (Opus) e LGPD (Sonnet) PASS. Os FAIL da rodada 2 estão consertados: a 320 px o botão de Minha conta ocupa exatamente a área útil do cartão (41..279) e, depois de encerrar, o foco vai para a confirmação, cujo nome acessível é a frase inteira; medido em Chromium e WebKit, 320, 390 e 1280 px, claro e escuro. O e2e morde (4 falhas sem o conserto). A lista de sessões não entrega IP nem user-agent.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha 52952a1`: sem falha, 0 aviso.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| capturas `E09-*`, frases da senha única e das confirmações, decisão sobre o Esc da senha temporária | Rafael | gatilhos visuais da seção 10 (texto de produto, novo padrão visual `.botao--quebra` e prop `foco` de `Aviso`, nova jornada, fluxo de erro crítico de sessão) e a "Validação humana" da etapa |
| decidir o achado do Toast sobre a janela da senha temporária (abaixo) | Rafael | severidade de UX que dois validadores trataram como não bloqueante |
| prazo de retenção de IP e user-agent de sessão e base legal (CP-10) | Rafael e jurídico | decisão jurídica |
| leitor de tela real (VoiceOver, NVDA, TalkBack) | pessoa com leitor (CP-32) | o agente não substitui leitor de tela |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- A 320 px o Toast "Sessões encerradas" cobre por cerca de 6,4 s o botão "Já anotei a senha" da janela da senha temporária; o "Fechar" do Toast não age com a janela aberta, e tocar no texto do Toast aciona o botão escondido, fecha a janela e a senha temporária se perde (Acessibilidade reproduziu; UX e Acessibilidade classificaram como corrige antes de crescer, WCAG 2.2 2.4.11).
- Depois de um clique fora do `Modal`, o foco vai para BODY e o Esc para de funcionar até a pessoa voltar com Tab (anterior à fase, dono F10-E11).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: acessibilidade. Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade | claude-sonnet-5-5 | FAIL | media | E1, E2 | E1, E2 | | validacao/4b96ea7/acessibilidade.md |
| LGPD | privacidade-lgpd | claude-sonnet-5-5 | PASS | media | E1, E3a | E1, E3a | | validacao/4b96ea7/privacidade-lgpd.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/red-team.md |
| UX | ux | claude-sonnet-5-5 | FAIL | alta | E2, E3a | E2, E3a | | validacao/4b96ea7/ux.md |

### Motivo do veredito

- O FAIL da rodada 1 está consertado (botão do diálogo de encerrar sessões e "Mapa da cidade" a 390 px).
- UX FAIL (confiança alta) e QA FAIL: em Minha conta, a 320 px, o botão "Encerrar minhas outras sessões" (criado pela própria E09) passa cerca de 16 px da coluna, nos três motores; causa: `.botao` é `nowrap` e o conserto da rodada 1 só cobriu `.modal__rodape .botao`. O e2e de tela estreita não mede essa tela.
- Acessibilidade FAIL e QA FAIL: depois de confirmar "Encerrar minhas outras sessões" o botão some e o foco cai em `BODY` (WCAG 2.4.3), contra a DoD que pede o foco devolvido. O funcional (senha temporária única, encerrar derruba, sessões sem IP nem user-agent) passou (QA, LGPD, Red-team).

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Botão de Minha conta que quebra linha em tela estreita, e o e2e de tela estreita medindo Minha conta a 320 px.
- Depois de encerrar as outras sessões, foco num elemento que continua existindo (o título da lista ou a mensagem de confirmação).

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
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ler a frase da senha única e decidir se Esc deve fechar a janela da senha temporária (clique fora não fecha) | Rafael | texto de produto e decisão de produto (gatilhos da seção 10: superfície nova e ação destrutiva) |
| Prazo de retenção de IP e user-agent de sessão e base legal | Rafael com jurídico | decisão jurídica (CP-10) |
| Leitor de tela real nas janelas e no Toast | pessoa com leitor de tela (CP-32) | o agente não substitui leitor de tela |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.

## Rodada 1 (2026-10-13, SHA 7005a60)

Gatekeeper: sessão nova, Claude Opus 5.5 (claude-opus-5-5), consolidação em Opus por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `665b2be`, descendente que só muda `docs/roadmap-v2/STATUS.md` (lista permitida). A fase foi implementada em lote (base `afde25c`); o diff de cada etapa é o `diff-da-etapa.patch` quando existe, senão os arquivos prováveis do bloco dentro de `afde25c..7005a60`. Os `RESUMO.md` são anteriores à separação Fatos e Justificativa da D-30: foram entregues aos validadores como alegações a derrubar, nunca como prova.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LGPD | privacidade-lgpd | claude-sonnet-5-5 | PASS | alta | E1, E3a | E1, E3a | | validacao/7005a60/privacidade-lgpd.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |
| Red-team | red-team | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/red-team.md |
| UX | ux | claude-sonnet-5-5 | FAIL | alta | E2, E3a | E2, E3a | | validacao/7005a60/ux.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, privacidade-lgpd, ux (o teto cortou seguranca-aplicacao e acessibilidade). Lote: qa com E05 e E10; red-team com E05, E10 e E13; ux com E05, E07, E08, E10, E11 e E13; LGPD com E10, E11 e E17.

### Motivo do veredito

- UX FAIL pelo portão visual da seção 0 de `19` (regra inegociável do Rafael): a 390 px o botão "Encerrar sessões de Marcos Vinicius Teles" estoura o diálogo e perde a borda (captura real no SHA `e09-usuarios-confirmar-encerrar-sessoes-390-claro.png`, conferida pelo gatekeeper), e "Mapa da cidade" aparece cortado na barra inferior.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| fazer o fluxo e conferir a frase da senha única e as confirmações | Rafael | texto de produto e gatilho visual (tela nova) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- o painel abre em iframe de terceiro, sem `frame-ancestors` nem CSP
- as capturas do implementador são anteriores à correção do Toast da E13; sessões idênticas aparecem iguais na lista

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
