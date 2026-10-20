---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI: run do CI do SHA, job a job, com artefato. NÃO EXISTE (run 39366804765 do registro `7644420` recusado pelo GitHub por faturamento, H32; `gh` sem login). A DoD pede "portabilidade provada em duas plataformas" (Windows e Linux), e a prova Linux é o job `produto` desse run. BLOCKED pela seção 6 de `28`.
- O workflow cobre a etapa? Sim, por leitura de `.github/workflows/verificar.yml` no SHA: o job `produto` instala as duas árvores (`npm ci` na raiz e em `apps/campo`, linhas 97 a 108, porque vários testes de `scripts/` leem `apps/campo/node_modules`) e roda `npm run test:scripts` (linha 140) e `npm run conferir:numeros` (linha 144), cada um gravando a saída no artefato `produto-<sha>`, com `bash` e `pipefail` (o `tee` não esconde o código).
- `npm run test:scripts` no Mac, árvore principal: 288 testes, 288 passam, 0 falhas, 0 pulados, código 0 (`e17-02-test-scripts.txt`). Os 4 pulados por ambiente do Linux aqui rodam porque `apps/campo/ios/` existe (ignorado pelo git), e passaram: inclui o caso de entitlements do iOS.
- `npm run conferir:numeros` no Mac: código 0, 25 afirmações conferidas, as oito suítes do roteiro batem com a árvore (`e17-01-conferir-numeros.txt`).
- Teste negativo da etapa ("`conferir:numeros` reprova um número alterado de propósito"): troquei `5355` por `5354` em `dc360/docs/COLOCAR-DE-PE.md:41`, rodei, restaurei com `git restore`. Código 1, "Afirmações que não batem (1)", com a linha e o valor real (`e17-03-conferir-numeros-MUTANTE.txt`). `git diff` vazio depois.

## Evidência

Em `SCRATCH/validadores/engenharia-entrega/`:

- `e17-01-conferir-numeros.txt`: código 0.
- `e17-02-test-scripts.txt`: código 0, 288 de 288.
- `e17-03-conferir-numeros-MUTANTE.txt`: código 1 com o número plantado.
- `e17-04-porta-ocupada-porta-livre.txt`: `node --test scripts/e2e-porta-ocupada.test.mjs` com a porta 3691 livre, código 0.
- `e17-05-porta-ocupada-por-terceiro.txt`: o mesmo com outro processo segurando a porta 3691, código 1 (`EADDRINUSE`).
- `e01-baseline-parcial/03-test-scripts.txt`: o passo `test-scripts` do roteiro, rodado enquanto a sessão alheia segurava a porta 3691: 287 de 288, a falha é o `EADDRINUSE` acima.

## Cenários positivos

- `test:scripts` verde e `conferir:numeros` verde no SHA, no Mac, com os mesmos comandos do job `produto`.
- Os três testes da etapa (`comando-de-migracao`, `copiar-producao`, `entitlements-do-ios`) estão entre os 288 que passam.

## Cenários negativos

- Número de documentação alterado: `conferir:numeros` reprova com código 1 e diz onde.
- Os casos de recusa de pasta do `copiar-producao` (repositório, iCloud, Dropbox, Google Drive, OneDrive, Área de Trabalho) rodam dentro do `test:scripts` verde.

## Tentativas de reprovar

- Rodei o `test:scripts` dentro do roteiro de linha de base com uma porta de e2e ocupada por terceiro: um teste falha por ambiente (achado anotado abaixo). Não é regressão da etapa: com a porta livre passa, e no runner do CI a porta está livre.
- Procurei passo do CI que rode `test:scripts` sem o `node_modules` do aplicativo (o que faria testes saírem sem afirmar): o passo depende de `steps.instalar_app.outcome == 'success'`, então não roda sem a instalação.
- Procurei `continue-on-error` ou `|| true` nos passos de `test:scripts` e `conferir:numeros`: não há.

## Achados

- Anotado: `dc360/scripts/e2e-porta-ocupada.test.mjs:42` ocupa a porta 3691 para simular a instância velha e, se outro processo já a ocupa, falha com `EADDRINUSE` em vez de aproveitar a porta já ocupada (que é exatamente a pré-condição do caso). Reprodução: `node -e "require('net').createServer().listen(3691,'127.0.0.1')" &` e depois `node --test scripts/e2e-porta-ocupada.test.mjs`: 1 falha. Faz `test:scripts` e o passo `test-scripts` do roteiro ficarem vermelhos por ambiente numa máquina que roda dois e2e em paralelo. Não toca critério da E17.
- Nenhum achado bloqueia. O bloqueio é a falta do run.

## Não verificado

- O job `produto` em Linux (o run do SHA não existe, H32): é a metade Linux da DoD.
- Windows: fora de alcance desta máquina (validação humana da etapa).
- Os 4 pulados por ambiente do Linux: no Mac eles rodam (pasta `ios/` presente), então a contagem "4 pulados" só se confere no run.

## Risco residual

Sem o run, a afirmação "0 falhas em Linux" depende do run de rodadas anteriores sobre outros SHAs. Entre `bb0f654` e `1ed0b71` mudaram contagens do roteiro (`baseline.mjs`), que o `conferir:numeros` confere localmente e passou.

## Motivo do humano

O run do CI do SHA só existe depois de o Rafael resolver o faturamento do GitHub (H32). A execução no Windows é a validação humana da etapa.
