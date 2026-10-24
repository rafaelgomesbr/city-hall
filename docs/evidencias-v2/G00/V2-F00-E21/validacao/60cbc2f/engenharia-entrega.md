---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E21
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$I` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-E21`.

| Critério (Infra e CI, 28 seção 8 e DoD da E21) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job, com artefato | PASS. Run 39524190207, evento push, ramo `v2/f00`, `head_sha` c680f8d, 12 de 12 jobs `success`, 12 artefatos `<job>-c680f8d...` não expirados. `git diff --stat 60cbc2f..c680f8d` toca só `docs/roadmap-v2/ESTADO-ATUAL.md` e `STATUS.md` (lista permitida da seção 6 de 28), então o run vale para 60cbc2f; o `verificar.yml` e `dc360/scripts` são idênticos nos dois | `$I/run.json`, `$I/jobs.json`, `$I/artifacts.json` (API pública, sem token) |
| Item 4: o BLOCKED da rodada 7 (Windows sem job) foi removido | PASS. A correção 3 criou o job `plataformas` em matriz `windows-latest` e `ubuntu-latest`; o job 118974894002 roda em Windows (imagem `windows-2025-vs2026`, Git Bash, PowerShell 5.1.26100) e verde | `$I/art-12312139529/00-contexto.txt`, `$I/job-118974894002.log` |
| Caso 1 (CRLF) em Windows e Linux sob a condição hostil | PASS nos dois. Controle: 121 arquivos de `apps/web/src` e `apps/web/test` gravados em CRLF, `Ocorrencia.tsx` com 2484 linhas CRLF e 0 LF sozinho, `ocorrencia-encerramento.test.ts` com 177 CRLF, agulha antiga `"\n}\n"` ausente. Suíte do painel sobre essa árvore: 47 arquivos, 723 de 723; `ocorrencia-encerramento.test.ts` 13 de 13 | `05-crlf-controle.txt`, `06-painel-em-crlf.txt` dos dois artefatos |
| Caso 2 (`OPENSSL_CONF` inexistente) em Windows e Linux | PASS nos dois. Controle: o `openssl` cru reprova ("Can't open ... for reading, No such file or directory"), e o job reprovaria se gerasse o certificado. `banco-tls` 13 e `openssl-do-teste` 10, 23 de 23, com a linha "OPENSSL_CONF aponta para ..., que não existe" exigida por `grep`. No Windows, repetido no PowerShell 5.1 (`codigo=0`, 23 de 23) | `07-`, `08-`, `09-` dos artefatos |
| Caso 3 (`.expo/types` velho) em Windows e Linux | PASS nos dois. Controle: `tsc` direto dá 2 TS2345 (`perfil.tsx(1224,44)`, `Sino.tsx(154,73)`); `npm run test:campo` com o cache velho apaga o cache, 139 suítes, 1997 de 1997, "A leitura do código e o jest concordam: 1997 casos"; typecheck sem cache sem erro | `11-`, `12-`, `13-` dos artefatos |
| `.gitattributes` em vigor | PASS. Checkout com `core.autocrlf=true` (no Windows vinha também do gitconfig de sistema do Git): 7521 arquivos, `i/lf` 3759, `i/-text` 3762, nenhum `i/crlf` nem `i/mixed`; `w/crlf` só 2 (os `.ps1`, `eol=crlf`). Localmente `git ls-files --eol \| grep -c i/crlf` dá 0 | `01-git-ls-files-eol-resumo.txt` |
| Índices de evidência (SHA-256) sobre o checkout hostil | PASS: 89 INDEX.md, 4793 arquivos, `RESULTADO: OK`, em Windows e Linux | `02-indices-de-evidencia.txt` |
| Construção do job (item 5) | PASS, ver Evidência | `verificar.yml` linhas 674 a 899 em 60cbc2f |

## Evidência

Run 39524190207 (workflow "Verificar", push, c680f8d), todos `success`:

