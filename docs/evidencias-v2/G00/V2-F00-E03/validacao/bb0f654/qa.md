---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E03
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Registro lido: `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`, seções 8.8 e 9 (a 9 vale por cima das anteriores), e `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` (T42, regras R1 a R6). Código conferido em `bb0f654` (HEAD `0290af5` só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E03-E21-E22/` (abreviado `V/`). Máquina: Mac de 8 núcleos, Node 24, LibreSSL 3.3.6.

| Critério | Resultado | Prova |
| --- | --- | --- |
| As seis linhas que a rodada 3 achou abertas (V-INS-02 a 06, V-ROT-02) estão fechadas pelo trabalho descrito | PASS | código conferido em `bb0f654`: `esperarORelogioAndar` em `apps/api/test/esperar-o-relogio.ts` e nos 4 arquivos; só restam 3 `setTimeout` fixos em `apps/api/test`, todos as janelas de silêncio de `push-rodada-diz-o-que-fez.test.ts:249,261,303` com o motivo no comentário; `dominio.test.ts` com `}, 60_000)`; `regras-de-conteudo.test.ts` com `lerSeExistir` e `statSync(..., { throwIfNoEntry: false })`; `isolamento.test.ts` com `cederOLaco` em `afterEach` e em `sobras()` e limite de 240 s, sem asserção alterada (diff de `9a47509`); `fluxo-api.e2e.mjs:917` `irParaQuandoOPainelResponder`; `baseline.mjs` passo 19 `e2e-firefox` (`--so-listar`) |
| Cada linha tem causa, classe, regra, etapa ou dono que existe | PASS para as 72 linhas do registro | 9.3: 71 fechadas, 1 tolerada (V-DEP-3, prazo 2027-01-05, conferido em `scripts/auditar-excecoes.mjs:28`), 0 abertas; a soma 71 + 1 = 72 bate com 8.8.4 (65 + 1 + 4 + 2) |
| Nenhum vermelho CONHECIDO sobrevive sem registro (T42; DoD "registro completo"; G00 "registro da E03 com zero itens abertos") | **FAIL** | `npm run test:api` no SHA: código 1, `Tests 1 failed / 1326 passed / 20 skipped (1347)`, a falha é `openssl-do-teste.test.ts > respeita OPENSSL_CONF válido` (`V/07-test-api.txt`). É vermelho conhecido desde 2026-10-14 (README `:1129-1133`, STATUS, e o próprio `correcao-4/RESUMO.md`: "`openssl-do-teste.test.ts` segue reprovando por divergência da máquina"). Não tem nenhuma das três saídas da T42: não foi consertado, não foi reescrito com registro, não tem skip com marca; e não tem linha no registro único (`grep -i 'libressl\|openssl-do-teste'` no registro: zero acertos). A seção 9.3 afirma "0 abertas" com esse vermelho vivo |
| Regra de decisão BZ-N:N.3 e os 14 defeitos do campo decididos por Rafael | PASS (registro) | `correcao-2/RESUMO.md` registra Q1 a Q5 de 2026-10-13; não reverificado com Rafael (humano) |
| Linhas de classe B citam evidência datada | PASS por herança de leitura das rodadas anteriores, reconferido por amostra | seção 3 inalterada desde a rodada 3 (o diff `52952a1..bb0f654` só acrescenta a seção 9) |
| O conserto não esconde defeito real (risco de segurança da etapa) | PASS | mutantes abaixo mostram que os testes trocados continuam mordendo |

## Evidência

Comandos (em `dc360/`, todos no SHA, árvore principal sem alteração):

| Comando | Código | Saída |
| --- | --- | --- |
| `npm run typecheck` | 0 | `V/01-typecheck.txt` |
| `npm run test:isolamento` (livre) | 0, 345 passam, 3 pulados por ambiente; caso das seis vias 15,2 s | `V/02-test-isolamento.txt` |
| `npm run test:isolamento` com 16 laços de CPU (`node -e 'for(;;){}'`) rodando juntos | 0, 345 e 3, caso das seis vias 49,7 s, nenhum `Errors` nem `onTaskUpdate` | `V/02b-isolamento-sob-carga16.txt` |
| `npm run test --workspace @dc360/shared` | 0, 170 de 170 | `V/03-test-shared.txt` |
| `npm run test:scripts` | 0, 288 de 288, 0 pulados (há `apps/campo/ios/` nesta máquina) | `V/04-test-scripts.txt` |
| `npm run conferir:numeros` | 0, 25 afirmações; portão de skip: 0 incondicionais marcados, 4 pontos por ambiente | `V/05-conferir-numeros.txt` |
| `node scripts/portao-de-skip.mjs` | 0 | `V/06-portao-de-skip.txt` |
| `npm run test:api` | **1**: 1 falha (`openssl-do-teste`, LibreSSL), 20 pulados por ambiente (`DC360_POSTGRES_DE_PROVA` ausente; o job `implantavel` do CI define a variável, `verificar.yml:691`) | `V/07-test-api.txt` |
| `npm run test --workspace @dc360/web` | 0, 665 de 665 | `V/08-test-web.txt` |
| `npm run test:campo` | 0, tipos limpos, 1927 casos | `V/09-test-campo.txt` |
| `npm run test:console` | 0, 259 de 259 | `V/10-test-console.txt` |
| `npm run test --workspace @dc360/campo` | 0, 223 de 223 | `V/11-test-campo-pacote.txt` |
| mutantes de V-INS-04 num clone novo do SHA | ver "Cenários negativos" | `V/03-mutantes-ins04.txt` |

## Cenários positivos

- As suítes que o registro cobre ficam verdes no SHA: shared 170, banco 345 (e 3 por ambiente), motor 223, console 259, painel 665, aplicativo 1927, scripts 288, typecheck 0.
- V-INS-05 sob carga: 16 laços de CPU durante o `test:isolamento` inteiro, código 0, sem o `Timeout calling "onTaskUpdate"` que a correção 4 diz ter fechado.
- `regras-de-conteudo.test.ts` 10 de 10 no clone (os 2 casos novos incluídos).

## Cenários negativos

- V-INS-04, mutante 1 (clone novo, `statSync(caminho)` sem `throwIfNoEntry: false`): o caso "tolera o arquivo que some entre a listagem e a leitura" reprova com `ENOENT ... stat`. Desfeito com `git checkout` no clone.
- V-INS-04, mutante 2 (`lerSeExistir` deixa de tolerar ENOENT): o caso "só tolera ENOENT" reprova (1 de 10). Desfeito.
- V-INS-02: a busca por `setTimeout(<fn>, <número>)` em `apps/api/test`, `db/test`, `packages/shared/test` e `apps/console/test` só acha as 3 janelas de silêncio declaradas; nenhuma espera fixa de evento sobrou.
- T42, o negativo da etapa ("nenhum vermelho fica sem linha"): rodando as suítes, um vermelho real aparece (`openssl-do-teste`) e não tem linha. É o FAIL.

## Tentativas de reprovar

1. Procurei vermelho fora do registro rodando todas as suítes locais do produto (exceto e2e de navegador): achei o `openssl-do-teste` (FAIL acima).
2. Tentei derrubar V-INS-05 com 16 laços de CPU: não caiu.
3. Mutei a tolerância a ENOENT de V-INS-04 de dois jeitos: os dois mutantes morrem.
4. Procurei espera fixa que tivesse escapado da troca de V-INS-02: nenhuma além das janelas de silêncio.
5. Conferi se a correção 4 mudou asserção para ficar verde (diff de `9a47509` em `isolamento.test.ts`, `dominio.test.ts`, testes da API): só limites, esperas por condição e cessão do laço; nenhuma asserção tirada.
6. Conferi se os skips por ambiente do `test:api` (20) e do banco (3) são incondicionais disfarçados: o bloco de Postgres real roda no CI (`verificar.yml:691` define `DC360_POSTGRES_DE_PROVA`) e o portão de skip os conta.

## Achados

1. **FAIL (bloqueia a etapa).** `dc360/apps/api/test/openssl-do-teste.test.ts`, caso "respeita OPENSSL_CONF válido": vermelho determinístico no macOS (LibreSSL 3.3.6), conhecido desde 2026-10-14 e citado pela própria correção 4, sem linha no registro único e sem uma das três saídas da T42. Reprodução: `cd dc360 && npm run test:api` num Mac com o `openssl` do sistema: `Tests 1 failed`, código 1; o mesmo vale para `npm test` e `npm run verificar`. A política (R3) manda mudar como o teste fala com a máquina sem mudar o que ele afirma, ou pular com marca `T42 dono= issue= ate=`, ou ao menos registrar a linha com dono, etapa e prazo; a seção 9.3 do registro afirma "0 abertas" e o item do G00 depende disso. O validador de Infra e CI da rodada 3 da E21 já tinha apontado o mesmo caso como "corrige antes de crescer (dono: E21)". Conserto mínimo: uma linha nova no registro (ex.: V-API-03, classe R3, dono, etapa e prazo) e o conserto do controle do teste (por exemplo a configuração pedir `CA:TRUE` e o teste conferir que veio), ou o skip por ambiente com a condição de LibreSSL e motivo escrito.
2. **Anotado.** O comentário de `cederOLaco` em `db/test/isolamento.test.ts` está sem acentuação ("maquina", "unico", "cessao"). Não quebra critério.

## Não verificado

- O e2e de navegador (V-INS-06 e o passo `e2e-firefox` de V-ROT-02): não rodei Playwright nesta validação; conferi só o código (`fluxo-api.e2e.mjs:917-938`, `baseline.mjs` passo 19).
- O CI do SHA (run 39143791434 citado pelo implementador, não lido): Linux e Postgres 17 não provados por mim.
- Windows: nenhuma execução no Windows; as falhas originais de V-INS-03, 04 e 06 eram de lá.
- A decisão de Rafael (Q1 a Q5) só está registrada; não confirmei com ele.

## Risco residual

- V-INS-02, 03, 04 e 06 foram fechadas de forma preventiva (a correção diz que não reproduziam); se voltarem por outra causa, é linha nova.
- O portão de skip é leitura por linha e não enxerga vermelho que não está pulado: um teste que falha só numa plataforma (como o do LibreSSL) passa por ele, e o único controle é o registro, que hoje está incompleto.

## Motivo do humano

Rafael decide se a falha do LibreSSL no macOS é aceita como divergência de máquina fora da T42 (o que exigiria mudar a política escrita) ou se entra no registro com dono, etapa e prazo; e continua pendente a confirmação humana das decisões Q1 a Q5 da E03 (decisão de produto).
