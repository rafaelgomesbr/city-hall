---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 98879db
ci_run: 40179451002
rodada: 10
herdado_de:
tags: [ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo por diferença (D-31 item 4): a rodada 9 reprovou a E19 só na dimensão QA, pelo achado 1. Validei a correção 11 (71e3ac1, merge e48e5e9) e os itens "corrige antes de crescer" que vieram no mesmo lote. O código de produto de 98879db é idêntico ao de a60be9a (`git diff --name-only a60be9a..98879db` só toca `docs/roadmap-v2/*.md`); o HEAD 823e380 difere de 98879db só em `docs/roadmap-v2/retomada/**` e `STATUS.md`.

- **Achado 1 da rodada 9 (enum obrigatório ausente dizia "Valor não reconhecido: undefined"): corrigido.** `mensagens-do-zod.ts` agora decide "Campo obrigatório" ANTES do `switch` para qualquer código com `input === undefined` (exceto `unrecognized_keys`). O teste de 422 real em `POST /ocorrencias` sem `tipo` e sem `canalEntrada` devolve "Campo obrigatório" nos dois (`api-campo.txt`). Reproduzi o defeito original desfazendo o conserto (ver Cenários negativos).
- **Nenhuma frase imprime `undefined`, `null` ou inglês, e a validação não ficou mais frouxa.** O mapa só troca mensagem; não decide aceitar ou recusar. Varredura de 5398 entradas sujas sobre os 36 esquemas exportados de `@dc360/shared` (360 mensagens distintas): zero ocorrência de `undefined`, `null`, `NaN`, `[object`, "Required", "Expected", "must be". Varredura em 280 chamadas reais a rotas POST, PUT, PATCH e DELETE da API (corpos `{}`, `null`, lista, texto, enum nulo, NaN): zero 4xx com esses termos. Os "5xx" que a sonda sinalizou são 503 de recurso desligado (`push_desligado`, `caminho_desligado`) com frase própria, não defeito.
- **QA 2** (README e LEIA-ME "seis exceções"): README (por volta das linhas 1633 a 1640 e 2021) e LEIA-ME (linhas 44 e 176) agora dizem cinco pacotes e sete advisories e citam `decode-uri-component`, `brace-expansion` (três), `node-forge`, `shell-quote` e o `zod` 3 do `@expo/cli`. Confere com `ACEITAS_NO_APLICATIVO` em `scripts/auditar-excecoes.mjs` (linhas 49 a 95) e com a saída real de `npm run auditar` (sete linhas "aceita"). `braces` e `sprintf-js` só aparecem hoje na frase que explica que saíram. Nenhum "seis exceções" restante no `dc360` (grep).
- **QA 3** (`error` de `tamanhoBytes` sem teste que morda): o teste "tamanhoBytes separa ausente de não numérico" morde. Dois mutantes em `evidencia.ts` (sempre a frase de não numérico; sempre a de ausente) deixam o teste vermelho.
- **Infra 2** (LEIA-ME): a seção "Antes da próxima entrega aos agentes: novo binário nativo" existe. Os cinco patches (`expo` 57.0.31, `expo-location` 57.0.22, `expo-network` 57.0.3, `expo-notifications` 57.0.24, `expo-router` 57.0.29) conferem com `apps/campo/package.json` e com o `package-lock.json`; as versões anteriores (57.0.30, .21, 57.0.2, .23, .28) conferem com `git diff 156dcfb3~1 156dcfb3`. O `zod` 4.6.7 declarado no aplicativo (`^4.6.7`, linha 50 do `package.json`) e a cópia 3.25.76 em `node_modules/expo/node_modules/zod` conferem com o lockfile. O texto diz que nenhum binário novo foi gerado e que o Metro nunca empacotou com o zod 4.
- **Infra 3** (README citava só dois dos três pacotes de desenvolvimento): agora cita `vitest`, `@vitest/mocker` e `tinypool`, igual a `ACEITAS_EM_DESENVOLVIMENTO`.
- **Números de documentação**: `npm run conferir:numeros` sai 0, "Todos os números da documentação batem" (5620 testes; shared 236 = 224 + 12; API 1719 = 1717 + 2). `baseline.mjs` traz as duas entradas "V2-F00-E19-correcao-11" (total 2 na API, 12 no shared) e batem com os arquivos.
- **DoD da etapa nesta rodada**: `npm run auditar` sai 0 (runtime limpo; aplicativo só com as 7 advisories aceitas, dono Rafael, prazo 2027-01-05; a consulta de controle voltou); `npm audit --omit=dev` na raiz: 0 vulnerabilidades. CI de a60be9a (run 40179451002, tentativa 2): 12 de 12 verdes, lido por `gh run view`.

## Evidência

Todas as saídas ficam em `C:/Users/Rfasg/AppData/Local/Temp/claude/C--Projetos-city-hall/7e9c51d9-373a-4fc4-ba93-37b771571739/scratchpad/qa-e19/`.

| Comando | Saída | Arquivo |
| --- | --- | --- |
| `npm test --workspace @dc360/shared` | 235 de 236 passam; a única falha é `regras-de-conteudo.test.ts` (EPERM ao criar symlink no Windows sem privilégio, fora do diff) | `shared.txt` |
| `npx vitest run test/campo-obrigatorio-ausente.test.ts` (apps/api) | exit 0, 2 de 2 | `api-campo.txt` |
| `npx vitest run test/mensagens-em-portugues.test.ts` com o `mensagens-do-zod.ts` de dda7557 | exit 1, 10 casos vermelhos | `mut-shared.txt` |
| mesmo teste de API com o `dist/mensagens-do-zod.js` da versão de dda7557 | exit 1: recebido "Valor não reconhecido: undefined. Os aceitos são: deslizamento, inundacao, ..." (o defeito original) | `mut-api2.txt` |
| varredura de 36 esquemas, 5398 entradas | 0 achados | `fuzz.mjs`, `mensagens-distintas.txt` |
| varredura de 142 rotas, 280 chamadas | 0 achados; 46 mensagens 422 distintas, 20 "Campo obrigatório", 0 com undefined ou null | `sonda-achados.txt`, `sonda-achados.txt.422`, `rotas.txt` |
| 6 mutantes em `mensagens-do-zod.ts` (guarda só em `invalid_type`; sem `invalid_union`; sem `invalid_value`; sem ramo de NaN; infinito como `Infinity`; bigint sem tratamento) | exit 1 em todos, cada um mata ao menos 1 teste | `mut-A_so_invalid_type.txt` a `mut-F_bigint.txt` |
| 2 mutantes em `evidencia.ts` (`tamanhoBytes`) | exit 1, o teste novo morde | `mut-tamanho1.txt`, `mut-tamanho2.txt` |
| `npm run typecheck` | exit 0 | `typecheck.txt` |
| `npm run auditar` | exit 0 | `auditar.txt` |
| `npm audit --omit=dev` | 0 vulnerabilidades | `audit-omit-dev.txt` |
| `node --test scripts/auditar.test.mjs` | 77 de 77 | `auditar-test.txt` |
| `npm run conferir:numeros` | exit 0 | `numeros.txt` |
| `gh run view 40179451002` | 12 de 12 success, attempt 2, sha 9a1c112 | `ci.txt` |

Todas as mutações foram desfeitas com `git restore` (ou cópia byte a byte do `dist`, conferida por `sha256sum -c`); `git status --short` ficou vazio. A sonda de rotas ficou no scratchpad (`sonda/rotas.test.ts`), fora do repositório. `npm run test:scripts` rodado inteiro com teto de 110 s: o `auditar.test.mjs` foi cortado pelo meu teto (exit 143) e passou 77 de 77 quando rodei sozinho com teto maior; as outras duas falhas são de CRLF na árvore do Windows (achado 3).

## Cenários positivos
- Enum, literal, união, união discriminada, lista com mínimo, uuid e inteiro positivo ausentes: "Campo obrigatório".
- 422 real de `POST /ocorrencias` sem `tipo` e `canalEntrada`: "Campo obrigatório" nos dois campos, corpo sem "undefined" nem "null".
- Enum presente e fora da lista continua dizendo valor e aceitos (`"terremoto"`, `"urgente"`), no esquema e na API.
- Enum opcional ausente continua aceito; enum com `default` ausente continua aceito; enum anulável com `null` continua aceito.
- `tamanhoBytes` ausente: "O tamanho do arquivo não foi informado."; `"12"` e `null`: "precisa ser um número de bytes."

## Cenários negativos
- Desfazer o conserto (`mensagens-do-zod.ts` de dda7557): 10 casos do shared ficam vermelhos e o teste de 422 da API reproduz exatamente o achado 1 da rodada 9.
- `null`, número, booleano, objeto, lista, BigInt, NaN e Infinity em enum: frases em português ("nulo", "um objeto", "infinito", "um valor que não é número"), sem lançar e sem "null".
- `z.literal(null)` e `z.literal(["a", null])`: "nulo" na frase.
- NaN em `z.coerce.number()` sobre "abc": "Precisa ser um número" (DV-19); NaN onde se esperava texto não diz mais "veio um número".
- Corpos `null`, lista e texto em 7 rotas de escrita: "Era esperado um objeto, veio nulo/uma lista/um texto".
- Chaves a mais com campo ausente junto: as duas frases saem separadas ("Campo obrigatório" e "Campo não reconhecido: b").

## Tentativas de reprovar
- Procurei caminho em que "Campo obrigatório" mascarasse erro real ou afrouxasse validação: `refine` que reprova `undefined`, `preprocess` e `transform` que devolvem `undefined`, `nullable`, `record` com valor `undefined`, lista com furo, tupla curta, conjunto ausente. Em todos o resultado de aceite ou recusa é o do Zod; só a frase muda. O mapa não toca em `success`.
- Procurei frase com identificador cru em todos os esquemas exportados com 26 valores sujos por campo (undefined, null, NaN, Infinity, "", emoji, 0, -1, 1.5, 1e999, BigInt, boolean, objeto, lista, Date inválida, Symbol, função, Map, texto de 6000 caracteres), e em enum com objeto circular, Symbol, função e Date: nenhum "undefined", "null" ou inglês.
- Procurei exceção lançada pelo mapa (BigInt, Symbol, objeto circular): nenhuma.
- Procurei teste que não morde: seis mutantes no mapa e dois em `tamanhoBytes`, todos mortos. O teste de API só morde com o `dist` do pacote compartilhado reconstruído; confirmei que o `dist` local já tinha o conserto (`valorDito` presente) e que o teste vira vermelho com o `dist` antigo.
- Procurei texto de documentação que a execução desmentisse: contei as exceções do README e do LEIA-ME contra `auditar-excecoes.mjs`, contra a saída de `npm run auditar` e contra o lockfile; procurei "seis exceções", `braces` e `sprintf-js` remanescentes; conferi os totais de teste somando por pacote (236+345+778+1719+238+307 = 3623; mais 1997 do aplicativo = 5620). Tudo bate.
- Procurei regressão fora do mapa: `typecheck` da árvore inteira, `auditar`, `auditar.test.mjs` e CI de 12 jobs verdes.
- Isolamento entre municípios (regra número um): o diff não toca autorização, banco, RLS nem rota; a mudança é só de texto de mensagem. Não repeti o teste de dois inquilinos por esse motivo.

## Achados

Nenhum achado alcança os critérios de reprovação da D-31 item 1.

1. **Anotado** (condição: nenhuma das três; defeito de fraseado, não critério escrito). Campo obrigatório numérico que usa `z.coerce.number()` e chega ausente diz "Precisa ser um número" em vez de "Campo obrigatório". Reprodução: `saidaACampoSchema.safeParse({ idempotencyKey: <uuid>, ocorrenciaId: <uuid> })`, campo `duracaoMinutos`; o `coerce` transforma `undefined` em `NaN` antes de o mapa ver o `input`. `""` e `null` dão "O mínimo é quinze minutos" (Number("") é 0). A frase é suficiente para o agente agir e não imprime identificador cru; o critério da rodada 9 era enum. Origem em `schemas.ts:825`, anterior à correção 11.
2. **Anotado** (mesma condição). União discriminada com o discriminador ausente (`{}` onde se espera `{ t: "a" }`) diz "Tipo não reconhecido. Os aceitos são: "a"", não "Campo obrigatório", porque o `input` do problema é o objeto, não `undefined`. Informação útil e sem identificador cru.
3. **Anotado** (ambiente, não produto). Em Windows sem privilégio de symlink, `regras-de-conteudo.test.ts` ("tolera o arquivo que some entre a listagem e a leitura") falha com EPERM; e dois testes de `conferir-indices-de-evidencia.test.mjs` falham nesta árvore porque o disco está em CRLF (comportamento descrito em `29-operacao-do-ambiente.md`). Fora do diff da correção 11; o CI em Linux e em Windows hostil roda verde.
4. **Anotado** (risco de processo). O teste de API `campo-obrigatorio-ausente.test.ts` lê `@dc360/shared` pelo `dist/`. Rodar `npm run test:api` sozinho com `dist` velho prova o código antigo. `npm test` e `npm run typecheck` da raiz reconstroem antes (`build:shared`), e o CI também. Quem mexer no mapa e rodar só o teste da API precisa antes de `npm run build:shared`.

## Não verificado
- Os 422 de cadastro de usuário, triagem, devolução de tarefa, encerramento de saída, resposta de providência, evidência perdida e evento de trilha foram cobertos pela varredura dos esquemas exportados do shared e por 280 chamadas genéricas, não por um caso de API dedicado a cada um. Muitas das 142 rotas respondem 404 ou 403 a corpo vazio com ids fabricados, então o 422 delas só foi exercido pelo esquema, não pela rota.
- Os esquemas locais de `apps/api/src/rotas/*.ts` (por exemplo `prestacao-de-contas.ts`, `rota.ts`) só foram exercidos quando a rota chegou à validação.
- Suíte completa da API, do web e do campo: não repeti localmente; o CI de a60be9a (mesmo código de produto) deu 12 de 12 verdes.
- Linha de base e restore em Postgres real: pulados no run do registro; cobertos no run `[ci completo]` 40179451002.
- Aparelho físico, binário nativo novo (`eas build`) e empacotamento do Metro com o `zod` 4: ainda não existem, e o LEIA-ME diz isso.
- Dimensão Infra e CI: herdada de dda7557 (o diff só toca `mensagens-do-zod.ts`, testes, documentação e totais do `baseline.mjs`; `verificar.yml` não mudou). Conferi apenas os textos Infra 2 e 3, como pedido.

## Risco residual
- A confirmação do Rafael para a subida dos cinco pacotes do Expo por analogia segue pendente (item 17 de `PENDENCIAS.md`); é decisão, não defeito.
- O `expo-doctor` depende do dia e do registro do Expo; a deriva pode voltar (README e LEIA-ME já dizem).
- As exceções do aplicativo vencem em 2027-01-05; depois disso `auditar` reprova até reavaliação.
- Os achados 1 e 2 deixam duas frases menos precisas para o agente na rua; baixa probabilidade e sem perda de dado.

## Motivo do humano
Não se aplica.
