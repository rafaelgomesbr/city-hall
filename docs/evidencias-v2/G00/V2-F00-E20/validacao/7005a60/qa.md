---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E20
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| `regras-de-conteudo.test.ts` sem falha | PASS | `cd dc360/packages/shared && npx vitest run test/regras-de-conteudo.test.ts`: 8 de 8, rodado 3 vezes (a primeira com `--testTimeout=120000`), todas verdes. |
| Literal do teste vira escape, mesma asserção | PASS | `git diff`: `apps/web/test/trilha-detalhe.test.ts:181` usa o escape unicode do travessão (barra, u, 2014); `npx vitest run test/trilha-detalhe.test.ts` no web: 15 de 15. |
| Isenções mínimas e justificadas | PASS | `CAMINHOS_IGNORADOS` com três alcances (`pasta`, `pasta-fora-de-md`, `arquivo`) e comentário de motivo em cada entrada; só `docs/auditoria-v2/raw` e `docs/evidencias-v2` fora de `.md`, e `docs/AUDITORIA-2026-09-30.md` pelo nome exato. |
| Âncoras provam o recorte | PASS | Dois casos novos: um na árvore real e um em repositório sintético (11 arquivos que reprovam, 4 que passam). Incluem armadilhas de prefixo (`evidencias-v2-copia`, `AUDITORIA-2026-10-01.md`, `sub/AUDITORIA-2026-09-30.md`). |
| Nota no cabeçalho do teste e em `19-definicao-de-pronto.md` | PASS | cabeçalho do teste; linha 108 de `docs/roadmap-v2/19-definicao-de-pronto.md`. |

## Evidência

Saídas dos comandos acima no terminal desta sessão; sonda abaixo. CI run 37739535524 verde (job "Testes, tipos e scripts").

## Cenários positivos

`.txt` bruto em `docs/evidencias-v2/G00/` com travessão: passa (não aparece nos achados).

## Cenários negativos (sonda real, arquivos temporários apagados no fim)

Planta: quatro arquivos com U+2014. Resultado do portão (1 falha de 8), achados listados:

- `docs/zz-qa-planta.md:1` reprovou.
- `docs/evidencias-v2/G00/zz-qa-planta.md:1` (um `.md` de evidência) reprovou.
- `dc360/apps/api/src/zz-qa-planta.ts:1` (código do produto) reprovou.
- `docs/evidencias-v2/G00/zz-qa-bruto.txt` NÃO apareceu, como a etapa manda.

Os quatro arquivos foram removidos; `git status --porcelain` sem nada fora de `validacao/`.

## Tentativas de reprovar

1. Planta nos quatro tipos de caminho acima: o portão mordeu onde devia e só onde devia.
2. Busquei isenção larga demais: `isento()` para `pasta-fora-de-md` exige `caminho + sep` e `.md` literal; arquivo `.MD` ou `.markdown` dentro de `evidencias-v2`: `.markdown` não está em `EXTENSOES` (nem era varrido antes); `.MD` maiúsculo não foi sondado (o repositório usa `.md`).
3. A observação do implementador sobre uma falha única e não reproduzida do portão numa rodada de `npm test`: rodei 3 vezes, 0 falhas. Não reproduz.

## Achados

1. **Anotado.** `isento()` mantém `relativo.startsWith(caminho)` para o alcance `pasta` (já existia: `docs/referencia`, `relatorio`). `relatorio-qualquer-coisa/` na raiz herdaria a isenção por prefixo. Pré-existente e fora do escopo da etapa (que consertou o prefixo só nas entradas novas).
2. **Anotado.** O texto escrito à mão em `.txt`/`.json` dentro de `docs/evidencias-v2` fica sem varredura por desenho; é o preço aceito pela etapa.

## Não verificado

- `npm test` completo do repositório (contagem 149 do roteiro da etapa já não vale: o shared tem 168 hoje, e o portão em si tem 8 casos). Rodei só o arquivo do portão e o do web.
- Linha 313 de `docs/AUDITORIA-2026-09-30.md` e `docs/auditoria-v2/raw/teste-shared.txt` não foram reabertos: a isenção está provada pela âncora.

## Risco residual

Baixo. A lista de isenções cresce só no próprio teste.

## Motivo do humano

A etapa pede que Rafael aprove a lista de isenções; é decisão de política, não de execução.
