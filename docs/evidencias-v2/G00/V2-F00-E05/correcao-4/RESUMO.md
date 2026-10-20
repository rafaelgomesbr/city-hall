# V2-F00-E05, correção 4: a guarda decide pelo status que o Node escreve

Base: `1ed0b71`, ramo `trab/correcao-6`. Motivo: rodada 6 (SHA `1ed0b71`), red-team achado 1 e QA achado 1, os dois bloqueantes. Um status que não é inteiro (`throw new RegraDeNegocio("vazou_meio", "x", 403.5)`) passava pela guarda em tempo de execução, pela varredura e pela prova dinâmica. Por HTTP de verdade, a API respondia `403 {"erro":"vazou_meio"}` nos dois modos, sem nenhum desvio registrado.

## Fatos

Patches: `diff-da-correcao.patch` (`1ed0b71` a `05ab42d`, a parte do status torto) e `diff-da-correcao-4b.patch` (`05ab42d` até o commit da parte 4b, a linha de status escrita por baixo de `writeHead`). Os dois só levam os caminhos desta correção; a parte 4b está na seção dela, no fim dos Fatos.

As sondas estão em `scripts/`: `sonda-node-writeHead.mjs` (o Node sozinho), `zz-sonda-e05c4.test.ts` (a API real por HTTP, posta em `apps/api/test/` só durante a execução e apagada depois) e `plantar.py` (o plantio em `rotas/orgaos.ts`, desfeito com `git restore`).

### O defeito, reproduzido antes do conserto

- Causa: o `writeHead` do Node faz `statusCode |= 0` e só depois confere a faixa. Já a guarda (`ehAcesso`) comparava o valor PEDIDO com `=== 401 || === 403`.
- `saidas/00-sonda-node-writeHead.txt` mostra o Node 24.15 sozinho, por HTTP: `403.5`, `"403"`, `"403.2"`, `"0x193"`, `4294967699`, `-4294966893`, `[403]` e um objeto com `valueOf` que dá `401.9` saem todos 401 ou 403 no fio. `true` e `null` são recusados.
- O Fastify aceita em `reply.code` qualquer `+code` entre 100 e 599, e guarda o número sem truncar. O tratador de erro do Fastify copia `error.statusCode` como veio (até em texto).
- `saidas/01-ANTES-sonda-http.txt`: o `GET /orgaos` real foi plantado atrás de um cabeçalho, com o código antigo, e servido por HTTP em porta efêmera.
  - Nos dois modos: `RegraDeNegocio(..., 403.5)` saiu `403 vazou_meio`, `code(403.5)` saiu `403 vazou_frac` e `code("403.2")` saiu `403 vazou_frac_texto`.
  - `code(401.9)` com `nao_autenticado` saiu 401.
  - Zero desvios em todos os casos.
- `saidas/02-ANTES-...`: varredura e prova dinâmica antigas sobre o mesmo plantio. As linhas 84 (`RegraDeNegocio` 403.5) e 85 (`code(403.5)`) passam caladas. A varredura antiga só pegou a 86 (código fora do catálogo com status em texto) e a 87 (código do catálogo com status 401.9 diferente de 401).
- O plantio em `rotas/orgaos.ts` foi desfeito com `git restore`. A sonda está em `scripts/`.

### O que mudou

- **`apps/api/src/guarda-de-codigos-de-erro.ts` e a cópia do console** (mesma mudança):
  - `statusComoONodeEscreve(pedido)` calcula `pedido | 0`, a mesma conta do Node, UMA vez.
  - O status é `torto` quando não é `number` inteiro de 100 a 599.
  - `writeHead` decide pelo valor efetivo e passa ao Node o inteiro já calculado. Assim, o que o Node escreve é o que a guarda conferiu, e um `valueOf` que muda a cada leitura não é lido de novo.
  - No cabeçalho implícito (`write`/`end` sem `writeHead`), a mesma conta vale sobre `statusCode`. O torto que não é de acesso vira o inteiro antes de o Node o ler.
  - Status torto que o Node escreveria como 401 ou 403 é desvio mesmo com o corpo no catálogo. Motivo registrado: "status que não é número inteiro de 100 a 599 e que o Node escreve como N".
