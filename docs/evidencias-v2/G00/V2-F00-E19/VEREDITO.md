# VEREDITO de V2-F00-E19

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | 2026-10-24 | dda7557 | d4683cc (run 40132234324, 12 de 12 verdes) | FAIL | 8832367 | 0b32d38 | e7e1326 |
| 8 | 2026-10-24 | 60cbc2f | c680f8d (run 39524190207, 12 de 12 verdes) | FAIL | 8832367 | 0b32d38 | 60cbc2f |
| 7 | 2026-10-20 | fd17ff4 | 55209ab (run 39420436042, 9 de 9 verdes) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 6 | 2026-10-20 | 1ed0b71 | ausente (run 39366804765 recusado, H32) | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 5 | 2026-10-20 | 4ce0433 | 766bc0a | INTERROMPIDA, sem veredito (relatórios parciais em validacao/4ce0433/ quando houver) | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 4 | 2026-10-19 | bb0f654 | ausente (não lido) | BLOCKED | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 3 | 2026-10-15 | 52952a1 | 7585801 | PASS | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 9 (2026-10-24, SHA dda7557)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Candidato `dda7557` (correção 7 da E09 e correção 10 da E19, com a migração do `zod` 3.25.76 para 4.6.7, `fastify` 5.12.7 e `fast-uri` 3.1.9 e 4.2.3); HEAD durante a validação `d4683cc`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). SHA no remoto (`origin/v2/f00`), árvore limpa no início. Política: D-31 (seção 19 de `28`), validação POR DIFERENÇA desde a rodada 8 (`60cbc2f`): E09 e E19 nas dimensões que reprovaram (E09 também QA e Red-team, que a rodada 8 mandou rodar de novo porque o código da etapa mudou), mais as etapas cujo código a migração do `zod` tocou, pela autoria dos patches arquivados: E06 (`pedidoDeEvidenciaSchema` em `packages/shared/src/evidencia.ts`, onde a E06 pôs `coletadaPor`, mais o UUID mais estrito) e E15 (dublê de UUID trocado num teste dela). `apps/api/src/config.ts`, `apps/api/src/rotas/aparelhos.ts`, `mensagens-do-zod.ts`, os `package.json` e os lockfiles só têm a E19 como autora na F00; o `schemas.ts` foi tocado pela E22 só num comentário (`correcao-4`), por isso a E22 herda; `baseline.mjs`, README e COLOCAR-DE-PE mudaram só em totais (conferidos por `conferir:numeros`, D-31 item 4) e no parágrafo da política do CP-03, que é da E19. As demais etapas herdam a rodada 8 (código delas não mudou). `impacto.mjs --herdavel` responde "NÃO herdável" a todo relatório anterior a `8832367` porque o diff inclui a própria emenda D-31; a rodada 8 já aplicou a D-31 e a herança aqui segue o item 4 dela (código da etapa). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido mais as instruções comuns da rodada (scratchpad): o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (antes de `## Justificativa`), a evidência, os relatórios anteriores como pista, as decisões e o run do CI. Ordem: Infra e CI da E19, QA de E19, E06 e E15 (um validador, três relatórios), QA, UX e Acessibilidade da E09 (Sonnet) e Red-team da E09 (Opus, 45 minutos, no máximo 3 achados). Ambiente: Mac, Node 24.15.0 (o CI usa 22), PGlite e Postgres local, Chromium, Firefox e WebKit do Playwright; sem aparelho, emulador ou Windows local.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Infra e CI | engenharia-entrega (general-purpose) | claude-sonnet-5-5 | PASS | alta | E1 | E1, E2 |  | validacao/dda7557/engenharia-entrega.md |
| QA | qa (general-purpose) | claude-sonnet-5-5 | FAIL na consolidação (o relatório diz PASS; achado 1 bloqueia pela D-31, item 1 (b), ver Motivo) | media | E1, E2 | E1, E2 |  | validacao/dda7557/qa.md |

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

