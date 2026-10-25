---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 98879db
ci_run: 40179451002
rodada: 10
herdado_de:
tags: [DOC]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo por diferença (D-31, item 4): só o pagamento da DV-09 (commit e96c7af, mais a entrada em Resolvidas no 452dee6). O código de produto da E16 não mudou desde a rodada 8: `git diff --stat 98879db..HEAD -- .github dc360` não lista arquivo algum, então `.github` e `dc360` são idênticos em 98879db e 823e380.

1. A frase nova de `dc360/apps/campo/LEIA-ME.md:59-60` ("a cada push em `main`, `master` e `v2/**` e a cada `pull_request` (não em push para outro ramo)") bate com `.github/workflows/verificar.yml` no SHA: SIM.
2. O resto do parágrafo (o que o job põe no cache, a fixture `scripts/fixtures/router.d.ts.velho`, o TS2345, o `npm run test:campo`, "Windows e Linux") continua verdadeiro: SIM.
3. A entrada DV-09 em `docs/roadmap-v2/dividas.md` (Resolvidas) descreve o que foi feito: SIM.
4. Texto falso NOVO introduzido pelo pagamento (D-31, item 1, caso a): NÃO encontrado.
5. Sem travessão nas linhas adicionadas pelos três commits: 0 ocorrências.

