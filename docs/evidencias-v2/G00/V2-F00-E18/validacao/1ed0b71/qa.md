---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas brutas: `<V>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/`. Árvore principal em `5044e7a` (produto igual ao de `1ed0b71`), macOS arm64, Node 24.15, Playwright do `dc360/node_modules`. Desde a rodada 4 o produto mudou em 103 arquivos (E05, E06, E09, E15, E24), por isso tudo foi rodado de novo.

| Critério | Resultado | Prova |
| --- | --- | --- |
| `if-none-match` em `allowedHeaders`, nominal, sem curinga, `origin` intacta | PASS: `apps/api/src/servidor.ts:442` lista `content-type, authorization, accept, if-none-match` | leitura e teste abaixo |
| Teste de preflight (`cors-do-envio-de-evidencia.test.ts`) | PASS: 8 de 8; morde (mutação abaixo) | `<V>/E18-mutacao-cors.txt`, `<V>/npm-test.txt` |
| `npm run test:e2e` (Chromium, modo local) | PASS: Passou 70, Falhou 0, zero erro de console, código 0 | `<V>/E18-e2e-local-chromium.txt` |
| `MOTOR=firefox npm run test:e2e` | PASS: Passou 70, Falhou 0, zero erro de console, código 0 | `<V>/E18-e2e-local-firefox.txt` |
| `npm run test:e2e:api` (Chromium) com a seção 13 subindo a foto | PASS: `fluxo-api` 288 e 0, geometria 149 e 0, código 0, "TUDO CERTO"; seção 13: "os bytes sobem direto para o armazenamento", "o servidor confirma o envio", "a imagem carrega pela URL assinada" | `<V>/E18-e2e-api-chromium.txt:109-120` |
| Negativos: origem fora da lista, `x-qualquer`, segundo PUT | PASS nos casos do teste de preflight | idem |
| Autorização e isolamento: URL vencida, assinatura trocada, chave de outro município | PASS nos casos do teste (403 e nada gravado) | idem |
| Regressão: `test:api`, `test --workspace @dc360/web` | PASS: API 1590 e 34 pulados por ambiente (`renovacao-contra-encerramento`, Postgres real ausente), painel 688 de 688 | `<V>/npm-test.txt` |
| Validação humana (Rafael vê o upload) | Não verificado: humano | |

## Evidência

- Build do painel (`npm run build --workspace @dc360/web`, código 0) e `vite preview --port 4173 --strictPort` derrubado ao fim: `<V>/E18-build-web.txt`, `<V>/E18-preview.log`.
- E2E local Chromium e Firefox: códigos 0.
- E2E contra a API, Chromium: código 0, 141 s; portas 3691 e 4691 livres depois (o `e2e-api.mjs` derruba tudo).
- E2E contra a API, Firefox (`node scripts/e2e-api.mjs firefox`, o quarto caminho que o RESUMO e o `README.md:1662` documentam): código 1 nas duas vezes (`<V>/E18-e2e-api-firefox.txt`, `<V>/E18-e2e-api-firefox-2.txt`): o arquivo da etapa, `fluxo-api.e2e.mjs`, passa 288 e 0 nas duas; quem falha é a suíte de geometria acrescentada depois (seção 10, E09 correção 4), 142 e 7. Ver achado 1.
- `npm test` completo: código 0 (`<V>/npm-test.txt`).

## Cenários positivos

As três execuções exigidas verdes, mais o arquivo `fluxo-api.e2e.mjs` inteiro verde também no Firefox. A foto sobe pelo navegador contra a API na seção 13 nos dois motores.

## Cenários negativos

- Teste de preflight: origem fora da lista fica sem `access-control-allow-origin`; `x-qualquer` não é liberado e a lista é exatamente a nominal; segundo PUT na mesma chave recusado (escrita única); URL vencida 403; assinatura trocada 403; URL assinada para a chave de um município, com a chave trocada para a de outro, 403 e nada gravado.

## Tentativas de reprovar

1. Mutação 1: tirei `"if-none-match"` de `allowedHeaders` (`servidor.ts:442`): 3 de 8 reprovam (os dois que pedem `if-none-match` e o que confere a lista exata). Restaurado com `git restore`: 8 de 8.
2. Mutação 2: `allowedHeaders: ["*"]`: 4 de 8 reprovam (inclusive "cabeçalho qualquer fora da lista não é liberado" e "origem fora da lista"). Restaurado.
3. Rodei o Firefox contra a API duas vezes para separar instabilidade de defeito: as 7 falhas se repetem iguais, então não é instabilidade.
4. Conferi a árvore depois das mutações: `git status` sem mudança rastreada.

## Achados

1. **Corrige antes de crescer** (fora do escopo desta etapa, mas no caminho que ela documenta). `node scripts/e2e-api.mjs firefox` sai com código 1 em `1ed0b71`: a suíte de geometria (`apps/web/test/layout-estreito.e2e.mjs`, seção 10, acrescentada pela E09) falha 7 vezes no Firefox, "depois do envio o foco está no campo da senha atual (ou da provisória), e não em BODY (BODY)", em Minha conta e em "Defina a sua senha", a 320, 390 e 1280 px. Reproduzível duas vezes. O `README.md:1662` manda rodar esse comando "e no Gecko" e o `README.md:1666-1668` diz que o roteiro "roda `apps/web/test/fluxo-api.e2e.mjs` inteiro", mas hoje ele roda também a geometria, que reprova. O arquivo da E18 continua 288 e 0 no Firefox. Para o gatekeeper: pode ser defeito de foco do produto no Gecko (WCAG 2.4.3), a conferir na E09.
2. **Anotado.** A especificação fala em "103 verificações da API"; hoje são 288 executadas no `fluxo-api` e 258 contadas pelo `conferir:numeros`, que fecha.

## Não verificado

- Linux e Windows (CI ausente, H32): o job `navegador` do CI não rodou para este SHA.
- WebKit (fora do critério).
- Upload contra armazenamento S3 de verdade (F06-E15, fora do escopo).
- Validação humana: Rafael ver a foto subir na seção 13.

## Risco residual

O e2e não roda no CI (F01-E03), então uma regressão como a do achado 1 só aparece em quem roda o Firefox à mão. O CORS segue nominal e coberto por teste que morde.

## Motivo do humano

A etapa pede que Rafael veja o upload de foto pelo painel concluir na seção 13 (`npm run test:e2e:api`); é validação de pessoa, não de agente.
