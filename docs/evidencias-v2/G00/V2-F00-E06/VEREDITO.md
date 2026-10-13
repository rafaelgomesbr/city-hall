# VEREDITO de V2-F00-E06

Situação atual: REPROVADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | FAIL | 0b32d38 | 0b32d38 | 7005a60 |

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