| Job | Id | Resultado | Linha que prova |
| --- | --- | --- | --- |
| Ambiente hostil em ubuntu-latest | 118974893948 | success, 00:55:04 a 00:57:45; 19 passos `success`, o 14 (PowerShell) `skipped` por `runner.os == 'Windows'` | `Test Files 2 passed (2)`, `Tests 23 passed (23)`; `Tests 723 passed (723)`; `Tests: 1997 passed, 1997 total` |
| Ambiente hostil em windows-latest | 118974894002 | success, 00:55:05 a 00:59:32; 20 passos `success`, inclusive o 14 do PowerShell | `PowerShell 5.1.26100.33438 (Desktop)`, `codigo=0`, `Tests 23 passed (23)`; shell `C:\Program Files\Git\bin\bash.EXE --noprofile --norc -e -o pipefail {0}` |
| Windows (auditar, test:scripts, conferir:numeros) | 118974893833 | success | listado em `$I/jobs.json` |
| Testes, tipos e scripts | 118974893692 | success | idem |
| Fluxo ponta a ponta no navegador | 118974893838 | success | idem |
| Aplicativo de campo | 118974893844 | success | idem |
| Linha de base (baseline.mjs) em Linux | 118974893889 | success | idem |
| Dependências (auditar) | 118974893919 | success | idem |
| Ferramentas do roadmap e estado gerado | 118974893942 | success | idem |
| A API sobe contra Postgres real | 118974893974 | success | idem |
| Pacote da demonstração | 118974894032 | success | idem |
| Restore do banco, Postgres 17 | 118974894086 | success | idem |

Artefatos de `plataformas`: 12312139529 (`plataformas-windows-latest-c680f8d...`, 67234 bytes) e 12311539340 (`plataformas-ubuntu-latest-c680f8d...`, 66291 bytes), baixados com token do `git credential` (não impresso nem gravado). `00-contexto.txt` de cada um traz `run: 39524190207 (tentativa 1)` e `sha do run: c680f8dc...`. Logs completos dos dois jobs lidos (2628 e 2870 linhas).

Construção do job `plataformas` (item 5), lida linha a linha:

- Sem `if:` no job: roda em todo push e em pull_request, não só com `[ci completo]`. `strategy.fail-fast: false`, matriz `[windows-latest, ubuntu-latest]`, `timeout-minutes: 45`.
- `defaults.run.shell: bash` liga `-e -o pipefail` (conferido no log: `bash.EXE --noprofile --norc -e -o pipefail {0}`), então `comando | tee arquivo` devolve o código do comando e o passo fica vermelho quando o teste falha. Nenhum `continue-on-error` no job. O único `|| true` do job é `openssl version || true`, informativo, dentro do controle.
- A condição hostil é conferida ANTES do teste e reprova o job se não se montar: `ambiente-hostil.mjs crlf` sai 1 se nenhum arquivo mudou; `conferir-crlf` sai 1 se faltar CRLF, sobrar LF ou a agulha antiga ainda existir; o controle do `openssl` sai 1 se o arquivo existe ou se o `openssl` gerar o certificado; `cache-velho` sai 1 se o cache conhecer rota a mais; o controle do `tsc` exige TS2345; `eol` sai 1 em `i/crlf`, `i/mixed` ou saída vazia.
- O teste prova ter visto a condição: `grep` exige "OPENSSL_CONF aponta para" (bash e PowerShell), "Cache .expo/types desatualizado" e "e o jest concordam", e o `.expo/types` apagado no fim.
- `ci-artefatos.sh redigir` roda com `if: always()` antes do upload; `upload-artifact@v4` com `retention-days: 30`, `overwrite: true`, `if-no-files-found: error`, nome `plataformas-<sistema>-<sha>`. Procurei segredo nos 16 arquivos de cada artefato (token, senha, JWT, Bearer): só aparecem nomes de teste e de arquivo, nenhum valor.
- Os `ci-artefatos.sh contexto` e `redigir` existem e rodaram `success` (passos 5 e 19).

Ataques de mordida que fiz numa cópia do SHA (`git archive 60cbc2f dc360 .gitattributes` em `$I/cp`, com `node_modules` do repositório por link simbólico, nada tocado na árvore):

