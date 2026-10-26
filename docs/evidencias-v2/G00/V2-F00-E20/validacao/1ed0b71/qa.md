---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E20
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/` (abaixo, `SAIDAS/`). Mac arm64, Node v24.15.0. Árvore em `5044e7a` (produto igual a `1ed0b71`). Os arquivos da etapa (`regras-de-conteudo.test.ts`, `trilha-detalhe.test.ts`, `19-definicao-de-pronto.md`) não mudaram desde `bb0f654`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| `trilha-detalhe.test.ts`: literal vira `"\u2014"` com a mesma asserção | PASS | linha 184: `expect(rotulo).not.toContain("\u2014")`; painel 688 de 688 (`SAIDAS/bl2/03-teste-web.txt`) |
| `CAMINHOS_IGNORADOS`: `docs/auditoria-v2/raw` e `docs/evidencias-v2` só fora de `.md`; `docs/AUDITORIA-2026-09-30.md` pelo nome exato; cada um com motivo | PASS | lido no fonte (linhas 108 a 131), cada entrada comentada |
| Âncoras provam o recorte | PASS | mutante que alarga `docs/evidencias-v2` para pasta inteira: 3 casos reprovam, inclusive "as isenções da E20 valem só no recorte, e na árvore real" (`SAIDAS/e20-mutante-isencao-larga.txt`); restaurado, 10 de 10 (`SAIDAS/e20-depois.txt`) |
| Positivo: shared com 0 falhas | PASS | 223 de 223 (`SAIDAS/bl1/02-teste-shared.txt`); `regras-de-conteudo.test.ts` 10 de 10 (`SAIDAS/e20-base.txt`) |
| Negativo: `.md` sintético em `docs/` com o caractere reprova | PASS | `docs/zz-qa-plantio.md` plantado: código 1, apontando `docs/zz-qa-plantio.md:1` (`SAIDAS/e20-md-docs.txt`) |
| Negativo: `.md` em `docs/evidencias-v2/G00/` reprova | PASS | código 1, `docs/evidencias-v2/G00/zz-qa-plantio.md:1` (`SAIDAS/e20-md-evidencias.txt`) |
| Negativo: `.txt` bruto em `docs/evidencias-v2` passa | PASS | código 0 (`SAIDAS/e20-txt-evidencias.txt`) |
| Negativo: `.ts` do produto reprova | PASS | `dc360/apps/api/src/zz-qa-plantio.ts`: código 1 (`SAIDAS/e20-ts-produto.txt`) |
| Regressão: `npm test` e painel | PASS | `npm test` código 0 (`SAIDAS/npm-test.txt`); painel 688 de 688 |
| Documentação: cabeçalho do teste e seção 3 de `19-definicao-de-pronto.md` | PASS | cabeçalho (linhas 28 e 29) e o parágrafo da linha 108 de `19-definicao-de-pronto.md` descrevem exatamente o recorte medido |
| Evidência e `INDEX.md` | PASS | 12 de 12 linhas batem byte a byte; nenhum arquivo rastreado fora do índice; `conferir-evidencia.mjs` sem falha |

## Evidência

- `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts` (em `dc360`), uma rodada por plantio; cada arquivo plantado era novo e não rastreado, apagado logo depois; `git status` limpo no fim.
- Mutante aplicado com `sed` em `regras-de-conteudo.test.ts` e desfeito com `git restore`.
- Roteiro `--so=teste-shared` e `--so=teste-web`: conferem (`SAIDAS/bl1`, `SAIDAS/bl2`). `npm test`: código 0.

## Cenários positivos

- Árvore real verde sem afrouxar a regra: os `.md` da auditoria e das evidências continuam varridos.
- `.json` bruto em `docs/auditoria-v2/raw` com o caractere passa, como o recorte promete (`SAIDAS/e20-raw-json.txt`).

## Cenários negativos

- `.md` em `docs/`, `.md` em `docs/evidencias-v2/G00/` e `.ts` do produto com o caractere reprovam.
- Armadilha de prefixo: `docs/evidencias-v2-zzqa/saida.txt` (pasta irmã com o mesmo começo) reprova (`SAIDAS/e20-prefixo-armadilha.txt`).

## Tentativas de reprovar

1. Alarguei a isenção das evidências para a pasta inteira: as âncoras reprovam.
2. Pasta irmã com o mesmo prefixo: não herda a isenção.
3. Extensão em maiúsculas: `docs/evidencias-v2/G00/zz-qa.MD` passa, e `docs/zz-qa.MD` fora de qualquer isenção também passa (`SAIDAS/e20-MD-maiusculo.txt`, `SAIDAS/e20-MD-fora.txt`). A causa não é a isenção da E20: a lista `EXTENSOES` (linha 84) compara a extensão com caixa, então `.MD` nunca é varrido (Achado 1).
4. Reli as isenções antigas: `dc360/packages/shared/test` é isento inteiro (Achado 2).

## Achados

1. **Anotado.** O portão não varre arquivo com extensão em maiúsculas (`.MD`, `.TS`): a comparação com `EXTENSOES` diferencia caixa. É anterior à E20 e não alarga o recorte dela, mas um `RESUMO.MD` escrito à mão escaparia da regra do travessão. Reprodução: criar `docs/zz.MD` com o caractere e rodar o teste; passa.
2. **Anotado.** `dc360/packages/shared/test` é isento por inteiro (isenção anterior à etapa, aprovada por Rafael na correção 1): um teste novo do shared com travessão em texto que não é o do próprio portão passaria.

## Não verificado

- Windows e Linux (separador de caminho no Windows é o que `join` cobre; não rodei lá).
- Instabilidade de tempo do caso de varredura (V-INS-04) sob carga: rodei sem carga extra.

## Risco residual

Baixo. O recorte está provado por âncora e por plantio real; o que escapa (Achados 1 e 2) é anterior à etapa e não depende dela.

## Motivo do humano

não se aplica
