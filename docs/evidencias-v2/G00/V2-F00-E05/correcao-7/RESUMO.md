# V2-F00-E05, correção 7: o status 1xx como resposta final vira desvio, e o 403 do catálogo com content-length errado volta a ter resposta

Base: `d00a549`, ramo `trab/correcao-7`. A guarda nesse SHA é a da correção 6 (`e3c63de`); o diff de `e3c63de` até `d00a549` não toca a guarda nem os testes dela.

Motivo: a rodada 7 da E05 (Segurança, red-team e QA, todos FAIL) rodou sobre `fd17ff4`, que é anterior à correção 6. Os relatórios estão em `validacao/fd17ff4/` (no checkout principal). A tarefa desta correção foi reproduzir cada variante dos três relatórios contra a guarda de HEAD, consertar o que ainda escapasse e provar com teste.

## Fatos

### As sondas

- `scripts/zz-c7-comum.ts` planta 35 variantes em `/c7/<nome>` e lê o que um cliente HTTP/1.1 em pipeline leria. As variantes cobrem:
  - fluxo do Node, `Response` e `ReadableStream` da web, com `content-length: 2` e com `content-length: 0`, levando uma resposta 403 inventada no corpo;
  - 401 ou 403 do catálogo com `content-length` menor e maior que o corpo;
  - Early Hints com CRLF no valor, `transfer-encoding: identity`, 204 e 304 com fluxo;
  - `reply.trailer` e `addTrailers`, dentro e fora do catálogo;
  - `writeHead(403)` mais `flushHeaders`, e `code(401)` mais `flushHeaders`;
  - `reply.code(100 | 101 | 102 | 103 | 199)` como resposta final, pela API pública, por `writeHead` cru e por `statusCode` implícito;
  - 101 escrito por `_writeRaw`, e uma resposta que termina só com a cabeça provisória;
  - controles.
- `scripts/sonda-api.ts` sobe a API real (`construirServidor`, banco em memória). `scripts/sonda-console.ts` sobe o console real (`construirConsole`, dono semeado). Cada uma, nos modos "falhar" e "corrigir", manda por socket TCP cru dois pedidos em pipeline: a variante e um `GET /c7/segundo`.
- As sondas rodam FORA do vitest, num processo próprio e SEM tratador de `uncaughtException`. Se uma variante derruba o processo, o código de saída não é 0.
- O veredito de cada caso:
  - **ESCAPOU**: alguma resposta 401 ou 403 com o código inventado.
  - **DESSINCRONIZOU**: a resposta final do pedido 1 é a do pedido 2, ou aparece um 101 que ninguém pediu, ou há mais de duas finais, ou a segunda não é a do pedido 2.
- `scripts/rodar.sh` copia as sondas para `apps/api` e `apps/console`, roda e apaga. `scripts/rodar-por-variante.sh` roda um processo por variante, para ver todas mesmo quando uma derruba o processo.

### O que se reproduziu (`saidas/12-tabela-variante-antes-depois.txt`)

A tabela da API é igual à do console, linha por linha. Colunas:

- **fd17ff4**: a guarda de `24da65e`, que é a mesma do SHA validado. Saídas `00` e `01`, um processo por variante.
- **HEAD**: a guarda de `d00a549`, com a correção 6. Saídas `02` e `03`.
- **depois**: esta correção. Saídas `10` e `11`.

| Variante (dos relatórios) | fd17ff4 | HEAD | depois |
| --- | --- | --- | --- |
| fluxo do Node, `Response` e `ReadableStream` com `content-length: 2` (Seg, RT e QA, achado 1) | ESCAPOU + DESSINCRONIZOU | ok | ok |
| os mesmos três com `content-length: 0` (Seg `i-cl0`, RT) | ESCAPOU + DESSINCRONIZOU | ok | ok |
| 403 do catálogo com `content-length` menor que o corpo (Seg, tentativa 2) | DESSINCRONIZOU | sem resposta | ok |
| 403 do catálogo com `content-length` maior que o corpo | ok | sem resposta | ok |
| `reply.trailer` fora do catálogo (Seg e QA, achado 2) | PROCESSO CAIU | ok | ok |
| `addTrailers` com chunked fora do catálogo (RT, achado 2) | ok (500 `erro_interno`) | ok | ok |
| `writeHead(403)` mais `flushHeaders` (QA, achado 3) | 200 sem corpo | ok | ok |
| `code(100 \| 101 \| 102 \| 103 \| 199)` como final, objeto, `writeHead(102)` cru, `statusCode = 102` (Seg, achado 3) | DESSINCRONIZOU | DESSINCRONIZOU | ok |
| 101 por `_writeRaw`; resposta só com a provisória (por baixo) | DESSINCRONIZOU | DESSINCRONIZOU | ok |
| `transfer-encoding: identity` forjado (Seg, tentativa 4) | DESSINCRONIZOU | ok | ok |
| Early Hints com CRLF, Buffer com `content-length` errado, 204 e 304 com fluxo, `code(401)` mais `flushHeaders` | ok | ok | ok |
| 200 com `content-length` maior que o corpo | ok | sem resposta | sem resposta |

