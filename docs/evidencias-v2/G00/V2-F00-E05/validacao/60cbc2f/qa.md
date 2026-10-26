---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d58876f3-caca-41b6-b4e2-8dffc49cbe6b/scratchpad/r8/qa-V2-F00-E05`. Código lido da árvore principal (igual ao SHA `60cbc2f`; HEAD `c680f8d` só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Toda sonda e mutação rodou numa cópia do SHA (`git archive 60cbc2f`) em `SCRATCH/copia*`, com Node 22.23.3 (o do `.nvmrc` e do CI, baixado para `SCRATCH/node22`) e Node 24.15.0.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Rodada 7, achado 1: 403 fora do catálogo no fio pela API pública do Fastify com `content-length` menor que o corpo (stream, `Response`, `ReadableStream`), dessincronizando a conexão | Sonda minha, escrita do zero (64 variantes), pipeline por socket TCP cru, API e console, modos "falhar" e "corrigir", Node 22 e 24: 0 escaparam e 0 dessincronizaram, processo de pé (`11-sonda-sha-node22-*.txt`, `10-sonda-sha-node24-*.txt`, `15`, `16`). Controle: a mesma sonda contra a guarda de `fd17ff4` escapa e dessincroniza em 12 variantes e derruba o processo no trailer (`12-controle-fd17ff4-node22-api.txt`) | PASS |
| Rodada 7, achado 2: `reply.trailer` com código fora do catálogo derrubava o processo | variante `fora-trailer` (e `addTrailers`): 500 em "falhar" e 403 genérico em "corrigir", processo de pé, sem `uncaughtException` (sonda sem tratador) | PASS |
| Rodada 7, anotado: 1xx como resposta final (`code(103)`, `code(199)`) | `code-103` e `code-199`: desvio, 500, pedido seguinte sincronizado | PASS |
| Os três códigos emitidos e testados; catálogo no shared; teste compara catálogo com o servidor | CI job 118974893692 (Node 22): `codigos-de-erro.test.ts` 15 (shared) e 229 (API), `prova-dinamica-dos-codigos-de-erro` 1, guarda 140 (API) e 48 (console); local: `codigos-de-erro` + `vigencia-na-escrita` + `senha-provisoria` 251 de 251 e shared 223 de 223 em Node 22 (`21`, `22`) | PASS |
| Teste negativo da etapa: código fora do catálogo reprova | varredura + guarda em modo "falhar" (desvio vira 500 e reprova o caso); mordida abaixo | PASS |
| `/auth/entrar` com conta desativada: mesma recusa da senha errada | `codigos-de-erro.test.ts` linha 492 ("resistência a enumeração"): status 401, `erro: credenciais`, mensagem idêntica nos três casos, corpo sem "desativ". Rodado local (251 de 251, `21`) | PASS |
| Isolamento: conta desativada de A escrevendo em ocorrência de B não confirma nada; 404 de outro município não muda | `codigos-de-erro.test.ts` linhas 507 a 534: corpo idêntico para B, própria e inexistente; conta ativa de B em ocorrência de A segue 404 (escrita e leitura), `erro` diferente de `sem_permissao`. Rodado local | PASS |
| E2E: desativar e ver a frase certa na entrada | CI job 118974893838: seção 23, "conta desativada leva a tela de entrada", "e diz que a conta foi desativada", "token vencido + conta desativada leva a tela de entrada", "a entrada continua com a recusa generica"; Chromium 70 de 70 sem falha | PASS |
| Regressão obrigatória | CI 12 de 12 jobs success; jobs lidos: 118974893692 (106 arquivos da API, 0 falhas, scripts `# fail 0`, "números do README batem"), 118974893974 (Postgres real, 53 de 53 na corrida de renovação), 118974893838, 118974893833 (Windows). Gatekeeper já fez typecheck, `test:isolamento` 345 e `conferir:numeros` | PASS |
| README (seção da API) e cabeçalho de `codigos-de-erro.ts` dizem só o que a guarda garante | Leitura de README 146 a 320 e do cabeçalho do shared: a moldura do corpo, o 1xx, as Early Hints, Node 22 e 24 e "o proxy da borda não foi medido" agora estão dito e batem com as sondas. A lista "O que a guarda NÃO vê" está certa para socket, `.call` e primitivas trocadas antes da carga. NÃO diz o modelo de ameaça (erro de programação, não código hostil) nem cita a DV-01 | PASS com ressalva (achado 1, dívida) |
| Validação humana (três frases) e leitor de tela | fora do meu alcance | pendente humano |

## Evidência

