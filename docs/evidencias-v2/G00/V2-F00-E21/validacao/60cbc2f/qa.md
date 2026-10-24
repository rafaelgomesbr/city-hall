---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E21
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$Q` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/qa-E21`. Mac arm64, Node 24.15.0 (CI em Node 22). O HEAD só difere de `60cbc2f` em arquivos de registro (`git diff --stat 60cbc2f..HEAD`: `ESTADO-ATUAL.md`, `STATUS.md` e um `qa.md` de outra etapa); o run 39524190207 foi sobre `c680f8d`, que difere de `60cbc2f` só em `ESTADO-ATUAL.md` e `STATUS.md` (`git diff --stat 60cbc2f c680f8d`). Código e workflow do run são, portanto, os do SHA validado. `git diff --quiet 60cbc2f -- dc360` na árvore de trabalho: igual.

Motivo do BLOCKED da rodada 7 (`validacao/fd17ff4/qa.md`): a DoD pede "três casos verdes em Windows e Linux", o Windows não tinha job nem execução, e o Linux provava só a parte sintética. A pergunta desta rodada: os jobs do CI deste SHA provam os três casos sob a condição hostil REAL nos dois sistemas?

| Critério da DoD / dos testes | Resultado | Prova |
| --- | --- | --- |
| Caso 1 em Windows: `ocorrencia-encerramento.test.ts` e o painel inteiro sobre árvore realmente em CRLF | PASS. Job 118974894002 (windows-latest, imagem `windows-2025-vs2026`): checkout com `core.autocrlf=true` (linhas `file:C:/Program Files/Git/etc/gitconfig true` e `file:C:/Users/runneradmin/.gitconfig true`), 121 arquivos de `apps/web/src` e `apps/web/test` gravados em CRLF, controle `Ocorrencia.tsx: 2484 linhas CRLF, 0 LF sozinho, agulha antiga presente: não` e `ocorrencia-encerramento.test.ts: 177 linhas CRLF, 0 LF sozinho`; depois `ocorrencia-encerramento.test.ts (13 tests)` verde, 47 arquivos e 723 de 723 | `$Q/logs/118974894002.log` linhas 266 a 276, 500, 597 e 598 |
| Caso 1 em Linux (mesmo roteiro) | PASS. Job 118974893948 (ubuntu-26.04): mesmos 121 arquivos CRLF, mesmos controles, 47 arquivos e 723 de 723 | `$Q/logs/118974893948.log` linhas 267 a 269, 589 e 590 |
| Caso 2 em Windows com `OPENSSL_CONF` realmente quebrado | PASS. Controle: `OPENSSL_CONF=C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf`, o `openssl` cru (OpenSSL 3.5.9 do Git Bash) reprova com `Can't open ... No such file or directory` e o job só segue porque reprovou. Depois, no bash e no Windows PowerShell 5.1 (`PowerShell 5.1.26100.33438 (Desktop)`, `existe: False`, `openssl` do PATH do PowerShell em `C:\Program Files\OpenSSL\bin\openssl.exe`, binário diferente do do bash), `banco-tls` 13 e `openssl-do-teste` 10, 23 de 23, com a linha `banco-tls: OPENSSL_CONF aponta para "...", que não existe; o openssl do teste roda sem a variável.` (a prova de que o teste viu a variável) e `codigo=0` | `$Q/logs/118974894002.log` linhas 602 a 686 |
| Caso 2 em Linux | PASS. Controle: `Can't open "/nao/existe/psqlODBC/etc/openssl.cnf"` (OpenSSL 3.5.5); `banco-tls` 13 e `openssl-do-teste` 10, 23 de 23, com a mesma linha do motivo | `$Q/logs/118974893948.log` linhas 613 a 639 |
| Caso 3 em Windows e em Linux com `.expo/types` realmente velho | PASS nos dois. `ambiente-hostil.mjs cache-velho` grava a fixture e confere `rotas ausentes nele: /avisos, /mapa, /perfil`; `tsc -p tsconfig.json --noEmit` direto reprova com 2 `error TS2345` (`perfil.tsx(1224,44)` e `Sino.tsx(154,73)`, os dois erros que a etapa descreve); `npm run test:campo` imprime `Cache .expo/types desatualizado ... apagado` e fecha `139 suítes, 1997 de 1997` e `A leitura do código e o jest concordam: 1997 casos`; o job ainda confere que `apps/campo/.expo/types` sumiu; `npm run typecheck` sem cache passa | Windows: linhas 718 a 760, 2770 a 2812; Linux: linhas 683 a 701, 2561 a 2570 |
| `.gitattributes` em vigor e `git ls-files --eol` sem `i/crlf` | PASS. Nos dois sistemas, com `autocrlf=true` no checkout: 7521 arquivos, `i/lf 3759`, `i/-text 3762`, `w/crlf 2` (os dois `.ps1`, que pedem `eol=crlf`), `Nenhum i/crlf nem i/mixed`. Localmente `git ls-files --eol`: 3760 `i/lf`, 3762 `i/-text`, 0 `i/crlf` | logs, linhas 207 a 213 (Linux) e 35 a 40 e 206 a 220 (Windows) |
| Índices de evidência no checkout hostil | PASS nos dois: `89 INDEX.md, 4793 arquivo(s) conferido(s) byte a byte. RESULTADO: OK` | idem |
| Negativo da DoD: o helper não esconde mudança real; com `OPENSSL_CONF` válido o teste o respeita | PASS (testes ligados verdes nos dois sistemas: `ler-fonte.test.ts` dentro dos 723 e `openssl-do-teste.test.ts` dentro dos 23; mutações abaixo) | seções seguintes |
| Regressão obrigatória | PASS pelo CI: 12 de 12 jobs `success` no run 39524190207 (lido pela API pública, `$Q/jobs.json`); "Testes, tipos e scripts" (118974893692) com painel 723, API 1717 (34 pulados), banco 345 (3 pulados) e o `ambiente-hostil.test.mjs` rodando (`ok 12 - a fixture do cache velho...` e `ok 13 - como comando, eol ...`); job "Windows (auditar, test:scripts e conferir:numeros)" (118974893833) com o mesmo teste verde em Windows | `$Q/logs/118974893692.log`, `$Q/logs/118974893833.log` |
| Artefatos publicados | PASS: `plataformas-windows-latest-c680f8d...` (67234 bytes) e `plataformas-ubuntu-latest-c680f8d...` (66291 bytes), não expirados | API de artefatos do run |

