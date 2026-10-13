# VEREDITO de V2-F00-E25

Situação atual: VALIDADA
Política: docs/roadmap-v2/28-execucao-e-validacao.md

## Rodadas

| Rodada | Data | SHA validado | SHA do CI | Veredito | politica_validacao_sha | mapa_impacto_sha | versao_gatekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-13 | 7005a60 | 7005a60 | PASS | 0b32d38 | 0b32d38 | 7005a60 |

## Rodada 1 (2026-10-13, SHA 7005a60)

Gatekeeper: sessão nova, Claude Opus 5.5 (claude-opus-5-5), consolidação em Opus por ser o gate crítico G00 (seção 12 de `28`). HEAD durante a validação: `665b2be`, descendente que só muda `docs/roadmap-v2/STATUS.md` (lista permitida). A fase foi implementada em lote (base `afde25c`); o diff de cada etapa é o `diff-da-etapa.patch` quando existe, senão os arquivos prováveis do bloco dentro de `afde25c..7005a60`. Os `RESUMO.md` são anteriores à separação Fatos e Justificativa da D-30: foram entregues aos validadores como alegações a derrubar, nunca como prova.

### Dimensões

| Dimensão | Validador | Modelo | Veredito | Confiança | Nível exigido | Nível obtido | Herdado de | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Infra e CI | engenharia-entrega | claude-opus-5-5 | PASS | alta | E1, E2 | E1, E2, E3a | | validacao/7005a60/engenharia-entrega.md |
| QA | qa | claude-sonnet-5-5 | PASS | media | E1, E2 | E1, E2 | | validacao/7005a60/qa.md |

Validadores obrigatórios pelo script (`tags.mjs`, com o diff da etapa quando existe): qa, engenharia-entrega.

### Motivo do veredito

- Todas as dimensões PASS. Roteiro seguido a frio em 3 clusters Postgres 18.3 descartáveis (47 migrações, 106 linhas, RLS forçada nas 35 tabelas, isolamento como `dc360_app`, trilha append-only, API contra a cópia); quatro mutações detectadas; o job `restore` prova o CA-08 em Postgres 17.11 sem engolir código de saída; a falha da 041 por `pg_trgm` não se repete.

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

- Evidência: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E25 --sha 7005a60` sem falha, 0 aviso (INDEX.md, SHA-256, segredos).
- Regressão base do gatekeeper no SHA: `npm run typecheck` código 0; `npm run test:isolamento` 327 aprovados e 3 pulados; `npm run conferir:numeros` 24 conferidas, 0 divergência. As suítes ligadas ao diff foram rodadas pelos validadores (ver cada relatório).
- Redação do gatekeeper: o gatekeeper redigiu uma linha de `validacao/7005a60/engenharia-entrega.md` (exemplo de cláusula de senha e de URL com usuário e senha, usados para descrever o achado 3) porque a varredura de segredos do registro a acusava; o sentido não mudou.
- Árvore conferida antes e depois de cada validador: sim; nenhum validador deixou mudança fora da pasta `validacao/`. Os que desfizeram consertos ou plantaram sondas restauraram com `git restore` e apagaram os temporários (conferido por `git status --porcelain` e `git diff --stat` vazios).

### Substituições de validação humana

| Critério original ("Validação humana" da etapa) | Prova que o substituiu | Motivo |
| --- | --- | --- |
| uma segunda pessoa segue `RESTORE-DO-BANCO.md` do zero | leitura e execução a frio por agente em clusters limpos (QA) e job `restore` em Postgres 17 com artefato (Infra e CI, Opus) | EMENDA D-30 do G00; a revisão humana independente fica com o CP-07 e com os exercícios de DR da F22 |

### Pendências humanas (E4 e E5)

| Item | Quem | Por que é humano |
| --- | --- | --- |
| nenhuma | n/a | n/a |

### Achados para corrigir antes de crescer (não bloqueiam esta etapa)

- o roteiro não diz que só vale para cluster próprio, e não para Supabase ou provedor gerenciado (sem superusuário, `pg_trgm` em `extensions`)
- senha de `dc360_setup` ambígua (passos 3 a 6) e senhas em linha de comando (passos 2 e 4); faltam o build da API e o id do município B para a sonda
- o `restore` só roda com `[ci completo]`

### Escalonamentos

| Gatilho | Para | Resultado |
| --- | --- | --- |
| matriz: INFRA com segredo ou produção (risco alto) | engenharia-entrega em Opus | PASS, confiança alta |

### Métricas da rodada

Ver os relatórios de cada dimensão.
