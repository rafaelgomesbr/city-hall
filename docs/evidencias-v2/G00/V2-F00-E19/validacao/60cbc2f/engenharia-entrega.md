---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: item 7 da seção 7 de 28 (dependência de execução com vulnerabilidade conhecida: o lockfile deste SHA reprova hoje, 2026-10-24, no próprio portão, por advisories publicadas em 22 e 23/10, depois do run verde de 21/10; `zod` sem correção na faixa exige decisão de política do CP-03)
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-E19`. Cópias de `git archive 60cbc2f` em `$V/c` (sem `node_modules`, como o job do CI), `$V/v/*` (uma por variante) e `$V/d` (com `npm ci`, para o `expo-doctor`). macOS arm64, Node 24.15.0, npm 11.12.1 e npm 10.9.2 (o do Node 22 do CI, por `npx`). O CI roda com Node 22.23.3 e npm 10.9.9. `git diff --stat 60cbc2f..c680f8d` só toca `STATUS.md` e `ESTADO-ATUAL.md`, então o run vale como run do candidato.

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | PASS: run 39524190207, push em `v2/f00`, `head_sha` c680f8d, 12 de 12 jobs `success`, tentativa 1, criado em 2026-10-21T00:55Z, 12 artefatos `<job>-c680f8d...` não expirados. Logs dos jobs 118974893919 e 118974893833 e artefatos `dependencias`, `windows` e `aplicativo` baixados com token (passado só por variável de ambiente) | `$V/run.json`, `$V/jobs.json`, `$V/artifacts.json`, `$V/log-118974893919.txt`, `$V/log-118974893833.txt`, `$V/art/` |
| O workflow agora pega o que a rodada 7 achou: `.npmrc` versionado | PASS: o passo 5 do job 118974893919 ("Nenhum .npmrc versionado no repositório") imprimiu `nenhum .npmrc versionado` (log linha 184). Reproduzi o comando `git ls-files -- '.npmrc' '**/.npmrc'` num repositório de teste: recusa `.npmrc`, `dc360/.npmrc`, `dc360/apps/campo/.npmrc`, `dc360/packages/x/.npmrc` e `docs/.npmrc`; não recusa `.npmrc.bak`, `foo.npmrc` e `.NPMRC` (o npm só lê `.npmrc`) | `$V/log-118974893919.txt` linhas 178 a 184; execução em `$V/g` |
| O workflow agora pega: `auditar` chamado por `node` (e não por `npm run`) | PASS: o log do job 118974893919 mostra `Run node scripts/auditar.mjs 2>&1 \| tee ...` (linha 185) e o do Windows `node scripts/auditar.mjs 2>&1 \| tee ...` (linha 194). `shell: bash` explícito (pipefail), sem `continue-on-error`, sem `if:` e sem `\|\| true` nos passos que decidem; o único `\|\| true` é do passo de relatórios brutos, rotulado como evidência | `$V/verificar.yml` linhas 205 a 217 e 606 a 636 |
| O workflow agora pega: Windows | PASS: job 118974893833 em `windows-latest` (artefato `windows-c680f8d`): `node scripts/auditar.mjs` com a mesma saída do Linux (Runtime 0, 8 aceitas do aplicativo de volta, controle confirmado, "Runtime limpo, e o aplicativo sem advisory nova"), `test:scripts` com 353 testes, 349 passam, 4 pulados (iOS), 0 falham, `conferir:numeros` "Todos os números da documentação batem" | `$V/art/windows/01-auditar-windows.txt`, `04-test-scripts-windows.txt`, `05-conferir-numeros-windows.txt` |
| O workflow agora pega: shrinkwrap | PASS (no portão, que o CI executa): `npm-shrinkwrap.json` na raiz sai 2 nomeando o arquivo. O CI não tem um passo próprio para isso; quem recusa é o `auditar`, que o job 118974893919 chama | `$V/v/shrink.out` |
| `auditar.test.mjs` no CI | PASS: roda dentro do `test:scripts` do job `windows` (e do `produto`); localmente 75 de 75, código 0 | `$V/art/windows/04-test-scripts-windows.txt` linha 156 em diante; execução local |
| `npm audit` zero em runtime (DoD: "zero runtime vulnerável") | PASS no run de 2026-10-21 (`Runtime (vai para a imagem): 0`, artefato `03-audit-raiz-runtime.json` com `total: 0` e 94 dependências de produção). **FAIL hoje, no mesmo lockfile** (achado 1) | `$V/art/dependencias/01-auditar.txt`, `03-audit-raiz-runtime.json`, `$V/A0-limpa-hoje.txt` |
| `expo-doctor` 21 de 21 sem pular a checagem de versões | O CI não prova: o job `aplicativo` roda com `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` e imprime `20/20 checks passed` (decisão documentada no workflow). Hoje, sem pular, no SHA: 20 de 21 (achado 2) | `$V/art/aplicativo/07-expo-doctor.txt`, `$V/doctor-sem-pular.txt` |