- Mutante A: `normalizarFimDeLinha` devolvendo o texto cru, árvore convertida por `ambiente-hostil.mjs crlf`. Sem mutante: 20 de 20. Com mutante: `FAIL test/ocorrencia-encerramento.test.ts > A fiação entre a página e as regras > nada grava o encerramento fora do ramo de confirmação`, `1 failed | 12 passed`.
- Mutante B: `ambienteDoOpenssl` sempre devolvendo o ambiente intacto, com `OPENSSL_CONF=/nao/existe/psqlODBC/etc/openssl.cnf`. Sem mutante: 23 de 23 e a linha do motivo. Com mutante: `FAIL test/banco-tls.test.ts`, `Error: Command failed: openssl req ...`, `13 skipped`; o `grep` do job também reprovaria por falta da linha.
- Mutante C: `testar-campo.mjs` sem o `rmSync` do cache velho. `npm run test:campo` sai com código 2 e os dois TS2345 (`perfil.tsx(1224,44)`, `Sino.tsx(154,73)`).

## Cenários positivos

- Os três casos verdes em Windows e em Linux no run do SHA, sob a condição hostil real onde ela existe (autocrlf do Windows, `OPENSSL_CONF` inexistente no ambiente do passo, cache velho no disco), com controles que reprovariam o job se ela não existisse.
- Caso 2 também no Windows PowerShell 5.1, o shell do autor.
- Conferidor de índices de evidência aprovado sobre um checkout feito com `autocrlf=true` em Windows e Linux.

## Cenários negativos

- Os controles do próprio job são cenários negativos executados no CI: `openssl` cru reprova com a variável quebrada (Windows e Linux), `tsc` direto reprova com o cache velho (2 TS2345 nos dois), `i/crlf` ausente.
- Os mutantes A, B e C acima: o job ficaria vermelho se o conserto sumisse.
- `ambiente-hostil.test.mjs` cobre o lado que reprova (`eol` sai 1 com `i/crlf`, com saída vazia, subcomando desconhecido sai 2); está em `test:scripts`, verde no job 118974893692 e no `windows`.

## Tentativas de reprovar

1. Procurei verde sem prova por condição que não se monta: cada condição tem controle que sai 1. Tentei o caso mais frágil, o CRLF: o `eol=lf` vence o `autocrlf` e o checkout sai LF (3757 `w/lf`), então a árvore CRLF é montada por script. O controle confere `Ocorrencia.tsx` inteiro em CRLF e sem a agulha, e o mutante A prova que o teste reprova de verdade nessa árvore.
2. Procurei verde sem teste rodando: `vitest run` sem arquivos sai 1; os logs trazem `Test Files 47 passed`, `23 passed`, `139 suítes`, e `ocorrencia-encerramento.test.ts (13 tests)` nominal nos dois sistemas; o `grep` do motivo impede um ambiente limpo passar por quebrado.
3. Procurei mascaramento: `continue-on-error`, `|| true` e `set +e` no job. Só o `openssl version || true` informativo. Passos com `if: !cancelled()` ficariam vermelhos pelo passo falho, não pulados em silêncio. O único passo `skipped` é o do PowerShell no Linux, por desenho (`runner.os == 'Windows'`), e rodou no Windows.
4. Procurei job que só rode com `[ci completo]`: `plataformas` não tem `if:`; o run 39524190207 tem a mensagem com `[ci completo]`, mas o job não depende dela.
5. Procurei run de outro SHA ou artefato velho: `head_sha` c680f8d no run e em todos os 12 artefatos; diff c680f8d contra 60cbc2f só em registro; `00-contexto.txt` confere run e SHA.
6. Procurei segredo no artefato e no log: nenhum valor.
7. Procurei Windows apenas aparente: `uname MINGW64_NT-10.0-26100`, `Image: windows-2025-vs2026`, caminho `D:/a/city-hall/city-hall/...` e `C:\Program Files\Git\bin\bash.EXE` no log; o PowerShell 5.1 aparece no artefato 09.
8. Procurei se o PowerShell usa o mesmo `openssl` do controle: não usa (Git Bash `/ucrt64/bin/openssl` 3.5.9 contra `C:\Program Files\OpenSSL\bin\openssl.exe` no PowerShell). Registrado como dívida abaixo; o caso `openssl-do-teste > gera o certificado com OPENSSL_CONF apontando para arquivo inexistente` rodou com o `openssl` real no PowerShell e passou.

