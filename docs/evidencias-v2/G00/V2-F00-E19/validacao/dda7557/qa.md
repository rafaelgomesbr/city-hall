---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Notação: `$Q` = `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/qa-lote`. Produto validado: o da árvore em `d4683cc`, que só difere de `dda7557` em `STATUS.md` e `ESTADO-ATUAL.md` (lista permitida). macOS arm64, Node 24.15.0, com rede. Por diferença desde `60cbc2f` (QA FAIL da rodada 8). O que é do Infra e CI (CI 12 de 12, `auditar` 0, exceção do `zod` do Expo com `somenteEm`, Metro com Zod 4) foi tomado como fato e não repetido, exceto onde indicado.

| Critério | Resultado | Prova |
| --- | --- | --- |
| DoD: `expo-doctor` 21 de 21 sem pular a checagem de versões | PASS (reexecutado por mim, worktree com `npm ci` em `d4683cc`, variável de pulo ausente) | `$Q/e19/expo-doctor.txt`: "21/21 checks passed", código 0 |
| Migração Zod 3 para 4 não muda o que o produto aceita (esquemas exportados de `packages/shared`) | PASS com ressalvas anotadas | `$Q/e19/diff-shared3.txt`: 36 esquemas, cerca de 55 mil comparações, Zod 3.25.76 (`60cbc2f`) contra Zod 4.6.7 (`dda7557`) sobre o MESMO insumo, comparando aceita/recusa, caminhos, frases e a saída do parse |
| Idem para os esquemas locais de `apps/api/src`, `apps/console/src` e `apps/web/src/paginas/orgaos-regras.ts` | PASS com ressalvas anotadas | `$Q/e19/diff-gen3.txt`: 62 esquemas extraídos pela árvore sintática (declarações de topo que usam `z`), 76 mil comparações, nenhuma saída de parse diferente com ambos aceitando |
| Nenhuma frase em inglês chega à pessoa pelo mapa do pacote | PASS | `$Q/e19/codigos.txt`: 124 casos, um por classe de problema do Zod 4 (tipo errado, ausente, NaN, Infinity, enum, literal, união, união discriminada, interseção, `.strict()`, texto/número/lista/data/bigint/arquivo com mínimo e máximo, `multipleOf`, 20 formatos de string, custom, refine, superRefine, check, transform, record, map, set, pipe, lazy): 0 em inglês. Mais 0 em inglês nos 76 mil casos do diferencial |
| Validação mais frouxa no Zod 4 | Só um caso, inalcançável de fora (ver achado 5) | `diff-shared3.txt` e `diff-gen3.txt`, seção "ANTES RECUSAVA, AGORA ACEITA"; `$Q/e19/primitivos.txt` (email, url, datetime com e sem offset, uuid, `z.coerce.number`) |
| Forma do erro da API `{ erro, mensagem, campos? }` igual | PASS | `$Q/e19/probe-api.txt` (22 pedidos reais contra `construirServidor` com banco em memória) e `$Q/e19/api-test.txt`: `npm run test --workspace @dc360/api` 106 arquivos, 1717 passam, 34 pulados, código 0 (inclui `mensagens-visiveis-com-acento`, `superficie`, `campo-integracao`, `precisao-do-gps-na-sincronizacao`, `evidencia-so-do-autor`) |
| DoD E2E: `npm run test:e2e:api` (API com `fastify` 5.12.7 e `zod` 4.6.7 e o painel no navegador) | PASS | `$Q/e19/e2e-api.txt`: "Passou: 325 Falhou: 0", "Zero erro de console", código 0 |
| Suíte do pacote compartilhado | PASS | `$Q/e19/shared-test.txt`: 18 arquivos, 224 de 224, código 0 |
| O teste novo do `uuidSchema` morde | PASS | mutação M1 abaixo |
| A linha `error` da varredura de acentos morde | PASS | mutação M2 abaixo |
| UUID mais estrito: algum caminho real com id não RFC? | Nenhum encontrado | achado de leitura e execução na seção "Tentativas de reprovar", item 4 |
| README, parágrafo da política do CP-03, diz a verdade sobre exceções e versões | PASS no parágrafo; FALHA em três outros pontos de texto (achado 2) | leitura de `dc360/README.md:1628-1690` contra `scripts/auditar-excecoes.mjs` |
| Dívidas DV-04 a DV-07 e DV-19 a DV-21 | Nenhuma pior do que o registro, DV-21 um pouco mais larga (achado 6) | seção "Achados" |
| Aplicativo com a árvore nova: tipos e testes ligados à etapa | PASS | worktree `npm ci` raiz e aplicativo: `$Q/e15/typecheck-app.txt` código 0; `$Q/e15/jest-etapa.txt` 17 suítes, 193 de 193; `$Q/e06/jest-app.txt` 24 suítes, 310 de 310; `$Q/e06/pkg-campo.txt` 238 de 238 |