Sobre as linhas da tabela:

- **"sem resposta" no 403 do catálogo, em HEAD.** O `end` do Node arrolha o socket (`cork`) antes de escrever e LANÇA no meio quando o `content-length` estrito não bate. A guarda pegava a exceção e escrevia a resposta do desvio num socket arrolhado, e nada saía. O cliente esperava até o tempo da sonda esgotar.
- **"sem resposta" no 200, depois.** Corpo menor que o declarado, em resposta que não é 401 nem 403, derruba a conexão por desenho, desde a correção 6. O cliente vê a conexão cair, não uma resposta trocada.
- **Queda de processo.** Com a guarda de `fd17ff4`, só `reply.trailer` derrubou o processo (`ERR_HTTP_TRAILER_INVALID`, saída 1), na API e no console. Em HEAD e depois, as sondas terminam com saída 0 e "processo de pé" nas 70 execuções de cada pacote (35 variantes vezes dois modos).

### O que mudou

As mudanças são iguais em `apps/api/src/guarda-de-codigos-de-erro.ts` e na cópia do console.

1. **Status 1xx como resposta final é desvio.**
   - `writeHead` com 1xx, ou o cabeçalho implícito com `statusCode` 1xx, faz a guarda segurar a resposta, HEAD inclusive. No `end`, sai 500 no lugar: `desvio_do_catalogo_de_erro` em teste; fora de teste, o genérico novo `500` (`erro_interno` na API, `falha_interna` no console).
   - Os 1xx legítimos do Node (`writeContinue`, `writeProcessing`, `writeEarlyHints`) vão direto a `_writeRaw` e não passam por ali.
2. **Na porta dos bytes.**
   - O 101 que chega como cabeça final, escrito por baixo, troca a resposta por 500 e fecha a conexão.
   - A resposta que termina tendo deixado passar só cabeças provisórias, sem a final, é desvio e fecha a conexão (`_last`). Assim o pedido seguinte não sai nela.
3. **O socket arrolhado é desarrolhado** antes de a guarda escrever a resposta do desvio em bytes prontos.
4. `GENERICO_DA_API` e `GENERICO_DO_CONSOLE` ganham a chave `500`.
5. Os cabeçalhos das duas guardas, o cabeçalho de `packages/shared/src/codigos-de-erro.ts` e o `dc360/README.md` dizem:
   - o que mudou;
   - o que os testes provam: cada forma da rodada 7, por socket cru em pipeline, nos dois modos, em Node 24;
   - o que fica de fora: o proxy da borda não foi medido, e o corpo menor que o declarado em resposta que não é de acesso derruba a conexão.

A varredura (`apps/api/test/varredura-de-erros.ts`) não mudou: a recusa do 1xx final está na guarda, em tempo de execução.

### Testes acrescentados

**`apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 119 para 138 (+19).** Todos por socket cru, com dois pedidos em pipeline, nos dois modos:

- `c-webstream`, `i-cl0-stream`, `i-cl0-response`, `i-cl0-webstream` (4);
- 403 do catálogo com `content-length` menor e maior (1);
- `transfer-encoding: identity` (1);
- `addTrailers` fora do catálogo, com `uncaughtException` vigiado (1);
- os oito 1xx como resposta final (8);
- HEAD com `code(102)` (1);
- 101 por `_writeRaw` (1);
- resposta só com a provisória (1);
- controles: 102 de verdade antes do 403 do catálogo, Buffer com `content-length` errado, 204, 304, Early Hints com CRLF e `code(401)` mais `flushHeaders` (1).

**`apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 29 para 45 (+16).** Mesmas formas:

- moldura (4);
- 403 do contrato com `content-length` menor (1);
- `addTrailers` (1);
- os oito 1xx (8);
- 1xx por baixo (1);
- controle (1).

