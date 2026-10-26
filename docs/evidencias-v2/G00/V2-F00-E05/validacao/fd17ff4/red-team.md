---
validador: red-team
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

Produto de `fd17ff4` numa CÓPIA do SHA (`git archive fd17ff4 dc360`) em `SCRATCH/val-red-team/copia/`, dependências por link simbólico, `build:shared` próprio (`00-build-shared.txt`, código 0). Nada do repositório foi editado. SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Negativo: "código fora do catálogo reprova o teste de catálogo" (a guarda é a garantia) | sonda própria por socket TCP cru, modos "falhar" e "corrigir" (`11-escape-fio.txt`) | FAIL: 403 com código fora do catálogo sai no fio, zero desvio (achado 1) |
| A guarda não derruba o processo | processo próprio, modo "corrigir" (`12-trailer.txt`) | na minha reprodução o caminho do trailer virou 500 e o processo seguiu; a Segurança reproduziu queda com `reply.trailer` (achado 2, confirmado por peer, não por mim) |
| Catálogo no shared; três códigos emitidos; comparação catálogo x servidor | `codigos-de-erro`, `prova-dinamica-dos-codigos-de-erro` verdes (`20-suites-seg.txt`) | PASS |
| Correção 6 (status fracionário/texto/`valueOf`) | `guarda-de-codigos-de-erro` 108 casos verdes; a forma `403.5` da rodada 6 agora é desvio | PASS |
| A guarda morde | mutação `ehAcesso => false` na cópia: 86 de 108 casos reprovam (`21-mutacao-guarda.txt`), arquivo restaurado e `cmp` idêntico ao do SHA | PASS |

## Evidência

- `SCRATCH/val-red-team/saidas/11-escape-fio.txt`: dois pedidos em pipeline na mesma conexão; o cliente lê `{"erro":"inventado_rt7",...}` como resposta 1 e o `HTTP/1.1 401` verdadeiro do pedido 2 depois; nos dois modos; código 0.
- `10-escape-cl.txt`: o mesmo com cliente `node:http` de pedido único: status 200 e corpo vazio/`{}`, o contrabando é descartado (não explorável por cliente que não faz pipeline).
- `12-trailer.txt`: trailer com código fora do catálogo no modo "corrigir" (plantio com `transfer-encoding: chunked` + `addTrailers`): `ERR_HTTP_TRAILER_INVALID` capturado por `writePayload` do Fastify, virou 500, processo seguiu; o controle `sem_permissao` saiu 403.
- `20-suites-seg.txt`: `guarda-de-codigos-de-erro`, `codigos-de-erro`, `prova-dinamica`, 10 suítes, 460 aprovados, 34 pulados (blocos de Postgres real), código 0.
- `21-mutacao-guarda.txt`: mutação, 86 reprovados; restaurado.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 jobs `success` (API pública, 1 pedido).

## Cenários positivos

- `403 {"erro":"sem_permissao"}` direto passa intacto nos dois modos e em pipeline.
- Trailer com código do catálogo responde certo e o processo segue.

## Cenários negativos

- 403 com código fora do catálogo por `code(200).header("content-length","0").send(Readable.from([cabeca403 + corpo]))`: ESCAPA no fio, zero desvio, nos dois modos. É a forma mais limpa (content-length 0).
- Varredura do produto: nenhuma rota emite 401/403 com stream e `content-length`; a única resposta em stream (`rotas/saida.ts:163`) é 200 sem `content-length`. Logo, a forma não é alcançável por cliente externo contra as rotas existentes.

## Tentativas de reprovar

1. Escape da moldura do corpo pela API pública (sem `.raw`, `hijack`, `writeHead` nem nome interno): `content-length: 2` com `Readable`, e `content-length: 0` com o stream inteiro sendo a resposta falsa: ESCAPOU nos dois modos, por socket cru. Reproduz de forma independente o achado de QA e Segurança.
2. Pergunta do gatekeeper (caminho do PRODUTO, sem plantar código): procurei toda rota que manda stream (`grep .send(Readable|new Response`) e todo `content-length` em `apps/api/src` e `apps/console/src`: só `saida.ts` (200, sem length). NENHUM caminho de produto deixa um cliente externo provocar o desvio hoje.
3. Trailer com 403 fora do catálogo (modo produção): na minha reprodução virou 500 (Fastify prende a exceção), processo de pé; não reproduzi a queda que a Segurança viu com `reply.trailer`. Nenhuma rota de produto usa trailer.
4. Isolamento e enumeração do `/auth/entrar` ficam em E09/E10 (relatórios próprios); aqui o foco foi a guarda.

## Achados

1. **bloqueia.** A guarda que `dc360/README.md` e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` apresentam como a GARANTIA de que toda resposta 401/403 carrega código do catálogo não confere a moldura do corpo: um 403 com código fora do catálogo sai no fio pela API pública do Fastify (`code(200).header("content-length","0").send(stream)`), com zero desvio, nos dois modos (`11-escape-fio.txt`). É dessincronização de resposta (CWE-444). O texto do controle afirma que "só se chega aí pelo estado interno da resposta do Node" e que a varredura proíbe esse nome; chega-se pela superfície pública comum. O critério negativo da etapa ("código fora do catálogo reprova o teste de catálogo") e a garantia escrita são FALSOS. Ressalva honesta de atacante: nenhuma rota de produto emite 401/403 em stream com `content-length`, então NÃO é explorável por cliente externo neste SHA; é defeito latente e documentação que promete mais do que entrega. Conserto mínimo (não implementado): `strictContentLength` na resposta envolvida, ou a porta dos bytes contar o corpo contra o `content-length` da cabeça final; caso de teste com stream/`Response`/`ReadableStream`; README e cabeçalho alinhados.
2. **corrige antes de crescer.** Caminho do trailer: no desvio a guarda chama `writeHead` com `content-length` numa resposta com trailer. Na minha reprodução (`addTrailers` cru) o Fastify prendeu a exceção e virou 500; a Segurança reproduziu queda de processo com `reply.trailer`. Nenhuma rota de produto usa trailer; não explorável de fora.

## Não verificado

- Queda de processo pela via `reply.trailer` da Segurança: não reproduzi (a minha via deu 500); registrado como achado de peer.
- Proxy real de borda (Fly) diante do achado 1: sem como medir aqui (só socket cru, que confirma os bytes no fio).
- Node 22 do `.nvmrc`: rodei em Node 24.15.0; `content-length` não estrito é padrão do Node desde antes da 18.
- As três frases das telas e o leitor de tela (UX, acessibilidade e validação humana E4).

## Risco residual

Mesmo não explorável hoje, a garantia escrita é falsa e qualquer rota futura que mande stream num 401/403 abre CWE-444. A escrita direta no socket segue coberta só pela varredura heurística, como a documentação já admite.

## Motivo do humano

Não se aplica a esta dimensão: os achados são reproduzíveis por máquina. A aprovação das três frases é de UX e validação humana.
