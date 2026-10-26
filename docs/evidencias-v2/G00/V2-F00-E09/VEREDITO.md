# VEREDITO de V2-F00-E09

Situação atual: IMPLEMENTADA, ACEITA POR DECISÃO DO RAFAEL (H36, D-32 item 3); sem validador e sem RISCO ACEITO
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | 2026-10-25 | 7fdfcc1 | 7fdfcc1 (run 40246414900, 10 verdes e 2 pulados por regra) | ACEITA (H36) mantida; rodada só mecânica: o `INDEX.md` sem a linha do `VEREDITO.md` fecha byte a byte (`G00/validacao/7fdfcc1/mecanica.md`) | 98879db | 0b32d38 | e7e1326 |
| 10 | 2026-10-25 | 98879db | ddff79a (run 40203288208, 10 verdes e 2 pulados por desenho); CI completo do mesmo produto em 9a1c112 (run 40179451002, tentativa 2, 12 de 12) | ACEITA (H36), sem validador | 98879db | 0b32d38 | e7e1326 |
| 9 | 2026-10-24 | dda7557 | d4683cc (run 40132234324, 12 de 12 verdes) | FAIL | 8832367 | 0b32d38 | e7e1326 |
| 8 | 2026-10-24 | 60cbc2f | c680f8d (run 39524190207, 12 de 12 verdes) | FAIL | 8832367 | 0b32d38 | 60cbc2f |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 10 (2026-10-25, SHA 98879db)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Windows do Rafael (o Mac reiniciou), em 2026-10-25. Política: D-31 (seção 19 de `28`) e D-32 (seção 20, aprovada por Rafael em 2026-10-25), validação POR DIFERENÇA desde a rodada 9 (`dda7557`): E19 na dimensão que reprovou (QA, correção 11); E16 e E22 só pela documentação tocada pelas dívidas DV-09 e DV-08 (`c3ca2d8`); E09 aceita por decisão do Rafael (H36, item 3 da seção 20), registrada sem validador; as demais 21 etapas herdam a rodada 9 (código delas não mudou: o diff `dda7557..98879db` fora de `docs/` toca `mensagens-do-zod.ts`, os testes e a documentação da correção 11 da E19, os arquivos da janela de confirmação da E09 (`Modal.tsx`, `ConfirmarAcao.tsx`, `acompanhar-janela.ts` e as frases de `MinhaConta.tsx` e `Usuarios.tsx`, todas da E09), os totais do `baseline.mjs` e do `COLOCAR-DE-PE.md` (D-31 item 4) e o README e o LEIA-ME das dívidas). Candidato `98879db`, com código de produto idêntico ao de `a60be9a` (`a60be9a..98879db` só toca `docs/roadmap-v2/`).

Estado da árvore: HEAD durante a validação `823e380`, árvore limpa no início, `98879db` em `origin/v2/f00`. `98879db..ddff79a` só toca `STATUS.md` (lista permitida). `ddff79a..823e380` são os commits de checkpoint `a65f733` e `823e380`, que tocam `docs/roadmap-v2/retomada/**` (10 arquivos de retomada para o Windows) e uma linha do `STATUS.md`: nenhum é código de produto, política, mapa de impacto, skill do gatekeeper nem script do roadmap, e o CI deles (40221117648 e 40221129886) está verde. Mesmo assim estão FORA da lista permitida da seção 6 de `28`: `conferir-evidencia.mjs` rodado na árvore principal acusa `lista-permitida` por causa deles. Por isso a conferência mecânica foi refeita numa worktree temporária no `ddff79a` (o registro do candidato), onde a lista permitida fecha. Desvio de processo registrado para o Rafael (ver Escalonamentos): o commit deste registro fica sobre `823e380`, então `98879db..HEAD` continua tocando `docs/roadmap-v2/retomada/**`.

Regras: politica_validacao_sha `98879db` (a própria D-32), mapa_impacto_sha `0b32d38`, versao_gatekeeper `e7e1326`, todas commitadas (sem mudança local). Ambiente: Windows 11, Node 22.17.0 (o mesmo major do CI), PGlite, `gh` logado. Validadores em PRIMEIRO PLANO e em sequência estrita, em Sonnet (D-31 item 6), com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (antes de `## Justificativa`), a evidência, os relatórios anteriores como pista, as decisões e o CI. Ordem: QA da E19; QA da documentação de E16 e E22 (um validador, dois relatórios).

Veredito da rodada: **ACEITA POR DECISÃO DO RAFAEL (H36)**, sem validador. Situação: IMPLEMENTADA, ACEITA POR DECISÃO DO RAFAEL. A tabela de status da seção 6 de `28` não tem um status para "aceita sem validação"; VALIDADA exige PASS de validador (e `gerar-estado --conferir` recusa VALIDADA sem PASS no VEREDITO), e CONCLUÍDA COM RISCO ACEITO exige `RISCO-ACEITO.md`, que o item 3 da seção 20 manda não emitir. O gatekeeper não escreve PASS que nenhum validador deu: a etapa fica IMPLEMENTADA com o aceite registrado aqui, e o Rafael decide se a política ganha um status próprio (por exemplo ACEITA POR DECISÃO) ao aprovar o G00.

### Aceite (item 3 da seção 20 de `28`)