## Achados

Nenhum achado reprova. Pelo item 1 da seção 19 de 28, nenhum viola critério escrito da DoD, é alcançável por usuário ou atacante externo no produto deste SHA, ou cai na lista "Não admitem RISCO ACEITO" da seção 7. Classificação (todos DÍVIDA, nenhum bloqueia):

1. **DÍVIDA, CRLF sintético.** A árvore CRLF é montada por `ambiente-hostil.mjs crlf` sobre um checkout LF, e não é um clone feito antes do `.gitattributes`. O efeito para o teste é o mesmo (o mutante A morre), e o `eol=lf` impede o checkout de produzir CRLF por conta própria, que é o objetivo da etapa.
2. **DÍVIDA, anotações `##[error]` num job verde.** O controle do Caso 3 roda o `tsc` com cache velho de propósito, e o problem matcher do `tsc` do runner transforma os dois TS2345 esperados em anotações de erro (linhas 685 e 686 do job Linux, 733 e 734 do Windows). Quem olha só as anotações da página vê "erro" num run verde. Ruído, sem efeito no resultado.
3. **DÍVIDA, controle do `openssl` no PowerShell.** O controle cru do Caso 2 roda no Git Bash, e o passo do PowerShell usa o `openssl` que o PATH dele achar (outro binário). Coberto pelo caso `openssl-do-teste` com `openssl` real no PowerShell.
4. **DÍVIDA, contagem do painel não fixada neste job.** 723 de 723 só vale pelo `vitest` sair 0; a contagem exata é fixada pelo job `baseline` (verde, 118974893889), não por este.
5. **DÍVIDA, estimativa do README.** O job levou perto de 4,5 minutos no Windows e 2,7 no Linux, contra "15 a 25" e "perto de 10" escritos no comentário do YAML. Documentação otimista para o lado errado, sem efeito.
6. **DÍVIDA preexistente, `uses:` por tag.** `actions/checkout@v4`, `setup-node@v4` e `upload-artifact@v4` fixados por tag, não por SHA, e o aviso "Node.js 20 is deprecated" nos dois jobs. Vale para todos os jobs do arquivo, não é desta correção.

## Não verificado

- O `npm run verificar` inteiro no Windows (a validação humana do campo da etapa: o CI cobre os três casos e os scripts, não toda a suíte local do autor).
- O item "EOL, Windows e Linux" do G00 marcado (`03-fase-00-estabilizacao.md:790`) e a matriz arquivada: dependem do gatekeeper e da conferência da pasta de evidência; li só o parágrafo do README sobre o que prova Windows.
- O job `plataformas` em `pull_request` (só vi `push`); em `pull_request` o `github.sha` é de merge sintético e o artefato tem o SHA da ponta em `00-contexto.txt` por desenho, não exercitado aqui.
- O conteúdo dos artefatos dos outros 10 jobs e os logs deles: a dimensão aqui é o `plataformas`; confiei na conclusão `success` da API para esses.
- `actionlint` (não instalado) e o comportamento do job com uma imagem de runner diferente da `windows-2025-vs2026` e `ubuntu-26.04` deste run.
- Se um `expo start` real, no Windows, gera um `router.d.ts` igual ao da fixture: o Caso 3 usa a fixture, não o Expo.

## Risco residual

Baixo. O que resta é a diferença entre a árvore CRLF montada por script e um clone histórico real, e a suíte local inteira do Windows que só o Rafael roda. Se o formato do `router.d.ts` do expo-router mudar, a fixture envelhece e o controle do Caso 3 passa a reprovar o job (falha visível, não verde falso).

## Motivo do humano

O campo "Validação humana" da etapa pede que Rafael rode `npm run verificar` no Windows e anexe o resultado. O CI agora prova em `windows-latest` os três casos e os scripts, mas não a suíte local completa do autor; essa parte é dele e deve ficar registrada como pendente no STATUS, sem bloquear esta dimensão.
