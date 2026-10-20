# V2-F00-E05, correção 3: a garantia do catálogo passa a ser uma guarda na resposta do Node

Base: `ca5a38f`, ramo `trab/correcao-5` (correção 4 da E09 sobre `4ce0433`). Motivo: red-team da rodada 5 (SHA `4ce0433`), achado 1, bloqueante: quatro formas de responder 403 com código fora do catálogo passavam caladas pela varredura `apps/api/test/varredura-de-erros.ts` e pela prova dinâmica, desmentindo o cabeçalho de `packages/shared/src/codigos-de-erro.ts` e o README.

A correção tem três partes, em três commits do mesmo ramo:

1. `c55bb43` endureceu a varredura.
2. `7618b89` trocou a garantia por uma guarda `onSend`, depois que uma revisão independente plantou dezesseis formas que a varredura endurecida não lia.
3. Este commit move a guarda para a resposta do Node, depois que uma segunda revisão independente passou pelo `onSend` de três jeitos. Ele também tira dado pessoal do log e corrige o texto que prometia demais.

## Fatos

Patches: `diff-da-correcao-parte-1.patch` (`ca5a38f` a `c55bb43`), `diff-da-correcao-parte-2.patch` (`c55bb43` a `7618b89`) e `diff-da-correcao-parte-3.patch` (este commit). Os três ficam separados porque, entre a parte 2 e a parte 3, a E15 commitou no mesmo ramo, e o diff único levaria as mudanças dela.

### Parte 3 (este commit): a guarda na resposta do Node

**O que a segunda revisão provou** contra `7618b89`. Os arquivos exatos dela estão em `scripts/zz-revisao-escape.test.ts` e `scripts/orgaos.ts.plantado-p1-p3b`; as saídas dela em `saidas/08` e `saidas/09`.

- **Bloqueante:**
  - P1/e01: um `onRoute` do próprio plugin de rotas acrescenta um `onSend` DEPOIS da guarda; `GET /orgaos` saía 401 `vazou_p1` nos dois modos, com 0 desvios.
  - P3/e04: `setNotFoundHandler` do plugin mais um `onSend` do contexto trocando o 404 por 403 `vazou_p3b`.
  - e06: um `onSend` que lança duas vezes faz o tratador de reserva do Fastify escrever direto na resposta do Node um 403 com `code: "vazou_e06"`.
- **Para corrigir agora:**
  - o log de produção gravava o `erroVisto` inteiro (e-mail e CPF plantados, 5342 bytes);
  - o texto dizia "por qualquer caminho" e "último `onSend`", e falava de "globais trocados ANTES"; mas `includes` e `hasOwnProperty` trocados DEPOIS também enganavam a guarda.
- **Anotado:**
  - chave `erro` repetida (`{"erro":"vazou","erro":"sem_permissao"}`) passava;
  - desvio dentro de `afterAll` nunca era lido.

**O que mudou.**

- `apps/api/src/guarda-de-codigos-de-erro.ts` reescrita. Um `onRequest`, instalado logo depois de `Fastify()` e antes de qualquer plugin e rota, troca `writeHead`, `write` e `end` NA resposta do Node de cada pedido. Os três substitutos são propriedades não configuráveis e não graváveis (nem `delete` nem atribuição os desfazem).
  - Com status 401 ou 403 (fora HEAD), eles seguram o cabeçalho e o corpo até o `end`, conferem o corpo inteiro e só então escrevem. O status vem de `writeHead` ou, no cabeçalho implícito, de `statusCode`.
  - Todo caminho do Fastify termina nesses três métodos: ganchos, tratador de erro, 404, tratador de reserva, `hijack` e `raw`. Os ganchos `onSend` da versão anterior saíram.
  - Regras da conferência:
    - corpo JSON com UMA chave `erro`, contada em qualquer profundidade e com escape decodificado, porque o leitor do cliente pode ficar com a primeira;
    - o código tem de estar no catálogo ou na entrada, com o status do catálogo;
    - corpo acima de 64 KiB é desvio.
  - Modo `"falhar"` (teste): 500 `desvio_do_catalogo_de_erro` e o desvio registrado. Modo `"corrigir"`: o código genérico do status. Os cabeçalhos do corpo (`content-length`, `content-type`, `transfer-encoding`, `content-encoding`) são refeitos.
  - O log grava o código visto só se casar com `^[a-z_]{1,64}$`; senão grava o marcador `[fora da forma de um código, não registrado]`. O e17 da revisão (e-mail, CPF e 5000 caracteres) passou de 5342 para 340 bytes no log, sem o dado.
