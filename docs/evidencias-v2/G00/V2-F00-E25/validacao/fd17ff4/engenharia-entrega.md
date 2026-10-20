---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [DB, INFRA]
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
| Run do CI do SHA, job a job, com artefato | Run 39420436042 (push, `v2/f00`, `head_sha` 55209ab, que só difere de fd17ff4 em `STATUS.md` e `ESTADO-ATUAL.md`; `git diff --stat` conferido). Job 118619736536 "Restore do banco, Postgres 17 (CA-08)" `success`, `ubuntu-latest`, 12:11:56 a 12:12:53. Passos 1 a 13 todos `success`, incluindo 7 "Instalar o cliente PostgreSQL 17", 9 "Subir os dois servidores PostgreSQL 17" e 10 "Ensaiar o restore" (12:12:42 a 12:12:49) | `$V/api/ci-resumo.txt` |
| O job rodou de fato (não foi pulado pelo `if:`) | O `if:` do job exige `[ci completo]` na mensagem do commit em push; a mensagem de 55209ab tem a marca e a conclusão do job é `success`, não `skipped` | `$V/api/run.json` (`display_title`), `$V/api/jobs.json` |
| O verde do passo prova o restore | Sim, por leitura no SHA: o passo roda `bash scripts/ensaiar-restore.sh 2>&1 \| tee` com `shell: bash` (pipefail), sem `continue-on-error` nem `\|\| true`; o roteiro tem `set -euo pipefail`, cada conferência chama `falhar` (sai 1) e só chega ao fim, com código 0, depois de todas: `--exit-on-error`, linhas e estrutura com `diff` exato, RLS ativada e forçada, isolamento afirmado nos dois bancos, `migrar --conferir` na cópia, `/saude` 200 com `banco: ok` e a sonda da API (login, leitura, 404 cruzado), mais os dois negativos | `dc360/scripts/ensaiar-restore.sh`, `.github/workflows/verificar.yml` linhas 891-988 |
| Artefato | `restore-55209ab...`, 66588 bytes, `sha256:ff555dcd...`, `workflow_run.id` 39420436042, `head_sha` 55209ab, criado 12:12:51. Download sem token: HTTP 401 (conteúdo não lido) | `$V/api/artifacts.json`, `$V/api/download-restore-head.txt` |
| A duração de 7 s é plausível | Sim: o mesmo roteiro, no Mac, contra dois PostgreSQL 17.6 novos, levou 5 s e passou 27 conferências; a saída zipada tem 58629 bytes, compatível com os 66588 do artefato (que traz ainda instalação, build e logs dos servidores) | `$V/e25/R1-ensaio.txt`, `$V/e25/saida/` |
| Postgres 17 (versão maior da produção) | O job sobe `postgres:17` em contêiner e instala `postgresql-client-17` do repositório oficial | workflow linhas 935-962 |

## Evidência

- `$V/api/ci-resumo.txt`: run, os 9 jobs com cada passo e conclusão, os 9 artefatos com tamanho, `digest`, `workflow_run.id` e `head_sha`.
- `$V/e25/R1-ensaio.txt`: `ensaiar-restore.sh` na árvore principal (pacotes recompilados antes, `$V/e25-build.txt`, código 0), dois clusters `initdb` novos do PostgreSQL 17.6 nas portas 55741 e 55742, API na 55743: código 0, "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam.", duração 5 s.
- `$V/e25/R2-servidor-sujo.txt`: negativo, o mesmo roteiro de novo nos mesmos servidores: código 1, "FALHA o servidor origem (porta 55741) ja tem papel dc360_*".
- Os dois servidores foram desligados (`pg_ctl stop`); nenhuma porta 55741-55743 ficou ouvindo.

## Cenários positivos

- CI: os 13 passos do job `success` em Linux, PostgreSQL 17.
- Local: 27 de 27 conferências contra PostgreSQL 17.6.

## Cenários negativos

- Servidor sujo: o roteiro recusa e sai 1 (local).
- Dentro do próprio roteiro, a cada execução (CI e local): restore sem o papel `dc360_console` tem de reprovar, e dump sem `--extension=pg_trgm` tem de reprovar; se algum passar, o roteiro sai 1. No CI o passo terminou `success`, então os dois negativos morderam lá também.
- Isolamento como `dc360_api` assumindo `dc360_app` nos dois bancos e 404 cruzado entre municípios pela API contra a cópia.

## Tentativas de reprovar

1. Procurei caminho de verde sem restore: `if:` que pula em push (não pulou: `success`), `continue-on-error`, `|| true` no passo (só no passo de limpeza dos contêineres, que é `always()` e não decide), `tee` sem pipefail (o `shell: bash` do GitHub liga `-eo pipefail`), saída 0 antecipada no roteiro (não há: o único fim é depois da última conferência).
2. Desconfiei dos 7 s do passo e medi: 5 s no Mac com o mesmo roteiro, então não é sinal de passo vazio.
3. Conferi que o artefato é deste run e deste SHA (`workflow_run.id`, `head_sha`, horário dentro do job).
4. Rodei o negativo do servidor sujo.

## Achados

1. **Anotado.** O job usa a etiqueta `postgres:17` sem versão menor fixa; a produção é 17.6. Uma 17.x nova muda o servidor do ensaio sem mudança no repositório. A anotação do run avisa também que `ubuntu-latest` migra para Ubuntu 26 a partir de 2026-10-19.
2. **Anotado.** O job só roda com `[ci completo]`, `workflow_dispatch` ou `schedule`; num push comum ele aparece como `skipped` e o run continua verde. Quem lê o run tem de conferir que o job rodou, como foi feito aqui.

## Não verificado

- O conteúdo do artefato `restore-...` e o log do job (HTTP 401 sem token): não li as 27 conferências do CI nem a versão exata do servidor que o contêiner trouxe; a conclusão vem da conclusão dos passos mais a leitura do roteiro.
- Docker e contêiner `postgres:17` localmente (não há Docker nesta máquina); usei binários do 17.6.
- A repetição do `RESTORE-DO-BANCO.md` por uma segunda pessoa (DoD, humano).
- PostGIS (o ambiente local não tem; o roteiro não depende dele).

## Risco residual

Risco alto pela natureza (restore com isolamento). A prova no CI é forte quanto ao código de saída e fraca quanto ao detalhe, que não pude ler; o ensaio local cobre o mesmo roteiro no mesmo SHA. A deriva da imagem `postgres:17` é o risco que sobra.

## Motivo do humano

A DoD pede o roteiro repetido por uma segunda pessoa (ou Rafael noutra máquina): é E4, não é produzido por agente.
