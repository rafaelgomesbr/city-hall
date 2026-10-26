# Gate G00 (BASE CONFIÁVEL): consolidação da rodada 11 (só mecânica)

- Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), no Windows do Rafael, em 2026-10-25.
- SHA validado: `7fdfcc1` (`7fdfcc16c086d39bd868eba7e031c3a167bb9a1d`), HEAD e `origin/v2/f00`, árvore limpa no início.
- Escopo: item 1 de `docs/evidencias-v2/G00/validacao/98879db/G00-recomendacao.md` e H85 de `docs/roadmap-v2/pendencias-humanas.md`. Nenhuma etapa revalidada por dimensão: todas herdam a rodada 10 (`98879db`), e a E09 segue ACEITA pela H36.
- CI do SHA: run 40246414900 (push em `v2/f00`, `headSha` `7fdfcc1`), 10 jobs verdes; "Linha de base (baseline.mjs) em Linux" e "Restore do banco, Postgres 17 (CA-08)" pulados por regra (só rodam com `[ci completo]`). CI completo do produto idêntico: run 40179451002 sobre `9a1c112` (tentativa 2, 12 de 12).
- Regras: politica_validacao_sha `98879db`, mapa_impacto_sha `0b32d38`, versao_gatekeeper `e7e1326`, todas commitadas e sem mudança no diff da rodada.

## Veredito do gate: continua RECOMENDADO

| Item | O que rodou | Resultado | Prova |
| --- | --- | --- | --- |
| 1. Nada de produto ou regra no diff `98879db..7fdfcc1` | validador QA em Sonnet, primeiro plano | PASS | `mecanica.md`, nesta pasta |
| 2a. Duas frases novas do `dc360/README.md` contra o `verificar.yml` (E22) | mesmo validador | PASS | `mecanica.md` |
| 2b. `INDEX.md` da E09 fecha byte a byte | mesmo validador e o gatekeeper | PASS | `mecanica.md`; `conferir-indices-de-evidencia` abaixo |
| 3. Regressão base do gatekeeper | gatekeeper | verde | abaixo |
| 4. CI do SHA | gatekeeper, job a job | verde | run 40246414900 |

### 1. O diff

`98879db..7fdfcc1` tem 24 arquivos em 5 commits (`ddff79a`, `a65f733`, `823e380`, `a3e999b`, `7fdfcc1`). Fora de `docs/` só muda `dc360/README.md` (duas frases). Não mudam código de produto, migração, teste, script, workflow, configuração, mapa de impacto, a política `28` nem a skill do gatekeeper. Dez arquivos estão na lista permitida da seção 6 de `28`; os outros 14 são documentação: `dc360/README.md`, o `INDEX.md` da E09, `dividas.md`, `pendencias-humanas.md` e os 10 de `docs/roadmap-v2/retomada/**`. Dentre estes, `retomada/skill-roadmap-sem-parar/SKILL.md` e `orcamento.py` são cópias para a máquina Windows: nada no repositório os carrega (CI, `package.json`, scripts, `.claude/skills`) e são idênticos aos instalados no perfil do usuário. Nenhum deles muda regra que aprova.

### 2. Documentação

As frases novas ("rodam em push para `main`, `master` e `v2/**` e em pull request" e "o chama a cada push para `main`, `master` e `v2/**` e em pull request") batem com o bloco `on:` do `verificar.yml` (push com esses três filtros de ramo, `pull_request` sem filtro) e com os jobs `windows` e `plataformas`, que não têm `if:` de job. Não sobrou "todo push" sem qualificação no README. O item "Documentação sem afirmação falsa" do G00 está atendido nesse ponto. O `INDEX.md` da E09 não lista mais o `VEREDITO.md` e todas as suas linhas batem com o SHA-256 do arquivo.

### 3. Regressão base (Windows 11, Node 22.17.0, PGlite)

| Comando | Saída |
| --- | --- |
| `npm run typecheck` (em `dc360/`) | código 0 |
| `npm run test:isolamento` | 14 arquivos, 345 aprovados e 3 pulados (348), código 0 |
| `npm run conferir:numeros` | 25 afirmações conferidas, código 0 |
| `node scripts/conferir-indices-de-evidencia.mjs` | 97 `INDEX.md`, 5127 arquivos conferidos byte a byte, OK, código 0 |
| `node scripts/roadmap/gerar-estado.mjs --conferir` (raiz) | confere, código 0 |

As falhas conhecidas do ambiente Windows (DV-46, 1 caso de `regras-de-conteudo`; `spawnSync` do `tsx` em `desfazer-migracao`, `guarda-da-semente` e `semear-homologacao`) estão fora dessas suítes e não foram exercitadas nesta rodada; no CI Linux e Windows elas passam.

Árvore depois do validador e da regressão: só `docs/evidencias-v2/G00/validacao/7fdfcc1/mecanica.md` novo. Nenhuma outra mudança.

## Achados (nenhum bloqueia)

1. Anotado: as frases do README não citam os gatilhos `workflow_dispatch` e `schedule` do `verificar.yml`. A omissão não torna a frase falsa (ela diz quando os jobs rodam em push e pull request, não que só rodam aí). Fica como leitura da H42.

## H85

Pode ser fechada. A própria H85 diz que, se a rodada só mecânica sobre a ponta nova já tiver passado, o item é só leitura: esta é a rodada, e ela passou. O que a fecha de fato no arquivo (marcar a H85 como resolvida em `pendencias-humanas.md`) fica para o próximo commit de implementador, porque esse arquivo está fora da lista permitida do registro.

## O que segue com o Rafael para aprovar o G00

Os itens 0, 3, 4 e 5 de `docs/evidencias-v2/G00/validacao/98879db/G00-recomendacao.md` continuam: H84 (status da E09 aceita), as pendências humanas das 17 etapas, H44 (ruleset só squash) e o merge de `v2/f00` em master com commit de merge, o primeiro run do Verificar em master verde e o `GATE.md`. O item 1 (H85) fica resolvido por esta rodada e o item 2 (dívida do README) foi pago em `7fdfcc1` e conferido aqui. O commit deste registro fica sobre `7fdfcc1` e só toca a lista permitida.
