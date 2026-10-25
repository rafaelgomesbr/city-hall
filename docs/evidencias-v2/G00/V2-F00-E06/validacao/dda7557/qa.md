---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de: fd17ff4 (rodada 7, QA PASS) para o que a etapa fez; esta rodada revalida só o que a correção 10 da E19 tocou no esquema do pedido de evidência e nos esquemas que a fila usa
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$Q` = `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/qa-lote`. Produto validado: o da árvore em `d4683cc` (só difere de `dda7557` em `STATUS.md` e `ESTADO-ATUAL.md`). Por diferença desde `fd17ff4`/`60cbc2f`: `git diff 60cbc2f..dda7557 -- dc360/packages/campo` é vazio (o motor da fila e `transporte.ts` não mudaram); mudaram os esquemas de `@dc360/shared` que a fila consome (`pedidoDeEvidenciaSchema` em `evidencia.ts`, o mapa de mensagens, o UUID estrito do Zod 4) e seis linhas de dublê em testes do aplicativo. Procurei regressão por esse caminho.

| Critério (bloco da etapa e pedido da rodada) | Resultado | Prova |
| --- | --- | --- |
| 401 `sessao_encerrada` e 403 `conta_desativada` deixam todos os itens `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado | PASS | `npm run test --workspace @dc360/campo`: 11 arquivos, 238 de 238, código 0 (`$Q/e06/pkg-campo.txt`); mordida M-E06 abaixo |
| Sem token vira `FalhaDeSessao`; 403 `sem_permissao` continua permanente | PASS | `pausa-de-sessao.test.ts` e `pausa-por-senha-provisoria.test.ts` dentro do mesmo resultado |
| 401 `nao_autenticado` renova uma vez e envia; depois de entrar de novo, os itens pausados sobem sem duplicar | PASS | `pausa-de-sessao.test.ts`; `src/dados/token.test.ts` e `src/ui/pausa-cai-ao-entrar-de-novo.test.tsx` dentro de `$Q/e06/jest-app.txt` |
| Aplicativo: renovação única com piso, frase de conta desativada, fila pausada na tela | PASS | `$Q/e06/jest-app.txt`: 24 suítes ligadas à fila, à sessão, ao token, à falha de atualização e à devolução, 310 de 310, código 0 (worktree `d4683cc` com `npm ci`; lista em `$Q/e06/arquivos-app.txt`) |
| Desativar o agente entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica | PASS | `campo-integracao.test.ts` 17 de 17 dentro de `npm run test --workspace @dc360/api`: 106 arquivos, 1717 passam, 34 pulados, código 0 (`$Q/e19/api-test.txt`) |
| `autor_divergente` (409) continua | PASS | `evidencia-so-do-autor.test.ts` 11 de 11 (autorizar com `coletadaPor` de outra pessoa dá 409 `autor_divergente`, reautorizar chave alheia dá 409, confirmar evidência alheia dá 409), `autoria-da-coleta.test.ts` e `devolucao-de-tarefa.test.ts`, todos dentro de `api-test.txt`; `campo-integracao.test.ts:799` confere `ultimaFalha.codigo === "autor_divergente"` no item da fila |
| O pedido de evidência recusa e aceita exatamente o que recusava e aceitava, com as mesmas frases | PASS com 5 entradas diferentes, catalogadas (todas mais estritas ou só de texto) | `$Q/e06/pedido-evidencia.txt`: 47 entradas executadas no Zod 3.25.76 (`60cbc2f`) e no Zod 4.6.7 (`dda7557`) |

## Evidência

- `$Q/e06/pedido-evidencia.txt` (script `$Q/e19/h/e06-pedido.mts`): as 47 entradas cobrem tipo de arquivo (GIF, PDF, ausente, nulo, número, vazio, PNG, WebP, HEIC, maiúsculas), tamanho (ausente, `undefined`, nulo, texto, `NaN`, 1,5, -1, 0, 1, 15 MB, 15 MB mais 1, 1e21, `Infinity`, `-Infinity`, lista, objeto), `coletadaPor` (ausente, `undefined`, nulo, `"abc"`, vazio, v4 maiúsculo, o UUID não RFC `11111111-1111-1111-1111-111111111111`, v7, número), ids, data de captura (sem segundos, com offset, distante), chave desconhecida, corpo vazio, corpo nulo e corpo texto.
- Resultado: 42 IGUAIS (aceita/recusa e as mesmas frases) e 5 DIFERENTES (em quatro grupos):
  1. `tamanhoBytes: 1e21`: Zod 3 dava só "O arquivo passa de 15 MB"; Zod 4 dá essa e "precisa ser um número inteiro de bytes" (duas frases, mesma recusa).
  2. `Infinity` e `-Infinity`: a frase passa a ser "precisa ser um número de bytes" (DV-21; antes eram duas frases de teto e de inteiro). Mesma recusa.
  3. `coletadaPor` = `11111111-1111-1111-1111-111111111111`: Zod 3 aceitava, Zod 4 recusa com "Não é um identificador válido (UUID)". Nenhuma origem real (ver tentativas de reprovar, item 3).
  4. `capturadaEm` = `2026-10-24T12:00Z` (sem segundos): Zod 3 aceitava, Zod 4 recusa com "A data de captura precisa estar no formato ISO 8601." O aparelho sempre envia `toISOString()` (`vistoria/[id].tsx:1640,1871`), com segundos e milissegundos.