## Evidência

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/C--Projetos-city-hall/7e9c51d9-373a-4fc4-ba93-37b771571739/scratchpad/qa-doc/` (`verificar-98879db.yml`, `runs-all.json`, `jobs-plataformas.txt`, `ci-40179451002.txt`, `trab-branches.txt`).

E1 (leitura do workflow no SHA, extraído de `git show 98879db:.github/workflows/verificar.yml`):
- `on:` (linhas 49-63): `push.branches: [main, master, "v2/**"]`, `pull_request:` sem filtro, mais `workflow_dispatch` e `schedule`. Nenhum `paths`, `paths-ignore` ou `branches-ignore`.
- Job `plataformas` (linhas 674-900): as chaves de primeiro nível do job são `name`, `strategy`, `runs-on`, `timeout-minutes`, `defaults`, `steps`. NENHUM `if:` no nível do job. Os `if:` existentes estão nos passos (`!cancelled()`, `always()`, dependência entre passos) e não decidem se o job roda. `grep -n "^    if:"` no arquivo devolve só as linhas 1089 e 1208 (`baseline` e `restore`).
- `concurrency` (linhas 70-72): em `v2/**` não cancela e inclui o SHA no grupo; em `main`, `master` e `pull_request` cancela o run antigo.
- Fixture `scripts/fixtures/router.d.ts.velho` no SHA: só conhece `/entrar`, `/`, `/_sitemap`, `/fila`, `/(agente)` e `/vistoria/[id]`; não tem `/avisos`, `/mapa`, `/perfil`. `scripts/ambiente-hostil.mjs` (linhas 124-131) grava a fixture em `apps/campo/.expo/types/router.d.ts` e falha se o cache gravado conhecer alguma das três rotas.
- Passos do Caso 3 (linhas 857-885): o controle roda o `tsc` direto e exige `error TS2345`; `test:campo` só roda se o controle passou (`steps.cache_controle.outcome == 'success'`); o passo de `test:campo` exige a frase "Cache .expo/types desatualizado", a frase "e o jest concordam" e que `.expo/types` tenha sumido.

E2 (consulta independente ao GitHub, `gh` logado, repositório `rafaelgomesbr/city-hall`):
- Runs 40203288208 (ddff79a), 40221117648 (a65f733) e 40221129886 (823e380), todos `push` em `v2/f00`, conclusão success. Os jobs "Ambiente hostil ... em ubuntu-latest" e "... em windows-latest" rodaram nos três, e os passos "Caso 3, controle: com o cache velho o tsc direto dá TS2345", "Caso 3: npm run test:campo com o cache velho presente" e "Caso 3: typecheck do aplicativo sem o cache" estão success nos dois sistemas. O run 40221129886 é de um commit que só toca `docs/roadmap-v2/**`: o job roda mesmo em push só de documentação (coerente com a ausência de `paths`).
- Run 40179451002 (9a1c112, CI completo, tentativa 2): 12 jobs, success, os dois jobs "hostil" success.
- Os 102 runs do workflow (`runs-all.json`): 79 `push` em `v2/**` e 23 `push` em `master`; nenhum de outro evento.
- Negativo de ramo: o remoto tem `trab/f02-1a-e01-rotas-v1`, `trab/f02-1b-console-v1`, `trab/f02-1c-guardas`, `trab/f02-1d-catalogo` e `trab/f02-1e-e09-fuso` (pushes de 2026-10-25 por volta de 18:22Z). `gh api "repos/rafaelgomesbr/city-hall/actions/runs?branch=trab/..."` devolve `total_count: 0` para os dois que consultei. Isso prova por execução o trecho "não em push para outro ramo".

## Cenários positivos

- Push em `v2/**` roda o `plataformas` em Windows e Linux: provado por 4 runs (os três acima mais o 40179451002).
- Push só de documentação roda o job: provado pelo run 40221129886.
- O parágrafo descreve corretamente o mecanismo (cache sem as três rotas, TS2345 no `tsc` direto, depois `test:campo`): provado por leitura do YAML e pelos passos verdes nos dois sistemas.

## Cenários negativos

- Push para ramo fora de `main`, `master` e `v2/**`: zero runs nos ramos `trab/*` (E2).
- Procurei condição que fizesse o job não rodar num gatilho listado (`if:` no nível do job, `paths`, `branches-ignore`): nenhuma existe.
- Procurei promessa falsa na frase: ela não cita `workflow_dispatch`, `schedule`, tag nem push para outro ramo como cobertos.
- Travessão nas linhas adicionadas: 0.

## Tentativas de reprovar

1. "A cada `pull_request`" não tem run que prove. `gh api "repos/rafaelgomesbr/city-hall/actions/runs?event=pull_request"` devolve `total_count: 0` e `gh pr list --state all` vem vazio. A parte de `pull_request` fica provada só pelo YAML (E1). Não reprova: o gatilho está declarado sem filtro e o job não tem condição, e a D-31 não exige run de PR para frase de documentação que descreve o gatilho. Anotado.
2. "A cada push em `main`/`master`" pode ser impreciso por concorrência: em `main`, `master` e PR o run antigo é cancelado pelo push seguinte (5 runs `cancelled` no histórico: três em `master`, dois em `v2/f00` de antes da regra atual). Em `v2/**`, onde a validação lê o run, não cancela. Anotado.
3. O `master` atual tem um `verificar.yml` ANTIGO, sem o job `plataformas` (`git show master:.github/workflows/verificar.yml | grep -c plataformas` dá 0), e o `LEIA-ME.md` do `master` não tem a frase. Hoje um push em `master` não roda o job. A frase vive em `v2/f00`, onde é verdadeira, e passa a valer para `master` com a integração. Não é falsidade do SHA validado; fica como risco residual.
4. `workflow_dispatch` e `schedule` também disparam o job (não há `if`), mas só valem quando o arquivo chegar ao ramo padrão, e a frase não os cita. Não é falso. A entrada DV-09 diz "os gatilhos reais" sem a ressalva; os FATOS do implementador já admitem que não verificaram esses dois. Anotado.
5. Procurei a mesma imprecisão em outros documentos do produto (ver Achados, item 1).
6. Conferi a posição e a formatação da frase no `LEIA-ME`: continua no mesmo parágrafo, linhas 59-60, sem quebra de Markdown.

## Achados

Nenhum bloqueia. Nenhum cai nos critérios (a), (b) ou (c) da D-31, item 1.

1. CORRIGE ANTES DE CRESCER (dívida, não reprova): a mesma imprecisão que a DV-09 corrigiu no `LEIA-ME` do campo continua em `dc360/README.md` no SHA. Reprodução: `git grep -n -i "todo push" 98879db -- dc360/README.md` mostra a linha 1403 ("`.github/workflows/verificar.yml`, que rodam em todo push: o `windows` ... e o `plataformas`") e `git grep -n -i "a cada push"` mostra a 1633 ("`windows` o chama a cada push"). A linha 1948 do mesmo README já diz certo ("a cada push em `main`, `master` ou `v2/**` e a cada pull request"). Condição D-31: defeito anterior e fora do que o pagamento tocou (o commit e96c7af só mexeu no `LEIA-ME` do campo, e a DV-09 foi aberta só para ele), então vira dívida; dono sugerido: E22, dona do README. O pagamento da DV-09 não buscou as outras ocorrências (a saída `01-gatilho-do-job-plataformas.txt` não tem busca no resto do produto).
2. ANOTADO: o `LEIA-ME` diz "a cada push em `main`, `master` ..." sem a ressalva de que um push seguinte cancela o run em `main`, `master` e PR.
3. ANOTADO: "a cada `pull_request`" sem run de PR que o prove (nenhum PR na história do repositório). Provado só por YAML.
4. ANOTADO (processo): li, por erro de recorte, o cabeçalho e a primeira frase da seção `## Justificativa` de `docs/evidencias-v2/G00/V2-F00-E16/divida-DV-09/RESUMO.md` (o `sed` foi até a linha 20). O veredito não usa nada dela; as conclusões vêm do YAML e do GitHub.

## Não verificado

- Execução de `pull_request`, `workflow_dispatch` e `schedule` (não disparei workflow, e não há PR nem execução histórica).
- A frase depois que o arquivo chegar a `master`/`main` (hoje o `master` não tem o job).
- Aparelho e frases de tela da E16 (pendência humana anterior da etapa, fora desta diferença).
- Não rodei a suíte de testes: o escopo é só documentação e o CI do SHA já cobre.

## Risco residual

- Integração em `master`: a frase só fica verdadeira para `master` depois do merge do `verificar.yml` novo; antes disso o `master` não roda o `plataformas`.
- As ocorrências irmãs de "todo push" no README (achado 1) podem ser lidas como contradição com a frase corrigida.

## Motivo do humano

Nenhum para este escopo. A pendência humana da etapa (aparelho físico e frase de tela) é anterior, está registrada no STATUS e não foi tocada por este pagamento.
