---
validador: testes (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
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

Veredito: **PASS**. Diferente da rodada 2 (que mutou só em cópias e não rodou navegador, por causa do paralelismo), nesta rodada mutei o código real e rodei os e2e: o teste de preflight e o e2e contra a API mordem quando `if-none-match` sai do CORS, e os três negativos de segurança do PUT mordem cada um no seu ponto. `servidor.ts`, o teste de CORS e o roteiro `e2e-api.mjs` não mudaram desde `4b96ea7`; o diff em `apps/web/test/fluxo-api.e2e.mjs` é da E10 (foco e redirecionamento de "redefinir senha"), fora do escopo desta etapa.

Base: `$SP/val/testes/` (prefixo `e18-`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| o preflight devolve `if-none-match` | morde | `if-none-match` tirado de `allowedHeaders` em `apps/api/src/servidor.ts:420`: 3 de 8 reprovam em `cors-do-envio-de-evidencia.test.ts` (`e18-02-...`) |
| e2e contra a API verde, seção 13 sobe a foto pelo navegador | PASS e morde | `node scripts/e2e-api.mjs chromium` no SHA: código 0, "Passou: 288 Falhou: 0" e "Passou: 64 Falhou: 0", zero erro de console (`e18-01-...`). Com a mesma mutação: a seção 13 morre com "page.evaluate: TypeError: Failed to fetch" e o roteiro sai com 1 (`e18-03-...`) |
| e2e local em Chromium verde | PASS | `npm run test:e2e` contra `vite preview` na 4173: "Passou: 70 Falhou: 0", zero erro de console (`e18-22-...`) |
| e2e local em Firefox verde | PASS pelo CI | Firefox do Playwright não está instalado nesta máquina (`e18-23-...`); no run 38618369218, passo "Modo local, no Firefox": "Passou: 70 Falhou: 0" (`e18-11-ci-log-e2e.txt`) |
| origem fora da lista sem `access-control-allow-origin`; `x-qualquer` fora | PASS | casos verdes no SHA; a mutação acima derruba também "cabeçalho qualquer fora da lista não é liberado", que confere a lista exata. A rodada 2 matou `origin: true` e o curinga em cópia; o arquivo não mudou |
| escrita única (segundo PUT recusado) | morde | conferência de objeto existente desligada em `rotas/armazenamento-local.ts`: 1 reprova (`e18-06-...`) |
| URL vencida recusada | morde | conferência de `expira` desligada em `armazenamento/memoria.ts`: 1 reprova (`e18-04-...`) |
| assinatura trocada e chave de outro município recusadas | morde | conferência do HMAC desligada: 2 reprovam (`e18-05-...`) |
| instabilidade do Firefox contra a API (rodada 1) registrada pela T42 | PASS | V-INS-06 em `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md:266`, dono `rafael`, etapa V2-F00-E18, prazo 2026-10-18 (dentro do prazo hoje, 2026-10-15) |
| CI do SHA | PASS | job "Fluxo ponta a ponta no navegador" `success`: local Chromium 70, local Firefox 70, contra a API 288 e 64, "TUDO CERTO" |

## Evidência

- `cd dc360/apps/api && npx vitest run test/cors-do-envio-de-evidencia.test.ts` com a mutação do CORS: 3 reprovam, 5 passam. `$SP/val/testes/e18-02-cors-unit-sem-if-none-match.txt`.
- `node scripts/e2e-api.mjs chromium` (portas 3691 e 4691, livres antes e depois): verde no SHA (`e18-01`, 1 min 58 s); vermelho com a mutação (`e18-03`).
- `npm run build --workspace @dc360/web` e `npx vite preview --port 4173 --strictPort` (PIDs anotados e derrubados ao fim), `npm run test:e2e`: 70 de 70 (`e18-22`).
- CI: `gh run view 38618369218 --log --job 116039196287` (`e18-10-ci-jobs.txt`, `e18-11-ci-log-e2e.txt`).
- Cada mutação desfeita com `git restore`; `git status --porcelain apps` vazio depois. `apps/web/dist` é ignorado pelo git e foi reconstruído no modo padrão ao fim.

## Cenários positivos

- O PUT da foto passa pelo preflight de um navegador real (Chromium) e a galeria do coordenador mostra a foto, com a imagem carregando pela URL assinada.

## Cenários negativos

- Sem `if-none-match` liberado, o navegador bloqueia o PUT ("Failed to fetch") e o e2e reprova: o teste de unidade por `inject` e o e2e de navegador concordam.
- URL vencida, assinatura trocada, chave de outro município e segundo PUT: cada um reprova sozinho quando a sua conferência é desligada.

## Tentativas de reprovar

1. Tirei `if-none-match` do CORS e rodei unidade e navegador: os dois reprovam.
2. Desliguei, uma de cada vez, expiração, HMAC e escrita única: os três reprovam.
3. Procurei espera fixa. O teste de CORS não tem nenhuma. Os e2e têm muitas: 14 `waitForTimeout` em `fluxo.e2e.mjs` e 26 em `fluxo-api.e2e.mjs`; a seção 13 tem duas de 300 ms depois de fechar a ampliação, onde caberia esperar o `.modal__painel` sumir. Elas são anteriores à etapa (arquivo MANTER) ou da E10 (6 novas no diff `4b96ea7..52952a1`, entre elas a espera de 5 s que prova a AUSÊNCIA de redirecionamento por tempo, que é legítima, e 400 ms depois de `hover` para a transição de cor). O roteiro `e2e-api.mjs` espera com condição (`/saude` e o painel respondendo), e a carga da miniatura espera o evento `load`. Espera fixa num e2e produz vermelho intermitente, não verde falso; por isso anoto e não reprovo.
4. Conferi se a seção 13 poderia passar sem preflight (mesma origem): o painel roda em `localhost:4691` e a API em `127.0.0.1:3691`, origens diferentes, então o navegador faz o preflight de verdade.

## Achados

### ANOTADO

- Esperas fixas nos e2e (acima). Dono provável: F01-E03 (e2e no CI) ou quem tocar cada seção.
- O CI roda o e2e contra a API só em Chromium; Firefox contra a API depende de execução local, e é ali que V-INS-06 apareceu.
- A lista de console esperado do Firefox continua global ao arquivo (anotado na rodada 2).

## Não verificado

- e2e local e contra a API em Firefox nesta máquina: o navegador não está instalado e não instalei (o local em Firefox está verde no CI do SHA; o contra a API em Firefox não roda no CI).
- S3 real: fora do escopo (F06-E15).

## Risco residual

Baixo. O conserto é uma linha, e as duas camadas de teste reprovam sem ela.

## Motivo do humano

Nenhum para esta dimensão.