## Evidência

- Logs completos dos dois jobs de plataforma e dos dois jobs de scripts, baixados com o `gh` (token lido do credential helper em variável de ambiente, nunca impresso nem gravado), sem códigos de escape, em `$Q/logs/`. Lista de jobs e passos em `$Q/jobs.json`.
- Cópia do SHA: `git archive 60cbc2f dc360 .gitattributes .github` em `$Q/copia/`, com `node_modules`, `dist` e `node_modules` dos workspaces por link simbólico para a árvore real. Cada mutante em cópia própria (`$Q/m1`, `m2`, `m3`, `m4`, `m5`, `m6`); a árvore real do repositório não foi tocada.
- Saídas dos mutantes: `$Q/m2.txt`, `$Q/m2-base.txt`, `$Q/m3-tsc.txt`, `$Q/m3-test-campo.txt`, `$Q/m4/saida-com.txt`, `$Q/m4/saida-sem.txt`.
- Baseline local de `node --test scripts/ambiente-hostil.test.mjs` na cópia: 8 de 8.

## Cenários positivos

- Windows: casos 1, 2 (bash e PowerShell 5.1) e 3 verdes com a condição hostil reproduzida e conferida antes, passo a passo, no log.
- Linux: os mesmos três casos, verdes, com a condição hostil reproduzida e conferida.
- Baseline local do painel inteiro em CRLF na cópia (`$Q/m0`): 47 arquivos, 723 de 723.
- Baseline local de `banco-tls` e `openssl-do-teste` com `OPENSSL_CONF=/nao/existe/psqlODBC/etc/openssl.cnf`: 23 de 23 e a linha do motivo impressa (`$Q/m2-base.txt`).

## Cenários negativos

Todos feitos por mim numa cópia de `60cbc2f`, rodando o `ambiente-hostil.mjs` e os testes ligados (os mesmos comandos dos passos do job) com o conserto da E21 desfeito:

