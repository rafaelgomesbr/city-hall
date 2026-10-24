---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: item 7 da seção 7 de 28 (achado 1: o portão aprova, com `dev: true` errado no lockfile versionado, um pacote de runtime vulnerável que o `npm ci --omit=dev` do Dockerfile instala; a premissa escrita no README é falsa) e deriva do registro (achado 2: `auditar` e `expo-doctor` vermelhos hoje, 2026-10-24, por advisories e patches publicados depois do run de 2026-10-21)
---
## Critérios verificados

Notação: `$Q` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/qa-E19`. Cópias de `git archive 60cbc2f` (só `dc360/`, com `node_modules` ligado por link simbólico) em `$Q/copia` e `$Q/verde-base`; variantes geradas por `$Q/v.sh` (uma cópia por caso, apagadas no fim por falta de disco), saídas em `$Q/casos/`. macOS arm64, Node 24.15.0, npm 11.12.1 e npm 10.9.2 (o do Node 22 do CI, instalado em `$Q/npm10`), com rede. `git diff --stat 60cbc2f..HEAD` só toca registros (`STATUS.md`, `ESTADO-ATUAL.md` e `validacao/60cbc2f/` de outras etapas); `60cbc2f..c680f8d` (SHA do run) só toca `STATUS.md` e `ESTADO-ATUAL.md`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Defeito da rodada 7 consertado (`package-lock=false` num `dc360/.npmrc` com `fast-uri` 3.0.1 no lockfile) | PASS: sai 1, "Runtime: 1", REPROVADO (npm 11 e npm 10.9.2); também com `package-lock=false` no `.npmrc` do aplicativo, em `npm_config_package_lock=false` e `NPM_CONFIG_PACKAGE_LOCK=false` | `$Q/casos/N02*.txt`, `N03*`, `N04*`, `C13*`, `W01*` |
| O teste novo morde (conserto desfeito numa cópia) | PASS: sem `--package-lock=true` em `BANDEIRAS_DA_CONSULTA_REAL`, o npm real volta a dar `Runtime limpo` e código 0 (o defeito da rodada 7, reproduzido), e `auditar.test.mjs` fica 72 de 75, com 3 vermelhos, entre eles "package-lock=false (e offline) no .npmrc da raiz: a chave é anulada pela bandeira e o runtime vulnerável reprova" | `$Q/casos/M1-sem-plock-true.txt`, `$Q/casos/M1-testes.txt` |
| `auditar.test.mjs` (negativos sintéticos) | PASS: 75 de 75 em `60cbc2f` (não depende do registro: usa npm falso) | `$Q/P2-testes.txt` |
| O conserto não produz falso vermelho no uso legítimo (CI, raiz, de dentro de workspace, `npm run`, npm 10 e 11) | PASS com ressalva: árvore verde dá 0 com `node scripts/auditar.mjs`, `npm run auditar` (npm 11 e 10), `npm run auditar --silent`, de `packages/shared` e com `~/.npmrc` benigno (`fund`, `loglevel`). Ressalva: `save-exact=true` no `~/.npmrc` do desenvolvedor sai 2 (L6, achado 3) | `$Q/casos/L1` a `L6` |
| Exceções por GHSA, com dono e prazo | PASS: advisory nova num pacote aceito (E1) sai 1; prazo vencido (E2) sai 1; gravidade mudada (E3) sai 1; exceção sem dono (E4) sai 1; pacote de runtime posto em `ACEITAS_EM_DESENVOLVIMENTO` (E5) continua saindo 1; `hojeEmSaoPaulo` dá 2027-01-05 até 2027-01-06T02:59:59Z e 2027-01-06 às 03:00Z | `$Q/casos/E1` a `E5` |
| Shrinkwrap recusado | PASS: `npm-shrinkwrap.json` limpo com lockfile plantado sai 2 nomeando o arquivo, na raiz, em `packages/shared`, `db`, `apps/api`, `apps/web`, `apps/console` e `apps/campo`; também com npm 10.9.2 | `$Q/casos/S-*.txt`, `W02*` |
| Lista permitida de chaves do npm (correção 8) | PASS nos 16 valores hostis, um por vez e todos juntos, das chaves permitidas (incluindo `registry` falso, `offline`, `package-lock=false`, `package-lock-only=true`, `audit-level=critical`, `json=false`, `cache` e `prefix` em pasta inexistente ou apontando para um projeto LIMPO, token falso): sempre 1; `omit`, `include`, `before`, `global`, `workspace` e `@escopo:registry` saem 2 com o nome da chave | `$Q/casos/K01` a `K16`, `N05`, `W03` a `W07`, `Q12`, `C07` a `C09` |
| `npm audit` zero em runtime (DoD: "zero runtime vulnerável") | **FAIL hoje** (achado 2); PASS no run de 2026-10-21 | `$Q/P1-baseline-copia.txt`, `$Q/ci-log-118974893919.txt` |
| `npx expo-doctor` 21 de 21 sem pular a checagem de versões | **FAIL hoje** (achado 2): 20 de 21, 5 pacotes Expo com patch novo; o CI continua pulando essa checagem (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, decisão consciente documentada no workflow) | `$Q/expo-doctor.txt` |
| `auditar` verde em Linux e Windows | PASS pelo CI (run 39524190207 sobre `c680f8d`): jobs 118974893919 (Linux, Node 22, npm 10.9.9, `Runtime limpo`, 8 aceitas de volta, controle ok, "nenhum .npmrc versionado") e 118974893833 (`windows-latest`, mesmo resultado), 12 de 12 `success`; logs lidos com token | `$Q/ci-log-118974893919.txt`, `$Q/ci-log-118974893833.txt`, `$Q/ci-jobs.json` |
| `.npmrc` versionado barrado pelo CI | PASS: `git ls-files -- '.npmrc' '**/.npmrc'` lista `.npmrc`, `dc360/.npmrc`, `dc360/apps/campo/.npmrc` e `a/b/c/.npmrc` num repositório de teste; nenhum `.npmrc` versionado em `60cbc2f` | execução em pasta temporária |

## Evidência

- Todas as saídas em `$Q/casos/` (uma por caso, com `# prep`, `# cmd`, a saída e `codigo=`). Ferramentas: `$Q/v.sh`, `$Q/plantar.mjs` (põe `fast-uri` 3.0.1, advisory alta, em `node_modules/ajv/node_modules/fast-uri` do `package-lock.json` da cópia), `$Q/plantar-dev.mjs`, `$Q/verde.mjs`.
- **Cópia verde.** Hoje a árvore real não fecha (achado 2), então, para exercitar o caminho aprovado com o npm real, construí `$Q/verde-base`: na cópia, `fast-uri` 4.2.3 e 3.1.9, `fastify` 5.12.6, `zod` 4.6.7 (também nos `package.json`) e as linhas `braces` e `sprintf-js` retiradas de `ACEITAS_NO_APLICATIVO` (advisories retiradas do registro). Nessa cópia o portão dá 0, "Runtime limpo" (`$Q/P3-copia-verde.txt`). Toda sonda de aprovação falsa partiu dela.
- Mutação: `$Q/casos/M1-sem-plock-true.txt` (npm real, código 0 com runtime plantado) e `$Q/casos/M1-testes.txt` (3 testes vermelhos).
- CI: `$Q/ci-jobs.json` (API pública) e os dois logs (com token passado só por variável de ambiente, nunca impresso).
- Nada foi alterado na árvore do repositório: `git status` só mostra os três untracked de outras etapas que já existiam.