- **Argumentos de `writeHead` lidos como o Node os lê.** Sem frase em texto, os cabeçalhos são o terceiro argumento, e o segundo só quando o terceiro falta (`obj ??= reason`). Antes, `writeHead(403, undefined, cabecalhos)` perdia os cabeçalhos ao repetir o `writeHead` segurado.
- **A frase da linha de status.** A resposta trocada pela guarda sai com a frase padrão (`Unauthorized`, `Forbidden`, `Internal Server Error`), e não com a frase que a rota tinha escrito.
- **Os construtores recusam status torto.**
  - `RegraDeNegocio` (`apps/api/src/servidor.ts`) aceita só inteiro de 400 a 599. Fora disso, lança `TypeError`, e a rota sai 500 `erro_interno` com o detalhe no log.
  - `AcessoSuspenso` (`auth/suspensao.ts`) aceita só 403 ou 503, também contra conversão de tipo.
  - `FalhaAutenticacao` não recebe status: quem escolhe 401 ou 429 é o tratador global, com literal. Não havia o que mudar ali.
- **A varredura (`apps/api/test/varredura-de-erros.ts`)** reprova, no lugar de um status, o literal em texto, o número não inteiro ou fora de 100 a 599, e o número com sinal. Os lugares de status lidos são: `code`, `status`, `writeHead`, terceiro argumento de `RegraDeNegocio` e subclasses, `{ status, corpo }`, `statusCode`, `status` declarado na classe, atribuição e `redirect`. Em QUALQUER lugar do fonte, ela reprova também o número que o `| 0` transforma em 401 ou 403 sem ser 401 ou 403 (`403.5`, `4294967699`, `-4294966893`), mesmo guardado numa constante.
- Cabeçalho do catálogo (`packages/shared/src/codigos-de-erro.ts`, item 0) e cabeçalho do módulo da guarda: "401 ou 403" passa a ser o status que o Node ESCREVE.

### Outras normalizações conferidas

- **Status em texto e `statusCode` cru em texto** (`raw.statusCode = "403"`): o tratador de erro do Fastify os produz, e agora são desvio.
- **`writeHead` com objeto de cabeçalhos no 2º ou no 3º argumento:** tratado como acima.
- **`statusMessage`:** o Node recusa CR/LF na frase (`ERR_INVALID_CHAR`), então ela não abre outra linha de status. A frase não faz parte do contrato, e a guarda não a confere na resposta que passa. Na resposta trocada, ela a substitui.
- **401 vindo de `www-authenticate`:** nenhum plugin nem rota do produto escreve esse cabeçalho (busca em `apps/` e `packages/`), e o Node e o Fastify não geram 401 sozinhos. A guarda decide pelo status escrito, com ou sem esse cabeçalho.
- **`reply.code("0x193")`:** o Fastify guarda o inteiro 403, que já era conferido.

### Testes (casos acrescentados)

- `apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 71 para 95 (+24).
  - Dez rotas de status torto, nos dois modos (+20): `code(403.5)`, `code(401.9)`, `code("403.2")`, código do catálogo com 403.5, a `RegraDeNegocio` com `status` trocado para 403.5 depois de construída, `raw.statusCode = "403"`, e `hijack` com `writeHead(4294967699)`, `writeHead(-4294966893)` e `writeHead({ valueOf: () => 401.9 })` e `statusCode = 403.5` implícito.
  - Mais quatro casos:
    - a frase da linha de status;
    - os construtores recusando 403.5, 401.9, `"403"`, 4294967699, 399, 600 e NaN;
    - os controles: 200.5 sai 200, cabeçalho no terceiro argumento segue, e o `valueOf` que muda é lido uma vez e sai 200;
    - HTTP de verdade em porta efêmera, nos dois modos, com cinco formas.
- `apps/api/test/codigos-de-erro.test.ts`: de 171 para 193 (+22). São 19 formas de exemplo, 1 controle (coordenada decimal, status inteiro, `{ status: "indisponivel" }`) e 2 mutações no `rotas/orgaos.ts` real em memória (a forma do red-team e `code("403.2")`).
- `apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 15 para 24 (+9). São quatro formas nos dois modos (403.5, 401.9, `"403.2"` com o código do contrato, `hijack` com 4294967699) e um caso por HTTP de verdade.

### A mordida (cada parte do conserto desfeita, com os testes novos)

