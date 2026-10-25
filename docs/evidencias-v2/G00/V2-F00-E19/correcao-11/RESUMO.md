# V2-F00-E19, correção 11 (rodada 9 reprovou a E19 em `dda7557`)

Origem: `VEREDITO.md` da E19, rodada 9 (achado 1 do QA, mais os achados 2 do QA, 2 e 3 de Infra e CI). Base: `f894275`, ponta de `v2/f00`.

## Fatos

- **O defeito (reproduzido antes do conserto, `saidas/01-api-ANTES.txt`).** `POST /ocorrencias` sem `tipo` e sem `canalEntrada` respondia 422 com `Valor não reconhecido: undefined. Os aceitos são: deslizamento, inundacao, ...`. No Zod 4 um enum, literal ou união obrigatório que chega sem o campo reprova com o código da própria regra (`invalid_value`, `invalid_union`), e só `invalid_type` tratava o `undefined` como "Campo obrigatório".
- **O conserto, em `dc360/packages/shared/src/mensagens-do-zod.ts`.**
  - `traduzir` abre com uma regra única: `issue.input === undefined` em qualquer código (menos `unrecognized_keys`, que é problema do objeto) devolve "Campo obrigatório". O ramo antigo de `invalid_type` que fazia isso saiu.
  - Função nova `valorDito`: nenhuma frase imprime mais `undefined` nem `null` de JavaScript. `null` vira "nulo", `undefined` vira "nada", NaN vira "um valor que não é número", Infinity vira "infinito", BigInt e número saem como texto, objeto e lista saem como o tipo ("um objeto", "uma lista"), texto continua entre aspas. Vale para o enum (`Valor não reconhecido: ...`), para a lista de aceitos, para o literal (`Era esperado exatamente ...`) e para as opções da união discriminada. Como efeito, o `JSON.stringify` com BigInt, que lançava `TypeError` (QA 4 da rodada 9, latente), deixa de existir no mapa.
  - DV-19: NaN onde se esperava número (por exemplo `z.coerce.number()` sobre "abc") responde "Precisa ser um número" em vez de "Era esperado um número, veio um número". Onde se esperava outra coisa e veio NaN, a frase diz "veio um valor que não é número".
  - As demais frases em português continuam as mesmas (os 21 casos antigos do arquivo passam sem mudar uma asserção).
- **Testes novos.**
  - `packages/shared/test/mensagens-em-portugues.test.ts`, de 9 para 21 casos (shared 224 para **236**): campo ausente em enum, literal, união, união discriminada, lista, UUID e número (4); o esquema real `aberturaOcorrenciaSchema` sem `tipo` e sem `canalEntrada` (incluído nos 4); o mapa nunca imprime `undefined` nem `null` (4: nulo, número, booleano, objeto, lista, BigInt, NaN, Infinity, literal nulo); NaN com frase própria (3); `tamanhoBytes` separa ausente de não numérico (1; é a dívida de teste QA 3 / E06 QA 1 da rodada 9).
  - `apps/api/test/campo-obrigatorio-ausente.test.ts` (novo, 2 casos, API 1717 para **1719**): o 422 real de `POST /ocorrencias` sem `tipo` e sem `canalEntrada` diz "Campo obrigatório" nos dois campos e o corpo inteiro não contém `undefined` nem `null`; o enum presente e errado (`terremoto`) continua dizendo o valor e os aceitos.