## Cenários positivos

- Cópia verde, npm 11 e npm 10.9.2: `node scripts/auditar.mjs` dá 0 (`N00`, `W00`, `L1` a `L5`), inclusive de dentro de `packages/shared`, via `npm run auditar` e com `~/.npmrc` benigno.
- Valores hostis de chaves permitidas no `.npmrc` (K01 a K16): o portão ainda audita o registro oficial e reprova o runtime plantado.
- Último dia do prazo no fuso de São Paulo: ainda vale (`hojeEmSaoPaulo`).

## Cenários negativos

Runtime plantado = `fast-uri` 3.0.1 no lockfile da cópia verde.

| Caso | Esperado | Obtido |
| --- | --- | --- |
| N01 plantado, sem mais nada | 1 | 1 |
| N02/N03 `package-lock=false` no `.npmrc` da raiz e do aplicativo (o defeito da rodada 7) | 1 | 1 |
| N04/C13 `package-lock=false` por variável de ambiente (qualquer caixa) | 1 | 1 |
| K01 a K16, cada chave permitida em valor hostil; N05 todas juntas | 1 | 1 (N05 e K14 `cache` inexistente contam 7 pacotes em vez de 1, só porque o `fixAvailable` não resolve sem cache; a direção é a mais vermelha) |
| W05/W06/W07 `prefix` apontando para projeto LIMPO, para pasta inexistente, para `..` | 1 | 1 (o `prefix` do `.npmrc` não redireciona o `npm audit`) |
| Q01 a Q15 `.npmrc` com `\r` solto, aspas na chave, seção `[x]`, maiúscula, BOM, CRLF, `omit[]`, chave sem `=`, tab, VT, U+2028, `package_lock`, `${HOME}` | 1 ou 2, nunca 0 | 1 ou 2 em todos (Q01, `\r` solto, é pego pela leitura do `npm config list`, que é a segunda fonte; Q09, só comentário, sai 1) |
| C01 a C05 de dentro de `packages/shared`, de `/`, `npm run auditar`, em workspace | 1 | 1 (C04 `--workspace` sai 1 por script ausente, sem "Runtime limpo") |
| C06 a C14 `npm_config_workspace`, `omit`, `global`, `before`, `userconfig`, `offline`, `package_lock_only`, `npx` | 1 ou 2 | 1 ou 2 |
| S-* shrinkwrap em 7 lugares; W02 com npm 10 | 2 | 2 |
| E1 a E5 exceções | 1 | 1 |
| W01, W02, W03, W04, W05 repetidos com npm 10.9.2 | igual ao npm 11 | igual |
| **D1 lockfile com `dev: true` num pacote de runtime vulnerável** | 1 | **0, "Runtime limpo"** (achado 1) |

