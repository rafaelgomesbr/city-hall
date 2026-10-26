---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E20
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
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

Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/`). Neste relatório o caractere proibido é chamado de travessão (U+2014) e nunca escrito.

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| Positivo: shared com 0 falhas (149 na época; hoje 168) | PASS | `npm run test --workspace @dc360/shared`: 16 arquivos, 168 de 168 (`L/92-test-shared.txt`); 3 rodadas seguidas de `npx vitest run --root packages/shared`: 168 de 168 (`L/e03-01-estado-real-das-linhas.txt`); CI: `regras-de-conteudo.test.ts` 8 de 8 |
| Positivo: `trilha-detalhe.test.ts` segue provando que o rótulo não contém o caractere | PASS e morde | 15 de 15; mutação no produto (rótulo "Canal de entrada" com o caractere escrito por escape em `apps/web/src/paginas/trilha-detalhe.ts`): "o dicionário não tem rótulo com travessão" vermelho, 14 de 15; `git restore`, 15 de 15 (`L/e20-02-trilha-detalhe-morde.txt`) |
| Negativo: `.md` sintético em `docs/` com o caractere reprova | PASS | P1, `docs/zz-sonda-qa.md`: reprovou nomeando arquivo e linha (`L/e20-01-sondas-portao-conteudo.txt`) |
| Negativo: `.md` em `docs/evidencias-v2/G00/` reprova | PASS | P2 reprovou |
| Negativo: `.txt` bruto em `docs/evidencias-v2` passa | PASS | P3: 1 aprovado |
| Negativo: `.ts` do produto reprova | PASS | P4, `dc360/apps/api/src/zz-sonda-qa.ts`: reprovou |
| Isenções mínimas e justificadas; folga do prefixo fechada (D4) | PASS | cada entrada de `CAMINHOS_IGNORADOS` tem comentário de motivo; P5 (`docs/referencia-outra-zz/zz-sonda-qa.md`) reprova, a folga não volta |
| Âncoras provam o recorte | PASS e mordem | M1 (`docs/evidencias-v2` isenta inteira): 2 de 8 vermelhos; M2 (comparação sem o separador): 1 de 8 vermelho; `git restore`, 8 de 8 (`L/e20-03-mutacoes-isencao.txt`) |
| Regressão: `npm run test --workspace @dc360/web` | PASS | 44 arquivos, 665 de 665 (`L/91-test-web.txt`) |
| Evidência íntegra | FALHA da conferência mecânica | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E20 --sha 52952a1`: "1 FALHA(S), 5 aviso(s)": `VEREDITO.md` tem SHA-256 diferente do INDEX (achado 1) |

Defeitos das rodadas anteriores: as duas rodadas deram PASS. Os anotados da rodada 2 (meia-risca e a entidade HTML do travessão não são pegas) AINDA MORDEM: P9 (`&mdash;` num `.md` de `docs/`) e P10 (`&mdash;` num `.html` do protótipo) passam.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| 11 sondas: arquivo escrito, `npx vitest run test/regras-de-conteudo.test.ts -t "nenhum travess"`, arquivo apagado | ver tabela | `L/e20-01-sondas-portao-conteudo.txt` |
| mutação em `trilha-detalhe.ts` com `git restore` | 1, depois 0 | `L/e20-02-trilha-detalhe-morde.txt` |
| mutações M1 e M2 em `regras-de-conteudo.test.ts` com `git restore` | 1, 1, depois 0 | `L/e20-03-mutacoes-isencao.txt` |
| `npm run test --workspace @dc360/shared` e `@dc360/web` | 0 e 0 | `L/92-test-shared.txt`, `L/91-test-web.txt` |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E20 --sha 52952a1` | 1 | `L/00-conferir-evidencia.txt` |

## Cenários positivos

- Árvore real: 8 de 8 no portão, shared 168 de 168, web 665 de 665.
- `.txt` bruto em evidência passa, como a etapa manda.

## Cenários negativos

- `.md` em `docs/`, `.md` em evidência, `.ts` do produto, `.md` em pasta com prefixo parecido com uma isenta: reprovam.

## Tentativas de reprovar

- P6: extensão em maiúscula (`docs/zz-sonda-qa.MD`): PASSA. A lista de extensões compara com `endsWith` sensível a caixa; o arquivo nem é varrido.
- P7: `.html` escrito à mão dentro de `docs/evidencias-v2/G00/`: PASSA (cai na isenção "fora de `.md`", aprovada na D4 para saída bruta; hoje não há `.html` em `docs/evidencias-v2`).
- P8b: componente `.tsx` do produto com o caractere escrito como escape JavaScript (barra, `u2014`): PASSA no portão, e o JavaScript produz o caractere de verdade na tela (`node -e` confirma). É a mesma técnica que a etapa usou, com motivo, no teste de `trilha-detalhe`. A primeira tentativa (P8) gravou o caractere cru por causa do shell e reprovou; refeita como P8b com o escape literal.
- P9 e P10: entidade HTML do travessão: passam (anotado desde a rodada 2).
- Procurei usos reais desses buracos no repositório: nenhum `.MD`, nenhum escape ou entidade em código de produto (`git grep`; só citações em documentação e no próprio teste).
- Sondas apagadas e mutações restauradas; `git status --porcelain` final só com as pastas `validacao/52952a1/`.

## Achados

1. bloqueia a conferência mecânica, não o critério funcional (dono: gatekeeper e política de evidência). O `INDEX.md` da E20 lista `VEREDITO.md`; o hash dele bate com o `VEREDITO.md` de `4b96ea7` e deixou de bater quando o registro da rodada 2 (`7d9ed8d`) acrescentou a rodada ao arquivo. O implementador não tem culpa: o defeito é o INDEX cobrir um arquivo que o gatekeeper reescreve a cada rodada (o mesmo acontece na E05 e na E15). Reprodução: `git show 4b96ea7:docs/evidencias-v2/G00/V2-F00-E20/VEREDITO.md | shasum -a 256` dá `f060b9fd...`, igual ao INDEX; o arquivo atual dá `5295eeac...`. Remédio: tirar `VEREDITO.md` (e `validacao/`) do INDEX das etapas, ou recalcular o INDEX no registro do veredito.
2. corrige antes de crescer (dono: portão de conteúdo, `packages/shared`). O caractere escrito por escape JavaScript em código do produto passa no portão e aparece na tela. Anterior à E20, mas a E20 tornou o escape a forma sancionada. Remédio: varrer também a sequência de escape nos `.ts`, `.tsx`, `.js` e `.mjs` fora de `packages/shared/test`, com isenção pontual para o teste de `trilha-detalhe`.
3. anotado. Extensão em maiúscula não é varrida (P6); entidade HTML e meia-risca não são pegas (P9, P10, herdado).

## Não verificado

- Windows: o portão quebra linha só por `\n`; não rodei em Windows (o CI Linux e o Mac passam).
- `npm test` completo como regressão: rodei shared e web; o resto vale pela linha de base do gatekeeper e pelo CI 9 de 9.

## Risco residual

- O portão continua literal: uma forma diferente de escrever o caractere passa. Hoje não há uso real.

## Motivo do humano

Não se aplica (as isenções foram aprovadas na D4).
