---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e14-18`. O produto em `dc360/` é idêntico entre `fd17ff4` e o HEAD `55209ab`. O diff da rodada (`1ed0b71..fd17ff4`) toca exatamente o que esta etapa mantém: os números de `dc360/README.md` e `dc360/docs/COLOCAR-DE-PE.md` (5355 para 5473, console, painel, API), `scripts/baseline.mjs` (tabelas de contagem) e o workflow. Não toca `copiar-producao.mjs`, `conferir-numeros.mjs` nem os três testes da etapa (`git diff --stat` vazio para eles). Mutações numa CÓPIA de `fd17ff4` (`git archive` em `$V/arv`, `node_modules` por link, sem `git worktree`), aplicadas, testadas e restauradas com conferência de SHA-256 por `$V/scripts/mutar.mjs`. A dimensão Infra e CI é de outro validador; aqui provo o que roda localmente e cito os jobs do run.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| `npm run test:scripts` com 0 falhas | árvore principal (macOS, Node 24.15.0): 324 testes, 324 aprovados, 0 falha, 0 pulado, código 0 (`$V/r-test-scripts.txt`); CI Linux: job "Testes, tipos e scripts" (118619736871), passo "Testes dos scripts" `success`, com `shell: bash` (pipefail ligado, então o `tee` não esconde o código) | PASS |
| Os 4 pulados seguem por ambiente (sem `ios/`) | nesta máquina existe `apps/campo/ios` (ignorado pelo git), por isso os 4 RODARAM e passaram; na cópia limpa (sem `ios/`, como um clone): 4 pulados (`$V/e17-test-scripts-copia.txt`) | PASS |
| `conferir:numeros` sem divergência | árvore: 25 afirmações conferidas, "Todos os números da documentação batem", código 0 (`$V/r-conferir-numeros.txt`); cópia sem mutação: código 0 (`$V/mut-e17/E17-N0.txt`); CI: passo "Os números do README batem com a realidade" `success` | PASS |
| Negativo: `conferir:numeros` reprova número alterado de propósito num rascunho | N1 (README: "1997 testes do aplicativo" vira 1996): código 1, aponta `README.md:16`; N2 (linha de rascunho "1236 testes da API" acrescentada a `docs/COLOCAR-DE-PE.md`): código 1, aponta `docs/COLOCAR-DE-PE.md:350`; N3 (forma elidida "999 contra a API", a lacuna (d) da regex registrada na etapa): código 1, aponta `README.md:13` | PASS |
| Pulos que a lista estática não enumera declarados na saída | a saída imprime "0 ponto(s) de pulo incondicional com marca T42" e "4 ponto(s) de pulo por ambiente" (1 em `apps/api/test/renovacao-contra-encerramento.test.ts`, 3 em `db/test/busca.test.ts`) | PASS |
| Caso 22: continua recusando repositório, iCloud, Dropbox, Google Drive, OneDrive e Área de Trabalho, e aceita pasta fora disso | P1 (Dropbox sai da lista), P2 (Área de Trabalho deixa de recusar), P3 (subpasta do repositório aceita): cada uma reprova 1 caso de `copiar-producao.test.mjs`; sonda direta da função com caminhos reais do Mac (`$V/sonda-pasta.txt`) | PASS (achado anotado) |
| Caso 37: reprova se o `mode` voltar a ser escrito à mão | I1 (comparação inline no `mode`), I2 (`mode: "production"` fixo), I3 (a constante nasce de outro perfil), I4 (`pushAmbiente` à mão): cada uma reprova 2 casos de `entitlements-do-ios.test.mjs` | PASS |
| Caso 19 (`npm` com `shell` no Windows) | roda verde no macOS e no Linux do CI; a parte Windows não é observável aqui (ver Não verificado) | PASS no que é executável |
| Regressão: `npm test` | rodei as partes separadas: `test:api` 1685 e 34 pulados, código 0; web 699 de 699; shared 223 de 223; motor de campo 238 de 238; o gatekeeper já rodou `test:isolamento` (345 e 3 pulados); CI: passo "Suíte completa" `success` | PASS |

## Evidência

- `npm run test:scripts` código 0 (`$V/r-test-scripts.txt`).
- `npm run conferir:numeros` código 0 (`$V/r-conferir-numeros.txt`).
- `npm run test:api`, `npm run test --workspace @dc360/web`, `@dc360/shared`, `@dc360/campo`: código 0 (`$V/r-test-api.txt`, `$V/r-test-web.txt`, `$V/r-test-shared.txt`, `$V/r-test-pkg-campo.txt`).
- Mutações: `$V/muts-e17.json`, saídas em `$V/mut-e17/<id>.txt`, resumo `$V/mut-e17/RESUMO.txt`.
- `test:scripts` na cópia limpa: `$V/e17-test-scripts-copia.txt` (317 aprovados, 4 pulados, 3 falhas que são do ambiente da cópia: ela não é repositório git e não tem `docs/` fora de `dc360`, então "o repositório real não tem CRLF no índice", "todo INDEX.md real bate" e "o registro da deriva V-DEP-4 existe" não têm o que ler; na árvore os três passam).
- Sonda de pastas: `$V/scripts/sonda-pasta.mjs`, saída `$V/sonda-pasta.txt`.
- CI: run 39420436042, jobs "Testes, tipos e scripts" (118619736871) e "Linha de base (baseline.mjs) em Linux" (118619736620) em `success` (`$V/ci-jobs.json`).

## Cenários positivos

- `test:scripts` e `conferir:numeros` verdes no macOS (árvore) e no Linux (CI).
- `~/dc360-copias` (a pasta fixa de uso real) é aceita pela regra.

## Cenários negativos

- Número errado no README, em rascunho dentro de documento e na forma elidida "N contra a API": reprova (N1, N2, N3).
- Repositório (raiz e subpasta), iCloud, Dropbox, Google Drive, OneDrive e Área de Trabalho: recusados; tirar qualquer um reprova (P1 a P3).
- `mode` ou `pushAmbiente` escritos à mão, ou constante de outro perfil: reprova (I1 a I4).

## Tentativas de reprovar

1. Mexi num número do README que a rodada acabou de reescrever (N1): reprova, então a correção de números do diff da rodada está sob o portão.
2. Escrevi o número errado num rascunho dentro de outro documento (N2): reprova, então a varredura não se limita ao README.
3. Testei a lacuna da forma elidida que a etapa deixou registrada (N3): hoje ela reprova, a lacuna está fechada.
4. Enfraqueci a regra de pastas de três jeitos (P1 a P3) e o caso 22 pegou todos.
5. Procurei caminhos que a regra deixa passar, com caminhos reais desta máquina: ver Achados.
6. Quatro variantes do caso 37 (I1 a I4): todas reprovam.

## Achados

- anotado (anterior à etapa, fora do escopo de "reescrever sem enfraquecer"; não alcançável hoje): `razaoParaRecusarAPasta` (`dc360/scripts/copiar-producao.mjs:111-126`) usa como "repositório" a pasta `dc360` (`RAIZ_DO_REPO`, linha 70), mas a raiz do git é a pasta de cima (`city-hall`). Sonda: `~/Documents/city-hall/copias` e `~/Documents/city-hall/docs/copias` saem ACEITA, e `git check-ignore` não ignora esses caminhos (código 1), então um dump ali entraria num `git add -A`. Também passam `~/desktop/...` e `~/dropbox/...` em minúsculas (o disco do Mac não distingue caixa) e `~/Library/CloudStorage/Box-Box/...` (as variantes de caixa e Box já estavam anotadas pela LGPD na rodada 6; a da raiz do git é nova). Hoje a única chamada usa a pasta fixa `PASTA_DE_COPIAS = ~/dc360-copias` (linhas 76 e 220), sempre aceita, então nada disso é alcançável; vale para quem tornar a pasta configurável. Reprodução: `node $V/scripts/sonda-pasta.mjs`.

Nenhum achado bloqueia.

## Não verificado

- Windows: não há Windows nesta máquina; a portabilidade no Windows tem a evidência do implementador (`saidas/` da etapa, Windows 11, Node 22.17.0), que não reproduzi. Os casos 19 e 22 só mudam de comportamento no Windows.
- Node 22 (o `.nvmrc`): rodei em Node 24.15.0; o CI usa a versão dele. Não espero diferença nestes scripts, mas não provei.
- Os logs e artefatos dos jobs do CI exigem token: li só as conclusões dos passos.

## Risco residual

Baixo. Os números voltam a apodrecer a cada etapa que acrescenta teste, mas agora o CI reprova (passo "Os números do README batem com a realidade"). A regra de pastas é lista por nome e só protege uma pasta fixa.

## Motivo do humano

A etapa pede que o Rafael rode `npm run test:scripts` e `npm run conferir:numeros` na máquina dele (Windows), que é a plataforma que nenhum agente desta rodada tem.
