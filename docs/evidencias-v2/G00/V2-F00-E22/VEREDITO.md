# VEREDITO de V2-F00-E22

Situação atual: VALIDADA COM PENDÊNCIA HUMANA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 2026-10-25 | 7fdfcc1 | 7fdfcc1 (run 40246414900, 10 verdes e 2 pulados por regra); CI completo do produto idêntico em 9a1c112 (run 40179451002) | PASS (só mecânica: as duas frases novas do README sobre os gatilhos do `verificar.yml`, `G00/validacao/7fdfcc1/mecanica.md`) | 98879db | 0b32d38 | e7e1326 |
| 10 | 2026-10-25 | 98879db | ddff79a (run 40203288208, 10 verdes e 2 pulados por desenho); CI completo do mesmo produto em 9a1c112 (run 40179451002, tentativa 2, 12 de 12) | PASS (documentação da DV-08) | 98879db | 0b32d38 | e7e1326 |
| 8 | 2026-10-24 | 60cbc2f | c680f8d (run 39524190207, 12 de 12 verdes) | PASS | 8832367 | 0b32d38 | 60cbc2f |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 10 (2026-10-25, SHA 98879db)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Windows do Rafael (o Mac reiniciou), em 2026-10-25. Política: D-31 (seção 19 de `28`) e D-32 (seção 20, aprovada por Rafael em 2026-10-25), validação POR DIFERENÇA desde a rodada 9 (`dda7557`): E19 na dimensão que reprovou (QA, correção 11); E16 e E22 só pela documentação tocada pelas dívidas DV-09 e DV-08 (`c3ca2d8`); E09 aceita por decisão do Rafael (H36, item 3 da seção 20), registrada sem validador; as demais 21 etapas herdam a rodada 9 (código delas não mudou: o diff `dda7557..98879db` fora de `docs/` toca `mensagens-do-zod.ts`, os testes e a documentação da correção 11 da E19, os arquivos da janela de confirmação da E09 (`Modal.tsx`, `ConfirmarAcao.tsx`, `acompanhar-janela.ts` e as frases de `MinhaConta.tsx` e `Usuarios.tsx`, todas da E09), os totais do `baseline.mjs` e do `COLOCAR-DE-PE.md` (D-31 item 4) e o README e o LEIA-ME das dívidas). Candidato `98879db`, com código de produto idêntico ao de `a60be9a` (`a60be9a..98879db` só toca `docs/roadmap-v2/`).

Estado da árvore: HEAD durante a validação `823e380`, árvore limpa no início, `98879db` em `origin/v2/f00`. `98879db..ddff79a` só toca `STATUS.md` (lista permitida). `ddff79a..823e380` são os commits de checkpoint `a65f733` e `823e380`, que tocam `docs/roadmap-v2/retomada/**` (10 arquivos de retomada para o Windows) e uma linha do `STATUS.md`: nenhum é código de produto, política, mapa de impacto, skill do gatekeeper nem script do roadmap, e o CI deles (40221117648 e 40221129886) está verde. Mesmo assim estão FORA da lista permitida da seção 6 de `28`: `conferir-evidencia.mjs` rodado na árvore principal acusa `lista-permitida` por causa deles. Por isso a conferência mecânica foi refeita numa worktree temporária no `ddff79a` (o registro do candidato), onde a lista permitida fecha. Desvio de processo registrado para o Rafael (ver Escalonamentos): o commit deste registro fica sobre `823e380`, então `98879db..HEAD` continua tocando `docs/roadmap-v2/retomada/**`.

Regras: politica_validacao_sha `98879db` (a própria D-32), mapa_impacto_sha `0b32d38`, versao_gatekeeper `e7e1326`, todas commitadas (sem mudança local). Ambiente: Windows 11, Node 22.17.0 (o mesmo major do CI), PGlite, `gh` logado. Validadores em PRIMEIRO PLANO e em sequência estrita, em Sonnet (D-31 item 6), com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (antes de `## Justificativa`), a evidência, os relatórios anteriores como pista, as decisões e o CI. Ordem: QA da E19; QA da documentação de E16 e E22 (um validador, dois relatórios).

