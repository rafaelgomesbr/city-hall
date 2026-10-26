---
validador: testes
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

`$V` é `SCRATCH/validadores/testes`. Mutações por `$V/mutar.sh` (aplica, roda, `git restore`, confere o arquivo limpo). A E18 não tem commit novo desde a rodada 4, mas `apps/api/src/servidor.ts` foi tocado pela correção 3 da E05 (guarda de códigos de erro em `onSend`) e `scripts/e2e-api.mjs` pela correção 4 da E09 (passou a rodar também `layout-estreito.e2e.mjs`); por isso rodei tudo de novo neste SHA.

| Campo do bloco | Onde está o teste | Rodou no SHA | Morde? |
| --- | --- | --- | --- |
| Positivo: o preflight devolve `if-none-match` | `apps/api/test/cors-do-envio-de-evidencia.test.ts` (8 casos, rota real) | verde 2x | sim: c1 (sem `if-none-match`) 3 vermelhos |
| Positivo: `npm run test:e2e` (Chromium) verde | `apps/web/test/fluxo.e2e.mjs` contra `vite preview` na 4173 | 70 de 70, zero erro de console, 2x | n/a |
| Positivo: `MOTOR=firefox npm run test:e2e` verde | idem, Firefox 153.0 | 70 de 70, zero erro de console, 2x | n/a |
| Positivo: `npm run test:e2e:api` verde, com a seção 13 | `scripts/e2e-api.mjs` (Chromium 151) | `fluxo-api` 288 de 288 e `layout-estreito` 149 de 149, "TUDO CERTO", código 0, 2x; seção 13 com "os bytes sobem direto para o armazenamento" e "a imagem carrega pela URL assinada" | c1 derruba o preflight que a seção 13 usa |
| Negativo: origem fora da lista sem `access-control-allow-origin` | `cors-do-envio-de-evidencia.test.ts` | verde 2x | sim: c3 (`origin: true`) 1 vermelho |
| Negativo: `x-qualquer` não é permitido | idem | verde 2x | sim: c2 (lista com `x-qualquer`) 1 vermelho |
| Negativo: segundo PUT na mesma chave recusado | idem | verde 2x | sim: c4 (sem a escrita única) 1 vermelho |
| Autorização e isolamento: URL vencida, assinatura trocada, chave de outro município | idem | verde 2x | sim: c5 (sem conferir o prazo) 1; c6 (assinatura ignorada para chave com barra) 2 vermelhos |
| Regressão: `test:api`, `npm run test --workspace @dc360/web`, `test:e2e`, `test:e2e:api` | | API 1590 e 34 pulados 2x; web 688 de 688 2x; e2e acima | n/a |
| V-INS-06 (achado da rodada 4, prazo vencido em 2026-10-18) | `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md:377`: FECHADO na correção 4 da E03, com `irParaQuandoOPainelResponder` (`apps/web/test/fluxo-api.e2e.mjs:917`, usado na seção 23) | 2 rodadas em Firefox contra a API: `fluxo-api` 288 de 288 | não reproduziu |

## Evidência

- `npx vitest run test/cors-do-envio-de-evidencia.test.ts`, 2x: 8 de 8, código 0 (`$V/e18-01-cors-1.txt`, `-2.txt`).
- `npm run test --workspace @dc360/web`, 2x: 45 arquivos, 688 de 688 (`$V/e18-02-web-*.txt`).
- Build do painel: `$V/e18-03-build-web.txt` (código 0). `vite preview --port 4173 --strictPort`, derrubado no fim (porta livre conferida com `lsof`).
- e2e local: Chromium `$V/e18-05-e2e-local-chromium-1.txt`, `-2.txt`; Firefox `$V/e18-06-e2e-local-firefox-1.txt`, `-2.txt`. Versões dos motores: `$V/e18-07-versoes-dos-motores.txt` (Chromium 151.0.7922.34, Firefox 153.0).
- e2e contra a API: Chromium `$V/e18-08-e2e-api-chromium-1.txt`, `-2.txt` (código 0); Firefox `$V/e18-09-e2e-api-firefox-1.txt`, `-2.txt` (código 1, ver Achados). Portas 3691 e 4691 livres antes e depois.
- `npm run test:api`, 2x: 106 arquivos, 1590 passaram, 34 pulados por ambiente (`renovacao-contra-encerramento`, fora da etapa), código 0 (`$V/geral-03-*.txt`, `geral-06-*.txt`).
- Mutações: `$V/mut-e18-c1` a `c6`.
- T42: nenhum `skip`, `only`, `todo` ou condicional de ambiente em `cors-do-envio-de-evidencia.test.ts`; varredura limpa (`$V/geral-05-portao-de-skip.txt`).

