# V2-F00-E05, correção 3: a garantia do catálogo passa a ser uma guarda em tempo de execução

Base: `ca5a38f`, ramo `trab/correcao-5` (correção 4 da E09 sobre `4ce0433`). Motivo: red-team da rodada 5 (SHA `4ce0433`), achado 1, bloqueante: quatro formas de responder 403 com código fora do catálogo passavam caladas pela varredura `apps/api/test/varredura-de-erros.ts` e pela prova dinâmica, desmentindo o cabeçalho de `packages/shared/src/codigos-de-erro.ts` e o README.

A correção tem duas partes, em dois commits do mesmo ramo. A primeira (`c55bb43`) endureceu a varredura contra as quatro formas e a família delas. Uma revisão independente (Opus) plantou depois dezesseis formas NOVAS que a varredura endurecida ainda não lia, e mostrou que o texto ("o que sobra se resume a duas formas") era falso. A segunda parte (este commit) muda a garantia: ela passa a ser uma guarda que confere a RESPOSTA em tempo de execução, e a varredura vira a primeira linha, declarada heurística.

## Fatos

### Parte 2: a guarda em tempo de execução

**O defeito que a revisão provou** (`saidas/07`, cópia do relatório dela): com `c55bb43`, dezesseis formas plantadas em `POST /orgaos`, todas com `tsc` limpo, deixavam a varredura da API verde e faziam o servidor responder 403 com código fora do catálogo: M01 `new mod[k](...)`, M02 `new (e.constructor)(...)`, M03 `e[campo] = "x"`, M04 `Object` apelidado, M05 `globalThis.Object.defineProperty`, M06 membro `"codigo"` entre aspas, M07 `onSend` nas opções da rota, M08 escrita no socket, M09 `JSON.stringify` trocado, M10 `resposta[campo] = 403` com o corpo no `return`, M11 `code(200).code(403)`, M12 `Proxy` no erro, M13 parâmetro desestruturado homônimo, M14 variável de laço homônima, M15 `status` escrito por chave, M16 arquivo `.mts`.

**O que mudou.**

- `apps/api/src/guarda-de-codigos-de-erro.ts` (novo): um gancho `onSend` instalado logo depois de `Fastify()`, antes da primeira rota, em dois lugares: global (pega o 404 do roteador e o que não tem rota) e como ÚLTIMO `onSend` de cada rota, acrescentado por um `onRoute`. O Fastify roda os ganchos do contexto antes dos das opções da rota, e por isso só no fim da lista da rota ela vê o corpo depois de um `onSend` posto nas opções (M07). Para toda resposta 401 ou 403, o corpo tem de ser JSON com `erro` do catálogo ou da lista da entrada E o status que o catálogo dá ao código (`acesso_suspenso` 403 ou 503). Fora disso:
  - modo `"falhar"` (padrão quando `NODE_ENV=test`): a resposta vira 500 `desvio_do_catalogo_de_erro`, com método, rota e motivo na mensagem, e o desvio fica registrado;
  - modo `"corrigir"` (padrão fora de teste): a resposta sai com o código genérico do catálogo para o status, 401 `nao_autenticado` ou 403 `sem_permissao`, com a frase do catálogo. O desvio vai para o log (`desvioDoCatalogo`: método, rota no molde e não a barra de endereço, status, código visto e motivo).
  - A guarda guarda `JSON.parse` na carga do módulo e monta o corpo genérico sem `JSON.stringify`, para um `JSON` trocado depois não a enganar (M09).
  - HEAD é deixado passar: o HTTP não leva corpo nele, e o GET gêmeo da mesma rota é conferido. Achado ao rodar `test:api`: as sondas HEAD de `acesso-suspenso.test.ts` e `get-com-efeito.test.ts` caíam como "resposta sem corpo".
- `apps/api/src/servidor.ts`: instala a guarda com o contrato da API. `Dependencias.modoDaGuarda` é opcional, e só o teste da guarda o passa, para provar o modo de produção.
- `apps/api/test/guarda-falha-alto.ts` (novo, em `setupFiles` de `apps/api/vitest.config.ts`): depois de CADA caso da suíte da API, lê os desvios registrados e reprova se houver algum. Assim, todo teste que passar por uma resposta 401 ou 403 fora do catálogo reprova, confira ele o que conferir.
- Console do fornecedor: a mesma guarda em `apps/console/src/guarda-de-codigos-de-erro.ts`. É uma cópia, porque o console é outro processo com outro deploy e não depende de pacote do produto em tempo de execução. Usa o contrato do console (`CONTRATO_DE_ACESSO_DO_CONSOLE`, que saiu do teste da varredura e agora é importado por ele) e o genérico 401 `sem_sessao` / 403 `so_o_dono`. Também ganhou `setupFiles` com `test/apoio/guarda-falha-alto.ts` e o parâmetro `modoDaGuarda` em `subirConsoleDeTeste`.
- Varredura (`apps/api/test/varredura-de-erros.ts`), três ajustes:
  - `.socket` e `.connection` reprovam, porque a escrita no socket (M08) é a forma que a guarda não vê;
  - no `code(...)` repetido numa cadeia vale o mais perto do `send` (M11);
  - o problema do `addHook` passou a ter chave (`gancho:<tipo>:<callback>`), para a própria guarda entrar como repasse conferido, na API e no console.
  - O cabeçalho dela diz que ela é heurística.