- Primitivas copiadas na carga do módulo: `JSON.parse`, `Reflect.apply`, `Object.defineProperty`, `Object.keys`, `hasOwnProperty`, `RegExp.exec`, `Array.isArray`, `Buffer.from`/`concat`/`byteLength`/`toString`, `String.charCodeAt`/`fromCharCode`/`toLowerCase` e `process.nextTick`.
  - No caminho da decisão, só essas cópias são chamadas: sem `includes`, sem `JSON.stringify`, sem iterador nem espalhamento de array.
  - O corpo genérico é montado à mão, sem `JSON.stringify` nem `replace`.
- A mesma guarda na cópia do console, com o contrato dele.
- `test/guarda-falha-alto.ts` (API) e `test/apoio/guarda-falha-alto.ts` (console) ganharam um `afterAll`, que pega desvio saído num `afterAll` do arquivo. Pela ordem de pilha do vitest, ele roda depois dos do arquivo.
- Varredura: o repasse aceita `chave: "*"` para liberar um ARQUIVO INTEIRO. Isso vale só para os dois módulos da guarda (ela mexe em `.raw` de propósito), e o teste prova que não vale para outro arquivo.
- Cabeçalho do catálogo, README, cabeçalhos dos módulos e dos testes: descrevem a conferência na resposta do Node. O "por qualquer caminho", o "último `onSend`" e o "ANTES de a guarda carregar" saíram. O que a guarda não vê ficou escrito:
  - escrita no socket, que não passa pela resposta do Node;
  - método do protótipo chamado por fora da instância (`.call`, `.apply`, `Reflect`).

  A varredura proíbe os dois, mas é heurística. Nenhuma linha prende código que troque as primitivas antes da carga, o próprio Node ou o registrador de log.

**A guarda morde.**

- `apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 49 para 71 casos.
  - Entram os dezesseis escapes da revisão, com a função de plantio dela copiada sem mudar uma linha. Em teste, cada um sai 500 com 1 desvio; em produção sai 401 `nao_autenticado` ou 403 `sem_permissao`.
  - Também entram: o e08 (500 `erro_interno`, que não é de acesso), o e17 (log sem o dado), e `includes`, `hasOwnProperty`, `JSON.parse` e `JSON.stringify` trocados com o servidor de pé (a guarda não é enganada).
  - Na conferência isolada entram a chave repetida (com e sem escape), a chave `erro` aninhada e o teto.
  - Com a guarda DESLIGADA: 54 falham e 17 passam (`saidas/06`).
- `apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 9 para 15. Entram e01 (`onRoute` de plugin), e06 (`onSend` que lança duas vezes) e e15 (chave repetida), nos dois modos.
- Os arquivos EXATOS da revisão, rodados contra este commit:
  - `zz-revisao-escape.test.ts`, posto em `apps/api/test/` só durante a execução e apagado depois: todos os 17 casos saem "pego", em teste e em produção, e o e08 continua 500 (`saidas/90`; antes, `saidas/08`).
  - `orgaos.ts.plantado-p1-p3b`, copiado sobre `rotas/orgaos.ts` e restaurado, com `scripts/sonda-p1-p3b.mts`: P1 e P3b saem 500 com 1 desvio em teste, e 401 `nao_autenticado` / 403 `sem_permissao` em produção, com o desvio no log (`saidas/91`; antes, `saidas/09`).
- As dezesseis formas da primeira revisão, de novo no `rotas/orgaos.ts` real (`saidas/70` a `85`):
  - 15 são pegas nos dois modos;
  - M08 (socket) continua saindo `403 {"erro":"vazou_m08"}` por HTTP de verdade (porta 5310), e é a varredura que o reprova (`.socket`).

### Parte 2 (`7618b89`): a guarda como `onSend`

- A primeira revisão independente (`saidas/07`, relatório dela) plantou contra `c55bb43` dezesseis formas que deixavam a varredura verde e respondiam 403 fora do catálogo:
  - M01 `new mod[k](...)`, M02 `new (e.constructor)(...)`, M03 `e[campo] = "x"`, M04 `Object` apelidado;
  - M05 `globalThis.Object.defineProperty`, M06 membro `"codigo"` entre aspas, M07 `onSend` nas opções da rota, M08 socket;
  - M09 `JSON.stringify` trocado, M10 `resposta[campo] = 403`, M11 `code(200).code(403)`, M12 `Proxy`;
  - M13 parâmetro desestruturado homônimo, M14 variável de laço homônima, M15 `status` por chave, M16 arquivo `.mts`.
- A parte 2 criou a guarda (então um `onSend` global e o último `onSend` de cada rota), os dois modos, o "falha alto" em `setupFiles` da API e do console, e o contrato do console no próprio console. Também trouxe três ajustes na varredura: `.socket`/`.connection` reprovam, vale o `code` mais perto do `send`, e o `addHook` ganhou chave.
- A parte 3 trocou o mecanismo, não o contrato nem os modos.