- Os defeitos da rodada 8 estão CONSERTADOS, concordantes nas duas dimensões: `auditar` 0 no CI (Linux e Windows) e hoje (gatekeeper e validador, 2026-10-24 por volta das 21h UTC); `npm audit --omit=dev` na raiz 0; `fastify` 5.12.7, `fast-uri` 3.1.9 e 4.2.3, `zod` do produto 4.6.7 na raiz e no aplicativo; `braces` e `sprintf-js` fora da lista do aplicativo; `expo-doctor` 21 de 21 sem pular a checagem de versões, inclusive no job de linha de base do CI. A exceção nova do `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5) vale só para a cópia que o `@expo/cli` carrega em `node_modules/expo/node_modules/` (ferramenta de build, não vai ao telefone; o bundle do Metro, gerado pelo validador com `expo export`, leva o Zod 4); três mutações fora do repositório (cópia do produto vulnerável, as duas cópias, relatório sem `nodes`) fazem o portão sair 1. É exceção pela política do CP-03 (mesma natureza de `node-forge` e `shell-quote`, dono Rafael, prazo 2027-01-05), não aceite avulso do item 7 da seção 7.
- Migração do Zod 4 (QA, 130 mil comparações Zod 3 contra Zod 4 sobre os esquemas exportados de `packages/shared` e os da API): nenhuma validação ficou mais frouxa de forma alcançável (só mais estrita: UUID RFC, `datetime` sem segundos); nenhuma frase em inglês; forma do erro da API igual; `test:e2e:api` 325 de 325, API 1717, shared 224; o teste novo do `uuidSchema` e a linha `error` da varredura de acentos mordem.
- **Bloqueia (QA, achado 1), classificação do gatekeeper pela D-31, item 1 (b):** a correção 10 introduziu uma regressão de frase: campo obrigatório que é enum e chega ausente agora responde "Valor não reconhecido: undefined. Os aceitos são: ..." em vez de "Campo obrigatório" (o ramo `invalid_value` de `packages/shared/src/mensagens-do-zod.ts` não trata `issue.input === undefined`). Reproduzido pelo validador num 422 real (`POST /ocorrencias` sem `tipo` e sem `canalEntrada`) e pelo gatekeeper sobre `aberturaOcorrenciaSchema` (`canalEntrada` e `tipo` com a frase nova, os campos de texto com "Campo obrigatório"); o UX da E09 achou o mesmo em `papel` ausente. Atinge todo esquema com enum obrigatório (abertura de ocorrência, cadastro de usuário, triagem, devolução de tarefa, encerramento de saída, resposta de providência, evidência perdida, evento de trilha). O validador classificou como dívida "a pagar antes de crescer" e escreveu que a condição (b) "se cumpre (alcançável por quem chama a API)"; o gatekeeper aplica a regra como está escrita: o achado é alcançável por usuário externo no produto deste SHA (integrador que chama a API, e o 422 que chega ao aparelho), é defeito NOVO desta correção (não anterior à etapa, então não cabe na exceção de dívida) e põe o identificador `undefined` de JavaScript numa frase em português, contra o FATO declarado ("Todas as frases em português são as mesmas") e contra o objetivo do mapa (`mensagens-em-portugues.test.ts`). O painel e o aplicativo não mostram a frase hoje porque os selects têm valor inicial. Conserto: tratar `issue.input === undefined` no começo do ramo `invalid_value` ("Campo obrigatório") e um caso em `mensagens-em-portugues.test.ts` que prenda a frase para um enum ausente.
- Não é a mesma classe das reprovações anteriores da E19 (falso verde do portão nas rodadas 6 e 7; advisory nova na 8): o item 3 da D-31 não se aplica.
- Conserto (sessão de implementador, correção 11): o achado 1; e, no mesmo lote, os textos falsos de documentação do QA, achado 2 (`dc360/README.md:2019` e `dc360/apps/campo/LEIA-ME.md:152` dizem "as seis exceções nomeadas do CP-03", hoje são 5 pacotes e 7 advisories; `LEIA-ME.md:44` ainda lista `braces` e `sprintf-js`), o LEIA-ME do aplicativo sem a subida dos cinco patches do Expo, a entrada do `zod` 4 e a exigência de novo binário nativo (Infra, achado 2: a etapa pede "novo binário nativo, registrado no LEIA-ME") e o README que cita só dois dos três pacotes de desenvolvimento (Infra, achado 3). Depois, CI completo verde e rodada 10 da E19 (QA, por diferença; o Infra e CI fica herdado se o diff só tocar `mensagens-do-zod.ts`, o teste e a documentação).

### Achados que viram dívida (propostas para `dividas.md`, registro pelo próximo commit de implementador, porque o arquivo está fora da lista permitida)

- QA 3 e QA da E06 1: a função `error` de `tamanhoBytes` (`packages/shared/src/evidencia.ts` perto da linha 102) separa "não foi informado" de "precisa ser um número", e o mutante que apaga a distinção sobrevive (224 de 224). Comportamento correto hoje. Dívida de teste, dono E19, corrige junto da correção 11.
- QA 4 (latente): `JSON.stringify(issue.input)` no ramo de enum do mapa lança `TypeError` com BigInt; JSON não carrega BigInt. Dono V2-F02-E03, antes do G02.
- QA 5 (latente): objeto `Date` passa onde se espera objeto em esquemas só com campos opcionais; JSON e query string não o produzem. Dono V2-F02-E03, antes do G02.
- QA 6: DV-21 é um pouco mais larga do que o registro (`tamanhoBytes: 1e21`, alcançável por JSON, só muda a frase); DV-19 e DV-20 confirmadas como estão.
- QA 7 (anterior à etapa): o `apps/console` não importa o mapa do shared e responde em inglês ("Invalid input: expected string, received undefined"), como já respondia no Zod 3 ("Required"). Dono: a etapa que tocar o console (F01 ou F02), antes do G02.
- Infra 1: a DV-05 ficou desatualizada: o job de linha de base do CI prova `expo-doctor` 21 de 21 sem pular a checagem, mas só em `[ci completo]`, agenda ou disparo manual; reescrever a DV-05 para "falta prova em todo push".
- Infra 5: o CI não roda o Metro (`expo export`) sobre o aplicativo; sugerido um passo barato no job `aplicativo` (V2-F01-E02, antes do G01).
- Infra 4 (máquina, não repositório): o `node_modules` do aplicativo na árvore principal deste Mac está desatualizado em relação ao lockfile (`expo` 57.0.30 e `zod` 3.25.76 no topo); um `npm ci` resolve.

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ler a lista de exceções do aplicativo com dono e prazo, agora com a exceção estreita do `zod` 3 do `@expo/cli` (`somenteEm`), e confirmar a migração para o Zod 4 (H37) | Rafael | "Validação humana" da etapa e decisão do CP-03 |
| Novo binário nativo do aplicativo antes da próxima entrega aos agentes (cinco patches do Expo e o `zod` 4) | Rafael | aparelho e loja |

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet | feito |
| classificação pela D-31 item 1 contra o "PASS" do relatório de QA | gatekeeper (Opus), sem arbitragem: não há dois validadores em conflito, só a regra aplicada ao achado que o próprio validador descreveu como alcançável | FAIL |

### Métricas da rodada

Achados: 1 bloqueia (QA 1); 4 corrigem antes de crescer, junto da correção 11 (QA 2, QA 3, Infra 2, Infra 3); os outros viram dívida ou ficam anotados. Dimensões herdadas: nenhuma (as duas obrigatórias da etapa rodaram). Gatilhos visuais: não se aplica. Tokens de subagente: Infra e CI 146 mil (7,7 min); QA do lote E19, E06 e E15 375 mil (30 min).

## Rodada 8 (2026-10-24, SHA 60cbc2f)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-24. Rodada 8 RETOMADA: a primeira tentativa (2026-10-20) foi interrompida pelo reinício do Mac depois do primeiro validador; o relatório de QA da E05 sobre `60cbc2f`, do mesmo SHA, foi preservado em `bc3c535` e aproveitado; os demais validadores rodaram nesta sessão. Candidato `60cbc2f` (correção 7 da F00); HEAD durante a validação `bc3c535`, que só difere em `STATUS.md`, `ESTADO-ATUAL.md` e `validacao/60cbc2f/qa.md` da E05 (lista permitida; `conferir-evidencia` confirmou). Política: D-31 (seção 19 de `28`): validação POR DIFERENÇA (item 4), achado só reprova pelas condições (a), (b) ou (c) do item 1, modelo de ameaça da E05 e da E19 no item 2, CI como prova padrão (item 5), Sonnet como validador padrão e Opus em Segurança e Red-team da E05 e na consolidação (item 6). O que mudou desde a rodada 7: `git diff fd17ff4..60cbc2f` (guarda de códigos de erro da API e do console, catálogo do shared, foco e bordas fixas do painel, `app.css`, ofício, `auditar.mjs` e `auditar-excecoes.mjs`, `ambiente-hostil.mjs`, três testes do aplicativo de campo, `baseline.mjs` (só totais), README, COLOCAR-DE-PE, LEIA-ME do campo e `verificar.yml` com os jobs `windows` e `plataformas`). Validadores em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, com o prompt de `prompt-do-validador.md` preenchido: o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` das correções (as seções antes de `## Justificativa`, extraídas pelo gatekeeper), a evidência, os relatórios da rodada 7 como pista, as decisões e o run do CI. Ambiente: Mac, Node 24.15.0 (o CI e o `.nvmrc` usam 22; os validadores da E05 baixaram o Node 22.23.3 para o scratchpad), PostgreSQL local, Chromium, Firefox e WebKit do Playwright; sem aparelho, sem emulador e sem Windows local.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-sonnet-5-5 | FAIL | media | E1, E2 | E1, E2 |  | validacao/60cbc2f/qa.md |
| Infra e CI | engenharia-entrega (general-purpose) | claude-sonnet-5-5 | FAIL | media | E1 | E1, E2 |  | validacao/60cbc2f/engenharia-entrega.md |

