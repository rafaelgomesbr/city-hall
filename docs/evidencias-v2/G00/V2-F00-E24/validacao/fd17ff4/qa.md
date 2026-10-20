---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/e24` e `$R` = `.../scratchpad/val-qa/reg`. Por que esta etapa foi revalidada: o diff `1ed0b71..fd17ff4` toca o mapa de QA (`dc360/README.md`, `verificar.yml`, `baseline.mjs`, `e2e-api.mjs`). Conferi primeiro o que mudou nos documentos da etapa: `git diff --stat 1ed0b71..fd17ff4` sobre `SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md`, `LEIA-ME.md`, `PRIVACIDADE.md`, `PAPEIS_E_RESPONSABILIDADES.md`, `docs/apresentacao/`, `docs/apresentacao-produto-alyson.html` e `relatorio-apresentacao-alyson.html` é vazio; no README, as linhas novas são da guarda de códigos de erro e do `auditar`, nenhuma fala de saída a campo; o HTML e o PDF da apresentação mudaram juntos pela última vez em `3ed4fb6`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Nenhum documento promete a declaração no app sem ressalva (DoD) | PASS: grep próprio de "declar... saída" e "saída a campo" em `dc360/README.md`, `dc360/docs/*.md`, `docs/*.md`, `docs/*.html`, `relatorio-apresentacao-alyson.html` e `dc360/docs/apresentacao/*.html`, tirando as linhas que já trazem a ressalva: sobram 4 linhas (README:1083, PRIVACIDADE:97 e :180, SEGURANCA:94), e cada uma está em seção aberta por quadro de estado ("Estado em 07/10/2026 ... nenhuma saída é declarada, a tela ... fica vazia"; "Estado atual: recurso em construção"; "Recurso em construção") ou descreve o dado guardado | `$V/06-grep-sem-ressalva.txt`; README:1050-1055, SEGURANCA:8-13, PRIVACIDADE:97-99 lidos |
| Nenhum "Pronto" na linha de segurança do agente (negativo) | PASS: HTML de 15/09, linha 394, `p-parcial` "Parcial"; PDF derivado (24 páginas), página 4 renderizada por PDFKit: selo "Parcial" e a frase "O aplicativo do agente ainda não declara a saída" | `docs/evidencias-v2/G00/V2-F00-E24/validacao/fd17ff4/capturas/qa-pdf-2026-09-15-pagina-4.png`, `$V/07-pdf-texto.txt` |
| Nenhum passo do cartão manda declarar a saída no aplicativo (negativo) | PASS: sem mudança desde a rodada 6 (diff vazio); o grep não acha passo de declarar no cartão | `$V/06-grep-sem-ressalva.txt` |
| `npm test` com `regras-de-conteudo` e a guarda `ressalva-saida-a-campo` verdes | PASS: `npm test` código 0; `regras-de-conteudo.test.ts` 10 de 10; `ressalva-saida-a-campo.test.ts` 38 de 38 | `$R/06-npm-test.txt` |
| As 27 provas da API e do painel seguem verdes (negativo: nada removido) | PASS: `saida-a-campo.test.ts` 27 de 27, `saida-nao-declara-inexistente.test.ts` 11 de 11, `quem-esta-em-campo.test.ts` 4 de 4 | `$R/06-npm-test.txt` |
| Regressão: `npm test`, `npm run test:api` | PASS: `npm test` código 0 (inclui a API, 1685 e 34 pulados) | `$R/06-npm-test.txt` |
| Regressão no que o diff tocou (README, workflow, `baseline.mjs`, `e2e-api.mjs`) | PASS: `test:scripts` 324 de 324 (inclui `baseline.test.mjs`); `test:e2e:api` Chromium 288 e 197, código 0; CI 9 de 9 `success` | `$R/03-test-scripts.txt`, `$R/07-e2e-api-chromium.txt`, `.../scratchpad/val-qa/ci/jobs-e-passos.txt` |
| CP-02 registrado | PASS na existência (`docs/evidencias-v2/CP-02/decisao.md`); a leitura pelo Rafael e pelo Alyson é humana | |

## Evidência

- Grep (`$V/06-grep-sem-ressalva.txt`) e leitura dos trechos.
- PDF: `swift $V/pdf.swift` (texto, `$V/07-pdf-texto.txt`) e `swift $V/pdfpag.swift` (página 4 em PNG, copiada para `validacao/fd17ff4/capturas/qa-pdf-2026-09-15-pagina-4.png`, SHA-256 `708958a9...92cbb5`).
- Guarda na cópia (`.../scratchpad/val-qa/e21/copia/`, `git archive fd17ff4`): verde 38 de 38 (`$V/01-guarda-verde-copia.txt`); plantios em `$V/02-...` a `$V/05-...`; arquivos restaurados e conferidos com `cmp`.
- Regressão: `$R/03-test-scripts.txt`, `$R/06-npm-test.txt`, `$R/07-e2e-api-chromium.txt`, todos `exit=0`.

## Cenários positivos

- Os documentos de hoje dizem o estado real com quadro ou ressalva; a apresentação diz "Parcial" no HTML e no PDF; a funcionalidade da API e do painel continua com as suas provas verdes.

## Cenários negativos

Plantios na cópia, cada um desfeito antes do seguinte:

| Plantio | Esperado | Obtido |
| --- | --- | --- |
| P3: selo da linha 394 da apresentação volta a "Pronto" | guarda reprova | reprova (2 casos) |
| P4: "Pronto" e a frase "ainda não declara" apagada | guarda reprova | reprova (3 casos) |
| P1: frase nova no fim do README: "o agente declara a saída a campo no aplicativo e a coordenação acompanha em tempo real" | guarda reprova | **passa verde** (38 de 38) |
| P2: passo novo no cartão: "Abra o aplicativo e toque em Declarar saída a campo" | guarda reprova | **passa verde** (38 de 38) |

## Tentativas de reprovar

- Procurei regressão nos documentos pelo diff da rodada (nenhum documento da etapa mudou) e por grep próprio com as ressalvas tiradas, lendo cada sobra no contexto.
- Conferi o PDF pela imagem da página, não só pelo texto extraído: o texto extraído intercala o selo da linha seguinte ("Parcial Pronto Pronto no servidor"), e a imagem mostra que o "Pronto" solto é o selo de "Foto perdida não destrói a vistoria".
- Tentei a volta do defeito por quatro caminhos na guarda: os dois da apresentação reprovam; os dois de frase nova (README e cartão) passam. É a mesma classe do achado da rodada 6, agora também no README.
- Rodei a regressão do que o diff tocou (`test:scripts` com `baseline.test.mjs`, E2E contra a API) para ver se a mudança em `e2e-api.mjs` (`--so-layout`) ou no workflow quebrou algo: não quebrou.

## Achados

- **Corrige antes de crescer** (o da rodada 6, continua, e vale também para o README). A guarda `dc360/packages/shared/test/ressalva-saida-a-campo.test.ts` não prende uma frase NOVA que volte a prometer a declaração no aplicativo: no README (P1) e no cartão (P2) o plantio passa com 38 de 38. Não reprova a etapa porque o critério é sobre os documentos de hoje, que estão certos, e o gatekeeper já classificou esta classe assim na rodada 6. Reprodução: acrescentar a frase de P1 ao fim de `dc360/README.md` numa cópia e rodar `npx vitest run test/ressalva-saida-a-campo.test.ts` em `packages/shared`.
- **Anotado** (rodada 4, continua, fora da etapa): o estado vazio de "Quem está em campo" no painel (`apps/web/src/paginas/QuemEstaEmCampo.tsx`) diz que declarar a saída é um passo do aplicativo do agente.
- **Anotado**, fora da etapa: `node scripts/e2e-api.mjs --so-layout` termina com "TUDO CERTO: o caminho de produção passou de ponta a ponta" mesmo tendo pulado a suíte principal; a linha "Suíte principal PULADA" aparece antes, mas a frase final diz mais do que rodou.

## Não verificado

- Regenerar o PDF com `docs/apresentacao/gerar-pdf.mjs` (não mudou desde `3ed4fb6`; conferi o PDF arquivado contra o HTML).
- `relatorio-apresentacao-alyson.pdf` da raiz: só o grep do HTML.
- A leitura da apresentação ajustada pelo Rafael e pelo Alyson antes de uma demonstração (humano).

## Risco residual

Os documentos de hoje estão certos, mas a guarda automática não impede que uma frase nova volte a prometer a declaração no aplicativo do agente; a proteção contra a volta fica dependendo de revisão humana.

## Motivo do humano

A etapa pede que Rafael e Alyson decidam o CP-02 e leiam a apresentação ajustada antes de qualquer demonstração a município; é leitura de quem apresenta, não de agente.
