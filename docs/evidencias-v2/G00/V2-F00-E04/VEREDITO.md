# VEREDITO de V2-F00-E04

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
| Banco | banco-de-dados | claude-sonnet-5-5 | PASS | alta | E1, E2 | E1, E2 | | validacao/7005a60/banco-de-dados.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |
| Red-team | red-team | claude-opus-5-5 | FAIL | alta | E1, E2 | E1, E2 | | validacao/7005a60/red-team.md |
| Segurança | seguranca-aplicacao | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/seguranca-aplicacao.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, red-team, seguranca-aplicacao, banco-de-dados (banco entrou pela tag TENANT do diff da etapa).

### Motivo do veredito

- Red-team (Opus) FAIL, confirmado pela arbitragem em Opus contra os PASS de QA, Segurança e Banco (que varreram só métodos de escrita): `GET` e `HEAD /documentos/:id/termo-de-interdicao` com conta desativada, papel rebaixado ou sessão encerrada interditam o imóvel e gravam `documento_emitido` na trilha append-only, porque `apps/api/src/servidor.ts:478` decide o que é escrita pelo método HTTP. É escrita com efeito, não "leitura que escreve"; cai nos itens 2 e 4 da seção 7 de `28` (não admite risco aceito) e no "Reabre se" do G00.
- Os comentários de `apps/api/src/auth/vigencia.ts:47-50` e o `apps/api/PENDENCIAS.md` não batem com o código (citam só `GET /avisos`).
- Conserto mínimo indicado pela arbitragem, no escopo da E04: escrita passa a ser "método de escrita OU rota marcada com efeito" (laudo, termo de interdição e termo de desinterdição, HTML e PDF), testes das três sondas, varredura de PATCH, PUT e DELETE, e comentários corrigidos.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E04 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| Rafael vê a sonda reproduzida antes e depois | sondas reexecutadas por QA, Segurança (51 rotas x 4 papéis x 3 estados), Banco (Postgres 18.3 real) e Red-team; mutação sem `exigirVigencia` derruba 6 de 13 | objetivamente verificável por execução (seção 4 de `28`) |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- `GET /relatorios/ocorrencias.csv` com conta desativada responde 200, exporta dado pessoal e grava em `exportacoes` e na trilha: severidade alta, não admite risco aceito; fecha antes de implantar (dono F03-E03 ou a correção desta fase, decisão de quem planeja a correção)
- nenhum teste cobre PATCH, PUT e DELETE na vigência (restringir a POST passa em 232 testes): entra no conserto
- `expira_em` da sessão não é conferido (janela de 15 minutos do token): anotado

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| 4 (risco alto com AUTHZ e TENANT) | red-team em Opus | FAIL |
| 6 (vereditos opostos) | arbitragem em Opus (arquiteto-software) | FAIL, confiança alta |

### Métricas da rodada

Ver os relatórios de cada dimensão.
