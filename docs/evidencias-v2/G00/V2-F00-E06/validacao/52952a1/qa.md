---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** no nível E1, com a prova E2 em "Não verificado" (regra desta rodada: sem emulador Android; o Simulador de iOS foi tentado e não pôde ser dirigido, ver abaixo). Os dois defeitos da rodada 2 (faixa global "Tudo sincronizado" sobre fila pausada; cartão da tarefa mandando esperar sinal) estão consertados e os testes novos mordem. Nenhum item se perde, duplica ou bloqueia pelos quatro códigos.

Base: `$SP/val/qa/` (saídas e scripts).

| Critério (bloco da E06 e rodadas 1 e 2) | Resultado | Prova |
| --- | --- | --- |
| 401 `nao_autenticado` renova UMA vez e repete com o token novo, mesma chave de idempotência | PASS | sonda P1 (`20-sonda-e06.txt`): pedidos `Bearer velho`, `Bearer novo`, uma só renovação, item `confirmado` |
| renovação recusada (token igual) ou segundo 401: pausa sem laço | PASS | sonda: token igual, 1 pedido; token novo também recusado, exatamente 2 pedidos e 1 renovação |
| 401 `sessao_encerrada`: todos `pendente`, 0 `bloqueado`, tentativas 0, dreno para no primeiro, sem gastar renovação | PASS | sonda N (3 itens, 1 pedido, `renovarJa` 0 vezes; dois drenos extras não mudam nada) |
| 403 `conta_desativada` e 403 `troca_de_senha_obrigatoria`: mesmo resultado, `paradaPor` e `pausadaPor` com o motivo | PASS | sonda N (os dois) |
| sem token vira `FalhaDeSessao`, nenhum pedido sai | PASS | sonda N "sem token" |
| 403 `sem_permissao` continua bloqueando só o item (controle) | PASS | sonda: item 1 `bloqueado`, itens 2 e 3 enviados |
| pausa no meio das fotos: foto já enviada fica, retomada sobe a vistoria uma vez | PASS | sonda: `confirmar-envio` 403 na foto 2; item `pendente`, tentativas 0, foto 1 enviada; retomada: 1 vistoria aceita (a foto 2 é reautorizada e reenviada pela mesma chave, idempotente) |
| depois da pausa, nova entrada: os itens sobem uma vez cada, mesmo com dois drenos simultâneos | PASS | sonda P2: cada chave aceita 1 vez, `pausadaPor` volta a nulo |
| autoria: agente B no aparelho de A pausado não sobe nada de A e não vê a pausa de A | PASS | sonda A: 0 pedidos com a sessão de B, `pausadaPor` nulo, `deOutroAutor` 3; A volta e sobe 1 vez cada |
| rodada 2, achado 1 (BLOQUEIA): `obterFila` cria várias instâncias e a faixa nunca mostra a pausa | CONSERTADO, teste morde | `obterFila` guarda a promessa (`dados/fila.ts:64`); mutação para a versão antiga: 6 de 7 casos reprovam, a faixa mostra "Tudo sincronizado. Nada pendente no aparelho." onde devia estar "Sessão encerrada" (`22-mut-obterFila-VERMELHO.txt`) |
| rodada 2, achado 2 (corrige antes de crescer): cartão da sugerida "O que falta é sinal" com a fila pausada | CONSERTADO, teste morde | `index.tsx` passando `pausadaPor: null`: 4 de 5 reprovam, só o controle passa (`23-mut-index-pausadaPor-VERMELHO.txt`) |
| rodada 2 (testes): `troca-de-conta-com-pedido-em-voo` dependia da ordem | CONSERTADO | `--randomize`, sementes 1 a 8, junto com `obter-fila-uma-so` e `faixa-ligada-a-fila-real`: 9 de 9 em todas (`24-sementes.txt`) |
| rodada 2, achado 4: 403 com código de SESSÃO cai em permanente | AINDA MORDE (anotado) | sonda Q: 403 `sessao_encerrada` deixa os 3 itens `bloqueado`; a API não emite esse par hoje |
| a faixa usada no app é a testada | PASS | `_layout.tsx:326` monta `FaixaDeSincronizacaoLigada`, que assina por `useResumoDaFila` e `obterFila`; `criarFilaDeSincronizacao` só é chamada em `dados/fila.ts:110` |

