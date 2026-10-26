---
validador: testes (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Veredito: **PASS** na dimensão testes. Todos os critérios do bloco da E06 (testes positivos, negativos, de autorização e isolamento, e o risco de segurança "renovação forçada é uma, com piso") têm teste que MORDE: desfiz cada conserto no SHA e vi vermelho, restaurei e vi verde. O código da etapa (`packages/campo/src`, `apps/campo/src`) não mudou entre `52952a1` e `bb0f654`; mesmo assim tudo foi reexecutado. Ficam quatro achados "corrige antes de crescer", todos reproduzidos por mim nesta rodada e nenhum com perda ou duplicação de coleta: a tarja de "Enviar agora" manda esperar sinal com a fila pausada (sonda vermelha), as guardas de corrida F5 e F6 do motor sem teste, A9 e A12 do aplicativo sem teste, e testes antigos de `campo-integracao.test.ts` que dependem da ordem.

Saídas em `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/testes-E06-E14-E15-E16-E18/`. Toda mutação foi aplicada por `$V/mutar.py` (troca exata, roda, `git restore`, confere `git status` do arquivo vazio; a última linha de cada saída diz "restaurado: True").

| Critério | Teste que prende | Mutação | Resultado |
| --- | --- | --- | --- |
| 401 vira `FalhaDeSessao`, não permanente | `pausa-de-sessao.test.ts`, `pausa-por-senha-provisoria.test.ts`, `fila.test.ts` | T1: tira `if (status === 401) return falhaDeSessao(...)` de `transporte.ts` | morde: 15 de 223 reprovam (`e06-10`) |
| 403 `conta_desativada` deixa o item `pendente` | mesmos | T2: tira o ramo `parar_e_avisar` | morde: 6 reprovam (`e06-11`) |
| sem token vira `FalhaDeSessao`, não `FalhaPermanente` `sem_sessao` | `pausa-de-sessao.test.ts` | T3: sem token lança `FalhaPermanente("sem_sessao")` | morde: 3 reprovam (`e06-12`) |
| renovação forçada é uma; token igual não repete (sem laço) | `pausa-de-sessao.test.ts`, `pausa-por-senha-provisoria.test.ts` | T4: repete mesmo com o token igual | morde: 2 reprovam (`e06-13`) |
| 403 `sem_permissao` ainda bloqueia | matriz de `pausa-por-senha-provisoria.test.ts` | T5: todo 403 vira pausa `conta_desativada` | morde: 13 reprovam (`e06-14`) |
| 401 `sessao_encerrada` não gasta a renovação | idem | T6: renova também com `entrar_de_novo` | morde: 2 reprovam (`e06-15`) |
| 403 `acesso_suspenso` é temporária (correção 1) | idem | T7: tira o ramo `aguardar_o_contrato` | morde: 2 reprovam (`e06-16`) |
| dreno PARA na falha de sessão | `pausa-de-sessao.test.ts` | F1: `continue` no lugar de `break` | morde: 3 reprovam (`e06-20`) |
| tentativas inalteradas | idem | F2: devolve com `tentativas + 1` | morde: 16 reprovam (`e06-21`) |
| zero `bloqueado` por sessão | idem | F3: a falha de sessão cai em `tratarFalha` | morde: 23 reprovam (`e06-22`) |
| a pausa é do AUTOR do item (correção 1) | `pausa-por-senha-provisoria.test.ts` (corridas) | F4: pausa de quem está logado | morde: 2 reprovam (`e06-23`) |
| item de outro autor espera o autor (portão de autoria) | `fila.test.ts` | F9: tira o filtro de autoria de `prontos` | morde: 1 reprova (`e06-28`) |
| a pausa do B não aparece para o A | `pausa-de-sessao.test.ts` | F10: `pausadaPeloUsuarioAtual` ignora o usuário | morde: 2 reprovam (`e06-29`) |
| conferência de autor antes de cada chamada (foto em voo) | `pausa-por-senha-provisoria.test.ts` | F8: só confere a marca do dreno | morde: 1 reprova (`e06-27`) |
| `devolverAoEstadoAnterior` não reescreve `confirmado` | idem | F7: tira a releitura do estado | morde: 1 reprova (`e06-26`) |
| dreno cancelado não mexe no item de outro dreno em andamento | nenhum | F5: tira `if (minhaMarca !== marcaAtual && drenando) return false;` | **vivo**: 223 de 223 verdes (`e06-24`) |
| `tratarFalha` ignora item já `confirmado` | nenhum | F6: tira `if (atual.estado === "confirmado") return "adiado";` | **vivo**: 223 de 223 (`e06-25`) |
| `renovarJa` respeita o piso de 60 s | `token.test.ts` | K1: piso não vale para `renovarJa` | morde: 3 de 146 reprovam (`e06-33`) |
| `renovarJa` respeita a trava em voo | `token.test.ts` | K2: tira a trava | morde: 2 reprovam (`e06-34`) |
| pedido comum de token não lança `conta_desativada` | nenhum | A12: lança também sem `renovarJa` | **vivo**: lote 146 de 146 (`e06-36`) e jest inteiro 1927 de 1927 (`e06-37`) |
| laço de fundo espera 60 s com a fila pausada | só a constante (`pausa-da-fila.test.ts`) | A9: o laço usa 15 s sempre | **vivo**: jest inteiro 1927 de 1927 (`e06-35`) |
| `obterFila` devolve uma só instância (correção 2) | `obter-fila-uma-so`, `faixa-ligada-a-fila-real` | M1: cria fila nova a cada chamada | morde: 6 reprovam (`e06-30`) |
| falha de criação da fila não fica gravada | `obter-fila-uma-so` | M2: tira `fila = null` do `catch` | morde: 1 reprova (`e06-31`) |
| cartão da tarefa não manda esperar sinal com a fila pausada (correção 2) | `a-lista-com-a-fila-pausada-nao-pede-sinal` | M3: a tela ignora `pausadaPor` do resumo | morde: 4 reprovam (`e06-32`) |
| `campo-integracao`: conta desativada entre enfileirar e drenar, item no aparelho, sobe UMA vez depois da reativação | `apps/api/test/campo-integracao.test.ts` contra a API real | T2 no motor, com o pacote `@dc360/campo` reconstruído | morde: exatamente esse caso reprova (`e06-53`); fonte restaurada e pacote reconstruído |

## Evidência

- `cd dc360 && npm run build:shared`: código 0 (`$V/00-build-shared.txt`).
- Motor: `cd dc360/packages/campo && npx vitest run --sequence.shuffle`, 3 vezes: código 0, 223 de 223 em cada (`$V/e06-01-motor-shuffle-{1,2,3}.txt`).
- Aplicativo, jest inteiro: `cd dc360/apps/campo && npx jest --ci`: código 0, 134 suítes, 1927 de 1927 (`$V/00-jest-app-completo.txt`). `npm run test:campo` (tipos, jest e contagem): código 0, "A leitura do código e o jest concordam: 1927 casos" (`$V/00-test-campo.txt`).
- Lote da etapa no aplicativo (11 arquivos, lista em `$V/lote-e06.txt`): `npx jest --ci --randomize --seed=N` com N = 3, 7, 11: código 0, 146 de 146 em cada (`$V/e06-02-app-lote-semente-*.txt`).
- API: `cd dc360/apps/api && npx vitest run test/campo-integracao.test.ts test/evidencia-so-do-autor.test.ts`, ordem padrão, 3 vezes: código 0, 28 de 28 (`$V/e06-51-*`). O bloco da E06 em ordem aleatória (`-t "SESSÃO ou a CONTA" --sequence.shuffle`, sementes 11, 22, 33, 44, 55): 6 de 6 em todas (`$V/e06-52-*`). `npm run test:api` inteiro: 1326 aprovados, 20 pulados, 1 falha, a conhecida do LibreSSL em `openssl-do-teste.test.ts` (`$V/00-test-api-completo.txt`).
- Portão T42: `node scripts/portao-de-skip.mjs` código 0 (`$V/00-portao-de-skip.txt`); nenhum `.only`, `.skip`, `.todo`, `skipIf` nos testes do motor, do aplicativo e nas duas suítes da API.
- Mutações: `$V/e06-10` a `e06-37` e `e06-53` (script `$V/e06-mut-api.sh`).
- Sonda da tarja de "Enviar agora": `$V/e06-40-sonda-enviar-agora-com-fila-pausada.txt`, trecho em `$V/e06-40-sonda.trecho.tsx` (arquivo temporário apagado logo depois; `git status` limpo).

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e a coleta sobe sem pausar (motor e `campo-integracao`, "token vencido ... renova UMA vez").
- Depois da reativação e de nova entrada, a coleta pausada sobe e fica UMA vistoria no banco (`campo-integracao`, conta desativada e sessão encerrada).
- Senha redefinida: a sessão velha pausa, a senha provisória pausa por outro motivo, e depois da troca a coleta sobe uma vez.

## Cenários negativos

- 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria`, 401 sem código e sem token: item `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado (cada propriedade derrubada por uma mutação própria, F1, F2, F3).
- 403 `sem_permissao` e 403 sem código continuam bloqueando (T5).
- Agente A no aparelho do agente B desativado: os itens do B não sobem e a pausa do B não aparece para o A (F9, F10).

## Tentativas de reprovar

1. 25 mutações no motor e no aplicativo, uma de cada vez. 21 mordem; 4 sobrevivem (F5, F6, A9, A12), todas fora dos testes que o bloco da etapa nomeia.
2. Mutação no motor reconstruído contra a API real (`e06-53`): o caso de conta desativada entre enfileirar e drenar reprova; ou seja, o teste de integração prende o motor de verdade, não um dublê.
3. Ordem aleatória: motor 3 vezes, lote do aplicativo com 3 sementes, bloco da E06 da API com 5 sementes: verde. As duas suítes da API inteiras com `--sequence.shuffle`: 2 de 3 rodadas reprovaram (`$V/e06-50-api-integracao-{1,3}.txt`), sempre em testes ANTERIORES à E06 que dependem do caso anterior ("as fotos entram com a chave de storage prefixada pelo município" e "o coordenador consegue ver a foto que o agente enviou"); nenhum caso da E06 reprovou. Em ordem padrão, 3 de 3 verdes.
4. **Sonda "Enviar agora" com a fila pausada** (cópia temporária de `devolver-tarefa-vencida.test.tsx` com o dreno devolvendo `paradaPor` e o item `pendente`): 3 de 3 reprovam, nos três motivos, com a tarja "A coleta continua guardada no aparelho e sai quando o aplicativo estiver aberto e houver sinal." (`e06-40`). `enviarAgora` em `apps/campo/src/app/(agente)/index.tsx` (ramo `else` perto da linha 887) não lê `paradaPor` do resultado nem a `pausadaPor` que a tela já guarda. Nenhum teste do repositório cobre esse caminho.
5. Fidelidade dos dublês: os testes da faixa e da troca de conta usam a fila, o transporte, o depósito e o SQLite reais (só o `fetch` é falso); o dublê da fila nas telas usa o mesmo campo `pausadaPor` de `ResumoFila`.

## Achados

### CORRIGE ANTES DE CRESCER

1. **A tarja de "Enviar agora" manda esperar sinal com a fila pausada pela sessão, e nenhum teste pega.** Reprodução: `e06-40` (vermelha no SHA, nos três motivos). A faixa do topo diz o certo ao mesmo tempo, por isso não reprova a etapa; é o mesmo achado da rodada 3, ainda sem conserto e sem teste. Teste a escrever: o caso da sonda. Dono: E06.
2. **F5 e F6 sem teste** (motor): `devolverAoEstadoAnterior` com dreno cancelado e outro em andamento, e `tratarFalha` sobre item `confirmado`. Reprodução: `e06-24`, `e06-25`. O efeito sem as guardas é estado local errado (item aceito pelo servidor marcado `bloqueado`, ou devolvido a `pendente` com outro dreno em voo); a chave de idempotência impede duplicar no servidor, por isso não é perda nem duplicação. Dono: E06.
3. **A9 e A12 sem teste** (aplicativo): o laço de fundo pode voltar a 15 s com a fila pausada, e o pedido comum de token pode passar a lançar, sem nenhum vermelho. Reprodução: `e06-35`, `e06-37`. Dono: E06.
4. **Testes de `campo-integracao.test.ts` dependem da ordem** (dois casos anteriores à etapa, que leem o que o caso anterior gravou). Reprodução: `e06-50-api-integracao-1.txt` e `-3.txt`. Não é verde falso, é vermelho falso se a ordem mudar; o arquivo está na lista da E06. Dono: quem tocar o arquivo, ou F01-E03.

### ANOTADO

- O nome do caso "se abrir o banco falhar, a falha não fica gravada: a chamada seguinte tenta de novo" (`obter-fila-uma-so.test.ts`) promete mais do que o produto faz: o caso chama `esquecerConexao()` entre as chamadas (anotado na rodada 3, igual).

## Não verificado

- E2E em emulador ou aparelho (desativar o agente no painel com coleta na fila e ver a frase): não há emulador Android nesta máquina e não há build de desenvolvimento para o Simulador de iOS; fora desta dimensão, pendência humana E4 registrada no bloco.
- O CI do SHA (run 39143791434) não foi lido.
- Não escrevi os testes que faltam para F5, F6, A9 e A12; só provei que as mutações sobrevivem.
- Não investiguei se outros arquivos de teste do aplicativo dependem da ordem fora do lote da etapa (o jest inteiro rodou só na ordem padrão).

## Risco residual

Médio-baixo. O núcleo da etapa (classificação por código, parada do dreno, item preservado, autoria, renovação única com piso) está preso por testes que mordem, inclusive contra a API real. O que sobra sem guarda são caminhos laterais da mesma promessa (a tarja de "Enviar agora") e guardas de corrida raras do motor cujo pior efeito é estado local errado, sem perda nem duplicação provada.

## Motivo do humano

Nenhum para esta dimensão. A prova em aparelho e a aprovação das frases são pendências humanas de outras dimensões, já registradas no bloco da etapa.
