# VEREDITO de V2-F00-E15

Situação atual: VALIDADA COM PENDÊNCIA HUMANA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | BLOCKED | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1 |  | validacao/fd17ff4/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/red-team.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E2, E3a | E1, E3a | herdado de 1ed0b71, sem impacto | validacao/1ed0b71/privacidade-lgpd.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/fd17ff4/testes.md |

### Motivo do veredito

- QA, Segurança, Red-team e Testes PASS (Opus). QA: 12 de 13 mutações reprovam (a S9d sobrevive e é equivalente); Testes: 15 de 15 (diálogo, plural, botão destrutivo, resumo congelado, GPS, esquema e mensagem, inclusive contra a API real, `acolherNoAparelho` e sessão vencida); Segurança M6 4 de 16 e M6b 9 de 30; Red-team (piso de 1 m do GPS 3 de 22; diálogo sem contar rascunhos 4 de 11, numa cópia). `test:api` 1685, `test:campo` 1997, shared 223, todos verdes. Sem aparelho: os dois fluxos no aparelho seguem humanos. LGPD herdada de `1ed0b71`, sem impacto.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
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
| Fazer os dois fluxos num aparelho (diálogo de saída com vistoria começada; GPS abaixo de 0,5 m concluindo) e aprovar as frases do diálogo e "Precisão de 1 metro"; conferir que o chaveiro apaga a credencial e o disco perde o rascunho quando outro agente entra | Rafael | aparelho físico, E4 da etapa e texto de produto |
| Prazo de retenção da fila e dos arquivos no aparelho; se o agente seguinte pode ver nome e protocolo da coleta de outro (CP-24, F14-E02) | DPO | decisão jurídica |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Anotado (QA, dono F14-E02): `acolherNoAparelho` falha aberto quando a leitura do dono ou a limpeza falham.
- Anotado (Testes): o botão destrutivo é preso por um caso só; o comentário de `banco-local.ts` só se confere por leitura.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus (as dimensões de LGPD foram herdadas da rodada 6, em Sonnet) | feito |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: nenhuma dimensão teve vereditos opostos; onde uma etapa tem PASS e FAIL, são dimensões diferentes sobre critérios diferentes |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: LGPD. Dimensões que reprovaram: nenhuma. Gatilhos visuais: os da rodada 6, sem novo. Tokens e tempo não gravados por dimensão (cada validador cobriu um lote de etapas; os 12 validadores e a complementação do Red-team somaram cerca de 3,7 milhões de tokens de subagente e 6 horas e 46 minutos de execução).

## Rodada 6 (2026-10-20, SHA 1ed0b71)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `1ed0b71` (correção 5 da F00); HEAD durante a validação `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida; `conferir-evidencia` confirmou). Base do lote: `afde25c`; o que mudou desde a rodada 4: `git diff bb0f654..1ed0b71`. A rodada 5 (sobre `4ce0433`) foi interrompida pelo reinício do Mac sem veredito: os relatórios dela ficaram como evidência parcial e NÃO foram herdados (não houve consolidação, conferência de formato nem registro da árvore depois de cada validador); os FAIL dela foram entregues aos validadores como pista. Herança da rodada 4 (`impacto.mjs`, com o nome da dimensão tirado do arquivo): NÃO herdável em todas as dimensões PASS, porque o diff toca o mapa de todas (`dc360/README.md`, `apps/api/src/auth/`, `apps/console/src/`, `apps/campo/src/`, `apps/api/test/`, `db/migrations/051`), salvo a Especificação da E12. Validadores: as dimensões da rodada 4 de cada etapa (as obrigatórias de `tags.mjs` pelo texto da etapa mais as acrescentadas em rodadas anteriores). Foram 18 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (75 relatórios). Modelo: Opus em todas as dimensões (gatilho 5 da seção 12, rodada acima da terceira; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo e os achados da rodada 4, a lista dos relatórios da rodada 5, as decisões e o estado do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB baixados pelo gatekeeper para o scratchpad, porque os da rodada 4 se perderam com o reinício), PGlite, Chromium e Firefox do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android nem aparelho.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/1ed0b71/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/red-team.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E2, E3a | E1, E3a |  | validacao/1ed0b71/privacidade-lgpd.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | alta | E1 | E1 |  | validacao/1ed0b71/testes.md |

