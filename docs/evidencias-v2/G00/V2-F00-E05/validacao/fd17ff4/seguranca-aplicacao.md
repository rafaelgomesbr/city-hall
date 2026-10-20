---
validador: seguranca-aplicacao
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
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Todas as sondas rodaram numa CÓPIA do SHA (`git archive fd17ff4 dc360`) em `SCRATCH/val-seguranca/copia/`, com dependências por link simbólico e `build:shared` próprio; nada do repositório foi editado. SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`. Saídas em `SCRATCH/val-seguranca/saidas/`.

| Critério de segurança | Prova | Resultado |
| --- | --- | --- |
| Tentativa independente de escape da guarda de códigos de erro, por HTTP real, na API e no console (obrigatória nesta rodada) | `zz-seg7-sonda-e05.test.ts` (API, 14 formas, modos "falhar" e "corrigir", socket TCP cru com pedidos em pipeline) e `zz-seg7-console.test.ts` (console) | FAIL: escapa pela API pública do Fastify (achado 1) |
| A guarda não derruba o processo | `zz-seg7-trailer.ts`, processo próprio, modo "corrigir" (o de produção) | FAIL: o processo morre com exceção não tratada (achado 2) |
| `/auth/entrar` resiste a enumeração (mesma mensagem, status e tempo) | `zz-seg7-http.test.ts`, 4 casos x 8 rodadas intercaladas por HTTP real, mais município suspenso | PASS |
| Conta desativada distinguível só para quem já tem token ou renovação válidos; nada sobre B | mesma sonda, seção "conta desativada" | PASS |
| 404 de recurso de outro município não muda | mesma sonda, seção "isolamento" | PASS |
| Regressão do diff (`RegraDeNegocio` e `AcessoSuspenso` agora recusam status fora de inteiro 400 a 599 / 403 e 503) | varredura AST de todos os `new RegraDeNegocio`, `new AcessoSuspenso`, `new FalhaAutenticacao` e `super(...)` da API e do console (`scripts/args-regra.cjs`) | PASS: todos os status são literais válidos ou `403 \| 503` tipados de origem fixa |
| O teste da guarda morde | mutação M4 (código fora do catálogo aceito) | PASS: 50 de 108 casos reprovam |

## Evidência

- `10-sonda-api-e05.txt` e `10-sonda-api-e05-vitest.txt`: 29 casos executados, código 0 (o arquivo registra o que chegou no fio; não afirma nada).
- `11-trailer-processo.txt`: caso com código fora do catálogo sai com `exit=1` e `ERR_HTTP_TRAILER_INVALID`; caso de controle com `sem_permissao` responde e o processo segue (`exit=0`).
- `12-sonda-console-e05.txt` e `12-sonda-console-vitest.txt` (a única reprovação é o controle `z-ruim` no modo "falhar", que o apoio "falha alto" do console reprova de propósito).
- `20-sonda-http.txt` e `20-sonda-http-vitest.txt`: 13 de 13, código 0.
- `30-base-verde.txt`: `vigencia-na-escrita`, `familia-da-sessao`, `leitura-do-agente-oficios-e-avisos`, `guarda-de-codigos-de-erro`, `codigos-de-erro`, `enumeracao-pelo-bloqueio`, `senha-provisoria`, `recuperacao`, `saida-de-municipio`, `campo-integracao`: 463 de 463, código 0.
- `70-regressao-seg.txt`: `prova-dinamica-dos-codigos-de-erro`, `superficie`, `acesso-suspenso`, `sessoes-da-conta`, `renovacao-contra-encerramento` e outros: 126 aprovados, 34 pulados (o bloco de Postgres real), código 0; `81-renovacao-postgres-real.txt`: o mesmo arquivo contra PostgreSQL 17.6 real (cluster meu em 127.0.0.1:55431, derrubado), 53 de 53.
- `35-m4-e05-guarda.txt`: mutação M4 em `guarda-de-codigos-de-erro.ts` da cópia, 50 reprovados de 108; arquivo restaurado e conferido com `cmp` contra o do SHA.
- CI: `05-ci-jobs.txt`, run 39420436042 sobre `55209ab`, 9 de 9 jobs `completed success` (1 pedido à API pública).

## Cenários positivos

- `403 {"erro":"sem_permissao"}` direto e em stream passam intactos, nos dois modos e em pipeline.
- Trailer com código do catálogo sai certo e o processo continua de pé.
- Conta suspensa com a senha certa vê `403 acesso_suspenso` (só quem provou a senha).
- Conta desativada com token vê `403 conta_desativada` na escrita e na renovação.

## Cenários negativos

- `/auth/entrar` (HTTP real): ativo com senha errada, desativado com senha certa, desativado com senha errada e email inexistente: uma única resposta `401 {"erro":"credenciais","mensagem":"Email ou senha inválidos."}`, um único conjunto de cabeçalhos, medianas de 243, 243, 243 e 242 ms (mín 239, máx 244). Município suspenso: senha errada e email inexistente iguais (401 genérico).
- Helena desativada escreve na ocorrência dela, numa de B e numa inexistente: as três `403 conta_desativada` com corpo idêntico (B não é confirmado). Renovar: `403 conta_desativada`. Entrar com a senha certa: igual à senha errada.
- Coordenador de B lê, escreve e despacha na ocorrência de A: 404, corpo igual ao de inexistente.
- Formas fora do catálogo pegas (500 em teste, genérico em produção): 403 direto; Early Hints com CRLF no valor (o Node recusa, 500); `content-length` menor com `Buffer` (o Fastify corrige o tamanho).

## Tentativas de reprovar

1. Moldura do corpo pela API pública, sem `.raw`, `hijack`, `writeHead` nem nome interno, com o pedido seguinte da mesma conexão sendo `GET /orgaos` sem token:
   - `code(200).header("content-length","2").send(Readable)` com `{}` + cabeça 403 + corpo `inventado_seg7`: ESCAPOU, nos dois modos, zero desvio registrado.
   - O mesmo com `new Response(..., {headers: {"content-length":"2"}})`: ESCAPOU.
   - O mesmo com `ReadableStream` da web (forma nova, não estava no relatório do QA): ESCAPOU.
   - `content-length: 0` com o stream inteiro sendo a resposta falsa: ESCAPOU, e é a forma mais limpa; o cliente lê `200` vazio, depois `403 {"erro":"inventado_seg7"}` completo, e o 401 verdadeiro sobra como terceira resposta.
   - Console (`/seg7/i-cl0` plantado depois de `subirConsoleDeTeste`): ESCAPOU nos dois modos (`403 {"erro":"inventado_seg7_console"}` antes do `/saude`).
2. 403 do catálogo em stream com `content-length` menor que o corpo: a guarda aceita o corpo e não confere a moldura; sobram bytes na conexão (dessincronização sem código fora do catálogo).
3. `reply.code(102).send(...)` e `code(101)`: a resposta do pedido 1 vira só uma provisória e o cliente lê a resposta do pedido 2 como a do pedido 1 (dessincronização pela API pública; não leva código fora do catálogo; anotado).
4. `transfer-encoding: identity` forjado, 204 e 304 com stream: o corpo é descartado ou lido até o fechamento; não separa resposta.
5. Trailer com 403 fora do catálogo no modo de produção: o processo cai (achado 2).
6. Impacto real com cliente comum: `fetch` (undici) e `http.Agent` keep-alive, pedidos em sequência na mesma conexão: o 403 contrabandeado NÃO é entregue ao pedido seguinte (os dois clientes descartam o socket com dado inesperado). O risco fica para cliente ou proxy que faça pipeline ou reaproveite a conexão sem descartar (envenenamento de fila de respostas).
7. Regressão do diff: procurei status fora de 400 a 599 em toda construção de erro da API e do console (AST): nenhum; as suítes de status (`acesso-suspenso` com 503 na fila, `prova-dinamica` com 12 perfis) verdes.

## Achados

1. **bloqueia.** A guarda que `dc360/README.md` e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` apresentam como GARANTIA não confere a moldura do corpo, e o texto diz que "só se chega aí pelo estado interno da resposta do Node" (`_writeRaw`, `_header`, `outputData`). Chega-se pela API pública do Fastify: `resposta.code(200).header("content-length", "0").send(Readable.from([Buffer.from(cabeca403 + corpoInventado)]))` faz sair no fio um `403` com código fora do catálogo, com zero desvio, na API e no console, nos modos de teste e de produção (`10-sonda-api-e05.txt`, casos `a-stream`, `b-response`, `c-webstream`, `i-cl0`; `12-sonda-console-e05.txt`). Reproduz de forma independente o achado do QA desta rodada e acrescenta duas formas (`ReadableStream` da web e `content-length: 0`). Do ponto de vista de segurança é uma primitiva de dessincronização de resposta (classe CWE-444) que a documentação do controle declara inalcançável; hoje nenhuma rota do produto manda stream com `content-length` (busca em `apps/api/src` e `apps/console/src`: só `rotas/saida.ts`, sem `content-length`), então não é explorável de fora no SHA, e cliente Node e navegador descartam os bytes. Conserto mínimo sugerido (não implementado): `strictContentLength = true` na resposta envolvida pela guarda, ou a porta dos bytes contar o corpo contra o `content-length` da cabeça final; casos de teste com stream, `Response` e `ReadableStream`; README e cabeçalho alinhados.
2. **corrige antes de crescer.** No caminho do desvio a guarda chama `writeHead` com `content-length` numa resposta que tem trailer; o Node lança `ERR_HTTP_TRAILER_INVALID` fora de qualquer `try` e, sem tratador de último recurso, o PROCESSO cai (`11-trailer-processo.txt`, modo "corrigir", `exit=1`). Sem a guarda, o mesmo erro de programação viraria resposta; com ela, vira queda do servidor para qualquer cliente que alcance a rota (ASVS 4.0 7.4.3, tratador de último recurso). Nenhuma rota usa `trailer` hoje.
3. **anotado.** `reply.code(1xx)` como resposta final dessincroniza a conexão pela API pública (a resposta do pedido seguinte é lida como a deste); a varredura não reprova `code(1xx)`.

## Não verificado

- Proxy real de produção (o do Fly) diante do achado 1: não há como medir aqui; só socket cru, `fetch` e `http.Agent`.
- Node 22 do `.nvmrc`: rodado em Node 24.15.0; o `content-length` não estrito é o padrão do Node desde antes da 18, então não espero diferença, mas não rodei.
- A sonda HTTP da API rodou com PGlite e `SET LOCAL ROLE dc360_app` (RLS forçada); só o arquivo de renovação rodou em Postgres real.
- As frases das três telas e o leitor de tela (são de outras dimensões e de pessoa).

## Risco residual

Mesmo com o achado 1 consertado, a escrita direta no socket segue fora da guarda e coberta só pela varredura heurística, como já declarado. A resistência a enumeração está boa hoje; a diferença de tempo medida entre os quatro casos ficou abaixo de 5 ms em 8 rodadas locais, o que não prova ausência de canal de tempo sob carga ou pela rede.

## Motivo do humano

Nada nesta dimensão depende de pessoa: os dois achados são reproduzíveis por máquina. A aprovação das frases da etapa é de outra dimensão.
