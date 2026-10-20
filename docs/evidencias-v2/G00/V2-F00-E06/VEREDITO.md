# VEREDITO de V2-F00-E06

Situação atual: VALIDADA COM PENDÊNCIA HUMANA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/fd17ff4/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/red-team.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/fd17ff4/testes.md |

### Motivo do veredito

- QA, Segurança, Red-team e Testes PASS (Opus). Pacote do campo 238 de 238, `test:campo` 1997 de 1997, `campo-integracao` 17 de 17 por HTTP real. O teste morde: QA (classificação de `conta_desativada`) 6 de 238; Segurança M5a 6 e M5b 2; Red-team (403 `conta_desativada` caindo em `FalhaPermanente`, numa cópia) 6 de 238; Testes 32 mutações, todas reprovam (18 no motor, 5 contra a API real, 8 no aplicativo).
- O diff da rodada não toca o código do campo (só comentário no shared); nenhum construtor de erro recebe status calculado. Sem emulador nem aparelho: o que só o aparelho prova segue humano.

### CI (job a job)

Run 39420436042 (workflow "Verificar", evento push, CI completo pedido por `[ci completo]`) sobre `55209ab`, registro do candidato: o diff `fd17ff4..55209ab` só toca `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida da seção 6 de `28`; `conferir-evidencia` confirmou), então vale como run do candidato. Lido pela API REST pública do GitHub, sem token (repositório público desde 2026-10-20): 9 de 9 jobs `success`, 9 artefatos com o SHA no nome (navegador, baseline, implantavel, produto, dependencias, restore, demonstracao, aplicativo, roadmap). Os logs e o download dos artefatos exigem token (HTTP 401) e não foram lidos; os validadores de Infra e CI conferiram os passos de cada job contra `.github/workflows/verificar.yml`. Informativo: não há run sobre `fd17ff4` em si; o run 39366804765 do candidato anterior foi reexecutado depois de o repositório virar público.

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | job 118619736871 |
| A API sobe contra Postgres real | success | QA, Banco | job 118619736336 |
| Fluxo ponta a ponta no navegador | success | QA, UX | job 118619736549 |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | job 118619736620; sem divergência explicada nas anotações |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | job 118619736536; 13 passos |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | job 118619736543; verde sobre a árvore real, sem `.npmrc`; não pega o caminho de `package-lock=false` (FAIL da E19) |
| Aplicativo de campo | success | QA, Testes | job 118619736571 |
| Pacote da demonstração | success | QA | job 118619736521 |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | job 118619736579 |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E06 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0 (com `build:shared`); `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Formato: os 67 relatórios novos da rodada conferidos por script do gatekeeper (cabeçalho com os 14 campos na ordem, veredito de uma palavra, `sha_validado` e `rodada` certos, nível obtido sem E3b, E4 ou E5, as nove seções na ordem e nenhuma vazia, sem travessão, sem literal de segredo): todos conferem. Evidência mínima: os cinco relatórios de Red-team de risco alto (E04, E06, E07, E08, E15) saíram sem a prova de que o teste morde; o gatekeeper devolveu ao próprio validador, que fez as mutações numa cópia do SHA e as gravou (vermelho com a proteção desfeita, verde restaurada, arquivo restaurado conferido com `cmp`), antes de qualquer outro validador começar.
- Árvore: conferida antes e depois de cada um dos 12 validadores e da complementação do Red-team (`git status --porcelain --untracked-files=all` e `git diff --stat`): nenhum deixou mudança rastreada nem arquivo fora de `validacao/fd17ff4/`; nenhum processo deles ficou vivo. A partir do terceiro validador as mutações foram feitas em cópias do SHA no scratchpad (`git archive`), porque uma edição na árvore foi recusada pela permissão da sessão. Os processos vivos vistos durante a rodada (`vite preview` nas portas 5811 e 5812, Chromium, vitest) eram de outra sessão do Claude, que trabalhava no worktree `.claude/worktrees/wf_249935fe-9f4-1` (ramo `trab/correcao-7`) e não tocou a árvore principal; os validadores foram avisados para não usar essas portas. O validador de Testes regravou por link simbólico o cache ignorado `apps/campo/node_modules/.cache/dc360-contagem.json`, com o mesmo valor (1997); o de Infra e CI recompilou o `dist` (ignorado) de shared, db e api.
- Capturas: as dos validadores de UX e de Acessibilidade estão em `validacao/fd17ff4/capturas/` de cada etapa (as de UX nos três motores e em larguras extras).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ver no aparelho (ou emulador) a frase da conta desativada e da sessão encerrada, a coleta preservada e subindo uma vez depois da reativação | Rafael | aparelho físico e E4 explícito na etapa |
| Aprovar as frases da faixa, do aviso, do cartão "Guardada" e da lista de hoje | Rafael | texto de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Anotado (Testes): cada camada de autoria da fila é presa por um caso só; com as duas camadas desligadas no motor a integração contra a API continua verde, porque quem recusa é o servidor.
- Anotado (Segurança): a dessincronização da E05 só atinge cliente que leia respostas em pipeline; a pilha HTTP do React Native não foi exercitada.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus (as dimensões de LGPD foram herdadas da rodada 6, em Sonnet) | feito |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: nenhuma dimensão teve vereditos opostos; onde uma etapa tem PASS e FAIL, são dimensões diferentes sobre critérios diferentes |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: nenhuma. Dimensões que reprovaram: nenhuma. Gatilhos visuais: os da rodada 6, sem novo. Tokens e tempo não gravados por dimensão (cada validador cobriu um lote de etapas; os 12 validadores e a complementação do Red-team somaram cerca de 3,7 milhões de tokens de subagente e 6 horas e 46 minutos de execução).