- `saidas/20-MORDIDA-guarda-antiga-api.txt`: com a guarda de `1ed0b71`, 22 dos 95 falham. São os 20 casos de status torto, a frase e o HTTP de verdade.
- `saidas/21-MORDIDA-guarda-antiga-console.txt`: 9 dos 24 falham.
- `saidas/22-MORDIDA-varredura-antiga.txt`: com a varredura de `1ed0b71`, 14 dos 193 falham, entre eles a forma do red-team (exemplo e fonte real). As outras 8 formas novas já reprovavam pelas regras antigas: código do catálogo com status diferente do catálogo, status calculado com código fora, ou `statusCode` não literal.
- `saidas/23-MORDIDA-construtores-antigos.txt`: com `RegraDeNegocio` e `AcessoSuspenso` de `1ed0b71`, 1 falha (o caso dos construtores).

### Depois do conserto

- `saidas/10-DEPOIS-sonda-http.txt`, a mesma sonda HTTP:
  - `RegraDeNegocio` com 403.5 sai 500 `erro_interno` nos dois modos, porque o construtor recusa;
  - `code(403.5)`, `code("403.2")` e `code(401.9)` saem 500 `desvio_do_catalogo_de_erro` com 1 desvio em teste, e 403 `sem_permissao` / 401 `nao_autenticado` em produção;
  - o controle segue 401 `nao_autenticado`.
- `saidas/11-DEPOIS-...`: a varredura reprova as quatro linhas plantadas.
- `saidas/12` e `saidas/13`: 288 de 288 (guarda e varredura da API) e 24 de 24 (guarda do console).

### Regressão

- `npm run test:api -- --maxWorkers=4`: 106 arquivos, 1636 passados e 34 pulados, código 0 (`saidas/60`). Eram 1590; os 46 novos são os 24 da guarda e os 22 da varredura. A prova dinâmica passa sem nenhum desvio.
- `npm run test --workspace @dc360/shared`: 223 de 223, código 0 (`saidas/61`).
- `npm run test --workspace @dc360/console`: 283 de 283, código 0 (`saidas/62`). Eram 274.
- `npm run typecheck`: código 0 (`saidas/63`).
- Os três arquivos de teste tocados da API e o do console não entram nos `tsconfig` dos pacotes. Foram conferidos com `tsconfig` temporários: código 0 nos dois (`saidas/64`), e os temporários foram apagados.
- Portão de conteúdo: 10 de 10 (`saidas/65`).
- `npm run test:isolamento`: 345 passados e 3 pulados, código 0 (`saidas/66`).
- `node scripts/conferir-indices-de-evidencia.mjs`: rodado depois de montar os índices. Não é arquivado, porque um arquivo não consegue conter a conferência do índice que o lista.
- README e `docs/COLOCAR-DE-PE.md` não foram tocados nesta correção, e os totais de teste ficam para quem fecha o ramo. A frase do README "toda resposta 401 ou 403 do servidor tem código nele. Quem GARANTE isto é uma guarda em tempo de execução" passa a valer também para status torto.

### Limitações

- O que a guarda não vê continua o mesmo, escrito no módulo e no README:
  - escrita no socket;
  - o método do protótipo chamado por fora da instância;
  - troca das primitivas dela antes da carga, do próprio Node ou do registrador de log.
- O `| 0` é feito pelo operador da linguagem, que não se troca em tempo de execução.
- Status torto que o Node escreve como outro status (200.5 vira 200) passa com o inteiro, sem desvio. Não é resposta de acesso, e os outros status são da V2-F02-E03.
- No desvio por status torto com o corpo no catálogo, o log grava `erroVisto: null`: o código estava certo, o status é que não estava.
- `test:campo`, painel e E2E não foram rodados. Esta correção não toca `apps/web` nem `apps/campo`, e a resposta só muda em status que o produto não emite.

### Parte 4b: a linha de status escrita por baixo de `writeHead` (revisão de `05ab42d`)

**O que a revisão provou** contra `05ab42d`, por HTTP de verdade e nos dois modos: `403 {"erro":"inventado_c6"}` com zero desvios, varredura com 0 problemas e typecheck limpo. A rota chega à resposta do Node por `resposta["ra" + "w"]` ou por `const { raw: r } = resposta`. Depois grava a cabeça por `r._storeHeader("HTTP/1.1 403 Forbidden\r\n", ...)` ou reescreve `r._header` depois de `writeHead(200)`, e chama `r.end(corpo)`.

