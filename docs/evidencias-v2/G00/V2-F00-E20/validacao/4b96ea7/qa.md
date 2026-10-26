---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E20
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

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Shared com 0 falhas | PASS | 3 rodadas completas em sequência: 168 de 168, código 0 (`50-shared-full-1..3.txt`); `regras-de-conteudo.test.ts` sozinho 8 de 8 (`40-base-regras.txt`) |
| `trilha-detalhe.test.ts` segue provando que o rótulo não contém o caractere | PASS | `apps/web/test/trilha-detalhe.test.ts:184` usa `"\u2014"` com `not.toContain` |
| `.md` sintético em `docs/` com o caractere reprova | PASS | `dc360/docs/zz-qa-nota.md`: vitest reprova, "dc360/docs/zz-qa-nota.md:1" com a linha acusada (`41-md.txt`); arquivo apagado |
| `.md` em `docs/evidencias-v2/G00/` com o caractere reprova | PASS | âncora do próprio teste (`docs/evidencias-v2/G00/V2-F00-E99/RESUMO.md` e `INDEX.md` em `REPROVAM`) e mutação 2 abaixo |
| `.txt` bruto em `docs/evidencias-v2` com o caractere passa | PASS | âncora `docs/evidencias-v2/G00/V2-F00-E99/saida-do-teste.txt` em `PASSAM`; mais a âncora na árvore real (`lista.some(a => a.startsWith("docs/evidencias-v2/") && !a.endsWith(".md"))` falso) |
| `.ts` do produto com o caractere reprova | PASS | `dc360/scripts/zz-qa.mjs`: reprova (`44-script.txt`); âncora `dc360/apps/api/src/produto-novo.ts` |
| Isenção não é mais larga que o aprovado (D4) | PASS | Sondas na árvore real abaixo e mutações |

## Evidência

`40-base-regras.txt`, `41-md.txt` a `46-endash.txt`, `47-mut-d4-prefixo-solto.txt`, `48-mut-isenta-md.txt`, `49-mut-fora-de-md-sem-sep.txt`, `50-shared-full-*.txt`, `60-eol.txt`.

## Cenários positivos

Árvore real: 8 de 8; a saída bruta de `docs/auditoria-v2/raw/teste-shared.txt` e `docs/AUDITORIA-2026-09-30.md` (pelo nome exato) ficam fora da varredura, e `RESUMO.md`/`INDEX.md` de evidência continuam dentro (âncora "as isenções da E20 valem só no recorte, e na árvore real").

## Cenários negativos

Cada arquivo abaixo recebeu uma linha com U+2014, o vitest do shared rodou, e o arquivo foi apagado em seguida:

| Arquivo temporário | Resultado |
| --- | --- |
| `dc360/docs/zz-qa-nota.md` | reprova |
| `dc360/docs/zz-qa-saida.txt` | reprova (a isenção de `.txt` vale só em `docs/evidencias-v2` da raiz do repositório) |
| `dc360/docs/evidencias-v2/zz-qa.txt` (vizinho de nome sob `dc360/`) | reprova |
| `dc360/scripts/zz-qa.mjs` | reprova |
| `dc360/docs/referencia/zz-qa.md` (vizinho de nome sob `dc360/`) | reprova |

Mutações em `packages/shared/test/regras-de-conteudo.test.ts`, todas desfeitas com `git restore`:

1. `isento()` com `relativo.startsWith(caminho)` (sem o separador, o defeito da D4): vermelho em "reprova o travessão novo em documento, evidência escrita à mão e produto" (`docs/referencia-outra/nota.md` volta a passar). 7 de 8.
2. `pasta-fora-de-md` sem a exceção de `.md`: vermelho em 2 casos (a âncora da árvore real e o repositório sintético). 6 de 8.
3. `pasta-fora-de-md` com `startsWith(caminho)` sem separador: vermelho no caso sintético (`docs/evidencias-v2-copia/saida.txt` volta a passar). 7 de 8.

Depois das mutações: 8 de 8 e `git status` sem arquivo meu.

## Tentativas de reprovar

1. Procurei isenção por prefixo solto: coberta (mutações 1 e 3 provam que o teste morde).
2. Procurei isenção por extensão: `docs/evidencias-v2/**` isenta TUDO que não termina em `.md`, inclusive `.html`, `.ts`, `.sql`, `.yml` e `.svg` escritos à mão. Hoje não há nenhum, mas a regra do texto da etapa fala em "saída bruta", e o recorte por extensão não distingue saída de teste de arquivo escrito à mão em outra extensão. Achado 1.
3. Travessão em arquivo de extensão que a varredura nem lê: `git ls-files` fora de `ts, tsx, css, sql, md, js, mjs, html, txt, json, webmanifest, svg, yaml, yml, toml` e das binárias (46 arquivos fora de `docs/referencia` e `relatorio/`): nenhum tem U+2014. Sem defeito hoje.
4. Variantes do caractere: meia-risca (U+2013) e a entidade `&mdash;` em `dc360/docs/zz-qa-endash.md` PASSAM (`46-endash.txt`). A regra do projeto fala só em "travessão" (U+2014), então o comportamento é o escrito; registro.
5. Instabilidade V-INS-04: 5 execuções sem mutação do arquivo (e 3 do shared inteiro) sem falha; não reproduziu.
6. Pastas ignoradas por NOME em qualquer profundidade (`dist`, `coverage`, `Pods`, `.git`, `node_modules`, `.angular`): um `docs/**/coverage/nota.md` seria ignorado. Sem ocorrência hoje.

## Achados

1. Anotado: a isenção de `docs/evidencias-v2` vale por "não é `.md`", não por "é saída bruta". Qualquer HTML, SQL ou YAML escrito à mão ali dentro passa com travessão. Aprovado por Rafael na D4 nesses termos; vale fechar com uma lista de extensões (`.txt`, `.json`, `.log`) em vez de "tudo menos `.md`".
2. Anotado: meia-risca e `&mdash;` não são pegos.
3. Anotado: a pasta inteira `dc360/packages/shared/test` é isenta (e não só o arquivo de regras), como aprovado em D4; qualquer travessão colocado em teste do shared passa.

## Não verificado

- `npm test` completo e `npm run test --workspace @dc360/web` (restrição de paralelismo); valem o gatekeeper e o CI (job "Testes, tipos e scripts" verde).
- Linux: o CI rodou o shared (não li o trecho do log por arquivo).

## Risco residual

Baixo. O portão é um teste de texto com âncoras; o recorte por extensão em `docs/evidencias-v2` é o ponto mais largo que sobrou.

## Motivo do humano

Não aplicável (a lista de isenções foi aprovada por Rafael em 2026-10-13, D4).