Veredito da rodada: **PASS**. Situação: VALIDADA COM PENDÊNCIA HUMANA (as pendências da rodada 8 continuam).

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA (documentação da DV-08) | qa | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/98879db/qa.md |

Desde a rodada 9 mudou só a frase do `dc360/README.md` da dívida DV-08 (commit `34892c9`) e a entrada em `dividas.md` (`452dee6`). As demais frases da etapa herdam a rodada 8 (`60cbc2f`).

### CI (job a job)

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | job 121138934436 |
| Windows (auditar, test:scripts e conferir:numeros) | success | Infra e CI | job 121138934063 |
| Fluxo ponta a ponta no navegador | success | QA, UX, Acessibilidade | job 121138932805 (tentativa 2); na tentativa 1 falhou (job 121127158112) num caso instável do WebKit do Linux, DV-45, tratado pelo item 2 da seção 20 de `28` |
| Aplicativo de campo | success | QA | job 121138966751 |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | job 121138959866 |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | job 121138934241; repetido hoje pelo validador da E19: código 0 |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | job 121138933628 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em ubuntu-latest | success | Infra e CI | job 121138933946 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em windows-latest | success | Infra e CI | job 121138962036 |
| A API sobe contra Postgres real | success | QA, Banco | job 121138963053 |
| Pacote da demonstração | success | QA | job 121138964341 |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | job 121138960080 |

CI completo: run 40179451002 (workflow "Verificar", `[ci completo]`) sobre `9a1c112`, registro do candidato `a60be9a`, cujo código de produto é idêntico ao de `98879db`; tentativa 2 com 12 de 12 verdes. Run do registro deste candidato: 40203288208 sobre `ddff79a` (`98879db..ddff79a` só toca `STATUS.md`), 10 verdes e 2 pulados por desenho fora de `[ci completo]` (linha de base e restore). Runs dos checkpoints `a65f733` (40221117648) e `823e380` (40221129886): verdes, mesmos 2 pulados. Lidos com `gh run view --json jobs`.

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-Enn --sha 98879db` na worktree em `ddff79a`: E19, E16 e E22 sem falha e sem aviso. Na árvore principal (HEAD `823e380`), a mesma conferência acusa só `lista-permitida` (os commits de checkpoint, ver acima) e avisos de CRLF do checkout do Windows (somem na worktree). E09: só o falso positivo conhecido de segredo em `correcao-6`, `6b`, `7`, `8` e `8b/sondas/api.sh:5` (`JWT_SEGREDO` de teste do E2E, conferido à mão).
- Regressão base do gatekeeper (Windows, Node 22.17.0, PGlite, árvore com o produto de `98879db`): `npm run typecheck` código 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0 (25 afirmações). O kit indicado por `impacto.mjs dda7557..98879db` (API, web, e2e, shared, scripts, campo) é o do CI completo do mesmo produto, 12 de 12 (D-31 item 5).
- Formato: relatórios desta rodada conferidos à mão (14 campos do cabeçalho, `sha_validado` 98879db, `rodada` 10, as nove seções na ordem, "Tentativas de reprovar" e "Não verificado" preenchidas).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`): nenhum deixou mudança rastreada nem arquivo fora de `validacao/98879db/`; as mutações do QA da E19 foram desfeitas com `git restore` e cópia conferida por SHA-256.

### Motivo do veredito

- A frase nova confere com a API do GitHub, consultada pelo validador: no run 39366804765, a tentativa 1 foi recusada antes de começar (3 s, os 9 trabalhos em `failure`, coerente com a H32, faturamento) e a tentativa 2 (2026-10-20, depois de o repositório virar público) rodou 9 de 9 verdes. O `head_sha` `7644420` difere de `1ed0b71` só em `STATUS.md` e `ESTADO-ATUAL.md`, então "do candidato `1ed0b71`" não engana. O parágrafo em volta continua coerente.
- A entrada DV-08 em `dividas.md` (Resolvidas) descreve o que foi feito.