- `coletadaPor` ausente, `undefined` e v7 continuam aceitos; nulo, `"abc"`, vazio e número continuam recusados, com as mesmas frases do Zod 3.
- A frase de `tipoConteudo` ("Tipo de arquivo não aceito: só entram JPEG, PNG, WebP e HEIC.") é a mesma para ausente, nulo, número, vazio e tipo fora da lista, nas duas versões. A de `tamanhoBytes` separa "não foi informado" (ausente e `undefined`) de "precisa ser um número de bytes" (nulo, texto, NaN, booleano, lista, objeto) nas duas versões.
- Mordidas (em `$Q/e06/mut-*.txt`, todas desfeitas com `git restore`, `git status --short` sem arquivo modificado ao fim):
  - **M-E06** (a linha `if (acao === "parar_e_avisar") return falhaDeSessao("conta_desativada", corpo);`, `transporte.ts:97`, trocada por comentário): 6 de 238 reprovam, entre eles "403 conta_desativada vira FalhaDeSessao, com a frase do servidor", "403 conta_desativada pelo fio: pausa por conta desativada, item pendente" e os dois da matriz de classificação (`mut-transporte.txt`).
  - **M-COL** (`coletadaPor: uuidSchema.optional()` trocado por obrigatório): 7 de 224 reprovam no shared (`mut-coletadapor.txt`).
  - **M-TAM** (a condição `problema.input === undefined` da função de erro de `tamanhoBytes` trocada por `false`): **224 de 224 passam, o mutante sobrevive** (`mut-tamanho.txt`). Ver achado 1.

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e envia; os itens pausados sobem depois de entrar de novo sem duplicar (mesma chave de idempotência): verdes nos 238 do pacote e nos 310 do aplicativo.
- Pedido válido (tipo JPEG, 1000 bytes, `coletadaPor` UUID v4): aceito, nas duas versões.

## Cenários negativos

- 401 `sessao_encerrada` e 403 `conta_desativada`: zero bloqueado, tentativas inalteradas; sem token: `FalhaDeSessao`; 403 `sem_permissao` ainda bloqueia (testes citados acima, e a mordida M-E06).
- Autoria: item de outro autor espera o autor; `coletadaPor` de outra pessoa dá 409 `autor_divergente` na API (`evidencia-so-do-autor.test.ts`) e no item da fila (`campo-integracao.test.ts:799`).
- Pedido de evidência: tipo GIF e PDF, tamanho 0, -1, NaN, 15 MB mais 1, `coletadaPor` inválido: recusados com a frase em português (`pedido-evidencia.txt`).

## Tentativas de reprovar

