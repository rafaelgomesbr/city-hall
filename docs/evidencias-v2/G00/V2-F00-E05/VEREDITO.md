# VEREDITO de V2-F00-E05

Situação atual: VALIDADA COM PENDÊNCIA HUMANA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 2026-10-24 | 60cbc2f | c680f8d (run 39524190207, 12 de 12 verdes) | PASS | 8832367 | 0b32d38 | 60cbc2f |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | BLOCKED | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 8 (2026-10-24, SHA 60cbc2f)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Rodada 8 RETOMADA: a primeira tentativa (2026-10-20) foi interrompida pelo reinício do Mac depois do primeiro validador; o relatório de QA da E05 sobre `60cbc2f`, do mesmo SHA, foi preservado em `bc3c535` e aproveitado; os demais validadores rodaram nesta sessão. Candidato `60cbc2f` (correção 7 da F00); HEAD durante a validação `bc3c535`, que só difere em `STATUS.md`, `ESTADO-ATUAL.md` e `validacao/60cbc2f/qa.md` da E05 (lista permitida; `conferir-evidencia` confirmou). Política: D-31 (seção 19 de `28`): validação POR DIFERENÇA (item 4), achado só reprova pelas condições (a), (b) ou (c) do item 1, modelo de ameaça da E05 e da E19 no item 2, CI como prova padrão (item 5), Sonnet como validador padrão e Opus em Segurança e Red-team da E05 e na consolidação (item 6). O que mudou desde a rodada 7: `git diff fd17ff4..60cbc2f` (guarda de códigos de erro da API e do console, catálogo do shared, foco e bordas fixas do painel, `app.css`, ofício, `auditar.mjs` e `auditar-excecoes.mjs`, `ambiente-hostil.mjs`, três testes do aplicativo de campo, `baseline.mjs` (só totais), README, COLOCAR-DE-PE, LEIA-ME do campo e `verificar.yml` com os jobs `windows` e `plataformas`). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (as seções antes de `## Justificativa`, extraídas pelo gatekeeper), a evidência, os relatórios da rodada 7 como pista, as decisões e o run do CI. Ambiente: Mac, Node 24.15.0 (o CI e o `.nvmrc` usam 22; os validadores da E05 baixaram o Node 22.23.3 para o scratchpad), PostgreSQL local, Chromium, Firefox e WebKit do Playwright; sem aparelho, sem emulador e sem Windows local.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/60cbc2f/qa.md (gravado na primeira tentativa da rodada, preservado em `bc3c535`) |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/60cbc2f/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/60cbc2f/red-team.md |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | herdado de 1ed0b71, sem impacto | validacao/1ed0b71/banco-de-dados.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a | herdado de fd17ff4: as telas da E05 não mudaram; o E2E da seção 23 está verde no job 118974893838 | validacao/fd17ff4/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 | herdado de fd17ff4, idem | validacao/fd17ff4/acessibilidade.md |

### Motivo do veredito

- QA PASS (Sonnet, alta), Segurança PASS (Opus, alta) e Red-team PASS (Opus, média), concordantes e independentes, por HTTP real e socket cru, na API e no console, nos modos de teste e de produção, em Node 22.23.3 e 24.15.0. O defeito da rodada 7 está consertado: com `content-length` menor ou maior que o corpo em stream, `Response` e `ReadableStream`, com 403 forjado dentro e segundo pedido em pipeline, 0 escaparam e 0 dessincronizaram (64 variantes no QA); o trailer com código fora do catálogo não derruba mais o processo; o 1xx como resposta final vira desvio (500) com o pedido seguinte sincronizado; Early Hints com CR ou LF são recusadas igual em Node 22 e 24.
- As sondas mordem: a mesma sonda contra a guarda de `fd17ff4` escapa e dessincroniza (QA em 12 variantes, Red-team pelas Early Hints em Node 22) e as mutações que desfazem as correções 6, 7 e 7b deixam os testes novos vermelhos.
- Segurança e Red-team: `/auth/entrar` não distingue conta desativada (corpo e cabeçalhos idênticos); recurso de outro município responde 404 idêntico ao inexistente, nunca 403 (170 rotas, 8 identidades, 2040 pedidos por execução, zero código fora do contrato, zero 500); 300 conexões derrubadas sem queda do processo.
- Nenhum achado cumpre (a), (b) ou (c) do item 1 da D-31. A DV-01 (valor de cabeçalho com `toString` mutável) segue dívida pelo item 2 (exige código hostil dentro da rota) e nenhum validador achou caminho de cliente externo até ela.