### Achados que viram dívida ou ficam anotados (classificação do gatekeeper pela D-31, item 1)

- QA 1 (dívida, dono V2-F00-E22, antes do G01; recomendado pagar antes do merge do G00 por ser de duas linhas): `dc360/README.md:1403` ("rodam em todo push") e `:1633` ("a cada push") afirmam mais do que o `verificar.yml` faz (push só em `main`, `master` e `v2/**` e `pull_request`; zero runs em `trab/*`), e o próprio README diz certo na linha 1948. Anterior a esta rodada e fora da frase que a DV-08 tocou (1385 a 1391): não reprova pela D-31 item 1, mas é o item "Documentação sem afirmação falsa" do G00, então fica explícito para o Rafael.
- QA 2 e 3 (anotados): registros históricos da rodada 6 em E01, E02 e E03 dizem "run 39366804765 recusado" sem a tentativa 2 (corretos para a época); quebra de linha irregular no parágrafo editado.
- QA 4 (processo, anotado): o validador leu o cabeçalho da `## Justificativa` do `RESUMO.md` da DV-08 e nada além; declarado no relatório, sem efeito nas conclusões.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | validação humana da etapa (da rodada 8, continua) |
| Decidir se a leitura sob suspensão deve gravar `ocorrencia_consultas` (o código grava, o documento diz que não) | Rafael | decisão de produto (da rodada 8, continua) |

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) | consolidação em Opus; validador em Sonnet | feito |
| commits de checkpoint fora da lista permitida (`docs/roadmap-v2/retomada/**`) | Rafael | registrado, ver o texto da rodada |

### Métricas da rodada

Achados: nenhum bloqueia; 1 dívida (README, comum com a E16), 3 anotados. Tokens de subagente: ver a E16 (um validador para as duas).

## Rodada 8 (2026-10-24, SHA 60cbc2f)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Rodada 8 RETOMADA: a primeira tentativa (2026-10-20) foi interrompida pelo reinício do Mac depois do primeiro validador; o relatório de QA da E05 sobre `60cbc2f`, do mesmo SHA, foi preservado em `bc3c535` e aproveitado; os demais validadores rodaram nesta sessão. Candidato `60cbc2f` (correção 7 da F00); HEAD durante a validação `bc3c535`, que só difere em `STATUS.md`, `ESTADO-ATUAL.md` e `validacao/60cbc2f/qa.md` da E05 (lista permitida; `conferir-evidencia` confirmou). Política: D-31 (seção 19 de `28`): validação POR DIFERENÇA (item 4), achado só reprova pelas condições (a), (b) ou (c) do item 1, modelo de ameaça da E05 e da E19 no item 2, CI como prova padrão (item 5), Sonnet como validador padrão e Opus em Segurança e Red-team da E05 e na consolidação (item 6). O que mudou desde a rodada 7: `git diff fd17ff4..60cbc2f` (guarda de códigos de erro da API e do console, catálogo do shared, foco e bordas fixas do painel, `app.css`, ofício, `auditar.mjs` e `auditar-excecoes.mjs`, `ambiente-hostil.mjs`, três testes do aplicativo de campo, `baseline.mjs` (só totais), README, COLOCAR-DE-PE, LEIA-ME do campo e `verificar.yml` com os jobs `windows` e `plataformas`). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (as seções antes de `## Justificativa`, extraídas pelo gatekeeper), a evidência, os relatórios da rodada 7 como pista, as decisões e o run do CI. Ambiente: Mac, Node 24.15.0 (o CI e o `.nvmrc` usam 22; os validadores da E05 baixaram o Node 22.23.3 para o scratchpad), PostgreSQL local, Chromium, Firefox e WebKit do Playwright; sem aparelho, sem emulador e sem Windows local.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2, E3a |  | validacao/60cbc2f/qa.md |

### Motivo do veredito