## Rodada 6 (2026-10-20, SHA 1ed0b71)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `1ed0b71` (correção 5 da F00); HEAD durante a validação `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida; `conferir-evidencia` confirmou). Base do lote: `afde25c`; o que mudou desde a rodada 4: `git diff bb0f654..1ed0b71`. A rodada 5 (sobre `4ce0433`) foi interrompida pelo reinício do Mac sem veredito: os relatórios dela ficaram como evidência parcial e NÃO foram herdados (não houve consolidação, conferência de formato nem registro da árvore depois de cada validador); os FAIL dela foram entregues aos validadores como pista. Herança da rodada 4 (`impacto.mjs`, com o nome da dimensão tirado do arquivo): NÃO herdável em todas as dimensões PASS, porque o diff toca o mapa de todas (`dc360/README.md`, `apps/api/src/auth/`, `apps/console/src/`, `apps/campo/src/`, `apps/api/test/`, `db/migrations/051`), salvo a Especificação da E12. Validadores: as dimensões da rodada 4 de cada etapa (as obrigatórias de `tags.mjs` pelo texto da etapa mais as acrescentadas em rodadas anteriores). Foram 18 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (75 relatórios). Modelo: Opus em todas as dimensões (gatilho 5 da seção 12, rodada acima da terceira; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo e os achados da rodada 4, a lista dos relatórios da rodada 5, as decisões e o estado do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB baixados pelo gatekeeper para o scratchpad, porque os da rodada 4 se perderam com o reinício), PGlite, Chromium e Firefox do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android nem aparelho.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/1ed0b71/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/1ed0b71/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/red-team.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/1ed0b71/testes.md |

### Motivo do veredito

