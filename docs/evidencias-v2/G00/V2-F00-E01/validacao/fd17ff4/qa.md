---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Saídas fora do repositório em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (abaixo, `SAIDAS/`). Mac arm64, Node v24.15.0 (o `.nvmrc` pede 22), pasta `dc360/apps/campo/ios/` presente. HEAD `55209ab`, que só difere de `fd17ff4` em `STATUS.md` e `ESTADO-ATUAL.md`. `npm run build:shared` rodado antes (código 0).

| Critério | Resultado | Prova |
| --- | --- | --- |
| `.nvmrc` com `22` e nota de versões | PASS | `dc360/.nvmrc` = `22`; matriz em `dc360/docs/COLOCAR-DE-PE.md`; CI com Node 22 |
| `baseline.mjs` roda os passos em ordem, grava saída, código e duração, redige antes de gravar | PASS | 18 passos (`--sem-instalar`) em 5 lotes, `SAIDAS/bl1` a `SAIDAS/bl5` (`RESUMO.md`, `resultados.json`, `NN-passo.txt`) |
| `node --test scripts/baseline.test.mjs` verde | PASS | junto com o portão: 46 de 46, código 0 (`SAIDAS/e02-04-verde-depois.txt`); e dentro de `test:scripts` (324 de 324) |
| `--so-listar` imprime sem executar | PASS | 20 passos listados, código 0 |
| Execução completa devolve os números esperados no SHA | PASS com a divergência de máquina já conhecida | 17 de 18 conferem; `test-scripts` diverge só em puladas (obtido 0, esperado 4) porque `apps/campo/ios/` existe aqui |
| Regressão do diff `1ed0b71..fd17ff4` no roteiro (esperados novos: console 286, API 1719 com 34 pulados, painel 699, `e2e-api` "Passou: 197") | PASS | os quatro passos conferem com os novos esperados: `bl2/RESUMO.md` e `bl5/RESUMO.md`; `conferir:numeros` 0 com 25 afirmações e "o roteiro espera o mesmo total de casos que a árvore tem" (`bl3/04-conferir-numeros.txt`) |
| Negativo: redação de JWT, `Bearer`, URL com senha | PASS | `SAIDAS/sonda-e01.txt`: JWT, `Bearer` e `bearer`, `Basic`, `postgres` e `postgresql` com senha (inclusive `%40`), pasta pessoal |
| Negativo: diferente do esperado vira "divergente" e código diferente de 0 | PASS | real: lote 3 saiu 3 (`SAIDAS/bl3.log`); sintético: `avaliar` com "Passou: 196 Falhou: 1" no `e2e-api` e 1718 casos na API marca "divergente" (`SAIDAS/sonda-e01.txt`) |
| Isolamento: `npm run test:isolamento` verde | PASS | passo `teste-db`: 345 passam, 3 pulados (348), código 0 (`bl1/03-teste-db.txt`) |
| E2E: `test:e2e` Chromium e Firefox, `test:e2e:api` | PASS | "Passou: 70 Falhou: 0" nos dois motores; "Passou: 288" e "Passou: 197", "Falhou: 0" (`bl5/`) |
| Evidência e `INDEX.md` | PASS | `conferir-evidencia.mjs V2-F00-E01 --sha fd17ff4`: sem falha (`SAIDAS/conferir-evidencia-E01.txt`); a pasta da etapa não mudou em `1ed0b71..fd17ff4` além de `VEREDITO.md` e `RISCO-ACEITO.md` |
| README "Como testar" e lista do que o CI roda | PASS | README atualizado no diff: 3476 em `npm test` (223+345+238+1685+286+699, somado à mão), 1685 da API; a tabela do CI agora lista o `e2e-api` em Firefox e WebKit, o que bate com `.github/workflows/verificar.yml` |
| Run do workflow Verificar | PASS (E1 do CI) | run 39420436042 sobre `55209ab`: 9 de 9 jobs `success`, inclusive "Linha de base (baseline.mjs) em Linux" (`SAIDAS/ci-39420436042.txt`) |
| Segunda pessoa repete do zero | NÃO VERIFICADO | humano |

## Evidência