## Evidência

Job a job do run 39524190207 (todos `success`, todos lidos pela API pública; os três marcados com * tiveram log ou artefato lidos com token):

| Job | Id | Resultado | Linha que prova |
| --- | --- | --- | --- |
| Dependências com vulnerabilidade conhecida (auditar)* | 118974893919 | success, 52 s, ubuntu-latest, Node 22.23.3, npm 10.9.9 | passo 5 `nenhum .npmrc versionado`; passo 6 saída `Runtime (vai para a imagem): 0 vulnerabilidade(s)` e `Runtime limpo, e o aplicativo sem advisory nova.` (artefato `01-auditar.txt`); aviso `4 vulnerabilidade(s) apenas em ferramenta de desenvolvimento; sem dono e prazo: vite. Não reprova` |
| Windows (auditar, test:scripts e conferir:numeros)* | 118974893833 | success, 4 min, windows-latest (MINGW64, imagem win25-vs2026) | `00-versoes.txt` v22.23.3 e 10.9.9; `01-auditar-windows.txt` igual ao do Linux; `# pass 349`, `# fail 0`, `# skipped 4`; `Afirmações conferidas: 25` |
| Aplicativo de campo* | 118974893844 | success | `07-expo-doctor.txt`: `Checking dependencies for compatibility ... is disabled`, `20/20 checks passed` |
| Testes, tipos e scripts | 118974893692 | success (14 passos, inclui "Os números do README batem") | conclusão dos passos na API; log não lido |
| Ferramentas do roadmap e estado gerado | 118974893942 | success | conclusão dos passos; log não lido |
| Ambiente hostil, ubuntu-latest | 118974893948 | success (passo PowerShell `skipped` por desenho) | conclusão dos passos |
| Ambiente hostil, windows-latest | 118974894002 | success (passo PowerShell 5.1 executou) | conclusão dos passos |
| A API sobe contra Postgres real | 118974893974 | success | conclusão dos passos |
| Fluxo ponta a ponta no navegador | 118974893838 | success | conclusão dos passos |
| Linha de base (baseline.mjs) em Linux | 118974893889 | success | conclusão dos passos |
| Pacote da demonstração | 118974894032 | success | conclusão dos passos |
| Restore do banco, Postgres 17 | 118974894086 | success | conclusão dos passos |

Reproduções locais em `$V`:

- `A0-limpa-hoje.txt`: cópia limpa de 60cbc2f, `node scripts/auditar.mjs`, 2026-10-24: `Runtime (vai para a imagem): 3 vulnerabilidade(s)`, `REPROVADO: 1 high, 1 moderate, 1 low em dependência de runtime.`, código 1. Mesma contagem com npm 10.9.2 (`npm audit --omit=dev`: low 1, moderate 1, high 1).
- Variantes em `v/` (saídas `v/<nome>.out`): `.npmrc` com `omit=dev` sai 2 (`include` e `omit` fora da lista); `script-shell=/usr/bin/true` sai 2; `npm-shrinkwrap.json` sai 2; `package-lock=false` (chave permitida, anulada pela bandeira) sai 1 e audita o lockfile.
- Mordida da correção contra o código da rodada 7: lockfile com `fast-uri` 3.0.1 (advisory alta) plantado, mais `package-lock=false` no `.npmrc`. O `auditar.mjs` de fd17ff4 conta `1 high` (não vê o plantio: audita a árvore ideal, o defeito da rodada 7). O de 60cbc2f conta `2 high, 1 low`, igual ao mesmo plantio sem `.npmrc`: o lockfile é o que se audita.
- `d/`: `npm ci` da raiz e do aplicativo, `npx expo-doctor` sem pular: `20/21 checks passed`; com a variável de pular: `20/20`.
- `v/dk`: o estágio `dependencias` do `Dockerfile` (`npm ci --workspaces --include-workspace-root --omit=dev`, NODE_ENV=production), reproduzido fora do contêiner, com o lockfile do achado 2.

