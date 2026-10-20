---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: item 7 da seção 7 de 28 (portão de dependência de execução aprova lockfile com runtime vulnerável); falso verde repetido na E19 (seção 11 de 28)
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/e19` e `$R` = `.../scratchpad/val-qa/reg`. Árvore principal em `55209ab` (produto igual ao de `fd17ff4`); cópias de `git archive fd17ff4 dc360` em `$V/copia/` e variantes (`runtime/`, `npmrc-plock/` etc.), sem `node_modules` (o `npm audit` lê o `package-lock.json`, como o job do CI, que "não instala nada"). macOS arm64, Node 24.15.0 (o `.nvmrc` pede 22), npm 11.12.1 e, para o achado, também npm 10.9.2 (a versão do Node 22 do CI), com rede.

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde conforme o CP-03 (caminho normal) | PASS: código 0, runtime 0, desenvolvimento 3 aceitas com dono e prazo, aplicativo 57 com as 8 advisories aceitas por GHSA e gravidade, consulta de controle confirmada, 6,9 s | `$V/P1-auditar-real.txt`; na cópia limpa, `$V/P2-copia-limpa.txt` |
| Zero runtime vulnerável na raiz (`npm audit --omit=dev`) | PASS: `found 0 vulnerabilities`, código 0 | `$R/02-npm-audit-omit-dev.txt` |
| Runtime vulnerável reprova (critério da etapa e item 7 da seção 7) | **FAIL**: com `package-lock=false` no `.npmrc` do projeto (`dc360/.npmrc`) e um lockfile com runtime vulnerável, o portão sai 0 com "Runtime limpo" (achado 1) | `$V/casos/N13*.txt` |
| O portão nunca aprova sem ter auditado (README, parágrafo do `auditar`) | PASS nos caminhos da rodada 6 e nos novos que tentei (tabela de negativos), salvo o achado 1, em que ele audita uma árvore que não é a do lockfile | `$V/casos/` |
| Exceções com dono, motivo e prazo; exceção vencida reprova | PASS: 6 do aplicativo e 3 de desenvolvimento com `dono`, `motivo`, `ate`; com o relógio em 2027-01-05 sai 0, em 2027-01-06 sai 1 com os 9 vencimentos | `$V/casos/N32*.txt`, `$V/casos/N33*.txt` |
| Exceção casa por GHSA, não por nome (achado 2 da rodada 6) | PASS: advisory nova e crítica em `node-forge` (id 999999) sai 1, "NOVA: node-forge npm:999999" | `$V/casos/N30-npm-falso-forge-nova.txt` |
| `auditar.test.mjs` (negativos sintéticos) | PASS: 54 de 54; mutação na cópia (canário do aplicativo desligado) deixa 2 vermelhos | `$V/T01-auditar-test-arvore.txt`, `$V/T02-mutacao-sem-canario-app.txt` |
| `npx expo-doctor` 21 de 21 sem pular a checagem | PASS: `21/21 checks passed`, código 0, sem `EXPO_DOCTOR_SKIP_*` no ambiente | `$R/04-expo-doctor.txt` |
| Regressão: `typecheck`, `npm test`, `test:campo`, `test:scripts`, `test:isolamento`, `superficie.test.ts` | PASS: `npm test` código 0 (motor de campo 238, shared 223, API 1685 e 34 pulados, console 286, painel 699, banco 345 e 3 pulados, com `superficie` 9 e 12 e `isolamento` 137); `test:campo` 0 (1997 casos); `test:scripts` 324 de 324; typecheck e isolamento pelo gatekeeper | `$R/06-npm-test.txt`, `$R/05-test-campo.txt`, `$R/03-test-scripts.txt` |
| E2E: `npm run test:e2e:api` | PASS: Chromium, `Passou: 288 Falhou: 0` e `Passou: 197 Falhou: 0`, código 0 | `$R/07-e2e-api-chromium.txt` |
| `auditar` verde no Linux | PASS pelo CI: job "Dependências com vulnerabilidade conhecida (auditar)" (118619736543) do run 39420436042 sobre `55209ab`, passo "Política de dependências (npm run auditar)" com `success` (lido pela API pública de jobs, sem o log, que exige token) | `.../scratchpad/val-qa/ci/jobs-e-passos.txt` |
| `auditar` verde no Windows | Não verificado (sem Windows) | |

## Evidência

- `npm run auditar` na árvore: código 0 (`$V/P1-auditar-real.txt`).
- `node --test scripts/auditar.test.mjs`: código 0, 54 de 54 (`$V/T01-auditar-test-arvore.txt`); na cópia com a mutação: código 1, 2 falhas (`$V/T02-mutacao-sem-canario-app.txt`).
- Negativos: um arquivo por caso em `$V/casos/`, com a saída e `codigo=` no fim; ferramentas em `$V/ferr/` (`caso.sh`, `caso-proxy.sh`, `proxy.mjs` de inspeção TLS com 8 modos, `plantar.mjs`, `data.mjs` que fixa o relógio por `--import`). Npm falso do implementador em `docs/evidencias-v2/G00/V2-F00-E19/correcao-6/ferramentas/` (só leitura).
- Reprodução mínima do achado 1 fora do portão, com `npm ci` de verdade: `$V/mini/` (projeto com `fast-uri` 3.0.1 no lockfile).
- Regressão: `$R/01-build-shared.txt` a `$R/07-e2e-api-chromium.txt`, todos `exit=0`.
- CI: `.../scratchpad/val-qa/ci/jobs.json` e `jobs-e-passos.txt` (1 pedido à API pública).

## Cenários positivos

- Árvore real e cópia limpa: 0, com os números reais (runtime 0, desenvolvimento 3, aplicativo 57 ou 55 conforme a hora, as 8 aceitas presentes).
- Último dia do prazo (relógio em 2027-01-05T12:00Z): 0.
- Configuração hostil que o portão anula (offline, prefer-offline, registro falso, `audit=false`, `dry-run=true`, `omit=dev` no `.npmrc` do usuário e nos `.npmrc` do projeto e do aplicativo): ele audita o registro oficial de verdade e, com runtime plantado, reprova (N03, N04, N05, N40, N41).

## Cenários negativos

Runtime plantado = cópia com `node_modules/fast-uri` 3.0.1 (alta, runtime) no `package-lock.json` da raiz.

| Caso | Esperado | Obtido |
| --- | --- | --- |
| N01 runtime plantado (npm 11 e npm 10.9.2) | 1 | 1 |
| N03 a N05 runtime plantado com `offline`, `prefer-offline`, `npm_config_registry` falso | 1 | 1 |
| N06 `npm_config_workspace=@dc360/shared` | 1 ou 2 | 2 (o runtime da raiz SOME, 0, mas o aplicativo dá erro de workspace e o portão sai 2) |
| N07 `npm_config_workspaces=false` | 1 ou 2 | 1 |
| N08 `npm_config_package_lock=false` | 1 ou 2 | 2 (runtime da raiz SOME, salvo pelo canário do aplicativo, 55 sem as aceitas) |
| N09 `omit=dev optional peer`; N10 `include=dev`; N12 `package-lock-only` | 1 | 1 |
| N11 `npm_config_global=true` | 2 | 2 (EAUDITGLOBAL) |
| **N13 `package-lock=false` no `.npmrc` do projeto (raiz), runtime plantado** | 1 | **0, "Runtime limpo"** (repetido em N13b, e com npm 10.9.2 em N13c) |
| N14 `workspace=@dc360/shared` no `.npmrc` do projeto | 1 ou 2 | 2 (a consulta de controle herda o `.npmrc` e dá erro) |
| N20 a N22 proxy de inspeção TLS (`https-proxy` e `cafile`) respondendo `{}` ou `{"advisories":{}}` às consultas reais, ou a todas | 2 | 2 |
| N23 proxy com HTTP 500; N26 proxy que não responde (`fetch-timeout` 8 s, sem nova tentativa) | 2 | 2 (`network timeout`) |
| N24 proxy que forja só a consulta `--omit=dev`, runtime plantado | 1 | 1 (a completa acusa `fast-uri` fora do desenvolvimento) |
| N25 proxy que repassa tudo e apaga só a advisory nova (`fast-uri`) | 0 (limite declarado no README) | 0 |
| N30 npm falso: 7 saídas malformadas | 2 | 2 nas 7 |
| N30 npm falso: `runtime-alta`, `app-nova`, `forge-nova` | 1 | 1 nos 3 |
| N31 npm que devolve relatório vazio bem formado em toda pasta | 2 | 2 ("não é confiável") |
| N33 relógio em 2027-01-06 | 1 | 1 (9 exceções vencidas) |
| N42 `package-lock=false` no `.npmrc` do usuário, runtime plantado | 1 ou 2 | 2 (só pelo canário do aplicativo) |
| N02 lockfile adulterado marcando o runtime vulnerável como `dev: true` | ver Achados | 0 |

## Tentativas de reprovar

Pedido do gatekeeper: fazer o `auditar` sair 0 sem ter auditado de verdade. Tentei todos os caminhos listados e mais alguns que o próprio código do npm sugere (`arborist.audit()` em `/usr/local/lib/node_modules/npm/node_modules/@npmcli/arborist/lib/arborist/index.js:250-284`: com `packageLock === false` ele audita a árvore IDEAL calculada das faixas do `package.json`, e não o lockfile; com `workspaces` ele filtra a árvore).

1. **Conseguido.** `package-lock=false` no `.npmrc` da raiz (N13): o `npm audit` deixa de ler o `package-lock.json` e audita uma árvore ideal resolvida das faixas de versão (os mesmos 249 pacotes do lockfile, em outras versões, então nem uma conferência de contagem pegaria); o `fast-uri` 3.0.1 do lockfile não é auditado, o runtime dá 0, a completa ainda traz `vitest`, `@vitest/mocker` e `tinypool` (faixa `^3.2.4` continua vulnerável), o aplicativo tem o próprio `package.json` e não lê o `.npmrc` da raiz (57, as 8 aceitas voltam) e a consulta de controle, que copia esse `.npmrc`, resolve `lodash` 4.17.20 exato e volta com a advisory. Todas as provas passam e o portão sai 0. Prova de que o artefato SAIRIA vulnerável: em `$V/mini/`, com o mesmo `.npmrc`, `npm ci --omit=dev` instala `fast-uri` 3.0.1 (o do lockfile), e o `npm audit` diz 0 com e sem `node_modules`; sem o `.npmrc`, o mesmo audit acusa 1 alta. O `Dockerfile:57` usa exatamente `npm ci --workspaces --include-workspace-root --omit=dev`. E o conserto fecha: na cópia, acrescentar `--package-lock=true` a `BANDEIRAS_DA_CONSULTA_REAL` faz N13 sair 1 (N13d).
2. Workspace a menos (N06, N14) e `package-lock=false` por variável ou no `.npmrc` do usuário (N08, N42): o runtime da raiz também some, mas o portão sai 2, salvo por acaso (o aplicativo dá erro de workspace, o controle herda o `.npmrc`, ou o aplicativo sem `node_modules` resolve outra árvore e perde 2 das 57). Nenhuma dessas defesas é intencional para esse caminho.
3. Segurou: offline, prefer-offline, cache, registro falso, `{}`, `{"advisories":{}}`, HTTP 500, tempo esgotado, proxy que forja tudo, só a de runtime, só as reais, `.npmrc` hostil do projeto, do aplicativo e do usuário com seis chaves, `npm_config_*`, `--omit` e `--include` pela configuração, `global`, `package-lock-only`, sete saídas malformadas, advisory nova em pacote aceito, advisory sem GHSA, exceção vencida (o relógio fixado pelo `--import`).
4. Limites declarados no README e confirmados: npm falso no `PATH` que forja tudo; proxy que tira só a advisory nova (N25 dá 0).
5. Mutação para ver o teste morder: na cópia, `ausentesNoApp = []` deixa 2 de 54 vermelhos. Nenhum caso de `auditar.test.mjs` cobre `package-lock=false` nem `workspace` (grep sem ocorrência).

## Achados

1. **Bloqueia.** `dc360/scripts/auditar-excecoes.mjs` (`BANDEIRAS_DA_CONSULTA_REAL`, linhas 327-333) não anula `package-lock`. Com `package-lock=false` no `.npmrc` do projeto (`dc360/.npmrc`, um arquivo de uma linha e uma configuração comum para quem não quer lockfile), o portão aprova com "Runtime limpo" e código 0 um `package-lock.json` que leva dependência de runtime com advisory alta, e o `npm ci --omit=dev` do `Dockerfile` instala essa versão. O job do CI roda sem `npm ci`, exatamente como a reprodução. O README promete anular `offline`, `prefer-offline`, `dry-run` e o registro vindos de `.npmrc` do projeto, e lista como fora do alcance só o npm falso, o proxy que reescreve e as listas vazias; este caminho não está em nenhuma das duas listas. É a mesma classe do FAIL da rodada 6 (configuração do npm que produz verde falso). Reprodução: `cd $V/npmrc-plock/dc360 && node scripts/auditar.mjs; echo $?` (cópia de `fd17ff4` com `fast-uri` 3.0.1 no lockfile e `.npmrc` com `package-lock=false`) imprime `Runtime limpo` e `0`. Conserto mínimo, provado na cópia (N13d): `--package-lock=true` nas bandeiras e um caso em `auditar.test.mjs` com `package-lock=false` no `.npmrc` da raiz. Conferir só a contagem de dependências não basta: a árvore ideal tem os mesmos 249 pacotes do lockfile. Vale avaliar também `--workspaces`/`--include-workspace-root` explícitos, para o filtro de workspace não depender do acaso (tentativa 2).
2. **Anotado.** Lockfile adulterado que marca um pacote de runtime vulnerável como `dev: true` passa com 0 (N02). Não é verde falso sobre o artefato: o `npm ci --omit=dev` do `Dockerfile` usa a mesma marca e não instala o pacote (a imagem quebraria antes de ficar vulnerável). Fica registrado porque `pacotesDeRuntimeNoCompleto` confia na marca do lockfile.
3. **Anotado.** O prazo é comparado com a data em UTC (`new Date().toISOString()`): no Brasil a exceção vence às 21h do dia 2027-01-05, três horas antes do "fim do dia escrito" que o comentário promete.
4. **Anotado** (da rodada 6, continua). A decisão do CP-03 não tem pasta em `docs/evidencias-v2/CP-03/`.

## Não verificado

- `npm run auditar` no Windows (sem a plataforma); o código usa `shell: process.platform === "win32"`, só lido.
- O log do job 118619736543 e o artefato `dependencias-55209ab...` (pedem token); li só o resultado do job e dos passos.
- Node 22 exato (rodei Node 24 com npm 11 e com npm 10.9.2, a versão do Node 22; o achado 1 se reproduz nas duas).
- Um espelho real (Nexus, Artifactory, Verdaccio) e um proxy de inspeção TLS de verdade: reproduzi com proxy local.
- O aplicativo com os pacotes do Expo subidos num aparelho e o próximo binário nativo (humano).

## Risco residual

Uma linha `package-lock=false` no `.npmrc` do produto, acrescentada por qualquer motivo, desliga em silêncio a garantia do item 7 (runtime vulnerável reprova): o job "auditar" fica verde e a imagem leva a versão do lockfile. As defesas que hoje salvam os casos vizinhos (workspace e `package-lock=false` por variável) são efeito colateral do aplicativo e da consulta de controle, e não regra. O npm falso e o proxy que reescreve continuam fora do alcance, como o README diz.

## Motivo do humano

Rafael precisa ler a lista de exceções (dono, motivo, prazo e gravidade aceita de cada GHSA), confirmar a premissa H24 (pacotes do Expo subidos por analogia à D1) e ver o binário nativo novo num aparelho; e decidir se o achado 1 se conserta antes do G00 (pela seção 7 de `28` ele não admite risco aceito).
