# VEREDITO de V2-F00-E10

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 2026-10-13 | 4b96ea7 | c9895e9 | FAIL | 0b32d38 | 0b32d38 | 4e0ccd3 |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | PASS | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 2 (2026-10-13, SHA 4b96ea7)

Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `24aed19`, descendente que só muda `ROTEIRO-G00.md`, `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). Base do lote: `afde25c`; o que mudou desde a rodada 1: `git diff 7005a60..4b96ea7`. Validadores escolhidos por `tags.mjs` pelo texto da etapa (o diff do lote inteiro dá as mesmas 14 tags a todas as etapas e não serve para escolher), mais as dimensões acrescentadas pelo gatekeeper: acessibilidade e seguranca-aplicacao. Os validadores receberam o bloco da etapa, os FATOS das correções (sem a Justificativa), a evidência, a rodada 1 e o run do CI.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acessibilidade | acessibilidade | claude-sonnet-5-5 | FAIL | media | E1, E2 | E1, E2 | | validacao/4b96ea7/acessibilidade.md |
| LGPD | privacidade-lgpd | claude-sonnet-5-5 | PASS | media | E1, E3a | E1, E2, E3a | | validacao/4b96ea7/privacidade-lgpd.md |
| QA | qa | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/4b96ea7/qa.md |
| Red-team | red-team | claude-opus-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/4b96ea7/seguranca-aplicacao.md |
| UX | ux | claude-sonnet-5-5 | PASS | media | E2, E3a | E2, E3a | | validacao/4b96ea7/ux.md |

### Motivo do veredito

- Acessibilidade FAIL (confiança média): depois de redefinir a senha a tela redireciona sozinha em 2,2 a 2,5 s e a entrada não repete a confirmação, então quem lê devagar ou usa leitor de tela perde a mensagem (WCAG 2.2.1, tempo ajustável). O QA confirmou o redirecionamento como ressalva.
- QA, LGPD, Segurança, Red-team e UX PASS no funcional: link de uso único, vencido e já usado, a mesma resposta para e-mail que existe e que não existe, produção desligada (`RECUPERACAO_ATIVA=nao`).

Conserto mínimo apontado pelos validadores (o gatekeeper não implementa):

- Sem redirecionamento automático depois da redefinição (botão "Entrar") ou a entrada repetindo a confirmação, com teste.

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
| Rafael faz o fluxo com o notificador de arquivo e confere que a produção segue desligada | roteiro T5 automatizado nos três motores (link funciona uma vez só, frase igual para e-mail que existe e que não existe) e o teste do `fly.toml` e de `config.ts` | verificável por execução; regra do Rafael de 2026-10-13 |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| Ler as frases das telas de recuperação (tela pública, texto novo) | Rafael | texto de produto, gatilho da seção 10 |
| Provedor de e-mail, residência do dado e contrato para ligar o envio real | Rafael (CP-19, adiado para a fase 2) | decisão de contratação e jurídica |

Todas as pendências humanas da fase estão também em `docs/roadmap-v2/pendencias-humanas.md` (regra do Rafael de 2026-10-13: o que só uma pessoa resolve é registrado ali e não para o trabalho).

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `abrir_recuperacao` dá erro 500 só para e-mail existente quando o IP do cliente chega inválido, contra 202 para e-mail inexistente: oráculo de enumeração. Hoje sem superfície (a borda do Fly sobrescreve o IP e a recuperação está desligada em produção); corrigir antes do CP-19.
- A conta existente responde de 1 a 2 ms mais devagar (medido em PGlite): conferir antes do CP-19.
- O administrador único não tem saída com a recuperação desligada (QA): decisão de produto.

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
| UX | ux | claude-sonnet-5-5 | PASS | media | E2, E3a | E2, E3a | | validacao/7005a60/ux.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, privacidade-lgpd, ux (o teto cortou seguranca-aplicacao, engenharia-entrega e acessibilidade). Lote: qa com E05 e E09; red-team com E05, E09 e E13; ux com E05, E07 a E09, E11 e E13; LGPD com E09, E11 e E17.

### Motivo do veredito

- Todas as dimensões PASS. Com a recuperação desligada, 503 uniforme, zero e-mail e zero linha no banco; ligada no notificador de teste, link de uso único que expira, sem oráculo de enumeração e sem efeito de Host forjado; mutação do `fly.toml` reprovou.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E10 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| Rafael faz o fluxo com o notificador de arquivo e confere que a produção continua desligada | fluxo executado por QA e Red-team com a variável ligada e desligada; configuração do `fly.toml` mutada e reprovada | objetivamente verificável por execução |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| folha de contato da tela "Esqueci a senha" (pública) com o texto novo | Rafael | gatilho visual: tela pública e texto de produto (seção 10 de `28`) |
| CP-19 decidido, ou registrado como BLOQUEADO para ligar e-mail e recuperação em produção | Rafael | contratação de serviço externo |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- o IP e as linhas de recuperação ficam sem prazo até a F05-E12
- a tela "Senha redefinida" some em 2,5 s e não foi capturada pelo agente de apoio

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| nenhum | n/a | n/a |

### Métricas da rodada

Ver os relatórios de cada dimensão.
