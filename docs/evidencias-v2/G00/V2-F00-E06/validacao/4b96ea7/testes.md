---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **FAIL**. O núcleo do motor é bem protegido (21 de 24 mutações mortas, e os dois defeitos da rodada 1 mordem). O que reprova é a camada que o QA do emulador provou quebrada: a faixa global do aplicativo e a criação da fila. Nenhum teste da suíte exercita essa fiação, a suíte fica verde com o defeito presente, e o cabeçalho do teste de tela afirma que ele "substitui a captura em aparelho". Além disso, um dos dois testes da fila real do aplicativo só passa na ordem em que foi escrito.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/testes/` (abreviada `testes/`). Índice de todas as mutações: `testes/00-INDICE-DE-MUTACOES.txt`.

| Critério | Resultado |
| --- | --- |
| 61 testes novos da correção 1 verdes e estáveis | PASS (motor 223 de 223 em ordem aleatória 3 vezes; app 73 de 73 em ordem declarada) |
| rodada 1, FAIL do 403 `troca_de_senha_obrigatoria`: o teste que o pegou morde | PASS (T1: 4 reprovam; T9: 4 reprovam) |
| rodada 1, pausa atribuída a quem está logado: o teste morde | PASS (F3: 2 reprovam; F10: 2 reprovam) |
| 401 tardio não regride item confirmado (corrida de dois drenos) | PASS só para a pausa de sessão (F4 morde); **lacuna** para falha comum (F6) e para item em voo (F5) |
| dublês reproduzem o contrato da dependência | PASS no motor (`fetch` falso devolve `ok`, `status`, `json`); **FAIL** na fila do app (singleton de teste que a produção não tem) |
| a faixa global mostra a pausa da sessão (DoD: "a pessoa vê o que fazer") | **FAIL**: nenhum teste cobre (achado 1) |
| testes independentes entre si | **FAIL** em `troca-de-conta-com-pedido-em-voo.test.ts` (achado 2) |
| nenhum teste afrouxado, pulado ou reescrito sem registro | PASS (os dois reescritos de `fila.test.ts` estão em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`; zero `skip`/`todo`/`only` no diff; `portao-de-skip.mjs` código 0) |

## Evidência

Comandos, todos em `dc360/` com `npm run build:shared` antes (código 0, `testes/00-build-shared.txt`):

- Motor: `npx vitest run` em `packages/campo`, ordem aleatória 3 vezes (`--sequence.shuffle`): 10 arquivos, 223 de 223 em cada (`testes/50-motor-pacote-aleatorio-3x.txt`).
- App: lote de 6 arquivos da etapa, 73 de 73 (`testes/01-jest-base-app.txt`); lote de 21 arquivos das etapas E06, E14, E15 e E16 com `jest --randomize`, 3 vezes (`testes/110-app-lote-randomizado-3x.txt`): **1 arquivo reprova em todas as três** (achado 2).
- Mutações no motor (`packages/campo/src/transporte.ts` e `fila.ts`, rodadas contra `pausa-de-sessao`, `pausa-por-senha-provisoria` e `fila`, 122 testes; `git restore` depois de cada; árvore conferida limpa): 24 mutações, resumo em `testes/21-motor-mutacoes-resumo.txt` e uma saída por mutação em `testes/m-T*.txt` e `testes/m-F*.txt`.
  - Mortas (21): T1 `trocar_a_senha` sem pausa (4); T2 `parar_e_avisar` sem pausa (6); T3 `acesso_suspenso` vira permanente (2); T4 sem token vira permanente (3); T5 repete com o mesmo token (2); T6 renova com `sessao_encerrada` (2); T7 401 vira `conta_desativada` (13); T8 `coletadaPor` fora do fio (1); T9 `sem_permissao` vira pausa (4); F1 conferência sem a marca do dreno (1); F2 conferência sem a autoria (1); F3 pausa do logado e não do autor (2); F4 devolver sem reler o estado (1); F7 pausa não limpa após sucesso (3); F8 pausa gasta tentativa (16); F9 sessão cai em `tratarFalha` (23); F10 pausa visível a qualquer um (2); F11 `paradaPor` omitido (20); F12 dreno não para (18); F13 pausa velha prevalece (1); F14 `PedidoCancelado` bloqueia (2).
  - **Sobreviventes (3):** F5 (`if (minhaMarca !== marcaAtual && drenando) return false;` removido), F6 (`if (atual.estado === "confirmado") return "adiado";` removido) e F15 (item sem autor usa o dono da sessão na foto).