## Evidência

- Harnesses em `$Q/e19/h/` (`diff-shared.mts`, `diff-gen.mts`, `extract.mts`, `codigos.mts`, `primitivos.mts`, `probe-api.mts`, `e06-pedido.mts`). Duas árvores de leitura: `$Q/e19/old` (`git archive 60cbc2f` de `packages/shared/src`, `apps/api/src`, `apps/console/src`, `apps/web/src/paginas`, com `node_modules/zod` ligado ao 3.25.76 de `apps/campo/node_modules/zod`) e `$Q/e19/new` (`git archive dda7557`, com o `zod` 4.6.7 da raiz). Os dois `zod` são instâncias distintas, então cada um carrega o seu mapa global de mensagens.
- Gerador de amostras: percorre a definição do Zod 3 de cada esquema e produz uma entrada válida (máxima e mínima); depois, para cada folha: ausente e cerca de 158 valores de corpus (nulo, vazio, texto longo, 0, negativos, fracionários, NaN, Infinity, 15 MB e 15 MB mais 1, 1e21, 2^53, booleanos, listas, objetos, Date, Date inválida, BigInt, variantes de UUID, de email, de data e hora e de URL, strings numéricas), mais chave desconhecida em cada objeto. Esquemas sem amostra automática (vistoria, envelope, pedido de evidência, triagem) ganharam amostra à mão. `ocorrenciaSchema` ficou só com a rodada de entradas inteiras.
- Os esquemas de `apps/api/src` foram extraídos como declarações de topo (`const X = z....`). **Não** entram as declarações dentro de funções de rota (por exemplo `providenciaComOrgaoSchema`, `ocorrencias.ts:972`, e os `z.object({ id: z.string().uuid() })` em linha de `evidencias.ts:591/628`); as primitivas que elas usam (uuid, enum, número, texto) foram cobertas pelos outros esquemas e por `primitivos.txt`.
- Mutações (todas desfeitas com `git restore`; `git status --short` termina só com a pasta de validação, untracked): saídas em `$Q/e19/mut-*.txt`.

## Cenários positivos

- Pedido com tipo de arquivo válido, tamanho 1 e 15 MB, `coletadaPor` UUID v4 e v7, data com `Z`: aceitos nas duas versões (`$Q/e06/pedido-evidencia.txt`).
- Email, URL e `.coerce.number()` sobre 56, 45 e 25 valores: zero diferença entre Zod 3 e Zod 4 (`primitivos.txt`).
- `GET /avisos?desde=2026-10-24T12:00:00Z` responde 200; `POST /auth/entrar` com email inválido responde 422 com "Informe um email válido" (`probe-api.txt`).
- Aplicativo: `conferirColeta` (usa os mesmos esquemas) aprova a coleta válida e devolve frases em português para GPS 0, assinante vazio, foto GIF, tamanho NaN, tamanho ausente, 20 MB, chave não UUID e checklist vazio (`$Q/e15/conferir.mjs`, saída no corpo do relatório da E15).

## Cenários negativos