### Motivo do veredito

- O defeito da rodada 7 está CONSERTADO, concordante nas duas dimensões: com `package-lock=false` num `.npmrc` o `auditar` sai 1 (npm 11 e npm 10.9.2); desfeito o `--package-lock=true` numa cópia, o npm real volta a dar "Runtime limpo" com código 0 e 3 testes ficam vermelhos (72 de 75). O CI agora recusa `.npmrc` versionado, chama o `auditar` por `node` e roda o portão em Windows; o shrinkwrap é recusado pelo próprio `auditar`. Nenhum falso vermelho no uso legítimo.
- QA FAIL e Infra e CI FAIL, CONCORDANTES, por um motivo NOVO e externo, que o próprio portão acusa: HOJE (2026-10-24) o `auditar` sobre o lockfile deste SHA sai **1**, "REPROVADO: 1 high, 1 moderate, 1 low em dependência de runtime" (o gatekeeper reproduziu na árvore real: código 1). São advisories publicadas DEPOIS do run verde de 2026-10-21: `fast-uri` (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp, 23/10, corrigidas na faixa), `fastify` 5.12.5 (GHSA-389g-gv7q-r4x8, baixa, 22/10, corrigida em 5.12.6) e `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, alta, atualizada em 23/10 com faixa `< 4.6.6`; a descrição fala do zod 4 e a correção é salto de major, possível falso positivo de faixa). No aplicativo, o portão sai **2** porque as exceções aceitas `braces` (GHSA-vfj7-8cjw-p6xm) e `sprintf-js` (GHSA-hp3w-g68c-fv3c) foram retiradas (withdrawn) do registro, e o `zod` aparece como nova. O `expo-doctor` dá 20 de 21 hoje (patches de 21 e 22/10; o CI pula essa checagem por desenho).
- Classificação D-31: (a), a DoD pede zero runtime vulnerável e `auditar` verde nas duas árvores; e (c), item 7 da seção 7 (dependência de execução com vulnerabilidade conhecida; exceção só pela política do CP-03, nunca por aceite avulso). Não é a mesma classe das rodadas 6 e 7 (falso verde do portão): aqui o portão fez o que devia e o vermelho é verdadeiro. Por isso o item 3 da D-31 não se aplica à E19.
- Conserto (sessão de implementador): `npm audit fix` na raiz para `fast-uri` e `fastify`; decisão sobre o `zod` (subir para o 4 com a correção, ou exceção pela política do CP-03, que hoje não prevê exceção de runtime); apagar as exceções retiradas `braces` e `sprintf-js`; `npx expo install --check`; CI completo verde e rodada 9 da E19 (QA e Infra e CI).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha 60cbc2f`: sem falha (INDEX.md SHA-256 a SHA-256, lista permitida, regras commitadas, segredos, travessão). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 89 INDEX.md, 4793 arquivos conferidos byte a byte, OK.
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
| Decidir o `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, alta, correção só no salto para o 4): subir de major ou criar na política do CP-03 a exceção de runtime para advisory cuja faixa não alcança o código usado | Rafael | decisão de política (CP-03); o item 7 da seção 7 não admite aceite avulso |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (as novas desta rodada entram lá no próximo commit de implementador, porque o arquivo está fora da lista permitida do registro).

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Dívida (QA achado 1, Infra e CI achado 3; classificação do gatekeeper pelo item 2 da D-31): a marca `dev` do `package-lock.json` é a fronteira que o portão usa entre runtime e desenvolvimento; com `dev: true` posto à mão num `fast-uri` 3.0.1 de runtime, o `auditar` sai 0. O portão confia no lockfile versionado (item 2), e a marca errada exige lockfile editado à mão ou corrompido dentro do repositório, então vira dívida e não reprova. Há conflito de FATO entre validadores, sem efeito no veredito: o QA da E19 viu o `npm ci --omit=dev` instalar o pacote marcado, em npm 11 (Node 24); o QA da E22 mostrou que o npm 10.9.9 do `node:22-bookworm-slim` do Dockerfile não o instala. A frase de `dc360/README.md:1686-1689` vale para a imagem e não diz que depende do npm 10. Conserto sugerido: calcular o runtime pelo grafo de `package.json` e não pela marca; dono E19, antes do G01. Registrar em `dividas.md` no próximo commit de implementador. Se Rafael ler o item 2 de outro modo, este achado sobe para bloqueante pelo item 7.
- Dívida (QA achado 4, Infra e CI achado 2): o critério "`expo-doctor` 21 de 21 sem pular a checagem de versões" não tem prova de CI, porque o job `aplicativo` pula a checagem por desenho; a prova local é perecível.
- Anotado (QA): qualquer chave comum no `~/.npmrc` da máquina (por exemplo `save-exact=true`) faz o `npm run auditar` sair 2; fora do modelo de ameaça, vale uma linha no README de como diagnosticar.
- Anotado (Infra e CI): aviso `sem dono e prazo: vite` (desenvolvimento) no log do job.
- Consequência para as outras etapas: a linha de base da E01 (passo 14, `npm run auditar` com código 0) sairia com código 3 se repetida hoje, e três frases do README e do COLOCAR-DE-PE tratam o `auditar` como verde; as duas coisas se resolvem com o conserto desta etapa.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| gate crítico G00 (seção 12 de `28`) e D-31 item 6 | consolidação em Opus; validadores em Sonnet, salvo Segurança e Red-team da E05 em Opus | feito |
| item 7 da seção 7 de `28` | Rafael (decisão do `zod`) e sessão de implementador (o resto) | registrado; sem risco aceito |

### Métricas da rodada

Validadores desta etapa: 2 (QA cerca de 17 minutos, Infra e CI cerca de 7 minutos, Sonnet). Achados: 1 bloqueia (comum às duas dimensões), 2 dívidas, 3 anotados. Dimensões herdadas: nenhuma.

## Rodada 7 (2026-10-20, SHA fd17ff4)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `fd17ff4` (correção 6 da F00); HEAD durante a validação `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 6: `git diff 1ed0b71..fd17ff4` (guarda de códigos de erro da API e do console, `servidor.ts`, `auth/suspensao.ts`, `codigos-de-erro.ts`, foco e e-mail quebrável no painel, `app.css`, `auditar.mjs` e `auditar-excecoes.mjs`, `conferir-indices-de-evidencia.mjs`, `baseline.mjs`, `e2e-api.mjs`, `verificar.yml`, README e testes). Herança (`impacto.mjs --herdavel` sobre cada relatório PASS da rodada 6): herdáveis só Banco de E05, E07, E12 e E25 e LGPD de E09, E10, E11, E15 e E17 (o diff não toca o mapa delas); as demais dimensões PASS não são herdáveis porque o diff toca o mapa (`.github/workflows/verificar.yml`, `apps/api/src/auth/suspensao.ts`, a guarda do console, `apps/api/test/codigos-de-erro.test.ts`). A Especificação da E12, herdada da rodada 4 na rodada 6, NÃO foi herdada: o mapa dela é vazio e o gatekeeper não herda às cegas. Validadores: as dimensões da rodada 6 de cada etapa (nenhuma tirada). Foram 12 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada no scratchpad), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (67 relatórios). Modelo: Opus em todas (gatilho 5 da seção 12, rodada acima da terceira, e gate crítico). Os validadores receberam o bloco da etapa (`contexto.mjs`), só os FATOS dos `RESUMO.md` (a Justificativa proibida), a lista da evidência, o motivo e os relatórios da rodada 6 como pista, as decisões e o run do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB no scratchpad), PGlite, Chromium, Firefox e WebKit do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android, sem aparelho e sem Windows.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 |  | validacao/fd17ff4/qa.md |
| Infra e CI | engenharia-entrega (general-purpose) | claude-opus-5-5 | FAIL | alta | E1 | E1, E2 |  | validacao/fd17ff4/engenharia-entrega.md |

