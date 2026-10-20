# V2-F00-E05, correção 6: a guarda confere a moldura do corpo, e o desvio nunca lança

Base: `24da65e`, ramo `trab/correcao-7`. Motivo: a rodada 7 (SHA validado `fd17ff4`, QA) deu FAIL na E05.

- **Achado 1, bloqueia.** Uma resposta 403 com código fora do catálogo chegava ao fio pela API pública do Fastify. A rota fazia `resposta.code(200).header("content-length", "2").type("application/json").send(Readable.from([Buffer.from("{}" + cabeca + corpo)]))`, com `cabeca` sendo uma linha de status 403 e `corpo` sendo `{"erro":"inventado_qa7"}`. O Node não confere o `content-length` sem `strictContentLength` e escreve tudo, então um cliente em pipeline lia duas respostas. Nenhuma das três linhas reprovava.
- **Achado 2, corrigir antes de crescer.** Com `reply.trailer(...)` num 403 fora do catálogo, o caminho de desvio chamava `writeHead` com `content-length`. O Node lançava `ERR_HTTP_TRAILER_INVALID` fora de qualquer `try`, e a exceção ficava não tratada.
- **Achado 3, anotado.** `writeHead(403)` seguido de `flushHeaders()` pela resposta crua saía 200, com o corpo nunca escrito.

## Fatos

- Patch: `diff-da-correcao.patch`, de `24da65e` até este commit, só com os caminhos desta correção.
- Sondas em `scripts/`:
  - `plantar-c6.py` planta 20 formas atrás do cabeçalho `x-qa7` no `GET /orgaos` real. O plantio foi desfeito com `git restore`.
  - `zz-sonda-e05c6.test.ts` sobe o servidor real (`construirServidor`, banco em memória), escuta numa porta efêmera e manda dois pedidos em pipeline por socket TCP cru: a forma e um `GET /orgaos` sem token, que deve receber 401. O arquivo foi posto em `apps/api/test/` só durante a execução e apagado depois.

### Antes (`saidas/01-ANTES-sonda-pipeline.txt`, guarda de `24da65e`)

- Sete formas saem nos dois modos como uma segunda resposta `403 {"erro":"inventado_qa7"}`, com 0 desvios:
  - as duas formas do QA, `cl-stream` (fluxo) e `cl-response` (`Response` da web);
  - o fluxo em quatro pedaços;
  - `writeHead(200, content-length 2)` com `end` maior, pela resposta crua;
  - `_writeRaw` depois de `write("{}")`;
  - `chunked` com `_writeRaw` de bytes depois do terminador `0\r\n\r\n`.
- O trailer fora do catálogo gerou 2 exceções não tratadas (`ERR_HTTP_TRAILER_INVALID`).
- `flush-403` saiu `200` com corpo vazio.

### O que mudou

As mudanças valem para `apps/api/src/guarda-de-codigos-de-erro.ts` e para a cópia do console, iguais nas duas.

1. **`strictContentLength` em toda resposta.** O `onRequest` da guarda liga `raw.strictContentLength = true` na resposta do Node de cada pedido.
   - O Node recusa lançando, e quem escreve pode ser o `pipe` do fluxo do Fastify, onde a exceção ficaria não tratada. Por isso `write` e `end` pegam `ERR_HTTP_CONTENT_LENGTH_MISMATCH`.
   - O Node só confere do SEGUNDO pedaço em diante: o `content-length` é lido quando a cabeça é montada, depois da conferência do primeiro (provado em Node 24). Por isso a guarda confere ANTES de cada pedaço. O limite é o `content-length` (de `getHeader` antes da cabeça e de `_contentLength` depois), sem limite para HEAD, 1xx, 204, 304 e `transfer-encoding`.
   - Excesso é desvio, registrado uma vez. Sai só o que cabia no declarado, a conexão fecha (`_last`) e o resto do corpo é descartado.
   - Corpo menor que o declarado derruba a conexão, e o cliente não fica esperando bytes que não vêm.