### Motivo do veredito

- O FAIL da rodada 4 (teste do botão de perigo que não conferia o botão) e os FAIL da rodada 5 estão consertados e presos por teste que morde: QA (20 mutações, nenhuma sobrevive, entre elas a S9b da arbitragem da rodada 5, sem `acolherNoAparelho` em `entrar`, que reprova 5 testes, a ordem do `entrar`, o cofre, o botão de perigo D1, o GPS e a sessão vencida), Testes (D1, E8, E9, S9b e Z1 viram vermelho), Segurança (mutações próprias no cofre mordem) e Red-team (o isolamento entre agentes provado pelo `entrar` real; envio de A por B barrado pelo filtro de autoria).
- QA PASS (Opus, alta), Segurança PASS (Opus, média), Red-team PASS (Opus, alta), Testes PASS (Opus, alta), LGPD PASS (Sonnet, média). O chaveiro e o apagamento físico no disco só um aparelho prova: pendência humana, que é o E4 da etapa.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
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
| Fazer os dois fluxos num aparelho (diálogo de saída com vistoria começada; GPS abaixo de 0,5 m concluindo) e aprovar as frases do diálogo e "Precisão de 1 metro"; conferir que o chaveiro apaga a credencial e o disco perde o rascunho quando outro agente entra | Rafael | aparelho físico, E4 da etapa e texto de produto |
| Prazo de retenção da fila e dos arquivos no aparelho; se o agente seguinte pode ver nome e protocolo da coleta de outro (CP-24, F14-E02) | DPO | decisão jurídica |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- LGPD (bloqueio de piloto, sem risco aceito, já registrado; dono V2-F14-E02): `acolherNoAparelho` falha aberto, reproduzido no SHA: se a limpeza falha, o agente seguinte vê o rascunho do anterior, com o nome do morador, e vira o dono.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| run do CI inexistente (H32) | Rafael | regularizar o faturamento do GitHub Actions e rodar de novo o CI completo; só então Infra e CI pode ser revalidada |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: nenhuma. Gatilhos visuais: os da rodada 4, sem novo. Tokens e tempo por validador não gravados por dimensão (cada validador cobriu um lote de etapas).

