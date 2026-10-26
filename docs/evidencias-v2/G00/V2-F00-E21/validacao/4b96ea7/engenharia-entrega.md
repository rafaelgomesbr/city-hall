---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E21
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- `.gitattributes` em vigor e índice sem CRLF: PASS. A raiz traz `* text=auto eol=lf`, `*.ps1`, `*.bat` e `*.cmd` em CRLF e 28 extensões marcadas `binary`. `git ls-files --eol` (`scratchpad/eng/out/e21-eol.txt`): `i/crlf` 0, `i/mixed` 0; os 407 arquivos `i/-text` são todos binários (388 png, 5 woff, 5 ttf, 3 pdf, 2 jpg, wav, ico, docx e um `.txt` de saída bruta com CR solto, preservado byte a byte).
- Renormalização não altera nada: PASS. `git add --renormalize .` num índice copiado (`GIT_INDEX_FILE`) e `git diff --cached HEAD` ficou vazio para os arquivos rastreados.
- Caso 1, `ocorrencia-encerramento.test.ts` com árvore CRLF e LF: PASS. Local (árvore `w/crlf`, `attr/text=auto eol=lf`): 13 de 13 e `ler-fonte.test.ts` 7 de 7 (`out/e21-web-encerramento.txt`). Linux (CI, árvore LF): `ocorrencia-encerramento.test.ts (13 tests)` no job `produto`, success.
- Caso 2, `banco-tls.test.ts` 13 de 13 com `OPENSSL_CONF` apontando para arquivo inexistente: PASS. Rodei `OPENSSL_CONF=C:/nao/existe/openssl.cnf npx vitest run test/banco-tls.test.ts test/openssl-do-teste.test.ts` em `apps/api`: 23 de 23 e a linha "banco-tls: OPENSSL_CONF aponta para ..., que não existe; o openssl do teste roda sem a variável" (`out/e21-banco-tls-openssl-conf-inexistente.txt`; esses testes sobem um servidor TLS falso local, não usam o Postgres compartilhado). Linux (CI): `banco-tls (13 tests)` e `openssl-do-teste (10 tests)` success.
- Caso 3, typecheck do campo com `.expo/types` velho: PASS por teste unitário rodado no CI e local (`testar-campo.test.mjs`: "cache velho que não conhece as rotas novas é apagado, e diz quais faltam", "cache em dia fica", "o test:campo limpa o cache ANTES do typecheck", "as rotas reais ... o cache de 2026-08-27 seria apagado por elas"). Parte de `test:scripts` 243 de 243. Não toquei em `testar-campo.mjs` nem em `apps/campo`.

## Evidência

Run 38445527075 (sobre `c9895e9`, success, 9 de 9; `git diff 4b96ea7..c9895e9` só toca `ROTEIRO-G00.md`, `ESTADO-ATUAL.md` e `STATUS.md`). Job "Testes, tipos e scripts" (115462783339), artefato `produto-c9895e9...`: `03-typecheck.txt`, `05-suite-completa.txt`, `06-test-scripts.txt` (243, 0 falhas). Job "Aplicativo de campo" (115462784120) success, com o typecheck estrito. O Linux do CI prova a metade LF dos três casos; a metade Windows (CRLF, `OPENSSL_CONF` quebrado) é minha, local.

## Cenários positivos

Os três casos verdes em Windows (local) e Linux (CI). `OPENSSL_CONF` válido é respeitado: `openssl-do-teste.test.ts` cobre ("variável que aponta para arquivo existente é respeitada", via função `existe` injetada).

## Cenários negativos

- Sem o conserto o openssl falha: `OPENSSL_CONF=C:/nao/existe/openssl.cnf openssl req -x509 ...` saiu 1 com `Can't open "C:/nao/existe/openssl.cnf" for reading` (`out/e21-openssl-sem-o-conserto.txt`), exatamente a causa descrita no bloco. Com o conserto, a mesma variável passa (acima).
- `blocoDaFuncao` lança em vez de devolver o resto do arquivo quando a chave de fechamento não está na coluna zero (`ler-fonte.ts`), e `ler-fonte.test.ts` cobre; função com a chave movida continua reprovando o teste de encerramento.
- Sem `openssl` em lugar nenhum a suíte reprova com a frase que diz o que instalar (não pula).

## Tentativas de reprovar

1. Procurei binário que o `eol=lf` pudesse corromper: cruzei a lista de `i/-text` com `attr`; nenhum binário fora de `binary`/`-text`; a detecção `text=auto` acerta o `.txt` com CR solto.
2. Procurei arquivo com CRLF dentro do índice (o hash de evidência mudaria): zero `i/crlf`.
3. Procurei outros testes do painel que leiam fonte e dependam de `\n` (35 arquivos têm `readFileSync`, só 2 usam `ler-fonte`): rodam verdes na árvore CRLF local (painel 649, saída do gatekeeper) e na LF do CI.
4. Procurei a variável escrita em minúsculas ou duplicada no Windows: `ambienteDoOpenssl` compara sem caixa.
5. Procurei documentação da matriz plataforma x comando: existe em `README.md:1097-1130`, mas a coluna Linux diz "não provado nesta máquina" em todas as linhas, enquanto o CI já prova (achado 1).

## Achados

1. Anotado, corrige antes de crescer (documental): a matriz do README ainda marca Linux como "não provado" para `typecheck`, `npm test`, `test:api`, web, `test:campo`, `test:scripts` e `test:isolamento`. O run 38445527075 prova Linux para todas. Não é erro de produto (o texto subestima), mas o DoD pede "matriz arquivada" e o gatekeeper deve citar o run no lugar da coluna.
2. Anotado: a prova do caso 2 só existe em Windows para o `OPENSSL_CONF` quebrado; no Linux o CI não tem a variável quebrada, então prova o caminho normal, e o desvio fica coberto pelo teste unitário com `existe` injetado.

## Não verificado

macOS. O typecheck do campo ponta a ponta com um `router.d.ts` velho de verdade (mexeria em `apps/campo`, vedado nesta rodada); vale o teste unitário que usa as rotas reais do disco. PowerShell (a variante que o bloco menciona): não rodei, o Git Bash foi o shell.

## Risco residual

Baixo: configuração de ambiente. Árvore clonada antes do `.gitattributes` continua CRLF até renormalizar; os testes do painel que leem fonte já toleram.

## Motivo do humano

Não aplicável (o run do CI é o "run em Linux" que o bloco pede a Rafael).
