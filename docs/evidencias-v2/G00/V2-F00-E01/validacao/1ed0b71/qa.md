---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/` (abaixo, `SAIDAS/`). Máquina: Mac arm64, Node v24.15.0 (o `.nvmrc` pede 22), LibreSSL 3.3.6 do sistema, pasta `dc360/apps/campo/ios/` presente. Árvore em `5044e7a`, que só difere de `1ed0b71` em `STATUS.md` e `ESTADO-ATUAL.md` (conferido com `git diff --stat 1ed0b71 5044e7a`).

| Critério da etapa | Resultado | Prova |
| --- | --- | --- |
| `dc360/.nvmrc` com `22`; nota de versões (Node, npm, PGlite, Postgres do CI e de produção) | PASS | `.nvmrc` = `22`; `COLOCAR-DE-PE.md` Parte 8 (linha 801 em diante) traz PGlite 0.2.17, `postgres:16` e `postgres:17` do CI e 17.6 de produção; `verificar.yml` usa `node-version: "22"` em todos os jobs |
| `baseline.mjs` roda os passos em ordem, grava saída, código e duração, redige antes de gravar | PASS | o roteiro inteiro rodado em 5 lotes (`--so=`), 18 passos com `--sem-instalar`; cada lote gravou `NN-passo.txt`, `resultados.json` (código, `duracaoMs`, situação) e `RESUMO.md` em `SAIDAS/bl1` a `SAIDAS/bl5` |
| `node --test scripts/baseline.test.mjs` verde | PASS | 29 de 29, código 0 (`SAIDAS/e01-baseline-test.txt`) |
| `--so-listar` imprime sem executar e sem criar pasta | PASS | lista os 20 passos, código 0; `--saida=SAIDAS/naocriar` não criou a pasta |
| Execução completa devolve os números esperados | PASS com 1 divergência de máquina | 17 de 18 conferem; `test-scripts` diverge só em puladas (obtido 0, esperado 4) porque `apps/campo/ios/` existe aqui (ver Achados) |
| Negativo: redação mascara JWT, `Authorization: Bearer` e URL com senha | PASS | sonda própria `SAIDAS/e01-sonda-redigir.txt` (JWT, Bearer em maiúscula e minúscula, `postgres` e `postgresql` com senha, pasta pessoal, travessão) |
| Negativo: resultado diferente marca "divergente" e sai com código diferente de 0, sem esconder | PASS | a divergência real do Mac: `test-scripts` marcado `divergente` com o detalhe, lote saiu com código 3 (`SAIDAS/bl3.log`, `SAIDAS/bl3/RESUMO.md`); opção inválida e passo inexistente saem 2 sem criar pasta |
| Isolamento: `npm run test:isolamento` inteiro verde | PASS | passo `teste-db`: 345 passam e 3 pulados por ambiente (348), `isolamento.test.ts` com 137 casos (`SAIDAS/bl1/03-teste-db.txt`) |
| E2E: `test:e2e` (Chromium e Firefox) e `test:e2e:api` registrados | PASS | "Passou: 70   Falhou: 0" nos dois motores; "Passou: 288   Falhou: 0" e "Passou: 149   Falhou: 0" (`SAIDAS/bl5/01..03`) |
| Evidência: `AMBIENTE.md`, `COMO-REPRODUZIR.md`, saídas redigidas, `INDEX.md` com SHA-256 | PASS | 55 de 55 linhas do `INDEX.md` batem byte a byte contra `git show 1ed0b71:` e nenhum arquivo rastreado da pasta fica fora do índice (`SAIDAS/index-conferencia.txt`); `conferir-evidencia.mjs V2-F00-E01 --sha 1ed0b71` sem falha (`SAIDAS/conferir-evidencia-E01.txt`) |
| Zero segredo na evidência | PASS | varredura por JWT, Bearer longo, URL com senha, `/Users/<nome>` e U+2014 na pasta da etapa (fora de `validacao/`) e nas minhas 5 pastas de saída: nada |
| Documentação: `README.md` "Como testar" (Node 22, ordem) e `COLOCAR-DE-PE.md` | PASS com ressalva | README traz Node 22, a ordem dos comandos, o que o CI roda e o parágrafo de 2026-10-19 que tira o `teste-api` das divergências do Mac; `COMO-REPRODUZIR.md` não foi atualizado na mesma medida (ver Achados) |
| Validação humana: segunda pessoa e run do workflow Verificar | NÃO VERIFICADO | CI ausente (H32); repetição por segunda pessoa é humana |

## Evidência

- `node scripts/baseline.mjs --sem-instalar --so=typecheck,teste-shared,teste-db,teste-campo-pacote --saida=SAIDAS/bl1`: código 0, 4 de 4 conferem (typecheck 0; shared 223; db 345 mais 3 pulados; pacote de campo 238).
- `... --so=teste-api,teste-console,teste-web --saida=SAIDAS/bl2`: código 0, 3 de 3 (API 1590 passam e 34 pulados de 1624; console 274; painel 688).
- `... --so=teste-campo-app,test-campo,test-scripts,conferir-numeros,auditar --saida=SAIDAS/bl3`: código 3, 4 de 5 (jest do aplicativo 1997; `test:campo` 0; `test:scripts` 288 de 288 e 0 pulados, divergente; `conferir:numeros` 0; `auditar` 0).
- `... --so=audit-raiz,audit-campo,expo-doctor --saida=SAIDAS/bl4`: código 0, 3 de 3 (os dois `npm audit` crus com código 1 e o cabeçalho do relatório; `expo-doctor` 21/21).
- `... --so=e2e,e2e-firefox,e2e-api --saida=SAIDAS/bl5`: código 0, 3 de 3.
- `node --test scripts/baseline.test.mjs`: código 0, 29 de 29 (`SAIDAS/e01-baseline-test.txt`).
- `node SAIDAS/sonda-redigir.mjs`: saída em `SAIDAS/e01-sonda-redigir.txt`.
- Conferência do `INDEX.md`: `SAIDAS/index-conferencia.txt`. Conferidor do repositório: `SAIDAS/conferir-evidencia-E01.txt` (código 0).

## Cenários positivos

- 17 dos 18 passos executáveis sem `npm ci` conferem com o esperado de `PASSOS` no SHA, inclusive os três E2E e o `expo-doctor` 21/21 com rede.
- `--so-listar` mostra `MOTOR=chromium` e `MOTOR=firefox` nos passos 18 e 19, como `COMO-REPRODUZIR.md` descreve (20 passos, 18 sem instalar).
- `npm test` completo, rodado também como comando único, saiu 0 (`SAIDAS/npm-test.txt`), com os mesmos totais que o roteiro.

## Cenários negativos

- Divergência real: no Mac os 4 casos de iOS de `test:scripts` rodam e passam, o roteiro marca `divergente` com "puladas: obtido 0, esperado 4" e sai 3. Não esconde e não chama de "confere".
- Opção desconhecida (`--opcao-errada`) e passo desconhecido (`--so=inexistente`): código 2, sem criar pasta.
- Redação: `eyJ...` vira `[JWT REDIGIDO]`; `Bearer` e `bearer` com token longo viram `[REDIGIDO]`; URL `postgres` e `postgresql` com senha (inclusive senha com `%40`) perdem usuário e senha; `/Users/<nome>` vira `/Users/[usuario]`; travessão vira `[travessao]`.

## Tentativas de reprovar

1. Rodei o roteiro inteiro no SHA, em vez de confiar na saída arquivada: os números batem com `PASSOS` em 17 de 18 passos; a única divergência é de máquina.
2. Procurei se o `teste-api` ainda diverge no Mac, como `COMO-REPRODUZIR.md` afirma: não diverge (1590 passam, 0 falhas). O texto da etapa está atrasado em relação ao README (Achado 1).
3. Tentei furar a redação com senha que contém `@` literal (`usuario:p@ss@host`): sobra `ss` na saída (Achado 3). Com a senha codificada (`%40`), que é a forma válida de URL, redige inteiro.
4. Procurei segredo, pasta pessoal e travessão na evidência arquivada e nas minhas saídas: nada.
5. Conferi o `INDEX.md` byte a byte contra o conteúdo commitado e procurei arquivo rastreado fora do índice: nenhum desvio.

## Achados

1. **Corrige antes de crescer.** `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` (seção "O que esperar") ainda diz que quem reproduz num Mac vê código 3 por DOIS passos, `teste-api` ("o caso ... espera o OpenSSL 3") e `test-scripts`. Desde a correção 5 da E03 (`8c0c255`) o `teste-api` confere no Mac (medido aqui: 0 falhas) e a causa registrada não é a família do `openssl` e sim o `openssl.cnf` padrão. O `dc360/README.md` já tem o parágrafo que corrige isso; o passo a passo da segunda pessoa, não. Reprodução: rodar `--so=teste-api` num Mac e comparar com o parágrafo. Não reprova porque o trecho é datado ("Medido em 2026-10-14") e o README, que a etapa manda atualizar, está certo.
2. **Corrige antes de crescer.** No Mac o roteiro sempre sai 3 por causa de `apps/campo/ios/` (4 pulados esperados, 0 obtidos), embora o código de saída 3 seja descrito como "defeito, deriva externa nova ou contabilidade atrasada". A divergência é conhecida e explicada em prosa no README e no `COMO-REPRODUZIR.md`, mas não usa o mecanismo `divergenciaExplicada` do próprio roteiro nem um esperado por ambiente; quem reproduz num Mac recebe um "reprova" para um resultado correto.
3. **Anotado.** `redigir` deixa vazar o pedaço depois do primeiro `@` quando a senha de uma URL tem `@` sem codificar (`SAIDAS/e01-sonda-redigir.txt`, sexta linha). Senha com `@` literal não é URL válida, e a sonda é sintética; fica para a varredura de segredos da F01-E04.
4. **Anotado.** Números datados no README: a linha `npm run test:api` da coluna macOS diz "o total passou a 1485 casos ... 34 pulados" e a de `test:scripts` diz "260 de 260"; hoje são 1624 (1590 e 34) e 288. O `conferir:numeros` não alcança essa tabela. É o mesmo achado "números datados" da rodada 4.

## Não verificado

- O run do CI do SHA (ausente: o GitHub recusou os jobs por faturamento, H32). A coluna Linux e o "19 de 19" ou "20 de 20" do CI não foram conferidos por mim.
- Os dois passos `npm ci` (máquina de trabalho, `29-operacao-do-ambiente.md`): o roteiro rodado tem 18 dos 20 passos; não é máquina limpa.
- Node 22: rodei em Node 24.15.0; nada divergiu por isso, mas o `.nvmrc` não foi exercitado.
- Windows e Linux.

## Risco residual

O roteiro e o README dizem a verdade sobre a árvore de hoje no Mac, com a exceção do `COMO-REPRODUZIR.md` atrasado em um passo. A prova de máquina limpa e de Linux depende de um run do CI que não existe para este SHA. Os números de `npm audit` e `expo-doctor` dependem do dia e da rede.

## Motivo do humano

A etapa pede que uma segunda pessoa (ou o Rafael noutra máquina) siga `COMO-REPRODUZIR.md` do zero com `npm ci`, e que o Rafael anexe o último run do workflow Verificar. O run não existe para este SHA (H32, faturamento da conta do GitHub) e só o Rafael pode liberá-lo; a repetição em máquina limpa também é humana.
