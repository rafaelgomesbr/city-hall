# VEREDITO de V2-F00-E06

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

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