- Armadilha do UUID: `11111111-1111-1111-1111-111111111111`, versão 0 e 9, variante 7 e `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` eram aceitos no Zod 3 e agora são recusados com "Não é um identificador válido (UUID)" (7 de 21 valores, `primitivos.txt`).
- Rotas com id fora do padrão: `GET /ocorrencias/11111111-1111-1111-1111-111111111111` responde 422 "Identificador inválido"; com v4 inexistente responde 404 (`probe-api.txt`).
- Data e hora sem segundos (`2026-10-24T12:00Z`), `+0300`, `+24:00`, `+03:60`: agora recusados (`primitivos.txt`).
- Corpo torto: 400 `corpo_invalido`; sem token: 401 (`probe-api.txt`).

## Tentativas de reprovar

1. **Frase em inglês.** Provoquei cada classe de problema do Zod 4 (124 casos, `codigos.txt`) e 76 mil casos dos esquemas reais. Nenhuma em inglês. O vão que achei é de outro tipo (achado 1: frase em português errada, não em inglês).
2. **Validação mais frouxa.** Compareci email (56 valores), URL (45), datetime com e sem offset (38), uuid (21), coerce de número (25) e todos os esquemas, com chave desconhecida em cada objeto: `.strict()` e `.passthrough()` não existem no código, `.default()` dentro de `.optional()` e `z.record(z.enum(...))` também não (conferido por busca: DV-20 está correta). Resultado: o Zod 4 só ficou mais estrito (UUID, datetime sem segundos, offset fora de faixa, Infinity). O único caso mais frouxo é objeto `Date` aceito onde se espera objeto (achado 5).
3. **Saída diferente com ambos aceitando.** Comparei o JSON da saída do parse nos dois lados: uma diferença, `eventoTrilhaSchema.detalhe` (um `z.record`) recebendo objeto que HERDA uma propriedade pelo protótipo: o Zod 3 copiava a herdada, o Zod 4 não. Não alcançável por JSON. Com as chaves `__proto__` e `constructor` vindas de `JSON.parse` os dois dão o mesmo resultado e nenhum polui `Object.prototype` (`$Q/e19/h/rec.mts`).
4. **UUID não RFC em caminho real.** Varri `dc360` inteiro (623 literais com formato de UUID, `$Q/e19/uuids-todos.txt`): fora de testes, nenhum tem versão ou variante inválida (sementes, migrações, mock local do painel, fixtures do e2e, dados da demonstração). Em testes, só `11111111-2222-3333-4444-555555555555` em três arquivos do aplicativo (push) e o `11111111-1111-1111-1111-111111111111` do teste novo do shared, que existe para provar a recusa. Geradores reais: `gen_random_uuid()` (v4) em 34 colunas das migrações, `crypto.randomUUID()` na API, `Crypto.randomUUID()` no aplicativo (o código nativo do `expo-crypto` usa `UUID.randomUUID()` no Android e `UUID().uuidString.lowercased()` no iOS: ambos v4). `git log -S` mostra `randomUUID` desde o primeiro commit do aplicativo, sem gerador manual anterior (`xxxxxxxx-xxxx`, `Math.random`), então não há fila antiga no aparelho com chave fora do padrão.
5. **Exceção dentro do mapa de mensagens.** O `JSON.stringify(issue.input)` do ramo de enum lança com BigInt (26 casos, "Do not know how to serialize a BigInt"), e o Zod 3 nunca lançou. JSON não carrega BigInt, e nenhum código do repositório passa BigInt a esquema; fica como achado 4.
6. **Refinamento que roda sobre dado inválido (queda por TypeError).** `vistoriaSchema` usa `v.checklist.some(...)` no `superRefine` e `checklistSchema` usa `itens.every(...)` no `refine`. Passei `[null]`, `[1]`, `["a"]`, `[{}]`, `[{chave:1}]`, `"abc"` e `null` como checklist, com o Zod 3 e o 4: nenhum lança, o Zod 4 também pula o refinamento quando há problema de tipo (`$Q/e19/h/vist.mts`).
7. **Forma do erro, instância e nome.** `ehErroDeValidacao` confere `name === "ZodError"` e `issues` em lista: o `ZodError` do Zod 4 mantém os dois. Uma só cópia do `zod` na raiz (4.6.7) serve `shared`, `api`, `console` e `web` (o `package-lock.json` tem uma entrada); o aplicativo tem o `zod` 4.6.7 de nível superior e o 3.25.76 aninhado em `node_modules/expo/node_modules`. Nenhum arquivo de `apps/campo` nem de `packages/campo` importa `zod`; quem o usa é o `@dc360/shared`, resolvido pelo caminho real (`packages/shared`, que acha o `zod` da raiz). O mapa global de mensagens fica na mesma instância que os esquemas.
8. **Console sem o mapa.** `apps/console` não importa `@dc360/shared`, então seus esquemas sem frase própria devolvem a frase padrão do Zod, em inglês, na primeira mensagem mostrada ao operador (`servidor.ts:735,848,914`). Verifiquei no Zod 3 e no Zod 4: era inglês nos dois ("Required", "String must contain at least 1 character(s)" antes; "Invalid input: expected string, received undefined", "Too small: expected string to have >=1 characters" agora). Pré-existente, mesma classe; a migração só troca o texto em inglês (achado 7).
9. **Mutações (o teste morde).**
   - **M1 (uuid).** `uuidSchema` trocado por regex 8-4-4-4-12 (o Zod 3): `mensagens-em-portugues.test.ts` falha, "11111111-1111-1111-1111-111111111111: expected true to be false" (`$Q/e19/mut-uuid.txt`). Desfeito.
   - **M2 (varredura).** Retirada a linha `"error"` de `PROPRIEDADES_DE_TEXTO`: 2 testes falham em `mensagens-visiveis-com-acento.test.ts` ("expected ['descricao','endereco'] to deeply equal [... 'orgao']" e a exceção "Ambiente precisa ser producao ou teste" deixa de aparecer) (`$Q/e19/mut-varredura.txt`). Desfeito.
   - **M3.** `z.config({ customError })` comentado: 8 de 9 testes de `mensagens-em-portugues` falham (`mut-config.txt`). Desfeito.
   - **M4.** Ramo `values.length === 1` do `invalid_value` desligado: 1 falha (`mut-literal.txt`). Desfeito.
   - **Sobreviveu:** a condição `problema.input === undefined` de `tamanhoBytes` trocada por `false` (frase de ausente igual à de não numérico): 224 de 224 passam (`$Q/e06/mut-tamanho.txt`). Nenhum teste do repositório, antes ou depois, afirma "O tamanho do arquivo não foi informado." (achado 3).