1. **A fila perde item com o Zod 4?** O código da fila não mudou (`packages/campo` sem diferença). O que a fila lê é o código e o corpo do 4xx; reprovei no lado do esquema: `conferirColeta` roda os esquemas do pacote compartilhado antes de enfileirar (com `@dc360/shared` compilado do worktree), e uma coleta válida continua APROVADA e uma inválida devolve frases em português (saída no relatório da E15, `$Q/e15/conferir.mjs`). Os 238 testes do motor e os 310 do aplicativo ligados à fila passam, entre eles `pausa-velha`, `deposito-sqlite`, `devolucao` e `correcao-da-coleta`.
2. **O 422 da API continua legível para a fila.** O corpo do 422 mantém `{ erro: "dados_invalidos", mensagem, campos: [{ campo, mensagem }] }` (`$Q/e19/probe-api.txt`); a fila decide corrigir ou repetir por `campos`, que continua com o mesmo formato e caminhos pontuados (`fotos.0.tamanhoBytes`).
3. **UUID estrito no caminho do pedido.** `coletadaPor` é o `usuarioId` do token (`gen_random_uuid()`, v4) e `ocorrenciaId` e `idempotencyKey` vêm do servidor e de `Crypto.randomUUID()` (v4, conferido no código nativo do `expo-crypto`: Android `UUID.randomUUID()`, iOS `UUID().uuidString.lowercased()`). Varri o repositório inteiro por literais com formato de UUID (623, `$Q/e19/uuids-todos.txt`): nenhum fora de teste tem versão ou variante inválida. Itens antigos já guardados no aparelho também usam `randomUUID` desde o primeiro commit do aplicativo (`git log -S`), então nenhum vira 422 permanente por causa do UUID.
4. **Data de captura sem segundos.** Um aparelho antigo ou uma foto com data de captura montada à mão passaria no Zod 3 e seria recusada no Zod 4. Procurei todo ponto em que o aplicativo e o motor produzem `capturadaEm`, `coletadaEm`, `declaradaEm`, `decididaEm`, `confirmadoEm`: todos por `toISOString()` (ou `agora().toISOString()`); `rascunho.coletadaEm` nasce na criação do rascunho pelo mesmo caminho (`rascunho.ts:215`).
5. **Armadilha de corrida do 401 com o esquema.** Não aplicável: o esquema não participa da renovação de token.
6. **Frase em inglês no pedido.** Provoquei os 47 casos; nenhuma frase em inglês. O único defeito de texto que achei na classe do pedido é o catalogado como diferença 1 (duas frases para 1e21).
7. **Autorização no pedido.** `autor_divergente` continua 409 com `coletadaPor` de outra pessoa; `coletadaPor` ausente continua aceito (aparelho de versão anterior, `evidencia-so-do-autor.test.ts:187`). Não achei caminho de aceitar a evidência de outro autor.

## Achados

1. **Anotado. Mutante sobrevivente em `tamanhoBytes`.** A função de erro nova (`evidencia.ts:101-103`) separa a frase de "ausente" da de "não numérico", e nenhum teste do repositório afirma "O tamanho do arquivo não foi informado." (M-TAM: 224 de 224 passam com a distinção removida). A lacuna é anterior à migração (o Zod 3 também não tinha teste), a lógica é nova e o comportamento está correto hoje (executado: `pedido-evidencia.txt`). **D-31:** não viola a DoD da E06 (nenhum critério sobre a frase de tamanho) nem é alcançável com efeito (a recusa é a mesma); dívida de teste. Conserto: um caso em `evidencia.test.ts` com `tamanhoBytes` ausente e outro com `"1000"`.
2. **Anotado. Frases duplicadas e `Infinity`.** Diferenças 1 e 2 acima (DV-21 já registrada; a de 1e21 é um pouco mais larga: alcançável por JSON, mas só de texto). Sem efeito de aceitar ou recusar.
3. **Anotado. Mais estrito no Zod 4** (UUID não RFC e data sem segundos em `capturadaEm`): nenhuma origem real no produto. Se um aparelho em campo tiver uma coleta guardada com `capturadaEm` sem segundos, ela viraria 422 de campos; não achei gerador que a produza.
4. **Herdado, sem mudança:** o E2E no emulador e as frases no aparelho (E4 da etapa) seguem pendência humana.

## Não verificado

- O E2E da etapa no emulador (desativar o agente no painel durante uma coleta na fila, ver a frase e o item preservado, reativar e entrar de novo): sem emulador nem aparelho nesta máquina.
- A leitura das frases de "conta desativada" e da tela de fila pausada no aparelho real (conteúdo de produto, aprovação do Rafael).
- A fila contra rede real instável e o ciclo de vida do Expo (renovação de token no meio de queda de rede): os testes usam transporte simulado e o servidor em porta efêmera; nada de rede real.
- A suíte inteira do aplicativo (139 suítes, 1997): rodei as 24 da fila e da sessão; o CI rodou a inteira (run 40132234324, verde).
- Mordidas só no `transporte.ts` e em `evidencia.ts`; não repeti as 13 mutações das rodadas anteriores sobre `fila.ts` (o arquivo não mudou).
- Itens persistidos em aparelhos reais com versões antigas do aplicativo: concluí por leitura de histórico (`git log -S randomUUID`) e de código, sem abrir um banco de aparelho.
- Node 24.15.0 local contra o 22 do CI.

## Risco residual

O comportamento no aparelho real (ciclo de vida do Expo, rede caindo no meio da renovação, armazenamento nativo) só a validação humana cobre. Fora isso, o risco novo desta rodada é só de texto (frases duplicadas para 1e21) e de teste (M-TAM).

## Motivo do humano

A etapa pede que Rafael veja a frase no aparelho e o item preservado, e o E2E é no emulador: nenhum dos dois existe nesta máquina, e a leitura da frase é conteúdo de produto.