- Decisão: pelo item 3 da seção 19 (teto de rodadas pela mesma classe), Rafael decidiu a E09 em 2026-10-25 (H36, D-32): aceita com o modelo de ameaça documentado (o próximo Tab traz o controle de volta à vista e nada se perde), com as correções 8 (`26044a9`, merge `b7e1cd7`) e 8b (`abcd602`, merge `a11fe9b`) como estão. A correção 8c foi descartada e a falha instável do WebKit no Linux virou a DV-45.
- O código da E09 em `98879db` é o de `a60be9a` (correções 8 e 8b), coberto pelo CI completo 40179451002 (tentativa 2, 12 de 12; a tentativa 1 falhou no caso instável da DV-45, que o item 2 da seção 20 trata como instável: não reprova).
- O gatekeeper NÃO chamou validador, NÃO emite RISCO ACEITO (item 3 da seção 20) e não escreveu `RISCO-ACEITO.md`. A classe aceita (foco ou controle fora da vista fora da matriz fixa do item 1 da seção 20) não está na lista "Não admitem RISCO ACEITO" da seção 7.
- Conferência mecânica: `conferir-evidencia.mjs V2-F00-E09 --sha 98879db` na worktree em `ddff79a`: só o falso positivo conhecido de `JWT_SEGREDO` de teste em `correcao-6`, `6b`, `7`, `8` e `8b/sondas/api.sh:5` (conferido à mão: é o segredo do E2E local, não segredo de produção). Capturas em 1280 e 390 px, claro e escuro, presentes.
- Dívida de evidência (dono V2-F00-E09, próximo commit de implementador): a correção 8 (`26044a9`) devolveu `VEREDITO.md` à lista do `INDEX.md` desta pasta, contra a nota da E21 (correção 1, 2026-10-15) que tirou dela os arquivos do gatekeeper. Com o registro desta rodada, o SHA-256 listado deixa de bater e `conferir-evidencia.mjs V2-F00-E09` acusa `indice`. O gatekeeper não corrige (`INDEX.md` está fora da lista permitida): a linha `VEREDITO.md` sai do `INDEX.md`. Na worktree em `ddff79a`, antes deste registro, o índice batia; `conferir-indices-de-evidencia.mjs` ali deu OK (97 índices, 5127 arquivos).

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

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| todas (QA, UX, Acessibilidade, Red-team, LGPD) | nenhum | n/a | ACEITA (H36) | n/a | n/a | n/a |  | n/a |

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Olhar as capturas da contrapartida (título fora da vista em janela baixa, `validacao/dda7557/capturas/ux-06-*` e `ux-07-*`) e as da correção 8 (`correcao-8/capturas/`) e aprovar ou pedir outro desenho | Rafael | gatilho visual (seção 10 de `28`) |
| H39: Safari de iPhone real e Android real na confirmação das sessões e nas janelas de Usuários; VoiceOver no fluxo de Minha conta | Rafael | aparelho físico e leitor de tela |
| H35: confirmar 340 px ou voltar para 360 px | Rafael | decisão de desenho |
| A "Validação humana" da etapa: Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações (inclusive as frases novas de sessão, "pode continuar consultando por alguns minutos") | Rafael | regra global da seção 4 de `28` |

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| D-31 item 3 (quinta rodada pela mesma classe) | Rafael (H36) | decidido em 2026-10-25: aceita com o modelo de ameaça documentado |
| commits de checkpoint fora da lista permitida (`docs/roadmap-v2/retomada/**`) | Rafael | registrado, ver o texto da rodada |

### Métricas da rodada

Validadores: nenhum. Achados novos: nenhum (a DV-45 foi registrada antes desta rodada, em `98879db`).

## Rodada 9 (2026-10-24, SHA dda7557)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Candidato `dda7557` (correção 7 da E09 e correção 10 da E19, com a migração do `zod` 3.25.76 para 4.6.7, `fastify` 5.12.7 e `fast-uri` 3.1.9 e 4.2.3); HEAD durante a validação `d4683cc`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). SHA no remoto (`origin/v2/f00`), árvore limpa no início. Política: D-31 (seção 19 de `28`), validação POR DIFERENÇA desde a rodada 8 (`60cbc2f`): E09 e E19 nas dimensões que reprovaram (E09 também QA e Red-team, que a rodada 8 mandou rodar de novo porque o código da etapa mudou), mais as etapas cujo código a migração do `zod` tocou, pela autoria dos patches arquivados: E06 (`pedidoDeEvidenciaSchema` em `packages/shared/src/evidencia.ts`, onde a E06 pôs `coletadaPor`, mais o UUID mais estrito) e E15 (dublê de UUID trocado num teste dela). `apps/api/src/config.ts`, `apps/api/src/rotas/aparelhos.ts`, `mensagens-do-zod.ts`, os `package.json` e os lockfiles só têm a E19 como autora na F00; o `schemas.ts` foi tocado pela E22 só num comentário (`correcao-4`), por isso a E22 herda; `baseline.mjs`, README e COLOCAR-DE-PE mudaram só em totais (conferidos por `conferir:numeros`, D-31 item 4) e no parágrafo da política do CP-03, que é da E19. As demais etapas herdam a rodada 8 (código delas não mudou). `impacto.mjs --herdavel` responde "NÃO herdável" a todo relatório anterior a `8832367` porque o diff inclui a própria emenda D-31; a rodada 8 já aplicou a D-31 e a herança aqui segue o item 4 dela (código da etapa). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido mais as instruções comuns da rodada (scratchpad): o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (antes de `## Justificativa`), a evidência, os relatórios anteriores como pista, as decisões e o run do CI. Ordem: Infra e CI da E19, QA de E19, E06 e E15 (um validador, três relatórios), QA, UX e Acessibilidade da E09 (Sonnet) e Red-team da E09 (Opus, 45 minutos, no máximo 3 achados). Ambiente: Mac, Node 24.15.0 (o CI usa 22), PGlite e Postgres local, Chromium, Firefox e WebKit do Playwright; sem aparelho, emulador ou Windows local.