10. **Infra.** Não repeti `auditar`, o CI nem o Metro (tomados como fato do Infra e CI). Repeti só o `expo-doctor` (DoD).

## Achados

1. **Corrige antes de crescer. Regressão de frase introduzida pela correção 10.** Campo obrigatório que é enum e chega AUSENTE (ou `undefined`) agora diz "Valor não reconhecido: undefined. Os aceitos são: ...", em vez de "Campo obrigatório" (Zod 3, que respondia `invalid_type` para ausente). O novo `invalid_value` do mapa (`mensagens-do-zod.ts`, ramo `values.length === 1` e o seguinte) não trata `issue.input === undefined`. Reprodução real (`$Q/e19/probe-api.txt`): `POST /ocorrencias` sem `tipo` e sem `canalEntrada` responde 422 com `campos: [{ campo: "canalEntrada", mensagem: "Valor não reconhecido: undefined. Os aceitos são: telefone, whatsapp, presencial, oficio, outro" }, { campo: "tipo", mensagem: "Valor não reconhecido: undefined. Os aceitos são: deslizamento, inundacao, ..." }]`. Atinge os esquemas com enum obrigatório (`aberturaOcorrenciaSchema`, `cadastroUsuarioSchema`, `triagemSchema`, `devolucaoDeTarefaSchema`, `encerramentoDeSaidaSchema`, `respostaProvidenciaSchema`, `evidenciaPerdidaSchema`, `eventoTrilhaSchema`, `CONTEUDO_ACESSO` do token, `config`), 40 combinações no diferencial (`diff-shared3.txt`, grupo "Campo obrigatório ==> Valor não reconhecido: undefined"). O fato da correção ("Todas as frases em português são as mesmas") é falso para esta classe, e nenhum teste a prende: `mensagens-em-portugues.test.ts:66-70` testa só texto ausente. **Quem lê:** integrador que chama a API direto e o 422 do aparelho; o painel e o aplicativo não chegam aqui porque os selects têm valor inicial (`NovaOcorrencia.tsx:41,52`, `Ocorrencia.tsx:1125`). **Condição da D-31:** a letra (b) se cumpre (alcançável por quem chama a API), mas não há critério da DoD da E19 sobre essa frase, nada muda em aceitar ou recusar, e não há efeito de segurança ou dado. Classifico como dívida a pagar antes de crescer, não como bloqueio; se o gatekeeper ler o (b) como qualquer alcance, o conserto é de duas linhas (`if (issue.input === undefined) return "Campo obrigatório"` no início do `invalid_value`) mais um caso em `mensagens-em-portugues.test.ts`. Sugiro registrar como DV-22.
2. **Corrige antes de crescer. Texto de documentação falso sobre as exceções.** (a) `dc360/README.md:2019` e `dc360/apps/campo/LEIA-ME.md:152` dizem "as seis exceções nomeadas do CP-03"; hoje são 5 pacotes e 7 advisories (`decode-uri-component`, `brace-expansion`, `node-forge`, `shell-quote`, `zod` com `somenteEm`). (b) `dc360/apps/campo/LEIA-ME.md:44` lista como atuais "as seis exceções nomeadas do CP-03 (`decode-uri-component`, `brace-expansion`, `braces`, `node-forge`, `shell-quote`, `sprintf-js`)", e `braces` e `sprintf-js` saíram da lista nesta correção. (c) O parágrafo do CP-03 (`README.md:1631-1633`) cita "`vitest` e `tinypool`" como o que sobra na raiz, mas `auditar-excecoes.mjs` aceita três pacotes de desenvolvimento (`vitest`, `@vitest/mocker`, `tinypool`) e a saída do portão os lista (já anotado pelo Infra). O parágrafo em si está correto no que importa (cinco avisos do Expo, a cópia do `zod` 3 restrita a `node_modules/expo/node_modules/`, prazo 2027-01-05, `braces`/`sprintf-js` fora, `zod` do produto na linha 4). **Condição da D-31:** a DoD cita "exceções com dono e prazo", que está satisfeita no código; a linha de documentação do bloco ("Documentação a atualizar: README e LEIA-ME") foi cumprida nos pontos centrais e contradita em três pontos periféricos. Não é (a), (b) nem (c): dívida.
3. **Anotado. Lacuna de teste em `tamanhoBytes`.** A função `error` do `tamanhoBytes` (`evidencia.ts:102`) separa "não foi informado" de "precisa ser um número de bytes"; o mutante `input === undefined` para `false` sobrevive (224 de 224). A lacuna é anterior (nenhum teste afirmava a frase no Zod 3 também); a lógica, porém, é nova. Execução do caso real: `tamanho ausente` e `undefined` dão a frase certa, `null`, `"1000"`, `NaN`, `true`, `[]` e `{}` dão a segunda (`pedido-evidencia.txt`). Sem condição de bloqueio (D-31 item 1, comportamento correto hoje).
4. **Anotado. Exceção latente no mapa.** `JSON.stringify(issue.input)` no ramo de enum lança `TypeError` para BigInt (26 casos no diferencial). Exige código do repositório que passe BigInt a um esquema; a API recebe JSON, que não carrega BigInt. Latente (D-31 item 1).
5. **Anotado. Objeto `Date` passa onde se espera objeto** (`pessoasAtingidasSchema`, `config`, `consultaSchema` de `avisos` e de `ocorrencias`, que só têm campos opcionais). Só por objeto `Date` construído em código; JSON e query string não o produzem. Latente.
6. **Anotado. DV-19 a DV-21 e DV-04 a DV-07.** DV-19: confirmada, idêntica no Zod 3 (`?pagina=abc` dá "Era esperado um número, veio um número"; `probe-api.txt`). DV-20: confirmada, nenhuma ocorrência de `.default()` dentro de `.optional()` nem de `z.record(z.enum(...))` no código. DV-21: um pouco mais larga do que o registro: além de `Infinity` (inalcançável), `tamanhoBytes: 1e21` é alcançável por JSON e agora devolve DUAS frases ("precisa ser um número inteiro de bytes" e "passa de 15 MB"); a primeira é falsa, o ato continua recusado, efeito só de texto. Também há frases duplicadas por campo quando o tipo é errado e a regra de tamanho ainda roda (lista dada onde se espera texto: "Era esperado um texto, veio uma lista" mais "Informe o nome"), e "Precisa ser menor ou igual a 9007199254740991" aparece junto da frase própria para valores acima de 2^53. Nenhuma pior no sentido de segurança ou dado. DV-04 e DV-07: não mudaram (o texto do README segue sem dizer que o `npm ci --omit=dev` que não instala pacote marcado `dev` é o do npm 10 da imagem); DV-05: reconfirmei local 21 de 21 e o CI continua pulando; DV-06: some, o `auditar` sai 0 hoje (Infra).
7. **Anotado, anterior à etapa. Console em inglês.** O console não carrega o mapa em português; ver tentativa 8. Não é regressão da migração (já era inglês no Zod 3). Dono sugerido: etapa que tocar o console.