## Rodada 4 (2026-10-19, SHA bb0f654)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, entre 2026-10-18 e 2026-10-19. Candidato `bb0f654` (correção 3 da F00); HEAD durante a validação `0290af5`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 3: `git diff 52952a1..bb0f654`. Herança: NENHUMA dimensão herdada da rodada 3 (`impacto.mjs --herdavel`, com o nome da dimensão tirado do arquivo, deu "NÃO herdável" em todos os relatórios PASS: o diff toca `dc360/**` e `.github/workflows/verificar.yml`, que estão no mapa de todas as dimensões); todas rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas em rodadas anteriores (mantidas). Cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (mais as instruções comuns da rodada), em sequência estrita, um por vez, sobre a árvore principal, cobrindo uma ou mais etapas por lote e gravando um relatório por etapa. Modelo: Opus em todas as dimensões e arbitragens (gatilho 5 da seção 12 de `28`, quarta rodada; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS dos RESUMOs (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo do veredito da rodada 3, as decisões da seção 9 do STATUS e o estado do CI.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/red-team.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | FAIL | alta | E1 | E1 |  | validacao/bb0f654/testes.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E2, E3a | E1, E2, E3a |  | validacao/bb0f654/privacidade-lgpd.md |
| Arbitragem | arbitragem (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1 |  | validacao/bb0f654/arbitragem.md |

### Motivo do veredito

- Testes FAIL contra QA, Segurança, Red-team e LGPD PASS: conflito arbitrado em Opus, FAIL com confiança alta. Critério decisivo: o bloco manda que o diálogo "usa o botão destrutivo" e que "os 7 casos passam", e a seção 8 de `28` exige teste que morda em risco alto. O caso "o botão de confirmar é o de perigo, porque o ato apaga" (`apps/campo/src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx:185`) não confere o tipo do botão: trocando `destrutiva: false` em `perfil.tsx`, o jest inteiro deu 1927 de 1927 e o tsc 0 (reproduzido pelo validador e pelo árbitro, desfeito com `git restore`). Hoje o botão é o de perigo, mas nada prova isso (nenhuma captura, snapshot ou portão). Os três PASS confiaram no nome do caso.
- Conserto mínimo: o caso conferir o tipo `perigo` (ou `destrutiva`) do botão e morder na mutação; E8 continua sem teste (corrigir junto).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
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
| Fazer os dois fluxos num aparelho (diálogo de saída com vistoria começada; GPS abaixo de 0,5 m concluindo) e aprovar as frases do diálogo e "Precisão de 1 metro" | Rafael | aparelho físico, E4 da etapa e texto de produto |
| Prazo de retenção da fila e dos arquivos no aparelho; se o agente seguinte pode ver nome e protocolo da coleta de outro (CP-24, F14-E02) | DPO | decisão jurídica |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Bloqueio de piloto, fora do critério da E15 (seção 7, item 3, sem risco aceito), reproduzido por Red-team, Segurança e LGPD: `acolherNoAparelho` (`apps/campo/src/dados/banco-local.ts:255`) falha aberto: a limpeza que falha no meio devolve `apagou: true`, carimba o novo dono e deixa o rascunho do agente anterior (texto do morador, coordenada, nome) para o seguinte. O bloco da V2-F14-E02 ainda não tem critério de falha fechada nem injeção de falha. Precisa de dono e de bloco antes do piloto: decisão de Rafael.
- Anotado (Segurança e Red-team): `gpsPrecisaoMetrosSchema` (`packages/shared/src/schemas.ts:369`) aceita `Infinity` e o laudo imprime "Infinity metros" (anterior à etapa); o piso de precisão mora só no app.
- Corrige antes de crescer (Testes e arbitragem): E9 sem teste; E2 anotado para a F14-E02.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (quarta rodada na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| 6 (vereditos opostos entre validadores da etapa) | arbitragem em Opus com os relatórios | ver `validacao/bb0f654/arbitragem.md` e o motivo acima |
| seção 7, item 3, fora do critério | Rafael | `acolherNoAparelho` falha aberto: precisa de dono e bloco antes do piloto |
| run do CI não lido | Rafael | `gh auth login` (ou autorizar a leitura pela credencial do git) para revalidar Infra e CI |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado). Falsos verdes registrados nesta rodada (seção 11 de `28`): Segurança da E05 (refutada pela arbitragem); QA, Segurança e Red-team da E15 (confiaram no nome do caso); as rodadas 3 de E09 e E10 (os defeitos já existiam em `52952a1`).

## Rodada 3 (2026-10-15, SHA 52952a1)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael. Candidato `52952a1` (produto de `7c97881`; o diff `7c97881..52952a1` só toca `docs/roadmap-v2/`). Base do lote: `afde25c`; o que mudou desde a rodada 2: `git diff 4b96ea7..52952a1` (correção 2 e correções 3 e 4). Herança: NENHUMA dimensão herdada da rodada 2 (`impacto.mjs --herdavel` deu "NÃO herdável" em todos os relatórios PASS: o diff toca `auth/servico.ts`, as migrações 049 e 050, `componentes/comuns.tsx`, `apps/campo/package-lock.json` e `.github/workflows/verificar.yml`), por isso todas as dimensões rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas na rodada 2 (mantidas). Os agentes de dimensão do Windows (`~/.claude/agents/`) não existem no Mac: cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt do validador (`prompt-do-validador.md`, adaptado para lote e para o Mac), em sequência estrita, um por vez, sobre a árvore principal. Modelo: Opus em todas as dimensões (gatilho 5 da seção 12 de `28`, terceira rodada, e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, que rodou em Claude Sonnet 5.5 (claude-sonnet-5-5) porque é o padrão da política para LGPD não estrutural (nenhuma das cinco etapas toca manifesto, retenção ou eliminação) e a dimensão não reprovou nas rodadas 1 e 2; a primeira tentativa dela foi interrompida pelo limite de sessão da API sem gravar nada e foi refeita do zero no mesmo modelo. Os validadores receberam o bloco da etapa, só a seção Fatos dos RESUMOs (inicial e correções), a lista da evidência, as decisões da seção 9 do STATUS e D1 a D8, os VEREDITOs das rodadas 1 e 2 e o run do CI.

Veredito da rodada: **BLOCKED**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E3a | E1, E3a |  | validacao/52952a1/privacidade-lgpd.md |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1 |  | validacao/52952a1/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/52952a1/red-team.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1 |  | validacao/52952a1/seguranca-aplicacao.md |
| Testes | testes (general-purpose) | claude-opus-5-5 | PASS | media | E1 | E1 |  | validacao/52952a1/testes.md |

### Motivo do veredito

- QA, Segurança, Red-team, Testes (Opus) e LGPD (Sonnet) PASS no que é da etapa: "Entrar de novo" preserva o rascunho, o GPS tem piso de 1 m e o esquema recusa 0 e negativo; as mutações mordem.
- BLOQUEADA pela conferência mecânica de evidência (fail-closed): o `INDEX.md` não bate com o conteúdo commitado. Recomendação para a rodada 4: o conserto é só recalcular o `INDEX.md`, caminho que não está no mapa de impacto de nenhuma dimensão; com o diff restrito a isso, as dimensões PASS desta rodada são herdáveis (`impacto.mjs --herdavel`).
- Fora do critério da etapa, mas item 3 da seção 7 de `28` (sem risco aceito) e bloqueio de piloto: `acolherNoAparelho` falha aberto entre pessoas. Nesta rodada a Segurança achou uma forma nova: quando a limpeza falha no meio, a função devolve `apagou: true` com o rascunho ainda no disco, e a pessoa seguinte vê e envia o rascunho como seu; o LGPD confirmou que as fotos e a assinatura somem e o texto do morador (observação de saúde, nome, coordenada) fica exposto. Quatro validadores concordam que não é critério da E15 (o bloco diz "a etapa só avisa, não muda a regra"; dono F14-E02). O bloco da F14-E02 não pede falha fechada nem injeção de falha de disco: precisa ser acrescentado.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha 52952a1`: FALHA indice: o `INDEX.md` não bate com o conteúdo commitado (saidas/baseline-depois/06-test-campo.txt; e `VEREDITO.md`, que é do gatekeeper e não deveria estar no INDEX). Causa conferida pelo gatekeeper e por dois validadores: as saídas foram gravadas no Windows com fim de linha misto, o hash foi calculado sobre o arquivo do disco e o git normalizou o conteúdo para LF no commit; a conferência só passou na rodada 2 porque rodou na árvore de trabalho do Windows. Num checkout novo (Mac, Linux) a evidência arquivada não tem integridade verificável. Pela regra fail-closed, a etapa fica BLOQUEADA até o `INDEX.md` ser recalculado sobre o conteúdo commitado (com nota datada) e reconferido.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| fazer os dois fluxos num aparelho: "Sair da conta" com vistoria começada e conclusão com GPS abaixo de 0,5 m sem 422; aprovar "Precisão de 1 metro" | Rafael | "Validação humana" da etapa (E4) e não há emulador |
| quando entra a correção de `acolherNoAparelho` e o acréscimo de falha fechada ao bloco da F14-E02 | Rafael | prioridade antes do piloto |
| base legal, prazo de guarda do dado de coleta e aviso de privacidade | Rafael e jurídico | decisão jurídica |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `acolherNoAparelho` falha aberto (acima; item 3 da seção 7, dono F14-E02, antes do piloto).
- E2, E8 e E9 dos testes da rodada 2 sobrevivem; E8 (disco ilegível tratado como "nada a perder") é a prioritária.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: seguranca-aplicacao e red-team em Opus (opus revisa, risco alto). Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arbitragem (Opus) | arquiteto-software | claude-opus-5-5 | PASS | media |  |  | | validacao/4b96ea7/arbitragem.md |
| LGPD | privacidade-lgpd | claude-sonnet-5-5 | PASS | media | E1, E3a | E1, E3a | | validacao/4b96ea7/privacidade-lgpd.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | media | E1, E2 | E1 | | validacao/4b96ea7/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1 | | validacao/4b96ea7/seguranca-aplicacao.md |
| Testes | testes | claude-sonnet-5-5 | PASS | media | E1 | E1 | | validacao/4b96ea7/testes.md |

### Motivo do veredito

- QA, Testes, LGPD, Segurança e Red-team (Opus) PASS. O FAIL da rodada 1 está consertado: "Entrar de novo" na vistoria com sessão vencida preserva rascunho, foto e assinatura, com o teste novo mordendo nos três pontos em que o defeito voltaria.
- Arbitragem em Opus (gatilho 9, risco residual escalado pelo red-team): `acolherNoAparelho` falha aberto se o SQLite falhar na troca de pessoa (o agente B passa a ver o rascunho do agente A e a marca de dono vira de B). O defeito é anterior à F00 (`5ecdf4c`), a etapa não muda essa regra e o dono é a F14-E02. Por ser item 3 da seção 7 de `28`, NÃO admite risco aceito: tem de ser corrigido antes de qualquer piloto (registrado no G00 e em `pendencias-humanas.md` como bloqueio de piloto, não da etapa).

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
| Fazer os dois fluxos em aparelho físico (sair com vistoria começada lendo o diálogo; concluir com GPS) e aprovar "Precisão de 1 metro" | Rafael | aparelho físico: o emulador Android não fechou o fluxo de concluir com foto por causa do defeito da E16, e iPhone não é reproduzível aqui; texto de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `acolherNoAparelho` falha aberto (acima): corrigir antes do piloto, sem risco aceito (item 3).
- Três mutações sobrevivem, num código que hoje está certo: disco ilegível ao perguntar a saída tratado como "nada a perder" (é a promessa que antes apagava vistoria: teste a escrever com prioridade), dono nulo que passaria a apagar, e item bloqueado fora da contagem do diálogo (Testes).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 9 (risco residual: falha aberta entre pessoas) | arbitragem em Opus (arquiteto-software) | PASS da etapa, achado sem risco aceito com dono F14-E02 |

### Métricas da rodada

Ver os relatórios de cada dimensão.

## Rodada 1 (2026-10-13, SHA 7005a60)

Gatekeeper: sessão nova, Claude Opus 5.5 (claude-opus-5-5), consolidação em Opus por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `665b2be`, descendente que só muda `docs/roadmap-v2/STATUS.md` (lista permitida). A fase foi implementada em lote (base `afde25c`); o diff de cada etapa é o `diff-da-etapa.patch` quando existe, senão os arquivos prováveis do bloco dentro de `afde25c..7005a60`. Os `RESUMO.md` são anteriores à separação Fatos e Justificativa da D-30: foram entregues aos validadores como alegações a derrubar, nunca como prova.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LGPD | privacidade-lgpd | claude-sonnet-5-5 | PASS | media | E3a, E1 | E1, E3a | | validacao/7005a60/privacidade-lgpd.md |
| QA | qa | claude-sonnet-5-5 | FAIL | media | E1, E2 | E1, E3a | | validacao/7005a60/qa.md |
| Testes | testes | claude-sonnet-5-5 | FAIL | alta | E1 | E1, E2 | | validacao/7005a60/testes.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, privacidade-lgpd, testes.

### Motivo do veredito

- QA FAIL e Testes FAIL (provado por execução com sessão, banco e tela reais): na tela da vistoria, o botão "Sair e entrar de novo" da sessão encerrada (`apps/campo/src/app/.../vistoria/[id].tsx:1413`) chama `sair()`, que apaga rascunho, foto e assinatura sem avisar, enquanto a lista de tarefas e a fila usam `encerrarSessaoVencida`, que preserva tudo. Contradiz o objetivo da etapa ("o agente deixa de perder vistoria começada ao sair da conta sem ser avisado").
- `vistoria-ainda-nao-baixada.test.tsx:244` exige `sair`: o teste trava o comportamento errado e precisa ser reescrito com registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| fazer os dois fluxos num aparelho | Rafael | aparelho físico (E4) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- a fila e os arquivos dela (envelope com CPF e coordenada, fotos, assinatura) ficam no aparelho sem prazo, inclusive depois que outro agente entra (LGPD)
- JPEG e PNG de coleta já enviada ou descartada só saem no logout; o original da câmera no cache nunca é apagado
- coordenada guardada com 6 casas; resíduo de WAL

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
