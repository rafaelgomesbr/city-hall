# V2-F00-E23: teste de contrato mínimo painel x API

Data: 2026-10-07. Executor: Claude (agente da etapa). Nada commitado.

## O que foi feito

- `dc360/apps/api/test/contrato-do-painel.test.ts` (novo, 12 casos). Monta o servidor como `superficie.test.ts`, lê as rotas pelo `printRoutes` do Fastify montado e lê `dc360/apps/web/src/dados/http.ts` como texto. De cada `chamar(` e `fetch(` tira o método (`metodo:` ou `method:` literal; GET quando ausente) e o caminho (interpolação que ocupa um segmento vira `:p`, query sai, inclusive a montada por ternário no fim do caminho). Exige que `MÉTODO caminho` exista entre as rotas registradas, com os parâmetros da rota também normalizados para `:p`. Forma que o extrator não entende é registrada como "não lida" e reprova; ele nunca adivinha.
- A interpolação `${tipo}` de `abrirDocumento` não é parâmetro de rota: a API registra uma rota por documento. Ela se expande pelos valores da união `TipoDeDocumento` de `apps/web/src/dados/tipos.ts` (lida do arquivo), e cada um dos cinco precisa ter rota. Não é exceção: é conferência mais forte.
- Âncora contra extrator cego: `contarChamadas` conta `chamar(`, `chamar<` e `fetch(` por expressão regular nas linhas que não são comentário (caminho independente do extrator) e o teste exige `extraídas + mecanismo = contadas`, com piso de 70. Hoje: 74 contadas, 71 extraídas, 3 do próprio mecanismo (a definição de `chamar`, a repetição depois de renovar e o `fetch` genérico dentro de `chamar`), cada uma exigida exatamente uma vez.
- Chamadas sem token (`semSessao: true`, ou `fetch` sem `authorization`) precisam estar em `SEM_TOKEN`: hoje `POST /auth/renovar`, `POST /auth/sair`, `POST /auth/recuperar`, `GET /auth/recuperacao`, `POST /auth/redefinir`, todas isentas. O teste não concede nem testa acesso.
- Lista de exceções (`EXCECOES`) vazia: todas as 71 chamadas casam com rota registrada. Entrada nova exige etapa dona no motivo, e entrada que deixa de ser usada reprova.
- `dc360/apps/api/test/superficie-registrada.ts` (novo, apoio, não conta como teste): a leitura de `printRoutes` (`rotasRegistradas`) e a lista `SEM_TOKEN` foram MOVIDAS de `superficie.test.ts` sem mudar uma linha da lógica nem caso nenhum, para os dois testes usarem a mesma leitura e a mesma lista (duas cópias do parser divergiriam). `superficie.test.ts` segue com os mesmos 9 casos, verdes.
- `dc360/README.md`, "Como testar": parágrafo do contrato mínimo, dizendo que é a versão mínima e que a F02-E05 a generaliza (campo, console, OpenAPI da F02-E04). Contagens corrigidas para o `conferir:numeros` fechar: API 1255 para 1267, `npm test` 2839 para 2851; `docs/COLOCAR-DE-PE.md` 4700 para 4712.
- `dc360/scripts/baseline.mjs`: `"V2-F00-E23": { total: 12, falhas: 0, puladas: 0 }` no teste da API.

## Casos (saída em `saidas/contrato-do-painel-verde.txt`)

Contra a árvore atual: rotas lidas e com `POST /saida/pacote.zip` (e sem `POST /pacote.zip`); cada chamada casa; âncora; sem token só nas isenções; exceções sem entrada morta; expansão dos tipos de documento. Sintéticos: o caminho certo do pacote passa (controle); `POST /pacote.zip` reprova; `GET /saida/pacote.zip` (método errado) reprova; `/ocorrencias/triagem` sem o parâmetro reprova, com o controle `/ocorrencias/${id}/triagem` passando; chamada com caminho em variável aparece como não lida e fura a âncora; extrator que perde uma chamada (o real com a última descartada) fica uma abaixo da contagem.

## Sonda no arquivo real

`apps/web/src/dados/http.ts` linha 1098 trocada de `"/saida/pacote.zip"` para `"/pacote.zip"` (uma ocorrência) e o teste rodado: 1 falha, 11 passam, código 1, com a mensagem `"POST /pacote.zip (http.ts linha 1098)"` em "o painel chama rota que a API não registra" (`saidas/sonda-pacote-zip-no-http-ts-vermelha.txt`). Arquivo restaurado da cópia; SHA-256 antes e depois iguais, `3e52870ab0e932df909ab1f329a36c43e0dd8cfe2017ef8aa664356944bda9e0` (`saidas/sonda-sha256-do-http-ts.txt`).

## Resultados medidos (2026-10-07)

| Comando | Antes | Depois |
| --- | --- | --- |
| `npm run test:api` | 1255 passam, 0 falhas, 0 pulados, código 0 | 1267 passam, 0 falhas, 0 pulados, código 0 (97 arquivos) |
| `npm run test --workspace @dc360/web` | 643, código 0 | 643, código 0 |
| `npm run test:isolamento` | (não rodado antes) | 327 passam, 3 pulados por ambiente, código 0 |
| `npm test` (raiz) | | código 0 (187, 168, 1267, 259, 643, 327 e 3 pulados) |
| `npm run typecheck` | | código 0 |
| `npm run test:scripts` | | 206, 0 falhas, 4 pulados, código 0 |
| `npm run conferir:numeros` | | 5 divergências (contagens que a etapa mudou), corrigidas; depois 24 conferidas, 0 divergências |
| `regras-de-conteudo.test.ts` | | 8 de 8 |
| `baseline.mjs --so=typecheck,teste-db,teste-api,teste-web,test-scripts,conferir-numeros` | | 6 de 6 conferem (`saidas/baseline/`) |

Nenhum vermelho novo. Os vermelhos conhecidos que não são desta etapa (`auditar`, `npm audit`, `expo-doctor`, E19 bloqueada pelo CP-03) não foram rodados aqui.

## Limitações

- O extrator é por texto e só entende as formas que o arquivo usa hoje (caminho literal ou template, `metodo` literal). Forma nova não reprova em silêncio: vira "não lida" e o teste fica vermelho até o extrator aprender ou a chamada mudar.
- Confere só existência de rota com método. Corpo, resposta, `/v1`, cliente gerado, app de campo e console ficam para a F02-E01, F02-E04 e F02-E05.
- A sonda foi feita por mim; a validação humana pedida pela etapa (Rafael ver o teste reprovar com `/pacote.zip` reintroduzido numa cópia de trabalho) fica pendente.
- O item "contrato painel x API" do G00 não foi marcado: item de gate só se marca no próprio gate.
