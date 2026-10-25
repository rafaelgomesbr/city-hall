---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Notação: `$S` = `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/infra-E19`. Árvore do repositório conferida limpa no fim (nada criado ou editado fora deste relatório). Cópias de `git archive d4683cc` em `$S/c`, `$S/c2`, `$S/dk` (fora do repositório; `npm ci` só nelas). `git diff --stat dda7557..d4683cc`: só `docs/roadmap-v2/STATUS.md` e `docs/roadmap-v2/ESTADO-ATUAL.md` (lista permitida). `git diff 60cbc2f..dda7557` não toca `.github/` (o workflow é o mesmo da rodada 8).

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | PASS. Run 40132234324, push em `v2/f00`, `head_sha` d4683cc, tentativa 1, 12 de 12 jobs `success` (o único passo não `success` é o do PowerShell 5.1 no Ubuntu, `skipped` por desenho), 12 artefatos `<job>-d4683cca...` não expirados. Logs do job `auditar` baixados com token (passado só por variável de ambiente); artefatos `dependencias`, `windows`, `aplicativo`, `implantavel`, `restore` e `baseline` baixados | `$S/run.json`, `$S/jobs.json`, `$S/artifacts.json`, `$S/log-120986220910.txt`, `$S/art/` |
| `DoD`: `auditar` verde nas duas árvores conforme o CP-03 | PASS. Linux (job 120986220910, Node 22.23.3, npm 10.9.9): "Runtime (vai para a imagem): 0", desenvolvimento 3 (`@vitest/mocker`, `tinypool`, `vitest`, todos nomeados, dono Rafael, até 2027-01-05), aplicativo 10 vulnerabilidades, 7 advisories aceitas e nenhuma nova, consulta de controle ok, "Runtime limpo, e o aplicativo sem advisory nova". Windows (job 120986221042, Node 22.23.4, npm 10.9.9): saída idêntica. Baseline Linux: passo `auditar` código 0 | `$S/art/dependencias/01-auditar.txt`, `$S/art/windows/01-auditar-windows.txt`, `$S/art/baseline/baseline/14-auditar.txt` |
| `DoD`: zero runtime vulnerável | PASS. CI: `03-audit-raiz-runtime.json` com `total: 0`. Hoje (2026-10-24 21:47 UTC, 48 min depois do fim do run) no Mac: `node scripts/auditar.mjs` código 0 e `npm audit --omit=dev --json` na raiz `total: 0` (94 dependências de produção). Reproduzido também com o npm 10.9.9 do Dockerfile numa cópia limpa, com a instalação do estágio `dependencias` (`npm ci --workspaces --include-workspace-root --omit=dev`): `found 0 vulnerabilities`, `fastify@5.12.7`, `fast-uri@3.1.9` e `4.2.3`, `zod@4.6.7` | `$S/auditar-hoje.txt`, `$S/audit-raiz-runtime.json`, `$S/dk-ci.txt` |
| `DoD`: exceções com dono e prazo | PASS. Cada uma das 5 do aplicativo (7 advisories) e das 3 de desenvolvimento tem `dono` e `ate` 2027-01-05; `braces` e `sprintf-js` saíram da lista (diff de `auditar-excecoes.mjs`). Testes de exceção sem dono, sem prazo, vencida e com correção disponível seguem no `auditar.test.mjs` | `git diff 60cbc2f..dda7557 -- dc360/scripts/auditar-excecoes.mjs`; `$S/auditar-test.txt` |
| `DoD`: `expo-doctor` 21 de 21, sem pular a checagem de versões | PASS, com prova de CI (ver Achados, nota sobre a DV-05). O job `baseline` (Linux, Node 22.23.3, `[ci completo]` no commit) rodou `npx expo-doctor` SEM a variável de pular: "Running 21 checks ... 21/21 checks passed", código 0. Localmente, numa cópia limpa do SHA com `npm ci` da raiz e do aplicativo: 21 de 21 e `npx expo install --check` "Dependencies are up to date". O job `aplicativo` continua pulando por desenho (20 de 20) | `$S/art/baseline/baseline/17-expo-doctor.txt`, `$S/expo-doctor-hoje.txt` |
| Testes positivos: `npm test` e `test:campo` verdes | PASS no CI (baseline Linux): shared 224, motor de campo 238, banco 345 e 3 pulados, API 1717 e 34 pulados, console 307, `test:campo` 139 suítes, 1997 de 1997, `test:scripts` 355 casos, 351 passam, 4 pulados (iOS), 0 falham, `conferir:numeros` 0, e2e 0, e2e Firefox 0, `e2e:api` 325 passam, 0 falham, zero erro de console. Windows: `test:scripts` 355, 351 passam, 4 pulados | `$S/art/baseline/baseline/RESUMO.md` ("Conferem: 20 de 20"), `$S/art/windows/04-test-scripts-windows.txt` |
| Testes negativos: `auditar.test.mjs` | PASS. Local: 77 de 77, código 0 (era 75; 2 casos novos do `somenteEm`) | `$S/auditar-test.txt` |
| Regressão de infra do restante do CI | PASS por conclusão de passos: restore Postgres 17 (CA-08) "27 conferências passaram, 0 falharam"; API contra Postgres real `{"status":"ok","banco":"ok",...051_...}`; ambiente hostil em Windows e Ubuntu; pacote da demonstração; fluxo no navegador; ferramentas do roadmap | `$S/art/restore/05-ensaio-do-restore.txt`, `$S/art/implantavel/07-saude.json`, `$S/jobs.json` |