Veredito da rodada: **FAIL** (D-31, item 3: quarta reprovação pela mesma classe; a rodada 10 não é automática, a decisão é do Rafael, H36).

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/dda7557/qa.md |
| UX | ux (general-purpose) | claude-sonnet-5-5 | PASS | media | E2, E3a | E2, E3a |  | validacao/dda7557/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-sonnet-5-5 | FAIL na consolidação (o relatório diz PASS; achado 2 bloqueia pela D-31, item 1 (b), ver Motivo) | media | E1, E2 | E1, E2 |  | validacao/dda7557/acessibilidade.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/dda7557/red-team.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E3a | E1, E2, E3a | herdado de 1ed0b71, sem impacto (a correção 7 só muda rolagem e foco em `Modal.tsx`, `usar-bordas-fixas.ts` e `MinhaConta.tsx`; nenhum dado pessoal novo, lido ou guardado) | validacao/1ed0b71/privacidade-lgpd.md |

### CI (job a job)

| Job | Resultado | Dimensão ligada | Observação |
| --- | --- | --- | --- |
| Testes, tipos e scripts | success | QA, Testes | job 120986221218 |
| Windows (auditar, test:scripts e conferir:numeros) | success | Infra e CI | job 120986221042; `auditar` 0, saída idêntica à do Linux |
| Fluxo ponta a ponta no navegador | success | QA, UX, Acessibilidade | job 120986221122; inclui a seção 14 nova do `layout-estreito.e2e.mjs` |
| Aplicativo de campo | success | QA | job 120986221030; typecheck e Jest com o `zod` 4 do topo |
| Linha de base (baseline.mjs) em Linux | success | Infra e CI | job 120986221110; `expo-doctor` 21 de 21 sem pular a checagem de versões |
| Dependências com vulnerabilidade conhecida (auditar) | success | Infra e CI | job 120986220910; repetido hoje pelo gatekeeper e pelo validador: código 0 |
| Ferramentas do roadmap e estado gerado | success | Infra e CI | job 120986221063 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em ubuntu-latest | success | Infra e CI | job 120986221244 |
| Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em windows-latest | success | Infra e CI | job 120986221105 |
| A API sobe contra Postgres real | success | QA, Banco | job 120986221157; `fastify` 5.12.7 e `zod` 4.6.7 |
| Pacote da demonstração | success | QA | job 120986221089 |
| Restore do banco, Postgres 17 (CA-08) | success | Banco, Infra e CI | job 120986221090 |

Run 40132234324 (workflow "Verificar", push com `[ci completo]`, criado em 2026-10-24T20:59Z) sobre `d4683cc`, registro do candidato: o diff `dda7557..d4683cc` só toca `STATUS.md` e `ESTADO-ATUAL.md`, então vale como run do candidato. Lido com `~/.local/bin/gh` e `GH_TOKEN` tirado de `git credential fill`, sem imprimir o token.

### Conferência mecânica

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-Enn --sha dda7557` em E06, E09, E15 e E19, antes e depois dos relatórios: sem falha em E06, E15 e E19; na E09, uma FALHA de segredo, o falso positivo conhecido (`correcao-6/sondas/api.sh:5`, `correcao-6b/sondas/api.sh:5` e `correcao-7/sondas/api.sh:5`: o `JWT_SEGREDO` de teste do roteiro local, valor textual "segredo-...", conferido pelo gatekeeper sem imprimir o valor inteiro); nenhuma outra falha. Varredura dos relatórios novos por token, chave e travessão: nada.
- Regressão base do gatekeeper na árvore (`d4683cc`, produto de `dda7557`): `npm run typecheck` código 0; `npm run test:isolamento` 345 aprovados e 3 pulados (14 arquivos), código 0; `npm run conferir:numeros` código 0; `node scripts/auditar.mjs` código 0 ("Runtime limpo, e o aplicativo sem advisory nova"). O kit indicado por `impacto.mjs 60cbc2f..dda7557` (`apps/api/src/config.ts` sem regra no mapa, portanto kit completo) é o do CI completo deste SHA, 12 de 12 verdes (D-31, item 5).
- Formato: os 8 relatórios desta rodada conferidos pelo gatekeeper (cabeçalho com os 14 campos, `sha_validado` dda7557, `rodada` 9, `ci_run` 40132234324, as nove seções, "Tentativas de reprovar" e "Não verificado" preenchidas); todos conferem.
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`): nenhum deixou mudança rastreada nem arquivo fora de `validacao/dda7557/`; as mutações foram desfeitas com `git restore` e os worktrees temporários dos validadores removidos (os worktrees em `.claude/worktrees/` são da sessão paralela da F01).

### Motivo do veredito

