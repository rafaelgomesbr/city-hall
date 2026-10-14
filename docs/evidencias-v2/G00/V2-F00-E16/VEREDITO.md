# VEREDITO de V2-F00-E16

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: acessibilidade; QA rodou no emulador Android pela regra do Rafael de 2026-10-13. Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/acessibilidade.md |
| QA | qa | claude-sonnet-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Testes | testes | claude-sonnet-5-5 | FAIL | alta | E1 | E1 | | validacao/4b96ea7/testes.md |

### Motivo do veredito

- O FAIL da rodada 1 (promessa de segundo plano) está consertado nas frases da lista.
- QA FAIL (confiança alta), achado no emulador Android com o APK do SHA: toda foto é recusada com "A foto não ficou guardada neste aparelho (o arquivo saiu vazio)" e a vistoria não conclui (5 de 5 tentativas; 5 JPEG de 13 KB órfãos no disco). Causa: `guardarFotoNoAparelho` (`apps/campo/src/dados/evidencia-no-disco.ts:47`) chama `new File(uri).copy(destino)` sem esperar, e no `expo-file-system` 57 a cópia é assíncrona; o tamanho é lido antes de a cópia existir. Com `copySync` a foto é aceita. É coleta do campo que o agente não consegue anexar (item 5 da seção 7 de `28`).
- Testes FAIL (confiança alta): o dublê de `File` tem `copy` síncrono e esconde o defeito; um dublê assíncrono fiel reproduz o vermelho; e o teste do repositório reprova o conserto certo (`copySync`), travando o comportamento errado. O portão de segundo plano deixa passar 3 de 4 promessas plantadas.
- Acessibilidade FAIL (confiança alta): "Voltar sem fotografar" tem contraste de 1,19:1 sobre o visor (WCAG 1.4.3), medido na captura do emulador.

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Esperar a cópia (`copySync` ou `await`) antes de medir, com dublê que reproduza a cópia assíncrona e teste que exija a espera; o teste atual que reprova `copySync` é reescrito com registro.
- Contraste AA do "Voltar sem fotografar" sobre o visor.
- "Já tentou Nx e vai continuar tentando sozinha" (`fila.tsx:454`) com a condição do aplicativo aberto; portão de segundo plano menos dependente de lista fechada.

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
| iPhone: negar a câmera e abrir os Ajustes, teclado aberto, obturador acima da barra | emulador Android com capturas (tarja de permissão negada e câmera); iPhone fica pendente | regra do Rafael de 2026-10-13, na parte que o emulador prova |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| iPhone e Android físico: teclado, área segura, Ajustes e, depois do conserto, a foto; aprovar as 12 frases novas | Rafael | aparelho físico (iOS não roda aqui) e texto de produto |
| TalkBack e VoiceOver reais na tarja e no botão de ajustes | pessoa com leitor de tela (CP-32) | o agente não substitui leitor de tela |

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
| Arbitragem (Opus) | arquiteto-software | claude-opus-5-5 | FAIL | alta |  |  | | validacao/7005a60/arbitragem.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1 | | validacao/7005a60/qa.md |
| Testes | testes | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/testes.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, testes. Lote: qa com E14, E17 e E18; testes com E14.

### Motivo do veredito

- Arbitragem em Opus FAIL (confiança alta): `apps/campo/src/app/(agente)/fila.tsx:1689` e `:1855` mostram "o envio ... acontece sozinho, em segundo plano", conferido pelo gatekeeper, enquanto a DoD da E16 diz "nenhuma promessa de segundo plano na interface" e não há tarefa de fundo (a fila só drena com o app aberto). QA e Testes deram PASS com o fato anotado como "corrige antes de crescer".

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E16 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| teclado, área segura e Ajustes no iPhone e em Android real | Rafael | aparelho físico (E4) |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- os testes de teclado e de área segura conferem propriedades, não comportamento
- o `catch` de `Linking.openSettings` e o fallback de `FotoNaoGuardada` não são mordidos por teste
- a troca "1 metros" para "1 metro" é da E15 e não está em `DECISOES-DE-TESTE-DA-FASE-00.md`

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 7 (DoD contradiz o código) | arbitragem em Opus | FAIL, confiança alta |

### Métricas da rodada

Ver os relatórios de cada dimensão.
