---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/e21` e `$R` = `.../scratchpad/val-qa/reg`. macOS arm64, Node 24.15.0 (o `.nvmrc` pede 22), LibreSSL 3.3.6 em `/usr/bin/openssl`. Cópia de `git archive fd17ff4 dc360` em `$V/copia/` com `node_modules` por link simbólico.

A Definition of Done pede os três casos verdes em Windows E Linux. Mac: provados com a condição hostil presente. Linux: o run 39420436042 prova a parte sintética (ver a última linha da tabela). Windows: nada prova. Por isso BLOCKED.

| Critério | Resultado no Mac | Prova |
| --- | --- | --- |
| CRLF: `ocorrencia-encerramento.test.ts` passa com árvore CRLF | PASS: `src/` e `test/` do painel inteiros convertidos para CRLF (116 arquivos), a suíte do painel inteira 699 de 699, código 0 | `$V/01-web-inteiro-crlf.txt` |
| CRLF negativo: o helper não esconde mudança real | PASS: em CRLF, uma chave de fechamento na coluna zero inserida antes do `onEnviar(` de `BlocoEncerramento` (sintaxe válida, a função seguinte abre logo abaixo) reprova exatamente "nada grava o encerramento fora do ramo de confirmação", 1 de 13; arquivo restaurado e verde de novo (20 de 20 com `ler-fonte.test.ts`) | `$V/02-negativo-chave-movida-crlf.txt`, `$V/03-verde-de-volta-crlf.txt` |
| `OPENSSL_CONF` para arquivo inexistente: `banco-tls` 13 de 13 | PASS: `banco-tls.test.ts` 13 e `openssl-do-teste.test.ts` 10, 23 de 23, com o motivo impresso ("aponta para ... que não existe; o openssl do teste roda sem a variável") | `$V/04-openssl-conf-inexistente.txt` |
| `OPENSSL_CONF` válido é respeitado | PASS: o caso "respeita OPENSSL_CONF válido: a extensão que ele pede vai para o certificado" verde; e com um arquivo que EXISTE mas é inválido o teste não o descarta (o próprio Node recusa, código 101) | `$V/04-...`, `$V/05-openssl-conf-existente-invalido.txt` |
| Cache velho do Expo: typecheck do campo com `.expo/types` velho e sem ele | PASS: com o `router.d.ts` sem `/avisos`, `/mapa` e `/perfil`, `tsc --noEmit` direto dá os 2 TS2345 (`perfil.tsx(1224,44)`, `Sino.tsx(154,73)`) e código 2; `npm run test:campo` imprime "Cache .expo/types desatualizado ... apagado" e passa (1997 casos, código 0); sem cache, `test:campo` 0 | `$V/06-tsc-direto-cache-velho.txt`, `$V/07-test-campo-cache-velho.txt`, `$R/05-test-campo.txt` |
| `git ls-files --eol` sem `i/crlf` | PASS: 5585 arquivos, 3390 `i/lf` e 2195 `i/-text`, nenhum `i/crlf` nem `i/mixed`, nenhum `w/crlf` | `$V/08-ls-files-eol.txt` |
| Conferidor de índices como comando (correção 2) | PASS: 36 de 36; a árvore real dá 77 INDEX.md, 3703 arquivos, código 0; 15 ataques próprios abaixo, todos com o código certo; dois mutantes na cópia morrem | `$V/09-...`, `$V/10-...`, `$V/11-ataques-conferidor.txt`, `$V/12-...`, `$V/13-...` |
| Regressão: `test --workspace @dc360/web` e `@dc360/api`, `typecheck`, `test:campo`, `test:scripts`, `test:isolamento` | PASS: `npm test` código 0 (painel 699, API 1685 e 34 pulados, banco 345 e 3 pulados); `test:campo` 0; `test:scripts` 324 de 324; typecheck e isolamento pelo gatekeeper | `$R/06-npm-test.txt`, `$R/03-test-scripts.txt` |
| Os três casos verdes em Linux | PARCIAL: run 39420436042 sobre `55209ab`, todos os 9 jobs `success` (lidos pela API pública, com os passos; o log exige token). O que ele prova: "Testes, tipos e scripts" (118619736871), passos "Suíte completa" e "Testes dos scripts" `success`, onde rodam `ler-fonte.test.ts` (mesma fonte gravada em CRLF e em LF), `openssl-do-teste.test.ts` (inclui o caso que gera certificado com `OPENSSL_CONF` para arquivo inexistente, sem pulo por plataforma), `banco-tls.test.ts` e `testar-campo.test.mjs` (cache velho sintético); "Aplicativo de campo" (118619736571), `test:campo` `success`; "Ferramentas do roadmap e estado gerado" (118619736579), passo "Os INDEX.md da evidência batem com os arquivos (SHA-256)" `success`, no checkout LF limpo. O que NÃO prova: a suíte do painel inteira sobre uma árvore CRLF (o checkout do Linux é LF), o `banco-tls` inteiro com a variável quebrada no ambiente do processo e o `test:campo` com um `.expo/types` velho no disco; e eu não vi os números de testes de nenhum job | `.../scratchpad/val-qa/ci/jobs-e-passos.txt` |
| Os três casos verdes em Windows | **BLOCKED**: sem Windows nesta máquina e sem job de Windows no CI | |

## Evidência

- `npx vitest run` no painel em CRLF: código 0 (`$V/01-web-inteiro-crlf.txt`); negativo: código 1 (`$V/02-...`); de volta: 0 (`$V/03-...`).
- `OPENSSL_CONF=/nao/existe/openssl.cnf npx vitest run test/banco-tls.test.ts test/openssl-do-teste.test.ts`: código 0 (`$V/04-...`).
- Cache: `tsc --noEmit` código 2 (`$V/06-...`); `npm run test:campo` código 0 (`$V/07-...`). O `router.d.ts` original foi guardado em `$V/router.d.ts.backup` e devolvido ao fim (conferido com `cmp`).
- `git ls-files --eol` (`$V/08-...`), conferidor (`$V/09-...` a `$V/13-...`).
- CI: `.../scratchpad/val-qa/ci/jobs.json` (1 pedido à API pública).

## Cenários positivos

- Painel inteiro verde em CRLF; `banco-tls` 13 de 13 com a variável quebrada; `test:campo` limpa o cache velho e passa; conferidor dá 0 na evidência real e numa evidência de mentira em ordem.

## Cenários negativos

| Caso | Esperado | Obtido |
| --- | --- | --- |
| Chave movida, árvore CRLF | o teste do bloco reprova | reprova só ele (1 de 13) |
| `OPENSSL_CONF` existente e inválido | não ser descartado | não é (Node recusa, 101) |
| Cache velho, `tsc` direto | 2 TS2345 | 2 TS2345, código 2 |
| Conferidor: índice adulterado, CRLF no disco com índice do LF, pasta inexistente, pasta vazia, argumento que é arquivo, `INDEX.md` vazio, `INDEX.md` sem tabela | 1 | 1 nos sete |
| Conferidor chamado por link simbólico, com `--preserve-symlinks-main`, com `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`, por caminho com `..`, com argumento relativo, sobre evidência adulterada | 1 | 1 nos cinco |
| Conferidor sem argumento por link com `--preserve-symlinks-main` (a pasta padrão sai do lugar do link) | 1, nunca 0 calado | 1 ("a pasta de evidências não existe", e o git não roda: fail-closed) |
| Mutante `process.exit(0)` sempre (cópia) | testes reprovam | 11 de 36 reprovam |
| Mutante com `realpath` só de um lado (o defeito da revisão) | testes reprovam | os dois casos de `--preserve-symlinks-main` reprovam |

(Na cópia, sem `.git`, um caso que lê o `git ls-files` do repositório real falha também sem mutação; descontado nas duas contagens.)

## Tentativas de reprovar

- Converti o painel INTEIRO para CRLF, não só o arquivo do teste: as outras 45 suítes que leem fonte do disco também passaram.
- Procurei o falso negativo do helper com uma mudança real que continua compilando (a chave fechando a função antes do `onEnviar`): o teste certo reprova.
- Tentei derrubar o certificado com `OPENSSL_CONF` existente e inválido para ver se o teste "conserta" calado: não conserta.
- Montei o cache velho à mão (troquei as três rotas no `router.d.ts` atual), confirmei o TS2345 e só então rodei o `test:campo`.
- Conferidor: 15 invocações hostis (`$V/11-ataques-conferidor.txt`), incluindo os três jeitos de link simbólico e o flag no ambiente, que eram o falso verde da correção 2; nenhuma saiu 0 com evidência errada. Dois mutantes, ambos mortos.
- Procurei pulo por plataforma em `openssl-do-teste`, `banco-tls`, `ler-fonte` e `testar-campo.test.mjs` (nenhum; só os dois casos de link do conferidor pulam com `EPERM` no Windows sem privilégio), para saber o que o job do Linux de fato executou.

## Achados

- Nenhum defeito do produto achado.
- **Anotado.** No Windows sem privilégio para criar link simbólico, os dois casos de `--preserve-symlinks-main` do conferidor se declaram pulados: lá o falso verde da correção 2 não fica preso por teste. Também não verifiquei se, no Windows, `realpathSync` dos dois lados devolve a mesma grafia de unidade (`C:` contra `c:`) quando o diretório corrente vem digitado em minúscula.
- **Anotado.** 2195 arquivos aparecem como `i/-text` (binário pela detecção ou pela lista do `.gitattributes`); não conferi um a um se algum texto foi classificado como binário por engano.

## Não verificado

- Windows (Git Bash e PowerShell): os três casos, o `npm run verificar` e o conferidor. É o que bloqueia.
- Os logs e artefatos do run 39420436042 (exigem token): sei que os jobs e passos deram `success`, não quantos testes rodaram nem se algum pulou no Linux.
- Linux com a condição hostil real (árvore CRLF, variável quebrada no ambiente, cache velho no disco); só a parte sintética roda no CI.
- `git add --renormalize .`: não rodei, nem numa cópia do índice, para não gravar objeto no `.git`; usei `git ls-files --eol`.
- Node 22 (rodei 24).

## Risco residual

Os três consertos são portáteis na leitura e provados no Mac com a condição hostil; no Linux, a parte sintética passou. O risco que sobra é exatamente o que a etapa existe para impedir: um comportamento de Windows (caminho, `cmd.exe`, link simbólico, grafia de unidade) que nenhum ambiente provou.

## Motivo do humano

A validação humana da etapa é o Rafael rodar `npm run verificar` no Windows e anexar o resultado; esta máquina não tem Windows e o CI não tem job de Windows. A alternativa é um job de Windows no CI (fora do escopo da etapa, F01-E02).
