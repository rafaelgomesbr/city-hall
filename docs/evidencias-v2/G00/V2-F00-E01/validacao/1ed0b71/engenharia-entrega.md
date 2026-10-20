---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI (seção 8 de `28`): run do CI do SHA, job a job, com artefato. NÃO EXISTE. O run 39366804765 do registro `7644420` foi recusado pelo GitHub antes de começar (faturamento, H32) e o `gh` está sem login. Pela seção 6 de `28` ("Run inexistente: BLOCKED") esta dimensão não pode dar PASS. A prova de máquina limpa e de Linux que a etapa pede (os dois `npm ci` do roteiro, os 20 passos em Linux) só viria desse run.
- O workflow cobre o que a etapa exige? Sim, por leitura do `.github/workflows/verificar.yml` no SHA (idêntico em `5044e7a`, o diff `1ed0b71..5044e7a` só toca STATUS e ESTADO-ATUAL): job `baseline` (linhas 716 a 851) roda `node scripts/baseline.mjs --saida=...` sem `--sem-instalar` (os dois `npm ci` entram), em Node 22, com Chromium e Firefox instalados, publica `baseline-<sha>` com RESUMO, INDEX e resultados.json; só roda com `[ci completo]`, `workflow_dispatch` ou agenda (o registro `7644420` traz `[ci completo]`).
- `.nvmrc` com 22: conferido (`dc360/.nvmrc` = `22`; o workflow fixa `node-version: "22"` nos 9 jobs).
- `baseline.mjs --so-listar` imprime os comandos sem executar: 20 passos, código 0, nenhuma pasta criada (`e01-01-so-listar.txt`).
- `node --test scripts/baseline.test.mjs`: 29 de 29, código 0 (`e01-02-baseline-test.txt`).
- Lógica de decisão do passo "Roteiro da linha de base" do CI: extraí o bloco `run:` do workflow e o rodei com `bash --noprofile --norc -eo pipefail` (o mesmo shell do GitHub) contra um `baseline.mjs` falso, em oito casos (`sim-baseline/`). Resultado: código 0 passa; código 1 só com `divergente-explicada` passa com `::warning`; código 1 com um passo `divergente` falha; código 3 falha; código 2 falha; 18 resultados para 20 passos falha; falta de `INDEX.md` falha; código 0 com passo `divergente` no json falha. A regra escrita no comentário do job confere com o código.
- Redação de segredo: a saída do roteiro parcial gravada por ele não tem JWT, `Bearer` com valor, URL com credencial nem a pasta pessoal (a única ocorrência de "Bearer" é o nome de um teste).
- Roteiro parcial no Mac: `node scripts/baseline.mjs --sem-instalar --so=typecheck,teste-console,test-scripts,conferir-numeros,auditar,audit-raiz,audit-campo,expo-doctor`, código 3: 7 conferem; `test-scripts` diverge por duas causas de máquina, nenhuma de produto (ver Achados).

## Evidência

Saídas em `SCRATCH/validadores/engenharia-entrega/` (SCRATCH é a pasta de rascunho da sessão do gatekeeper):

- `e01-01-so-listar.txt`: `node scripts/baseline.mjs --so-listar`, código 0, 20 linhas.
- `e01-02-baseline-test.txt`: `node --test scripts/baseline.test.mjs`, código 0, 29 de 29.
- `e01-03-baseline-parcial-stdout.txt` e `e01-baseline-parcial/` (RESUMO.md, INDEX.md, resultados.json e 8 saídas): roteiro parcial, código 3.
- `sim-baseline/bloco.sh` (o bloco do workflow, extraído sem edição de lógica) e o roteiro falso `sim-baseline/scripts/baseline.mjs`; os oito resultados estão listados acima.
- `e17-01-conferir-numeros.txt`: `npm run conferir:numeros`, código 0, 25 afirmações, "O roteiro da linha de base (scripts/baseline.mjs) espera o mesmo total de casos que a árvore tem, nas oito suítes".
- `e18-01-e2e-local-chromium.txt`, `e18-02-e2e-local-firefox.txt` e `e18-05-e2e-api.txt`: os três E2E do roteiro, cada um "Falhou: 0" (70, 70, 288 e 149), que é o esperado dos passos `e2e`, `e2e-firefox` e `e2e-api`.

