---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- `npm run test:scripts` sem falha em Linux: PASS. O job "Testes, tipos e scripts" (115462783339) roda o passo "Testes dos scripts" e ele fecha success: 243 casos, 239 ok, 0 falhas, 4 pulados por ambiente (`produto-c9895e9.../06-test-scripts.txt`). Os 4 pulados são todos de `scripts/entitlements-do-ios.test.mjs` ("sem pasta ios/ nesta máquina", "sem projeto iOS gerado"), como o bloco pede.
- `test:scripts` sem falha em Windows: PASS. Rodado por mim em Git Bash: 243, 239 ok, 0 falhas, 4 pulados, código 0 (`scratchpad/eng/out/test-scripts-local.txt`).
- `conferir:numeros` sem divergência em Linux: PASS. Artefato `07-conferir-numeros.txt` do CI: "Afirmações conferidas: 24", "Todos os números da documentação batem com a realidade" e "o roteiro ... espera o mesmo total de casos que a árvore tem, nas oito suítes". O conferidor conta os pulos por ambiente e os `describe.skip` marcados pela política T42 ("0 ponto(s) de pulo incondicional com marca T42", "3 em db/test/busca.test.ts").
- Os três casos do bloco (caso 19 `comando-de-migracao`, caso 22 `copiar-producao`, caso 37 `entitlements-do-ios`): PASS por leitura do código e do teste, mais a execução nas duas plataformas.

## Evidência

Run 38445527075 (sobre `c9895e9`, evento push, success, 9 de 9 jobs). `git diff 4b96ea7..c9895e9` só toca `ROTEIRO-G00.md`, `ESTADO-ATUAL.md` e `STATUS.md` (lista permitida da seção 6 de `28`). Artefato `produto-c9895e9...` baixado em `scratchpad/eng/art/`. Leitura dos testes:

- `comando-de-migracao.test.mjs:76-81` usa `execFileSync("npm", ..., { shell: process.platform === "win32" })`, a invocação portátil de `testar-campo.mjs`.
- `copiar-producao.test.mjs` monta os cinco lugares recusados com `join` a partir de `parse(resolve(".")).root` (nenhum caminho POSIX literal em `assert`); recusa repositório, iCloud (`Mobile Documents`), Dropbox, `Google Drive`, OneDrive e Área de Trabalho, e aceita `dc360-copias` na casa.
- `entitlements-do-ios.test.mjs:87-110` separa `problemasDaEscolhaDoAmbiente` e prova num rascunho que o `mode` escrito à mão, a constante sem `EAS_BUILD_PROFILE` e o `pushAmbiente` à mão reprovam, com a lista exata de problemas.

## Cenários positivos

Linux (CI) e Windows (local) com 0 falhas; `conferir:numeros` com 24 afirmações conferidas no CI.

## Cenários negativos

- `conferir:numeros` reprova número errado: acrescentei um caso a `scripts/baseline.test.mjs` e ele saiu 1 com "espera 243 casos e a árvore tem 244 (+1)" (`out/e01-mut-caso-a-mais.txt`), restaurado com `git restore`. Reprovou também de verdade, sem mutação minha, quando um arquivo de teste alheio acrescentou 13 casos ao pacote do campo: o conferidor listou o 223 contra 236 em nove frases de README, `COLOCAR-DE-PE.md` e `LEIA-ME.md` (`out/e01-conferir-numeros-base.txt`).
- Caso 37: o próprio arquivo de teste contém o caso negativo do rascunho estragado (acima), que roda no CI.

## Tentativas de reprovar

1. Procurei caminho POSIX literal que reaparecesse nos testes de `scripts/`: só o comentário que explica a correção (`copiar-producao.test.mjs:50`).
2. Procurei `execFileSync("npm"` sem `shell` em outros testes de `scripts/`: o do caso 19 tem o `shell` de Windows; não achei outro quebrando no Windows (243 sem falha local).
3. Procurei diferença entre Windows e Linux nos números: 243 nos dois lugares, 4 pulados nos dois.
4. Procurei enfraquecimento dos cinco lugares recusados: os cinco asserts continuam e há o controle positivo (`dc360-copias` devolve `null`).
5. Tentei fazer o `conferir:numeros` local passar com a árvore suja: ele reprovou, como deve (o arquivo é do outro validador); o resultado limpo vem do CI e da saída do gatekeeper.

## Achados

Nenhum bloqueia. Anotado: não consegui um `conferir:numeros` local verde porque a árvore tem um arquivo de teste não rastreado de outro validador; o verde em Linux e o 24 de 24 do gatekeeper cobrem. A mordida do caso 22 no código de produção (`razaoParaRecusarAPasta`) não foi refeita por mim (mutar `scripts/copiar-producao.mjs` não está na minha lista de mutações permitidas nesta rodada).

## Não verificado

Mutação em `razaoParaRecusarAPasta` (ver acima). macOS. O caso 37 com a pasta `ios/` presente (o CI e esta máquina não a têm; os 4 casos ficam pulados por ambiente, como o bloco pede).

## Risco residual

Baixo: ferramenta de desenvolvimento, sem dado de município. A mensagem de pulo "sem pasta ios/" pode esconder, num dia em que a pasta exista e o teste não rode, uma regressão do `aps-environment`; o caso 37 de leitura de `app.config.ts` não depende dela e roda sempre.

## Motivo do humano

Não aplicável (o bloco pede que Rafael rode os dois comandos; o CI e a execução local desta rodada substituem, porque E1 prova).