- Os dois defeitos da rodada 8 estão CONSERTADOS, medidos de forma independente por três dimensões nos três motores: a frase "A outra sessão foi encerrada. Esta continua aberta." inteira entre o topo fixo e a barra do pé depois de clique, toque e teclado (UX 171 de 171 em 19 tamanhos, com atraso de rede, iPhones emulados e tema escuro; A11y 57 de 57 por motor, com zoom até 400 por cento e `prefers-reduced-motion`); o foco inicial "Cancelar" dentro da área útil das três janelas de confirmação (UX 540 casos sem falha real; A11y 216 de 216 por motor). As sondas mordem: com o painel de `60cbc2f` reprovam (WebKit 0 de 6 na A11y; números da rodada 8 reproduzidos pelo UX). QA: `layout-estreito` 325, 325 e 324, `fluxo-api` 288, painel 737 de 737, 6 de 6 mutações do `correcao-7-da-e09.test.ts` vermelhas, `MutationObserver` sem vazamento nem laço em 40 aberturas, janela da senha temporária abrindo no topo com o título à vista (42 de 42), Tab nas 7 telas, nenhuma rolagem lateral a 320 px, axe 4.13 sem violação em 192 medidas. Red-team: 404 com corpo idêntico entre municípios (inclusive UUID nulo e máximo, que o Zod 4 aceita), 422 nas autoações, 403 de posto e de permissão, organização no corpo, na rota e no cabeçalho ignorada, tokens forjados recusados, senha temporária sem vazamento e sem reuso, trilha com o ator certo; a sonda morde (sem o controle de posto, 200).
- **Bloqueia (Acessibilidade, achado 2), classificação do gatekeeper pela D-31, item 1 (b):** com a janela de confirmação ABERTA, quando o tamanho da janela do navegador muda (girar o celular de 320x568 para 568x320, ou dar zoom de 1280x720 até 320x256), "Cancelar" continua com o foco mas fica fora da parte visível do painel (botão 304..348 contra área útil 27..294; 424..468 contra 21..234), nos três motores, 12 de 12 casos. Causa: o ajuste do `Modal` da correção 7 roda na abertura e a cada mutação do conteúdo, nunca em `resize`. O validador classificou como dívida ("b só para quem muda o tamanho com a janela aberta") e devolveu a decisão ao gatekeeper por ser a classe da H36. O gatekeeper aplica a regra como está escrita: é alcançável por usuário comum (girar o celular com a janela aberta), está no código que a própria etapa escreveu para fechar exatamente este defeito (não é anterior à etapa) e é o mesmo sintoma do defeito 2 da rodada 8 (WCAG 2.4.7 e 2.4.11: o elemento focado fora da vista), agora por outro caminho. O próximo Tab traz o botão à vista e nada se perde; isso entra no modelo de ameaça que o Rafael pode aceitar. Conserto provável: um `ResizeObserver` no painel (ou `resize` da janela) chamando a mesma conta de rolagem, só enquanto o foco continua em "Cancelar".
- **Mesma classe pela quarta vez (rodadas 6, 7, 8 e 9: foco ou confirmação encoberta ou fora da vista).** Pela D-31, item 3, a rodada 10 não é automática: a decisão sobe para o Rafael em `pendencias-humanas.md` (H36, a atualizar pelo próximo commit de implementador): consertar mais uma vez (o `resize`, e no mesmo lote os achados que corrigem junto, abaixo) ou aceitar com o modelo de ameaça documentado. A classe não cai na seção 7, então o aceite é possível; o gatekeeper não o emite.
- Não bloqueia, e por quê:
  - A11y 1 e QA 1 (dívida, corrige junto): depois de um erro do servidor na janela de confirmação, ou de um clique no fundo escurecido, o foco cai em `BODY` e o Esc deixa de fechar (o Esc e o Tab são ouvidos por `onKeyDown` no painel); em Chromium e Firefox um Tab recupera; no WebKit do Playwright, só com teclado e depois de erro 500, nem Tab nem Esc saem de `BODY`. O componente (`Modal` e `ConfirmarAcao`, `disabled={ocupado}` no "Cancelar") é de `eafc4ca` (2026-09-09), anterior à etapa, e já era assim em `60cbc2f`; nenhum critério escrito da DoD cobre o foco depois de uma falha; o erro é anunciado (`role=alert`). Pela D-31, item 1, defeito anterior à etapa vira dívida; como a etapa já volta para correção, recomenda-se consertar junto (ouvir Esc e Tab no `document` enquanto a janela está aberta, ou devolver o foco ao botão quando `ocupado` volta a falso).
  - A11y 3 e UX A1 (anotado, contrapartida declarada pelo implementador): em janela baixa (320 px de largura com até 450 px de altura, e 568x320) o título e parte do texto saem por cima da parte visível do painel, sem pista de rolagem; o leitor de tela lê pelo `aria-labelledby` e `aria-describedby` (45 de 45) e o botão destrutivo repete ato e pessoa. Capturas para o Rafael: `validacao/dda7557/capturas/ux-06-contrapartida-redefinir-chromium-claro-320x256-clique.png` e `ux-07-contrapartida-redefinir-chromium-claro-568x320-clique.png`.
  - Red-team 1 (dívida, condição (c) só em tese): o token de acesso de uma sessão encerrada (por "Encerrar sessões", "Encerrar minhas outras sessões" ou "Redefinir senha") continua LENDO até vencer (15 minutos), enquanto renovação e escrita já recusam. O assunto é o item 2 da seção 7 (vigência), mas o comportamento é anterior à etapa e fora do escopo dela (a F00 religou a vigência só na escrita, E04), está documentado e tem etapa própria, V2-F03-E03 ("Vigência em TODA requisição autenticada, leituras inclusive", P0); não é RISCO ACEITO (o item 2 não admite) e não reprova a E09, cuja DoD ("a sessão antiga cai") se cumpre pela renovação e pela escrita. O que é da E09: a frase da janela "{nome} sai de todos os navegadores e aparelhos agora" (`dc360/apps/web/src/paginas/Usuarios.tsx:650`) promete mais do que a API faz para a leitura; corrige junto (dizer que a leitura dura até 15 minutos) ou fica certa depois da F03-E03.
  - Red-team 2 (dívida, dono V2-F02-E03): 414 `FST_ERR_MAX_PARAM_LENGTH` e 400 `FST_ERR_BAD_URL` saem do próprio Fastify, fora da guarda de códigos de erro, em inglês, sem `helmet` e ecoando o caminho; anterior (igual no 5.12.5 de `fd17ff4`), sem dado nem efeito prático (`application/json`). Conserto: `frameworkErrors` no `Fastify()`.
  - UX A2: `papel` ausente devolve "Valor não reconhecido: undefined" só pela API: é o achado 1 da E19, que reprova lá.
  - DV-10 (foco ao `<main>` no WebKit ao fechar janela aberta por clique) igual; DV-11, DV-12 e H35 sem mudança.

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| D-31 item 3 (H36): a E09 reprovou pela quarta vez pela mesma classe (foco fora da vista; agora só ao girar ou dar zoom com a janela já aberta). Decidir em uma linha: consertar mais uma vez (o `resize` do `Modal`, mais o foco em `BODY` depois de erro ou clique no fundo e a frase "agora" de Usuários) ou aceitar com o modelo de ameaça documentado (o próximo Tab traz o botão à vista e nada se perde) | Rafael | decisão de produto exigida pela D-31, item 3 |
| Olhar as capturas da contrapartida (título fora da vista em janela baixa) e aprovar ou pedir outro desenho: `validacao/dda7557/capturas/ux-06-*` e `ux-07-*` | Rafael | gatilho visual (seção 10 de `28`) |
| H39: Safari de iPhone real e Android real na confirmação das sessões e nas janelas de Usuários; VoiceOver no fluxo de Minha conta | Rafael | aparelho físico e leitor de tela |
| H35: confirmar 340 px ou voltar para 360 px (números da rodada 8) | Rafael | decisão de desenho |
| A "Validação humana" da etapa: Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações | Rafael | regra global da seção 4 de `28` |

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet, Red-team (AUTH, TENANT) em Opus com 45 minutos e no máximo 3 achados | feito |
| D-31 item 3 (mesma classe pela quarta vez) | Rafael, H36 | aberto |
| classificação pela D-31 item 1 contra o "PASS" do relatório de Acessibilidade | gatekeeper (Opus), sem arbitragem: o próprio validador mediu o defeito e devolveu a classificação ao gatekeeper; não há dois validadores em conflito sobre o mesmo caso (UX não mediu o caminho do `resize`) | FAIL |

