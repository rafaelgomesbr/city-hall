---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E02
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). O diff `1ed0b71..fd17ff4` não toca `portao-de-skip.mjs`, o teste dele nem a política; acrescenta arquivos de teste novos nas pastas varridas (`guarda-de-codigos-de-erro.test.ts` da API e do console, `codigos-de-erro.test.ts`, `correcao-5-da-e09.test.ts`, `layout-estreito.e2e.mjs`), que o portão passa a varrer.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Política publicada | PASS | `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` e `docs/DECISOES-DE-TESTE-DA-FASE-00.md` existem no SHA |
| Portão verde na árvore atual | PASS | `test:scripts` 324 de 324 (`bl3/03-test-scripts.txt`): "683 arquivos varridos; 11 skips por ambiente em 4 arquivos; 0 incondicionais com marca T42" |
| Contagem por ambiente lista `busca.test.ts` (3), `entitlements-do-ios` e `som-de-despacho` | PASS | mesma saída: 3, 4 e 3, mais 1 em `renovacao-contra-encerramento.test.ts` |
| Negativo: `it.skip` sem marca reprova | PASS | plantio real em `apps/api/test/zz-qa-plantio.test.ts`: código 1, arquivo e linha 2 nomeados (`SAIDAS/e02-01-plantio-skip-sem-marca.txt`) |
| Negativo: `it.only` reprova | PASS | plantio real: código 1 (`SAIDAS/e02-02-plantio-only.txt`) |
| Negativo: marca sem `dono` e com `ate` no passado reprovam; marca no prazo passa | PASS | `analisarTexto` com hoje = 2026-10-20 (`SAIDAS/sonda-e02.txt`) |
| `describe.skip` da vigência saiu na E04 | PASS | caso "a vigência da escrita voltou a rodar" verde; `vigencia-na-escrita.test.ts` roda 13 de 13 |
| Regressão: `npm run test:scripts`, `npm test`, `test:isolamento` | PASS | `bl3` (324 de 324), `bl1` e `bl2` (todas as suítes vitest com 0 falhas), db 345 mais 3 pulados |

## Evidência

- Lotes do roteiro: `SAIDAS/bl1` a `SAIDAS/bl5` (ver relatório da E01).
- `node SAIDAS/sonda-e02.mjs`: código 0 (`SAIDAS/sonda-e02.txt`), 16 formas.
- Plantios: `node --test scripts/portao-de-skip.test.mjs` com o arquivo plantado (códigos 1, 1 e 0) e sem ele (`SAIDAS/e02-04-verde-depois.txt`, junto com `baseline.test.mjs`: 46 de 46, código 0). O arquivo plantado foi apagado; `git status --porcelain --untracked-files=all` vazio depois.

## Cenários positivos

- Árvore atual verde, com os arquivos de teste novos do diff varridos sem acusação.
- Marca válida dentro do prazo passa e aparece como "marcado"; `skip:` condicional com motivo textual conta como ambiente.

## Cenários negativos

- `it.skip`, `test.skip.each`, `describe.concurrent.skip`, `it.todo` e `xit` sem marca reprovam; `test("x", { skip: true })` reprova; `it.only` e `test.only.each` reprovam; marca sem dono e vencida reprovam.

## Tentativas de reprovar

1. Plantei skip sem marca e `.only` na árvore real (não só no texto sintético): o portão pegou os dois.
2. Procurei skip escondido nos arquivos de teste novos do diff: `layout-estreito.e2e.mjs:270` tem um pulo por ambiente do próprio roteiro (sonda do Tab no WebKit, com motivo impresso "PULADA ..."), anterior a esta rodada (existe em `1ed0b71`); o portão não o conta (Achado 2).
3. Formas novas contra o varredor por linha: `await it.skip(...)`, `if (cond) it.skip(...)` e `const pular = it.skip` passam sem aviso e sem contagem. Plantei `if (pular) it.skip(...)` na árvore real e o portão saiu 0 (`SAIDAS/e02-03-plantio-skip-depois-de-if.txt`) (Achado 1).
4. Procurei essas formas na árvore de hoje (grep por `it|test|describe|suite` seguido de `.skip`, `.only` ou `.todo` fora do começo da linha): só comentários e literais de teste. Nenhum escape real hoje.
5. `describe.skipIf(true)` conta como ambiente sem marca (achado 2 da rodada 6, ainda igual).

## Achados

1. **Corrige antes de crescer.** O portão só reconhece a chamada no começo da linha. `if (cond) it.skip(...)`, a forma idiomática de pular por condição, não reprova nem entra na contagem por ambiente, e a política só permite pulo por ambiente na forma `runIf`/`skipIf` ou `skip:` com motivo. Reprodução: arquivo em `apps/api/test` com `if (pular) it.skip("x", () => {});` e `node --test scripts/portao-de-skip.test.mjs` sai 0. Mesma classe do achado 3 da rodada 6 (leitura por linha declarada no RESUMO), com uma forma mais comum.
2. **Anotado.** Pulo por ambiente feito pelo próprio roteiro de e2e (`layout-estreito.e2e.mjs:261-271`) não entra na contagem do portão. É condicional, com motivo escrito, e a saída do roteiro o imprime.
3. **Corrige antes de crescer (repetido das rodadas 4 e 6).** O caso "nenhum skip incondicional resta" reprova até o skip marcado no prazo que a política permite; e `skipIf(true)`/`runIf(false)` passam como ambiente.

## Não verificado

- A ligação do portão ao CI (F01-E03): o job "Testes, tipos e scripts" do run 39420436042 terminou `success` e roda `test:scripts`, mas não li o log (exige token).
- Windows e Linux localmente.

## Risco residual

Um skip incondicional escrito numa forma que não começa a linha passa calado. Nenhum existe hoje.

## Motivo do humano

Não se aplica: a validação humana da etapa (Rafael escolher prazo e dono padrão) já está registrada (prazo de 5 dias, dono `rafael`) e não depende deste SHA.