## Cenários positivos

- O run do SHA: 12 de 12 `success`, com o `auditar` por `node` em Linux e em Windows, `Runtime 0`, controle `lodash 4.17.20` voltando com a advisory e as oito advisories aceitas do aplicativo voltando.
- `auditar.test.mjs` 75 de 75 local e dentro do `test:scripts` do Windows.
- A cópia de 60cbc2f com chaves inofensivas no `.npmrc` não mudou o resultado do portão.

## Cenários negativos

| Caso | Esperado | Obtido |
| --- | --- | --- |
| `.npmrc` versionado em 5 pastas (comando do passo 5) | recusa | recusa nas 5 |
| `omit=dev` no `dc360/.npmrc` | 2 | 2 (`include`, `omit` nomeadas) |
| `script-shell=/usr/bin/true` no `dc360/.npmrc` | 2 | 2 |
| `package-lock=false` na raiz, no aplicativo, no workspace `packages/shared` | auditar o lockfile (1 aqui, porque a árvore já reprova hoje) | 1, e com o plantio de `fast-uri` 3.0.1 a contagem inclui o plantio (2 high), ao contrário de fd17ff4 (1 high) |
| `npm-shrinkwrap.json` na raiz | 2 | 2 |
| Lockfile com `fast-uri` 3.0.1 e `"dev": true` (integrity real de 3.0.1) | 1 | `Runtime` não conta o plantado (1 high, o `zod`): o portão não o vê. `npm ci --omit=dev` instala `ajv/node_modules/fast-uri` 3.0.1 e o próprio npm acusa `2 high` (achado 3) |
| Plantio com `integrity` de outra versão | n/a | o npm instalou 3.1.8 pelo cache endereçado pelo integrity: plantio inválido, descartado e refeito com o integrity real |

## Tentativas de reprovar

1. Procurei o falso verde da rodada 7 no workflow, e não só no script: conferi se o passo que decide pode ser mascarado (`continue-on-error`, `if:`, `|| true`, `pipefail`, filtro de caminho em `on:`). Nada mascara o passo 6 do job `dependencias`. O `|| true` do passo de relatórios brutos tem `if: always()` e comentário de que não decide.
2. Procurei se o `.npmrc` versionado ainda passaria em algum job: o passo de recusa está só no job `dependencias`, mas esse job vermelho derruba o run inteiro; os outros jobs usam `npm run` sob esse `.npmrc` potencial, e é por isso que a recusa vale para o run. Testei variações de nome (`.NPMRC`, `.npmrc.bak`): o npm não as lê, então não são vetor.
3. Refiz a reprodução da rodada 7 contra o código novo e o antigo, com o plantio e com o `package-lock=false`: o conserto segura (ver Evidência). Como a árvore real já reprova hoje, não consegui mostrar o par 0 para 1; mostrei o par pela contagem (1 high contra 2 high).
4. Tentei fazer o portão aprovar o runtime vulnerável pelo lado do Dockerfile: o estágio `dependencias` instala por `npm ci --omit=dev` e usa a marca `dev` do lockfile; plantar `"dev": true` com integrity real faz o portão não ver e o `npm ci` instalar (achado 3, confirma o achado 1 do QA).
5. Rodei o `expo-doctor` sem pular a checagem de versões, que o CI não faz: 20 de 21 hoje (achado 2).
6. Conferi se o run é do SHA: `git diff 60cbc2f..c680f8d` só toca `STATUS.md` e `ESTADO-ATUAL.md`; `head_sha` do run é c680f8d.
7. Conferi se o `auditar.test.mjs` roda no CI e não só localmente: as suítes dele aparecem no `04-test-scripts-windows.txt`, zero `not ok` no trecho.
8. Mutação do repositório: não alterei nenhum arquivo versionado; todas as variantes foram feitas em cópias de `git archive`. `git status` ficou com os mesmos arquivos não rastreados de outras etapas.

## Achados

