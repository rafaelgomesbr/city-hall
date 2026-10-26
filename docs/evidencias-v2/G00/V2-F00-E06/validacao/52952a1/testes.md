---
validador: testes (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão testes. Os três defeitos que reprovaram a rodada 2 nesta dimensão estão fechados e os testes novos mordem quando o conserto é desfeito. Ficam abertos quatro achados "corrige antes de crescer": dois herdados da rodada 2 (lacunas F5 e F6 do motor; A9 e A12 do aplicativo, mutações que continuam vivas) e dois novos: a tarja de "Enviar agora" com a fila pausada (apontada pelo QA desta rodada, aqui provada por sonda) e um teste cujo nome promete mais do que o produto faz.

Base: `$SP/val/testes/` (prefixo `e06-`). Antes de tudo: `npm run build:shared` código 0 (`00-build-shared.txt`).

| Critério (bloco da E06, rodada 2 e QA desta rodada) | Resultado | Prova |
| --- | --- | --- |
| R2 achado 1 (bloqueava): `obterFila` concorrente e faixa global ligada à fila real sem teste | FECHADO, morde | M1 (volta `obterFila` para "confere e depois espera"): 6 de 59 reprovam (os 3 de `obter-fila-uma-so` que testam a instância e os 3 de `faixa-ligada-a-fila-real`) (`e06-10-M1-obterFila-corrida.txt`) |
| a falha de criação da fila não fica gravada em `obterFila` | morde | M2 (tira o `fila = null` do `catch`): 1 reprova (`e06-11-M2-falha-gravada.txt`) |
| R2 achado 2: `troca-de-conta-com-pedido-em-voo` dependia da ordem | FECHADO | cada caso sozinho (`-t`) passa; sementes 2, 4, 6, 8, 10 e 12 (as que reprovavam) passam (`e06-06-troca-de-conta-isolado-e-sementes.txt`); lote de 11 arquivos da etapa com `--randomize`, sementes 1 a 8: 164 de 164 em todas (`e06-04-app-lote-8-sementes.txt`) |
| cartão da tarefa não manda esperar sinal com a fila pausada (conserto da correção 2) | morde | M3 (a tela ignora `pausadaPor` do resumo): 4 reprovam (`e06-12-...`); M4 (`ordem-do-dia` ignora a pausa): 5 reprovam (`e06-13-...`) |
| piso de renovação forçada (risco de segurança da etapa: "a renovação forçada é uma, com piso") | morde | K (o piso não vale para `renovarJa`): 3 reprovam (`e06-15-...`) |
| 403 `conta_desativada` entre enfileirar e drenar fica no aparelho (teste de autorização da etapa, contra a API real) | morde | `campo-integracao` e `evidencia-so-do-autor`: 28 de 28 (`e06-30-...`); com `parar_e_avisar` caindo no permanente no motor (rebuild do pacote): o caso "conta desativada entre enfileirar e drenar" reprova (`e06-31-...`); fonte restaurada e pacote reconstruído |
| R2 achado 3: lacunas F5 e F6 do motor | AINDA ABERTO | F5 (dreno cancelado mexe no item que outro dreno tem em voo) e F6 (`tratarFalha` não ignora item `confirmado`): 223 de 223 verdes com cada mutação (`e06-02-motor-F5.txt`, `e06-03-motor-F6.txt`). O motor não mudou desde `4b96ea7` |
| R2 achado 4: A9 e A12 | AINDA ABERTO | A9 (o laço espera 15 s mesmo com a fila pausada): jest INTEIRO do app 1927 de 1927 verde com a mutação (`e06-14-...`); `pausa-da-fila.test.ts` só confere a constante, não que o laço a usa. A12 (o pedido comum de token também lança `conta_desativada`): 118 de 118 verdes (`e06-16-...`) |
| R2 achado 5: dublê de `expo-sqlite` com `runAsync` sem retorno | anotado, igual | os três arquivos novos usam o mesmo dublê (`runAsync` devolve `undefined`); nada depende do retorno hoje |
| nada pulado sem dono | PASS | `node scripts/portao-de-skip.mjs` código 0 (`01-portao-de-skip.txt`); zero `skip`, `only`, `todo` nos testes do campo no diff `4b96ea7..52952a1` |
| suítes verdes e estáveis | PASS | motor `vitest --sequence.shuffle` 3 vezes, 223 de 223 (`e06-01-...`); jest do app inteiro 134 suítes, 1927 de 1927 (`00-jest-app-completo.txt`) |

## Evidência

- `cd dc360/packages/campo && npx vitest run --sequence.shuffle` (3x): código 0, 223 de 223. `$SP/val/testes/e06-01-motor-aleatorio-3x.txt`.
- `cd dc360/apps/campo && npx jest`: código 0, 1927 de 1927, com o aviso "A worker process has failed to exit gracefully" (anotado). `00-jest-app-completo.txt`.
- `npx jest --ci --randomize --seed=N` com os 11 arquivos da etapa (`a-lista-com-a-fila-pausada`, `obter-fila-uma-so`, `faixa-ligada-a-fila-real`, `troca-de-conta-com-pedido-em-voo`, `fila-pausada-pela-sessao`, `faixa-de-sincronizacao`, `pausa-da-fila`, `ordem-do-dia`, `falha-de-atualizacao`, `token`, `api-conta-desativada`), N de 1 a 8: 164 de 164 em todas. `e06-04-...`.
- Mutações (cada uma aplicada por `sed` ou script Python, rodada e desfeita com `git restore src`; `git status --porcelain src` vazio depois de cada uma): `e06-10` a `e06-16`.
- Sonda da tarja de "Enviar agora" (arquivo temporário `src/__tests__/zz-sonda-enviar-agora-pausada.test.tsx`, cópia de `devolver-tarefa-vencida.test.tsx` com um caso a mais; apagado logo depois): `e06-05-sonda-enviar-agora-pausada.txt`, trecho em `sonda-enviar-agora-pausada.trecho.tsx`.
- API: `cd dc360/apps/api && npx vitest run test/campo-integracao.test.ts test/evidencia-so-do-autor.test.ts` código 0, 28 de 28.

## Cenários positivos

- A faixa global, montada no mesmo instante em que o "laço" pede a fila, assina a MESMA instância (espião na instância do laço chamado uma vez) e mostra "Sessão encerrada" e "Defina a sua senha" com a fila, o transporte, o depósito e `obterFila` reais.
- A lista de tarefas com a fila andando continua dizendo "O que falta é sinal para enviar" (controle de `a-lista-com-a-fila-pausada-nao-pede-sinal`).

## Cenários negativos

- Com a fila pausada por sessão, senha provisória ou conta desativada, o cartão da sugerida não diz "sinal" (4 casos de tela e 4 de `ordem-do-dia`, todos mordem).
- Autoria: o 403 tardio é da Ana e o Bruno não lê a pausa dela, agora independente da ordem.
- A recusa por conta desativada entre enfileirar e drenar deixa o item no aparelho contra a API real, e o teste reprova se o motor voltar a tratar `parar_e_avisar` como permanente.

## Tentativas de reprovar

1. Desfiz cada conserto da correção 2 (M1 a M4): todos derrubam pelo menos um caso.
2. Reexecutei as receitas da rodada 2 para F5, F6, A9 e A12: continuam vivas (nenhum teste novo as cobre).
3. Ordem aleatória com 8 sementes no lote da etapa e as 6 sementes pares que antes reprovavam `troca-de-conta`: verde.
4. **"Enviar agora" com a fila pausada (pergunta do QA desta rodada).** Escrevi um caso no padrão de `devolver-tarefa-vencida.test.tsx`: fila assinada entrega `pausadaPor: "sessao_encerrada"`, o dreno devolve `paradaPor: "sessao_encerrada"` e o item fica `pendente`; toca em "Enviar agora" e exige que a tela não diga "houver sinal". **Reprova** com a frase "A coleta continua guardada no aparelho e sai quando o aplicativo estiver aberto e houver sinal." (`e06-05-...`). Nenhum teste do repositório pega isso: o único caso de "Enviar agora" sem envio (`devolver-tarefa-vencida.test.tsx`, "sem sinal, a tela diz que a coleta continua guardada") nunca passa `paradaPor` e só confere "continua guardada no aparelho". É a mesma classe do achado 2 da rodada 2, num caminho que a correção não alcançou (`apps/campo/src/app/(agente)/index.tsx`, `enviarAgora`, ramo `else` perto da linha 887, que não lê `paradaPor` do resultado nem a `pausadaPor` que a tela já guarda).
5. Conferi se os dublês de tela da fila batem com o contrato real: o resumo do dublê de `a-lista-com-a-fila-pausada` usa o mesmo nome de campo (`pausadaPor`) que `ResumoFila` (`packages/campo/src/tipos.ts:506`). A diferença é que a fila real avisa o ouvinte de forma assíncrona e o dublê chama na hora; a fiação assíncrona fica coberta pelo teste da faixa com a fila real.
6. Procurei outro criador de fila no aplicativo (`criarFilaDeSincronizacao` fora de `dados/fila.ts`): nenhum.

## Achados

### CORRIGE ANTES DE CRESCER

1. **A tarja de "Enviar agora" manda esperar sinal com a fila pausada, e nenhum teste pega.** Reprodução: sonda acima (`e06-05-...`), vermelha no SHA. O `ⓘ` ao lado (`FRASE_DO_IMPEDIMENTO.coleta_no_aparelho`, `packages/campo/src/devolucao.ts`) também diz "o que falta é sinal". A faixa do topo diz o certo ao mesmo tempo, por isso não reprova a etapa (o QA desta rodada classificou igual). Teste a escrever: o caso da sonda, nos três motivos de pausa. Dono: E06.
2. **F5 e F6 seguem sem teste** (herdado da rodada 2, `validacao/4b96ea7/testes.md`, achado 3): a sonda daquela rodada já tem os três casos prontos. F6 é o que deixa uma falha 422 tardia de um dreno cancelado marcar `bloqueado` um item que o servidor aceitou. Dono: E06.
3. **A9 e A12 seguem sem teste** (herdado, achado 4). A9: o piso de 60 s do laço com a fila pausada não é exercitado; o teste confere só o valor da constante. A12: nada fixa que o pedido comum de token não lança. Dono: E06.
4. **Nome de teste que promete mais do que o produto faz.** `obter-fila-uma-so.test.ts`, "se abrir o banco falhar, a falha não fica gravada: a chamada seguinte tenta de novo": o caso chama `esquecerConexao()` entre as duas chamadas, porque `bancoLocal()` memoiza a promessa rejeitada. No aparelho, depois de uma falha de abertura do banco, a chamada seguinte de `obterFila` recebe a mesma rejeição até o aplicativo ser reaberto. O comentário do teste diz isso; o nome não. Dono: E06 (renomear) ou quem tratar `banco-local.ts`.

### ANOTADO

- `faixa-ligada-a-fila-real.test.tsx` usa uma espera fixa de 20 ms dentro do `act` para a assinatura da faixa terminar antes de o caso mexer na fila. Os dois primeiros casos terminam em `waitFor`; o terceiro confere `toHaveBeenCalledTimes(1)` logo depois da espera. Numa máquina lenta o risco é vermelho falso, não verde falso.
- O jest do app termina com "A worker process has failed to exit gracefully" (algum teste deixa temporizador ou recurso aberto). Não identifiquei o arquivo.
- `obterFila` ignora `baseUrl`, `obterToken` e `lerIdentidade` depois da primeira criação (comportamento anterior à correção; nenhum teste o fixa).

## Não verificado

- E2 (emulador ou aparelho): fora desta dimensão e sem emulador Android nesta máquina; o QA desta rodada registra.
- Não rodei `npm run test:api` inteiro, só as duas suítes da etapa.
- Não investiguei qual teste deixa o worker do jest aberto.

## Risco residual

Médio-baixo. A fiação que reprovou a rodada 2 (fila única e faixa) agora tem guarda que morde. O que sobra sem guarda são caminhos laterais da mesma promessa ("Enviar agora", o `ⓘ`) e corridas raras do motor (F5, F6), sem perda de dado provada.

## Motivo do humano

Nenhum para esta dimensão.