### CI (job a job)

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | job 118974893692, Node 22.23.3 |
| Windows (auditar, test:scripts e conferir:numeros) | success | Infra e CI | job 118974893833; `test:scripts` 353 (349 aprovados, 4 pulados de iOS), números batem |
| Fluxo ponta a ponta no navegador | success | QA, UX | job 118974893838 |
| Aplicativo de campo | success | QA, Testes | job 118974893844; `expo-doctor` com a checagem de versões pulada por desenho |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | job 118974893889 |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | job 118974893919; verde em 2026-10-21; HOJE o `auditar` sai 1 sobre o mesmo lockfile (ver E19) |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | job 118974893942 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em ubuntu-latest | success | QA, Infra e CI | job 118974893948 |
| A API sobe contra Postgres real | success | QA, Banco | job 118974893974 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em windows-latest | success | QA, Infra e CI | job 118974894002, PowerShell 5.1 e Git Bash |
| Pacote da demonstração | success | QA | job 118974894032 |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | job 118974894086 |

Run 39524190207 (workflow "Verificar", push com `[ci completo]`, criado em 2026-10-21T00:55Z) sobre `c680f8d`, registro do candidato: o diff `60cbc2f..c680f8d` só toca `STATUS.md` e `ESTADO-ATUAL.md`, então vale como run do candidato. Lido pela API pública sem token; os validadores leram os logs com `gh` e o token tirado de `git credential fill`, sem imprimi-lo.

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha 60cbc2f`: sem falha (INDEX.md SHA-256 a SHA-256, lista permitida, regras commitadas, segredos, travessão). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 89 INDEX.md, 4793 arquivos conferidos byte a byte, OK.
- Regressão base do gatekeeper no SHA (Mac, Node 24.15.0): `npm run typecheck` código 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0. O kit completo indicado por `impacto.mjs fd17ff4..60cbc2f` (a guarda da API não tem regra no mapa) é o do CI completo deste SHA, 12 de 12 verdes (D-31, item 5).
- Formato: os relatórios desta rodada conferidos à mão pelo gatekeeper (cabeçalho com os 14 campos, `sha_validado` 60cbc2f, `rodada` 8, as nove seções na ordem, "Tentativas de reprovar" e "Não verificado" preenchidas); todos conferem.
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`): nenhum deixou mudança rastreada nem arquivo fora de `validacao/60cbc2f/`; mutações e sondas foram feitas em cópias do SHA (`git archive`) no scratchpad.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Leitor de tela nas três frases | Rafael ou avaliação externa (CP-32) | o agente não substitui VoiceOver nem NVDA |
| Aprovar as três frases da tela de entrada e as do console (capturas em `validacao/fd17ff4/capturas/`, telas sem mudança desde então) | Rafael | texto de produto, fluxo de erro crítico e tela pública |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (as novas desta rodada entram lá no próximo commit de implementador, porque o arquivo está fora da lista permitida do registro).

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Dívida (QA da E05 e QA da E22, concordantes): o README (seção da API) e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` não escrevem o modelo de ameaça da guarda (item 2 da D-31) nem citam a DV-01. Não é promessa falsa alcançável: para os valores comuns a frase vale. Dono sugerido: V2-F02-E03, com a DV-01, ou uma linha no README agora. Registrar em `dividas.md` no próximo commit de implementador.
- Dívida (Segurança): `chavesErro` (regex `CHAVE_JSON`, `apps/api/src/guarda-de-codigos-de-erro.ts` perto da linha 177, e a cópia do console perto da linha 84) custa tempo quadrático no tamanho do corpo: um 403 de 60 KB de aspas escapadas bloqueia o laço de eventos por cerca de 1,1 s. Não é (b): nenhum corpo 401 ou 403 do produto carrega texto do cliente (todas as mensagens são fixas). Vira item de `dividas.md`, dono V2-F02-E03, antes de qualquer rota que ecoe texto do pedido numa recusa.
- Anotado (Segurança): a renovação com token de renovação já revogado da própria conta responde 403 `conta_desativada`; revela um bit a quem tem credencial emitida àquela conta, por desenho da correção 1. Token desconhecido segue 401 `sessao_encerrada`.
- Anotado (QA): `Response` com status 200 depois de `reply.code(403)` sai 200 (não é resposta de acesso).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet, salvo Segurança e Red-team da E05 em Opus | feito |
| nenhum | n/a | n/a |

### Métricas da rodada

Validadores desta etapa: 3 (QA na primeira tentativa, Segurança e Red-team nesta sessão; cerca de 17, 8 e 7 minutos para Segurança e Red-team). Achados: 0 bloqueiam, 2 dívidas novas, 2 anotados. Dimensões herdadas: Banco, UX e Acessibilidade. Gatilhos visuais: nenhum.

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/red-team.md |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | herdado de 1ed0b71, sem impacto | validacao/1ed0b71/banco-de-dados.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a |  | validacao/fd17ff4/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/fd17ff4/acessibilidade.md |

### Motivo do veredito

- QA FAIL, Segurança FAIL e Red-team FAIL (Opus, alta), concordantes e reproduzidos de forma independente, cada um por HTTP real e socket cru, na API e no console, nos modos "falhar" e "corrigir": um 403 com código fora do catálogo sai no fio pela API PÚBLICA do Fastify, sem `.raw`, sem `hijack` e sem nome interno. A rota declara `content-length` menor que o corpo (`reply.code(200).header("content-length", "2" ou "0").send(stream)`, também com `Response` e `ReadableStream` da web) e os bytes que sobram são lidos, por quem faz pipeline na mesma conexão, como a resposta seguinte: `403 {"erro":"inventado..."}`, com o 401 verdadeiro sobrando como terceira resposta. Zero desvio registrado, `tsc` 0, varredura e testes da guarda verdes (337 na API, 229 no console). É dessincronização de resposta (classe CWE-444).
- Isso desmente `dc360/README.md` (seção da API) e o cabeçalho de `packages/shared/src/codigos-de-erro.ts`, que dizem que esse caminho só se alcança pelo estado interno do Node e que a varredura o reprova, e viola o teste negativo da etapa ("código fora do catálogo reprova o teste de catálogo").
- Alcance real, concordante nos três: NENHUMA rota do produto manda stream com `content-length` (só `rotas/saida.ts` manda stream, com 200 e sem `content-length`), e o cliente do Node e os navegadores descartam os bytes que sobram: não é explorável de fora neste SHA. É defeito latente do controle e documentação que promete mais do que entrega.
- O FAIL da rodada 6 (status fracionário) está consertado: NaN, texto, getter, setter, 403.5, 401.9, "403.2", HTTP/1.0 e keep-alive são pegos. A resistência a enumeração de `/auth/entrar` continua (corpo e cabeçalhos idênticos nos quatro casos, medianas de 242 a 243 ms).
- UX PASS e Acessibilidade PASS (as três frases certas nos três motores e no zoom de 200%; contraste de 4,75 ou mais; 0 violação no axe). Banco herdado de `1ed0b71`, sem impacto.
- Conserto mínimo apontado (não implementado): `strictContentLength` na resposta envolvida pela guarda, ou a porta dos bytes contar o corpo contra o `content-length` da cabeça final; casos de teste com stream, `Response`, `ReadableStream` e `content-length: 0`, na API e no console; README e cabeçalho do catálogo alinhados ao que a guarda de fato garante. Esta etapa tem origem BZ-F:P0-SEG: o critério não admite risco aceito (item 2 da seção 7 de `28`).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
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
| Leitor de tela nas três frases | Rafael ou avaliação externa (CP-32) | o agente não substitui VoiceOver nem NVDA |
| Aprovar as três frases da tela de entrada e as do console nas capturas desta rodada (`validacao/fd17ff4/capturas/ux-E05-entrada-expirou-390-claro-chromium.png`, `ux-E05-entrada-encerrada-390-claro-chromium.png`, `ux-E05-entrada-desativada-390-escuro-webkit.png`, `ux-E05-entrada-desativada-tenta-entrar-390-claro-firefox.png`) | Rafael | texto de produto, fluxo de erro crítico e tela pública |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (QA e Segurança): com `reply.trailer(...)` e código fora do catálogo, a guarda chama `writeHead` com `content-length` numa resposta com trailer, o Node lança `ERR_HTTP_TRAILER_INVALID` fora de `try` e, sem tratador de último recurso, o processo cai no modo de produção (`exit=1`); na via do Red-team virou 500. Nenhuma rota usa trailer hoje.
- Anotado (Segurança): `reply.code(1xx)` como resposta final dessincroniza a conexão pela API pública; a varredura não reprova.
- Corrige antes de crescer (Acessibilidade e UX, anterior à fase): na tela de entrada, depois da recusa enviada pelo botão, o foco cai em BODY nos três motores (o mesmo padrão que a E09 consertou nas telas de senha).
- Corrige antes de crescer (Acessibilidade, anterior à fase): até 600 px o link do topo para Minha conta não tem nome acessível (axe `link-name`).
- Anotado (UX): "Email ou senha inválidos." no painel e "Email ou senha incorretos." no console; a 390 px o título da entrada deixa "360" sozinho na segunda linha; a faixa de conta desativada convive com a frase de erro de digitação.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus (as dimensões de LGPD foram herdadas da rodada 6, em Sonnet) | feito |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: nenhuma dimensão teve vereditos opostos; onde uma etapa tem PASS e FAIL, são dimensões diferentes sobre critérios diferentes |
| item 2 da seção 7 de `28` (origem BZ-F:P0-SEG) | Rafael | o critério não admite risco aceito; conserto numa sessão de implementador |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: Banco. Dimensões que reprovaram: QA, Segurança, Red-team. Gatilhos visuais: os da rodada 6, sem novo. Tokens e tempo não gravados por dimensão (cada validador cobriu um lote de etapas; os 12 validadores e a complementação do Red-team somaram cerca de 3,7 milhões de tokens de subagente e 6 horas e 46 minutos de execução).

## Rodada 6 (2026-10-20, SHA 1ed0b71)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `1ed0b71` (correção 5 da F00); HEAD durante a validação `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida; `conferir-evidencia` confirmou). Base do lote: `afde25c`; o que mudou desde a rodada 4: `git diff bb0f654..1ed0b71`. A rodada 5 (sobre `4ce0433`) foi interrompida pelo reinício do Mac sem veredito: os relatórios dela ficaram como evidência parcial e NÃO foram herdados (não houve consolidação, conferência de formato nem registro da árvore depois de cada validador); os FAIL dela foram entregues aos validadores como pista. Herança da rodada 4 (`impacto.mjs`, com o nome da dimensão tirado do arquivo): NÃO herdável em todas as dimensões PASS, porque o diff toca o mapa de todas (`dc360/README.md`, `apps/api/src/auth/`, `apps/console/src/`, `apps/campo/src/`, `apps/api/test/`, `db/migrations/051`), salvo a Especificação da E12. Validadores: as dimensões da rodada 4 de cada etapa (as obrigatórias de `tags.mjs` pelo texto da etapa mais as acrescentadas em rodadas anteriores). Foram 18 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (75 relatórios). Modelo: Opus em todas as dimensões (gatilho 5 da seção 12, rodada acima da terceira; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo e os achados da rodada 4, a lista dos relatórios da rodada 5, as decisões e o estado do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB baixados pelo gatekeeper para o scratchpad, porque os da rodada 4 se perderam com o reinício), PGlite, Chromium e Firefox do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android nem aparelho.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | BLOCKED | media | E1, E2 | E1 |  | validacao/1ed0b71/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/red-team.md |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/banco-de-dados.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a |  | validacao/1ed0b71/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/1ed0b71/acessibilidade.md |