### Métricas da rodada

Achados: 1 bloqueia (A11y 2); 3 corrigem junto (A11y 1 e QA 1, que são o mesmo; frase "agora" do Red-team 1); o resto é dívida ou anotado. Dimensões herdadas: LGPD. Gatilhos visuais: as capturas da contrapartida (ux-06 e ux-07). Tokens de subagente: QA 240 mil (42 min), UX 193 mil (47 min), Acessibilidade 258 mil (112 min), Red-team 151 mil (8 min, Opus).

## Rodada 8 (2026-10-24, SHA 60cbc2f)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Rodada 8 RETOMADA: a primeira tentativa (2026-10-20) foi interrompida pelo reinício do Mac depois do primeiro validador; o relatório de QA da E05 sobre `60cbc2f`, do mesmo SHA, foi preservado em `bc3c535` e aproveitado; os demais validadores rodaram nesta sessão. Candidato `60cbc2f` (correção 7 da F00); HEAD durante a validação `bc3c535`, que só difere em `STATUS.md`, `ESTADO-ATUAL.md` e `validacao/60cbc2f/qa.md` da E05 (lista permitida; `conferir-evidencia` confirmou). Política: D-31 (seção 19 de `28`): validação POR DIFERENÇA (item 4), achado só reprova pelas condições (a), (b) ou (c) do item 1, modelo de ameaça da E05 e da E19 no item 2, CI como prova padrão (item 5), Sonnet como validador padrão e Opus em Segurança e Red-team da E05 e na consolidação (item 6). O que mudou desde a rodada 7: `git diff fd17ff4..60cbc2f` (guarda de códigos de erro da API e do console, catálogo do shared, foco e bordas fixas do painel, `app.css`, ofício, `auditar.mjs` e `auditar-excecoes.mjs`, `ambiente-hostil.mjs`, três testes do aplicativo de campo, `baseline.mjs` (só totais), README, COLOCAR-DE-PE, LEIA-ME do campo e `verificar.yml` com os jobs `windows` e `plataformas`). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (as seções antes de `## Justificativa`, extraídas pelo gatekeeper), a evidência, os relatórios da rodada 7 como pista, as decisões e o run do CI. Ambiente: Mac, Node 24.15.0 (o CI e o `.nvmrc` usam 22; os validadores da E05 baixaram o Node 22.23.3 para o scratchpad), PostgreSQL local, Chromium, Firefox e WebKit do Playwright; sem aparelho, sem emulador e sem Windows local.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX | ux (general-purpose) | claude-sonnet-5-5 | FAIL | media | E2, E3a | E2, E3a |  | validacao/60cbc2f/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-sonnet-5-5 | FAIL | media | E1, E2 | E1, E2 |  | validacao/60cbc2f/acessibilidade.md |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | não rodada nesta rodada (D-31 item 4: só a dimensão que reprovou); vale o PASS de fd17ff4 até a próxima rodada, que tem de rodá-la de novo porque o código da etapa mudou | validacao/fd17ff4/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 | idem | validacao/fd17ff4/red-team.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E3a | E1, E2, E3a | herdado de 1ed0b71, sem impacto | validacao/1ed0b71/privacidade-lgpd.md |

### Motivo do veredito

