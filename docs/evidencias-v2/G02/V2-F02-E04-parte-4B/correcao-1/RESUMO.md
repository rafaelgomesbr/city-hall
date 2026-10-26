# V2-F02-E04, parte 4B, correção 1: o 426 e o cabeçalho x-app-version no contrato

Fecha o achado BLOQUEIA da revisão independente (Codex) dos lotes 3 e 4 (junção 3A com 4B): o OpenAPI não declarava o 426 `versao_do_aplicativo_antiga` nem o cabeçalho `x-app-version` em nenhuma das 96 operações, embora o gancho do escopo `/v1` devolva o 426 antes de autenticar. A evidência da parte 4B (pasta acima) fica como estava. O teste foi escrito primeiro, falhou, e só então veio o conserto.

## Fatos

1. **A regra real do gancho** (`apps/api/src/versao-do-aplicativo.ts`, `hookDeVersaoNoV1`): vale para toda rota do escopo `/v1`, menos `ROTA_DA_VERSAO_MINIMA` (`GET /v1/aplicativos/:aplicativo/versao-minima`), que nunca é recusada porque é por ela que o aplicativo velho descobre o que instalar. O corpo do 426 em `/v1` é sempre `{ erro, mensagem, versaoMinima }` (o gancho só recusa quando há mínimo configurado). O 426 do espelho legado (sem `versaoMinima`) não é do contrato `/v1` e não entra.
2. **Conserto global e derivado** (`apps/api/src/contrato/openapi.ts`), nenhuma entrada de grupo foi tocada: `operacaoDe` acrescenta o parâmetro de cabeçalho opcional `x-app-version` (nome vindo de `CABECALHO_DE_VERSAO_DO_APLICATIVO` do shared) e `respostasDe` acrescenta a resposta 426 (`x-codigos-de-erro: ["versao_do_aplicativo_antiga"]`, corpo por `$ref` para o esquema novo `components.schemas.VersaoDoAplicativoAntiga`, derivado do Zod `versaoDoAplicativoAntigaSchema`) a toda operação cujo caminho não é `ROTA_DA_VERSAO_MINIMA` (a mesma constante que o gancho usa, importada, sem cópia). Entrada que declare o 426 por conta própria (`tambemResponde`) faz o gerador falhar, para a regra do gancho nunca divergir em silêncio. `v1.json` regerado por `npm run openapi --workspace @dc360/api`: 95 das 96 operações declaram o 426 (`saidas/03-trecho-do-v1.txt`).
3. **Teste** `apps/api/test/openapi-versao-do-aplicativo.test.ts` (novo, 5 casos): âncora (o documento tem as 96 operações e a da versão mínima); toda operação menos a da versão mínima declara o cabeçalho opcional; toda operação menos a da versão mínima declara o 426 por `$ref` ao esquema `{ erro, mensagem, versaoMinima }`; a entrada que declara o 426 faz o gerador falhar; e o documento conferido contra o COMPORTAMENTO: servidor real com `VERSAO_MINIMA_CAMPO=1.3.0`, `inject` em cada uma das 96 operações com `x-app-version: campo/1.2.0` e sem token, e a operação devolve 426 com as chaves exatas do esquema se e somente se o documento a declara com 426. `openapi-regras.test.ts` ganhou a chave `426` no caso das respostas por status (sem caso novo).
4. **ANTES** (`saidas/01-item1-ANTES.txt`): 4 dos 5 casos reprovam (`post /v1/aparelhos: expected [] to deeply equal ['x-app-version']`, esquema ausente, o gerador não falha, e o servidor devolve 426 que o documento não declara). **DEPOIS** (`saidas/02-item1-DEPOIS.txt`): `openapi-versao-do-aplicativo`, `openapi`, `openapi-regras` e `versao-do-aplicativo` passam, 95 de 95.
5. Contagens: `baseline.mjs` ganhou `V2-F02-E04-parte-4B-correcao-1` (api +5); README e `COLOCAR-DE-PE.md` ajustados; o README ganhou a frase do contrato no parágrafo da versão mínima.

## Limites declarados

- O teste contra o comportamento usa o servidor em memória (como os demais testes de contrato); não roda `test:e2e:api`, que é do CI.
- O 426 só é declarado para o `/v1`. O espelho legado e as rotas fora do prefixo não fazem parte do contrato.

## Para o orquestrador

- Dívida paga: o achado BLOQUEIA da revisão dos lotes 3 e 4 sobre o OpenAPI sem o 426 (E04 com E06).
- Pendência humana: nenhuma.
- Se uma rota nova ficar fora do gancho de versão, a regra mora em `estaSobOGanchoDeVersao` (`openapi.ts`) e o teste novo a pega.
