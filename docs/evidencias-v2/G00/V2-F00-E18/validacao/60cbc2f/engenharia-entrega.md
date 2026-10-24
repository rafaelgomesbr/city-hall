---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Notação: `$A` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-4`. Pergunta da rodada: a mudança do `verificar.yml` removeu, enfraqueceu ou tornou condicional algum passo dos três e2e de navegador ou do teste de preflight? E o que a rodada 7 só provou por inferência (o log do job, que deu 401) agora se lê?

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | Run 39524190207, `head_sha` c680f8d (difere de 60cbc2f só em `STATUS.md` e `ESTADO-ATUAL.md`), 12 de 12 `success`. Artefato `navegador-c680f8d...` (45579 bytes, `sha256:64e01557...`), `workflow_run.id` 39524190207, baixado com token | `$A/jobs.json`, `$A/artifacts.json`, `$A/art/navegador/` |
| O job `navegador` não foi tocado pelo diff do workflow | O diff `fd17ff4..60cbc2f` não tem hunk no job `navegador` (job 118974893838 "Fluxo ponta a ponta no navegador"); os passos 11 a 15 continuam os mesmos, com `tee` e `shell: bash` | `git diff fd17ff4..60cbc2f -- .github/workflows/verificar.yml`, `$A/verificar-60cbc2f.yml` |
| Os três e2e verdes, lidos no log do próprio job (a rodada 7 só tinha inferência) | Passo 11 (Chromium, modo local) "Passou: 70   Falhou: 0"; passo 12 (Firefox, modo local) "Passou: 70   Falhou: 0"; passo 13 (contra a API, Chromium) "Passou: 288   Falhou: 0" mais a segunda suíte do mesmo passo "Passou: 287   Falhou: 0"; passo 14 (API, Firefox) 288 e 287; passo 15 (API, WebKit, `--so-layout`) 287. Nenhum "Falhou" diferente de 0 | `$A/l-118974893838.txt` linhas 1665, 1789, 2186, 2505, 2900, 3219, 3583 |
| O PUT de evidência passa pelo preflight no navegador | Seção 13 do e2e contra a API: o `fetch` com `PUT` e cabeçalhos assinados (inclui `if-none-match`) é feito dentro da página (`page.evaluate`, origem cruzada, portanto com preflight): "OK os bytes sobem direto para o armazenamento", "OK o servidor confirma o envio", "OK a foto do agente aparece para o coordenador", "OK a imagem carrega pela URL assinada", "OK clicar amplia a foto". Em Chromium (linhas 1904-1909) e em Firefox (2618-2623) | `$A/l-118974893838.txt`, `apps/web/test/fluxo-api.e2e.mjs:363-410` |
| Preflight coberto por teste no CI | Job 118974893692, "Suíte completa": "✓ test/cors-do-envio-de-evidencia.test.ts (8 tests)". Também dentro do `teste-api` da linha de base, que confere a contagem exata e saiu 0 | `$A/l-118974893692.txt` linha 1030, `$A/l-118974893889.txt` |
| Regressão pedida pela DoD | `npm run test:api` (linha de base [7/20], codigo 0, confere), `npm run test --workspace @dc360/web` ([9/20]), `test:e2e` ([18/20] e [19/20]), `test:e2e:api` ([20/20]) | `$A/l-118974893889.txt` |
| Os arquivos da E18 não mudaram entre as rodadas | `servidor.ts`, o teste de CORS e `e2e-api.mjs` não aparecem em `git diff --stat fd17ff4..60cbc2f`. O que mudou nesse diff é o painel (E09), `layout-estreito.e2e.mjs`, as guardas (E05) e `baseline.mjs`: elas rodam dentro dos mesmos e2e e passaram | `git diff --stat fd17ff4..60cbc2f` |

## Evidência

- Job 118974893838 `success` (00:55:05 a 01:23:43). Passos 5 a 18 todos `success`, inclusive 6 "Instalar navegadores" e 9 "Servir o painel".
- Artefato `navegador-c680f8d...`: `04-e2e-local-chromium.txt`, `05-e2e-local-firefox.txt`, `06-e2e-contra-a-api.txt`, `06b-...-firefox.txt`, `06c-...-webkit.txt`, `07-preview.log`. Confere com o log do job.
- Job 118974893889 (linha de base): `e2e`, `e2e-firefox` e `e2e-api` "codigo 0, confere", exigindo "Passou: 70   Falhou: 0" e "Passou: 288   Falhou: 0" mais "Passou: 287   Falhou: 0" (o `baseline.mjs` desta rodada subiu o segundo número de 197 para 287; o run bate).
- Mutante do preflight: a rodada 7 (Mac, `"if-none-match"` fora de `allowedHeaders`, 3 falham e 5 passam) cobre; o arquivo de teste e `servidor.ts` não mudaram desde então, então não repeti.

## Cenários positivos

- Os três e2e da DoD (Chromium local, Firefox local, contra a API) mais Firefox e WebKit contra a API, todos com "Falhou: 0".
- O PUT de evidência cruza o preflight e a foto aparece para o coordenador.

## Cenários negativos

- Os negativos de CORS (origem fora da lista, cabeçalho `x-qualquer`), escrita única e URL vencida ou trocada estão na suíte da API e no `cors-do-envio-de-evidencia.test.ts` (8 testes), verdes no CI.
- Não montei variante do workflow que quebrasse um e2e (não posso disparar workflow).

## Tentativas de reprovar

1. Procurei passo de e2e que o novo workflow tenha deixado condicional: os passos 12 a 15 dependem só de `steps.esperar.outcome == 'success'` e `!cancelled()`; nenhum `continue-on-error`, e os `|| true` do job são só o `cp` do log do servidor de pré-visualização.
2. Procurei contagem que encolheu sem ninguém ver: os números lidos no log (70, 288, 287) conferem com o `esperado` do `baseline.mjs` (que o job de linha de base exige), e o `e2e-api` já é muito maior que as "103 verificações" do texto da DoD.
3. Procurei interferência de porta ou de ordem com os jobs novos (`windows`, `plataformas`): são jobs separados em runners separados; o `navegador` roda em `ubuntu-latest` sozinho.
4. Procurei o falso verde do `script-shell` em `.npmrc` (alcançaria `npm run test:e2e`): nenhum `.npmrc` versionado em 60cbc2f, e o job `dependencias` agora reprova se houver (passo 5, `success`).
5. Perguntei se a E18 depende do `auditar` verde: não. Nenhum passo dos três e2e nem do teste de preflight chama o `auditar`; só a linha de base inclui o `auditar` entre os 20 passos (ver o relatório da E01), mas os três e2e se leem pelos passos 11 a 15 do job `navegador`.
6. Conferi que o artefato e o log são deste run e deste SHA (`workflow_run.id`, `head_sha`, horários dentro do job).

## Achados

1. **Anotado.** A rodada 7 deixou como "não verificado" o log do job; agora foi lido, e as contagens batem. O artefato só se baixa com token (401 sem ele); o log do job idem.
2. **Anotado.** O WebKit roda só `--so-layout` (geometria e foco), por escolha antiga e documentada; a DoD fala em Chromium e Firefox.

## Não verificado

- Não rodei os e2e de navegador localmente nesta sessão (D-31 item 5: o CI cobre; a máquina tem outras sessões usando portas e navegadores).
- O mutante do preflight não foi repetido nesta rodada (arquivos intocados desde a rodada 7).
- Não disparei workflow nem montei variante que quebrasse um e2e.

## Risco residual

Baixo. O que sobra é instabilidade dos e2e de navegador em runner novo (o WebKit sem tela do Linux já reprovou uma vez, no run 39488319365, e foi tratado na E09).

## Motivo do humano

A DoD fala em "Rafael vê o upload de foto pelo painel concluir na seção 13". O CI faz isso em dois motores: o PUT é disparado dentro da página, com preflight real, e o log mostra "os bytes sobem direto para o armazenamento", "o servidor confirma o envio" e "a foto do agente aparece para o coordenador". Pela seção 8 de 28 (não se pede E4 quando E1 ou E2 provam) esta dimensão não precisa de humano; se o gatekeeper quiser manter a olhada de Rafael na tela, é decisão dele.
