---
validador: qa
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
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| `.gitattributes` em vigor (`* text=auto eol=lf`, `.ps1` CRLF, binários marcados) | PASS | `.gitattributes` na raiz lido; `qa-infra/60-eol.txt` (`git ls-files --eol`, 2256 arquivos): `i/crlf` = 0, `i/mixed` = 0; os `*.ps1` saem `attr/text eol=crlf` |
| `git ls-files --eol` não mostra nenhum `i/crlf` | PASS | 0 ocorrências (acima) |
| `ocorrencia-encerramento.test.ts` passa com árvore CRLF | PASS | Esta máquina é a prova: 720 arquivos `i/lf w/crlf` e 29 `w/mixed`, com `core.autocrlf=true`; o painel fecha 649 de 649 na saída do gatekeeper (`scratchpad/baseline/07-teste-web.txt`) |
| O helper não esconde mudança real | PASS | `qa-infra/sonda-ler-fonte.mjs` (`64-sonda-ler-fonte.txt`): CRLF e LF recortam a mesma função; chave de fechamento removida lança "não fecha com uma chave na coluna zero"; assinatura inexistente lança; CR solto é preservado (não vira fim de linha) |
| `banco-tls.test.ts` 13 de 13 com `OPENSSL_CONF` apontando para arquivo inexistente | PASS | A variável herdada desta máquina aponta para `C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf`, que não existe. Saída do gatekeeper (`baseline/05-teste-api.txt:512-515`): o teste avisa em stderr e passa `test/banco-tls.test.ts (13 tests)`. Sonda minha abaixo |
| Com `OPENSSL_CONF` válido o teste o respeita | PASS | Sonda caso 4 e caso 5 abaixo; e no gatekeeper "respeita OPENSSL_CONF válido: a extensão que ele pede vai para o certificado" |
| `testar-campo.mjs` apaga `.expo/types` velho antes do typecheck | PASS | `node --test scripts/testar-campo.test.mjs`: 28 de 28 (`62-testar-campo-test.txt`); sonda com o disco real abaixo |
| Typecheck do campo com 0 erros com cache velho presente | PASS (por evidência do implementador, não repetida) | `docs/evidencias-v2/G00/V2-F00-E21/saidas/06` e `07`: com o `router.d.ts` de 2026-08-27 dois TS2345 (código 2); `test:campo` apaga o cache dizendo `/avisos, /mapa, /perfil` e o typecheck passa |

## Evidência

`60-eol.txt`, `61-sonda-openssl.txt`, `63-sonda-cache-expo.txt`, `64-sonda-ler-fonte.txt`, `62-testar-campo-test.txt`.

## Cenários positivos

Sonda do gerador de certificado (`apps/api/test/openssl-do-teste.ts`, via `node --experimental-strip-types`), com o `openssl` de verdade e a `OPENSSL_CONF` quebrada desta máquina:

- ambiente herdado: gera o certificado e devolve o motivo ("aponta para ... que não existe; o openssl do teste roda sem a variável");
- variável ausente: gera, sem motivo; variável vazia: gera; `openssl_conf` em minúsculas e inexistente: gera, com motivo;
- arquivo válido: gera e respeita (certificado de 1100 bytes contra 1170 sem a configuração: a configuração entrou);
- o `process.env` do processo não é alterado.

Cache de rotas (`63-sonda-cache-expo.txt`): com as rotas reais de `apps/campo/src/app` e o `router.d.ts` presente desta máquina, `manter`; sem cache, `nada`; sem qualquer uma das rotas, `apagar` com a rota nomeada; cache simulado de 2026-08-27 (sem `/mapa`, `/perfil`, `/avisos`), `apagar` com as três nomeadas; cache só com comentário, `apagar`.

## Cenários negativos

- `OPENSSL_CONF` existente porém corrompido (caso 5): o gerador respeita e falha (`openssl req` sai com erro); não mascara.
- `openssl` fora do PATH e fora da pasta do `git` (caso 8): lança "o openssl não está no PATH (nem ao lado do git, no Windows): instale-o" e a suíte reprova em vez de pular.
- Helper de fonte: chave de fechamento ausente lança em vez de devolver o resto do arquivo.

## Tentativas de reprovar

1. Procurei `i/crlf` e `i/mixed` no índice: nenhum. Os 407 `i/-text` são binários marcados ou detectados; o único arquivo de texto que o git guarda como `-text` é uma saída bruta de evidência (`docs/evidencias-v2/G00/V2-F00-E05/saidas/07-web-depois.txt`, CR solto), o que preserva o SHA-256 byte a byte.
2. Procurei teste do painel que leia fonte e dependa de `\n` além de `ocorrencia-encerramento`: entre os arquivos de teste do painel que usam `readFileSync`, só ele usa `ler-fonte`; os demais passam na árvore CRLF desta máquina (649 de 649), então não dependem do fim de linha.
3. `OPENSSL_CONF` com a chave em caixa diferente, vazia, ausente, válida, corrompida: coberto pela sonda (todos se comportam como a política diz).
4. Rota "/" no cache de rotas: a conferência procura a rota seguida de crase; para a raiz `/` isso casa qualquer literal terminado em `/` e pode dar "em dia" por engano. Sem efeito hoje (`manter` com cache em dia; `apagar` quando falta rota nomeada) e não consegui construir um cache velho que a engane com as rotas atuais.
5. Não toquei em `apps/campo/.expo` (fora da minha lista de mutação); a sonda lê o cache real sem escrever.

## Achados

1. Anotado (documental): a matriz do `dc360/README.md` (seção "Plataformas e o que depende da máquina") ainda diz "não provado nesta máquina" para a coluna Linux. O CI do run 38445527075 já roda `typecheck`, `test:scripts`, API, painel, `test:campo` e o isolamento em Linux, todos verdes; a matriz deveria apontar o run. Não é defeito de código.
2. Anotado: a conferência do cache de rotas para a rota raiz é fraca (item 4).

## Não verificado

- `banco-tls.test.ts` e o painel não foram rodados por mim (restrição de paralelismo); usei a saída do gatekeeper e a sonda do gerador.
- Cache `.expo/types` velho de verdade com `tsc` (não pude escrever em `apps/campo/.expo`): evidência do implementador e testes de unidade com as rotas reais do disco.
- PowerShell e macOS.

## Risco residual

Árvore clonada antes do `.gitattributes` fica CRLF até alguém renormalizar; os testes não dependem mais disso. `OPENSSL_CONF` válido porém defeituoso continua quebrando a suíte (de propósito).

## Motivo do humano

Não aplicável.
