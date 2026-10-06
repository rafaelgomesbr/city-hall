# V2-F00-E06: Fila do campo trata os três códigos sem perder item

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06; FALTA A VALIDAÇÃO HUMANA (Rafael vê a frase e a coleta preservada no aparelho ou no emulador e aprova as frases) e FALTA A PROVA EM APARELHO (o ambiente desta etapa não renderiza o app Expo). Por isso a etapa está EM ANDAMENTO no STATUS e o item "fila do campo" do G00 não foi marcado (só se marca no próprio gate).

## O que foi entregue

Motor offline (`dc360/packages/campo`):

- `src/tipos.ts`: `FalhaDeSessao` (motivo `sessao_encerrada` ou `conta_desativada`, os códigos do catálogo de `@dc360/shared`), distinta de `FalhaTemporaria` e de `FalhaPermanente`; `MotivoDeSessao`; `ObterToken` (o `obterToken` ganha o pedido opcional `{ renovarJa: true }`); `ResultadoDreno.paradaPor` (opcional) e `ResumoFila.pausadaPor`.
- `src/transporte.ts`: a decisão é pelo CÓDIGO do catálogo, não pelo status. Um ponto só (`pedir`) serve a `chamar` (foto, confirmação, devolução) e a `enviar`: 401 `nao_autenticado` (e 401 sem código reconhecido) pede UM token novo e repete o pedido uma vez; se o token devolvido é o mesmo, ou o pedido falha de novo, vira `sessao_encerrada`; 401 `sessao_encerrada` não gasta a renovação; 403 `conta_desativada` vira `FalhaDeSessao`; sem token também (antes era `FalhaPermanente` `sem_sessao`); 403 `sem_permissao` e as demais recusas continuam `FalhaPermanente`. O pedido repetido leva a mesma chave de idempotência.
- `src/fila.ts`: ao receber `FalhaDeSessao` o dreno PARA (os itens seguintes nem são tocados), o item volta a `pendente` com `tentativas` e `liberadoEm` como estavam (o progresso das fotos que subiram fica), `ultimaFalha` não muda, nada é bloqueado. A pausa vive só na memória e é da pessoa que estava logada: não aparece para quem entrou depois, e é limpa quando um envio dá certo ou quando não há nada pronto para a sessão atual.

Aplicativo (`dc360/apps/campo`):

- `src/dados/token.ts`: `renovarJa` renova mesmo com o token longe de vencer, mas a trava de renovação em voo e o piso de 60 s continuam valendo; dentro do piso, ou com a renovação recusada, devolve o MESMO token (é o que o transporte lê como "repetir seria inútil").
- `src/dados/falha-de-atualizacao.ts`: motivo `conta-desativada` (lido pelo código, antes do 401 e do "outro"), `ehFimDeLinha`, frase com "suas coletas continuam guardadas neste aparelho, procure a coordenação". `src/dados/api.ts`: `mensagemAmigavel` para `conta_desativada`. As três telas que mostram a falha usam `ehFimDeLinha` para o tom de perigo; só a sessão encerrada traz o botão "Entrar de novo".
- `src/dados/pausa-da-fila.ts` (novo): as frases da pausa (faixa, aviso, cartão) e a espera de 60 s do laço de fundo enquanto a fila está pausada (`src/dados/fila.ts`).
- `src/ui/FaixaDeSincronizacao.tsx` e `src/dados/resumo-da-fila.ts`: estados `sessao_encerrada` e `conta_desativada` na faixa do topo (antes de "Enviando" e de "Com sinal", que prometeriam o envio). `src/app/(agente)/fila.tsx`: aviso no alto de "Minhas coletas" (peso leve, pela régua R1 e R2), cartão "Guardada" no lugar de "Aguardando", sem "Descartar" e sem "Tentar de novo" para a coleta pausada.
- `src/dados/sessao.tsx` e `src/dados/fila.ts`: o tipo `ObterToken`.