## Tentativas de reprovar

1. **Desfazer o conserto e ver o caso novo vermelho (pedido do gatekeeper).** Na cópia, retirei `"--package-lock=true"` de `BANDEIRAS_DA_CONSULTA_REAL` e plantei `fast-uri` 3.0.1 com `package-lock=false` no `.npmrc`: o portão voltou a sair **0, "Runtime limpo"** com o npm real, e `auditar.test.mjs` ficou 72 de 75, com 3 vermelhos (o novo "package-lock=false (e offline) no .npmrc da raiz: a chave é anulada pela bandeira e o runtime vulnerável reprova" entre eles). O teste morde e o conserto é o que segura (a chave `package-lock` está na lista permitida, então a lista sozinha não segura: quem segura é a bandeira).
2. **Chaves permitidas como arma.** Cada uma das 16 em valor hostil, e `prefix` apontando para um projeto limpo de verdade (o `npm audit` poderia auditar a outra pasta): segurou, porque o `prefix` do projeto não muda o prefixo local do npm e o portão confere o `npm local prefix`.
3. **Parser do `.npmrc` versus parser do npm (`ini`).** Tentei fazer o portão ver uma chave permitida onde o npm vê `omit=dev`: `\r` solto como separador de linha, aspas na chave, BOM, CRLF, tab, VT, U+2028, seção. Nenhum passou para 0; o caso do `\r` solto só é pego porque o portão também lê o `npm config list`, então as duas leituras não são redundantes entre si.
4. **Shrinkwrap em 7 pastas e com npm 10**: segurou.
5. **Escopo do workspace**: de dentro de `packages/shared`, de `/`, `npm run auditar`, variáveis de workspace: segurou.
6. **Cache e rede**: `cache` inexistente, `offline`, registro falso, `prefer-offline`: segurou (o registro e `offline` vão por bandeira).
7. **Exceções**: advisory nova em pacote aceito, gravidade mudada, prazo vencido, sem dono, runtime posto na lista de desenvolvimento: segurou.
8. **Marca `dev` do lockfile (o único que quebrou).** Pus `dev: true` na entrada de `fast-uri` 3.0.1 (com `resolved` e `integrity` reais de 3.0.1). Resultado: portão **0**, "Runtime limpo", e até `npm audit --omit=dev` cru sobre a árvore instalada dá "found 0 vulnerabilities". Mas `npm ci --workspaces --include-workspace-root --omit=dev` (o comando do Dockerfile, estágio de dependências) **instala** `node_modules/ajv/node_modules/fast-uri@3.0.1` (confirmado no disco), e `npm ls --package-lock-only --omit=dev --all` lista `fast-uri@3.0.1` na árvore de runtime. Ver achado 1.
9. **Deriva do registro**: ver achado 2; o portão reagiu como projetado (código 1 e código 2).