## Evidência

- `npm run build:shared`: código 0 (`00-build-shared.txt`).
- `npm run test --workspace @dc360/campo`: 10 arquivos, 223 de 223, código 0 (`10-pacote-campo.txt`).
- `npm run test:campo`: tipos limpos, 134 suítes, 1927 de 1927, "A leitura do código e o jest concordam: 1927 casos", código 0 (`11-test-campo.txt`).
- `npx jest` em `apps/campo`: 134 suítes, 1927 de 1927, código 0 (`13-npx-jest-app.txt`).
- `node --test scripts/portao-*.test.mjs` (6 portões): 79 de 79, código 0 (`12-portoes.txt`).
- Suítes da E06 no app (9 arquivos, inclusive `obter-fila-uma-so`, `faixa-ligada-a-fila-real`, `a-lista-com-a-fila-pausada-nao-pede-sinal`, `troca-de-conta-com-pedido-em-voo`): 124 de 124 (`21-jest-e06.txt`).
- Sonda própria `sonda-e06.mjs` (fora do repositório, motor real pelo `dist` de `@dc360/campo`, `transporteHttp` real, `fetch` falso com servidor simulado que conta aceitações por chave): 13 casos, 0 falha, código 0 (`20-sonda-e06.txt`).
- API: `campo-integracao.test.ts`, `evidencia-so-do-autor.test.ts` e `precisao-do-gps-na-sincronizacao.test.ts`: 31 de 31 (`61-api-e06-e15.txt`); `npm run test:api` inteiro: 1309 aprovados, 9 pulados, 1 falha, a conhecida do LibreSSL (`openssl-do-teste.test.ts`, divergência desta máquina) (`63-test-api.txt`).
- `npm run conferir:numeros`: 25 conferidas, 0 divergência (`60-conferir-numeros.txt`).
- Mutações (cada uma desfeita com `git restore`; `git status --porcelain` depois só mostrava as pastas `validacao/52952a1/` não rastreadas; SHA-1 de `dados/fila.ts` igual antes e depois, `e43d3eb1`): `22-mut-obterFila-VERMELHO.txt`, `23-mut-index-pausadaPor-VERMELHO.txt`.
- Simulador de iOS (tentativa de E2): `E2-xcodebuild*.txt`, `E2-pod-install.txt`, `E2-03-entrada-local.png` (ver "Não verificado").

## Cenários positivos

- 401 `nao_autenticado` com renovação possível: sobe na hora, uma vez, com o token novo e a mesma chave.
- Pausa seguida de nova entrada: os três itens sobem uma vez cada, inclusive com dois drenos ao mesmo tempo, e a pausa some.
- Faixa global com a fila real: "Sessão encerrada" e "Defina a sua senha" aparecem (testes de componente com `obterFila`, transporte e depósito reais).

## Cenários negativos