Documentação: `dc360/apps/campo/PENDENCIAS.md` (item 14), `dc360/apps/campo/LEIA-ME.md` (passo 7 de conferência no aparelho e contagens), `dc360/README.md` (tabela da fila e contagens), `dc360/apps/api/PENDENCIAS.md`, `dc360/docs/GUIA-DO-COORDENADOR.md` (o que o agente vê, sem o aviso de "não descartar" da E05), comentário de `transporte.ts`, `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (três testes reescritos).

## Frases mostradas ao usuário (para Rafael aprovar)

Faixa do topo (uma linha) e aviso no alto da tela de envio:

- Sessão encerrada. Faixa: "Sessão encerrada" / "Entre de novo: suas coletas continuam guardadas". Aviso: "Sua sessão terminou e o envio está parado" / "Suas coletas continuam guardadas neste aparelho e nada foi apagado. Entre de novo com o seu email e a sua senha: assim que você entrar, elas sobem sozinhas." Botão: "Entrar de novo". Cartão: "Guardada neste aparelho. Sobe sozinha depois que você entrar de novo."
- Conta desativada. Faixa: "Conta desativada" / "Suas coletas continuam guardadas neste aparelho, procure a coordenação". Aviso: "Sua conta foi desativada e o envio está parado" / "Suas coletas continuam guardadas neste aparelho, procure a coordenação do seu município. Entrar de novo não resolve enquanto a conta estiver desativada. Se ela for reativada, as coletas sobem depois que você entrar." Sem botão. Cartão: "Guardada neste aparelho. Só sobe depois que a coordenação reativar a sua conta e você entrar."
- Lista de hoje, perfil e vistoria (falha ao atualizar), conta desativada: "Conta desativada" / "Sua conta foi desativada e nada novo desce para este aparelho. Entrar de novo não resolve: suas coletas continuam guardadas neste aparelho, procure a coordenação do seu município."
- Tela de entrada (`ErroDaApi.mensagemAmigavel`): "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. O que você já registrou continua guardado no aparelho."

O texto exato que a tela de envio desenha, por estado, está em `saidas/05-tela-da-fila-em-texto.txt`.

## A sonda, antes e depois (o teste negativo falha antes do conserto)

Com o código antigo de volta, mantendo os testes novos (`saidas/02a`, `02b`, `02c`):

| Peça antiga de volta | Resultado |
| --- | --- |
| `transporte.ts` de HEAD (401 e 403 viram permanentes) | 16 dos 86 testes de `fila.test.ts` e `pausa-de-sessao.test.ts` reprovam |
| `fila.ts` de HEAD (sem o ramo de sessão) | 13 dos 86 reprovam |
| `fila.tsx` de HEAD (sem aviso, sem cartão "Guardada") | 7 dos 9 casos da tela reprovam |
| `campo-integracao.test.ts` (o teste antigo "token vencido bloqueia o item") com o código novo | reprova (esperava `bloqueados` igual a 1): é a decisão superada, reescrita e registrada |

Depois: 187 de 187 no pacote, 15 de 15 na integração com a API, 9 de 9 na tela.

## Resultados medidos

| Passo | Antes (esta sessão, `saidas/antes/`) | Depois |
| --- | --- | --- |
| `npm run test --workspace @dc360/campo` | 159, 0 falhas | 187 (28 novos em `pausa-de-sessao.test.ts`), 0 falhas |
| `npx jest --silent` em `apps/campo` | 1801, 20 falhas (E14 a E16) | 1836 (35 novos), as MESMAS 20 falhas (nomes conferidos linha a linha) |
| `apps/api/test/campo-integracao.test.ts` | 10 | 15 (4 novos contra a API real, 1 reescrito) |
| `npm run test:api` | 1129, 1 falha (laudo do pacote, E12), 13 pulados | 1134, as mesmas falhas (laudo do pacote e a carga de `banco-tls`), 13 pulados |
| `npm run test:isolamento` | 318 (315 e 3 pulados) | 318 (315 e 3 pulados) |
| `npm run test:campo` | cai no typecheck do campo (2 erros de cache `.expo`, E21) | igual: os mesmos 2 erros |
| `npm run typecheck` do pacote campo | verde | verde |
| `npm run test:scripts` | 198, 3 falhas (E17), 4 pulados | 198, 3 falhas, 4 pulados |
| `node --test scripts/baseline.test.mjs` | 16 | 16 |
| `npm run conferir:numeros` | 13 afirmações que não batem | 13 |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes de travessão | as mesmas |
| `node scripts/baseline.mjs --so=teste-campo-pacote,teste-campo-app` | n/a | os dois conferem (`saidas/baseline-depois/`) |

Os quatro casos novos contra a API real (`saidas/04-api-completa-depois.txt`): conta desativada entre enfileirar e drenar (403, item pendente, nada no banco, sobe depois da reativação com nova entrada e fica UMA vistoria); sessão encerrada de uma só sessão (401, item pendente, sobe depois da nova entrada); token vencido de verdade (assinado com o segredo do teste) renova uma vez e sobe sem pausar; token recusado sem renovação possível pausa sem laço (uma renovação por pedido). O 403 `sem_permissao` continua bloqueando (coordenador mandando vistoria).

Autoria e isolamento: o agente B desativado, o agente A entra no aparelho: os itens do B não sobem (o envio nem é chamado), a pausa do B não aparece para o A (`pausadaPor` nulo, `deOutroAutor` 1), e o B volta e redescobre a pausa com UMA requisição.

`baseline.mjs`: `teste-campo-pacote` e `teste-campo-app` passaram a somar o esperado por etapa (`MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA`, `MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA`), como já era a API, o shared e o web; `teste-api` ganhou a linha `V2-F00-E06` (+5). `baseline.test.mjs` confere as duas tabelas novas dentro do teste que já existia (16 testes, sem acrescentar teste).

## Interface: o que foi provado e o que NÃO foi

O Expo não renderiza neste ambiente (não há emulador nem aparelho), então NÃO há captura de tela real. O que existe:

- Teste de componente com `@testing-library/react-native` (`apps/campo/src/ui/fila-pausada-pela-sessao.test.tsx`, 9 casos) e da faixa (`faixa-de-sincronizacao.test.tsx`, 6 casos novos): a frase, o botão só na sessão encerrada, o cartão "Guardada", ausência de "Descartar" e "Tentar de novo", e a tela de sempre sem pausa. O texto que a tela desenha, por estado, está em `saidas/05-tela-da-fila-em-texto.txt`.
- Portões de densidade e de acessibilidade do aplicativo (`scripts/portao-densidade-do-aplicativo.test.mjs`): o primeiro reprovou o aviso da pausa com peso forte ao lado do aviso de coleta recusada (R1: um bloco preenchido por peça); o aviso desceu para peso leve e o portão voltou ao baseline. A faixa usa só os tokens `perigoFundo` e `perigoTexto` que a faixa "Precisa de correção" já usa.
- O portão visual de 19-definicao-de-pronto (card desalinhado, texto cortado) NÃO foi conferido por captura. Pendência de validação humana: foto do aparelho ou do emulador, nos dois temas e em tela pequena, com a faixa e o aviso em 390 de largura (a frase da conta desativada é a mais longa da faixa e deve quebrar em mais de uma linha: conferir que nada fica cortado).

## Limitações

- Sem captura de tela e sem E2E em emulador: o cenário "desativar o agente no painel durante uma coleta na fila e ver a frase no aparelho" não foi executado. Foi provado em duas metades: o motor contra a API real (conta desativada, sessão encerrada, token vencido) e a tela por teste de componente. O log do cenário em ponta a ponta é pendência humana.
- A frase de cada pausa é conteúdo de produto: falta Rafael aprovar.
- O 403 `troca_de_senha_obrigatoria` e o 403 `acesso_suspenso` (fora das rotas da fila, onde a API responde 503) continuam recusa permanente do item no transporte. Estão fora do escopo (a etapa trata os três códigos de acesso da E05) e registrados em `apps/campo/PENDENCIAS.md`, item 14.
- Uma pausa por falso 401 (renovação recusada por falta de sinal, lida como "token igual") se desfaz sozinha na próxima volta do laço, a cada 60 s; o item nunca é tocado.
- A leitura do `exp` do token e o relógio do aparelho seguem sem correção (fora do escopo).
- 20 falhas do app de campo (E14 a E16) e 2 erros de typecheck (`.expo`, E21) são pré-existentes e NÃO são desta etapa; as 20 falhas incluem `a-sessao-que-terminou-nao-e-falta-de-sinal` e `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha`, da E14, que tocam telas vizinhas e continuam com os mesmos nomes.

## O que falta

- Validação humana: Rafael vê a frase e a coleta preservada no aparelho ou no emulador, nos dois temas, e aprova as frases acima.
- Item "fila do campo" do G00: só no gate.
- A E04, a E05 e a E06 vão juntas para produção; a E06 retira o impedimento que a E05 tinha, mas a prova em aparelho segue pendente.