## Cenários positivos

- Roteiro parcial: typecheck, console (274), `conferir:numeros`, `auditar`, os dois `npm audit` crus (vermelhos com `# npm audit report`, como o esperado exige) e `expo-doctor` (21 de 21, sem pular a checagem de versões) conferem.
- Os passos de E2E, rodados com os mesmos comandos que o roteiro usa, dão exatamente as contagens que `PASSOS` espera em `1ed0b71` (70; 288 e 149).

## Cenários negativos

- Simulação do passo do CI com resultados ruins (código 3, 2, contagem de passos errada, arquivo faltando, código e json discordando): o job falha em todos os casos.
- `npm_config_offline=true` no roteiro (`e19-07-baseline-offline-stdout.txt`): os passos `audit-raiz` e `audit-campo` divergem e o roteiro sai 3. O roteiro não aceita `npm audit` que não auditou.

## Tentativas de reprovar

- Procurei número velho no esperado do roteiro: `conferir:numeros` confere as oito suítes contra a árvore e passa; os E2E rodados batem com o `contem` de `PASSOS` mudado em `1ed0b71` (149 da largura estreita).
- Procurei um jeito de o job `baseline` ficar verde com divergência sem explicação: não há (simulação acima).
- Procurei segredo nas saídas que o roteiro grava: nada.
- Procurei diferença entre a contagem de passos do CI (`--so-listar | wc -l`) e o número de resultados num run com `npm ci`: 20 e 20; o CI não usa `--sem-instalar`, então a conta fecha.

## Achados

- Anotado (máquina, não produto): no Mac, `test-scripts` dentro do roteiro dá 0 pulados contra 4 esperados porque `apps/campo/ios/` existe nesta máquina (os testes de entitlements do iOS rodam). Conhecido desde a rodada 4.
- Anotado (máquina, não produto): `scripts/e2e-porta-ocupada.test.mjs` falha com `EADDRINUSE` quando OUTRO processo já ocupa a porta 3691 (aqui, a sessão alheia rodando o e2e da API). Com a porta livre passa (`e17-04`); com a porta tomada por um terceiro falha (`e17-05`). No runner do CI a porta está livre. Detalhe no relatório da E17.
- Anotado: o job `implantavel` usa `postgres:16` e o `restore` usa `postgres:17` sem fixar o patch (a produção é 17.6). A nota de versões da etapa registra isso; não reprova a E01.
- Nenhum achado bloqueia. O bloqueio é a falta do run.

## Não verificado

- O run do CI do SHA (job `baseline` em Linux, com os dois `npm ci` numa máquina limpa e os 20 passos): não existe (H32).
- Os dois passos `npm ci` do roteiro: não rodados nesta máquina (proibido apagar `node_modules` da árvore de trabalho, `29-operacao-do-ambiente.md`).
- O roteiro inteiro de 18 passos com `--sem-instalar` neste Mac: rodei 8 passos pelo roteiro e os três E2E pelos mesmos comandos fora dele; db, shared, pacote de campo, API, painel e jest do aplicativo dentro do roteiro ficaram para o QA.
- Windows e a "segunda pessoa" da validação humana.

## Risco residual

O roteiro e a lógica do job estão coerentes e mordem, mas nenhum run em Linux deste SHA prova que os 20 passos conferem numa máquina limpa. Números de Linux (pulos por ambiente, `expo-doctor` do dia, advisories do dia) podem divergir do Mac.

## Motivo do humano

A evidência mínima desta dimensão é o run do CI do SHA, que só existe depois de o Rafael resolver o faturamento da conta do GitHub (H32) e um run completo (`[ci completo]` ou `workflow_dispatch`) rodar sobre `1ed0b71` ou um descendente só com a lista permitida. A validação humana da etapa (segunda pessoa seguindo `COMO-REPRODUZIR.md`) também é de pessoa.