- CI: `gh run view 39524190207 --log --job <id>` para 118974893692, 118974893974, 118974893838 e 118974893833, salvos em `SCRATCH/job-<id>.log`. Contagens do job de testes em Node 22.23.3 (linha `node: v22.23.3`): guarda da API 140 testes, guarda do console 48, catálogo da API 229, catálogo do shared 15, prova dinâmica 1. Nenhuma linha "failed" real (as buscas por "fail" só acham `pipefail`).
- Sondas: `SCRATCH/sondas/comum.ts`, `sonda-api.ts`, `sonda-console.ts` (copiadas para `apps/api` e `apps/console` da CÓPIA, rodadas com `tsx` e apagadas por `rodar.sh`/`rodar22.sh`). Saídas `10` (Node 24, 46 variantes), `11` (Node 22), `15` e `16` (Node 22 e 24, 64 variantes), todas com `exit=0` e "0 escaparam, 0 dessincronizaram".
- Conforto de uso legítimo (`13-legit-node22.txt`, API real, Node 22): stream de 5 MB sem `content-length` 200 com 5242880 bytes; `content-length` exato 200; `HEAD` com `content-length` 200 sem corpo; 403 do catálogo com 638 bytes de corpo UTF-8 e HEAD igual; `/auth/entrar` 422; `/orgaos` sem token 401; aborto do cliente no meio de stream lento e de stream grande não derruba o processo (sem `uncaughtException`).
- Unidade do conferidor de corpo (`14-unidade-corpo.txt`): `toString`, `__proto__`, `constructor`, chave `erro` repetida (inclusive com escape `r`), BOM, espaço no código, `erro` em lista, status trocado (401 com `sem_permissao`, 401 com `conta_desativada`): todos recusados; `sem_permissao` 403 e `conta_desativada` 403 aceitos.
- Mutação (a guarda é trocada numa cópia pelo arquivo do commit anterior; os testes do SHA `60cbc2f` rodam em Node 22): `20-vitest-*.txt`.

| Guarda usada | API (140) | Console (48) |
| --- | --- | --- |
| `60cbc2f` (o SHA) | 140 passam | 48 passam |
| `1731b62` (sem a correção 7b, Early Hints) | 2 falham | 2 falham |
| `e3c63de` (sem as correções 7 e 7b) | 14 falham | 12 falham |
| `fd17ff4` (sem as correções 6, 7 e 7b) | 30 falham | 19 falham |

- A árvore principal ficou intacta (`git status --porcelain` vazio ao fim); nada foi instalado nela; nenhum processo meu ficou vivo.

## Cenários positivos

- Controles `403 sem_permissao` e `403 conta_desativada` passam intactos, com UTF-8 e 638 bytes, em GET e HEAD.
- 103 legítimo antes de 403 do catálogo passa (teste da correção 7b, 140 de 140 em Node 22 e 24).
- Streams grandes e `content-length` exato continuam 200; 204 e 304 sem corpo seguem; pedido seguinte da mesma conexão recebe a sua resposta.
- Painel: sessão encerrada, conta desativada e token vencido com conta desativada levam à entrada com a frase certa (E2E do CI).

## Cenários negativos

- Corpo maior que o `content-length` declarado, em 200: `stream-cl2`, `stream-cl0`, `response-cl2/0`, `webstream-cl2`, `buffer-cl2`, `string-cl2`, `cl-02`, `cl-numero`, `cl-maiuscula-dupla`, `cl-array`, `cl-espaco`, `raw-cl2` e `raw-cl2-end` (por `hijack`): nenhum byte além do declarado sai, a conexão fecha, nenhum 403 forjado é lido por quem faz pipeline.
- `content-length` exótico (`0x2`, `+2`, `2e0`, `2, 2`, lista `["2","9999"]`, número em `Buffer`, lista de número, objeto com `toString`): conexão fecha sem resposta, nada forjado no fio (falha fechada).
- `transfer-encoding` em lista, `identity, chunked`, `gzip, chunked`, maiúsculo, junto de `content-length`: sem 403 forjado; com `te-cl-juntos` a guarda troca a resposta pela genérica.
- 401 e 403 fora do catálogo por objeto, stream, `Buffer`, `ReadableStream` com e sem `content-length` certo ou errado, `Response` (nesse caso o Fastify usa o status 200 do `Response` e nada de 403 sai), trailer, status em texto (`"403"`), vazio, HTML, `null`, número, texto JSON, latin1, utf-16: desvio (500 em "falhar") ou genérico (401 `nao_autenticado`, 403 `sem_permissao` em "corrigir"), sempre sincronizado.
- 403 do catálogo com `content-length` menor que o corpo e corpo forjado depois: resposta do desvio, sem trailing; antes da correção 7 o cliente ficava sem resposta.
- 1xx final (`code(103)`, `code(199)`): 500, pedido seguinte sincronizado.
- Early Hints com CR e LF no valor, em lista, e no nome: a guarda lança `ERR_INVALID_CHAR` e a rota responde 404 e 200 normais, nada forjado, em Node 22 e 24.
- `/auth/entrar` de conta desativada igual à de senha errada; 404 de outro município inalterado (testes, linhas acima).

## Tentativas de reprovar

