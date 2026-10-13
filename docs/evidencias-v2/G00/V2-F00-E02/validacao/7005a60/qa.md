---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E02
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Política publicada: `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` existe, com as três saídas, skip por ambiente x incondicional, marca, prazo e dono; o README (linha 1170 em diante) a referencia.
- Portão verde na árvore atual: `npm run test:scripts` local, saída 0, 213 testes, 209 ok, 0 falha, 4 pulados; `node --test scripts/portao-de-skip.test.mjs` 17 de 17. Saída do portão: "636 arquivos varridos; 10 skips por ambiente em 3 arquivos (busca.test.ts 3, entitlements-do-ios 4, som-de-despacho 3); 0 incondicionais com marca". Idêntico no CI Linux (job "Testes, tipos e scripts", linhas 2128 a 2131 do log).
- Skip sem marca reprova: ver planta abaixo.
- Nenhum skip incondicional resta (a marca da vigência saiu com o conserto da E04).

## Evidência

Scratchpad da sessão: `test-scripts.txt`, `planted.txt`, `probe.mjs` (30 casos), `ci-testes.log`.

## Cenários positivos

`it.skip` com marca válida passa e é listado; `runIf`, `skipIf` e `skip: cond && "motivo"` passam e são contados.

## Cenários negativos

Planta real: criei `dc360/scripts/zz-plantado-qa.test.mjs` (`it.skip` sem marca) e `zz-plantado-qa2.test.mjs` (`it.only`) e rodei `npm run test:scripts`: saída 1, "not ok 102 - a árvore atual passa no portão" citando os dois arquivos. Apaguei os dois; `git status --porcelain` só mostrou pastas `validacao/`.
Sonda direta em `analisarTexto` (hoje fixo em 2026-10-13): marca sem `dono` reprova; marca vencida reprova; prazo de 353 dias reprova; linha em branco entre marca e skip reprova; `it.only` reprova com e sem marca; `it.todo`, `it.concurrent.skip`, `it.skip.each`, `t.skip()` e skip indentado dentro de `describe` reprovam.

## Tentativas de reprovar

Passam sem alarme (ou só contados): `skip:` em linha separada do `test(` (limite declarado); `const pula = it.skip` (limite declarado); `it.each([...]).skip(...)`; `test.fixme(...)`; `it . skip(`; `const x = 1; it.skip(...)`; `it.skipIf(true)`, `describe.skipIf(true)` e `it.runIf(false)` com literal (pulam sempre, entram como "ambiente" sem marca nem teto); `return;` antes dos `expect`.
Nenhuma é acidente comum, mas a contagem por ambiente só é impressa: nada reprova se ela crescer.

## Achados

1. **corrige antes de crescer.** A contagem de skips por ambiente é informativa, sem teto nem comparação com valor anterior, e `it.skipIf(true)` (ou `runIf(false)`) é skip incondicional aceito como "ambiente". Reprodução: `analisarTexto('it.skipIf(true)("a", () => {});', "2026-10-13")` devolve ambiente, sem problema. Sugestão: fixar a contagem esperada (10) num teste ou reprovar condição literal.
2. **anotado.** `it.each(...).skip`, `test.fixme` e `it . skip(` passam calados.
3. **anotado.** A última seção de `POLITICA-DE-TESTE-VERMELHO.md` afirma que o portão "roda hoje só na máquina de quem rodar" e que o CI não o enxerga até F01-E03. Falso no SHA validado: `.github/workflows/verificar.yml` tem o passo "Testes dos scripts" (`npm run test:scripts`) e o log do CI traz a contagem do portão.
4. **anotado.** Prazo máximo de 30 dias e dono padrão `rafael` seguem como premissa; a etapa pede a escolha de Rafael.

## Não verificado

- Critério do G00 "zero vermelho conhecido fora do registro": o registro é da E03 (ver relatório da E03, onde isso reprova).
- Conteúdo de `docs/DECISOES-DE-TESTE-DA-FASE-00.md` item a item (matéria da E03 e das etapas de reescrita).
- Linux fora do CI.

## Risco residual

Skip por ambiente pode virar skip permanente no CI sem ninguém notar (sem teto de contagem).

## Motivo do humano

Rafael ainda não escolheu o prazo máximo e o dono padrão (validação humana da etapa; premissa no STATUS, seção 9). Não muda o veredito técnico.