- O FAIL da rodada 5 (QA: tarja de "Enviar agora" e a pausa velha) está consertado e preso por teste que morde.
- QA PASS (Opus, média): sonda com o motor real contra a API real, com os atos pelas rotas do painel: zero bloqueado, zero perdido, zero duplicado, inclusive com drenos simultâneos; a pausa velha cai ao entrar de novo, e o Perfil e o acesso suspenso param de mandar esperar sinal; 6 mutações mordem.
- Segurança PASS (Opus, média): renovação única com piso, sem laço contra servidor que disse não; autoria da fila mantida; 4 mutações mordem.
- Red-team PASS (Opus, alta): 401 e 403 não perdem item; item do Diego não sobe com a sessão da Ana; token forjado recusado com `autor_divergente`; pacote do campo 238 de 238.
- Testes PASS (Opus, média): 24 de 28 mutações viram vermelho no motor e no app, 2 de 2 contra a API real; correções 3 e 3b mordem.
- O E2E no emulador e a frase no aparelho não foram feitos (sem emulador nem aparelho): ficam como pendência humana, que é o E4 explícito da etapa.

### CI (job a job)

Run do SHA INEXISTENTE. O CI completo pedido pelo registro `7644420` (run 39366804765) não executou: o GitHub recusou os 9 jobs antes de começar, por falha de pagamento ou limite de gastos da conta (pendência humana H32, registrada no STATUS pela sessão do implementador). Além disso, o `gh` desta máquina está sem login; o gatekeeper não leu o run nem buscou token por outro caminho. Pela seção 6 de `28` ("Run inexistente: BLOCKED"), a dimensão Infra e CI fica BLOCKED onde é obrigatória (E01, E17, E18, E19, E21, E25); nas demais dimensões o run não é a evidência mínima (seção 8) e as provas foram locais.

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | não executado | QA, Testes | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| A API sobe contra Postgres real | não executado | QA, Banco | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Fluxo ponta a ponta no navegador | não executado | QA, UX | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Linha de base (baseline.mjs) em Linux | não executado | Infra e CI | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Restore do banco, Postgres 17 (CA-08) | não executado | Banco, Infra e CI | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Dependências com vulnerabilidade conhecida (auditar) | não executado | Infra e CI | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Aplicativo de campo | não executado | QA, Testes | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Pacote da demonstração | não executado | QA | run 39366804765 recusado pelo GitHub por faturamento (H32) |
| Ferramentas do roadmap e estado gerado | não executado | Infra e CI | run 39366804765 recusado pelo GitHub por faturamento (H32) |

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E06 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
- Regressão base do gatekeeper no SHA: `npm run build:shared` 0; `npm run typecheck` 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` 0. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Formato: os 75 relatórios da rodada (todas as etapas) conferidos por script: cabeçalho com os 14 campos, veredito de uma palavra, `sha_validado` e `rodada` certos, as nove seções na ordem e nenhuma vazia, sem travessão. Dois desvios corrigidos pelos próprios autores a pedido do gatekeeper: o `red-team.md` da E10 sem a seção Achados, e o `ux.md` da E24 com nível de prova E3b (revisão por pessoa, que agente não produz), corrigido para E3a.
- Árvore: conferida antes e depois de cada um dos 18 validadores e das duas correções de formato (`git status --porcelain --untracked-files=all` e `git diff --stat`); nenhum deixou mudança rastreada nem arquivo fora da própria pasta `validacao/1ed0b71/`; nenhum processo (API, Vite, Postgres, navegador) ficou vivo; as mutações para provar mordida foram desfeitas com `git restore`. Durante a rodada, outra sessão do Claude trabalhou em paralelo fora desta árvore (worktree `.claude/worktrees/wf_249935fe-9f4-1`, ramo `trab/correcao-5`, e `/private/tmp/c6-e09`); ela não tocou a árvore principal (conferido em cada passagem), e os validadores foram avisados para não confundir disputa de porta com defeito.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ver no aparelho (ou emulador) a frase da conta desativada e da sessão encerrada, a coleta preservada e subindo uma vez depois da reativação | Rafael | aparelho físico e E4 explícito na etapa |
| Aprovar as frases da faixa, do aviso, do cartão "Guardada" e da lista de hoje | Rafael | texto de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Testes: F5, F6, A9 e A12 continuam sem teste.
- Testes: `campo-integracao` depende da ordem; um caso anterior à etapa fica vermelho em 2 de 3 sementes embaralhadas.
- Red-team, anotado (decisão registrada): rebaixar o papel do agente com coleta na fila ainda bloqueia (403 `sem_permissao`); `descartar` aceita item de outro autor, por desenho.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| run do CI inexistente (H32) | Rafael | regularizar o faturamento do GitHub Actions e rodar de novo o CI completo; só então Infra e CI pode ser revalidada |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: nenhuma. Gatilhos visuais: os da rodada 4, sem novo. Tokens e tempo por validador não gravados por dimensão (cada validador cobriu um lote de etapas).

## Rodada 4 (2026-10-19, SHA bb0f654)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, entre 2026-10-18 e 2026-10-19. Candidato `bb0f654` (correção 3 da F00); HEAD durante a validação `0290af5`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 3: `git diff 52952a1..bb0f654`. Herança: NENHUMA dimensão herdada da rodada 3 (`impacto.mjs --herdavel`, com o nome da dimensão tirado do arquivo, deu "NÃO herdável" em todos os relatórios PASS: o diff toca `dc360/**` e `.github/workflows/verificar.yml`, que estão no mapa de todas as dimensões); todas rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas em rodadas anteriores (mantidas). Cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (mais as instruções comuns da rodada), em sequência estrita, um por vez, sobre a árvore principal, cobrindo uma ou mais etapas por lote e gravando um relatório por etapa. Modelo: Opus em todas as dimensões e arbitragens (gatilho 5 da seção 12 de `28`, quarta rodada; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS dos RESUMOs (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo do veredito da rodada 3, as decisões da seção 9 do STATUS e o estado do CI.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/red-team.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/bb0f654/testes.md |

### Motivo do veredito

- QA, Segurança, Red-team e Testes PASS (Opus). Segurança: o motor real do app contra a API real, com a conta desativada no meio da foto: a fila para, nada fica bloqueado e a coleta sobe uma vez só. Testes: 21 de 25 mutações reprovam, inclusive a do motor contra a API real. QA: `test:campo` 1927 de 1927, sonda própria de 9 cenários e 13 mutações que mordem. Não há emulador nesta máquina: o que só o aparelho prova ficou humano.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E06 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0 (25 afirmações). Suítes por impacto rodadas pelos validadores (ver cada relatório). Divergências conhecidas da máquina, não do produto: `openssl-do-teste` com o LibreSSL do macOS e os 4 testes de iOS que no Linux ficam pulados (na E03 a primeira virou critério, ver o VEREDITO dela).
- Formato: os 82 relatórios da rodada (todas as etapas) conferidos por script: cabeçalho com os 14 campos, as nove seções na ordem e nenhuma vazia, sem travessão e sem literal de segredo. Um desvio corrigido pelo próprio autor: o campo `veredito` da arbitragem da E11 tinha texto além de PASS; o gatekeeper pediu ao árbitro que deixasse só `PASS` (a explicação ficou em Achados).
- Árvore: conferida antes e depois de cada um dos 23 validadores e das 6 arbitragens (`git status --porcelain` e `git diff --stat`); nenhum deixou mudança rastreada além dos próprios relatórios; as mutações para provar mordida foram desfeitas com `git restore`. Desvios fora do git: `dist` e caches ignorados foram reconstruídos; o disco do Mac chegou a encher durante o Infra e CI (ENOSPC num `teste-web`, repetido depois com 665 de 665) e o gatekeeper apagou clones e clusters descartáveis do próprio scratchpad, mantendo as saídas citadas e os binários do PostgreSQL 17.6 usados pelos validadores seguintes.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ver no aparelho a frase da conta desativada na faixa e no cartão e a coleta preservada subindo depois da reativação | Rafael | aparelho físico e E4 explícito na etapa |
| Aprovar as frases da faixa, do aviso, do cartão "Guardada" e da lista de hoje | Rafael | texto de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (Testes): a tarja de "Enviar agora" manda esperar sinal com a fila pausada (sonda vermelha); F5, F6, A9 e A12 continuam sem teste.
- Anotado (QA): o "Descartar" aparece para a coleta de outro autor (já registrado).

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
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1 |  | validacao/52952a1/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/52952a1/red-team.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/52952a1/seguranca-aplicacao.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/52952a1/testes.md |

### Motivo do veredito

- QA, Segurança, Red-team e Testes PASS (Opus, confiança média, nível E1: não há emulador Android no Mac). O FAIL da rodada 2 (faixa com "Tudo sincronizado" sobre coleta pausada) está consertado e os testes mordem (`obterFila` antigo derruba 6 casos, `pausadaPor` nulo derruba 4). A sonda com o motor real cobriu os quatro códigos, 401 sem corpo e falta de token: zero item bloqueado, nenhum envio duplicado.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E06 --sha 52952a1`: sem falha, 0 aviso.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| prova em aparelho (emulador ou físico): desativar o agente com coleta na fila, ver "Conta desativada" na faixa e no cartão, reativar e ver a coleta subir uma vez | Rafael (ou validador com emulador) | a etapa pede aparelho e não há emulador nesta máquina |
| o agente de uma equipe pode anexar foto à ocorrência de outra? | Rafael | decisão de domínio, já registrada na rodada 2 |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- Com a fila pausada, "Enviar agora" no cartão da tarefa vencida (`index.tsx`, `enviarAgora`) ainda diz "sai quando ... houver sinal"; o validador de testes escreveu um caso que reprova no SHA.
- Teto por reservas: em 104 pedidos um agente reserva o teto de 1 GiB do município e a colega leva 507 mesmo depois de ele ser desativado.
- A renovação atravessa a troca de conta: o pedido repetido sai com o token de quem entrou, o servidor recusa com 409 e o item fica `bloqueado` (sem perda).
- Tipo de arquivo recusado no PUT de evidência devolve 500 em vez de 415.
- F5 e F6 do motor e A9 e A12 do aplicativo continuam sem teste.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |
| 4 (risco alto com AUTH, AUTHZ, TENANT ou RLS) | red-team, segurança e banco em Opus | feito |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: nenhuma além do script; QA rodou no emulador Android pela regra do Rafael de 2026-10-13. Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/seguranca-aplicacao.md |
| Testes | testes | claude-sonnet-5-5 | FAIL | alta | E1 | E1 | | validacao/4b96ea7/testes.md |

### Motivo do veredito

- O FAIL da rodada 1 está consertado: 403 `troca_de_senha_obrigatoria` pausa a fila sem perder item e sem oferecer Descartar, provado por mutação e no emulador Android (QA).
- QA FAIL (confiança alta), defeito novo achado no emulador: `obterFila` cria várias instâncias da fila em chamadas simultâneas, e a faixa global nunca mostra a pausa: aparece "Tudo sincronizado" sobre uma coleta parada. O remendo de QA (uma instância por dono) resolveu no emulador e não foi commitado.
- Testes FAIL (confiança alta): nenhum teste cobre `obterFila` concorrente nem renderiza a faixa ligada à fila real (os dois defeitos plantados deixam a suíte verde), e `troca-de-conta-com-pedido-em-voo` depende da ordem de execução (falha com `--randomize`).
- Segurança e Red-team (Opus) PASS na dimensão deles (token, autoria e isolamento da fila).

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- `obterFila` passa a devolver uma única instância por dono, inclusive sob chamadas simultâneas, com teste que chama em paralelo.
- Teste de componente da faixa global ligada à fila real pausada.
- `troca-de-conta-com-pedido-em-voo` independente da ordem.

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
| Rafael vê a frase e a coleta preservada no aparelho ou no emulador | emulador Android API 36.1 com o APK do SHA (capturas do QA arquivadas em `validacao/4b96ea7/anexos/`) | regra do Rafael de 2026-10-13: aparelho físico vira emulador quando o emulador prova |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Aprovar o texto das frases novas de pausa ("Defina a sua senha", "Você entrou com uma senha provisória e o envio está parado") e ver a faixa no aparelho depois do conserto | Rafael | texto de produto; iPhone não é reproduzido pelo emulador Android |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `POST` de autorizar envio de evidência sem recorte de equipe, e um token de agente reserva o teto inteiro do município em cerca de 138 pedidos (cerca de 3 s); desativar a conta não libera as reservas; depois disso os colegas recebem 507 e o dreno para por até 30 dias. Sem perda de dado (provado pelo red-team), é indisponibilidade da operação, anterior à etapa. Decisão de domínio do Rafael (o agente de uma equipe pode anexar foto ao dossiê de outra?) e conserto antes do piloto.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 4 (risco alto com AUTHZ) | red-team em Opus | PASS na dimensão; achado de indisponibilidade registrado |

### Métricas da rodada

Ver os relatórios de cada dimensão.

## Rodada 1 (2026-10-13, SHA 7005a60)

Gatekeeper: sessão nova, Claude Opus 5.5 (claude-opus-5-5), consolidação em Opus por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `665b2be`, descendente que só muda `docs/roadmap-v2/STATUS.md` (lista permitida). A fase foi implementada em lote (base `afde25c`); o diff de cada etapa é o `diff-da-etapa.patch` quando existe, senão os arquivos prováveis do bloco dentro de `afde25c..7005a60`. Os `RESUMO.md` são anteriores à separação Fatos e Justificativa da D-30: foram entregues aos validadores como alegações a derrubar, nunca como prova.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arbitragem (Opus) | arquiteto-software | claude-opus-5-5 | FAIL | alta |  |  | | validacao/7005a60/arbitragem.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1 | | validacao/7005a60/qa.md |
| Red-team | red-team | claude-opus-5-5 | FAIL | alta | E1, E2 | E1 | | validacao/7005a60/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1 | | validacao/7005a60/seguranca-aplicacao.md |
| Testes | testes | claude-sonnet-5-5 | FAIL | alta | E1 | E1 | | validacao/7005a60/testes.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, seguranca-aplicacao, testes.

### Motivo do veredito

- Testes FAIL e Red-team (Opus) FAIL, provados contra a API real e o motor real: quando quem administra redefine a senha, o agente entra com a senha provisória, o app ignora `trocaDeSenhaObrigatoria` e o dreno recebe 403 `troca_de_senha_obrigatoria`, que cai em `FalhaPermanente`: todos os itens viram `bloqueado`, o dreno não para e o cartão oferece "Descartar", que apaga coleta que o servidor nunca recebeu. Item 5 da seção 7 de `28` (perda de dado do campo), sem risco aceito. O PASS do QA era condicional a esse ponto (arbitragem: não houve conflito real).
- Red-team: se a conta troca com um item em voo, `confirmar-envio` grava `evidencia_anexada` com o autor B na trilha append-only, e `/evidencias/autorizar-envio` não confere autor (anterior à E06, vale para o G00; itens 2 e 4 da seção 7).
- Matriz do red-team: pausa em 401 de qualquer código e 403 `conta_desativada`; permanente em `troca_de_senha_obrigatoria` (defeito), `sem_permissao` e 409 `autor_divergente` (por desenho); arquivado em 409 `ja_encerrada`.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E06 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| ver a frase no aparelho e o item preservado | Rafael | aparelho físico (E4) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- pausa atribuída ao usuário errado depois de troca de conta com dreno em voo (até 60 s), sem perda de dado
- com dois drenos simultâneos, um 401 tardio faz um item já `confirmado` voltar a pendente

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 4 (risco alto com AUTHZ) | red-team em Opus | FAIL |
| 6 (vereditos opostos) | arbitragem em Opus | FAIL; o PASS do QA era condicional |

### Métricas da rodada

Ver os relatórios de cada dimensão.