- Os defeitos da rodada 7 estão CONSERTADOS, medidos de forma independente pelas duas dimensões nos três motores, com o retângulo do campo, do rótulo e da frase de erro contra o topo fixo e a barra do pé: foco depois da senha errada em Minha conta (UX 252 de 252, A11y 198 de 198), Nova ocorrência (UX 122 de 126, A11y 102 medidas; as falhas são a H35), Tab (4529 e 14 331 paradas, nada escondido), ofício "Tentativa N para email" (216 de 216) e nenhuma rolagem lateral (260 telas no UX, 510 medidas na A11y). As sondas mordem: o painel de `fd17ff4` reprova nas mesmas medições.
- UX FAIL e Acessibilidade FAIL, CONCORDANTES (a A11y mediu primeiro e depois confirmou o achado do UX com medição própria), pelo achado comum: no WebKit, depois de confirmar "Encerrar minhas outras sessões" em Minha conta pelo toque ou clique, a frase "A outra sessão foi encerrada. Esta continua aberta." recebe o foco (`MinhaConta.tsx:283`) mas fica sob o topo fixo ou acima da janela (360x640, 390x664, 375x667, 375x553, 320x568, 640x450); a pessoa vê só "Esta é a única sessão aberta na sua conta". Chromium e Firefox passam; pelo teclado o WebKit passa (24 de 24). WCAG 2.4.11 e portão visual da seção 0 de `19` ("escondido atrás de outro elemento") sobre tela e frase que a etapa construiu. Classificação D-31: (a) e (b), alcançável com tela comum de celular no Safari. Não é regressão da correção 6 (igual em `fd17ff4`, que a rodada 7 só mediu por qual elemento tinha o foco, não pela posição), mas é defeito da própria etapa, não anterior a ela, então não vira dívida.
- Acessibilidade FAIL, segundo motivo, só dela: a janela de `ConfirmarAcao` (Redefinir senha e Encerrar sessões em Usuários, Encerrar minhas outras sessões em Minha conta) abre com o foco em "Cancelar" fora da parte visível da janela quando a janela rola por dentro: a 320x256 (zoom de 400 por cento), 568x320 e zoom de 300 por cento, em Chromium e Firefox, o foco fica 150 a 190 px abaixo da borda; a causa medida é `painel.scrollTop = 0` no `Modal`. WCAG 2.4.7 e 2.4.11; classificação (a) pelo critério de zoom de 400 por cento e (b). O UX não mediu esse caminho; não há conflito (dimensões diferentes, nenhum PASS contrário sobre o mesmo critério), por isso não houve arbitragem.
- Limite da prova, declarado pelos dois: é o WebKit do Playwright no macOS, não o Safari de um iPhone; a confiança é média por isso. O fail-closed vale: o defeito foi reproduzido e o portão visual é critério escrito.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha 60cbc2f`: uma FALHA de segredo, falso positivo conhecido (`correcao-6/sondas/api.sh:5` e `correcao-6b/sondas/api.sh:5`, o `JWT_SEGREDO` de teste do roteiro local, já explicado na linha da E09 do STATUS); nenhuma outra falha. `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 89 INDEX.md, 4793 arquivos conferidos byte a byte, OK.
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
| D-31 item 3: a E09 reprovou pela mesma classe de defeito (foco ou confirmação encoberta ou fora da vista) nas rodadas 7 e 8 (e a rodada 6 foi foco perdido em BODY). A rodada 9 da E09 não é automática: decidir em uma linha entre consertar mais uma vez (os dois achados acima) ou aceitar com o modelo de ameaça documentado (a classe não cai na seção 7) | Rafael | decisão de produto exigida pela D-31, item 3 |
| H35: confirmar 340 px ou voltar para 360 px. Número medido pelos dois validadores para a decisão: com 340 px a frase de erro do Relato fica sob a barra do pé de 341 a cerca de 390 px de altura (Android deitado de 640x360); 360 px cobre 341 a 360; só cerca de 400 px cobre tudo, ao custo de a navegação do pé rolar no Android deitado | Rafael | decisão de desenho |
| Safari de iPhone real e VoiceOver no fluxo de Minha conta | Rafael | aparelho físico e leitor de tela |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (as novas desta rodada entram lá no próximo commit de implementador, porque o arquivo está fora da lista permitida do registro).

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Anotado e confirmado pelas duas dimensões (dívida, corrige junto): no WebKit, ao fechar a janela por Cancelar, Esc ou "Já anotei a senha" depois de abrir por clique, o foco vai ao `<main>` e não ao botão (o Safari não foca botão no clique); a DoD pede "foco devolvido ao botão" e vale em Chromium e Firefox e pelo teclado no WebKit. Conserto provável: guardar o botão pelo `currentTarget` do clique.
- Anotado (A11y, dívida): na tabela de Usuários os botões "Redefinir senha" e "Encerrar sessões" (nascidos na etapa) e "Corrigir" e "Desativar" repetem o mesmo nome acessível em cada linha.
- Anotado (A11y, fora da etapa): `target-size` no pino do mapa a 320 px em `/mapa`.
- Anotado (UX): a guarda de 800 ms do ponteiro de `useFocoForaDasBordas` não foi a causa do achado; fica o risco registrado pela correção 6b; a 640 px o topo passa para duas linhas (141 px).

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet, salvo Segurança e Red-team da E05 em Opus | feito |
| D-31 item 3 (segunda reprovação pela mesma classe) | Rafael, em `pendencias-humanas.md` | registrado; a rodada 9 da E09 espera a decisão |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: UX e A11y concordam no achado comum |

### Métricas da rodada