## Achados

1. **Corrige antes de crescer. Classificação D-31: bloqueia pelo item 1(c) (item 7 da seção 7 de 28: falso verde do portão), com ressalva do item 2.** A marca `dev` do `package-lock.json` versionado é a única fronteira entre runtime e desenvolvimento no portão (`pacotesDeRuntimeNoCompleto` e a consulta `--omit=dev` confiam nela), e o `npm ci --omit=dev` do Dockerfile NÃO a obedece: instala o pacote mesmo marcado `dev: true`. Reprodução (cópia de `60cbc2f` sem `node_modules`; `package-lock.json` com a entrada `node_modules/ajv/node_modules/fast-uri` em `version 3.0.1`, `resolved` e `integrity` reais de 3.0.1 e `"dev": true`): `node scripts/auditar.mjs` imprime `Runtime (vai para a imagem): 0` e `Runtime limpo`, código 0; `npm ci --workspaces --include-workspace-root --omit=dev --ignore-scripts` instala `fast-uri` 3.0.1 (advisory alta) em `ajv/node_modules`. A justificativa que fez a rodada 7 e a correção 8 registrarem isto como "anotado" (README, `dc360/README.md` linhas 1686-1687, e `correcao-8/RESUMO.md`: "o `npm ci --omit=dev` do Dockerfile também não instala o pacote") é **falsa**; a minha própria anotação da rodada 7 (achado 2, "a imagem quebraria antes de ficar vulnerável") repetia a premissa sem tê-la executado, e fica corrigida aqui. Por que está com ressalva: o item 2 diz que o portão confia no lockfile versionado e a marca errada exige edição manual ou lockfile corrompido (conflito de merge resolvido à mão); não é alcançável por usuário nem atacante externo (item 1(b) não se aplica). Mas é um falso verde do portão com algo VERSIONADO que o CI deixa passar, o item 7 não admite risco aceito, e a aceitação escrita se apoiava numa premissa falsa. Conserto mínimo (não testado por mim, só a causa): não confiar na marca; por exemplo, calcular o conjunto de runtime pelo próprio npm a partir do grafo (`npm ls --omit=dev --all --package-lock-only --json`, que listou o pacote), ou auditar uma cópia temporária do lockfile sem as chaves `dev`, `devOptional`, `optional` e `peer`; mais um caso em `auditar.test.mjs` e a correção do texto do README. Se o gatekeeper ler o item 2 como "o lockfile é entrada confiável, inclusive as marcas", rebaixa para anotado, mas o texto falso do README tem de ser corrigido de qualquer jeito.
2. **Deriva do registro, hoje (2026-10-24), depois do run de 2026-10-21. Classificação D-31: não é defeito do portão nem da correção 7/8/9 (o portão fez o que devia); formalmente cai no item 1(a) (DoD: "zero runtime vulnerável", "expo-doctor 21 de 21") e no item 7; é o gatekeeper quem decide se vale como reprovação ou como nova etapa de manutenção.**
   - `node scripts/auditar.mjs` na árvore real e na cópia limpa sai **1**: "REPROVADO: 1 high, 1 moderate, 1 low em dependência de runtime" (`P1-baseline-copia.txt`). São `fast-uri` (4 advisories GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr e GHSA-333x-w4r6-6crp, publicadas em 23/10 entre 21:36Z e 21:41Z; corrigidas em 3.1.9 e 4.2.3, dentro da faixa, `fixAvailable: true`), `fastify` 5.12.5 (GHSA-389g-gv7q-r4x8, baixa, publicada 22/10, corrigida em 5.12.6) e `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, alta, atualizada em 23/10 com faixa `< 4.6.6`; a descrição fala de `$ZodArray` do zod 4 e a correção é salto de major, `fixAvailable` objeto com `isSemVerMajor`). O `zod` pode ser falso positivo de faixa de advisory (a fonte diz "through 4.6.5" e o projeto usa 3.x), mas o portão não tem exceção de runtime por desenho (CP-03), então não há como aceitá-lo sem mudar a política.
   - O aplicativo também: `zod` aparece como NOVA e as exceções `braces` (GHSA-vfj7-8cjw-p6xm) e `sprintf-js` (GHSA-hp3w-g68c-fv3c) foram **retiradas** do registro em 22 e 23/10 (withdrawn), então o portão sai **2** ("Advisories aceitas que deveriam voltar e não voltaram"), por desenho: alguém tem de apagar as duas linhas.
   - `npx expo-doctor` sem pular a checagem: **20 de 21**, `expo` 57.0.30 (esperado 57.0.31), `expo-location`, `expo-network`, `expo-notifications` e `expo-router` com patch novo (`$Q/expo-doctor.txt`). É o mesmo drift que a etapa descreve; o CI não o vê porque continua pulando essa checagem, então o critério "21 de 21" só tem prova local, e a prova local é perecível.
   - Consequência prática: o PRÓXIMO push que rodar o job `dependencias` e o `windows` ficará vermelho por motivo externo, e o G00 exige `auditar` verde. Conserto: nova rodada de manutenção (`npm audit fix` na raiz para `fast-uri` e `fastify`, decisão sobre o `zod`, apagar `braces` e `sprintf-js`, `npx expo install --check`), ou decisão humana sobre a política para advisory de runtime sem correção na faixa.
3. **Anotado.** Falso vermelho em máquina de desenvolvedor: qualquer chave comum no `~/.npmrc` (testei `save-exact=true`) faz o `npm run auditar` sair 2. Está fora do modelo de ameaça (o CI não tem essa configuração) e é a consequência assumida de uma lista permitida, mas vale uma linha no README dizendo como diagnosticar.
4. **Anotado.** O CI do job `aplicativo` continua com `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (decisão consciente e documentada no workflow), então a DoD "expo-doctor 21 de 21" não tem prova de CI; ver achado 2.
5. **Anotado (da rodada 6, continua).** A decisão do CP-03 não tem pasta em `docs/evidencias-v2/CP-03/` (não reexaminei).