### Motivo do veredito

- QA FAIL e Infra e CI FAIL (Opus, alta), concordantes e reproduzidos de forma independente (npm 11 e npm 10.9.2): `dc360/scripts/auditar-excecoes.mjs` (`BANDEIRAS_DA_CONSULTA_REAL`, linhas 327 a 333) não anula `package-lock`. Com `package-lock=false` num `dc360/.npmrc` (uma linha) e um `package-lock.json` com `fast-uri` 3.0.1 (advisory alta, dependência de runtime, aninhada em `ajv`), o `npm audit` deixa de ler o lockfile e audita a árvore ideal das faixas do `package.json` (os mesmos 249 pacotes, então a contagem não denuncia), e o `auditar` sai 0 com "Runtime limpo". Sem o `.npmrc`, o mesmo lockfile sai 1. O estágio `dependencias` do `Dockerfile` (`npm ci --omit=dev`, que não copia o `.npmrc`) instala o 3.0.1 e o próprio npm acusa "1 high". O job 118619736543 roda sem instalar, pelo mesmo caminho da reprodução: prova só que a árvore real, sem `.npmrc`, está limpa.
- O README (seção do `auditar`) diz que o portão nunca aprova sem ter auditado e que `.npmrc` do projeto não muda o resultado; este caminho não está nem na lista do que ele anula nem na do que fica fora do alcance.
- O FAIL da rodada 6 está consertado: `offline`, `prefer-offline`, cache, registro que responde `{}` ou `{"advisories":{}}`, canário forjado, HTTP 500, timeout, proxy seletivo, `.npmrc` hostil do projeto e do usuário, variáveis `npm_config_*`, npm falso no PATH, advisory nova (`forge-nova`) e exceção vencida, 40 negativos, todos seguraram.
- Item 7 da seção 7 de `28` (dependência de execução com vulnerabilidade conhecida): NÃO admite risco aceito. É a mesma classe do FAIL da rodada 6 (configuração do npm produz verde falso): falso verde repetido (seção 11 de `28`).
- Conserto mínimo, provado pelos dois validadores numa cópia (não implementado): `--package-lock=true` nas bandeiras da consulta real, mais um caso em `auditar.test.mjs` com `package-lock=false` no `.npmrc` da raiz; avaliar `--workspaces` e `--include-workspace-root` explícitos.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha fd17ff4`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 77 INDEX.md, 3703 arquivos conferidos byte a byte, OK.
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
| H24: confirmar ou mandar desfazer a subida dos pacotes do Expo das correções 4 e 5 | Rafael | decisão de produto |
| Recompilar o binário nativo com os pacotes novos e abrir num aparelho (V2-F14-E12) | Rafael | aparelho físico |
| Decidir o conserto do `package-lock=false` antes do G00 (item 7 da seção 7 de `28`: não admite risco aceito) e confirmar o `auditar` no Windows | Rafael | decisão sobre o portão de dependências e plataforma que nenhum agente tem |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (Infra e CI): o CI inteiro confia em `npm run`; uma linha `script-shell=/usr/bin/true` num `.npmrc` versionado em `dc360/` faz todos os passos saírem 0 sem executar nada, com os 9 jobs verdes. Exige mudança deliberada visível no diff; nenhum passo confere que o script rodou (chamar `node scripts/auditar.mjs` direto, exigir "Runtime limpo" na saída, ou o job `roadmap` recusar `.npmrc` versionado). Este run não foi afetado (não há `.npmrc` no repositório).
- Anotado (QA): lockfile adulterado que marca pacote de runtime vulnerável como `dev: true` passa com 0, mas o `npm ci --omit=dev` usa a mesma marca e não o instala; o prazo das exceções é comparado em UTC (vence às 21 h de Brasília); a decisão do CP-03 não tem pasta em `docs/evidencias-v2/CP-03/`.
- Anotado (Infra e CI): `auditar` verde no Windows segue sem prova neste SHA.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus (as dimensões de LGPD foram herdadas da rodada 6, em Sonnet) | feito |
| 6 (vereditos opostos na mesma dimensão) | arbitragem em Opus | não acionado: nenhuma dimensão teve vereditos opostos; onde uma etapa tem PASS e FAIL, são dimensões diferentes sobre critérios diferentes |
| item 7 da seção 7 de `28` e falso verde repetido (seção 11 de `28`), declarados por QA e Infra e CI | Rafael | o critério não admite risco aceito; conserto numa sessão de implementador |

### Métricas da rodada

Achados por severidade: ver Motivo e Achados acima e cada relatório (tentativas de reprovar, mutações que morderam, o que não foi verificado). Dimensões herdadas: nenhuma. Dimensões que reprovaram: QA, Infra e CI. Gatilhos visuais: os da rodada 6, sem novo. Tokens e tempo não gravados por dimensão (cada validador cobriu um lote de etapas; os 12 validadores e a complementação do Red-team somaram cerca de 3,7 milhões de tokens de subagente e 6 horas e 46 minutos de execução).

## Rodada 6 (2026-10-20, SHA 1ed0b71)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, em 2026-10-20. Candidato `1ed0b71` (correção 5 da F00); HEAD durante a validação `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida; `conferir-evidencia` confirmou). Base do lote: `afde25c`; o que mudou desde a rodada 4: `git diff bb0f654..1ed0b71`. A rodada 5 (sobre `4ce0433`) foi interrompida pelo reinício do Mac sem veredito: os relatórios dela ficaram como evidência parcial e NÃO foram herdados (não houve consolidação, conferência de formato nem registro da árvore depois de cada validador); os FAIL dela foram entregues aos validadores como pista. Herança da rodada 4 (`impacto.mjs`, com o nome da dimensão tirado do arquivo): NÃO herdável em todas as dimensões PASS, porque o diff toca o mapa de todas (`dc360/README.md`, `apps/api/src/auth/`, `apps/console/src/`, `apps/campo/src/`, `apps/api/test/`, `db/migrations/051`), salvo a Especificação da E12. Validadores: as dimensões da rodada 4 de cada etapa (as obrigatórias de `tags.mjs` pelo texto da etapa mais as acrescentadas em rodadas anteriores). Foram 18 validadores `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (instruções comuns da rodada), chamados em PRIMEIRO PLANO e em sequência estrita, um por vez, sobre a árvore principal, cada um cobrindo uma ou mais etapas e gravando um relatório por etapa (75 relatórios). Modelo: Opus em todas as dimensões (gatilho 5 da seção 12, rodada acima da terceira; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo e os achados da rodada 4, a lista dos relatórios da rodada 5, as decisões e o estado do CI. Ambiente: PostgreSQL 17.6 real (binários da distribuição EDB baixados pelo gatekeeper para o scratchpad, porque os da rodada 4 se perderam com o reinício), PGlite, Chromium e Firefox do Playwright, Node 24.15.0 (o `.nvmrc` pede 22); sem emulador Android nem aparelho.

Veredito da rodada: **FAIL**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | FAIL | media | E1, E2 | E1, E2 |  | validacao/1ed0b71/qa.md |
| Infra e CI | engenharia-entrega (general-purpose) | claude-opus-5-5 | FAIL | media | E1 | E1 local no macOS, E2 |  | validacao/1ed0b71/engenharia-entrega.md |

### Motivo do veredito

- QA FAIL (Opus, média) e Infra e CI FAIL (Opus, média), concordantes, reproduzidos de forma independente: `dc360/scripts/auditar.mjs` aprova sem ter auditado quando o npm devolve um relatório vazio e bem formado que não veio de uma consulta real: com `npm_config_offline=true` e com um registro que responde `{}` à consulta de advisories (o log mostra as chamadas). O portão imprime "Runtime limpo" e sai 0, contra `dc360/README.md:1536-1538` ("o portão nunca aprova sem ter auditado") e contra o critério da etapa (runtime vulnerável reprova). É a mesma classe do defeito que reprovou a E19 na rodada 2 (registro fora do ar dando 0), num caminho que a correção não fechou. Com `prefer-offline` ele audita direito. O job da linha de base pegaria pelo `npm audit` cru; o job de dependências não pega.
- Item 7 da seção 7 de `28` (dependência de execução com vulnerabilidade conhecida): o portão que o garante não admite risco aceito.
- Falso verde: `auditar.mjs` não muda desde `2d8f8c1` (2026-10-13); o defeito já existia em `52952a1` e em `bb0f654`, aprovados pelo QA nas rodadas 3 e 4 e pelo Infra e CI na rodada 3. Pela seção 11 de `28`, QA e Infra e CI da E19 ficam reforçadas (Opus como segunda revisão) até um gate inteiro sem falso verde.
- Conserto mínimo apontado (não implementado): o portão recusa configuração `offline` (ou força a consulta ao registro) e exige prova de que a consulta aconteceu (por exemplo, total de dependências auditadas igual ao da árvore, ou metadados que só uma consulta real devolve), saindo 2 quando não houver; casos de `offline` e de registro que responde `{}` no teste.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha 1ed0b71`: sem falha, 0 aviso (INDEX.md SHA-256 a SHA-256, segredos, travessão, capturas, sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 73 INDEX.md, 3291 arquivos conferidos byte a byte, OK.
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
| H24: confirmar ou mandar desfazer a subida dos pacotes do Expo das correções 4 e 5 | Rafael | decisão de produto |
| Recompilar o binário nativo com os pacotes novos e abrir num aparelho (V2-F14-E12) | Rafael | aparelho físico |
| Regularizar o faturamento do GitHub Actions (H32) e rodar de novo o CI completo | Rafael | ambiente externo |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- QA e Infra e CI (da rodada 4, continua): `auditar.mjs` aceita a exceção do aplicativo pelo NOME do pacote, não pela advisory: uma advisory nova e crítica em `node-forge` passa com código 0 como "aceita".
- QA, anotado: a pasta `docs/evidencias-v2/CP-03/` não existe; a decisão do CP-03 está só no STATUS.

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 5 (rodada acima da terceira na mesma fase) e gate crítico G00 | validadores e consolidação em Opus, exceto LGPD | feito |
| run do CI inexistente (H32) | Rafael | regularizar o faturamento do GitHub Actions e rodar de novo o CI completo; só então Infra e CI pode ser revalidada |

### Métricas da rodada

Achados por severidade: 1 bloqueia (o mesmo nas duas dimensões), 1 corrige antes de crescer, 1 anotado. Falso verde registrado: QA da E19 nas rodadas 3 e 4 e Infra e CI da E19 na rodada 3 (seção 11 de `28`: dimensões reforçadas). Dimensões herdadas: nenhuma.

## Rodada 4 (2026-10-19, SHA bb0f654)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`), no Mac do Rafael, entre 2026-10-18 e 2026-10-19. Candidato `bb0f654` (correção 3 da F00); HEAD durante a validação `0290af5`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 3: `git diff 52952a1..bb0f654`. Herança: NENHUMA dimensão herdada da rodada 3 (`impacto.mjs --herdavel`, com o nome da dimensão tirado do arquivo, deu "NÃO herdável" em todos os relatórios PASS: o diff toca `dc360/**` e `.github/workflows/verificar.yml`, que estão no mapa de todas as dimensões); todas rodaram inteiras. Validadores: as dimensões obrigatórias de `tags.mjs` pelo texto da etapa, mais as acrescentadas em rodadas anteriores (mantidas). Cada validador foi um agente `general-purpose` com o papel da dimensão e o prompt de `prompt-do-validador.md` preenchido (mais as instruções comuns da rodada), em sequência estrita, um por vez, sobre a árvore principal, cobrindo uma ou mais etapas por lote e gravando um relatório por etapa. Modelo: Opus em todas as dimensões e arbitragens (gatilho 5 da seção 12 de `28`, quarta rodada; e risco alto com AUTH, AUTHZ, TENANT ou RLS), exceto privacidade-lgpd, em Claude Sonnet 5.5 (claude-sonnet-5-5), padrão da política para LGPD não estrutural. Os validadores receberam o bloco da etapa, só os FATOS dos RESUMOs (o RESUMO inicial e a seção Fatos de cada correção, sem a Justificativa), a lista da evidência, o motivo do veredito da rodada 3, as decisões da seção 9 do STATUS e o estado do CI.

Veredito da rodada: **BLOCKED**.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/bb0f654/qa.md |
| Infra e CI | engenharia-entrega (general-purpose) | claude-opus-5-5 | BLOCKED | alta | E1 | E1 local no macOS, E2 |  | validacao/bb0f654/engenharia-entrega.md |

### Motivo do veredito

- Infra e CI BLOCKED: o run do CI do SHA não foi lido nesta sessão. QA PASS: `npm run auditar` na raiz e no campo e `npx expo-doctor` 21 de 21 com expo 57.0.30 e expo-router 57.0.28 (correção 5).

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha bb0f654`: sem falha, 0 aviso (antes da rodada; INDEX.md, segredos, travessão, capturas e sonda). `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos conferidos byte a byte, OK.
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
| H24: confirmar ou mandar desfazer a subida dos pacotes do Expo das correções 4 e 5 | Rafael | decisão de produto |
| Recompilar o binário nativo com os pacotes novos e abrir num aparelho (V2-F14-E12) | Rafael | aparelho físico |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não decidem esta etapa)

