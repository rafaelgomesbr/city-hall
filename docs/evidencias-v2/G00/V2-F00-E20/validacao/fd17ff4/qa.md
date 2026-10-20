---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E20
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). O diff `1ed0b71..fd17ff4` não toca `regras-de-conteudo.test.ts` nem `trilha-detalhe.test.ts`, mas acrescenta muito texto que o portão varre (README, `COLOCAR-DE-PE.md`, guardas, testes novos, `app.css`, evidências `.md` de outras etapas); a regressão a procurar é travessão novo escapando.

| Critério | Resultado | Prova |
| --- | --- | --- |
| 0 falhas no shared | PASS | 223 de 223, 18 arquivos (`bl1/02-teste-shared.txt`); `regras-de-conteudo.test.ts` 10 de 10 sozinho (`SAIDAS/e20-00-verde.txt`) |
| `trilha-detalhe.test.ts` segue provando que o rótulo não contém o caractere | PASS | o literal é o escape `"\u2014"` (linha 184) e o arquivo não tem o caractere cru; mutação: um rótulo de `ROTULO_CHAVE_DO_DETALHE` com o escape no início reprova o caso (`SAIDAS/e20-08-mutante-rotulo.txt`, código 1), restaurado com `git restore`, verde 15 de 15 (`SAIDAS/e20-09-verde-rotulo.txt`) |
| Negativo: `.md` sintético em `docs/` reprova | PASS | `docs/zz-qa-sonda.md`: código 1, nomeado com arquivo e linha (`SAIDAS/e20-01-md-em-docs.txt`) |
| Negativo: `.md` em `docs/evidencias-v2/G00/` reprova | PASS | código 1 (`SAIDAS/e20-02-md-em-evidencias.txt`) |
| Positivo da isenção: `.txt` bruto em `docs/evidencias-v2` passa | PASS | código 0 (`SAIDAS/e20-03-txt-em-evidencias.txt`) |
| Negativo: `.ts` do produto reprova | PASS | `dc360/apps/web/src/zz-qa-sonda.ts`: código 1 (`SAIDAS/e20-04-ts-do-produto.txt`) |
| Âncoras do recorte | PASS | o caso "as isenções da E20 valem só no recorte" verde; e, na árvore real, pasta vizinha `docs/evidencias-v2-outra/x.txt` reprova (05), `.md` em `docs/auditoria-v2/raw/` reprova (06), arquivo de nome parecido com a auditoria isenta reprova (07) |
| Regressão: `npm test` e `npm run test --workspace @dc360/web` | PASS | todas as suítes do `npm test` com 0 falhas (`bl1`, `bl2`); painel 699 de 699 |

## Evidência

- Cada plantio: arquivo criado, `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`, arquivo apagado. Códigos 1, 1, 0, 1, 1, 1, 1 (saídas 01 a 07). As saídas contêm o caractere de propósito (fora do repositório).
- `git status --porcelain --untracked-files=all` vazio depois de todos.
- CI run 39420436042: o job "Testes, tipos e scripts" (que roda `npm test`) terminou `success`.

## Cenários positivos

- O portão fecha verde com todo o texto novo do diff; a saída bruta arquivada como `.txt` em `docs/evidencias-v2` segue isenta.

## Cenários negativos

- `.md` em `docs/`, `.md` em `docs/evidencias-v2/G00/`, `.ts` do produto, pasta com nome vizinho, `.md` dentro da saída bruta da auditoria e nome parecido com o arquivo isento: todos reprovam.

## Tentativas de reprovar

1. Procurei travessão novo entre os arquivos do diff: o portão varreu a árvore e não achou; e os seus plantios provam que ele vê `.md` e `.ts` nos lugares onde o diff escreveu.
2. Tentei alargar a isenção por nome: `docs/evidencias-v2-outra/` e `docs/AUDITORIA-2026-09-30.md.bak.md` não herdam a isenção.
3. Tentei esconder em `.md` dentro de `docs/auditoria-v2/raw/`: reprova (só o que não é `.md` é isento ali).
4. Mutei o produto para ver se o caso do rótulo, com o escape, ainda morde: morde.

## Achados

1. **Anotado.** A isenção `pasta-fora-de-md` vale para qualquer extensão varrida que não seja `.md` em `docs/evidencias-v2` (por exemplo um `.html` ou `.json` escrito à mão). É o recorte que a etapa pediu ("apenas para arquivos que não são `.md`"); fica registrado.
2. Nenhum achado que bloqueie.

## Não verificado

- Windows (o separador do caminho na isenção); rodei só no Mac. O CI Linux passou.
- Logs dos jobs do CI (exigem token).

## Risco residual

Texto escrito à mão em formato diferente de `.md` dentro de `docs/evidencias-v2` não é varrido.

## Motivo do humano

Não se aplica: a aprovação da lista de isenções pelo Rafael é anterior e a lista não mudou neste diff.