- QA PASS (Sonnet, média): a correção 5 (`b58aafe`) resolveu as três frases imprecisas da rodada 6 (quinze das dezesseis, nove arquivos, histórico de runs) e a releitura do README, do COLOCAR-DE-PE e do `verificar.yml` depois de E05, E19, E21 e do job windows confere com o código, salvo dívidas de precisão abaixo. Os números são conferidos por máquina (`conferir:numeros` 0).
- Pista do QA da E19 (README 1686-1689, `npm ci --omit=dev` não instala pacote marcado `dev`): REFUTADA como afirmação falsa sobre o Dockerfile, por execução com o npm 10.9.9 do `node:22-bookworm-slim`; só o npm 11 instala. Fica dívida de precisão (a frase não diz que depende do npm 10).
- Pista do QA da E05 (seção da API sem o modelo de ameaça e sem a DV-01): CONFIRMADA como omissão, dívida; a frase sobre 401 e 403 é verdadeira para os valores comuns em Node 22 e 24.
- Nenhuma afirmação falsa nova sobre comportamento do código (a DoD da etapa); nenhum achado cumpre (a), (b) ou (c).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha 60cbc2f`: sem falha (INDEX.md SHA-256 a SHA-256, lista permitida, regras commitadas, segredos, travessão). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 89 INDEX.md, 4793 arquivos conferidos byte a byte, OK.
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
| Ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | validação humana da etapa |
| Decidir se a leitura sob suspensão deve gravar `ocorrencia_consultas` (o código grava, o documento diz que não) | Rafael | decisão de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (as novas desta rodada entram lá no próximo commit de implementador, porque o arquivo está fora da lista permitida do registro).

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Dívida: `README.md:1686-1689` sem dizer que a afirmação vale para o npm 10 da imagem.
- Dívida: a seção da API (`README.md:145-324`) sem o modelo de ameaça da guarda e sem a DV-01 (o mesmo achado do QA da E05).
- Dívida: `README.md:1387-1389` diz que o run 39366804765 foi recusado; só a tentativa 1 foi, a 2 rodou verde depois de o repositório virar público.
- Dívida (deriva externa): `README.md:1632`, o COLOCAR-DE-PE e outra frase tratam o `auditar` como verde, e hoje ele sai 1 (ver E19); some com o conserto da E19.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet, salvo Segurança e Red-team da E05 em Opus | feito |
| nenhum | n/a | n/a |

### Métricas da rodada

Validador: 1 (QA, cerca de 14 minutos). Achados: 0 bloqueiam, 4 dívidas. Dimensões herdadas: nenhuma.

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **PASS**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2, E3a |  | validacao/fd17ff4/qa.md |

### Motivo do veredito

- QA PASS (Opus, média): os números novos e os parágrafos novos da guarda e do `auditar` conferem com o código; o do `auditar` resistiu a uma sonda com configuração do npm hostil (o caminho de `package-lock=false` da E19 é falha do `auditar`, não da frase sobre os casos que o README lista). Nenhuma afirmação nova do diff é falsa sobre o comportamento; as três frases imprecisas da rodada 6 continuam, e a do histórico de CI ficou mais velha (o run 39420436042 já existe).
- Atenção para a próxima rodada: a E05 reprovou nesta porque o README promete da guarda mais do que ela entrega; quando a E05 for consertada, a E22 precisa reler a seção da API do README.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
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
| Ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | validação humana da etapa |
| Decidir se a leitura sob suspensão deve gravar `ocorrencia_consultas` (o código grava, o documento diz que não) | Rafael | decisão de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (QA, repetido da rodada 6): `dc360/README.md:170` diz "dezesseis formas que a varredura não lia" e o teste planta 15; `:1324-1328` diz que as correções posteriores ao run 39143791434 não passaram por CI, e o run 39420436042 já existe; `:841` fala em "cinco documentos" e o teste confere mais.
- Anotado (QA): `dc360/docs/COLOCAR-DE-PE.md` atualizou o número de testes em 2026-10-20 mas manteve a data de 2026-10-19.

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
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2, E3a |  | validacao/1ed0b71/qa.md |

### Motivo do veredito

- O FAIL da rodada 4 (documentação desmentida pelo código) está consertado no que bloqueava. QA PASS (Opus, média): `conferir:numeros` confere 25 números sem divergência, `auditar` sai 0, e 34 afirmações conferidas à mão (inclusive os 17 números da prova dinâmica, regerados e iguais ao README); nenhuma divergência que bloqueie.
- A varredura foi por amostra; três frases imprecisas ficam como achados.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
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
| Ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | validação humana da etapa |
| Decidir se a leitura sob suspensão deve gravar `ocorrencia_consultas` (o código grava, o documento diz que não) | Rafael | decisão de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- QA: `dc360/README.md` (seção dos códigos de erro, por volta da linha 169) diz que o teste da guarda planta "dezesseis formas"; ele planta 15 (falta a m08).
- QA: `dc360/README.md:1309-1312` diz que as correções posteriores ao run 39143791434 não passaram por CI, mas o run 39241470718 do candidato `4ce0433` passou por elas.
- QA, anotado: o README diz que o teste da ressalva confere "cinco documentos", e ele confere 9 arquivos.
- Observação do gatekeeper: o `README.md:148-151` (garantia da guarda) é desmentido pelo FAIL da E05; quando a E05 for consertada, a E22 precisa reler essa seção.

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
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |

### Motivo do veredito

- QA FAIL (Opus, confiança alta): documentação desmentida pelo código, a mesma classe de defeito das rodadas 1 a 3. A tabela de permissões "gerada" do README não tem `levantar_interdicao`, e o teste que a prenderia não existe; `SAIDA-DE-MUNICIPIO.md:209` diz que a leitura sob suspensão "não cria registro", e a sonda deu 0 para 1 em `ocorrencia_consultas`; há pendências já fechadas pelo código nos `PENDENCIAS.md` do painel e do campo, e afirmações falsas em `ARMAZENAMENTO.md`, `LEIA-ME.md`, `DICIONARIO-DE-DADOS.md` e `CARTAO-DO-AGENTE.md` (lista no relatório).
- Conserto mínimo: corrigir cada divergência listada e prender a tabela de permissões do README a um teste que a gere ou a compare com o catálogo.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
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
| Ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | validação humana da etapa |
| Decidir se a leitura sob suspensão deve gravar `ocorrencia_consultas` (o código grava, o documento diz que não) | Rafael | decisão de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (quarta rodada na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| run do CI não lido | Rafael | `gh auth login` (ou autorizar a leitura pela credencial do git) para revalidar Infra e CI |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado). Falsos verdes registrados nesta rodada (seção 11 de `28`): Segurança da E05 (refutada pela arbitragem); QA, Segurança e Red-team da E15 (confiaram no nome do caso); as rodadas 3 de E09 e E10 (os defeitos já existiam em `52952a1`).

## Rodada 3 (2026-10-15, SHA 52952a1)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael. Candidato `52952a1` (produto de `7c97881`; o diff `7c97881..52952a1` só toca `docs/roadmap-v2/`). Base do lote: `afde25c`; o que mudou desde a rodada 2: `git diff 4b96ea7..52952a1` (correção 2 e correções 3 e 4). Herança: NENHUMA dimensão herdada da rodada 2 (`impacto.mjs --herdavel` deu "NÃO herdável" em todos os relatórios PASS: o diff toca `auth/servico.ts`, as migrações 049 e 050, `componentes/comuns.tsx`, `apps/campo/package-lock.json` e `.github/workflows/verificar.yml`), por isso todas as dimensões rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas na rodada 2 (mantidas). Os agentes de dimensão do Windows (`~/.claude/agents/`) não existem no Mac: cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt do validador (`prompt-do-validador.md`, adaptado para lote e para o Mac), em sequência estrita, um por vez, sobre a árvore principal. Modelo: Opus em todas as dimensões (gatilho 5 da seção 12 de `28`, terceira rodada, e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, que rodou em Claude Sonnet 5.5 (claude-sonnet-5-5) porque é o padrão da política para LGPD não estrutural (nenhuma das cinco etapas toca manifesto, retenção ou eliminação) e a dimensão não reprovou nas rodadas 1 e 2; a primeira tentativa dela foi interrompida pelo limite de sessão da API sem gravar nada e foi refeita do zero no mesmo modelo. Os validadores receberam o bloco da etapa, só a seção Fatos dos RESUMOs (inicial e correções), a lista da evidência, as decisões da seção 9 do STATUS e D1 a D8, os VEREDITOs das rodadas 1 e 2 e o run do CI.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/52952a1/qa.md |

### Motivo do veredito

- QA FAIL (Opus, confiança alta). Os seis defeitos da rodada 2 estão consertados, mas a varredura achou dois que bloqueiam: (1) `dc360/docs/SAIDA-DE-MUNICIPIO.md:95`, as tabelas de `SAIDA:153-165` e `apps/api/PENDENCIAS.md:293-301` e a frase "o pacote não afirma ausência que ninguém conferiu" são desmentidas no caso da assinatura coletada e perdida (o mesmo defeito que reprova a E12, reproduzido de forma independente); (2) `dc360/README.md:932` afirma "quinze de quinze e o portão CA-06 reprova a décima sexta", mas o teto real é 27 (`db/test/isolamento.test.ts:626`), e a mesma frase velha continua em comentários de `apps/api/src/rotas/avisos.ts`, `saida-a-campo.ts` e `armazenamento/orfaos.ts`.
- Conserto mínimo: corrigir as duas afirmações e os comentários, e refazer a varredura inteira (a E22 fica por último, depois da E12).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha 52952a1`: sem falha, 0 aviso.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| ler a tabela "afirmação, o que o código faz, ação" antes e depois e confirmar que nada ficou prometido sem existir | Rafael | "Validação humana" da etapa, texto de produto |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- O LEIA-ME do campo diz que nenhuma execução em emulador está no repositório, mas há capturas de emulador das validações de E06 e E16.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (terceira rodada na mesma etapa) | investigação em Opus em todas as dimensões, exceto LGPD | feito |