O leitor de respostas do teste da API passou a tratar 1xx, 204 e 304 como sem corpo.

### A mordida

- Com a guarda de `24da65e`:
  - API: 28 dos 138 casos falham (`saidas/20`). São 18 dos 19 novos (todos menos os controles) e os 10 da correção 6.
  - Console: 17 dos 45 falham (`saidas/21`). São 15 dos 16 novos (todos menos o controle) e os 2 da correção 6.
- Com a guarda de `d00a549`, isto é, com esta mudança revertida:
  - API: 12 falham (`saidas/22`): o 403 do catálogo com `content-length` errado, os oito 1xx, o HEAD, o 101 por baixo e a resposta só com a provisória.
  - Console: 10 falham (`saidas/23`).
  - Os casos de moldura, `identity` e `addTrailers` não mordem em HEAD, porque a correção 6 já os fechava. Eles mordem na guarda de `24da65e`.
- Os casos de controle não mordem em nenhuma das duas guardas, de propósito: provam que o que já saía certo continua certo.

### Regressão

| Saída | Comando | Resultado |
| --- | --- | --- |
| `60` | `npm run test:api -- --maxWorkers=4` | 106 arquivos, 1715 passados e 34 pulados (o bloco de Postgres real, por ambiente), código 0. Eram 1696. |
| `61` | `npm run test:console` | 304 de 304, código 0. Eram 288. |
| `62` | `npm run test --workspace @dc360/shared` | 223 de 223 |
| `63` | `npm run typecheck` | código 0 |
| `64` | `tsconfig` temporário com o teste da guarda, na API e no console | código 0 nos dois |
| `65` | portão de conteúdo (`regras-de-conteudo.test.ts`) | 10 de 10 |
| `66` | `npm run test:isolamento` | 345 passados e 3 pulados, código 0 |
| `67` | `npm run conferir:numeros` | código 0 |
| `68` | `node --test scripts/baseline.test.mjs` | 29 de 29 |

Contagens atualizadas:

- `scripts/baseline.mjs`: entrada `V2-F00-E05-correcao-7` com `total: 19, falhas: 0, puladas: 0`, e o console esperado de 288 para 304.
- README: API 1715, console 304, `npm test` 3524.
- `docs/COLOCAR-DE-PE.md`: 5521 com o aplicativo.

`node dc360/scripts/conferir-indices-de-evidencia.mjs` foi rodado depois de montar os índices. Não é arquivado, porque um arquivo não consegue conter a conferência do índice que o lista.

## O que não foi provado

- **Proxy da borda.** O proxy de produção (Fly) diante destas formas não foi medido: só socket cru.
- **Versão do Node.** Tudo rodou em Node 24.15.0, e não no Node 22 do `.nvmrc`.
- **Postgres real.** O bloco de Postgres real de `renovacao-contra-encerramento.test.ts` (34 casos) ficou pulado por falta de `DC360_POSTGRES_DE_PROVA`. Ele não toca a guarda.
- **Outras suítes.** `test:e2e:api`, o painel e o aplicativo de campo não foram rodados: nada deles mudou.
- **Escrita direta no socket.** Continua fora da guarda, coberta só pela varredura, que é heurística.
- **1xx por baixo.** Os casos de 1xx por baixo usam nomes internos (`_writeRaw`, `_header`, `_headerSent`) que a varredura proíbe no produto. A guarda os pega, mas um caminho por baixo que esta sonda não imaginou não está provado.
- **HEAD com 1xx.** Só está no teste da API, não no do console.
- **`addTrailers` dentro do catálogo.** Com `transfer-encoding: chunked` manual, o Fastify acrescenta `content-length` e a cabeça sai com os dois. A guarda troca a resposta inteira (comportamento da correção 6, declarado lá) mesmo com o código no catálogo. Nenhuma rota do produto faz isso.

## Justificativa

O status 1xx não carrega código fora do catálogo, mas a garantia escrita é sobre o que sai no fio. Um 1xx final faz o cliente em pipeline ler a resposta de OUTRO pedido como a deste: um 401 de um pedido pode virar a resposta de outro. É a mesma classe de dessincronização da correção 6. Nenhum 1xx legítimo passa por `writeHead`, então recusá-lo ali não custa nada ao produto.

O socket arrolhado era um defeito da própria correção 6: ela pôs o desvio em `try`, mas a resposta do desvio não saía quando o `end` do Node lançava no meio. Por isso desarrolhar entra junto.
