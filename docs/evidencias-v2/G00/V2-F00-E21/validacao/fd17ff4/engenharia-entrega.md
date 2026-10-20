---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-engenharia-entrega`.

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | Existe: run 39420436042, push em `v2/f00`, `head_sha` 55209ab (só difere de fd17ff4 em `STATUS.md` e `ESTADO-ATUAL.md`), 9 de 9 `success`, 9 artefatos com `workflow_run.id` 39420436042 e `head_sha` 55209ab | `$V/api/ci-resumo.txt` |
| Caso 1 (`ocorrencia-encerramento.test.ts`, CRLF) em Linux | PASS no Linux: roda em `npm test` (job 118619736871, passo 10 "Suíte completa" `success`) e na linha de base (`teste-web` com contagem exata; job 118619736620 saiu 0). O checkout do CI é LF; a condição CRLF é exercida em Linux pelo `apps/web/test/ler-fonte.test.ts`, que grava o mesmo arquivo em CRLF e em LF e compara, dentro da mesma suíte | `$V/api/jobs.json`, `$V/api/anot-baseline.json` |
| Caso 2 (`banco-tls.test.ts`, `OPENSSL_CONF`) em Linux | PASS no Linux: suíte da API no passo 10 e `teste-api` da linha de base com `total`, `falhas` e `puladas` exatos (a base conta pulados, então os 13 casos não viraram "pulados" sem ninguém ver). O runner não tem `OPENSSL_CONF` quebrado, então em Linux só o caminho normal foi exercido | `dc360/scripts/baseline.mjs:194`, `:746` |
| Caso 3 (`.expo/types` velho e `test:campo`) em Linux | PASS no Linux, sem o cache velho: job 118619736571 "Aplicativo de campo", passos 7 "TypeScript estrito", 8 "Testes do aplicativo" e 9 "test:campo" `success`; o plano de limpeza do cache (`testar-campo.test.mjs`) está em `test:scripts`, verde no passo 11 do job `produto` | `$V/api/jobs.json` |
| `.gitattributes` em vigor | `git ls-files --eol` sem nenhum `i/crlf` (0 linhas, local); o job `roadmap` (118619736579) relê os SHA-256 dos `INDEX.md` num checkout LF limpo, passo 7 `success` | comando local; `$V/api/jobs.json` |
| Os três casos em **Windows** | **Sem prova**: os 9 jobs rodam em `ubuntu-latest` (`labels` de cada job; `runs-on` em todo o `verificar.yml` é `ubuntu-latest`) e não há outro workflow em `.github/`. Nenhum agente nesta máquina tem Windows | `$V/api/jobs.json`, `git ls-tree fd17ff4 .github/` |

## Evidência

- CI: `$V/api/ci-resumo.txt`, `jobs.json`, `artifacts.json`, `anot-baseline.json` (7 pedidos à API pública na sessão, para as seis etapas); download do artefato sem token: HTTP 401.
- `git ls-files --eol | grep -c i/crlf`: 0.
- Leitura de `apps/api/test/banco-tls.test.ts:103-114`, `apps/web/test/ocorrencia-encerramento.test.ts:146-151`, `apps/web/test/ler-fonte.test.ts:24-36`, `scripts/testar-campo.mjs:117-173`.

## Cenários positivos

- Linux (CI): os três casos verdes nas condições do runner, com contagens exatas conferidas pela linha de base.

## Cenários negativos

- Em Linux, o `ler-fonte.test.ts` prova que o helper aceita CRLF e LF e não esconde mudança real; o `testar-campo.test.mjs` prova o plano de limpeza do cache. Os negativos com a condição hostil real (árvore CRLF, `OPENSSL_CONF` inexistente, cache velho presente) foram provados no Mac na rodada 6, não no CI.

## Tentativas de reprovar

1. Procurei job em Windows no run, no workflow e em outros arquivos de `.github/`: não existe.
2. Procurei verde que esconde pulo: as contagens da linha de base incluem `puladas` na API e no painel, e o roteiro saiu 0.
3. Procurei máscara nos passos que rodam os três casos: nenhum `continue-on-error` ou `|| true`; pipefail em todos.

## Achados

1. **Bloqueia (por falta de prova, não por defeito).** A DoD pede "três casos verdes em Windows e Linux". Linux está provado pelo run 39420436042; Windows não tem job no CI nem execução neste SHA. Pela política, a parte de Windows fica BLOCKED e não vira PASS sem a execução.
2. **Anotado.** O CI em Linux não exercita as três condições hostis reais (o runner é LF, sem `OPENSSL_CONF` quebrado e sem cache `.expo` velho); exercita os testes sintéticos que as simulam.

## Não verificado

- Windows (sem a plataforma e sem job).
- O log dos jobs e o conteúdo dos artefatos (HTTP 401 sem token).

## Risco residual

O que a etapa existe para impedir (fim de linha, `OPENSSL_CONF` e cache do Expo quebrando no Windows) continua sem prova no Windows neste SHA.

## Motivo do humano

O campo de validação humana pede que Rafael rode `npm run verificar` no Windows; só ele tem a máquina Windows. Alternativa que remove o bloqueio sem humano: um job `windows-latest` no workflow (mudança do CI, fora do escopo desta etapa e decisão do Rafael).
