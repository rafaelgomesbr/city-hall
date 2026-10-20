---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Saídas em `SCRATCH/val-qa-r7b/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Os três códigos emitidos e testados (401 `nao_autenticado`, 401 `sessao_encerrada`, 403 `conta_desativada`) | `npm run test:api` 106 arquivos, 1685 aprovados e 34 pulados, código 0 (`40-test-api.txt`); `npm run test:e2e:api` em Chromium (`46-e2e-api.txt`) | PASS |
| Catálogo no shared; teste compara o catálogo com o que o servidor emite | `npm run test --workspace @dc360/shared` 223 de 223 (`42`); `codigos-de-erro.test.ts` dentro do `test:api` | PASS |
| `/auth/entrar` com conta desativada: mesma recusa genérica da senha errada | casos "resistência a enumeração" do `test:api` (`21-plantio-varredura.txt` mostra os dois casos verdes) | PASS |
| Teste negativo: "código fora do catálogo reprova o teste de catálogo" | sonda por HTTP real: uma rota real (`GET /orgaos` e `/saude` do console) responde 403 `inventado_qa7` no fio sem nenhuma das três linhas reprovar (achado 1) | FAIL |
| Correção 4 da rodada 6: status fracionário, texto, `valueOf` | sonda por HTTP real, API e console, dois modos (`10-sonda-api-resumo.txt`, `30-sonda-console-resumo.txt`): `403.00000000001`, `" 403 "`, `"4.03e2"`, `statusCode = 403.5` pelo setter do Fastify, erro com `statusCode: 403.5`, `401.5` no console: todos viram desvio (500 em teste, genérico em produção). NaN, Infinity, -403, 600 e `403n` são recusados pelo `reply.code` do Fastify (500) | PASS |
| README (seção da API) e cabeçalho de `codigos-de-erro.ts` dizem a verdade sobre a garantia | o texto diz que o corpo além do `content-length` declarado só é alcançado "por baixo" (estado interno) e que a varredura proíbe esse caminho; a sonda alcança pela API pública do Fastify com varredura verde (achado 1) | FAIL |
| Regressão obrigatória | `test:api` 0; `test:isolamento` 345 e 3 pulados (gatekeeper); `@dc360/web` 46 arquivos, 699 de 699 (`43`); `test:campo` 139 suítes, 1997 de 1997, código 0 (`44`); console 286 de 286 (`41`); `superficie.test.ts` dentro do `test:api` | PASS |
| E2E do painel (desativar e ver a frase na entrada) | `npm run test:e2e:api` em Chromium: seção 23 ("conta desativada leva a tela de entrada", "e diz que a conta foi desativada", "token vencido + conta desativada... e nao que a sessao foi encerrada"), 288 de 288 na suíte principal e 197 de 197 na de layout, zero erro de console, código 0 (`46-e2e-api.txt`) | PASS |

## Evidência

- `npm run build:shared`: 0 (`00-build-shared.txt`).
- CI: run 39420436042 sobre `55209ab`, 9 de 9 jobs `completed success`, lidos pela API pública (`05-ci-jobs.txt`, 1 pedido).
- Sonda da API: `sondas/zz-qa7-sonda-api.test.ts`, copiada para `apps/api/test/` só durante a execução e apagada depois. Monta o servidor real (`construirServidor`, banco em memória), planta 40 rotas e fala com ele por socket TCP cru em porta efêmera, nos modos "falhar" e "corrigir". Saída bruta `10-sonda-api.txt`, resumo `10-sonda-api-resumo.txt`.
- Controle sem a guarda: `sondas/zz-qa7-controle.test.ts`, Fastify puro contra Fastify com a guarda (`11-controle.txt`).
- Plantio na rota real: `sondas/plantar-qa7.py` em `apps/api/src/rotas/orgaos.ts` (patch em `20-plantio.patch`), `tsc` 0 (`20-plantio-tsc.txt`), varredura e testes da guarda 337 de 337 verdes com o plantio (`21-plantio-varredura.txt`), HTTP real com pipeline (`22-plantio-http-resumo.txt`); desfeito com `git restore`.
- Console: `sondas/zz-qa7-console.test.ts` sobre `subirConsoleDeTeste` escutando em porta efêmera (`30-sonda-console-resumo.txt`); plantio em `apps/console/src/servidor.ts` (`23-plantio-console.patch`), `tsc` 0, varredura 229 de 229 e guarda do console verdes com o plantio (`24`, `25`); desfeito com `git restore`.
- Regressão: `40-test-api.txt` (código 0), `41-test-console.txt` (0), `42-test-shared.txt` (0), `43-test-web.txt` (0), `44-test-campo.txt`, `46-e2e-api.txt`.

## Cenários positivos

- Controle `403 {"erro":"sem_permissao"}` e `403 {"erro":"so_o_dono"}` passam intactos nos dois modos, por HTTP/1.1, HTTP/1.0 e em pipeline.
- Trailer com código do catálogo passa (`11-controle.txt`, `tr-ok`).
- O pedido seguinte na mesma conexão depois de uma resposta trocada sai certo (`pipeline stream-403 + controle-200`).

## Cenários negativos

Todos por HTTP real, nos dois modos, na API e no console. Reprovados corretamente pela guarda (500 com desvio em teste, genérico em produção): status quase inteiro, texto com espaços, notação exponencial em texto, setter `statusCode`, erro com `statusCode` fracionário, `FST_ERR_CTP_*` com 403, corpo em stream, `ReadableStream` da web, `Response` da web com 403, corpo vazio, `redirect(url, 403)`, `onSend` que lança com 403, `code(403)` depois de `send`, corpo gzip, texto puro, corpo com BOM, `raw.statusCode = 403` implícito, `writeHead(403)` com cabeçalhos em lista, `setHeader` mais `flushHeaders` com 401, `Object.create(raw)` com os métodos do protótipo sem `.call` (a porta dos bytes pega: "linha de status 403 escrita por fora da guarda"), `statusCode` por getter que muda entre leituras (a porta pega: "bytes que não começam com uma linha de status"), HTTP/1.0. HEAD sai 403 sem corpo, exclusão declarada.

## Tentativas de reprovar

1. Status torto: NaN, Infinity, negativo, 600, BigInt, `" 403 "`, `"4.03e2"`, `403.00000000001`, setter, erro lançado com `statusCode` 403.5. Não escapou nenhum.
2. Caminhos de escrita: `writeHead` direto, `reply.raw`, `hijack`, `flushHeaders`, `setHeader` antes, `writeHead(403)` seguido de `writeHead(200)`, `code` depois de `send`, `send` duplo, erro em `onSend` e em `onResponse`, stream, resposta vazia, Early Hints antes, HTTP/1.0, keep-alive e pipeline com duas e três respostas. Nenhum escapou pela resposta em si.
3. A moldura do corpo pela API pública (sem `.raw`, sem `hijack`, sem `writeHead`, sem nome interno): `reply.code(200).header("content-length", "2").send(Readable.from(["{}" + "HTTP/1.1 403 ..." + corpo]))`, e o mesmo com `new Response(..., { headers: { "content-length": "2" } })`. ESCAPOU (achado 1).
4. Trailer com código fora do catálogo: a guarda não deixa sair, mas lança exceção não tratada (achado 2).

## Achados

1. **bloqueia.** Resposta 403 com código fora do catálogo no fio, pela API pública do Fastify, sem nenhuma das três linhas reprovar. Reprodução: plantio de `20-plantio.patch` em `GET /orgaos` (atrás do cabeçalho `x-qa7: cl-stream`): `resposta.code(200).header("content-length", "2").type("application/json").send(Readable.from([Buffer.from("{}" + cabeca + corpo)]))`, com `cabeca` = linha de status 403 e `corpo` = `JSON.stringify({ erro: "inventado_qa7", ... })`. O Node não confere o `content-length` (sem `strictContentLength`) e escreve tudo; o Fastify não corrige o `content-length` de stream nem de `Response`. Num socket com dois pedidos em pipeline (o segundo é `GET /orgaos` sem token, que devia receber 401 `nao_autenticado`), o cliente lê: resposta 1 `200 {}`, resposta 2 `403 {"erro":"inventado_qa7","mensagem":"x"}`, e o 401 verdadeiro sobra como terceira. Zero desvios nos modos "falhar" e "corrigir", `tsc` 0, varredura e testes da guarda 337 de 337 verdes, e o mesmo no console (`/saude` plantado, varredura 229 de 229). Isto desmente o README ("bytes escritos por baixo além do tamanho declarado... a varredura reprova o nome interno") e o cabeçalho da guarda ("só se chega aí pelo estado interno da resposta do Node"): chega-se pela API pública. Alcance real: o cliente do Node com keep-alive e os navegadores descartam os bytes que sobram (`22-plantio-http-resumo.txt`, "cliente Node keep-alive"), então quem lê a resposta trocada é cliente ou proxy que faça pipeline ou reaproveite a conexão sem descartar; a garantia escrita, porém, é sobre o que sai no fio. Conserto mínimo sugerido (não implementado): ligar `strictContentLength` na resposta do Node dentro da guarda (o Node então recusa corpo maior que o declarado) ou fazer a porta dos bytes contar o corpo contra o `content-length` da cabeça final; e caso de teste com stream e com `Response`.
2. **corrige antes de crescer.** Resposta 403 com `reply.trailer(...)` e código fora do catálogo: no caminho do desvio, a guarda chama `writeHead` com `content-length` numa resposta com trailer, o Node lança `ERR_HTTP_TRAILER_INVALID` fora de qualquer `try` e a exceção sobe como não tratada (`11-controle.txt`, `tr-inv`, nos dois modos; o vitest registrou "Uncaught Exception"). O cliente fica sem resposta. A API não tem `uncaughtException` (busca em `apps/api/src`), então em produção o processo cairia. Nenhuma rota do produto usa `trailer` hoje (busca), por isso não bloqueia; o vazamento não acontece (falha fechada), mas derruba o processo.
3. **anotado.** `writeHead(403)` seguido de `flushHeaders()` pela resposta crua sai `200` com corpo nunca escrito (o cliente espera até o tempo esgotar): o `_implicitHeader` do Node relê `statusCode`, que a guarda não gravou. Só pela resposta crua, que a varredura proíbe; não vaza código.

## Não verificado

- A frase das três telas e o leitor de tela (validação humana da etapa, E4).
- Cliente real que faça pipeline (proxy do Fly) contra o achado 1: não há como medir aqui; a sonda usa socket TCP cru.
- Firefox e WebKit no E2E: só Chromium rodado.
- Node 22 do `.nvmrc`: rodado em Node 24.15.0; o comportamento do `content-length` não estrito é o padrão desde o Node 18, e o run do CI (Node 22) não exercita a sonda.

## Risco residual

Mesmo com o achado 1 consertado, a escrita no socket continua fora da guarda e só a varredura heurística a pega, como a documentação já declara.

## Motivo do humano

Rafael precisa ler e aprovar as três frases mostradas ao usuário (conteúdo de produto, fluxo de erro crítico e tela pública), e o leitor de tela é avaliação de pessoa.