- Corrige antes de crescer (Infra e CI): `scripts/auditar.mjs:198` aceita a exceção pelo nome do pacote e não pela advisory: uma advisory nova num pacote já aceito passa sem aviso.
- Anotado (QA): `README.md:16` sem a data de 2026-10-18; pasta pessoal numa saída arquivada.

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
| Infra e CI | engenharia-entrega (general-purpose) | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2 |  | validacao/52952a1/engenharia-entrega.md |
| QA | qa (general-purpose) | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 |  | validacao/52952a1/qa.md |

### Motivo do veredito

- QA e Infra e CI PASS (Opus). O FAIL da rodada 2 está consertado: com o registro npm fora do ar (endereço inexistente, 500, 404, HTML, queda no meio) o `auditar` sai 2 e o CI derruba o job; o teste morde; as exceções têm motivo, dono e prazo; `expo-doctor` 21 de 21.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha 52952a1`: sem falha, 0 aviso.
- Regressão base e kit completo do gatekeeper no SHA (o diff toca `dc360/apps/campo/LOJAS.md`, sem regra no mapa): `node scripts/baseline.mjs --sem-instalar` no Mac, 15 de 17 conferem (typecheck código 0; `test:isolamento` código 0; `conferir:numeros` código 0). As duas divergências são da máquina: `openssl-do-teste` reprova com o LibreSSL do macOS (`test:api` 1309 aprovados e 1 falha) e `test:scripts` dá 0 pulados contra 4 esperados (a pasta `apps/campo/ios/` liga 4 testes que no Linux ficam pulados). No Linux do CI, 19 de 19. Suítes por impacto rodadas pelos validadores (ver cada relatório).
- Árvore: conferida antes e depois de cada validador (`git status --porcelain` e `git diff --stat`); nenhum validador deixou mudança rastreada; as mutações para provar mordida foram desfeitas com `git restore`. Desvios registrados: o QA do campo rodou `pod install` em `apps/campo/ios/` (pasta ignorada pelo git) para o Simulador de iOS e apagou dois arquivos gerados em `node_modules`; o gatekeeper reexecutou `test:scripts` (260 de 260) e o jest do app (1927 de 1927) depois disso, iguais à linha de base. O QA do lote de documentação instalou o Firefox do Playwright no cache do usuário (fora do repositório) e recompilou `apps/web/dist` (ignorado). Um validador do painel usou `pkill -f "tsx src/index.ts"` amplo; a outra sessão do Claude que trabalhava na correção 3 da E07 num worktree separado foi avisada. Nenhuma dessas ações tocou arquivo versionado.

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| H24: confirmar ou mandar desfazer a subida de cinco pacotes do Expo feita na correção 4 por analogia com a D1 | Rafael | decisão de produto não tomada por ele |
| recompilar o binário nativo com os pacotes novos e instalar num aparelho | Rafael | aparelho físico; o jest não prova o nativo |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md`.

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- Um registro que responde `{}` faz o `auditar` aprovar (a linha de base diverge com código 3); fixar o registro ou reprovar quando todas as exceções somem de uma vez.

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
| Infra e CI | engenharia-entrega | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/engenharia-entrega.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |

