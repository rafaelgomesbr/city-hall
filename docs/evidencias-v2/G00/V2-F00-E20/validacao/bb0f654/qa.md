---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E20
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). As saídas brutas de lá contêm o caractere plantado; este relatório o chama de "travessão" (U+2014) sem escrevê-lo.

Comando base: `cd dc360 && npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`.

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Shared com 0 falhas | PASS | 10 de 10 no arquivo (`e20-01`); suíte do shared 170 de 170 na linha de base |
| `trilha-detalhe.test.ts` usa o escape e segue provando | PASS | linha 184 com o escape de seis caracteres (barra invertida, u, 2014) entre aspas, 0 caracteres literais no arquivo; mutação: rótulo "Protocolo" com travessão em `apps/web/src/paginas/trilha-detalhe.ts` faz o teste reprovar (1 de 15) (`e20-10`); desfeita |
| `.md` em `docs/` com travessão reprova | PASS | plantado em `docs/roadmap-v2/29-operacao-do-ambiente.md`: código 1, linha apontada (`e20-03`) |
| `.md` em `docs/evidencias-v2/G00/` reprova | PASS | plantado no `RESUMO.md` da E20: código 1 (`e20-02`) |
| `.txt` bruto em `docs/evidencias-v2` passa | PASS | plantado em `sonda-sem-isencao.txt` da E20: 10 de 10, código 0 (`e20-04`) |
| `.ts` do produto reprova | PASS | plantado em `packages/shared/src/codigos-de-erro.ts`: código 1 (`e20-05`) |
| Isenção do relatório antigo só pelo nome exato | PASS | plantado em `docs/AUDITORIA-V2-BASELINE-ZERO.md` (outro relatório): código 1 (`e20-06`) |
| Âncoras provam o recorte (isenção indevida reprova) | PASS | `docs/evidencias-v2` como pasta inteira (incluindo `.md`): 3 de 10 reprovam (`e20-07`); `docs` inteiro isento: 3 reprovam (`e20-08`); prefixo solto sem separador e sem o filtro de `.md`: 3 reprovam (`e20-09`) |
| Nota no cabeçalho e em `19-definicao-de-pronto.md` seção 3 | PASS | cabeçalho e comentários em `CAMINHOS_IGNORADOS`; `docs/roadmap-v2/19-definicao-de-pronto.md:108` |
| Regressão `npm test` e painel | PASS | linha de base: shared 170, painel 665, demais verdes (API só com a falha de máquina do LibreSSL) |
| `INDEX.md` byte a byte | PASS | raiz 12 de 12 e `baseline/INDEX.md` 6 de 6 |

## Evidência

`SAIDAS/e20-01` a `e20-10`. Cada plantio feito por acréscimo de linha e desfeito com `git restore <arquivo>`; `git status` limpo ao fim.

## Cenários positivos

Árvore real verde; `.txt` bruto de evidência com travessão passa.

## Cenários negativos

Travessão em `.md` de `docs/`, em `.md` de evidência, em outro relatório de auditoria, em `.ts` do produto e no dicionário de rótulos: todos reprovam. Três isenções largas plantadas no teste: as âncoras reprovam.

## Tentativas de reprovar

1. Plantei a isenção larga de três formas diferentes no próprio teste (pasta inteira com `.md`, `docs` inteiro, prefixo solto): as âncoras pegam as três.
2. Testei outro relatório em `docs/` com nome parecido de auditoria: continua varrido.
3. Procurei folga por extensão: o filtro de `.md` é sensível a maiúsculas, mas a lista de extensões varridas também é (um `.MD` não é varrido em lugar nenhum), então isso é anterior à etapa e não é alargado por ela.

## Achados

Nenhum.

## Não verificado

- `.html` escrito à mão dentro de `docs/evidencias-v2` fica isento (não termina em `.md`); é o recorte que a etapa pede, só registro.

## Risco residual

Baixo.

## Motivo do humano

Nenhum: as isenções foram aprovadas por Rafael (D4, 2026-10-13).