1. **Bloqueia. Gravidade alta pela regra, causa externa. Classificação D-31: (c), item 7 da seção 7 de 28 (dependência de execução com vulnerabilidade conhecida, que não admite risco aceito), e (a), DoD "zero runtime vulnerável" e "`auditar` verde nas duas árvores".** No lockfile versionado em 60cbc2f, hoje (2026-10-24), `node scripts/auditar.mjs` sai 1 (raiz): `fast-uri` (4 advisories GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr e GHSA-333x-w4r6-6crp, publicadas em 23/10 entre 21:36Z e 21:41Z; corrigidas em 3.1.9 e 4.2.3, dentro da faixa, `fixAvailable: true`), `fastify` 5.12.5 (GHSA-389g-gv7q-r4x8, baixa, publicada em 22/10, corrigida em 5.12.6) e `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, alta, atualizada em 23/10 com faixa `< 4.6.6`; a única correção é salto de major, `isSemVerMajor: true`; o produto usa zod 3). No aplicativo, a consulta de runtime hoje traz `zod` como advisory nova (não está na lista) e as duas exceções `braces` (GHSA-vfj7-8cjw-p6xm) e `sprintf-js` (GHSA-hp3w-g68c-fv3c) não voltam mais (retiradas), o que faz o portão sair 2 por desenho. O run de 21/10 estava verde porque nenhuma dessas advisories existia ainda (as de `fast-uri` e `fastify` são de 22 e 23/10, depois do run). Se o mesmo SHA fosse rodado hoje, os jobs `dependencias` e `windows` ficariam vermelhos. Reprodução: `cd $V/c/dc360 && node scripts/auditar.mjs; echo $?` imprime `REPROVADO: 1 high, 1 moderate, 1 low` e `1`. **Não é defeito do workflow nem das correções 7, 8 e 9**: o portão reagiu como projetado. É deriva do registro, que o próprio README e a etapa reconhecem (a DoD é um estado perecível). Conserto: `npm audit fix` na raiz (fecha `fast-uri` e `fastify`), apagar `braces` e `sprintf-js` de `ACEITAS_NO_APLICATIVO`, e uma decisão humana sobre o `zod` (a política do CP-03 não aceita exceção de runtime; a advisory parece cobrir o zod 4 e a faixa pega o 3, mas isso não foi verificado aqui). **Concordância com o achado 2 do QA: confirmo por reprodução independente** (mesmas advisories, mesmas datas, mesmo código de saída, npm 11 e npm 10.9.2). Concordo também com a leitura de que quem decide é o gatekeeper entre uma correção de manutenção antes do VEREDITO e o VALIDADO apoiado no run de 21/10; o meu FAIL segue a letra do item 7 (que não admite risco aceito) e deve ser relido assim.
2. **Anotado (dívida). Classificação D-31: nenhuma das três condições; bloqueia só junto com o achado 1.** O critério "`expo-doctor` 21 de 21 sem pular a checagem de versões" não tem prova de CI e não terá: o job `aplicativo` pula a checagem por desenho (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, comentado no workflow) e imprime `20/20`. A última prova de 21 de 21 é local (18/10 na correção 5, e o QA da rodada 7, 20/10). Os patches que quebram o 21 de 21 foram publicados em 21/10 14:26Z a 14:31Z (`expo` 57.0.31, `expo-location` 57.0.22, `expo-network` 57.0.3, `expo-router` 57.0.29) e em 22/10 13:31Z (`expo-notifications` 57.0.24): todos DEPOIS do run (00:55Z de 21/10). Hoje, sem pular, no SHA: `20/21 checks passed`, 5 patches atrás. Reprodução: `cd $V/d/dc360/apps/campo && npx --no-install expo-doctor`. Dívida sugerida: um passo informativo (com `continue-on-error` visível e dono) ou o job agendado que roda o `expo-doctor` inteiro, para o "21 de 21" ter número no CI. **Concordância com o achado 4 do QA: confirmo** (e com a parte do achado 2 do QA sobre o `expo-doctor`).
3. **Anotado (dívida). Classificação D-31: item 2 (lockfile adulterado/errado fica fora do modelo de ameaça); não é (b) nem (c) sozinho.** A marca `dev` do `package-lock.json` é a fronteira que o portão usa entre runtime e desenvolvimento, e o `npm ci --omit=dev` do `Dockerfile` NÃO obedece uma marca `dev: true` errada. Reproduzi: com `fast-uri` 3.0.1 (integrity real) e `"dev": true` em `node_modules/ajv/node_modules/fast-uri`, o `auditar` não conta o plantio e o estágio `dependencias` do `Dockerfile` (reproduzido fora do contêiner) instala `ajv/node_modules/fast-uri` 3.0.1, com o npm imprimindo `2 high`. O texto do README (`dc360/README.md`, parágrafo de "O que continua FORA do alcance", linhas 1686 e 1687 em 60cbc2f: "o `npm ci --omit=dev` do Dockerfile usa a mesma marca e não instala o pacote, então a imagem não leva a versão vulnerável") é **falso**. Exige editar o lockfile à mão ou resolver um conflito de merge errado; `npm install` correto escreve a marca certa. Por isso é dívida, com a correção do texto como item mínimo. **Concordância com o achado 1 do QA quanto aos fatos (confirmo a reprodução e a falsidade da premissa); discordo da classificação "bloqueia pelo item 1(c)"**: o item 2 da seção 19 diz que o portão confia no lockfile versionado e fora dele está um lockfile adulterado ou errado depois do CI. Se o gatekeeper ler a marca `dev` como parte do que o CI deveria conferir, rebaixa-se para o achado 1; a correção do README é obrigatória de qualquer forma.
4. **Anotado.** O job `dependencias` não prova que o portão ainda aprova o caso positivo com a árvore real de hoje, porque a árvore real hoje reprova (consequência do achado 1). Para exercitar o caminho aprovado seria preciso o conserto do achado 1.
5. **Anotado.** O aviso `sem dono e prazo: vite` no log do CI: o `auditar` marca como aviso de desenvolvimento (não reprova, por desenho do CP-03) o pacote `vite`, que não está em `ACEITAS_EM_DESENVOLVIMENTO`. Não viola a DoD ("desenvolvimento só avisa e imprime a lista"), mas deixa uma advisory de ferramenta sem dono.

## Não verificado

- O estado do Docker: não construí a imagem; reproduzi o comando do estágio `dependencias` com `NODE_ENV=production` fora do contêiner.
- Logs dos 9 jobs fora `dependencias`, `windows` e `aplicativo`: li só a conclusão dos passos pela API pública (os artefatos desses 3 foram baixados; os demais não).
- Se a advisory do `zod` alcança o zod 3 (a faixa `< 4.6.6` diz que sim, a descrição fala de `$ZodArray` do zod 4); e se algum corpo da API usa arrays sem limite.
- Windows com as sondas adversariais: só o `auditar` limpo rodou no job 118974893833; as sondas rodaram só em macOS.
- Dependabot, ligação do `auditar` como portão de PR e SAST (F01-E03, F01-E05, F01-E06), fora do escopo da etapa.
- O `ci-artefatos.sh redigir` (limpeza de segredo): não auditei o conteúdo dos 12 artefatos além dos três baixados.
- Se o GitHub reexecutaria o mesmo SHA com os mesmos resultados do meu Mac: usei npm 10.9.2 e 11.12.1, não o 10.9.9 do runner.

## Risco residual

- Enquanto o achado 1 não for corrigido, qualquer push em `v2/f00` põe os jobs `dependencias` e `windows` em vermelho por motivo externo, e o G00 exige `auditar` verde. Isto vai se repetir a cada advisory nova: a DoD "zero" é perecível e só um job agendado (a agenda semanal do workflow já existe, mas só roda o kit completo no ramo padrão) a vigia fora de push.
- Marca `dev` do lockfile errada (achado 3): o portão aprova e a imagem leva a versão vulnerável.
- O "21 de 21" do `expo-doctor` não tem prova de CI e é perecível (achado 2).
- Fora do modelo de ameaça (seção 19, item 2): configuração do npm da máquina local, lockfile adulterado depois do CI, npm falso no `PATH`, proxy que reescreve só a advisory nova.

## Motivo do humano

- Decidir o `zod`: a política do CP-03 não tem exceção de runtime; é preciso escolher entre mudar a política (com dono e prazo, para uma advisory que parece cobrir o zod 4), subir o zod para 4 (salto de major, com custo e risco em `shared`, `api`, `web` e `console`), ou esperar o GitHub corrigir a faixa.
- Decidir se a etapa fica VALIDADA apoiada no run de 21/10 (com a deriva registrada como correção de manutenção antes do G00) ou se a correção de manutenção (`npm audit fix`, apagar `braces` e `sprintf-js`, `npx expo install --check`) entra antes do VEREDITO.
- Confirmar a leitura do item 2 da seção 19 sobre a marca `dev` do lockfile (achado 3).