## Evidência

Jobs do run 40132234324 (todos `success`): auditar 120986220910 (22 s), aplicativo de campo 120986221030, Windows 120986221042 (4 min), ferramentas do roadmap 120986221063, pacote da demonstração 120986221089, restore CA-08 120986221090, ambiente hostil Windows 120986221105, linha de base Linux 120986221110 (22 min), fluxo no navegador 120986221122, API contra Postgres real 120986221157, testes/tipos/scripts 120986221218, ambiente hostil Ubuntu 120986221244. Passos do job `auditar`: checkout, setup-node, contexto, "Nenhum .npmrc versionado" (imprime `nenhum .npmrc versionado`), "Política de dependências (node scripts/auditar.mjs)", relatórios brutos, redigir segredo, publicar. Logs lidos por inteiro: `auditar`; por trecho: os demais (passos conferidos por conclusão em `$S/jobs.json`).

Comandos locais (macOS arm64, Node 24.15.0, npm 11.12.1):

- `node scripts/auditar.mjs` em `dc360/`: código 0 (`$S/auditar-hoje.txt`). Sem advisory nova desde o run.
- `npm audit --omit=dev --json` na raiz: `total: 0` (`$S/audit-raiz-runtime.json`).
- `npm audit --json` no aplicativo: 10 (3 moderate, 6 high, 1 critical), todas as do Expo; `zod` com `nodes: ["node_modules/expo/node_modules/zod"]`, `range <4.6.6`, `fixAvailable` é `expo@54.0.38` (salto de major, para baixo) (`$S/audit-campo.json`).
- `node --test scripts/auditar.test.mjs`: 77 de 77.
- `npm ls --package-lock-only zod fastify fast-uri` em cópia limpa: raiz com `fastify@5.12.7`, `fast-uri@3.1.9` e `4.2.3`, `zod@4.6.7` em `api`, `console`, `shared` e `web`; aplicativo com `zod@4.6.7` no topo (pedido por `@dc360/campo-app` e `@dc360/shared`) e `zod@3.25.76` só em `node_modules/expo/node_modules/zod`, pedido SOMENTE por `node_modules/expo/node_modules/@expo/cli@57.0.32` (`^3.25.76`). Nenhum outro pacote do lockfile do aplicativo pede `zod` (varredura do JSON do lockfile).
- Cópia limpa com `npm ci` na raiz e no aplicativo: `npx expo-doctor` 21 de 21; `npx expo install --check` ok; `node scripts/auditar.mjs` 0 também sobre a árvore instalada (`$S/auditar-c2.txt`).
- Metro (não coberto pelo implementador): `npx expo export --platform android` na cópia limpa, com os pacotes compartilhados compilados: código 0, bundle `.hbc` de 4,7 MB. Com `--no-bytecode --no-minify`, o bundle contém o núcleo do Zod 4 (`globalRegistry` 20 ocorrências, `_zod` 680) e a única menção a `3.25.76` é um comentário do próprio código do produto; nenhuma referência a `expo/node_modules/zod` (`$S/expo-export.txt`, `$S/expo-export-js.txt`).

## Cenários positivos

- `auditar` 0 em Linux (CI e Mac) e Windows (CI), antes e depois do run.
- Exceção estreita casa só a cópia do `@expo/cli`: com a árvore real, `auditar` sai 0 e lista `zod GHSA-mrhx-c7xc-m3w5` como aceita com dono e prazo.
- Estágio `dependencias` do Dockerfile (npm 10.9.9, `--omit=dev`): árvore com `zod` 4.6.7 e `fastify` 5.12.7, `audit` zero.

## Cenários negativos

(autorização e isolamento não se aplicam a esta dimensão; abaixo o negativo do portão, sobre cópias do SHA fora do repositório)

