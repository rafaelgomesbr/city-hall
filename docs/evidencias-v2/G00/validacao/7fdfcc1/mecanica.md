---
validador: qa
modelo: claude-sonnet-5-5
etapa: G00 (V2-F00, rodada mecânica)
sha_validado: 7fdfcc16c086d39bd868eba7e031c3a167bb9a1d
ci_run: 40246414900
rodada: 11
herdado_de: 98879db
tags: [docs, mecanica]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

1. O diff `98879db..7fdfcc1` não toca produto, migração, teste, script, workflow, configuração de build/lint, mapa de impacto, política (`28`) nem skill do gatekeeper: PASS.
2. a) As duas frases novas do `dc360/README.md` (linhas 1403 e 1634) batem com o bloco `on:` e com os jobs `windows` e `plataformas` de `.github/workflows/verificar.yml`: PASS.
2. b) `docs/evidencias-v2/G00/V2-F00-E09/INDEX.md` fecha byte a byte: PASS.

## Evidência

**Item 1: classificação do diff (E1).** `git rev-parse HEAD` = `7fdfcc16c086d39bd868eba7e031c3a167bb9a1d`; `git status --short` vazio no início. `git diff --name-status 98879db..7fdfcc1` lista 24 arquivos (1 `M` em `dc360/`, 23 em `docs/`). `git diff --name-only | grep -v '^docs/'` devolve só `dc360/README.md`. Nenhum arquivo em `.github/`, `dc360/scripts/`, `scripts/`, `.claude/`, `dc360/package.json`, `docs/roadmap-v2/mapa-de-impacto.json` nem `docs/roadmap-v2/28-execucao-e-validacao.md` (`git diff --stat` sobre esses caminhos: vazio).

| Arquivo | Dentro da lista da seção 6 de `28`? | Produto ou regra? |
| --- | --- | --- |
| `docs/evidencias-v2/G00/V2-F00-E09/VEREDITO.md`, `E16/VEREDITO.md`, `E19/VEREDITO.md`, `E22/VEREDITO.md` | sim (`VEREDITO.md`) | não |
| `docs/evidencias-v2/G00/V2-F00-E16/validacao/98879db/qa.md`, `E19/.../qa.md`, `E22/.../qa.md` | sim (`validacao/**`) | não |
| `docs/evidencias-v2/G00/validacao/98879db/G00-recomendacao.md` | sim (`docs/evidencias-v2/**/validacao/**`) | não |
| `docs/roadmap-v2/STATUS.md`, `docs/roadmap-v2/ESTADO-ATUAL.md` | sim | não |
| `docs/evidencias-v2/G00/V2-F00-E09/INDEX.md` | FORA | não: uma linha removida (a de `VEREDITO.md`) |
| `docs/roadmap-v2/dividas.md` | FORA | não: DV-46 e DV-47 (texto) |
| `docs/roadmap-v2/pendencias-humanas.md` | FORA | não: linha da situação, H09 reescrita, H84 e H85 (texto) |
| `dc360/README.md` | FORA | não: documentação, duas frases (item 2) |
| `docs/roadmap-v2/retomada/**` (13 arquivos: RETOMADA-WINDOWS, briefing-f02, plano-f02, 5 de memória, SKILL.md, orcamento.py) | FORA | não: material de transporte para outra máquina, sem papel no CI nem na política |

Dos 24 arquivos, 10 estão na lista permitida; 14 estão fora, e nenhum dos 14 é código de produto, migração, teste, workflow, mapa de impacto, política ou skill do gatekeeper.