- Documentação: o cabeçalho do catálogo e o README ("Códigos de erro de acesso") dizem que a garantia é a guarda, que a varredura e a prova dinâmica são linhas anteriores e nenhuma é garantia sozinha. O "se resume a duas formas" saiu. O que nenhuma das três cobre ficou nomeado:
  - resposta que não passa pelo Fastify: `raw`, `hijack`, `writeHead` e o socket. A guarda não a vê; a varredura a proíbe, mas é heurística;
  - código no mesmo processo que reescreve o Fastify, o protótipo da resposta ou os globais ANTES de a guarda carregar.

**A guarda morde.**

- `apps/api/test/guarda-de-codigos-de-erro.test.ts` (novo, 49 casos):
  - as dezesseis formas como rotas de verdade no servidor real (M08 fica de fora: é a que a guarda não vê; M16 é uma função de fora do arquivo da rota), mais "sem corpo" e "texto";
  - em modo `"falhar"`, cada uma sai 500 `desvio_do_catalogo_de_erro` com o desvio registrado (rota e código visto); em modo `"corrigir"`, cada uma sai 403 `sem_permissao` com a frase do catálogo, `content-type` JSON, e o desvio no log com a rota;
  - também: M09 com `JSON.stringify` trocado nos dois modos, código do catálogo com status trocado, 401 fora (vira `nao_autenticado`), HEAD, controles (catálogo, entrada, 503 `acesso_suspenso` e 200 passam intactos) e 10 casos da conferência do corpo isolada.
  - Com a guarda DESLIGADA (uma linha temporária de prova, já removida): 36 falham e 13 passam (`saidas/06`). Os 13 que passam são os 10 da conferência isolada, os controles e o HEAD.
- `apps/console/test/guarda-de-codigos-de-erro.test.ts` (novo, 9 casos): M07, M10 (401), M11 e M16 nos dois modos, e o controle.
- As dezesseis formas da revisão, plantadas uma a uma no `rotas/orgaos.ts` REAL com o script dela (`scripts/mutacoes-da-revisao.mjs`; `scripts/plantar-e-pedir.mjs` planta, sobe a API nos dois modos com `scripts/servidor-com-guarda.mts`, pede `POST /orgaos` como coordenador e como agente de campo, roda a varredura e restaura; saídas `70` a `85`):
  - 15 de 16 são pegas pela guarda nos dois modos. Em teste, 500 `desvio_do_catalogo_de_erro` com o desvio registrado; em produção, 403 `sem_permissao` com o desvio no log. M07 e M09 aparecem pelo agente, que é quem recebe o 403 que elas reescrevem. M11 também por HTTP de verdade (porta 5311): 403 `sem_permissao`.
  - M08 (socket) NÃO é pego pela guarda: por HTTP de verdade (porta 5310) sai `403 {"erro":"vazou_m08"}`. Pelo `inject` sai 500. Ele é pego pela varredura, que agora reprova `.socket` (VERMELHA na saída `77`).
  - A varredura fica VERDE em 14 das 16 e VERMELHA em M08 e M11. É exatamente o que a torna heurística, e não garantia.

### Parte 1 (`c55bb43`): a varredura contra as quatro formas do red-team

- As quatro formas, reproduzidas em `ca5a38f` com o script do red-team (`scripts/mutar-e05.mjs`, sem alteração): A (`recusa.erro = "x"` depois de declarar), B (`let` reatribuída), C (`resposta["code"](403)["send"](...)`) e N (`statusCode` abreviado com `code: "FST_ERR_CTP_*"`) deixavam `tsc` 0 e `codigos-de-erro.test.ts` 116 de 116 (`saidas/01` a `04`).
- Regras novas da varredura, todas falhando para o lado seguro:
  - corpo por nome só lido quando resolve, pelo escopo, a um `const` não exportado, com objeto literal e só lido no arquivo;
  - escrita em `erro`/`corpo` por qualquer forma;
  - colchete nos nomes lidos com ponto, chamada por chave calculada, `.send` sem ser chamado, `.call`/`.apply`/`.bind`;
  - `statusCode` abreviado, por método ou por acessor; chave calculada que não resolve; texto com `FST_`; classe forjada (`setPrototypeOf`, `Object.create`, `__proto__`, `extends` de expressão);
  - `toJSON`, serializador, `eval`, `Function`, `redirect` fora de 3xx.
  - Seis repasses conferidos no fonte real, cada um com o porquê.