- Os quatro códigos (401 `nao_autenticado` sem renovação útil, 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria`) e mais 401 sem corpo e falta de token: zero `bloqueado`, tentativas inalteradas, dreno parado no primeiro item, sem laço.
- 403 `sem_permissao`: bloqueia só o item (permanente por desenho).
- Autorização: os itens de A não saem com a credencial de B.

## Tentativas de reprovar

- Desfiz o conserto de `obterFila` (corrida da versão anterior): a faixa volta a mentir e 6 de 7 casos reprovam. Desfiz a passagem da pausa para a ordem do dia: 4 de 5 reprovam.
- Rodei os três arquivos sensíveis à ordem com 8 sementes aleatórias: verdes.
- Procurei outra instância de fila no app (`criarFilaDeSincronizacao`, `transporteHttp`): só uma fábrica, todas as telas passam por `obterFila`.
- Procurei duplicação na retomada com fotos: a vistoria é aceita uma vez; a foto cuja confirmação falhou é reautorizada e reenviada com a mesma chave (custo de rede, não duplicação).
- Procurei outra frase que mande esperar sinal com a fila pausada e achei uma (achado 1).
- Tentei a prova E2 no Simulador de iOS (ver "Não verificado").

## Achados

### BLOQUEIA

Nenhum.

### CORRIGE ANTES DE CRESCER

1. **"Enviar agora" no cartão da tarefa vencida, com a fila pausada pela sessão, responde "sai quando o aplicativo estiver aberto e houver sinal".** `apps/campo/src/app/(agente)/index.tsx`, `enviarAgora` (linhas 827 em diante): depois de `drenar()`, item `pendente` cai sempre no ramo "Ainda não deu para enviar ... sai quando o aplicativo estiver aberto e houver sinal", sem olhar `paradaPor` do resultado nem a `pausadaPor` que a tela já guarda. Com a fila pausada o item continua `pendente` (provado na sonda), então a tarja mente sobre o que falta; o `ⓘ` ao lado (`FRASE_DO_IMPEDIMENTO.coleta_no_aparelho`, `packages/campo/src/devolucao.ts:75`) também diz "o que falta é sinal". É a mesma classe do achado 2 da rodada 2, num ponto que a correção não alcançou. A faixa do topo diz o certo ao mesmo tempo, por isso não bloqueia. Reprodução (leitura do código mais E1 da sonda): tarefa vencida com coleta guardada, fila pausada por 401 `sessao_encerrada`, tocar em "Enviar agora". Dono: E06.

### ANOTADO

2. 403 com código de sessão (`sessao_encerrada`, `nao_autenticado`) ainda é `FalhaPermanente` (achado 4 da rodada 2, defesa em profundidade; a API não emite esse par).
3. Retomada depois de pausa no meio das fotos reenvia os bytes da foto cuja confirmação falhou (idempotente pela chave; só dados móveis).

## Não verificado

- **E2 do bloco** (desativar o agente no painel durante uma coleta na fila, ver a frase no aparelho, reativar e ver a mesma coleta subir uma vez): não há emulador Android nesta máquina. No Simulador de iOS: o `ios/` local (ignorado pelo git) tinha Pods de 15/09 e o primeiro build falhou em `expo-sqlite`; `pod install` atualizou os Pods (só `ios/`, ignorado) e o build Debug passou (`E2-xcodebuild4.txt`, BUILD SUCCEEDED). O app abriu no iPhone 17 Pro (iOS 26.5) apontando para uma API local com PGlite (`E2-03-entrada-local.png`; o `.env` local aponta para produção, por isso a configuração embutida da cópia do `.app` no scratchpad foi trocada para a API local e nenhuma entrada foi feita contra produção; nas duas primeiras aberturas o app ficou na tela de entrada com o endereço de produção, sem login). Não consegui dirigir a interface: não há `idb` nem permissão de acessibilidade para o `osascript`, e o inspetor do Hermes via Metro não respondeu. Parei no limite de tempo combinado. O que a E2 provaria está coberto em E1 pela faixa ligada à fila real e pela sonda; o aparelho continua pendente.
- iPhone físico, Android físico, rede real de campo (janela de milissegundos da troca de conta).

## Risco residual

Baixo para perda de dado (nenhum caminho dos quatro códigos bloqueia ou descarta; retomada sem duplicar). Médio para a frase: o achado 1 ainda pode mandar o agente esperar sinal quando o que falta é entrar de novo, e a faixa global nunca foi vista num aparelho depois do conserto.

## Motivo do humano

A prova em aparelho (E2 do bloco e validação humana da etapa): Rafael, ou um validador com emulador Android, desativa o agente no painel com coleta na fila, vê "Conta desativada" na faixa e no cartão, reativa, entra de novo e vê a mesma coleta subir uma vez. As frases estão aprovadas por instrução (D7).