## Não verificado

- Windows local (sem a plataforma): vale o job 118974893833 do CI (lido), que só roda o `auditar` limpo, não as sondas adversariais.
- O runner do CI com sondas adversariais: não repeti no CI (item 5), só local.
- `npm run test:scripts`, `typecheck`, `test`, `test:campo`, `test:isolamento`, `superficie.test.ts` e `test:e2e:api`: não rodei (o CI do SHA tem `Testes, tipos e scripts`, job 118974893692, `success`; não li o log).
- O caminho aprovado do aplicativo com a árvore real: só na cópia verde, que eu mesmo adulterei (versões e duas linhas de exceção); o caminho aprovado exato do SHA só tem a prova do CI de 21/10.
- Proxy de inspeção TLS e npm falso no `PATH` (limites declarados no README, cobertos na rodada 7).
- `zod`: não verifiquei se a advisory alcança o zod 3 nem se algum corpo de requisição da API usa arrays sem limite (alcance real da advisory).
- A correção sugerida no achado 1 (não testei a implementação, só a causa).
- Se o `npm ci --omit=dev` instala também com `NODE_ENV=production` no estágio do Dockerfile: usei a linha do Dockerfile sem a imagem; não construí a imagem.

## Risco residual

- Marca `dev` errada no lockfile (achado 1): enquanto não houver conferência, o portão aprova runtime vulnerável se alguém (ou um conflito de merge) errar a marca, e o resultado só aparece na imagem.
- Todo critério de "zero" depende do estado do registro no dia: o G00 só fica verde enquanto ninguém publica advisory nova entre a validação e o merge; o `expo-doctor` 21 de 21 é perecível e não tem prova de CI.
- Falso verde por proxy que reescreve só a advisory nova, npm falso no `PATH`, listas de aceitas vazias: declarados no README, fora do modelo (item 2).

## Motivo do humano

- Decidir como tratar o achado 2: o `auditar` e o `expo-doctor` do SHA estão vermelhos hoje por publicações externas depois do run verde; escolher entre uma correção de manutenção antes do VEREDITO, ou VALIDADO apoiado no run de 21/10 com a pendência registrada. Para o `zod`, decidir se a política do CP-03 aceita exceção de runtime com dono e prazo (hoje não aceita).
- Confirmar a leitura do item 2 da seção 19 sobre o achado 1 (marca `dev` do lockfile como entrada confiável ou não).