- **Os testes mordem.** Contra o código antigo (`saidas/01` e `saidas/02`): API 1 de 2 reprova ("Valor não reconhecido: undefined..."); shared 10 de 21 reprovam. Com o conserto: 2 de 2 e 21 de 21. Mutante extra: trocar a condição `problema.input === undefined` da função `error` de `tamanhoBytes` (em `evidencia.ts`) faz 1 caso reprovar (`saidas/10`), e antes da correção ele sobrevivia.
- **Documentação alinhada a `dc360/scripts/auditar-excecoes.mjs`** (hoje 5 pacotes e 7 advisories aceitas no aplicativo: `decode-uri-component` 1, `brace-expansion` 3, `node-forge` 1, `shell-quote` 1, `zod` 1 com `somenteEm`):
  - `dc360/README.md`: "as seis exceções nomeadas" virou "cinco pacotes e sete advisories"; o parágrafo da política do CP-03 agora cita os três pacotes de desenvolvimento (`vitest`, `@vitest/mocker`, `tinypool`), e não só dois.
  - `dc360/apps/campo/LEIA-ME.md`: a linha da dependência vulnerável deixou de listar `braces` e `sprintf-js` como exceções (diz que saíram em 2026-10-24 porque o registro retirou as advisories) e lista as cinco de hoje; a linha do `expo-doctor` registra os cinco patches do Expo da correção 10 (`expo` 57.0.31, `expo-location` 57.0.22, `expo-network` 57.0.3, `expo-notifications` 57.0.24, `expo-router` 57.0.29); seção nova "Antes da próxima entrega aos agentes: novo binário nativo" diz que os cinco patches e o `zod` 4 exigem binário nativo novo, que **nenhum foi gerado**, e que o Metro nunca empacotou o aplicativo com o `zod` 4.
  - Contagens: shared 236, API 1719, `npm test` 3582, total 5579 (README e `dc360/docs/COLOCAR-DE-PE.md`); `baseline.mjs` ganhou as entradas `V2-F00-E19-correcao-11` (shared +12, API +2).
- **Portões (esta máquina, Mac, Node 24.15.0, PGlite).**
  - `npm run typecheck`: código 0 (`saidas/03`).
  - `npm test`: código 0 (`saidas/04`): motor de campo 238, shared 236, API 1719 passam e 34 pulados, console 307, painel 737, banco 345 e 3 pulados.
  - `npm run test:isolamento` (CA-06): 345 passam, 3 pulados (14 arquivos), código 0 (`saidas/05`).
  - `npm run conferir:numeros`: código 0, "Todos os números da documentação batem com a realidade" (`saidas/07`).
  - `node scripts/auditar.mjs` (em `dc360`): código 0, runtime limpo, aplicativo com 7 advisories aceitas e nenhuma nova (`saidas/08`).
  - Portão de conteúdo (`regras-de-conteudo.test.ts`): 10 de 10 (`saidas/09`).
  - `npm run test:scripts` e `conferir-indices-de-evidencia.mjs`: `saidas/06` (rodada antes de existir o `INDEX.md` desta pasta, 1 falha esperada, a do próprio índice) e `saidas/11` (com o índice gravado: 355 casos, 350 passam, 4 pulados e 1 falha, a única que sobra é o próprio `saidas/11` ainda fora do índice, porque o arquivo nasce depois da rodada que ele registra; o índice final o inclui e o `conferir-indices-de-evidencia.mjs` fecha em OK).
- **Não verificado.** O CI (`[ci completo]`) e a rodada 10 de validação, que são do gatekeeper; o Windows; `test:e2e:api` e o E2E de navegador, que não rodei (o diff não toca rota, nem tela, nem script de ponta a ponta; a frase do 422 está coberta pelo teste de API acima); o console (`apps/console`), que não importa o mapa do shared e segue em inglês, como já estava (QA 7 da rodada 9, dívida registrada no commit de dívidas). Nenhum binário nativo foi gerado.
- **Premissas e pendências.** Nenhuma premissa nova. Os pontos humanos da rodada 9 (H36, H37, binário nativo, capturas da E09) foram transcritos para `pendencias-humanas.md` no commit `V2-F00: dívidas e pendências da rodada 9`.

## Justificativa

- A regra mora no começo de `traduzir`, e não em cada ramo, porque o defeito é de classe: toda regra do Zod 4 pode ver `input === undefined`, e uma checagem ramo a ramo cobriria só as regras de que alguém lembrasse (a mesma lógica do mapa global). `unrecognized_keys` fica de fora porque o problema é do objeto, e o `input` dele nunca é `undefined`.
- `valorDito` resolve três coisas pela mesma raiz: `JSON.stringify` não serve para montar frase (devolve o `undefined` do JavaScript, dá "null" para NaN e Infinity, lança com BigInt). Objeto e lista não repetem o conteúdo na frase porque o valor veio de fora e a frase chega ao aparelho.
- A DV-19 e a dívida de teste de `tamanhoBytes` entraram porque a rodada 9 mandou consertar junto e moram no mesmo arquivo e no mesmo teste.
- O teste de API usa a rota real e o tratador de erro real, porque o achado foi um 422 que o aparelho lê; um teste só do esquema não provaria que a frase chega ao corpo.