- Controle: lockfile do aplicativo intacto, `auditar` sai 0 (`$S/c-controle.txt`).
- Mutação 1: `node_modules/zod` do lockfile do APLICATIVO trocado pela cópia 3.25.76 (a vulnerável), mantendo a cópia aninhada do Expo. `auditar` sai 1: `NOVA: zod GHSA-mrhx-c7xc-m3w5 (high ...)`, "REPROVADO: 1 advisory nova no aplicativo de campo" (`$S/c-mut-topo.txt`). A exceção do Expo não encobre a cópia do produto.
- Mutação 2: o mesmo `zod` 3.25.76 no `node_modules/zod` do lockfile da RAIZ (runtime). `auditar` sai 1: "REPROVADO: 1 high em dependência de runtime" (`$S/c-mut-raiz.txt`).
- Mutação 3: a cópia vulnerável do Expo movida para `node_modules/@expo/cli/node_modules/zod` (fora do prefixo). `auditar` sai 1 com `NOVA: zod` (`$S/c-mut-caminho.txt`): falha fechada.
- Os três casos acima desfeitos pela remoção da cópia (`$S/c`, `$S/c2`, `$S/dk` não são o repositório); `git status --short` do repositório vazio ao fim.
- Testes unitários do `somenteEm`: cópia do projeto, as duas cópias e relatório sem `nodes` reprovam; `somenteEm` malformado é recusado (77 de 77).

## Tentativas de reprovar

1. Tentei achar advisory nova publicada depois do run (a classe que reprovou a rodada 8): `auditar` e `npm audit --omit=dev` hoje, 48 min depois, 0 e 0. Sem deriva.
2. Tentei provar que a exceção do `zod` encobre o `zod` do produto: mutações 1 e 3 acima. Reprova nas duas.
3. Tentei provar que o `zod` 3 do Expo vai ao telefone: varri o lockfile (só `@expo/cli` o pede) e inspecionei o bundle do Metro (Zod 4, sem a cópia aninhada). O `@expo/cli` é ferramenta de build (`bin: expo-internal`), mesma natureza de `node-forge` e `shell-quote`, já cobertas pelo CP-03 ("advisory de ferramenta do Expo ... aceita com motivo, dono Rafael e prazo 2027-01-05"). Não é aceite avulso do item 7 da seção 7 de `28`: é a política decidida, com `dono`, `ate` e escopo por caminho. Não consegui refutar a classificação.
4. Tentei achar `overrides`, `.npmrc` ou `npm-shrinkwrap.json` novos: `git ls-files` sem `.npmrc`, `npm-shrinkwrap.json`, `yarn.lock` ou `pnpm-lock`; o único `overrides` é o `uuid` ^11.1.1 do aplicativo, anterior à etapa (commit 447a79a); o passo do CI "Nenhum .npmrc versionado" passou. Manifestos mudaram só como o FATO descreve (`diff 60cbc2f..dda7557` dos `package.json`).
5. Tentei achar que o CI da `zod` 4 não cobre o aplicativo: o job `aplicativo` e o baseline rodam typecheck e Jest (1997 de 1997) com o `zod` 4 do topo; o Metro, que nenhum job do CI roda, eu rodei (acima).
6. Tentei achar que o `Dockerfile` quebra com o lockfile novo: sem Docker na máquina, reproduzi o estágio `dependencias` com o npm do Node 22 (10.9.9). Não reproduz problema.
7. Tentei achar divergência de CI entre Linux e Windows no `auditar`: saídas idênticas.
8. Procurei defeito novo no `somenteEm`: `foraDoCaminho` usa `startsWith` sobre `nodes` e falha fechada sem `nodes`; prefixo `node_modules/expo/node_modules/` inclui cópias aninhadas mais fundo dentro do Expo (cobertura intencional e coerente com o motivo). Não achei caminho que deixe passar uma cópia fora do Expo.

## Achados

