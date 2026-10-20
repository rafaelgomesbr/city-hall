---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [INFRA]
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
| Run do CI do SHA, job a job, com artefato | Run 39420436042, push em `v2/f00`, `head_sha` 55209ab (só difere de fd17ff4 em `STATUS.md` e `ESTADO-ATUAL.md`, `git diff --stat` conferido), `run_attempt` 1, 9 de 9 jobs `success` | `$V/api/ci-resumo.txt` |
| Linha de base em Linux (`baseline.mjs`) | Job 118619736620 "Linha de base (baseline.mjs) em Linux" `success`, `ubuntu-latest`, 12:11:56 a 12:29:04; passo 7 "Roteiro da linha de base" `success` (12:12:46 a 12:29:00, 16 min, compatível com os 20 passos do roteiro, incluindo as duas instalações do zero e os três e2e) | `$V/api/jobs.json` |
| O verde do passo quer dizer "todo passo confere" | Sim. Pela leitura do passo no SHA: falha com código 3, 2 ou outro, com arquivo de resultado faltando, com contagem de resultados diferente de `--so-listar`, ou com algum `divergente` no `resultados.json`; o código 1 passaria só com aviso `::warning title=baseline com divergência explicada`. As anotações do job (API pública de check-runs) trazem só o aviso da depreciação do Node 20 nas actions e o da migração do `ubuntu-latest`: nenhum aviso de divergência explicada, então o roteiro saiu 0. Além disso, no SHA nenhum dos 20 passos declara `divergenciaExplicada` e todos têm `esperado` (conferido importando `PASSOS`), então o código 1 nem é alcançável | `$V/api/anot-baseline.json`, `$V/api/cr-baseline.json`, `.github/workflows/verificar.yml` linhas 728-860 |
| Os números | Código 0 significa que os 20 passos bateram com o esperado no Linux: contagens exatas de shared, db (isolamento), pacote de campo, API, console (286), painel, jest do aplicativo, `test:scripts` (com 4 pulados por ambiente, sem `ios/`), `conferir:numeros`, `auditar` 0, os dois `npm audit` vermelhos por desenho, `expo-doctor` "21/21 checks passed", e2e Chromium e Firefox "Passou: 70   Falhou: 0" e e2e contra a API "Passou: 288" e "Passou: 197" | `dc360/scripts/baseline.mjs` linhas 739-900 |
| Artefato | `baseline-55209ab...`, 77904 bytes, `sha256:fac7235e...`, `workflow_run.id` 39420436042, `head_sha` 55209ab, criado 12:29:01; o passo de redação pula a pasta do baseline (o roteiro já redige e grava `INDEX.md` com SHA-256) | `$V/api/artifacts.json` |
| `.nvmrc` 22 coerente com o CI | Sim: `dc360/.nvmrc` = 22 e todos os jobs usam `node-version: "22"` | leitura do workflow |
| Sem máscara | Nenhum `continue-on-error`; o `set +e +o pipefail` do passo é só para capturar o código do roteiro, e o passo volta a `set -e -o pipefail` e decide pelo código; o job só roda com `[ci completo]` (presente em 55209ab; rodou) | workflow linhas 760, 790-830 |

## Evidência

- `$V/api/ci-resumo.txt`, `jobs.json`, `artifacts.json`, `anot-baseline.json`, `cr-baseline.json` (7 pedidos à API pública na sessão, para as seis etapas); download do zip sem token: HTTP 401 (`$V/api/download-restore-head.txt`).
- `node --test scripts/baseline.test.mjs` no Mac: 29 de 29, código 0 (`$V/e01-baseline-test.txt`).
- `node scripts/baseline.mjs --so-listar`: 20 passos, código 0 (`$V/e01-so-listar.txt`).

## Cenários positivos

- O job da linha de base em Linux, com o roteiro saindo 0 (inferido das anotações e da lógica do passo, e coerente com a ausência de `divergenciaExplicada` no SHA).
- O job "Testes, tipos e scripts" (118619736871) também verde, com `test:isolamento`, `npm test`, `test:scripts` e `conferir:numeros`.

## Cenários negativos

- Pela lógica do passo, divergência sem explicação (código 3), roteiro quebrado (2), resultado faltando ou contagem diferente fariam o job falhar; o `baseline.test.mjs` cobre a redação (JWT, Bearer, URL com credencial) e o "divergente" com código 3, e passa no Mac e no CI (dentro de `test:scripts`).
- Não reexecutei a simulação dos 8 casos do passo feita na rodada 6; li o passo no SHA, que mudou só no comentário desde então.

## Tentativas de reprovar

1. Procurei verde com divergência: código 1 passa com aviso; as anotações provam que não houve o aviso, e o SHA não tem nenhum passo com `divergenciaExplicada`.
2. Procurei job pulado: o `if:` exige `[ci completo]`; o job terminou `success`, não `skipped`.
3. Procurei artefato de outro SHA: `head_sha` e `workflow_run.id` batem; nome com o SHA; criado no fim do job.
4. Procurei cache que mascare: `setup-node` com `cache: npm` guarda só o cache de pacotes, e o roteiro apaga e reinstala `node_modules` com `npm ci`.
5. Achado relacionado (da E19): o passo 14 do roteiro (`auditar`) herda o falso verde do `package-lock=false`; no run não há `.npmrc` no repositório, então o número deste run não foi afetado.

## Achados

1. **Anotado.** O passo `auditar` da linha de base herda o defeito da E19 (achado 1 daquela etapa); dono E19.
2. **Anotado.** Anotação do runner: `ubuntu-latest` migra para Ubuntu 26 a partir de 2026-10-19, e as actions `checkout@v4`, `setup-node@v4` e `upload-artifact@v4` estão rodando forçadas em Node 24. A linha de base em Linux pode mudar sem mudança no repositório.

## Não verificado

- O conteúdo do artefato (RESUMO.md, `resultados.json`, `INDEX.md`) e o log do job: exigem token (HTTP 401). A conclusão "saiu 0" vem das anotações e da lógica do passo, não da leitura do RESUMO.
- Zero segredo na evidência do CI: sem ler o artefato, só pela redação testada em `baseline.test.mjs`.
- A reprodução por uma segunda pessoa (DoD) e Windows.

## Risco residual

Baixo. A leitura do artefato confirmaria os números diretamente; hoje eles são inferidos de "código 0 com esperado exato em cada passo".

## Motivo do humano

A DoD pede o procedimento repetido por uma segunda pessoa (ou Rafael noutra máquina) com o mesmo resultado: é E4, não é produzido por agente.