- `SAIDAS/rodar-baseline.sh`: `node scripts/baseline.mjs --sem-instalar --so=<lote> --saida=SAIDAS/blN`. Códigos: lote 1 0 (typecheck, shared 223, db 345 mais 3 pulados, pacote de campo 238); lote 2 0 (API 1685 mais 34 pulados de 1719, console 286, painel 699); lote 3 3 (jest do aplicativo, `test:campo`, `test:scripts` 324 de 324 com 0 pulados, divergente; `conferir:numeros` 0; `auditar` 0); lote 4 0 (`npm audit` raiz e campo com 1 cru, `expo-doctor` confere); lote 5 0 (e2e). Registro em `SAIDAS/baseline-codigos.txt`.
- `node SAIDAS/sonda-e01.mjs`: código 0, saída em `SAIDAS/sonda-e01.txt`.
- CI: `curl` da API pública dos jobs do run 39420436042 (`SAIDAS/ci-39420436042.txt`).

## Cenários positivos

- 17 de 18 passos executáveis sem `npm ci` conferem com `PASSOS` no SHA, incluindo os dois E2E de navegador e o `e2e-api` com o novo esperado de 197.
- O job de linha de base em Linux do CI (máquina limpa, com `npm ci`) terminou `success` no run do descendente.

## Cenários negativos

- Divergência real do Mac (`test-scripts`, puladas 0 contra 4): marcada "divergente", com o detalhe, saída 3. Não esconde.
- Avaliação sintética de contagem menor no `e2e-api` (196) e na API (1718): "divergente" com o número obtido e o esperado.
- Redação: todas as formas pedidas pela etapa mascaradas.

## Tentativas de reprovar

1. Rodei o roteiro inteiro no SHA em vez de ler a saída arquivada, de propósito porque o diff mexeu nos esperados (`baseline.mjs`: console 274 para 286, API mais 95, painel mais 11, `e2e-api` 149 para 197): todos conferem com a árvore e com a execução.
2. Procurei esperado ajustado para esconder vermelho: o `e2e-api` exige "Falhou: 0" na mesma frase, e a API exige `falhas: 0`; a sonda com uma falha diverge.
3. Rodei o `e2e-api` também em Firefox e em WebKit (`--so-layout`), que o CI passou a rodar no diff: 288 e 197 no Firefox, 196 no WebKit, sem falha (`SAIDAS/e2e-api-firefox.txt`, `SAIDAS/e2e-api-webkit.txt`).
4. Tentei furar a redação com um token de renovação opaco num cabeçalho `cookie`: não é redigido (Achado 3). A etapa só pede JWT, `Bearer` e URL com credencial.
5. Procurei JWT nas minhas saídas: nenhum.

## Achados

1. **Corrige antes de crescer (repetido da rodada 6).** No Mac o roteiro sempre sai 3 por causa de `apps/campo/ios/` (4 pulados esperados, 0 obtidos); a divergência é explicada em prosa, mas não usa `divergenciaExplicada` nem um esperado por ambiente. Reprodução: `--so=test-scripts` num Mac com a pasta `ios/`.
2. **Corrige antes de crescer (repetido da rodada 6).** `COMO-REPRODUZIR.md` segue com medições datadas de 2026-10-14 que falam de divergência do `teste-api` no Mac; hoje ela não existe. O README está certo.
3. **Anotado.** `redigir` não mascara um token opaco de renovação em `cookie:` (`SAIDAS/sonda-e01.txt`, última linha de redação). Fora do que a etapa pede; fica para a varredura de segredos da F01-E04.

## Não verificado

- Os dois `npm ci` (máquina de trabalho, não limpa); cobertos só pelo job Linux do CI, cujo log exige token e não li.
- Node 22 localmente (rodei em 24.15.0); Windows.
- A repetição por segunda pessoa.

## Risco residual

`npm audit` e `expo-doctor` dependem do dia e do registro. O código 3 constante no Mac pode acostumar quem reproduz a ignorar "divergente".

## Motivo do humano

A etapa pede que uma segunda pessoa (ou o Rafael noutra máquina) siga `COMO-REPRODUZIR.md` do zero com `npm ci`; agente não substitui. O run do Verificar agora existe (39420436042, 9 de 9 verdes) e pode ser anexado pelo Rafael.
