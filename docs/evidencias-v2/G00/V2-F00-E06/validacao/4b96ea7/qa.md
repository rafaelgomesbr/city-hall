---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **FAIL**. O defeito da rodada 1 (403 `troca_de_senha_obrigatoria` bloqueando a fila e oferecendo "Descartar") está consertado e provado por teste, por mutação, contra a API real e no emulador. O que reprova a etapa é um defeito novo, achado no emulador: a faixa global de sincronização nunca mostra a pausa da sessão. A DoD pede "a pessoa vê o que fazer" e a E2 do bloco pede "no emulador, a tela mostra a frase".

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-campo/` (abreviada abaixo como `qa-campo/`).

| Critério (bloco da E06 e rodada 1) | Resultado |
| --- | --- |
| 401 `nao_autenticado` renova uma vez e repete, sem laço | PASS (E1, sondas Q2a, Q2b, Q2c e mutações 6 e 8) |
| 401 `sessao_encerrada` e 403 `conta_desativada` param a fila, item `pendente`, zero `bloqueado`, tentativas inalteradas | PASS (E1, Q4; E2, pausa vista no emulador) |
| 403 `troca_de_senha_obrigatoria` pausa sem perder item e sem oferecer "Descartar" (FAIL da rodada 1) | PASS (E1, E2 com a API real e o emulador) |
| 403 `sem_permissao` continua bloqueando só o item | PASS (E1, Q3: item 1 bloqueado, itens 2 e 3 confirmados) |
| sem token vira `FalhaDeSessao` | PASS (E1, Q9 e mutação 7) |
| troca de conta com pedido em voo não grava autor errado | PASS no motor e na API (E1, mutações 3, 5, A, B e C) |
| agente A no aparelho do B: nada do B sobe com a sessão do A | PASS (E1, Q8) |
| a pessoa vê o que fazer (faixa e cartão do app, E2 do bloco) | **FAIL** (achado 1) |

## Evidência

Comandos e saídas (todas em `qa-campo/`):

- `npm run build:shared`: código 0 (`00-build-shared.txt`).
- `npm run test --workspace @dc360/campo`: 10 arquivos, 223 de 223 (`10-pacote-campo.txt`).
- Jest do app (`falha-de-atualizacao`, `pausa-da-fila`, `troca-de-conta-com-pedido-em-voo`, `faixa-de-sincronizacao`, `fila-pausada-pela-sessao`): 5 suítes, 79 de 79 (`30-jest-e06.txt`).
- API (`campo-integracao.test.ts` e `evidencia-so-do-autor.test.ts`): 28 de 28 (`31-api-e06.txt`).
- `npm run test:campo`: 129 suítes, 1903 de 1903, tipos limpos (`90-test-campo.txt`).
- Sonda própria `zz-qa-sonda.test.ts` (cópia em `qa-campo/zz-qa-sonda.test.ts.bak`, removida do repositório): transporte e fila reais, 13 cenários (`11-sonda-e06.txt`).
- Mutações (cada uma desfeita com `git restore`, árvore conferida limpa depois):
  - `trocar_a_senha` deixa de pausar: 4 testes reprovam (`20-mut1.txt`);
  - `devolverAoEstadoAnterior` sem reler o estado: 1 reprova, o do 401 tardio com dois drenos (`21-mut2.txt`);
  - conferência de autor antes de cada chamada desligada: 2 reprovam (`22-mut3.txt`);
  - `FalhaDeSessao` tratada como falha comum: 23 reprovam (`23-mut4.txt`);
  - pausa atribuída a quem está logado: 2 reprovam (`24-mut5.txt`);
  - renovação sem a checagem de token igual: 2 reprovam (`25-mut6.txt`);
  - sem token volta a ser permanente: 3 reprovam (`26-mut7.txt`);
  - 401 `sessao_encerrada` volta a renovar: 2 reprovam (`27-mut8.txt`);
  - API, autoria da confirmação desligada: 3 reprovam (`40-mutA-api.txt`); da autorização: 3 (`41-mutB-api.txt`); da reautorização de chave alheia: 2 (`42-mutC-api.txt`).
  Em todas, `git restore` e nova execução voltaram ao verde.
- Emulador: AVD `Medium_Phone_API_36.1`, APK debug construído do SHA (Gradle, JDK do Android Studio, 8 min 21 s, `02-gradle-build.txt`), API local na porta 3691, Metro. Capturas em `qa-campo/capturas/`:
  - `E06-fila-pausada-sessao-encerrada.png`: depois de a coordenação redefinir a senha (a API devolveu `sessoesEncerradas: 1`), a fila mostra "Sua sessão terminou e o envio está parado", cartão "Guardada", botão "Entrar de novo" e nenhum "Descartar". A faixa do topo, porém, está verde: "Tudo sincronizado, Nada pendente no aparelho";
  - `E06-faixa-e-fila-pausadas.png`: o mesmo estado depois de reabrir o aplicativo; a faixa diz "Com sinal, 1 esperando envio" (promete envio) e a fila mostra a pausa;
  - `E06-faixa-sessao-encerrada-automatica-com-fila-unica.png`, `E06-faixa-senha-provisoria.png` e `E06-fila-senha-provisoria.png`: tiradas COM o remendo de QA descrito no achado 1 (ver `70-patch-qa-apenas-para-o-emulador.diff`, nunca commitado). Mostram a faixa "Sessão encerrada", depois da entrada com a senha provisória a faixa "Defina a sua senha, suas coletas continuam guardadas" e a fila com "Você entrou com uma senha provisória e o envio está parado", cartão "Guardada" e zero ocorrências da palavra "Descartar" na árvore de acessibilidade.

## Cenários positivos

- Q1: três itens, o da foto com progresso parcial; a senha provisória pausa, as tentativas ficam em 0, a retomada autoriza cada foto uma vez e o servidor simulado vê cada chave de vistoria uma vez.
- Q4: conta desativada no item 2: item 1 `confirmado`, itens 2 e 3 `pendente` com tentativas inalteradas, dreno parado.
- Fluxo real no emulador: coleta guardada sem sinal, redefinição de senha pela API, sessão cai (401, pausa), entrada com a senha provisória (403, pausa por outro motivo, frase nova), item continua `pendente`.

## Cenários negativos

- Matriz Q5 (`11-sonda-e06.txt`): 401 de qualquer código pausa; 403 `nao_autenticado`, 403 `sessao_encerrada`, 403 `posto_insuficiente`, 403 `assinatura`, 403 com `__proto__`, `constructor`, `toString` ou número, 407, 410, 423 viram `bloqueado`; 511 e 5xx são temporários. Códigos de protótipo não enganam o catálogo (`hasOwnProperty`).
- Q2c: renovação devolvendo token novo e a segunda chamada também 401: exatamente 2 chamadas e pausa, sem laço.
- Q7: `obterToken` lançando erro genérico (cofre quebrado): os dois itens ficam `pendente` com 1 tentativa e o dreno continua para o segundo item (não para).

## Tentativas de reprovar

- Procurei outro código 401 ou 403 que caísse no ramo errado: todos os códigos que a API emite numa escrita da fila estão no catálogo e vão para o ramo certo. Os que caem em "permanente" são os que a API não emite nas quatro rotas (403 com código de sessão, 403 sem código, 407 de intermediário), ver achado 3.
- Corrida da troca de conta: reproduzi com a fila real (mutações 3 e 5) e com a API real; a recusa de autor divergente (409) e a conferência antes de cada chamada seguram. A janela entre a conferência e a leitura do token é de milissegundos e fechada no servidor.
- Reenvio e duplicação: a chave de idempotência é a do item em todas as retomadas (Q1).
- Faixa e cartão no aplicativo real: achei o achado 1.
- Tentei provar a troca da senha pelo painel e a subida da coleta no emulador: não executei (ver "Não verificado").

## Achados

### BLOQUEIA

1. **A faixa global do aplicativo não mostra a pausa da sessão; mostra "Tudo sincronizado" ou "Com sinal, 1 esperando envio" sobre uma coleta parada.** Causa provável, confirmada por remendo: `apps/campo/src/dados/fila.ts`, função `obterFila`, confere `if (fila) return fila;` e só depois espera `await bancoLocal()`. Quem a chama ao mesmo tempo na abertura (a faixa, a barra de abas, o laço de fundo do layout, a tela da fila) passa pela conferência com `fila` ainda nula, cria uma fila própria e a recebe de volta. Cada instância tem a sua `pausa`, a sua marca de cancelamento e o seu `drenando`. A pausa do laço de fundo vive numa instância que ninguém mais escuta; só aparece na tela da fila depois de a pessoa tocar em "Tentar enviar agora", porque aí a pausa nasce na instância daquela tela. O defeito é anterior à E06 (`obterFila` é igual em `afde25c`), mas anula a entrega dela: o agente vê a faixa verde e acredita que a coleta subiu, que é o risco que a etapa existe para eliminar. Efeito colateral do mesmo mecanismo: `cancelar()` do layout (troca de conta, E06 e E15) só alcança a instância dele.
   - Reprodução: emulador Android (API 36.1), `DC360_API_URL` apontando para a API local; entrar como o agente da semente de Serra Alta; desligar Wi-Fi e dados; concluir uma vistoria (foto, assinatura, checklist; ver achado de foto na E16 para o que foi preciso fazer); com a coordenação, `POST /usuarios/:id/redefinir-senha` do agente; religar a rede. Esperado: faixa "Sessão encerrada". Obtido: faixa verde "Tudo sincronizado, Nada pendente no aparelho" com "1 coleta na fila" na aba Envio (`E06-fila-pausada-sessao-encerrada.png`); depois de fechar e abrir o aplicativo, faixa "Com sinal, 1 esperando envio" por mais de 75 s e a pausa ausente (`E06-faixa-apos-drenagem.png`).
   - Prova do mecanismo: com o remendo `let emCriacaoQA: Promise<...> | null; export function obterFila(...) { return (emCriacaoQA ??= criar...(...)); }` (guarda a promessa da criação), a mesma sequência mostra a faixa "Sessão encerrada, Entre de novo: suas coletas continuam guardadas" em menos de 50 s e sem tocar em nada (`E06-faixa-sessao-encerrada-automatica-com-fila-unica.png`), e "Defina a sua senha" depois da entrada com a senha provisória (`E06-faixa-senha-provisoria.png`). O remendo foi revertido (`git restore`); o diff dele está em `70-patch-qa-apenas-para-o-emulador.diff`.
   - Por que nenhum teste pega: os testes da faixa e da fila trocam `useResumoDaFila` ou `obterFila` por dublês de instância única.
   - Dono: E06 (o conserto é de uma linha, mas o teste precisa chamar `obterFila` duas vezes ao mesmo tempo e exigir a mesma instância). Item 5 da seção 7 de `28` (perda ou duplicação de dado do campo) não admite risco aceito.

### CORRIGE ANTES DE CRESCER

2. `apps/campo/src/dados/ordem-do-dia.ts:379`: com a coleta guardada e a fila pausada pela sessão ou pela senha provisória, o cartão da tarefa diz "Você já vistoriou tudo o que está nesta lista. O que falta é sinal para enviar." Não falta sinal, falta entrar de novo. Dono: E06.
3. Resposta de intermediário (proxy, firewall de prefeitura) vira recusa permanente: 403 ou 407 com corpo que não é JSON, ou 403 de código fora do catálogo, deixa o item `bloqueado` com "Tentar de novo" e "Descartar" (matriz Q5, Q6). E o inverso: 2xx cujo corpo não é JSON ou não traz `vistoriaId` (Q10 e Q11) marca o item `confirmado`, e `limparConfirmados` o apaga do aparelho em 30 s. Anterior à E06 (`transporte.ts:217` em `afde25c`), exige TLS interceptado para acontecer, mas é perda de dado do campo. Dono sugerido: etapa nova do motor (validar o recibo).
4. 403 com código de sessão (`sessao_encerrada`, `nao_autenticado`) cai em `FalhaPermanente`: a API não emite hoje, é defesa em profundidade. Dono: E06.

### ANOTADO

5. Q7: erro genérico do cofre não interrompe o dreno (cada item gasta uma tentativa).
6. `NaN` em `gpsPrecisaoMetros` devolve "Era esperado um número, veio um número" (JSON não carrega NaN, improvável).

## Não verificado

- Depois da troca da senha pelo painel, a coleta subir uma vez no emulador: não executei (sem tela de troca de senha no aplicativo; a rota de troca da API não foi exercida). Coberto no nível E1 por `campo-integracao.test.ts` ("senha redefinida ... a coleta sobe UMA vez"), 28 de 28.
- Desativar o agente no painel e reativar com o emulador (a E2 do bloco): troquei por redefinição de senha, que cai na mesma família de pausa; `conta_desativada` ficou só no E1.
- iPhone, cofre real em aparelho físico, rede de campo real (janela da corrida em milissegundos).
- O aplicativo foi exercitado com dois remendos de QA nunca commitados (`obterFila` com promessa memoizada e `copySync` na cópia da foto), só depois de provar o defeito sem eles. Sem o segundo remendo não se conclui uma vistoria no emulador (achado da E16).

## Risco residual

Enquanto o achado 1 estiver aberto, agente com coleta guardada e sessão caída vê faixa verde ou "esperando envio" e pode encerrar o plantão acreditando que a coleta subiu. A coleta não se perde (continua `pendente`), mas fica parada sem aviso visível, até alguém abrir a aba Envio e tocar em "Tentar enviar agora". Perda real só no cenário do achado 3.

## Motivo do humano

Rafael aprova o texto de produto das frases novas de pausa ("Defina a sua senha", "Você entrou com uma senha provisória e o envio está parado") e vê a faixa no aparelho depois do conserto. Não há mais nada que exija pessoa: o resto foi executado.