2. **A porta dos bytes confere a moldura do corpo.** Depois da cabeça final, `_writeRaw` e `_flushOutput` contam o corpo de cada pedaço, na ordem em que sai, contra a moldura que a cabeça que de fato saiu declarou:
   - com `content-length`, nenhum byte além do declarado sai;
   - com `chunked` (última codificação), os pedaços são lidos (tamanho, extensão, dados, CRLF, trailer) e nada sai depois do terminador, nem moldura malformada;
   - com `transfer-encoding` que não termina em `chunked`, ou sem moldura, a conexão fecha no fim;
   - `content-length` repetido com valores diferentes, ou junto de `transfer-encoding`, é cabeça ilegível e troca a resposta inteira;
   - HEAD, 204 e 304 têm corpo zero.

   Esta é a rede para o que chega por baixo (`_writeRaw`), onde o `strictContentLength` não age. Com o socket desligado (fila do Node), cada pedaço passa pela porta uma vez, quando a fila é esvaziada.
3. **O caminho do desvio nunca lança.**
   - O `trailer` sai junto dos cabeçalhos de corpo, e o `_trailer` de `addTrailers` é limpo.
   - A troca da resposta fica em `try`. Se o Node recusar até a cabeça da troca, a resposta do desvio vai em bytes prontos pela porta, com `connection: close`, e a conexão é derrubada depois.
   - A resposta conferida que o Node recusar (por exemplo, `content-length` que não bate com o corpo do catálogo) vira desvio, e não exceção.
4. **`flushHeaders` depois de `writeHead(403)`.**
   - A guarda grava em `raw.statusCode` o status que decidiu.
   - Já segurando, o `_implicitHeader` (que relê `statusCode`) não refaz a cabeça segurada.
5. README (o parágrafo da guarda), cabeçalho do catálogo e cabeçalhos das duas guardas: "o corpo depois de uma cabeça final que passou, cuja moldura ela não confere" SAIU da lista do que a guarda não vê. Lá ficam:
   - a escrita direta no socket, que só a varredura proíbe;
   - o método do protótipo chamado por fora da instância;
   - a troca das primitivas antes da carga, do próprio Node ou do registrador de log.

### Depois (`saidas/10-DEPOIS-sonda-pipeline.txt`)

- **Nenhuma resposta 401 ou 403 com código inventado** chega ao cliente, em 40 casos (20 formas, dois modos). São 0 exceções não tratadas.
- **As sete formas de excesso:** o cliente lê só `200 {}` (2 bytes) e a conexão fecha. Em teste, cada uma é 1 desvio.
- **Moldura contraditória e trailer:**
  - `cl-e-te`: 500 em teste, 403 `sem_permissao` em produção.
  - `trailer-inventado`: 500 em teste, 403 `sem_permissao` em produção, e o pedido seguinte do socket recebe o 401 dele.
  - `trailer-catalogo`: passa intacto, com o trailer.
- **`flush-403`:** 500 em teste, 403 genérico em produção. `flush-403-catalogo` sai 403 com o corpo da rota.
- **Controles intactos, com o pedido seguinte no mesmo socket certo:**
  - ZIP em fluxo sem `content-length` (204800 bytes, `chunked`);
  - PDF em Buffer (300000 bytes);
  - fluxo com o `content-length` certo;
  - `transfer-encoding: chunked` forjado pela API pública, que o Node emoldura: o texto forjado chega como corpo, não como resposta;
  - `cl-buffer` e `cl-string`, em que o Fastify corrige o `content-length` para o tamanho real.

### Testes (casos acrescentados)

