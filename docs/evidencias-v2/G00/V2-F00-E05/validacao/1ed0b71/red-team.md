---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Trabalho em `SCRATCH/validadores/red-team` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`). Toda mutação foi na árvore principal e desfeita com `git restore`, com conferência de `git status` depois.

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Negativo da etapa: "código fora do catálogo reprova o teste de catálogo" (a lacuna que reprovou as rodadas 4 e 5) | **FALHA** (status não inteiro, linha abaixo); as formas das rodadas 4 e 5 estão fechadas | A guarda passou de varredura estática (cega às formas V1-V7/A-N) para guarda EM TEMPO DE EXECUÇÃO na resposta do Node. Plantei a forma que escapava na rodada 5 (`const c={erro:"sem_permissao"...}; c.erro="vazou"; reply.code(403).send(c)`) numa rota real: em modo "falhar" sai 500 `desvio_do_catalogo_de_erro` com 1 desvio; em "corrigir" sai 403 `sem_permissao` genérico. Não vaza. |
| `apps/api/test/guarda-de-codigos-de-erro.test.ts` morde | OK | 71 de 71 no SHA; com a guarda desligada o RESUMO declara 54 vermelhos (não refiz esse corte, mas a guarda ligada pega as formas que plantei). |
| hijack + `raw.writeHead`/`raw.end` fora do catálogo | OK (pego) | Rota plantada: modo "corrigir" devolve genérico, não `vazou_rawwh`. A guarda envolve `raw`. |
| `flushHeaders()` (cabeçalho implícito) | OK (pego) | HTTP real, porta efêmera: o `flushHeaders` cai em `_implicitHeader -> this.writeHead(403)`, que é o método envolvido; sai 403 `sem_permissao`, não `vazou_flush`. |
| Status não inteiro (`new RegraDeNegocio("vazou_meio", "x", 403.5)` em `rotas/orgaos.ts`) | **ESCAPA a guarda E a varredura** | HTTP real, modos "falhar" e "corrigir": `403 {"erro":"vazou_meio"}`, 0 desvios; `tsc` 0; `codigos-de-erro.test.ts` 171 de 171; prova dinâmica 1 de 1 (ver Achados 1) |
| Escrita direta no socket (M08) | ESCAPA a guarda, PEGO pela varredura | HTTP real: `req.socket.write("HTTP/1.1 403...{erro:vazou_socket}")` chega ao cliente (a guarda não vê o socket, como o README declara). A varredura reprova `.socket` plantado em `rotas/orgaos.ts` real. |
| `/auth/entrar` de conta desativada segue recusa genérica; 404 de outro município | não contestado | Coberto por QA/Segurança; não reabri (a E09 cobre normalização de id). |

## Evidência

- `$W/e15-base.txt` não; para E05: execução do `guarda-de-codigos-de-erro.test.ts` (71 de 71) e dos planter próprios por `npx vitest run` (arquivos `zz-redteam-e05-escape.test.ts` e `zz-redteam-e05-real.test.ts`, criados em `apps/api/test/`, rodados e APAGADOS; `git status` limpo).
- Saída real HTTP (transcrita): `FLUSH-REAL: 403 {"erro":"sem_permissao"...}` (pego); `SOCKET-REAL: 403 {"erro":"vazou_socket"}` (escapa a guarda).
- Status 403.5 (`$W/e05-meio-varredura.txt`, `$W/e05-meio-http.txt`, `$W/e05-meio-dinamica.txt`): linha `if (req.headers["x-sonda-rt"]) throw new RegraDeNegocio("vazou_meio", "x", 403.5);` no começo do `GET /` de `src/rotas/orgaos.ts`; servidor real (`construirServidor`, PGlite) escutando em porta efêmera, `fetch` com o cabeçalho: `MEIO falhar: status=403 corpo={"erro":"vazou_meio","mensagem":"x"} desvios=0` e o mesmo em `corrigir`; o apoio `guarda-falha-alto` não reprovou o caso. Arquivo de sonda apagado, `orgaos.ts` restaurado com `git restore`.
- Varredura mordendo `.socket`: `test/codigos-de-erro.test.ts` com `const ZZ = (resposta)=>{resposta.raw.socket.end(...)}` em `src/rotas/orgaos.ts` reprova com "`.socket`: escrita direta no socket, que nem a guarda em tempo de execução vê" (7 falhas, restaurado).

## Cenários positivos

- Os dez códigos do catálogo saem com o status do catálogo (suíte 71 de 71, mais a prova dinâmica embutida no `test:api`).
- A reatribuição de `.erro` depois de montado (código TypeScript comum) é pega pela guarda em execução, em ramo que a prova dinâmica não alcançava: é o que fechou a lacuna das rodadas 4 e 5.

## Cenários negativos

- `reply.code(403).send(objetoComErroTrocado)`: 500 em teste, genérico em produção, log sem o dado.
- hijack + raw: pego.
- flushHeaders: pego (via `writeHead` envolvido).
- socket cru: escapa a guarda em execução, mas a varredura o reprova no fonte.
- `RegraDeNegocio` com status 403.5: sai 403 com código fora do catálogo nos dois modos; nenhuma das duas linhas percebe.

## Tentativas de reprovar

1. Reatribuir `.erro` depois de montado o corpo (a forma V2/V4 que escapava na rodada 5): PEGO em execução. Não escapa.
2. hijack + `raw.writeHead(403)` + `raw.end({erro:"vazou"})`: PEGO. Não escapa.
3. hijack + `raw.flushHeaders()` + `raw.write`/`raw.end` por HTTP real: PEGO, porque `flushHeaders` chama o `writeHead` da instância, que é o envolvido. Não escapa.
4. Escrita direta no socket por HTTP real: ESCAPA a guarda em execução (documentado), mas a varredura reprova `.socket`/`.connection` no fonte (provado mordendo em `orgaos.ts` real).
5. Status não inteiro, `new RegraDeNegocio("vazou_meio", "x", 403.5)`: ESCAPA das duas linhas. O tratador global faz `resposta.code(403.5)`; o `writeHead` envolvido recebe 403.5, `ehAcesso(403.5)` é falso (compara com 401 e 403 exatos) e repassa ao original, e o Node trunca para 403 ao escrever a linha de status. A varredura aceita `new RegraDeNegocio` com literal numérico que não é 401 nem 403. O cliente recebe 403 com código fora do catálogo, nos dois modos, sem desvio registrado.
6. Fora o status não inteiro, o que a guarda não vê (socket, método do protótipo por fora da instância) a varredura proíbe, e o que a varredura não lê (reatribuição, colchete, `let`) a guarda pega pelo corpo real.

## Achados

1. **bloqueia.** Status não inteiro escapa da guarda em tempo de execução e da varredura. Reprodução: em `dc360/apps/api/src/rotas/orgaos.ts`, primeira linha do `GET /`, `throw new RegraDeNegocio("vazou_meio", "x", 403.5);` (atrás de um cabeçalho, como ramo que a prova dinâmica não exercita); `tsc` 0, `codigos-de-erro.test.ts` 171 de 171, `prova-dinamica-dos-codigos-de-erro.test.ts` verde; por HTTP real a API responde `403 {"erro":"vazou_meio"}` em "falhar" e em "corrigir", 0 desvios. Causa: `ehAcesso` em `guarda-de-codigos-de-erro.ts` confere `s === 401 || s === 403` sobre o valor pedido, e o Node arredonda para baixo (`403.5` vira 403) depois da guarda. Desmente `dc360/README.md:148-151` ("toda resposta 401 ou 403 do servidor tem código nele. Quem GARANTE isto é uma guarda em tempo de execução") e o critério negativo "código fora do catálogo reprova o teste de catálogo". Status calculado (`parseFloat`, conta) é código plausível de rota nova. Conserto mínimo: a guarda normalizar o status como o Node faz (`status | 0`, ou recusar não inteiro / fora de 100-599) antes de decidir, em `writeHead` e no `statusCode` lido por `write`/`end`; a varredura recusar literal não inteiro em status; caso de teste para `401.x` e `403.x` nos dois modos e no console. A mesma cópia da guarda vive no console; não executei lá.
2. **anotado.** A única forma que passa pela guarda em execução (socket) depende da varredura, que é heurística e é a única rede nesse caminho; se um dia uma escrita no socket evadir a heurística da varredura E não passar pela resposta do Node, escaparia. É o limite que o próprio README e o cabeçalho do catálogo declaram ("escrita no socket", "método do protótipo por fora da instância", "troca das primitivas antes da carga"). Não é alcançável por rota nova comum.
- **anotado.** O contrato do console é uma lista própria de códigos escrita no teste, não publicada; não plantei no console (mesma função, mesma análise).

## Não verificado

- Console do fornecedor contra as formas acima, inclusive o status não inteiro (mesma cópia da guarda; não executei).
- Medida de tempo das respostas (fora do foco; não há oráculo por tempo nesta etapa).
- Run do CI do SHA (ausente, H32).
- As três frases na tela de entrada (UX e validação humana).

## Risco residual

Médio. A guarda em tempo de execução fechou as formas de TypeScript comum que reprovaram as rodadas 4 e 5, mas a decisão por igualdade exata com 401 e 403 deixa passar status não inteiro que o Node escreve como 401 ou 403, e a varredura também não o recusa: a garantia que o README vende não se sustenta até o conserto. Resta só o que a documentação declara: escrita no socket e chamada do protótipo por fora da instância escapam da guarda e dependem da varredura heurística; troca de primitivas antes da carga do módulo não é alcançável por rota nova.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana da etapa (Rafael ler e aprovar as três frases) é de UX e segue pendente.
