# V2-F02-E04, parte 4B: limites do gerador do contrato OpenAPI

## Fatos

**O que mudou (ramo `trab/f02-4b-gerador-openapi`, base `origin/v2/f02` em `35830cb`):**

- `apps/api/src/contrato/tipos.ts`: a entrada ganhou `tambemResponde?: readonly { status; descricao; resposta? }[]` (tipo `RespostaAdicionalDoContrato`). `resposta` é um esquema Zod opcional: ausente, vale o corpo (esquema ou tipo de mídia) da resposta principal, que é o caso do reenvio idempotente.
- `apps/api/src/contrato/openapi.ts`, `respostasDe`: cada item de `tambemResponde` sai como resposta adicional da operação. O gerador FALHA (erro com a chave `MÉTODO caminho` e o status) se o status adicional repete a principal ou outro adicional, se colide com um status de erro da entrada, ou se a entrada tem `tambemResponde` sem `resposta` principal. Antes, o erro sobrescrevia em silêncio uma resposta de mesmo status.
- `apps/api/src/contrato/openapi.ts`, `refinamentosDe`: a visita agora é por CAMINHO. O `WeakSet` de esquemas virou um mapa (esquema, conjunto de caminhos) mais a cadeia de ancestrais: o mesmo esquema em dois campos gera uma anotação por caminho; o par (esquema, caminho) nunca repete (união com a mesma opção duas vezes, `optional` em volta); e um esquema que já está na cadeia de quem o contém é pulado, então esquema recursivo (`get` que devolve o próprio esquema) termina. `operacoesSemAnotacaoDeRegras` continua comparando contagem com contagem, agora com a contagem certa.
- As quatro entradas declaram o 200 do reenvio: `POST /v1/ocorrencias` (`grupos/ocorrencias.ts`), `POST /v1/sincronizacao/vistoria`, `POST /v1/sincronizacao/devolucao` e `POST /v1/saida-a-campo` (`grupos/campo.ts`). Nos dois arquivos de grupo só mexi nessas quatro entradas e nos dois comentários de cabeçalho que diziam "o registro só comporta um status". Em `grupos/mapa-e-busca.ts` só o `resumo` de `POST /v1/rota`, que voltou a ser descritivo (a frase da coordenada 0,0 saiu, porque agora `x-regras-adicionais` traz a regra na `origem` e no `destino`).
- `apps/api/openapi/v1.json` regerado com `npm run openapi --workspace @dc360/api` (cópia em `v1.json` desta pasta; `saidas/03-diff-v1.txt` é o diff: quatro respostas `200` novas, `x-regras-adicionais` de `/v1/rota` com duas entradas, o `resumo` e a `description` dela).
- Testes (`apps/api/test/openapi-regras.test.ts`, 11 casos novos): (a) o mesmo esquema em dois campos dá duas anotações; (b) em lista, união e `optional` não duplica o mesmo caminho; (c) esquema recursivo termina e anota a regra da raiz uma vez; (d) recursão por outro campo termina; (e) `POST /v1/rota` anota origem E destino, no documento, no esquema do corpo e no guarda; (f) `tambemResponde` sai com o esquema da principal; (g) com esquema próprio; (h) falha com status repetido, adicional repetido e colisão com erro; (i) falha sem resposta principal; (j) as quatro rotas listam 200 e 201 com o mesmo conteúdo; (k) só essas quatro declaram `tambemResponde`.
- `apps/api/test/contrato-3c2-respostas.test.ts` (sem caso novo): o `conferir` não recebe mais a lista `[200]` na mão. O status aceito é o principal mais os de `tambemResponde` da entrada, e o corpo é lido pelo esquema DAQUELE status. Assim, o 200 do reenvio de `POST /v1/ocorrencias`, `/sincronizacao/vistoria`, `/sincronizacao/devolucao` e `/saida-a-campo` é chamado por `inject` e conferido contra o que o registro declara (sem campo cortado, `toEqual` do corpo).
- `apps/api/PENDENCIAS.md`: itens 6 e 7 do contrato marcados RESOLVIDOS na parte 4B, com o SHA do commit candidato.
- Contagem: `baseline.mjs` ganhou `"V2-F02-E04-parte-4B": 11`. README (linhas 14, 1820 e 1822) e `COLOCAR-DE-PE.md` (linhas 41 e 365) ajustados à minha árvore: API 2153 para 2164, `npm test` 4518 para 4529, total com o aplicativo 6536 para 6547.