1. Repeti do zero as sondas da rodada 7 (`content-length` 2 e 0, com stream, `Response`, `ReadableStream`, 403 forjado dentro, seguido de segundo pedido em pipeline), na API e no console, nos dois modos, em Node 22 e 24. Não dessincronizam mais. O controle com a guarda de `fd17ff4` reproduz o defeito, então a sonda mede o que diz.
2. Tentei formas novas de moldura: `content-length` em lista, `Buffer`, número, com espaço, hexadecimal, expoente, `transfer-encoding` em lista ou maiúsculo, `connection: upgrade`, `setHeader` cru, `removeHeader`, `hijack` com `write` depois do limite, 204 e 304 com corpo. Nenhuma põe um 401 ou 403 fora do catálogo no fio.
3. Tentei trailer e 1xx final pela API pública. Fechados.
4. Tentei o conferidor de corpo com chaves de protótipo, chave repetida escapada, BOM e tipos errados. Fechado.
5. Tentei quebrar o uso legítimo: stream grande, HEAD com `content-length`, UTF-8 em 403, aborto do cliente no meio do fluxo, 200 sem `content-length`. Nada quebrou e o processo ficou de pé.
6. Mutação: desfiz a correção 7 e a 7b (e a 6) numa cópia, os testes novos ficaram vermelhos (2, 14 e 30 na API; 2, 12 e 19 no console), e verdes de volta no SHA.
7. Reproduzi a DV-01 só para classificá-la (`17-dv01-reproducao.txt`): objeto com `toString` mutável passado a `reply.header` ou ao `writeHead` cru dentro da rota. Exige código hostil na própria rota (valor que muda a cada leitura); com `Date`, `Buffer`, número e lista, que são os valores comuns, o resultado é estável e seguro. A classificação como dívida está certa. Não refiz a DV-01 como achado.

## Achados

1. **corrige antes de crescer (dívida de documentação; não bloqueia).** O README (seção da API) e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` não escrevem o modelo de ameaça da E05 (defesa em profundidade contra erro de programação numa rota; não cobre código hostil, como objeto com `toString` que muda a cada leitura) nem apontam a DV-01. O README diz que "toda resposta 401 ou 403 do servidor tem código nele, salvo pelos caminhos que a guarda não vê" e lista só socket, `.call/.apply/Reflect` e primitivas trocadas antes da carga; o caso do valor de cabeçalho mutável não está na lista. Para os valores comuns a frase é verdadeira (sondas acima), então não há promessa falsa alcançável por cliente. Classificação D-31: não é (b), porque exige código errado dentro do repositório; não é (c); não é (a), porque o critério escrito de documentação da E05 é a tabela de códigos na seção da API, que está presente e correta. Dono sugerido: V2-F02-E03, junto do conserto da DV-01, ou uma frase no README agora (uma linha com o modelo de ameaça e a referência a `dividas.md`, DV-01).
2. **anotado.** `Response` da web com status 200 e `reply.code(403)` antes: o Fastify usa o status do `Response`, então sai 200 com o corpo do código fora do catálogo. Não é resposta de acesso (status 200 no fio), e não vaza código de erro. Sem ação.
3. **anotado (já documentado).** Corpo menor que o `content-length` em resposta que não é 401 nem 403 derruba a conexão sem resposta (`cl-array`, `cl-0x2` e afins, `fora-sendfile`). O README e o cabeçalho da guarda dizem isso.

Nenhum achado bloqueia pelas condições (a), (b) ou (c).

## Não verificado

- A frase das três telas e o leitor de tela (E4, validação humana da etapa) e o portão visual: não são desta dimensão.
- Firefox e WebKit do E2E e o aplicativo de campo: li o resultado do CI (jobs success), não repeti localmente.
- Cliente de proxy real (borda do Fly) com pipeline contra as formas da rodada 7: só socket TCP cru; o README já diz que o proxy da borda não foi medido.
- Postgres real, linha de base completa no Mac, `test:api` inteiro e `test:console` inteiro: ficaram com o CI (D-31 item 5) e com a regressão base do gatekeeper.
- Valores de cabeçalho com `toString` mutável (DV-01) e `writeEarlyHints` com objeto hostil: fora do escopo, dívida registrada.

## Risco residual

A garantia é de defesa em profundidade contra erro de programação. Resta a DV-01 (valor de cabeçalho com `toString` mutável e a diferença de `writeEarlyHints` entre Node 22 e 24), que exige código hostil na rota, e a escrita direta no socket, que só a varredura heurística vigia, como a documentação já declara. Falta a frase do modelo de ameaça no README e no cabeçalho do catálogo (achado 1).

## Motivo do humano

Rafael precisa ler e aprovar as três frases mostradas ao usuário (texto de produto, fluxo de erro crítico, tela pública) e o leitor de tela é avaliação de pessoa; nenhum dos dois cabe a um validador de QA.
