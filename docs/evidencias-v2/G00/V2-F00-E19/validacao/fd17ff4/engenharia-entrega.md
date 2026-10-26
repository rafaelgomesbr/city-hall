---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: item 7 da seção 7 de 28 (portão de dependência de execução aprova lockfile com runtime vulnerável); falso verde repetido na E19 (seção 11 de 28)
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-engenharia-entrega`. Cópias de `git archive fd17ff4 dc360` em `$V/e19/` (sem `node_modules`, como o job do CI). macOS arm64, Node 24.15.0 (o `.nvmrc` pede 22), npm 11.12.1 e npm 10.9.2 (a do Node 22 do CI) por `PATH`.

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | Existe: run 39420436042, push em `v2/f00`, `head_sha` 55209ab (só difere de fd17ff4 em `STATUS.md` e `ESTADO-ATUAL.md`, `git diff --stat` conferido), 9 de 9 `success`. Job 118619736543 "Dependências com vulnerabilidade conhecida (auditar)": passos 5 "Política de dependências (npm run auditar)" e 6 "Relatórios brutos" `success`; artefato `dependencias-55209ab...` (10207 bytes, `sha256:5ec2d2a6...`, `workflow_run.id` 39420436042). Log e zip pedem token (HTTP 401) | `$V/api/ci-resumo.txt`, `$V/api/jobs.json`, `$V/api/artifacts.json` |
| O passo que decide não está mascarado | Confirmado no `verificar.yml` do SHA: o passo 5 roda `npm run auditar 2>&1 \| tee`, com `shell: bash` (pipefail), sem `continue-on-error`, sem `if:`, sem `\|\| true`; o único `\|\| true` é do passo 6, que só grava evidência. Sem filtro de caminho em `on:`. O job não instala nada (lê o lockfile) | leitura de `.github/workflows/verificar.yml` linhas 160-221 |
| `npm run auditar` verde no Linux | O job prova: código 0 no Linux, Node 22, em 55209ab, sem `.npmrc` no repositório (`git ls-tree` sem nenhum `.npmrc`), então a árvore auditada foi a do lockfile | `$V/api/ci-resumo.txt` |
| Runtime vulnerável reprova (critério da etapa, item 7 da seção 7) | **FAIL**: com `package-lock=false` no `dc360/.npmrc`, o portão sai 0 com "Runtime limpo" sobre um lockfile com dependência de runtime vulnerável, que o `npm ci --omit=dev` do `Dockerfile` instala (achado 1) | `$V/e19/A2-plantado-npmrc-plock-false.txt`, `$V/e19/A3-npm-ci-como-dockerfile.txt` |
| `auditar` verde no Windows | Não verificado (nenhum job em Windows; todos os 9 são `ubuntu-latest`) | `$V/api/jobs.json` (`labels`) |
| `auditar.test.mjs` | 54 de 54, código 0; nenhum caso cobre `package-lock` | `$V/e19/T0-auditar-test.txt`; `grep` sem ocorrência |

## Evidência

- CI (7 pedidos à API pública ao todo nesta sessão, para as seis etapas): `$V/api/run.json`, `jobs.json`, `artifacts.json`, `anot-baseline.json`, `cr-baseline.json`; `curl -sI` no `archive_download_url` do artefato `restore`: HTTP 401 (`$V/api/download-restore-head.txt`). Um dos pedidos foi um HEAD por engano num id de artefato inexistente.
- `A0-copia-limpa.txt`: cópia limpa de fd17ff4, `node scripts/auditar.mjs`, código 0.
- `A1-plantado-sem-npmrc.txt`: cópia com `node_modules/ajv/node_modules/fast-uri` trocado para 3.0.1 (com `resolved` e `integrity` reais do registro) no `package-lock.json`, sem `.npmrc`: código 1, "REPROVADO: 1 high em dependência de runtime".
- `A2-plantado-npmrc-plock-false.txt`: a mesma cópia com `dc360/.npmrc` = `package-lock=false`: código 0, "Runtime (vai para a imagem): 0", "Consulta de controle ... voltou", "Runtime limpo, e o aplicativo sem advisory nova."
- `A6-npm10-npmrc.txt` e `A7-npm10-plantado.txt`: o mesmo par com npm 10.9.2: 0 e 1.
- `A3-npm-ci-como-dockerfile.txt`: reprodução do estágio `dependencias` do `Dockerfile` (só os `package.json` e o `package-lock.json`, sem `.npmrc`, como o `COPY` das linhas 49-53), `npm ci --workspaces --include-workspace-root --omit=dev --ignore-scripts`: código 0, instala `ajv/node_modules/fast-uri` 3.0.1 e o próprio npm imprime "1 high severity vulnerability". `A4-npm-ci-com-npmrc.txt`: o mesmo com o `.npmrc`, mesma versão instalada.
- `A5-conserto-na-copia.txt`: na cópia, `--package-lock=true` acrescentado a `BANDEIRAS_DA_CONSULTA_REAL`: o caso de A2 passa a sair 1.
- `A8-script-shell-true.txt` e `A9-script-shell-npm10-typecheck.txt`: achado 2.

## Cenários positivos

- Cópia limpa de fd17ff4: código 0 (runtime 0, desenvolvimento 3 aceitas, aplicativo 57 com as 8 aceitas, controle confirmado).
- Lockfile com runtime vulnerável e configuração normal: código 1 (npm 11 e npm 10).
- O run do CI: o passo que decide rodou e saiu 0 sobre a árvore real.

## Cenários negativos

| Caso | Esperado | Obtido |
| --- | --- | --- |
| Runtime vulnerável plantado (aninhado em `ajv`, caminho diferente do usado pelo QA) | 1 | 1 |
| Mesmo lockfile, `package-lock=false` no `.npmrc` do projeto, npm 11 | 1 | **0, "Runtime limpo"** |
| Idem, npm 10.9.2 | 1 | **0** |
| Idem, com `--package-lock=true` nas bandeiras (conserto na cópia) | 1 | 1 |
| `script-shell=/usr/bin/true` no `.npmrc` do projeto, `npm run auditar` com runtime plantado | não 0 | **0, sem executar o script** |

## Tentativas de reprovar

1. Reproduzi de forma independente o achado do QA, com outro pacote plantado (o `fast-uri` aninhado em `ajv`, dependência de runtime pelo `fastify`), e com as duas versões do npm. Reproduz.
2. Confirmei o efeito no artefato: o `Dockerfile` não copia `.npmrc` para o estágio de dependências, e `npm ci` lê o lockfile com ou sem `.npmrc`; nos dois casos a versão vulnerável é instalada e o próprio npm acusa a vulnerabilidade. O portão e a imagem olham árvores diferentes.
3. Confirmei que o job 118619736543 percorre o mesmo caminho da reprodução: checkout, setup-node, `npm run auditar`, sem `npm ci` e sem `node_modules`; ele leria um `dc360/.npmrc` versionado.
4. Procurei outro falso verde no job: `npm run` obedece `script-shell` do `.npmrc` do projeto; com `/usr/bin/true` o passo sai 0 sem rodar o `auditar` (achado 2). O mesmo vale para todo passo `npm run ...` do workflow (testado também com `npm run typecheck`).
5. Procurei dependência fora do registro (que o `npm audit` não audita): nenhuma nos dois lockfiles (`resolved` sempre `registry.npmjs.org`).
6. Procurei máscara no workflow: `continue-on-error` não existe; `|| true` só em passos de evidência e limpeza; nenhum `if:` no job; nenhum filtro de caminho.
7. Mutação: não alterei o repositório; o conserto foi provado só na cópia (A5).

## Achados

1. **Bloqueia.** `dc360/scripts/auditar-excecoes.mjs`, `BANDEIRAS_DA_CONSULTA_REAL` (linhas 327-333), não anula `package-lock`. Com `package-lock=false` em `dc360/.npmrc` o `npm audit` deixa de ler o `package-lock.json` e audita a árvore ideal das faixas do `package.json`; o portão aprova ("Runtime limpo", código 0) um lockfile com dependência de runtime de gravidade alta que o `npm ci --omit=dev` do `Dockerfile:57` instala. Reprodução: `cd $V/e19/npmrc/dc360 && node scripts/auditar.mjs; echo $?` imprime `Runtime limpo` e `0`. O README (seção do `auditar`, linhas 1551-1574) diz que o portão nunca aprova sem ter auditado e que `.npmrc` do projeto não muda o resultado; este caminho não está na lista do que fica fora do alcance. Mesma classe do FAIL da rodada 6 (configuração do npm produz verde falso). Conserto mínimo provado na cópia: `--package-lock=true` nas bandeiras, mais um caso em `auditar.test.mjs` com `package-lock=false` no `.npmrc` da raiz. Concordo com o QA desta rodada.
2. **Corrige antes de crescer.** O CI inteiro confia em `npm run`: uma linha `script-shell=/usr/bin/true` num `.npmrc` versionado em `dc360/` faz `npm run auditar`, `npm run typecheck`, `npm test` e os demais passos saírem 0 sem executar nada, com os 9 jobs verdes. Exige mudança deliberada (visível no diff), por isso não bloqueia sozinho; mas nenhum passo confere que o script de fato rodou (por exemplo, o `auditar` poderia ser chamado como `node scripts/auditar.mjs` no job, ou o passo exigir a última linha "Runtime limpo" na saída, e o job `roadmap` poderia recusar `.npmrc` versionado). No run 39420436042 não há `.npmrc` no repositório, então este run não foi afetado.
3. **Anotado.** O critério "`auditar` verde no Windows" não tem job no CI; segue sem prova neste SHA.

## Não verificado

- O log do job 118619736543 e o conteúdo do artefato `dependencias-55209ab...` (HTTP 401 sem token); li só a conclusão do job e dos passos.
- Windows (sem a plataforma, sem job).
- Node 22 exato (usei Node 24 com npm 10.9.2, a versão que o Node 22 traz).
- Um `docker build` real da imagem (reproduzi o estágio com o mesmo comando e os mesmos arquivos, fora do contêiner).

## Risco residual

Uma linha no `.npmrc` do produto desliga em silêncio a garantia do item 7 da seção 7 de `28`: o job "auditar" fica verde e a imagem leva a versão vulnerável do lockfile. Esse critério não admite risco aceito. O vetor `script-shell` afeta a credibilidade de todo job do workflow, não só deste.

## Motivo do humano

Rafael precisa decidir o conserto do achado 1 antes do G00 (pela seção 7 de `28` ele não admite risco aceito) e confirmar o `auditar` no Windows, que nenhum agente aqui consegue rodar.