## Não verificado

- Windows (sem a plataforma) e o `auditar` no runner: coberto pelo CI (12 de 12) e pelo Infra, não repeti.
- Metro empacotando com Zod 4 e o aplicativo em aparelho ou emulador: Infra tomou o Metro; o navegador do painel (bundle com Zod 4) foi exercitado pelo `test:e2e:api` desta rodada, 325 de 325.
- `npm run test:campo` inteiro (139 suítes, 1997): o CI rodou; eu rodei 17 + 24 suítes ligadas à etapa e o `tsc` do aplicativo, e a suíte do pacote `@dc360/campo` (238).
- Os testes do painel (`apps/web`, 723) e do console (307): não rodei localmente (CI e fatos do implementador).
- Diferencial dos esquemas declarados DENTRO de funções de rota da API (por exemplo `providenciaComOrgaoSchema`) e dos `z.object({ id: z.string().uuid() })` em linha: não extraíveis pelo meu método; cobertos só por equivalência de primitivas.
- Imagem Docker e `npm ci --omit=dev` no npm 10 (DV-07): não reexecutei.
- Comparação da API HTTP inteira contra a árvore de `60cbc2f` rodando: comparei os esquemas, não dois servidores ao mesmo tempo (o servidor antigo não sobe com o Zod 4 instalado).
- O `ocorrenciaSchema` (esquema de resposta) só foi testado com entradas inteiras, sem amostra válida.
- A decisão de Rafael sobre ler a letra (b) da D-31 no achado 1.

## Risco residual

- Os achados 1 e 2 são texto (frase de 422 menos amigável para quem chama a API direto; documentação com contagem velha das exceções).
- O `auditar` depende do registro no dia (perecível); `expo-doctor` 21 de 21 só tem prova local.
- O console continua entregando frases em inglês ao operador (achado 7).

## Motivo do humano

Não necessário para esta dimensão. A única decisão que cabe a quem decide a política é se o achado 1 conta como bloqueio pela letra (b) da D-31; a recomendação é registrar como dívida e consertar junto do próximo toque em `mensagens-do-zod.ts`.