- As nove mutações do script do red-team reprovam (`saidas/30` a `38`), e a prova dinâmica continua verde sob as quatro (`saidas/40` a `43`). Estas saídas são do estado `c55bb43`: "7 failed | 162 passed (169)" é a varredura da API mais os seis casos em memória cuja âncora some com o disco mutado.

### Números e regressão (estado final, neste worktree, máquina sob carga de outra sessão)

- `codigos-de-erro.test.ts`: 116 em `ca5a38f`, 171 agora. A parte 1 deu +53 e a parte 2 deu +2 (S7 socket, S8 `code(200).code(403)`).
  - Contra a varredura de `ca5a38f` (`saidas/05`): 50 falham e 121 passam. Falham as 6 mutações reais, 42 formas da família e os 2 casos do fonte real (API e console). Os dois últimos falham porque a varredura antiga não tem chave no problema do `addHook`, e a guarda é um `onSend`.
- Testes novos: `guarda-de-codigos-de-erro.test.ts` 49 (API) e 9 (console). `scripts/baseline.mjs`: a entrada `V2-F00-E05-correcao-3` da API vai a `total: 104` (53 + 2 + 49), e o passo `teste-console` vai de 259 para 268.
- `npm run test:api`: 106 arquivos, 1568 passados e 34 pulados, código 0 (`saidas/60`). A primeira rodada com a guarda reprovou 5 casos de dois arquivos, todos sonda HEAD; foi o que levou à regra do HEAD acima.
- `npm run test --workspace @dc360/shared`: 185 de 185 (`saidas/61`). `npm run test --workspace @dc360/console`: 268 de 268 (`saidas/62`).
- `npm run typecheck`: código 0 (`saidas/63`). Os arquivos de teste novos e alterados (API e console) não entram nos `tsconfig` dos pacotes. Foram conferidos à parte, com `tsconfig` temporários que os incluem: código 0 nos dois, e os temporários foram apagados.
- `npm run conferir:numeros`: código 0 (`saidas/64`), depois de README (1568 testes da API, 268 do console, 3285 em seis pacotes) e `docs/COLOCAR-DE-PE.md` (5217).
- Portão de conteúdo: 10 de 10 (`saidas/65`).
- `node scripts/conferir-indices-de-evidencia.mjs` (a partir de `dc360/`): rodado depois de refazer os índices, "RESULTADO: OK". A saída não é arquivada, porque um arquivo não consegue conter a conferência do índice que o lista.

**Limitações.**

- A guarda vale só para 401 e 403. Os outros status são da V2-F02-E03.
- A guarda não vê resposta escrita fora do Fastify (socket, `raw`, `hijack`, `writeHead`), nem código do mesmo processo que reescreva o Fastify ou os globais antes de ela carregar. A varredura proíbe as quatro primeiras, mas é heurística.
- A guarda do console é uma cópia da da API. As duas são presas por testes próprios, mas uma mudança numa não muda a outra.
- `test:isolamento`, painel e campo não foram rodados. A guarda só reescreve respostas 401 e 403 fora do catálogo, e a suíte da API inteira, que passa por todas as rotas, ficou verde com ela em modo `"falhar"`.
- Nenhuma tela mudou; não há captura de tela.

## Justificativa

Um teste do texto não fecha uma classe de comportamento: a cada regra nova da varredura, a revisão seguinte achou a forma que ela não lia (quatro na rodada 5, dezesseis depois da primeira parte desta correção). O que o critério da etapa protege é a RESPOSTA que o cliente recebe, e a resposta só existe em tempo de execução. Por isso a garantia passou para o único ponto por onde toda resposta do Fastify passa, o `onSend`, posto por último em cada rota. Em teste ela falha alto e prende o defeito no caso que o produziu. Em produção ela não derruba o pedido: entrega ao cliente um código que ele sabe tratar (o genérico do status) e deixa o desvio no log, porque um erro de acesso com código desconhecido vira "erro comum" no painel e no aplicativo, sem a ação certa.

A varredura continua, como primeira linha. Ela aponta o defeito no texto, antes de rodar, e é a única coisa que alcança o que a guarda não vê: a escrita fora do Fastify. O texto agora diz isso sem prometer mais.
