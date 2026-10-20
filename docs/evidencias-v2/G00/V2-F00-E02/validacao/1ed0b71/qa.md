---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E02
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/` (abaixo, `SAIDAS/`). Mac arm64, Node v24.15.0. Árvore em `5044e7a` (produto igual a `1ed0b71`). Os arquivos da etapa (`portao-de-skip.mjs`, `portao-de-skip.test.mjs`, `POLITICA-DE-TESTE-VERMELHO.md`) não mudaram desde `bb0f654`; mudou só uma linha de `vigencia-na-escrita.test.ts`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Política publicada (`dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`): três saídas, por ambiente contra incondicional, marca, prazo, dono, quem decide | PASS | lida inteira; prazo máximo de 5 dias e dono `rafael` batem com `PRAZO_MAXIMO_EM_DIAS = 5` e `DONO_PADRAO = "rafael"` exportados pelo varredor |
| Portão verde na árvore atual | PASS | `node --test scripts/portao-de-skip.test.mjs`: 17 de 17, código 0; "681 arquivos varridos; 11 skips por ambiente em 4 arquivos; 0 incondicionais com marca T42" (`SAIDAS/e02-portao.txt`) |
| Contagem por ambiente lista `busca.test.ts`, `entitlements-do-ios.test.mjs` e `som-de-despacho.test.mjs` | PASS | `busca.test.ts` 3, `entitlements-do-ios.test.mjs` 4, `som-de-despacho.test.mjs` 3, e mais `renovacao-contra-encerramento.test.ts` 1 (o `describe.skipIf` do Postgres real, posterior à etapa) |
| Negativo: `it.skip` sem marca reprova | PASS | plantado num arquivo novo da árvore real: o portão sai 1 com arquivo, linha e motivo (`SAIDAS/e02-plantio-skip.txt`); e na sonda direta |
| Negativo: marca sem `dono` reprova; `ate` no passado reprova; `it.only` reprova | PASS | sonda `SAIDAS/e02-sonda-skip.txt`; `it.only` plantado na árvore real sai 1 (`SAIDAS/e02-plantio-only.txt`) |
| Positivo: `describe.skip` com marca dentro do prazo passa | PASS na leitura, ver Achado 1 na árvore | `analisarTexto` aceita e conta como marcado; na árvore real o caso de regressão da E04 reprova qualquer incondicional |
| Marca da vigência para a E04 | PASS (superada) | o `describe.skip` saiu na E04; o portão afirma isso no caso "a vigência da escrita voltou a rodar" |
| `docs/DECISOES-DE-TESTE-DA-FASE-00.md` criado | PASS | existe e é usado pelas etapas seguintes |
| Regressão obrigatória: `npm run test:scripts` e `npm test` | PASS | `test:scripts` 288 de 288, código 0 (`SAIDAS/bl3/03-test-scripts.txt`); `npm test` código 0, todos os pacotes verdes (`SAIDAS/npm-test.txt`) |
| Isolamento: `test:isolamento` só para provar que nada mudou | PASS | 345 passam e 3 pulados (`SAIDAS/bl1/03-teste-db.txt`) |
| Documentação: README "Como testar" | PASS | parágrafo "Teste pulado tem regra (política T42)" no README, coerente com a política |
| Evidência e `INDEX.md` | PASS | 21 de 21 linhas batem byte a byte; nenhum arquivo rastreado fora do índice; `conferir-evidencia.mjs` sem falha (`SAIDAS/index-conferencia.txt`, `SAIDAS/conferir-evidencia-E02.txt`) |

## Evidência

- `node --test scripts/portao-de-skip.test.mjs` (em `dc360`): código 0, 17 de 17 (`SAIDAS/e02-portao.txt`).
- Plantio de `apps/api/test/zz-plantio-qa.test.ts` (arquivo novo, não rastreado) com `it.skip` sem marca: código 1 (`SAIDAS/e02-plantio-skip.txt`); com marca válida: código 1 pelo caso da E04 (`SAIDAS/e02-plantio-skip-marcado.txt`); com `it.only`: código 1 (`SAIDAS/e02-plantio-only.txt`). Arquivo apagado; portão de novo 17 de 17, código 0 (`SAIDAS/e02-depois.txt`); `git status` limpo.
- `node SAIDAS/sonda-skip.mjs`: 23 formas contra `analisarTexto` (`SAIDAS/e02-sonda-skip.txt`).
- `npm test`: código 0 (`SAIDAS/npm-test.txt`). `npm run test:scripts` pelo roteiro: código 0 (`SAIDAS/bl3/03-test-scripts.txt`).

## Cenários positivos

- Árvore real verde, contagem por ambiente impressa por arquivo.
- `describe.skip` com marca `dono=rafael issue=V2-F00-E04 ate=2026-10-23` (3 dias) é aceito pela leitura e contado como marcado.
- Formas por ambiente aceitas: `it.runIf(...)`, `it.skipIf(...)`, `describe.skipIf(...)`.

## Cenários negativos

Reprovam (sonda e plantio): `it.skip` sem marca; marca sem `dono`; marca vencida; marca com prazo de 30 dias (acima do teto de 5); `it.only`, `describe.only`, `fit`, `fdescribe`; `test.skip.each`; `it.concurrent.skip`; `xtest`; `test.todo`; `{ skip: true }`; `t.skip()` e `t.todo()` em linha própria dentro do corpo do teste.

## Tentativas de reprovar

1. Plantei skip sem marca e `.only` na árvore real, fora dos casos sintéticos do próprio teste: o portão pegou os dois.
2. Procurei formas que a política lista como incondicionais e que o varredor não veja. `t.skip()` na mesma linha do `test(` não é visto, mas em linha própria (a forma normal) é; a política não promete mais do que isso.
3. Procurei formas fora da lista: `it["skip"](...)`, `it .only(...)` (com espaço), `it` e `.skip(` em linhas separadas, o `ctx.skip()` do Vitest e o `skip()` desestruturado do contexto passam sem aviso (Achado 3). Nenhuma delas existe hoje na árvore (busca nas pastas varridas).
4. Reconferi os dois achados da rodada 4: continuam iguais (Achados 1 e 2).

## Achados

1. **Corrige antes de crescer (repetido da rodada 4).** O caso "a vigência da escrita voltou a rodar: o skip da E04 saiu e nenhum skip incondicional resta" reprova QUALQUER skip incondicional na árvore, inclusive o marcado dentro do prazo que a política permite. Reprodução: plantar `// T42 dono=rafael issue=V2-F00-E04 ate=2026-10-23` acima de um `it.skip` num arquivo de `apps/api/test`; o portão sai 1 (`SAIDAS/e02-plantio-skip-marcado.txt`). O portão é mais estrito que a política, o que falha para o lado seguro, mas a política e o portão dizem coisas diferentes.
2. **Corrige antes de crescer (repetido da rodada 4).** `it.skipIf(true)` e `it.runIf(false)` contam como pulo por ambiente e passam sem marca: a política diz que a condição precisa ser de ambiente, e o varredor não confere isso.
3. **Anotado.** Formas que escapam do varredor por linha e que a política não lista: `ctx.skip()` e `skip()` do contexto do Vitest, acesso por colchete (`it["skip"]`), espaço antes do ponto e cadeia quebrada em duas linhas. A limitação de leitura por linha está declarada no RESUMO da etapa.

## Não verificado

- A ligação do portão ao CI (é da F01-E03; o CI deste SHA também está ausente, H32).
- Windows e Linux (rodei só no Mac).

## Risco residual

Um skip escrito numa forma fora da lista (Achado 3) ou com condição sempre verdadeira (Achado 2) passaria calado. Hoje nenhuma dessas formas existe na árvore, e o `conferir:numeros` também lista os pulos que o `vitest list` não enumera, o que dá um segundo olho.

## Motivo do humano

não se aplica