### Métricas da rodada

Ver os relatórios de cada dimensão (tentativas de reprovar, mutações que morderam, o que não foi verificado).

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper. Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |

### Motivo do veredito

- QA FAIL (confiança alta): seis afirmações da documentação desmentidas pelo código ou pela execução no SHA: `apps/api/src/auth/suspensao.ts:48-53` (diz que `GET /avisos` escreve sem vigência); `apps/api/PENDENCIAS.md` (assinatura "sem efeito no papel"; o laudo do pacote sai com imagem quebrada); `README.md:1613` (`expo-doctor` falhando uma verificação; hoje 21 de 21); `README.md:1172` e `COMO-REPRODUZIR.md` (código 1 por V-DEP-4); `docs/RESTORE-DO-BANCO.md` (47 migrações e "Postgres 17 não provado"; o CI aplicou 48 em Postgres 17.11); `LOJAS.md:290`. A E22 é a etapa que fecha a fase garantindo que a documentação diz o que o código faz.

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Corrigir os seis pontos e repetir a varredura de afirmações verificáveis depois das correções das outras etapas desta rodada (E01, E04, E12, E19, E24).

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
| Rafael lê a tabela antes e depois | varredura do QA conferindo cada afirmação no código ou por execução | verificável |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

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
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa. Lote: qa com E19 a E21, E23 e E24.

### Motivo do veredito

- QA FAIL: a documentação ainda afirma o que o código não faz. `GET /relatorios/ocorrencias.csv` e `GET /documentos/:id/laudo`, `termo-de-interdicao` e `termo-de-desinterdicao` escrevem e escapam da vigência, mas `vigencia.ts:47-50`, `apps/api/PENDENCIAS.md` e `README.md:130` citam só `GET /avisos`.
- Restos falsos depois da E19: `LEIA-ME` do campo linha 24, `README.md:220`, `apps/api/PENDENCIAS.md` linhas 25 e 250. E `SAIDA-DE-MUNICIPIO.md:95` (ver E12).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E22 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| ler a tabela antes e depois e confirmar que nada ficou prometido sem existir | Rafael | texto de produto |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `db/PENDENCIAS.md` e `apps/web/PENDENCIAS.md` não foram conferidos nesta rodada

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