Validadores desta etapa: 2 (UX cerca de 56 minutos, A11y cerca de 59 minutos, Sonnet). Achados: 2 bloqueiam (1 comum às duas dimensões, 1 só da A11y), 4 anotados ou dívidas, H35 medida. Capturas em `validacao/60cbc2f/capturas/` (36 arquivos, UX e `a11y-`). Gatilhos visuais: "escondido atrás de outro elemento" e "zoom de 400 por cento".

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/red-team.md |
| UX | ux (general-purpose) | claude-opus-5-5 | FAIL | alta | E2, E3a | E2, E3a |  | validacao/fd17ff4/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/acessibilidade.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E3a | E1, E2, E3a | herdado de 1ed0b71, sem impacto | validacao/1ed0b71/privacidade-lgpd.md |

### Motivo do veredito

- Os dois defeitos que reprovaram a rodada 6 estão consertados e confirmados por QA, UX e Acessibilidade: o foco não cai mais em BODY depois da senha errada (90 de 90 no campo certo, nos três motores; seção 10 do `layout-estreito` verde em Chromium, Firefox e WebKit) e o e-mail das janelas "Redefinir senha" e "Desativar usuário" quebra só depois de "@" ou ".".
- UX FAIL e Acessibilidade FAIL (Opus, alta), concordantes e medidos de forma independente (retângulo do elemento focado contra o das barras fixas, nos três motores): a correção 5 trocou o foco por `scrollIntoView({ block: "nearest" })` em `componentes/foco.ts` e pôs `scroll-padding-top` só no bloco de até 600 px de `estilos/app.css`, e o campo focado depois do erro fica ENCOBERTO (WCAG 2.4.11, Foco não encoberto, AA; portão visual da seção 0 de `19`, "escondido atrás de outro elemento" e "zoom de 200% sem perda"):
  - acima de 600 px e no zoom de 200%: Minha conta a 640x450 (1280x900 com zoom de 200%), campo "Senha que você usa hoje" inteiro sob o topo fixo em Chromium e Firefox; a 768x600 o rótulo sai cortado pelo topo; a 1024x600 e 1280x600 o rótulo fica atrás do topo;
  - até 600 px: Nova ocorrência a 390 e 320 px, Enter no nome do solicitante, o foco vai a "Endereço", que fica inteiro sob a barra fixa do pé nos três motores, sem nada à vista que diga o que falta; Minha conta a 320x256 (zoom de 400%) igual.
  - É regressão desta correção: a mutação com `foco.ts` e `app.css` de `1ed0b71` mostra o campo à vista (salvo WebKit a 390).
- UX FAIL também por: a linha "Tentativa N para email" do histórico de envio do ofício (`Ocorrencia.tsx`, mudada nesta correção) é item de linha `flex` e `overflow-wrap: break-word` não reduz a largura mínima dele; com e-mail cuja parte local sem ponto passa de cerca de 30 caracteres, a linha sai do cartão a 360 px e a página rola de lado a 320 px.
- QA PASS (Opus, alta; 20 de 20 na sonda própria nos três motores; id próprio em maiúsculas 422, id de outro município em maiúsculas ou com hífens codificados 404) e Red-team PASS (Opus, alta). LGPD herdada de `1ed0b71`, sem impacto.
- Conserto mínimo apontado (não implementado): `scroll-padding-bottom` da altura da barra do pé no bloco de até 600 px; `scroll-padding-top` da altura real do topo também acima de 600 px (ou medido por variável); `min-width: 0` (ou `flex-shrink`) no item da linha "Tentativa N"; zoom de 200% e 400% e o campo abaixo da janela na seção 10 do `layout-estreito`.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
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
| Fazer o fluxo no painel e aprovar a frase da senha única e as confirmações (capturas em `validacao/fd17ff4/capturas/`) | Rafael | texto de produto, jornada nova, mudança grande de UX e erro crítico |
| Prazo de retenção e base legal de guardar IP e user-agent de sessão (CP-10) | DPO e controlador | decisão jurídica |
| Leitor de tela nas confirmações | Rafael ou CP-32 | limite da seção 4 de `28` |
| Depois do conserto do encobrimento, conferir no notebook da prefeitura com zoom de 200% que o campo focado depois do erro fica à vista (capturas desta rodada em `validacao/fd17ff4/capturas/`, por exemplo `ux-E09-zoom200-minha-conta-senha-errada-640-claro-chromium.png` e `ux-E09-foco-abaixo-nova-ocorrencia-sha-390-claro-chromium.png`) | Rafael | percepção visual no aparelho real e zoom real do navegador |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (Acessibilidade, anterior à correção): no Tab natural, até 600 px e a 640x450, o elemento que recebe o foco perto do pé fica atrás da barra fixa do pé (Nova ocorrência, Órgãos, Minha conta).
- Corrige antes de crescer (Acessibilidade, anterior à fase): até 600 px o link `.identidade` do topo não tem nome acessível (axe `link-name`).
- Anotado (QA): a primeira tela de entrada deixa o foco em BODY depois da senha errada (ver E05); só no WebKit, a recarga completa saindo do Painel gera `pageerror` dos pedidos cancelados, tratados pelo código.
- Anotado (Red-team): sem lockout por conta em `/auth/trocar-senha` (ver E07).
- Registro do gatekeeper: durante esta rodada, outra sessão do Claude já trabalhava numa correção 7 no worktree `.claude/worktrees/wf_249935fe-9f4-1` (ramo `trab/correcao-7`), lendo os relatórios desta rodada ainda não commitados; ela não tocou a árvore principal (conferido a cada validador). A correção dela será validada como candidato novo.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus (as dimensões de LGPD foram herdadas da rodada 6, em Sonnet) | feito |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: nenhuma dimensão teve vereditos opostos; onde uma etapa tem PASS e FAIL, são dimensões diferentes sobre critérios diferentes |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: LGPD. Dimensões que reprovaram: UX, Acessibilidade. Gatilhos visuais: os da rodada 6, sem novo; a E09 reprova por portão visual (seção 0 de `19`) e WCAG 2.4.11. Tokens e tempo não gravados por dimensão (cada validador cobriu um lote de etapas; os 12 validadores e a complementação do Red-team somaram cerca de 3,7 milhões de tokens de subagente e 6 horas e 46 minutos de execução).