- Sondas que provam que F5 e F6 são lacunas de verdade e não equivalentes: três testes escritos por mim (`testes/zz-sonda-e06.test.ts`, cópia fora do repositório; a cópia temporária em `packages/campo/test/` foi apagada). Verdes no código atual (`testes/22-sonda-lacunas-base.txt`), vermelhos contra F5 (1 de 3, `testes/23-sonda-contra-F5.txt`) e contra F6 (2 de 3, `testes/24-sonda-contra-F6.txt`). F15 é código inalcançável: `prontos` só entrega item cujo `autor` é o da sessão (`autoriaDaColeta`), então o ramo "sem autor" nunca é drenado; mutante equivalente, não conta.
- Mutações no app e no token (arquivos de `apps/campo/src`; lote de 8 arquivos, 166 testes): A1 a A16 em `testes/m-A*.txt`, K1 a K4 em `testes/m-K*.txt`.
  - Mortas (15 de 20): A1 cartão "Guardada" some (3); A2 e A3 botão "Entrar de novo" onde não deve (1 cada); A4 botão não leva a `/entrar` (1); A5 botão não derruba a sessão (1); A6 faixa ignora a pausa em `decidirFaixa` (4); A11 `renovarJa` ignorado (8); A13 e A14 frase de conta desativada e senha provisória não lidas pelo código (1 cada); A15 frase manda entrar de novo (2); A16 frase da API (3); K1 piso de 60 s removido (4); K2 trava removida (3); K3 recusa não reavaliada (1); K4 recusa vale para outras credenciais (1).
  - **Sobreviventes (5):** A7, A8, A9, A10 e A12 (achados 1 e 3).

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e envia; depois de entrar de novo os itens pausados sobem sem duplicar, na ordem e com a mesma chave (`pausa-por-senha-provisoria`, caso do roteiro 401, 403, sobe tudo).
- Matriz de 13 respostas contra as quatro rotas da fila e contra o estado final do item: mordeu em T1, T2, T3, T7, T9.
- Cartão "Guardada", zero "Descartar", botão "Entrar de novo" só na sessão encerrada: mordeu em A1 a A5.

## Cenários negativos

- 403 `sem_permissao` e 403 sem código continuam bloqueando só o item (matriz; T9 morde).
- Sem token vira `FalhaDeSessao` e a rede nem é tocada (T4 morde).
- Renovação não vira laço: token igual ao recusado não repete (T5 morde) e o piso de 60 s vale (K1 morde).
- Troca de conta com pedido em voo: nenhum pedido seguinte sai com a conta nova (F1 e F2 mordem).

## Tentativas de reprovar

1. **A faixa global com mais de uma instância da fila (pedido do gatekeeper).** `obterFila` (`apps/campo/src/dados/fila.ts`) confere `if (fila) return fila;` e só depois espera `await bancoLocal()`. Sonda minha, fora do repositório, com `expo-sqlite` sobre o `node:sqlite` e `expo-file-system` vazio (`testes/sonda2/obterFila-concorrente.test.ts`, configuração `testes/jest.sonda2.config.js`): quatro chamadas simultâneas devolvem quatro filas diferentes. **Vermelho no código atual** (`testes/30-sonda-obterFila-concorrente-ESTADO-ATUAL.txt`). Com a promessa memoizada (o remendo que o QA usou, aplicado por mim em `fila.ts` e desfeito com `git restore`, conferido por `diff` contra a cópia em `testes/fila.ts.orig`) a mesma sonda fica verde (`testes/31-...-VERDE.txt`) e as três suítes de fila do app continuam 40 de 40 (`testes/32-...txt`): ou seja, **a suíte do repositório não distingue uma fila de quatro**. Nenhum teste de `apps/campo` chama `obterFila` de verdade duas vezes ao mesmo tempo; os que a trocam usam `jest.mock("../dados/fila", () => ({ obterFila: async () => mockFila }))`, um singleton que a produção não tem. É o mock de um colaborador interno que esconde exatamente o defeito.
2. **A faixa ligada à fila.** `FaixaDeSincronizacaoLigada` (a que o layout monta) não é renderizada por nenhum teste. A7 (`pausadaPor` deixa de ser repassado a `decidirFaixa`) e A8 (`contagemDaFila` zera `pausadaPor`) sobrevivem com 166 de 166 verdes (`testes/m-A7-...txt`, `m-A8-...txt`). Teste de 10 linhas que eu escrevi (`testes/zz-sonda-faixa-ligada.test.tsx`, cópia fora do repositório; a temporária em `src/ui/` foi apagada) passa no código atual (`testes/41-...txt`) e reprova contra A7 (`testes/42-...txt`): o teste é fácil, falta no repositório. O arquivo `faixa-de-sincronizacao.test.tsx` só testa a função pura `decidirFaixa` e o componente de desenho com o estado já pronto.
3. **O laço de fundo.** A9 (`pausadaPelaSessao ? ESPERA_COM_A_FILA_PAUSADA_MS : 15_000` vira `15_000`) e A10 (`pausadaPelaSessao = false`) sobrevivem: o único teste do intervalo confere que a constante é maior que 15 000, não que o laço a usa. É a metade da regra "a fila parada não insiste a cada 15 s contra um servidor que disse não".
4. **Contrato do token.** A12 (o pedido comum de token também lança `conta_desativada`) sobrevive. O comentário de `token.ts` diz que o pedido comum "continua devolvendo o token atual, sem lançar, para quem não sabe o que fazer com uma exceção (telas, push)", e nenhum teste fixa isso.
5. **Ordem dos testes.** Rodei o arquivo `troca-de-conta-com-pedido-em-voo.test.ts` sozinho no segundo caso (`-t "403 troca_de_senha"`): reprova (`paradaPor` indefinido, `testes/13-troca-de-conta-segundo-caso-isolado.txt`). Com `--randomize`, as sementes 2, 4 e 6 reprovam os dois casos e as 1, 3 e 5 passam (`testes/112-troca-de-conta-por-seed.txt`, saída da semente 2 em `testes/113-...VERMELHO.txt`). Causa: `obterFila` é um singleton do módulo e o banco SQLite em memória é um só por arquivo; o segundo caso só encontra o item que o primeiro enfileirou.
6. **Lógica no teste.** `pausa-por-senha-provisoria.test.ts` gera testes com `for` sobre a matriz e decide a asserção com `if (esperado.classe === ...)` dentro do corpo. A tabela é legível e o resultado é determinístico, então anoto sem reprovar, mas é o padrão que a regra 5 da casa desaconselha.
7. **Teste que passa por acaso.** Não achei: cada asserção central tem pelo menos uma mutação que a derruba (F8, F11, F12 reprovam 16 a 23 casos).
8. **Espera fixa e relógio.** Os testes do motor injetam `agora` e `dormir`; os dois `setTimeout(r, 0)` só cedem o laço de eventos. No app, o único `setTimeout` é o do caso 1 de `troca-de-conta` e também cede o laço.

