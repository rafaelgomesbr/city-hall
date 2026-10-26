---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E22
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). O diff `1ed0b71..fd17ff4` mexe em documentos da etapa: `dc360/README.md` (números da tabela de pacotes e de "Como testar", parágrafo do que a guarda de códigos de erro vê e não vê, parágrafo do que o `auditar` anula, linha "Fluxo no navegador" da tabela do CI) e `dc360/docs/COLOCAR-DE-PE.md` (5355 para 5473 testes). Conferi cada afirmação nova contra o código e a execução.

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run conferir:numeros` com zero divergência | PASS | código 0, 25 afirmações, "Todos os números da documentação batem com a realidade" (`bl3/04-conferir-numeros.txt`) |
| `npm test` (`regras-de-conteudo`) verde | PASS | shared 223 de 223; todas as suítes do `npm test` com 0 falhas (`bl1`, `bl2`) |
| `npm run auditar` | PASS | código 0 (`bl3/05-auditar.txt`) |
| Números novos do README e do `COLOCAR-DE-PE.md` | PASS | API 1685 passam (34 pulados por ambiente; 1719 com Postgres real), console 286, painel 699, `npm test` 3476 (223+345+238+1685+286+699), 5473 = 3476 + 1997 do aplicativo; "258 contra a API" = 258 `ok(` na coluna zero de `fluxo-api.e2e.mjs` |
| Parágrafo novo da guarda (status pelo `statusCode` truncado a inteiro, como o Node faz; `_writeRaw` e `_flushOutput` da instância; varredura proíbe `.socket`, `.connection`, `.client`, ouvintes `connection`, `request`, `upgrade`, `secureConnection`, `clientError` por `on`, `once`, `addListener`, `prependListener`, nomes internos `_writeRaw`, `_header`, `outputData`, desestruturar `raw`) | PASS (E3a mais execução) | `apps/api/src/guarda-de-codigos-de-erro.ts:238` e `:295-299`; listas em `apps/api/test/varredura-de-erros.ts:197-235` e `:804-810`; suítes da guarda verdes na API |
| Parágrafo novo do `auditar` (registro oficial fixo, `offline`, `prefer-offline` e `dry-run` anulados na linha de comando, consulta de controle `lodash` 4.17.20) | PASS (E2) | `BANDEIRAS_DA_CONSULTA_REAL` e `CONTROLE` em `scripts/auditar-excecoes.mjs:327-343`; sonda: `npm_config_registry` apontando para porta morta, `npm_config_offline=true` e `npm_config_dry_run=true` no ambiente, e o `auditar` saiu 0 perguntando a `https://registry.npmjs.org/`, com a consulta de controle de volta (`SAIDAS/e22-auditar-com-config-hostil.txt`) |
| Linha "Fluxo no navegador" (contra a API em Chromium, Firefox e WebKit `--so-layout` no CI) | PASS | `.github/workflows/verificar.yml` ganhou os dois passos; rodei os dois localmente: Firefox 288 e 197, WebKit 196, códigos 0 |
| Negativos de grep ("DESLIGADO NESTA IMPLANTAÇÃO", "sem ida ao banco", "NUNCA RODOU EM APARELHO", "MapLibre" vigente, "O console não tem rota de escrita", "o sistema continua no ar") | PASS | `git grep` no SHA (`SAIDAS/e22-grep.txt`): só acertos devidos (auditoria histórica, "404 sem ida ao banco" do console em outro sentido, ADR 0004 com nota de revisão, item 3 encerrado de `apps/web/PENDENCIAS.md`, documento de referência) |

## Evidência

- Roteiro da linha de base em 5 lotes (`SAIDAS/bl1` a `SAIDAS/bl5`).
- `node scripts/auditar.mjs` com configuração hostil no ambiente: código 0.
- `node scripts/e2e-api.mjs firefox` e `webkit --so-layout`: códigos 0.
- `conferir-evidencia.mjs V2-F00-E22 --sha fd17ff4`: sem falha.
- CI run 39420436042: 9 de 9 `success`.

## Cenários positivos

- Todo número novo que o diff pôs no README e no `COLOCAR-DE-PE.md` bate com a execução e com o `conferir:numeros`.

## Cenários negativos

- A afirmação "configuração do npm não muda para onde o `auditar` pergunta" resistiu a registro falso, `offline` e `dry-run` no ambiente.
- Grep das frases falsas antigas: zero acertos indevidos.

## Tentativas de reprovar

1. Somei à mão o total de `npm test` e o de "somando o aplicativo": batem.
2. Tentei desmentir o parágrafo do `auditar` com configuração hostil: não desmenti.
3. Conferi a linha nova do CI contra o workflow e executei os dois passos novos: verdes.
4. Reconferi os três itens "corrige antes de crescer" da rodada 6 no SHA: seguem iguais (Achados 1 a 3).
5. Conferi a data da frase de `COLOCAR-DE-PE.md` (Achado 4).

## Achados

1. **Corrige antes de crescer (repetido da rodada 6).** `dc360/README.md:170`: "dezesseis formas que a varredura não lia"; o teste da guarda planta 15 como rota (a m08, escrita no socket, não é plantada porque a guarda não a vê).
2. **Corrige antes de crescer (repetido da rodada 6), agora mais desatualizado.** `dc360/README.md:1324-1328`: depois do run 39143791434 "as correções posteriores ... ainda não passaram por CI". Há agora o run 39420436042 sobre `55209ab`, 9 de 9 verdes, que contém todas.
3. **Anotado (repetido da rodada 6).** `dc360/README.md:841`: "cinco documentos" na ressalva de saída a campo; o teste confere mais.
4. **Anotado.** `dc360/docs/COLOCAR-DE-PE.md`: "5473 testes ... (contagem estática de `npm run conferir:numeros` em 2026-10-19 ...)": o número foi atualizado em 2026-10-20 e a data ficou a antiga.
5. Nenhum que bloqueie: nenhuma afirmação nova do diff é falsa sobre o comportamento.

## Não verificado

- Leitura integral dos documentos do produto: conferi o diff desta rodada inteiro e as afirmações numéricas pela máquina, não releí os documentos que o diff não toca.
- Logs dos jobs do CI (exigem token).
- A validação humana da etapa.

## Risco residual

Frases de histórico de CI no README ficam velhas a cada run; o `conferir:numeros` não as alcança.

## Motivo do humano

A etapa pede que o Rafael leia a tabela antes e depois e confirme que nada ficou prometido sem existir. É juízo sobre o conjunto da documentação, que só ele dá.