| Mutação (conserto desfeito) | Esperado | Obtido |
| --- | --- | --- |
| M1: `normalizarFimDeLinha` devolve o texto cru (`return texto;`), árvore montada por `ambiente-hostil.mjs crlf` | Caso 1 vermelho | `crlf` sai 0, os dois `conferir-crlf` saem 0 (a condição se reproduz) e `vitest run` do painel reprova: 3 arquivos e 11 casos vermelhos, entre eles `ocorrencia-encerramento.test.ts > nada grava o encerramento fora do ramo de confirmação`, três de `ler-fonte.test.ts` e cinco de `correcao-6-da-e09.test.ts`. O passo do job (`npm run test --workspace @dc360/web`) sairia 1 |
| M2: `ambienteDoOpenssl` devolve sempre o ambiente intacto, com `OPENSSL_CONF` inexistente | Caso 2 vermelho | `banco-tls.test.ts` falha de carga (`beforeAll`), 13 pulados, mais 3 casos de `openssl-do-teste.test.ts` vermelhos; saída 1. Sem a mutação, saída 0 e 23 de 23 |
| M3: `testar-campo.mjs` sem a limpeza do cache (`if (false)`), com o cache velho gravado | Caso 3 vermelho | `tsc` direto: código 2 com 2 TS2345; `npm run test:campo` sai 2 (`FALHOU: npm run typecheck --prefix apps/campo saiu com 2`), sem a frase `Cache .expo/types desatualizado`, então o `grep` do job também reprovaria |
| M4: `.gitattributes` removido do repositório e clone com `core.autocrlf=true` (git real, `GIT_CONFIG_GLOBAL` próprio) | passo `git ls-files --eol` vermelho | com `.gitattributes`: 88 arquivos `i/lf` e `w/lf`, saída 0; sem ele: 87 arquivos `w/crlf`, saída 1 com `FALHA: 87 arquivo(s) fora da regra` |
| M5: `paraCrlf` identidade (o montador deixa de montar CRLF) | controle vermelho, nunca verde calado | `ambiente-hostil.mjs crlf` sai 1 (`nenhum arquivo mudou`) |
| M6: fixture do cache "velho" trocada pelo `router.d.ts` atual (que conhece as três rotas) | controle vermelho | `cache-velho` sai 1: `CONDIÇÃO HOSTIL NÃO REPRODUZIDA: o cache gravado conhece rota que o cache velho não conhecia` |
| `conferir-crlf` sobre arquivo que está em LF | vermelho | sai 1 (`0 linhas CRLF, 177 LF sozinho`) |

## Tentativas de reprovar

- Procurei o job "sintético": o checkout dos dois sistemas é LF (o `eol=lf` do `.gitattributes` vence o `autocrlf=true`, e o log mostra `w/lf 3757`). A árvore CRLF, portanto, não vem do git, vem do `ambiente-hostil.mjs crlf`, que grava os bytes no disco e confere por contagem de `\r\n` e de `\n` solto no arquivo exato da etapa. Para o que o teste lê (bytes do disco) isso é a mesma condição. Para fechar a dúvida de que o `.gitattributes` é mesmo o que decide o fim de linha, fiz M4 com git de verdade: sem o arquivo o checkout sai CRLF e o passo `eol` do job reprovaria. Conclusão: os dois lados da condição estão presos, um pelo passo `eol` (efeito do git) e outro pelo montador (efeito sobre o teste). Classifiquei como observação, não como defeito (ver Achados).
- Procurei o Windows de faz de conta: o log do job mostra `D:/a/city-hall/city-hall/dc360/apps/web`, `C:\Program Files\Git\bin\bash.EXE`, `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE`, PowerShell 5.1 Desktop, caminho `C:\Program Files\...\openssl.cnf` com `existe: False`. É Windows de verdade.
- Procurei teste pulado por plataforma nos três casos: nos logs, `Test Files 2 passed (2)`, `Tests 23 passed (23)` (sem `skipped`), jest `1997 passed, 1997 total` e `139 passed`. O único pulo do passo `PowerShell` é no Linux, por desenho (`runner.os == 'Windows'`), e no Windows ele rodou (`success`).
- Procurei o verde calado do caso 2 (variável não vista): o job faz `grep` da linha `OPENSSL_CONF aponta para`, que aparece nos dois sistemas e no PowerShell; a mutação M2 mostra que sem o conserto o caso fica vermelho, não verde.
- Procurei o controle que reprova pelo motivo errado (`MSYS_NO_PATHCONV`): o log do Windows mostra o erro certo (`Can't open "C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf"`), não um erro de `-subj`.
- Procurei diferença entre o SHA validado e o do run: só registro (`ESTADO-ATUAL.md`, `STATUS.md`).
- Tentei achar `i/crlf` ou `i/mixed` no índice real: nenhum.
- Tentei desarmar o montador de três jeitos (M5, M6 e `conferir-crlf` em LF): nenhum devolve 0 quando a condição não se reproduz.