1. **Anotado (dívida, não bloqueia). Nota sobre a DV-05, que ficou desatualizada.** A DV-05 diz que o 21 de 21 "não tem prova de CI". Neste run tem: o job `baseline` roda `npx expo-doctor` sem pular a checagem e saiu 21 de 21. Ressalva: esse job só roda com `[ci completo]`, `workflow_dispatch` ou agenda, então não é prova de todo push, e o job `aplicativo` segue pulando. Sugestão: reescrever a DV-05 para "provado pelo baseline em `[ci completo]`; falta prova em todo push". Por que não bloqueia: o critério da DoD ("21 de 21 sem pular a checagem") está satisfeito com E1 neste SHA (CI e local); a perecibilidade é a deriva do Expo (H24), fora do escopo e do SHA. Condições a, b e c da D-31 item 1 não se aplicam.
2. **Corrige antes de crescer (documental; dívida pela D-31, sem bloquear).** `dc360/apps/campo/LEIA-ME.md` (linha 43, a tabela de "Saúde do projeto Expo") para na correção 5 (2026-10-18). Não registra que a correção 10 subiu cinco pacotes do SDK 57 (`expo` 57.0.31, `expo-location` 57.0.22, `expo-network` 57.0.3, `expo-notifications` 57.0.24, `expo-router` 57.0.29), que o `zod` 4.6.7 entrou como dependência do aplicativo, nem que esse conjunto exige novo binário nativo antes da próxima entrega aos agentes. A linha continua verdadeira de forma genérica ("Mudar a versão de pacote nativo exige recompilar o binário do aparelho"), então não é afirmação falsa. O FATO do implementador reconhece o pendente ("registrar no LEIA-ME quando o binário sair"), mas o bloco da etapa pede "Compatibilidade: o aplicativo precisa de novo binário nativo, registrado no LEIA-ME". Classificação D-31: não é critério da DoD (a DoD lista `auditar`, runtime, exceções, `expo-doctor` e o item do G00); não é alcançável por usuário ou atacante (b); não cai na seção 7 (c). Por isso é dívida, não bloqueio. Se o gatekeeper ler a linha "Compatibilidade" como critério escrito (a), sobe para bloqueante barato: uma linha no LEIA-ME. Sugestão de dívida: V2-F00-E19 (ou a etapa que gerar o binário), antes do G00.
3. **Anotado.** `dc360/README.md` (parágrafo da política do CP-03, perto da linha 1632) diz que na raiz "o que sobra é só de desenvolvimento (`vitest` e `tinypool`)"; o `auditar` lista três (`@vitest/mocker`, `tinypool`, `vitest`). Imprecisão de texto, sem efeito.
4. **Anotado.** O `node_modules` do aplicativo na máquina do autor (`/Users/rafaelgomes/Documents/city-hall/dc360/apps/campo`) está desatualizado em relação ao lockfile (`npm ls` aponta `expo@57.0.30` e `zod@3.25.76` no topo, "invalid"). Não é defeito do repositório (um `npm ci` limpo dá a árvore certa, provado em `$S/c2`), mas quem testar nesse diretório sem `npm ci` verá o `zod` 3 no topo.
5. **Anotado.** O CI não roda o Metro (`expo export`) sobre o aplicativo; eu rodei (código 0, Zod 4 no bundle). Recomendo um passo barato no job `aplicativo` mais adiante (F01); não é critério desta etapa.

Nenhum achado bloqueia pela D-31 item 1.

## Não verificado

- Aparelho, emulador e Windows local: não existem aqui. O Windows foi lido do CI (job `windows`, `auditar` e `test:scripts`), com artefato.
- Docker/imagem: sem Docker; reproduzi só o `npm ci --omit=dev` do estágio de dependências com o npm 10.9.9. A imagem em si não foi construída aqui.
- `test:campo`, `npm test`, `test:isolamento` e `e2e:api` não foram repetidos localmente: o CI do SHA já os cobre com artefato (baseline Linux), e a regressão base do gatekeeper rodou typecheck, `test:isolamento` e `conferir:numeros`.
- Logs completos dos jobs além do `auditar`: conferi conclusão por passo (`jobs.json`) e artefatos relevantes, não cada linha.
- Se o binário nativo novo do aplicativo compila (EAS): fora do alcance; o Metro empacota, o build nativo não foi gerado por ninguém.
- Deriva futura das advisories (Expo, Zod): perecível por natureza; verificado só até 2026-10-24 21:47 UTC.

## Risco residual

Baixo. (1) Deriva externa: nova advisory de runtime derruba o `auditar` a qualquer hora, comportamento desejado do portão e já registrado como DV-06 (a repetição da linha de base). (2) A exceção do `zod` 3 do `@expo/cli` vence em 2027-01-05; a saída definitiva é subir o SDK. (3) O LEIA-ME do aplicativo sem o novo binário nativo (achado 2) até o binário sair. (4) A prova do `expo-doctor` 21 de 21 no CI só em `[ci completo]`.

## Motivo do humano

Não se aplica (`humano_necessario: nao`). A leitura da lista de exceções com dono e prazo e a decisão do CP-03 são humanas e já estão registradas como decididas por Rafael em 2026-10-07; a exceção nova do `zod` do Expo se enquadra nessa política sem decisão nova.
