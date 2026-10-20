---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [LGPD, INFRA]
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
| `test:scripts` com 0 falhas no Linux | Job 118619736871 "Testes, tipos e scripts", passo 11 "Testes dos scripts" `success` (12:22:35 a 12:22:44). O passo depende de `steps.instalar_app.outcome == 'success'` (passo 6, `npm ci` em `apps/campo`, `success`), então os testes que leem `apps/campo/node_modules` tiveram o que ler. Comando `npm run test:scripts 2>&1 \| tee` com pipefail | `$V/api/jobs.json`, workflow linhas 97-150 |
| Contagem exata e os 4 pulados por ambiente | Job 118619736620 (linha de base em Linux) `success`, com o roteiro saindo 0 (sem anotação de divergência explicada; nenhum passo declara `divergenciaExplicada`): o passo `test-scripts` bateu `total`, `falhas: 0` e `puladas: 4` (sem `ios/` no runner) exatamente | `$V/api/anot-baseline.json`, `dc360/scripts/baseline.mjs:751` |
| `conferir:numeros` sem divergência no Linux | Passo 12 "Os números do README batem com a realidade" `success` (12:22:44 a 12:23:35); e o passo `conferir-numeros` da linha de base, que exige a frase "Todos os números da documentação batem com a realidade.", conferiu | `$V/api/jobs.json`, `baseline.mjs:758` |
| `conferir:numeros` morde | No Mac: troquei `5473` por `5472` em `dc360/docs/COLOCAR-DE-PE.md:40`, código 1, "Afirmações que não batem (1)", com o valor real; restaurei com `git restore` e conferi `git status` limpo | `$V/e17-conferir-mutante.txt` |
| Artefato | `produto-55209ab...` (46074 bytes, `sha256:45a73351...`) e `baseline-55209ab...` (77904 bytes), ambos com `workflow_run.id` 39420436042 e `head_sha` 55209ab. Download sem token: HTTP 401 | `$V/api/artifacts.json` |
| Portabilidade em duas plataformas | Neste SHA: Linux pelo CI e macOS por execução local (`test:scripts` 324 de 324, 0 pulados porque `apps/campo/ios/` existe aqui; `conferir:numeros` 0). Windows neste SHA: nenhum job do CI roda em Windows (os 9 são `ubuntu-latest`); a única prova Windows é a do implementador em 2026-10-07, numa árvore mais antiga (ver Não verificado) | `$V/e17-test-scripts.txt`, `$V/e17-conferir.txt` |

## Evidência

- CI: `$V/api/ci-resumo.txt`, `jobs.json`, `artifacts.json`, `anot-baseline.json` (7 pedidos à API pública na sessão, para as seis etapas).
- `npm run test:scripts` no Mac: código 0, 324 testes, 324 passam (`$V/e17-test-scripts.txt`).
- `npm run conferir:numeros` no Mac: código 0 (`$V/e17-conferir.txt`); mutante: código 1 (`$V/e17-conferir-mutante.txt`).

## Cenários positivos

- Linux (CI): os dois comandos verdes, e a contagem exata de `test:scripts` (com os 4 pulados) conferida pela linha de base.
- macOS (local): os dois comandos verdes.

## Cenários negativos

- `conferir:numeros` reprova um número alterado de propósito (mutação local, desfeita).
- Os negativos do caso 22 (cópia de produção recusa repositório, iCloud, Dropbox, Google Drive, OneDrive e Área de Trabalho) e do caso 37 (entitlements) estão dentro de `test:scripts`, que passou no Linux e no Mac.

## Tentativas de reprovar

1. Procurei passo que fica verde sem testar: o passo 11 só roda se a instalação do aplicativo deu certo; os testes que leem `apps/campo/node_modules` "saem sem afirmar nada" sem ela, e ela rodou (`success`). A contagem exata da linha de base fecha a porta de um `test:scripts` que passasse com menos casos.
2. Desconfiei dos 9 s do passo: a contagem exata conferida pela linha de base, no mesmo run, afasta passo vazio; no Mac o `auditar.test.mjs` sozinho leva perto de 7 s e o `node --test` roda arquivos em paralelo.
3. Procurei invocação não portátil nova (Windows): `execFileSync("npm")` só em `auditar.mjs`, `comando-de-migracao.test.mjs` e `testar-campo.mjs`, os três com `shell: process.platform === "win32"`; os testes de link simbólico pulam com `EPERM` ou `EACCES`. Leitura, não execução.
4. Procurei máscara no workflow: nenhum `continue-on-error`; os `if:` usam `!cancelled()` e o resultado da instalação, e o job fica vermelho se qualquer passo falhar.

## Achados

1. **Anotado.** Windows não tem job no CI; a portabilidade Windows deste SHA não foi reexecutada desde 2026-10-07, e `test:scripts` passou de 165 para 324 casos desde então. A leitura não achou invocação não portátil.
2. **Anotado.** O vetor `script-shell` do `.npmrc` (achado 2 da E19) também deixaria verdes os passos `npm run test:scripts` e `npm run conferir:numeros`; no run não há `.npmrc` versionado.

## Não verificado

- Windows neste SHA (sem a plataforma, sem job). A DoD fala em "duas plataformas" e os testes positivos em "Windows e Linux": o gatekeeper decide se Linux mais macOS neste SHA, mais o Windows de 2026-10-07, cobre.
- O log do job e o conteúdo dos artefatos (HTTP 401 sem token).

## Risco residual

Baixo. Os dois comandos estão verdes em duas plataformas neste SHA; o risco que sobra é um caso novo de `test:scripts` que só quebre no Windows.

## Motivo do humano

O campo de validação humana da etapa pede que Rafael rode os dois comandos na máquina dele (Windows); nenhum agente aqui tem Windows.