## Achados

Classificação pela regra do item 1 da D-31 (reprova só se viola critério escrito da DoD, é alcançável por usuário ou atacante externo no produto deste SHA, ou cai na lista da seção 7 de `28`). Nenhum achado reprova.

1. **Dívida, não reprova.** O CRLF do caso 1 é montado por script em `apps/web/src` e `apps/web/test` (extensões `.ts .tsx .js .mjs .css .json .html .md`), não produzido pelo git. Os bytes que o teste lê são os mesmos; testes de outros workspaces que leiam fonte com CRLF não são cobertos por este job. Não viola a DoD (que pede os três casos da etapa, todos do painel, da API e do campo) e não é alcançável por usuário. Sugestão para F01-E02: opcionalmente um job que remova o `.gitattributes` e refaça o checkout para obter o CRLF direto do git.
2. **Dívida, não reprova.** O `openssl` do PowerShell 5.1 (`C:\Program Files\OpenSSL\bin\openssl.exe`) não é o do Git Bash (`/ucrt64/bin/openssl`); o job registra os dois e os dois passam. Se o runner mudar o conteúdo do PATH, o passo continua válido, mas o binário testado pode mudar.
3. **Observação.** A validação humana da etapa ("Rafael roda `npm run verificar` no Windows") continua pendente; o README já diz que ela segue sendo validação humana. Pela regra de 2026-10-05 isso não bloqueia.
4. **Observação.** O item "EOL, Windows e Linux" do G00 só é marcado pelo gate, não por esta dimensão.
5. Nenhum defeito de produto encontrado.

## Não verificado

- Os mutantes M1 a M6 rodaram no Mac (Node 24, LibreSSL), não em Windows nem no Linux do runner; que o conserto desfeito deixaria o job vermelho em Windows é inferência (mesmo código e mesmos comandos, e os logs de CI mostram os controles e os testes ligados rodando lá), não execução.
- Não reexecutei o job no CI (não era permitido disparar workflow) nem baixei e abri os artefatos `plataformas-*`; li os logs dos jobs.
- `npm run verificar` no Windows (validação humana da etapa) e `npm run test:isolamento`, `typecheck` e `test --workspace @dc360/api` completos por mim: li os jobs do CI (12 de 12 verdes), não repeti na minha máquina.
- `actionlint` não rodou; a validade do YAML está provada pelo próprio run (os dois jobs executaram todos os passos).
- Node 22 localmente (o CI usa 22 e passou; eu usei 24).
- `git add --renormalize .`: não rodei (não gravar objeto no `.git`).
- O que acontece num Windows com outra versão do PowerShell ou com o driver ODBC realmente instalado.

## Risco residual

Baixo. Os três casos têm agora prova de CI nos dois sistemas com a condição hostil reproduzida e conferida antes do teste, e as mutações que desfazem os três consertos e o `.gitattributes` deixam os respectivos passos vermelhos. O que resta é a diferença entre "CRLF montado por script" e "CRLF produzido pelo git" (observação 1), e um Windows específico do autor (driver ODBC real, PATH pessoal) que só a validação humana cobre.

## Motivo do humano

A etapa prevê "Rafael roda `npm run verificar` no Windows e anexa o resultado". Isso é pendência humana registrada, não bloqueio (regra de execução de 2026-10-05), e o BLOCKED da rodada 7 deixa de existir porque o Windows agora tem job e execução no CI. Vale também uma decisão do Rafael: encerrar o rascunho de `RISCO-ACEITO.md`, que fica sem objeto (não precisa ser assinado) se o gatekeeper aceitar este PASS.