## Prova de que os testes falham antes e passam depois

`saidas/01-falha-antes.txt`: com os testes novos e o gerador e os grupos da base (`src` restaurado do commit base), 14 casos falham (casos de `openapi-regras.test.ts` que dependem do comportamento novo e de `contrato-3c2-respostas.test.ts`, que agora exige o status declarado). Depois: `saidas/02-contrato-testes.txt`, `openapi-regras` + `openapi` + `contrato-3c2-respostas`, 64 de 64.

## Justificativa

- **Esquema ausente herda a principal.** O reenvio idempotente devolve o MESMO corpo; repetir o esquema nas quatro entradas convidaria à divergência. Quem precisar de corpo diferente declara `resposta`.
- **Falhar em colisão de status**, em vez de deixar o último vencer: o documento não pode dizer duas coisas para o mesmo status, e antes a colisão com um erro era silenciosa.
- **Pilha de ancestrais além do par (esquema, caminho):** só o par não pára recursão, porque o caminho cresce a cada volta. A pilha pára; o par evita a repetição inútil dentro do mesmo caminho.
- **Mexi em `contrato-3c2-respostas.test.ts`** (fora da lista de arquivos dados) porque é a prova por `inject` que o pedido (1) exige; só a função `conferir` e as cinco chamadas com `[200]` mudaram, e o arquivo não está entre os que a parte 4A toca.

## Portões

Em `saidas/`: `04-typecheck.txt` (0), `05-npm-test.txt`, `07-isolamento.txt`, `08-lint.txt` (0), `09-lint-teto.txt` (431, não sobe), `10-formato.txt` (0), `12-regras-de-conteudo.txt`, `13-auditar.txt` (0), `14-conferir-numeros.txt` (0), `15-baseline-test.txt` (29 de 29), `16-test-scripts.txt`.

- `npm test`: campo 280 de 280; shared 434 casos, 433 passam, 1 falha (`regras-de-conteudo`, EPERM em link simbólico, DV-46); API 2198 casos, 2162 passam, 34 pulados, 2 falham (`semear-homologacao`); console 379 de 379; web 824 de 824; db 454 casos, 440 passam, 6 pulados, 8 falham (`desfazer-migracao` 5 e `guarda-da-semente` 3). Todas as falhas são as aceitas do ambiente Windows; nenhuma outra.
- `test:isolamento` (CA-06): 21 arquivos, 19 passam; as 8 falhas são `desfazer-migracao` 5 e `guarda-da-semente` 3. O arquivo de isolamento passa.
- Não rodei `test:e2e:api` (instrução do lote).

## Limites

1. `tambemResponde` descreve o sucesso adicional; não há teste que obrigue TODA rota que responde 201 e 200 a declará-lo (só a lista das quatro, travada em teste). Rota nova com o mesmo padrão precisa declará-lo à mão.
2. A `description` da operação de `POST /v1/rota` mantém o ponto duplicado ("lugar..") que o gerador já produzia (a regra termina em ponto e o gerador acrescenta outro). Não é desta parte.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E04 | IMPLEMENTADA (candidato, parte 4B: limites do gerador) | tambemResponde no registro e no OpenAPI (200 do reenvio nas 4 rotas idempotentes, conferido por inject); regras adicionais por caminho (POST /v1/rota anota origem e destino), sem laço em esquema recursivo; 11 testes novos; PENDENCIAS itens 6 e 7 resolvidos.`
- **Dívidas pagas:** nenhuma com código DV.
- **Para quem integra:** `baseline.mjs` ganhou `V2-F02-E04-parte-4B: 11`; recalcular os totais (README 2164 e 4529; `COLOCAR-DE-PE.md` 6547 na minha árvore). `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`, nunca mesclar. A parte 4A toca outros arquivos (`apoio/rotas.ts`, `contrato-cliente-rota.test.ts`, `superficie*`): sem sobreposição.
- **Pendências humanas:** nenhuma nova (a conferência visual do `v1.json` das partes anteriores segue pendente).