### Motivo do veredito

- O FAIL da rodada 1 está consertado: exceção do CP-03 sem prazo, sem dono ou sem motivo reprova (sonda da Infra e do QA).
- Infra e CI e QA FAIL (confiança alta), reproduzido também pelo gatekeeper: `dc360/scripts/auditar.mjs` aprova sem ter auditado. Com o registro de avisos inalcançável (`npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/auditar.mjs`) o JSON vem sem `metadata`, a contagem é 0 e o script imprime "Runtime limpo" e sai 0. O CI usa esse script no job de dependências. É controle P0 de dependência (item 7 da seção 7 de `28`): não admite risco aceito.
- Documental: `dc360/README.md:1613` ainda diz que o `expo-doctor` falha uma verificação, e hoje dá 21 de 21.

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Relatório do `npm audit` com `error` ou sem `metadata.vulnerabilities` sai com código 2 e mensagem; teste com o `npm` falso devolvendo erro.
- Corrigir `README.md:1613` e `:1173`.

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
| nenhuma | n/a | n/a |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- A exceção é por nome de pacote e não por advisory: advisory nova num pacote aceito não reprova até o prazo (anotar na política).
- O `expo-doctor` 21 de 21 não se sustenta no tempo (patch novo do Expo toda semana) e só o job longo o mede sem pular a versão.

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
| Infra e CI | engenharia-entrega | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/engenharia-entrega.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, engenharia-entrega. Lote: qa com E20 a E24; engenharia-entrega com E01, E17, E18 e E21.

### Motivo do veredito

- QA FAIL e Infra e CI FAIL: `npm run auditar` aceita exceção sem `ate` (prazo) com saída 0 (`auditar.mjs:198`: `undefined < hoje` é falso), contra a política do CP-03 (exceção nomeada, com dono e prazo); não há teste de "sem prazo" nem de "vencida". Item 7 da seção 7 de `28`: só pela política do CP-03, nunca por aceite avulso.
- `expo-doctor` dá 20 de 21 hoje por patches novos do Expo (deriva externa); o baseline Linux de 2026-10-08 deu 21 de 21. Anotado, não é a causa do FAIL.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `baseline.mjs` ainda espera o estado antigo do `auditar` e do `expo-doctor` (ver E01)

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