- `apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 108 para 119 (+11), todos por socket cru em pipeline nos dois modos, menos o último:
  - seis formas de excesso: `cl-stream`, `cl-response`, `cl-stream-pedacos`, `cl-raw-end`, `cl-writeraw`, `chunked-depois-do-terminador`;
  - `content-length` com `transfer-encoding`;
  - trailer fora e dentro do catálogo, com `uncaughtException` vigiado;
  - `flushHeaders` depois de `writeHead(403)`;
  - controles: ZIP, PDF, fluxo certo, chunked forjado;
  - `strictContentLength` ligado.
- `apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 27 para 29 (+2): `cl-stream`, e trailer fora do contrato sem exceção não tratada.
- Varredura (`codigos-de-erro.test.ts`): sem caso novo. As formas do QA usam só a API pública e quem as pega é a guarda.

### A mordida

- `saidas/20`: com a guarda de `24da65e`, 10 dos 119 casos da API falham, ou seja, todos os novos menos o de controle.
- `saidas/21`: no console, os 2 novos falham.

### Regressão

- `npm run test:api -- --maxWorkers=4`: 106 arquivos, 1696 passados e 34 pulados, código 0 (`saidas/60`). Eram 1685; os 11 novos são da guarda.
  - A suíte inclui a prova dinâmica (`prova-dinamica-dos-codigos-de-erro.test.ts`, verde e sem desvio).
  - Inclui também os downloads do produto em fluxo e em Buffer, pelo servidor real com `inject`: o pacote ZIP de saída (`pacote-de-saida-contrato.test.ts`, `saida-de-municipio.test.ts`) e o PDF do documento (`documentos.test.ts`).
- Console: 288 de 288, código 0 (`saidas/61`). Eram 286.
- Shared: 223 de 223 (`saidas/62`).
- `npm run typecheck`: código 0 (`saidas/63`).
- `tsconfig` temporários com os testes da guarda da API e do console: código 0 nos dois (`saidas/64`).
- Portão de conteúdo: 10 de 10 (`saidas/65`).
- `test:isolamento`: 345 passados e 3 pulados, código 0 (`saidas/66`).
- `node scripts/conferir-indices-de-evidencia.mjs`: rodado depois de montar os índices. Não é arquivado, porque um arquivo não consegue conter a conferência do índice que o lista.

### Limitações

- Os downloads reais de ZIP e PDF foram provados pelo `inject`, que passa pelo `strictContentLength` e pelos envoltórios de `write` e `end` mas não manda bytes a um socket. A porta dos bytes foi provada por HTTP de verdade com rotas de controle que mandam o mesmo tipo de corpo (fluxo sem `content-length`, Buffer grande, fluxo com `content-length` certo).
- `content-length` junto de `transfer-encoding` troca a resposta inteira mesmo em status que não é de acesso: em produção sai o 403 genérico. Nenhuma rota do produto manda os dois.
- A cabeça maior que 16 KiB que a porta lê fica sem contagem de corpo e fecha a conexão no fim.
- A escrita direta no socket continua fora da guarda. Só a varredura, heurística, a proíbe.

## Justificativa

A garantia escrita é sobre o que sai no fio. Um corpo maior que o `content-length` declarado não é corpo: é o começo da resposta seguinte da conexão, e por ali passava um 403 com código que nenhum cliente conhece, sem nome privado e sem `.raw`, só com a API pública. Por isso a guarda passa a conferir a moldura nas duas camadas.

- O `strictContentLength` faz o próprio Node recusar o excesso. A guarda pega a recusa, porque ela vem lançando dentro de um `pipe`, e confere antes do primeiro pedaço, que o Node não confere.
- A porta dos bytes conta de novo contra a cabeça que de fato saiu, inclusive em `chunked`, para o que chega por baixo.

O excesso não vira resposta trocada, porque a cabeça já saiu: sai só o que cabia e a conexão fecha, para nada sobrar no socket.

O caminho do desvio é o único lugar em que a guarda escreve por conta própria. Se ele lança, a falha fechada derruba o processo, o que é pior que o vazamento. Ele passa a ter saída garantida, e a última saída é derrubar só aquela conexão.

O `flushHeaders` relia o status que a guarda tinha segurado sem gravar. Gravar o status decidido faz quem o reler ler a decisão da guarda.
