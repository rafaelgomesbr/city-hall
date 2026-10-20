---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-engenharia-entrega`.

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | Run 39420436042, push em `v2/f00`, `head_sha` 55209ab (só difere de fd17ff4 em `STATUS.md` e `ESTADO-ATUAL.md`), 9 de 9 `success` | `$V/api/ci-resumo.txt` |
| Os três e2e verdes | Job 118619736549 "Fluxo ponta a ponta no navegador" `success`, `ubuntu-latest`. Passos `success`: 11 "Modo local, no Chromium" (37 s), 12 "Modo local, no Firefox" (42 s), 13 "Caminho de produção, contra a API" (3 min 22 s). Também 14 (API no Firefox, 3 min 53 s) e 15 (API no WebKit, `--so-layout`, 2 min) | `$V/api/jobs.json` |
| O verde de cada passo vem do código da suíte | Sim: `fluxo.e2e.mjs` sai 1 com qualquer falha ou erro (linha 446); `fluxo-api.e2e.mjs` idem (linha 2586) e `layout-estreito.e2e.mjs` (linha 982); `e2e-api.mjs` rejeita quando um filho sai diferente de 0 (`rodar`, linha 122) e só sai 0 no fim (linha 239); cada passo usa `\| tee` com `shell: bash` (pipefail); sem `continue-on-error`; os passos 12 a 15 dependem só de `steps.esperar.outcome == 'success'` e `!cancelled()` | leitura no SHA |
| As contagens ("103 verificações completas", hoje maiores) | O job da linha de base (118619736620) saiu 0 no mesmo run (sem anotação de divergência explicada, e nenhum passo declara `divergenciaExplicada`): os passos `e2e` e `e2e-firefox` exigem "Passou: 70   Falhou: 0" e o `e2e-api` exige "Passou: 288   Falhou: 0" e "Passou: 197   Falhou: 0". Então, em Linux, as três execuções da DoD fecharam com as contagens completas | `$V/api/anot-baseline.json`, `dc360/scripts/baseline.mjs` linhas 825, 852, 895 |
| Preflight coberto por teste, no CI | `apps/api/test/cors-do-envio-de-evidencia.test.ts` roda em `npm test` (job 118619736871, passo 10 "Suíte completa" `success`) e na linha de base (`teste-api`, contagem exata) | `$V/api/jobs.json` |
| O teste do preflight morde | No Mac: 8 de 8 verde; com `"if-none-match"` tirado de `allowedHeaders` em `apps/api/src/servidor.ts:442`, 3 falham e 5 passam (código 1); restaurado com `git restore`, `git status` limpo | `$V/e18-cors.txt`, `$V/e18-cors-mutante.txt` |
| Artefato | `navegador-55209ab...`, 41793 bytes, `sha256:1c5a278c...`, `workflow_run.id` 39420436042, `head_sha` 55209ab, criado 12:23:59. Download sem token: HTTP 401 | `$V/api/artifacts.json` |

## Evidência

- CI: `$V/api/ci-resumo.txt`, `jobs.json`, `artifacts.json`, `anot-baseline.json` (7 pedidos à API pública na sessão, para as seis etapas).
- `npx vitest run --root apps/api test/cors-do-envio-de-evidencia.test.ts`: código 0, 8 de 8 (`$V/e18-cors.txt`); mutante: código 1, 3 falhas (`$V/e18-cors-mutante.txt`).

## Cenários positivos

- Em Linux, no CI: modo local em Chromium e Firefox, caminho de produção contra a API em Chromium e Firefox, e geometria e foco no WebKit, todos verdes; contagens completas conferidas pela linha de base.

## Cenários negativos

- Preflight sem o cabeçalho assinado: o teste reprova (mutação local).
- Os negativos de CORS (origem fora da lista, `x-qualquer`), de escrita única e de URL vencida ou trocada estão no teste e na suíte da API, verdes no CI.

## Tentativas de reprovar

1. Procurei passo verde sem execução: nenhum `continue-on-error`, nenhum `|| true` nos passos de teste (só no `cp` do log do servidor de pré-visualização), e cada suíte sai 1 com falha.
2. Procurei contagem que encolhe sem ninguém ver: a linha de base exige as contagens exatas e saiu 0 no mesmo run.
3. Procurei interferência entre passos: o `e2e-api.mjs` reconstrói `apps/web/dist` apontado para a API e serve em porta própria, mas roda depois dos dois passos do modo local, que usam o painel servido na 4173; e o roteiro recusa começar com porta ocupada.
4. Conferi que o artefato é deste run e deste SHA.

## Achados

1. **Anotado.** O artefato `navegador-...` não pôde ser lido (401), então os números do próprio job vêm de forma indireta (pela linha de base do mesmo run).
2. **Anotado.** O vetor `script-shell` do `.npmrc` (achado 2 da E19) também alcança `npm run test:e2e` e `npm run test:e2e:api`; no run não há `.npmrc` versionado.

## Não verificado

- O log e o artefato do job (HTTP 401 sem token): não li "Passou: N   Falhou: 0" do próprio job.
- Não rodei os e2e de navegador localmente nesta sessão (o QA e o validador de testes desta etapa cobrem; a porta 5811 e o Chromium de outra sessão estão em uso na máquina).
- A validação humana (Rafael ver o upload da foto concluir na seção 13).

## Risco residual

Baixo. A prova no Linux é a conclusão dos passos mais as contagens exatas da linha de base do mesmo run.

## Motivo do humano

O campo de validação humana pede que Rafael veja o upload de foto pelo painel concluir na seção 13: é E4.