**Reprodução antes do conserto** (`saidas/30-ANTES-4b-sonda-http.txt`). O `GET /orgaos` real foi plantado (`scripts/plantar-4b.py`) e pedido por HTTP de verdade (`scripts/zz-sonda-e05c4b.test.ts`), com um socket novo por pedido.
- Saem `403` ou `401` com `inventado_c6`, nos dois modos e com 0 desvios: chave calculada, desestruturação, `_header` trocado para 403 e para 401, e `_storeHeader` direto.
- `_writeRaw` com a cabeça pronta (texto, base64, Buffer, depois de um `100 Continue` no mesmo pedaço, linha partida em dois pedaços) e a fila `outputData` saíram com o protocolo quebrado no cliente, sem desvio.
- `saidas/32-ANTES-4b-varredura-com-o-plantio.txt`: a varredura de `05ab42d` reprova as formas com `hijack` e `writeHead`, mas não as linhas 88 a 91 (chave calculada, desestruturação e `_storeHeader` sem `hijack`).

**O que mudou.**
- **Guarda da API e do console, a porta dos bytes.**
  - Além de `writeHead`, `write` e `end`, a guarda envolve `_writeRaw` e `_flushOutput` da mesma instância, também como propriedades não configuráveis e não graváveis. Todo byte da resposta sai por um dos dois.
  - Antes de sair, a guarda lê a linha de status nos bytes, na ordem em que eles saem: primeiro a fila do Node, depois o pedaço. A cabeça provisória 1xx passa, e a seguinte é lida.
  - A resposta inteira é trocada pela do desvio, com `connection: close` e a conexão encerrada no fim, em dois casos: a cabeça final com 401 ou 403 que a própria guarda não conferiu (fora HEAD), e bytes que não começam com uma linha de status.
  - Em teste, a troca é 500 `desvio_do_catalogo_de_erro` com o desvio registrado. Fora de teste, é o genérico do status, com o desvio no log.
  - O que a rota ainda escrever sai vazio. Os retornos, os callbacks e a conta de bytes do Node seguem certos.
  - Byte escrito por `_writeRaw` depois do fim da resposta também sai vazio, com desvio: seria lido como a resposta seguinte da conexão.
  - A guarda marca a cabeça que ela mesma conferiu (`liberado`) antes de mandá-la ao Node.
- **Varredura (`apps/api/test/varredura-de-erros.ts`).** Reprova:
  - chave calculada em qualquer nome que guarde a resposta: os convencionais (`resposta`, `reply`, `rep`, `res`, `resp`, `raw`, `response`), o parâmetro anotado `FastifyReply` ou `ServerResponse`, e os apelidos deles atravessando `as`, parênteses e `!`;
  - desestruturação de `raw`, `socket`, `connection`, de nome interno, ou por chave calculada;
  - o estado interno da resposta do Node: qualquer `._` seguido de letra como propriedade, e a lista `NOMES_INTERNOS_DO_NODE` (`_header`, `_storeHeader`, `_writeRaw`, `_send`, `_flushOutput`, `outputData`, `chunkedEncoding`, ...) em propriedade, texto ou campo de objeto.

  No fonte real da API e do console, nada disso aparece fora dos módulos da guarda, que já são liberados inteiros.
- **O que a guarda não vê**, dito com exatidão no cabeçalho dela, no do catálogo e no parágrafo da guarda no README (as outras mudanças do README neste ramo são de outra etapa):
  - escrita no socket;
  - o método do protótipo chamado por fora da instância;
  - o corpo depois de uma cabeça final que passou. A moldura dele (`content-length`, `chunked`) não é conferida, e bytes escritos por baixo, ANTES do fim, além do tamanho declarado, seriam lidos como a resposta seguinte da conexão.

  A varredura proíbe os três caminhos, mas é heurística.

**Depois do conserto** (`saidas/31-DEPOIS-4b-sonda-http.txt`).
- Nenhuma das onze formas sai com `inventado_c6`.
  - Em teste: 500 com 1 desvio cada.
  - Em produção: 403 `sem_permissao`, ou 401 `nao_autenticado` no `_header` trocado para 401.