### Motivo do veredito

- QA FAIL (Opus, alta) e Red-team FAIL (Opus, alta), concordantes, reproduzidos de forma independente: a guarda em tempo de execução, que `dc360/README.md:148-151` e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` apresentam como a GARANTIA de que toda resposta 401 ou 403 tem código do catálogo, só reconhece status exatamente 401 ou 403. Um status fracionário passa por ela e o Node o trunca ao responder: `throw new RegraDeNegocio("vazou_meio", "x", 403.5)` plantado em `apps/api/src/rotas/orgaos.ts` sai como `403 {"erro":"vazou_meio"}` por HTTP real, nos modos "falhar" e "corrigir", com 0 desvio, `tsc` 0, varredura e prova dinâmica verdes (172 de 172). O QA mostrou o mesmo com `reply.code(403.5)`, `reply.code(401.9)`, `reply.code("403.2")` e no console. Viola o teste negativo da etapa ("código fora do catálogo reprova o teste de catálogo") e desmente a documentação.
- Segurança BLOCKED (Opus, média): rodou as suítes do repositório (API 243 de 243, console 15 de 15; com a guarda desligada 54 de 71 falham; os 17 escapes arquivados da rodada 5 são pegos) mas não executou a tentativa independente de escape pedida; não contradiz o FAIL.
- Banco PASS (Opus, alta: a 048 aplica do zero e sobre banco existente, mutação morde), UX PASS e Acessibilidade PASS (as três frases certas pelos fluxos reais, 1280, 390 e 320 px, dois temas, zoom de 200%).
- O FAIL da rodada 4 (teste de catálogo que não mordia código novo) está consertado pela guarda: as formas da rodada 5 (reatribuir `.erro`, `hijack` com `raw`, `flushHeaders`) são pegas por HTTP real. Escrita direto no socket escapa da guarda, como a documentação admite, e a varredura reprova `.socket`.
- Conserto mínimo apontado (não implementado): a guarda compara o status como o Node o enviará (truncado), ou `RegraDeNegocio` e `reply.code` recusam status não inteiro; caso de status fracionário no teste da guarda, na API e no console; README e cabeçalho do catálogo alinhados.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
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
| Aprovar as três frases da tela de entrada e as mensagens do catálogo (capturas em `validacao/1ed0b71/capturas/`) | Rafael | texto de produto, fluxo de erro crítico e tela pública (seção 10 de `28`) |
| Leitor de tela nas três frases | Rafael ou avaliação externa (CP-32) | o agente não substitui VoiceOver nem NVDA |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- UX: depois da recusa da entrada o foco vai para BODY (o botão fica desabilitado enquanto envia), em Chromium; a frase tem `role="alert"`. Anterior à etapa, do mesmo tipo que a E09 tratou nas telas de senha.
- Segurança: `README.md:150-151` diz que a guarda garante a regra, e um parágrafo adiante na mesma seção diz que a garantia vem primeiro da varredura do código; alinhar.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 6 aparente (Segurança BLOCKED, Banco, UX e A11y PASS, QA e Red-team FAIL) | não acionada | não há prova oposta sobre o mesmo caminho: a Segurança não executou a tentativa de escape, e Banco, UX e A11y avaliam outros critérios |
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
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | media | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/seguranca-aplicacao.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/red-team.md |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/banco-de-dados.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a |  | validacao/bb0f654/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/acessibilidade.md |
| Arbitragem | arbitragem (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/arbitragem.md |

### Motivo do veredito

- QA FAIL contra Segurança, Red-team, Banco, UX e Acessibilidade PASS: conflito arbitrado em Opus, FAIL com confiança alta. Critério decisivo, teste negativo da etapa: "código fora do catálogo reprova o teste de catálogo". O servidor responde 403 `posto_insuficiente` (`apps/api/src/servidor.ts:610`), fora de `packages/shared/src/codigos-de-erro.ts`; também saem fora da lista `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura`. Com mutação, `apps/api/test/codigos-de-erro.test.ts` continua 22 de 22 verde para código novo em `send({erro})` e em `RegraDeNegocio` com 403; só morde em `FalhaAutenticacao` e na troca de nome de um código do catálogo. Isso desmente `dc360/README.md:146` e o cabeçalho do catálogo, escritos pela E05.
- Os PASS não contradizem: Red-team e Banco não olharam o ponto; a Segurança disse ter varrido sem achados e a execução da arbitragem refutou (falso verde da dimensão Segurança nesta etapa).
- Conserto mínimo (arbitragem): o teste de catálogo varrer toda resposta de erro do servidor (inclusive `send({erro})` e `RegraDeNegocio`) e os códigos fora da lista entrarem no catálogo ou o README e o cabeçalho dizerem exatamente o que o teste prende.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
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
| Aprovar as três frases da tela de entrada e as mensagens do catálogo (capturas em `validacao/bb0f654/capturas/`) | Rafael | texto de produto, fluxo de erro crítico e tela pública (seção 10 de `28`) |
| Leitor de tela nas três frases | Rafael ou avaliação externa (CP-32) | o agente não substitui VoiceOver nem NVDA |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (QA): o GUIA-DO-COORDENADOR (linhas 162 e 163) diz que trocar o papel encerra a sessão; desde a E07 isso não acontece.
- Anotado (UX): sessão encerrada por quem administra, com a pessoa voltando depois de o token vencer, mostra "Sua sessão expirou" em vez de "foi encerrada".

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (quarta rodada na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| 6 (vereditos opostos entre validadores da etapa) | arbitragem em Opus com os relatórios | ver `validacao/bb0f654/arbitragem.md` e o motivo acima |
| run do CI não lido | Rafael | `gh auth login` (ou autorizar a leitura pela credencial do git) para revalidar Infra e CI |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado). Falsos verdes registrados nesta rodada (seção 11 de `28`): Segurança da E05 (refutada pela arbitragem); QA, Segurança e Red-team da E15 (confiaram no nome do caso); as rodadas 3 de E09 e E10 (os defeitos já existiam em `52952a1`).

## Rodada 3 (2026-10-15, SHA 52952a1)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael. Candidato `52952a1` (produto de `7c97881`; o diff `7c97881..52952a1` só toca `docs/roadmap-v2/`). Base do lote: `afde25c`; o que mudou desde a rodada 2: `git diff 4b96ea7..52952a1` (correção 2 e correções 3 e 4). Herança: NENHUMA dimensão herdada da rodada 2 (`impacto.mjs --herdavel` deu "NÃO herdável" em todos os relatórios PASS: o diff toca `auth/servico.ts`, as migrações 049 e 050, `componentes/comuns.tsx`, `apps/campo/package-lock.json` e `.github/workflows/verificar.yml`), por isso todas as dimensões rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas na rodada 2 (mantidas). Os agentes de dimensão do Windows (`~/.claude/agents/`) não existem no Mac: cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt do validador (`prompt-do-validador.md`, adaptado para lote e para o Mac), em sequência estrita, um por vez, sobre a árvore principal. Modelo: Opus em todas as dimensões (gatilho 5 da seção 12 de `28`, terceira rodada, e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, que rodou em Claude Sonnet 5.5 (claude-sonnet-5-5) porque é o padrão da política para LGPD não estrutural (nenhuma das cinco etapas toca manifesto, retenção ou eliminação) e a dimensão não reprovou nas rodadas 1 e 2; a primeira tentativa dela foi interrompida pelo limite de sessão da API sem gravar nada e foi refeita do zero no mesmo modelo. Os validadores receberam o bloco da etapa, só a seção Fatos dos RESUMOs (inicial e correções), a lista da evidência, as decisões da seção 9 do STATUS e D1 a D8, os VEREDITOs das rodadas 1 e 2 e o run do CI.

Veredito da rodada: **BLOCKED**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/52952a1/acessibilidade.md |
| Banco | banco-de-dados (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/52952a1/banco-de-dados.md |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/52952a1/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2, E3a |  | validacao/52952a1/red-team.md |
| Segurança | seguranca-aplicacao (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/52952a1/seguranca-aplicacao.md |
| UX | ux (general-purpose) | claude-opus-5-5 | PASS | alta | E2, E3a | E2, E3a |  | validacao/52952a1/ux.md |

### Motivo do veredito

- Todas as seis dimensões PASS (QA, Segurança, Red-team, Banco, UX, Acessibilidade): os três códigos estão certos nas três pontas, a migração 048 intacta, a renovação depois de desativar dá 403 `conta_desativada`.
- BLOQUEADA pela conferência mecânica de evidência (fail-closed): o `INDEX.md` não bate com o conteúdo commitado. Recomendação para a rodada 4: o conserto é só recalcular o `INDEX.md`, caminho que não está no mapa de impacto de nenhuma dimensão; com o diff restrito a isso, as dimensões PASS desta rodada são herdáveis (`impacto.mjs --herdavel`).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha 52952a1`: FALHA indice: o `INDEX.md` não bate com o conteúdo commitado (saidas/09-test-campo-depois.txt; saidas/12-e2e-api-depois.txt; saidas/baseline-depois/04-teste-web.txt; e `VEREDITO.md`, que é do gatekeeper e muda a cada rodada, não deveria estar no INDEX). Causa conferida pelo gatekeeper e por dois validadores: as saídas foram gravadas no Windows com fim de linha misto, o hash foi calculado sobre o arquivo do disco e o git normalizou o conteúdo para LF no commit; a conferência só passou na rodada 2 porque rodou na árvore de trabalho do Windows. Num checkout novo (Mac, Linux) a evidência arquivada não tem integridade verificável. Pela regra fail-closed, a etapa fica BLOQUEADA até o `INDEX.md` ser recalculado sobre o conteúdo commitado (com nota datada) e reconferido.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| capturas `E05-entrada-*` das três frases (texto de produto, tela pública, fluxo de erro crítico de sessão) | Rafael | gatilhos visuais da seção 10 de `28` |
| leitor de tela real (VoiceOver, NVDA, TalkBack) | pessoa com leitor (CP-32) | o agente não substitui leitor de tela |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- Quem perde a trava para a desativação recebe 401 `sessao_encerrada`, e não 403 `conta_desativada` (5 de 5 reproduções determinísticas do Banco; dono E07).
- Foco cai em BODY na entrada e as regiões `status` nascem já com o texto, então o anúncio não é garantido (dono F10-E11).
- Frase "quando o seu cadastro muda" (UX).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: banco-de-dados em Opus (migração 048) e seguranca-aplicacao (a correção mexeu na renovação). Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/acessibilidade.md |
| Banco | banco-de-dados | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/banco-de-dados.md |
| QA | qa | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/seguranca-aplicacao.md |
| UX | ux | claude-sonnet-5-5 | PASS | media | E2, E3a | E2, E3a | | validacao/4b96ea7/ux.md |

