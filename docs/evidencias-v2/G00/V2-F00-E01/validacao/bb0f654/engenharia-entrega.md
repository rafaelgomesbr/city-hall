---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas desta validação (scratchpad, fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

| Critério | Prova local (Mac, Node 24.15.0, npm 11.12.1) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| `baseline.mjs` roda os passos na ordem, grava saída, código e duração, redige segredo | `node scripts/baseline.mjs --sem-instalar --saida=<V>/baseline`: 18 passos executados, `RESUMO.md`, `INDEX.md`, `resultados.json` gravados; código 3 com 15 conferem e 3 divergentes (2 de máquina, 1 causado por mim, repetido e conferido) | job `baseline` (20 passos, com os dois `npm ci`, Linux) | local OK; CI BLOCKED |
| `--so-listar` lista sem executar | `node scripts/baseline.mjs --so-listar`: 20 linhas, nada executado; o passo novo `e2e-firefox` aparece com `MOTOR=firefox` | n/a | PASS local |
| Redação de JWT, `Bearer` e URL com credencial | sonda independente com `redigir` (`<V>/15-redacao.txt`): JWT, Bearer, URL com usuário e senha e pasta pessoal saem redigidos; varredura de `<V>/baseline/` sem JWT nem nome de usuário | passo "Redigir segredo dos artefatos" do CI (não lido) | PASS local |
| Resultado diferente do esperado marca "divergente" e não esconde | o próprio run local deu código 3 com as três divergências nomeadas no RESUMO; mutante `TESTES_DA_E01_EM_SCRIPTS` 29 para 28 deixa `baseline.test.mjs` com 1 falha e `conferir:numeros` código 1 (`<V>/14-numeros-e-mutantes.txt`) | job `baseline` falha com código 3 (lógica do workflow lida, run não lido) | PASS local |
| `test:isolamento` verde (CA-06) | passo `teste-db`: 345 aprovados, 3 pulados, código 0 | passo "Portão de isolamento (CA-06)" do job `produto` | local OK; CI BLOCKED |
| E2E Chromium e Firefox locais e contra a API | `e2e` 70 de 70, `e2e-firefox` 70 de 70, `e2e-api` 288 e 64 sem falha, todos código 0 | job `navegador` | local OK; CI BLOCKED |
| Máquina limpa (com `npm ci` das duas árvores) e Linux | não executado: `npm ci` proibido nesta árvore e o clone limpo falhou por falta de espaço em disco | job `baseline` | BLOCKED |
| Workflow tem o job da linha de base com o tratamento dos códigos 0, 1, 2, 3 | lido e analisado com o parser `yaml` (`<V>/04-workflow-jobs.txt`): job `baseline` existe, roda sem `--sem-instalar`, falha em 3, 2 e outro, falha se faltar arquivo, se o número de resultados não bater com `--so-listar` e se houver passo `divergente` | execução do job | estrutura PASS; execução BLOCKED |

## Evidência

- `<V>/baseline-stdout.txt` e `<V>/baseline/` (RESUMO, INDEX, resultados.json e as 18 saídas redigidas): código 3. Divergências: `teste-api` (1 falha, `openssl-do-teste.test.ts`, LibreSSL 3.3.6 do macOS, divergência conhecida da máquina), `test-scripts` (288 aprovados, 0 pulados contra 4 esperados, porque `apps/campo/ios/` existe nesta máquina, divergência conhecida) e `teste-web` (654 e um arquivo com `ENOSPC: no space left on device`).
- `teste-web` repetido sozinho: `node scripts/baseline.mjs --sem-instalar --so=teste-web --saida=<V>/baseline-teste-web-repeticao`, código 0, 665 de 665, confere (`<V>/baseline-teste-web-repeticao-stdout.txt`). O ENOSPC foi causado por um `git clone` meu no scratchpad, no mesmo minuto, que encheu o disco; não é do produto.
- `<V>/04-workflow-jobs.txt`: 9 jobs, todos com `shell: bash` (liga `pipefail`), todos publicam artefato; `baseline` e `restore` com `if:` de `[ci completo]`, `workflow_dispatch` ou `schedule`.
- `<V>/14-numeros-e-mutantes.txt` e `<V>/15-redacao.txt`.

## Cenários positivos

- Roteiro inteiro sem instalar: 15 de 18 conferem de primeira; com a repetição do `teste-web`, 16 de 18, e os 2 restantes são as duas divergências de máquina que `COMO-REPRODUZIR.md` e as instruções da rodada já declaram.
- `expo-doctor` 21 de 21 sem pular a checagem de versões, `auditar` 0, os dois `npm audit` crus com relatório (conferem).

## Cenários negativos

- Mutante no esperado do roteiro (29 para 28): `baseline.test.mjs` 28 aprovados e 1 falha; `conferir:numeros` sai 1 com "espera 287 casos e a árvore tem 288 (+1)". Desfeito com `git restore`.
- Redação: JWT, Bearer e URL com senha viram `[JWT REDIGIDO]`, `Bearer [REDIGIDO]` e `postgres://[REDIGIDO]@`.

## Tentativas de reprovar

1. Procurei passo que o roteiro esconde: o RESUMO lista as três divergências com o detalhe, e o código 3 bate com o `resultados.json`.
2. Procurei o falso verde do CI no código 1: o workflow falha se o código 1 vier com passo `divergente` no `resultados.json`.
3. Conferi que o job `baseline` não herda `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK` (só o job `aplicativo` o define).
4. Procurei vazamento de segredo e de nome de usuário nas 18 saídas: nada.
5. Tentei a máquina limpa por clone no scratchpad: bloqueada por disco cheio (ambiente), registrada abaixo.

## Achados

- Anotado (ambiente desta validação, não do produto): o disco do Mac está em 100% (de 0,4 a 1,4 GiB livres durante a rodada), ocupado em boa parte por scratchpads de outras sessões. Um clone meu derrubou um arquivo do `teste-web` com ENOSPC; repetido, confere.
- Anotado: o SHA candidato `bb0f654` não traz `[ci completo]`; os jobs `baseline` e `restore` só rodam no run do registro `ecaad76` (descendente que, pelo `git diff --stat`, muda só `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md`). O gatekeeper precisa aceitar o run do descendente como run do SHA, ou pedir `workflow_dispatch` sobre `bb0f654`.
- Anotado: Node local é 24.15.0 e `.nvmrc` diz 22; o roteiro rodou assim mesmo (divergência de máquina).

## Não verificado

- O run do CI do SHA (job `baseline` com os dois `npm ci` em Linux, artefato, INDEX conferido): não lido nesta sessão.
- Os dois passos `npm ci` (máquina limpa): proibidos nesta árvore; o clone limpo falhou por disco.
- Windows.

## Risco residual

Baixo no código: o roteiro e o comparador mordem. O risco é só de prova: a reprodução em máquina limpa e em Linux depende do run do CI, que não foi lido.

## Motivo do humano

Nenhum: o que falta é a leitura do run do CI pelo gatekeeper (ambiente externo inacessível nesta sessão), não um julgamento humano.