## Cenários positivos

- Preflight do PUT com `content-type,if-none-match` responde 204 com a origem do painel e `if-none-match` na lista; a foto sobe pelo navegador contra a API na seção 13, nos dois motores.

## Cenários negativos

- Origem fora da lista sem cabeçalho de origem; `x-qualquer` recusado e lista exata sem curinga; segundo PUT 412; URL vencida, assinatura trocada e chave de outro município 403, sem gravar nada.

## Tentativas de reprovar

- Seis mutações no CORS e no armazenamento local: todas reprovam o teste da etapa.
- Rodei o e2e contra a API também em Firefox (o README documenta `node scripts/e2e-api.mjs firefox`): `fluxo-api.e2e.mjs` passa 288 de 288 nas duas rodadas, inclusive a seção 13 e a 23 (V-INS-06); o roteiro sai com código 1 porque o segundo arquivo que ele roda, `layout-estreito.e2e.mjs` (E09, correção 4), reprova 7 de 149 na seção 10, nas duas rodadas.
- A guarda de códigos de erro da E05 (correção 3) não alterou a resposta do preflight: os 8 casos passam.

## Achados

### CORRIGE ANTES DE CRESCER

1. **`node scripts/e2e-api.mjs firefox` sai com código 1, pelo arquivo da E09 e não pelo da E18.** Reprodução: `$V/e18-09-e2e-api-firefox-1.txt` e `-2.txt`, linhas "FALHA ... depois do envio o foco está no campo da senha atual, e não em BODY (BODY)" em Minha conta e em "Defina a sua senha", 320, 390 e 1280 px. Em Chromium passa. É o mesmo defeito que a validação de UX da E09 nesta rodada já registrou como bloqueio (`docs/evidencias-v2/G00/V2-F00-E09/validacao/1ed0b71/ux.md`, achado 1). Os três e2e que o bloco e o item do G00 pedem (local em Chromium, local em Firefox e `npm run test:e2e:api` em Chromium) estão verdes, por isso não reprova a E18; mas a quarta execução, documentada pela própria E18 no README, deixou de fechar. Dono: E09.

### ANOTADO

- V-INS-06 está FECHADO no registro da E03 com espera de conexão provada; não reproduziu aqui.
- Esperas fixas nos e2e (anotado nas rodadas 3 e 4): produzem vermelho intermitente, não verde falso; não houve intermitência em 4 rodadas locais e 4 contra a API.
- O PUT foi exercitado só contra o armazenamento local da API; CORS do armazenamento externo é F06-E15.

## Não verificado

- e2e em Windows (onde a etapa foi implementada): só macOS aqui.
- CI do SHA: ausente (H32); a dimensão Infra e CI cobre isso.
- S3 real e CORS do armazenamento externo: fora do escopo (F06-E15).

## Risco residual

Baixo para a E18: o conserto do CORS é nominal e cada negativo morde. O vermelho do roteiro em Firefox vem de outra etapa e precisa ser resolvido antes do G00, ou o item "E2E de navegador" deve dizer explicitamente que o Firefox contra a API não faz parte dele.

## Motivo do humano

não se aplica