- `depois-do-fim` sai `200 {}`, com 1 desvio em teste.
- Na mesma conexão (agente com keep-alive), o pedido seguinte a uma resposta trocada e o seguinte ao `depois-do-fim` saem certos.
- Os controles passam intactos: `ok-403`, `ok-continue` (100 Continue de verdade seguido do 403 do catálogo) e o 401 comum.
- `saidas/33-DEPOIS-4b-varredura-com-o-plantio.txt`: as linhas 88 a 91 reprovam (chave calculada na resposta, desestruturação de `raw`, `._storeHeader`).

**Casos acrescentados na parte 4b:**
- `apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 95 para 108 (+13), todos por HTTP de verdade, nos dois modos:
  - dez formas (`calc-store`, `destruct-store`, `header-trocado`, `header-401`, `writeraw`, `writeraw-base64`, `writeraw-buffer`, `continue-junto`, `linha-partida`, `fila`);
  - os bytes depois do fim, com o pedido seguinte no mesmo socket;
  - a conexão depois da resposta trocada;
  - os controles.

  O servidor de cada modo escuta UMA vez numa porta efêmera, e o teste de HTTP da parte anterior passou a usar a mesma porta.
- `apps/api/test/codigos-de-erro.test.ts`: de 193 para 213 (+20).
  - 17 formas: as três fontes exatas da revisão e catorze variações.
  - 1 controle: chave calculada fora da resposta, laço por índice, desestruturação comum, `__dirname`.
  - 2 mutações no `rotas/orgaos.ts` real, em memória.
- `apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 24 para 27 (+3): `_storeHeader`, `_header` trocado para 401 e `_writeRaw`, por HTTP, nos dois modos.

**A mordida** (o código de `05ab42d` contra os testes novos):
- `saidas/40`: guarda da API, 12 dos 108 falham, ou seja, todos os novos menos os controles.
- `saidas/41`: guarda do console, os 3 novos falham.
- `saidas/42`: varredura, 16 dos 213 falham. Passam com as regras antigas três formas já cobertas (`.raw` com chave calculada, desestruturação por chave calculada, `Object.assign`) e o controle.

**Regressão da parte 4b:**
- `npm run test:api -- --maxWorkers=4`: `saidas/70`;
- console: `saidas/71`;
- shared: `saidas/72`;
- `npm run typecheck`: `saidas/73`;
- `tsconfig` temporários com os testes tocados: código 0 nos dois (`saidas/74`);
- portão de conteúdo: 10 de 10 (`saidas/75`);
- `test:isolamento`: `saidas/76`.

Totais: `test:api` com 106 arquivos, 1669 passados e 34 pulados, código 0 (eram 1636; os 33 novos são 13 da guarda e 20 da varredura). Console 286 de 286 (eram 283). Shared 223 de 223. Typecheck código 0. Isolamento 345 passados e 3 pulados, código 0. `node scripts/conferir-indices-de-evidencia.mjs` foi rodado depois de refazer os índices, com o mesmo motivo de não ser arquivado.

**Limitações da parte 4b.**
- A porta lê no máximo 16 KiB do começo dos bytes para achar as cabeças. Cabeça provisória mais longa que isso é tratada como ilegível e troca a resposta (falha fechada).
- HEAD continua fora da conferência, como antes.
- `inject` (light-my-request) não manda bytes a um socket de verdade. Por isso a porta é provada por HTTP de verdade, e não por `inject`.
- As formas `bigint`, `NaN`, `Infinity` e `-403` da revisão terminam sem resposta (tempo esgotado), como antes: a conversão do status lança erro, igual à do Node, numa rota com `hijack` que ninguém encerra. Não sai 401 nem 403.

## Justificativa

A guarda existe para que a frase "toda resposta 401 ou 403 tem código do catálogo" seja verdade no fio, e o fio é o que o Node escreve, não o que a rota pediu. Comparar o valor pedido deixava um buraco do tamanho da conversão do próprio Node. Por isso a guarda agora faz a mesma conversão, uma vez, e entrega ao Node o número que conferiu: se uma conta pudesse dar um resultado na conferência e outro na escrita, a guarda voltaria a decidir sobre uma coisa e o cliente a receber outra.

Status torto é desvio mesmo com o corpo certo, porque ele só aparece por engano: nenhum ponto do produto o usa, e o engano merece falhar alto em teste.

Os construtores e a varredura recusam o mesmo engano mais cedo, no lugar onde ele é escrito. Isso é defesa em profundidade, e nenhum dos dois é a garantia. A garantia continua sendo a guarda, e os testes dela provam o que ela pega por HTTP de verdade.