## Rodada 6 (2026-10-20, SHA 1ed0b71)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `1ed0b71` (correção 5 da F00); HEAD durante a validação `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida; `conferir-evidencia` confirmou). Base do lote: `afde25c`; o que mudou desde a rodada 4: `git diff bb0f654..1ed0b71`. A rodada 5 (sobre `4ce0433`) foi interrompida pelo reinício do Mac sem veredito: os relatórios dela ficaram como evidência parcial e NÃO foram herdados (não houve consolidação, conferência de formato nem registro da árvore depois de cada validador); os FAIL dela foram entregues aos validadores como pista. Herança da rodada 4 (`impacto.mjs`, com o nome da dimensão tirado do arquivo): NÃO herdável em todas as dimensões PASS, porque o diff toca o mapa de todas (`dc360/README.md`, `apps/api/src/auth/`, `apps/console/src/`, `apps/campo/src/`, `apps/api/test/`, `db/migrations/051`), salvo a Especificação da E12. Validadores: as dimensões da rodada 4 de cada etapa (as obrigatórias de `tags.mjs` pelo texto da etapa mais as acrescentadas em rodadas anteriores). Foram 18 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (75 relatórios). Modelo: Opus em todas as dimensões (gatilho 5 da seção 12, rodada acima da terceira; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo e os achados da rodada 4, a lista dos relatórios da rodada 5, as decisões e o estado do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB baixados pelo gatekeeper para o scratchpad, porque os da rodada 4 se perderam com o reinício), PGlite, Chromium e Firefox do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android nem aparelho.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/qa.md |
| Red-team | red-team (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/red-team.md |
| UX | ux (general-purpose) | claude-opus-5-5 | FAIL | alta | E2, E3a | E2, E3a |  | validacao/1ed0b71/ux.md |
| Acessibilidade | acessibilidade (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/1ed0b71/acessibilidade.md |
| LGPD | privacidade-lgpd (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1, E3a | E1, E2, E3a |  | validacao/1ed0b71/privacidade-lgpd.md |

### Motivo do veredito

- UX FAIL (Opus, alta) e Acessibilidade FAIL (Opus, alta), concordantes e reproduzidos de forma independente: no Firefox, depois de enviar a senha errada em "Minha conta" e em "Defina a sua senha", o foco cai em BODY (clique e Espaço; 9 de 9 na UX, 6 de 6 por tela na Acessibilidade, com e sem janela) ou fica no último campo (Enter), e nunca vai ao campo inválido (WCAG 2.4.3). É o defeito que a correção 4 (item 3, "Foco depois de enviar") declarou consertado, provado só em Chromium. O e2e da etapa reprova: `node scripts/e2e-api.mjs firefox` sai 1 porque `layout-estreito.e2e.mjs`, seção 10, falha 7 verificações no Firefox (149 de 149 no Chromium). Causa medida pela Acessibilidade: o `requestAnimationFrame` agendado no `catch` depois do `await` roda antes de o React marcar `aria-invalid`. O mesmo vermelho foi visto, sem ser causa delas, pelo QA da E11 e da E18 e pelos Testes da E18.
- UX FAIL, segundo motivo: na janela "Redefinir senha" (entrega da etapa), a linha "matrícula, email, papel" quebra o email no meio da palavra a 390 px ("...secretar / ia...", claro e escuro), a 360 px e a 320 px, inclusive com um email comum de 39 caracteres; a correção 4 consertou a tabela com `EmailQuebravel` e deixou a janela. Viola o portão visual (nada quebrado no meio da palavra).
- QA PASS (Opus, alta), Red-team PASS (Opus, alta: o IDOR por id em maiúsculas da rodada 4 está fechado, `id-da-propria-conta.test.ts` 13 de 13, sem a normalização 6 reprovam) e LGPD PASS (Sonnet, alta) não contradizem: o QA declarou que rodou só Chromium, e as outras dimensões não avaliam foco nem quebra de linha. Por isso o gatekeeper não acionou arbitragem.
- Conserto mínimo apontado (não implementado): mover o foco depois que o React renderizar o estado de erro (efeito sobre o estado, não `requestAnimationFrame` no `catch`), com a seção 10 do `layout-estreito` verde no Firefox; `EmailQuebravel` (ou a mesma regra) na dica da janela "Redefinir senha", com captura a 320 e 390 px.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E09 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
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
| Fazer o fluxo no painel e aprovar a frase da senha única e as confirmações (capturas em `validacao/1ed0b71/capturas/`) | Rafael | texto de produto, jornada nova, mudança grande de UX e erro crítico |
| Prazo de retenção e base legal de guardar IP e user-agent de sessão (CP-10) | DPO e controlador | decisão jurídica |
| Leitor de tela nas confirmações | Rafael ou CP-32 | limite da seção 4 de `28` |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- LGPD, anotado: `sessoes.ip` e `sessoes.user_agent` ficam completos e sem prazo de expurgo (dono V2-F05-E12); `docs/PRIVACIDADE.md` ainda não lista IP e user-agent de servidor como dado tratado.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 6 aparente (QA PASS, UX e A11y FAIL) | não acionada | o QA não exercitou o Firefox (declarado em Não verificado); duas reproduções independentes do defeito |
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