**Arquivos "de código" dentro de docs (E1).**
- `git ls-files .claude/skills` = `executar-etapa`, `relatorio-de-fase`, `relatorio-semanal`, `validar-etapa` (6 arquivos). Não existe `.claude/skills/roadmap-sem-parar/` no repositório.
- `git grep -n "retomada/\|orcamento\.py\|roadmap-sem-parar" -- .github dc360/package.json package.json scripts dc360/scripts .claude` (excluindo `docs`) devolve 0 linhas. As únicas referências estão em `docs/` (STATUS, pendencias-humanas, VEREDITOs e a própria pasta `retomada`). Nada do repositório carrega ou executa `orcamento.py` ou `SKILL.md`.
- `RETOMADA-WINDOWS.md` linhas 41, 42 e 80: são para COPIAR para `%USERPROFILE%\.claude\skills\roadmap-sem-parar\` e a pasta "pode ser apagada num commit" (material de transporte). `diff -q` contra `~/.claude/skills/roadmap-sem-parar/` desta máquina: `SKILL.md` e `orcamento.py` idênticos. É cópia de arquivo.
- `orcamento.py` (docstring e início do código) só lê transcritos de `~/.claude/projects` e soma custo para comparar com tetos de uso do plano; nada que decida aprovação. `SKILL.md` (linhas 49 e 59) PROÍBE aprovar gate, fazer merge em master e marcar VALIDADA ou CONCLUÍDA sem gatekeeper e Rafael, ou seja, repete a política `28` em vez de mudá-la. Nenhum dos dois muda regra que aprova.
- Varredura de segredos nos arquivos de `retomada/`: 1 acerto, em `SKILL.md:14`, que é um comando `sed` que lê a credencial do git sem imprimi-la, não um segredo.
- Travessão: contagem de linhas adicionadas com o caractere no diff inteiro = 0.
- Fim de linha: `git ls-files --eol` dos arquivos tocados de `retomada/`, do README e do INDEX: 12 de 12 `i/lf w/lf`.

**Item 2a: frases x YAML (E3a, leitura).** `.github/workflows/verificar.yml` (único; `dc360/.github/` não existe).
- Bloco `on:` (linhas 49 a 63): `push.branches: [main, master, "v2/**"]` (50 e 51); `pull_request:` SEM filtro de ramo e sem `paths`/`paths-ignore` (52); `workflow_dispatch` (61); `schedule` com cron `0 9 * * 1` (62 e 63). Não há `paths` nem `paths-ignore` em lugar nenhum do `on:`. O cabeçalho repete na linha 28: "Roda em push para main, master e para todo ramo `v2/**`, e em pull_request."
- Job `windows` (linha 606): `runs-on: windows-latest`, sem `if:` no nível do job (as linhas 606 a 640 só têm `name`, `runs-on`, `timeout-minutes`, `defaults`, `steps`). A etapa "Política de dependências (node scripts/auditar.mjs) em Windows" (linhas 631 a 635) é a primeira com comando e não tem `if:`; chama `node scripts/auditar.mjs 2>&1 | tee .../01-auditar-windows.txt` (linha 635).
- Job `plataformas` (linha 674): matriz Windows e Linux, sem `if:` no nível do job; o primeiro `if:` do trecho está na linha 760 e é de etapa.
- `baseline` e `restore` (linhas 1089 e 1208) são os únicos com `if:` de job, e o README 1950 a 1963 já os qualifica.
- README 1403 a 1405: "rodam em push para `main`, `master` e `v2/**` e em pull request: o `windows` ... e o `plataformas`". Confere com o `on:` e com a ausência de `if:` de job. README 1634 e 1635: "o job `windows` o chama a cada push para `main`, `master` e `v2/**` e em pull request, como `node scripts/auditar.mjs`". Confere com a linha 635. Nenhuma das duas diz "somente"; a omissão de `workflow_dispatch` e `schedule` (que também disparam esses jobs) não torna a frase falsa.
- `grep -n "todo push|a cada push|cada push|todo commit" dc360/README.md`: restam 1634 (já qualificada) e 1950 ("roda a cada push em `main`, `master` ou `v2/**` e a cada pull request", qualificada). Nenhum "todo push" sem qualificação. Fora do README: `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md:178` diz "em todo push nos ramos `main`, `master` e `v2/**` e em todo pull request", também qualificada.

**Item 2b: INDEX da E09 (E1).**
- Script próprio (`scratchpad/idx.mjs`, sha256 dos bytes do arquivo no disco, caminho relativo à pasta da E09): 1811 linhas de tabela, 0 divergentes, 0 ausentes, 0 duplicadas, 0 linhas mal formadas. O conjunto está todo em LF (`git ls-files --eol`), então o hash de disco é o do git.
- Arquivos da pasta fora do INDEX: 11 de 1822, todos `INDEX.md` (o da raiz e os de `correcao-3` a `correcao-8b` e `saidas/baseline-depois`, cada um índice da própria subpasta) mais `VEREDITO.md`. Nenhum outro. Os 725 arquivos de `validacao/` estão listados no INDEX e batem.
- Regra do script `dc360/scripts/conferir-indices-de-evidencia.mjs` (cabeçalho, linhas 12 a 42, e função `ehDoGatekeeper`, linhas 59 e 60): confere cada linha do INDEX byte a byte (normaliza CRLF para LF); ignora linhas cujo arquivo é `VEREDITO.md`, `RISCO-ACEITO.md` ou começa com `validacao/`, e o próprio `INDEX.md` não entra. O diff `98879db..7fdfcc1` do INDEX remove exatamente a linha de `VEREDITO.md` (`ac8d8635...`), arquivo que o gatekeeper reescreve a cada rodada, e é por isso que o SHA-256 dela deixava de bater.
- `node scripts/conferir-indices-de-evidencia.mjs` (cwd `dc360/`): "97 INDEX.md, 5127 arquivo(s) conferido(s) byte a byte. RESULTADO: OK", código de saída 0.

## Cenários positivos

- Diff restrito a `docs/` mais um README, sem tocar mapa, política, skill nem CI.
- Frases do README conferidas contra `on:` e contra a ausência de `if:` de job em `windows` e `plataformas`.
- INDEX da E09 com 1811 de 1811 hashes batendo e script oficial com saída 0 sobre 97 índices.

## Cenários negativos

- Procurei "todo push" ou "a cada push" sem qualificação no README e fora dele: nenhum sobrou.
- Procurei arquivo da pasta da E09 não listado: só índices de subpasta e o `VEREDITO.md`, ambos pela regra.
- Procurei referência executável a `orcamento.py` e `SKILL.md` em CI, `package.json`, scripts e `.claude`: nenhuma.
- Procurei segredo e travessão no que entrou: nenhum.

## Tentativas de reprovar

- Hipótese: `retomada/skill-roadmap-sem-parar/SKILL.md` está em `docs/` mas seria carregado como skill. Refutada: as skills do repositório vivem em `.claude/skills/`, que não ganhou arquivo, e a pasta `retomada` é só para copiar para `~/.claude`.
- Hipótese: o `SKILL.md` afrouxa a política de aprovação. Refutada: linhas 49 e 59 proíbem aprovar gate, merge em master e marcar VALIDADA ou CONCLUÍDA sem gatekeeper e Rafael.
- Hipótese: `pull_request` tem filtro de ramo ou `paths` que tornaria "em pull request" falso. Refutada: `pull_request:` sem chaves (linha 52).
- Hipótese: o job `windows` ou `plataformas` tem `if:` que o exclui de algum evento. Refutada: nenhum `if:` de job, só de etapa.
- Hipótese: o INDEX da E09 ficou com a linha do `VEREDITO.md` ou com hash velho. Refutada: a linha saiu, 1811 de 1811 batem, o script oficial dá 0.
- Hipótese: o registro diz que pagou algo que o diff não pagou. O STATUS (linha 12) e a `pendencias-humanas.md` dizem que o README sem "todo push" e o INDEX sem `VEREDITO.md` foram pagos; o diff confirma os dois.

## Achados

**BLOQUEIA:** nenhum.

**CORRIGE ANTES DE CRESCER:** nenhum.

**ANOTADO:**
1. O README (1403 e 1634) não cita que `workflow_dispatch` e `schedule` também disparam `windows` e `plataformas`. Não é falso (a frase não diz "somente"), só incompleto. Sem ação.
2. A H85 (pendencias-humanas) descreve o desvio da lista permitida (14 arquivos fora, nenhum de produto ou regra). Esta rodada confirma a descrição arquivo a arquivo. A decisão de aceitar o desvio continua sendo do Rafael.

## Não verificado

- O conteúdo das 3 `qa.md` e dos 4 `VEREDITO.md` da rodada 10 não foi reavaliado (herdado de `98879db`, fora do pedido).
- O run 40246414900 e seus 10 jobs não foram relidos (o pedido dispensa).
- Não rodei typecheck, testes nem `gerar-estado --conferir` (o gatekeeper roda em paralelo; também era proibido escrever no repositório).
- Não executei `orcamento.py`. A conclusão de que ele não afeta aprovação vem da leitura da docstring e das primeiras 40 linhas, não do arquivo inteiro de 67 linhas.
- Os 725 arquivos de `validacao/` do INDEX da E09 foram hasheados e batem aqui, mas o script oficial os desconsidera por regra; não afirmo nada sobre o conteúdo deles.
- Não conferi se DV-46 e DV-47 descrevem o código com exatidão (`regras-de-conteudo.test.ts`, `mensagens-do-zod.ts`): conteúdo técnico fica fora de uma rodada mecânica.

## Risco residual

Baixo. A afirmação de CI nova no README é verdadeira hoje, mas nenhum portão a vigia: se o `verificar.yml` ganhar filtro de ramo, `paths` ou `if:` de job nesses dois jobs, a frase fica falsa sem alarme. Fora isso, a decisão sobre o desvio dos commits de checkpoint (H85) permanece com o Rafael.

## Motivo do humano

Nenhum necessário para esta dimensão. O que segue humano (H09, H44, H84, H85) já está em `docs/roadmap-v2/pendencias-humanas.md`.