## Achados

### BLOQUEIA

1. **A suíte não protege a fiação da faixa global nem a criação da fila.** Fatos: `obterFila` cria várias filas sob chamadas simultâneas (sonda vermelha), `FaixaDeSincronizacaoLigada` nunca é renderizada em teste (A7 e A8 vivem), e o teste de tela da pausa usa um dublê de instância única e injeta `{ pausadaPor }` à mão pelo canal do dublê. O defeito que o QA viu no emulador (faixa verde com a coleta parada) passa por 1903 de 1903 testes. A DoD pede "a pessoa vê o que fazer" e o cabeçalho de `fila-pausada-pela-sessao.test.tsx` diz que o arquivo "substitui, neste ambiente, a captura em aparelho"; ele prova a tela da fila, não a faixa. Teste a escrever (pelo dono): `obterFila` chamado quatro vezes com `Promise.all` devolve a mesma instância, e `FaixaDeSincronizacaoLigada` com um resumo real `{ pausadaPor }` mostra "Sessão encerrada". Dono: E06. Item 5 da seção 7 de `28` (perda ou duplicação de dado do campo): não admite risco aceito.

### CORRIGE ANTES DE CRESCER

2. `troca-de-conta-com-pedido-em-voo.test.ts` depende da ordem: o segundo caso reprova sozinho e os dois reprovam em metade das ordens (achado em `jest --randomize`). Falta isolar o estado (reiniciar o módulo `fila` e o banco entre os casos, por exemplo com `jest.isolateModulesAsync`, ou enfileirar o item dentro do próprio caso). O CI só roda a ordem declarada, por isso nunca viu.
3. Lacunas de mutação no motor com comportamento afirmado pelo implementador no RESUMO: F5 (dreno cancelado não toca no item que outro dreno tem em voo) e F6 (`tratarFalha` ignora item já confirmado, para falha temporária e permanente tardias). A sonda `testes/zz-sonda-e06.test.ts` já traz os três casos prontos para virar teste. Risco real de F6: uma falha 422 tardia do dreno cancelado reescreve como `bloqueado` um item que o servidor aceitou, e o cartão passa a oferecer "Descartar" sobre coleta já enviada.
4. A9 e A10 (intervalo do laço com a fila pausada) e A12 (o pedido comum de token não lança) sem teste.
5. O dublê de `expo-sqlite` por `node:sqlite` devolve `undefined` em `runAsync` (a biblioteca real devolve `{ changes, lastInsertRowId }`); nada depende disso hoje. Anotado.

### ANOTADO

- A matriz de classificação usa `for` e `if` dentro do teste (ponto 6 acima).
- Os testes de tela da fila mockam `../dados/fila` (módulo do próprio aplicativo). Aceitável para a tela, insuficiente como prova da faixa.

## Não verificado

- Emulador e aparelho: fora da minha dimensão; o QA da rodada 2 cobriu o emulador (`qa.md`) e a falta de aparelho físico fica para as pendências humanas.
- Os testes de API da etapa (`evidencia-so-do-autor.test.ts`, `campo-integracao.test.ts`): são do escopo de quem valida `apps/api` e rodam em paralelo; não os li nem os mutei. Citados no RESUMO como 11 e 2 casos novos.
- `npm run test:campo` completo (129 suítes) não foi repetido por mim; o lote randomizado cobre 21 arquivos.
- Mutação de `ordem-do-dia.ts:379` (o cartão da tarefa que diz "falta sinal" com a fila pausada, achado 2 do QA): sem teste que a pegue, não mutei.

## Risco residual

Alto enquanto o achado 1 estiver aberto: o próximo conserto de `obterFila` ou da faixa pode regredir sem nenhum teste ficar vermelho, e é justamente a superfície que o agente lê no morro para saber se a coleta subiu. O motor em si está bem guardado.

## Motivo do humano

Nenhum: tudo o que este relatório afirma foi executado.