### Motivo do veredito

- Todas as dimensões PASS. O FAIL da rodada 1 está consertado: desativar pela rota real faz a renovação devolver 403 `conta_desativada` (QA, por execução e mutação).
- Banco (Opus): a 048 é `SECURITY DEFINER` com `search_path` fixo, devolve 5 colunas, `EXECUTE` só para `dc360_app`, nada de outro município; revertida, a API continua; reaplicada.

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
| Ver as capturas das três frases de sessão na entrada (texto de produto e fluxo de erro crítico em tela pública, gatilhos da seção 10) | Rafael | portão visual por risco; as frases foram aprovadas por instrução (D7) sem leitura individual |
| Leitor de tela real ouvindo a frase ao cair na entrada | pessoa com NVDA ou VoiceOver (CP-32) | o agente não substitui leitor de tela (seção 4 de `28`) |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- Nenhum teste trava as colunas que a função da 048 devolve: uma mutação que passa a devolver `email` e `senha_hash` passou no CA-06 (Banco). Teste de contrato da função a escrever.

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
| Acessibilidade | acessibilidade | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/acessibilidade.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |
| Red-team | red-team | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/red-team.md |
| UX | ux | claude-sonnet-5-5 | FAIL | alta | E2, E3a | E2, E3a | | validacao/7005a60/ux.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, acessibilidade, ux. Lote: qa com E09 e E10; red-team com E09, E10 e E13; ux com E07 a E11 e E13; acessibilidade com E11 e E13.

### Motivo do veredito

- QA FAIL e UX FAIL: desativar a conta pelo endpoint real revoga as sessões, então `/auth/renovar` da pessoa desativada responde 401 `sessao_encerrada` (`apps/api/src/auth/servico.ts:622`, via `sessao_por_token`), não 403 `conta_desativada`. A frase de conta desativada só aparece na janela de 15 minutos do token vivo; depois a pessoa vê "sessão encerrada" e, ao tentar entrar, "Email ou senha inválidos". O teste do implementador desativa por UPDATE sem revogar, estado que o produto nunca produz.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| aprovar as três frases mostradas ao usuário | Rafael | texto de produto e gatilho visual (erro de sessão) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- o catálogo traz `troca_de_senha_obrigatoria`, mas a fila do app a trata como permanente (ver E06)
- foco fica em BODY depois de cair na entrada; "encerrada" e "expirou" são `role=status` montados já com texto (dono F10-E11)
- a frase "cadastro muda" ficou desatualizada

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