### Parte 1 (`c55bb43`): a varredura contra as quatro formas do red-team

- As formas A (campo trocado), B (`let` reatribuída), C (colchete) e N (`statusCode` abreviado com `FST_ERR_CTP_*`) passavam em `ca5a38f` (`saidas/01` a `04`).
- A varredura ganhou regras que falham para o lado seguro (corpo por constante só lido pelo escopo, escrita em `erro`/`corpo`, colchete, `.call`/`.apply`/`.bind`, chave calculada, `FST_`, classe forjada, `toJSON`, serializador, `eval`, `redirect`), mais seis repasses conferidos.
- As nove mutações do script do red-team reprovam (`saidas/30` a `43`, estado `c55bb43`).

### Números e regressão (estado final, neste worktree, máquina sob carga de outras sessões)

- `codigos-de-erro.test.ts`: 171 casos. Contra a varredura de `ca5a38f` (`saidas/05`), 51 falham e 120 passam. Falham:
  - as 6 mutações reais e as 42 formas da família que ela não lia;
  - os 2 casos do fonte real (sem a chave do `addHook` e sem o repasse de arquivo inteiro, os módulos da guarda reprovam);
  - o caso do repasse por arquivo.
- `guarda-de-codigos-de-erro.test.ts`: 71 na API e 15 no console.
- `scripts/baseline.mjs`: `V2-F00-E05-correcao-3` vai a `total: 126` na API (53 + 2 + 49 + 22), e o passo `teste-console` vai a 274.
- `npm run test:api`: 106 arquivos, 1590 passados e 34 pulados, código 0. Inclui a prova dinâmica, cujos pedidos passam todos pela guarda em modo "falhar" sem nenhum desvio (o apoio de "falha alto" reprovaria; `saidas/60`).
- `npm run test --workspace @dc360/shared`: 185 de 185 (`saidas/61`). Console: 274 de 274 (`saidas/62`).
- `npm run typecheck`: código 0 (`saidas/63`). Os testes novos e alterados da API e do console, que não entram nos `tsconfig` dos pacotes, foram conferidos com `tsconfig` temporários: código 0 nos dois, e os temporários foram apagados.
- `npm run conferir:numeros`: código 0 (`saidas/64`), depois de README (1590 da API, 274 do console, 3313 em seis pacotes) e `docs/COLOCAR-DE-PE.md` (5255).
- Portão de conteúdo: 10 de 10 (`saidas/65`).
- `node scripts/conferir-indices-de-evidencia.mjs`: "RESULTADO: OK" depois de refazer os índices. Não é arquivado, porque um arquivo não consegue conter a conferência do índice que o lista.

**Limitações.**

- A guarda vale só para 401 e 403. Os outros status são da V2-F02-E03.
- Ela não vê:
  - escrita no socket;
  - o método do protótipo do `ServerResponse` chamado por fora da instância;
  - código que troque, antes da carga dela, as primitivas que ela copia;
  - quem troque o próprio Node (o protótipo, `removeHeader`) ou o registrador de log.

  A varredura proíbe as duas primeiras, mas é heurística.
- O módulo da guarda é liberado inteiro na varredura. Quem o prova é o teste dele.
- A guarda do console é cópia da da API, presa por testes próprios.
- Uma resposta 401 ou 403 é segurada inteira na memória até o `end`, com teto de 64 KiB; acima disso vira desvio.
- `test:isolamento`, painel e campo não foram rodados (`apps/campo` não foi tocado).

## Justificativa

Um teste do texto não fecha uma classe de comportamento. E um gancho do Fastify também não fecha, porque o próprio Fastify oferece caminhos que não passam por ele: gancho acrescentado depois, 404 de plugin, tratador de reserva escrevendo direto na resposta do Node. O único ponto por onde toda resposta HTTP do processo passa antes de virar bytes é a resposta do Node, e é ali que a guarda está agora, presa à instância de cada pedido de um jeito que o código da rota não desfaz.

Em teste, ela falha alto e prende o defeito no caso que o produziu, inclusive num `afterAll`. Em produção, ela não derruba o pedido: entrega ao cliente um código que ele sabe tratar e deixa o desvio no log, sem gravar o que não tem forma de código, porque o campo `erro` é escrito pela rota e pode carregar dado pessoal.

Copiar as primitivas na carga e só chamar as cópias ao decidir é o que torna verdadeira a frase "trocar o global depois não a engana", e o teste a prova. O que continua fora (socket, protótipo chamado por fora, troca antes da carga) está escrito com nome, porque prometer mais do que se prende foi o que reprovou as rodadas anteriores.
