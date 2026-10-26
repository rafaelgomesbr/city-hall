# Aplicativo de campo

**Estado: escrito por inteiro, compila, sem artefato de aparelho físico arquivado (há capturas de emulador Android, abaixo).**

Este diretório traz o aplicativo do agente de proteção e defesa civil, em
React Native com Expo. Ele está completo em código e configuração: telas,
navegação, coleta offline, câmera, GPS, assinatura no dedo, fila de envio,
ícones, e a configuração das duas lojas.

O que ele não tem é a única coisa que não se resolve daqui: **prova arquivada
de que ele roda num aparelho**. Há relato de uso (o `README.md` da raiz fala de
compilação nativa num iPhone em 08/09/2026, com três vistorias coletadas), mas
nenhuma foto, vídeo, registro ou captura de aparelho FÍSICO (iPhone ou
Android) está no repositório, e relato não é prova. Até a V2-F14-E12 arquivar
esse artefato, nada aqui deve ser lido como "testado em aparelho".

Emulador é outra coisa, e há um pouco dele arquivado: os validadores das
etapas E06, E15 e E16 rodaram o aplicativo no emulador Android (AVD
`Medium_Phone_API_36.1`, APK de depuração construído do commit validado) e
deixaram capturas e o relato. As capturas estão em
`docs/evidencias-v2/G00/V2-F00-E06/validacao/4b96ea7/anexos/` (seis, da fila e
da faixa de envio pausadas pela sessão encerrada e pela senha provisória) e em
`docs/evidencias-v2/G00/V2-F00-E16/validacao/4b96ea7/anexos/` (seis, da câmera,
da tarja de permissão negada, dos ajustes do aparelho e da foto guardada), mais
uma da E15 em `docs/evidencias-v2/G00/V2-F00-E15/validacao/4b96ea7/anexos/`
(`E15-dialogo-sair-da-conta.png`, o diálogo "Sair da conta?" com a coleta
guardada no aparelho), e o relato está nos `qa.md` dessas três pastas. Duas ressalvas: parte delas foi
tirada com remendos de QA que nunca entraram no código (cada `qa.md` diz quais),
e emulador não prova câmera, GPS nem `expo-sqlite` sob morte de processo num
aparelho de verdade. Do simulador de iOS há só o relato, e sem captura no
repositório: o validador da E06 (rodada 3, `qa.md` em
`docs/evidencias-v2/G00/V2-F00-E06/validacao/52952a1/`) construiu o aplicativo
em Debug e o abriu no Simulador (iPhone 17 Pro, iOS 26.5) apontando para uma API
local, e o da E15 repete a frase; ninguém conseguiu dirigir a interface lá (a
captura da tela de entrada que o `qa.md` cita não está no repositório). Ou
seja: compila e abre no simulador de iOS, e nada além disso foi visto.

O que É verificável daqui, e está verificado:

| Verificação | Como rodar | Resultado |
| --- | --- | --- |
| TypeScript estrito | `npm run typecheck` | limpo com o cache `.expo/types` em dia (ver o parágrafo abaixo); `npm run test:campo` na raiz limpa o cache velho antes |
| Saúde do projeto Expo | `npx expo-doctor` | **21 de 21** em 2026-10-13, depois de subir seis pacotes um patch atrás (`expo`, `expo-crypto`, `expo-location`, `expo-router`, `expo-splash-screen`, `jest-expo`; eles tinham ficado para trás porque o Expo publicou patches depois do 21 de 21 de 2026-10-08, e a pendência 17 de `PENDENCIAS.md` guarda o registro). **Voltou na manhã de 2026-10-14: 20 de 21**, a única falha era a de versões de pacote, com cinco pacotes um patch atrás (`expo`, `expo-constants`, `expo-linking`, `expo-notifications` e `expo-router`). **21 de 21 de novo no mesmo dia**, depois da correção 4 da E19, que subiu esses cinco (premissa: o Rafael decidiu atualizar os seis pacotes de 2026-10-13, não estes cinco, e a confirmação dele para a analogia está pendente; item 17 de `PENDENCIAS.md`). **Voltou em 2026-10-18: 20 de 21**, com `expo` e `expo-router` um patch atrás, e fechou em **21 de 21 no mesmo dia** com a correção 5 da E19 (`expo` ~57.0.30 e `expo-router` ~57.0.28, mesma premissa). **Voltou de novo em 2026-10-24 e fechou em 21 de 21 sem pular a checagem de versões** com a correção 10 da E19, que subiu cinco pacotes um patch (`expo` 57.0.30 para 57.0.31, `expo-location` 57.0.21 para 57.0.22, `expo-network` 57.0.2 para 57.0.3, `expo-notifications` 57.0.23 para 57.0.24 e `expo-router` 57.0.28 para 57.0.29; mesma premissa das anteriores, a confirmação do Rafael segue pendente). A cada patch novo do Expo a deriva pode voltar. Mudar a versão de pacote nativo exige recompilar o binário do aparelho (ver "Antes da próxima entrega aos agentes: novo binário nativo", abaixo) |
| Dependência vulnerável | `npm audit` (aqui) e `npm run auditar` (na raiz) | `npm audit` puro **não fecha** aqui: acusa dezenas de avisos, altos e um crítico (a contagem muda com a base de avisos do dia), que chegam por dentro do Expo. `npm run auditar` (na raiz) fecha com saída 0 em 2026-10-24: runtime da raiz em zero (o aviso do `fastify` e do `fast-uri` não aparece mais: `npm audit --omit=dev` na raiz dá 0) e, no aplicativo, as exceções nomeadas do CP-03 (cinco pacotes, sete advisories: `decode-uri-component`, `brace-expansion` com três, `node-forge`, `shell-quote` e a cópia do `zod` 3 que o `@expo/cli` carrega, com `somenteEm: ["node_modules/expo/node_modules/"]`; `braces` e `sprintf-js` saíram em 2026-10-24, porque o registro retirou as duas advisories), cada uma com motivo, dono e prazo 2027-01-05 em `scripts/auditar-excecoes.mjs`. Exceção sem motivo, dono ou prazo, ou com prazo vencido, reprova. O `npm run auditar` roda no Windows |
| A fila que ele consome | `npm test --workspace @dc360/campo` | 283 testes do motor de campo |

**O cache `.expo/types` e o typecheck.** Com `experiments.typedRoutes` ligado,
o `expo start` grava em `.expo/types/router.d.ts` a lista das rotas de
`src/app` que existiam naquele momento, e o `tsconfig.json` inclui esse
arquivo. Ele é gerado, é de cada máquina e fica fora do git (`.expo/` está no
`.gitignore`). Numa máquina onde o Expo não roda há tempo, o arquivo velho não
conhece as rotas novas e o `npm run typecheck` reprova um `router.push` para
rota que existe (em 2026-10-07: dois TS2345, em `perfil.tsx` e `Sino.tsx`, por
um cache de 2026-08-27 sem `mapa`, `perfil` e `avisos`). `npm run test:campo`,
na raiz do `dc360`, confere o arquivo contra as rotas do disco antes do
typecheck e apaga `.expo/types` quando falta alguma rota; o próximo
`expo start` o recria. Quem rodar `npm run typecheck` direto aqui, com cache
velho, apaga `.expo/types` à mão ou roda `npm run test:campo`. O job
`plataformas` do CI (Windows e Linux) prova isso a cada push em `main`, `master`
e `v2/**` e a cada `pull_request` (não em push para outro ramo): põe aqui um cache
sem `/avisos`, `/mapa` e `/perfil` (`scripts/fixtures/router.d.ts.velho`, na
raiz do `dc360`), confere que o `tsc` direto reprova com TS2345 e só então roda
o `npm run test:campo`. Se uma atualização do expo-router mudar o formato do
arquivo gerado, a fixture pode precisar ser refeita a partir de um
`router.d.ts` novo, tirando as três rotas.

## Para colocar de pé

A configuração `extra.apiUrl` (inclusive nos perfis do EAS) continua contendo
só a origem da API. O código acrescenta `/v1` na base usada pelas chamadas e
pela fila; as telas de entrada e perfil mostram só a origem. Uma barra final
na configuração não duplica a barra do prefixo. URLs assinadas de arquivos
continuam sendo usadas exatamente como vieram da API, sem acrescentar `/v1`.

Publique primeiro a API com `/v1`, depois o cliente novo. O aplicativo já
instalado continua usando o espelho sem prefixo até a V2-F28-E11. Esta mudança
não altera o contrato desse espelho nem exige recompilar os binários antigos.
A fila lê a categoria do código no catálogo compartilhado (`erros.ts`), mas
só dentro do status, e o comportamento continua o de antes: 5xx, 429 e falta
de rede esperam; 401 renova o token uma vez e, se não resolver, pausa a fila
com todos os itens guardados (o 401 de categoria `reentrar` pausa sem gastar
a renovação); 403 de conta, de senha provisória ou de contrato pausa ou
espera; os demais 4xx deixam o item bloqueado (ou arquivado, se a coleta
ficou sem destino), com descarte só pela ação da tela. Nenhuma categoria faz
a fila apagar item, e o 409 `autor_divergente` continua bloqueando só o item
de outra pessoa, sem pausar a fila de quem está no aparelho.

**A versão do aplicativo em todo pedido (V2-F02-E06).** Todo pedido do
aplicativo à API leva o cabeçalho `X-App-Version: campo/<versão>`, com a
versão do `expoConfig.version` (o `version` de `app.config.ts`, a mesma que o
perfil mostra): as chamadas de `src/dados/api.ts`, as de `rota.ts`, `mapa.ts`
e `historico-da-casa.ts` (todas por `src/dados/versao-do-aplicativo.ts`) e a
fila, cujo transporte em `packages/campo` recebe a versão por parâmetro e
continua sem depender do Expo. O PUT na URL assinada do armazenamento não leva
o cabeçalho: ele não fala com a API, e os cabeçalhos dele entram na
assinatura. Binário sem versão declarada manda o pedido sem o cabeçalho, como
antes. O cabeçalho é só aditivo: o espelho sem `/v1`, os status e os códigos
de erro não mudam, e os aparelhos já instalados (que não o mandam) continuam
aceitos.

**O 426 `versao_do_aplicativo_antiga`.** Quando a API tiver uma versão mínima
configurada e este binário estiver abaixo dela, ela responde 426. Na fila o 426
entra na mesma classe de falha da conta desativada (`FalhaDeSessao`, motivo
`versao_do_aplicativo_antiga`): a fila **pausa** e **todo item permanece
guardado**, `pendente`, com a mesma contagem de tentativas; nada é bloqueado,
nada ganha "Descartar" e, enquanto a última resposta da fila foi 426, o token é
pedido sem renovação antecipada (`semRenovar`): o 426 vem antes da autenticação,
então renovar por antecipação só gastaria uma tentativa por dreno. Só o 401
renova, uma vez, como sempre, e a primeira resposta que não seja 426 devolve a
renovação antecipada ao normal. A suspensão vale para os pedidos da fila e não
para as chamadas do aplicativo fora dela (entrar, baixar a lista), que seguem o
piso de um minuto entre tentativas. É o status
que decide: qualquer 426, com o código do catálogo, com outro código ou sem
corpo, pausa. A faixa do topo, o aviso da fila e o cartão de cada coleta usam
as frases da pausa (`src/dados/pausa-da-fila.ts`: "Atualize o aplicativo",
com a promessa de que as coletas continuam guardadas); não há tela nem botão
próprios, porque a tela "atualize o aplicativo" é da V2-F14-E08. Atualizado o
aplicativo, a mesma coleta sobe com a mesma chave de idempotência. Fora da
fila (entrar, baixar a lista), o 426 chega como qualquer recusa, com a frase
do servidor.

```bash
cd dc360/apps/campo
npm install
npx expo start           # aparelho na mesma rede, com o Expo Go
```

Para um build instalável, sem passar por loja:

```bash
npm install --global eas-cli && eas login && eas init
eas build --profile desenvolvimento --platform android
```

Para publicar, ver **[LOJAS.md](./LOJAS.md)**: ele cobre Play Console e App
Store Connect passo a passo, com os textos da ficha prontos e o formulário de
segurança de dados respondido linha a linha.

## O que conferir no aparelho, nesta ordem

Cada item depende do anterior, e o último é o que decide se o produto funciona
na chuva.

1. Entrar com email e senha contra a API.
2. Baixar as tarefas e conseguir abrir uma **em modo avião**.
3. Coletar a vistoria inteira sem sinal: checklist, foto, GPS, assinatura.
4. Fechar o aplicativo pelo gerenciador de tarefas no meio da coleta e
   reabrir. **O rascunho precisa estar inteiro.**
5. Voltar o sinal e ver a fila esvaziar, com as fotos subindo antes do
   envelope e a assinatura indo para o campo dela.
6. Matar o aplicativo no meio do envio e reabrir: **nada pode duplicar no
   servidor**.
7. Com uma coleta na fila e o aparelho com sinal, **desativar o agente no
   painel** (ou encerrar as sessões dele). A faixa do topo e a tela de envio
   dizem a frase (conta desativada: "procure a coordenação"; sessão encerrada:
   "entre de novo"), a coleta continua na lista como "Guardada", nada é
   descartado e **não há botão "Descartar"**. Reativar a conta, entrar de novo e
   ver a MESMA coleta subir, uma vez só. É a validação de aparelho da
   V2-F00-E06, ainda pendente (ver `PENDENCIAS.md`, item 14).
8. Começar uma vistoria (marcar o checklist, tirar uma foto, colher a
   assinatura) SEM concluir e tocar em "Sair da conta" no Perfil. O diálogo
   diz "Você tem 1 vistoria começada neste aparelho, com fotos e
   assinatura" e que **sair apaga**; "Continuar conectado" não apaga nada.
   Depois, com GPS simulado abaixo de meio metro, capturar a localização: a
   tela diz "Precisão de 1 metro" e a conclusão sobe sem 422. É a validação
   de aparelho da V2-F00-E15, ainda pendente (ver `PENDENCIAS.md`, item 15).
9. Na vistoria, negar a permissão de câmera e tocar em "Tirar foto": a tarja
   traz **"Abrir os ajustes do aparelho"**, e o botão abre os Ajustes (o mesmo
   vale para a localização negada). Digitar o nome de quem assina com o teclado
   aberto e tocar em "Tirar foto": **o primeiro toque abre a câmera**, e o campo
   digitado não fica embaixo do teclado. Na câmera, o obturador e "Voltar sem
   fotografar" ficam acima da barra do sistema. Ao concluir, a tela diz que a
   coleta sobe **quando o aplicativo estiver aberto e houver rede**: não há
   envio em segundo plano, e o aplicativo fechado não envia nada. É a validação
   de aparelho da V2-F00-E16, ainda pendente (ver `PENDENCIAS.md`, item 16).
10. Com uma coleta na fila, subir a API com a versão mínima do campo ACIMA da
   versão deste binário (variável da V2-F02-E06). A faixa do topo diz
   **"Atualize o aplicativo"**, a coleta continua na lista como "Guardada" e
   **não há botão "Descartar"**. Esvaziar a versão mínima (ou atualizar o
   aplicativo) e ver a MESMA coleta subir, uma vez só, em até um minuto com o
   aplicativo aberto. É o E2E manual da V2-F02-E06, ainda pendente.

Os passos 4 e 6 são os que só o aparelho responde. O 6 já tem
283 testes do motor de campo cobrindo a lógica fora do celular, inclusive
retomada arquivo a arquivo; o que falta comprovar é que o `expo-sqlite` guarda o que promete
quando o sistema mata o processo.

## Como ele está organizado

```
app.config.ts        identificadores, permissões e textos que as lojas leem
eas.json             perfis de build: desenvolvimento, homologação, produção
assets/              ícone, ícone adaptativo e abertura, gerados por script
scripts/             gerador dos ícones a partir dos tokens do design system
src/app/             telas, roteadas por arquivo (expo-router)
src/dados/           sessão, API, fila, rascunho, tarefas guardadas
src/ui/              tokens e componentes
```

**A lógica difícil não está aqui.** A fila que não perde nem duplica coleta
feita sem sinal vive em `packages/campo`, com 283 testes de unidade do motor de campo, e a
integração dela com a API tem mais 17 em `apps/api` (`test/campo-integracao.test.ts`). Este diretório liga os
fios: o que sobra é tela, permissão de aparelho e persistência local, e é por
isso que ele é fino de propósito.

## Antes da próxima entrega aos agentes: novo binário nativo

A correção 10 da V2-F00-E19 (2026-10-24) mudou o que vai dentro do aplicativo, e
o binário que está nos aparelhos é anterior a ela. **Nenhum binário novo foi
gerado**: antes de entregar aos agentes, gerar um (`eas build`, ver
**[LOJAS.md](./LOJAS.md)**) com o que mudou:

- cinco pacotes do SDK 57 subiram um patch, todos dentro do `~57.0`:
  `expo` 57.0.31, `expo-location` 57.0.22, `expo-network` 57.0.3,
  `expo-notifications` 57.0.24 e `expo-router` 57.0.29. Pacote nativo muda o
  código que o aparelho carrega, então precisa de build nativo novo, e o
  `expo-doctor` volta a 21 de 21 só com eles;
- o `zod` passou da linha 3 para a **4** (4.6.7), que a GHSA-mrhx-c7xc-m3w5
  exige, e entra como dependência declarada deste aplicativo (`^4.6.7`). O
  `@dc360/shared` (esquemas e mensagens em português) usa a linha 4, e o
  `@expo/cli` mantém por dentro a cópia 3.25.76 em
  `node_modules/expo/node_modules/zod`, só na máquina de build (exceção
  nomeada acima).

O Metro nunca empacotou o aplicativo com o `zod` 4: os testes de Jest passam,
mas nenhum bundle foi gerado até aqui. O primeiro `eas build` é também essa
prova.

## Por que fica fora do `workspaces` do monorepo

O Expo traz quase seiscentos pacotes. Deixá-lo fora significa que
`npm install` na raiz do produto continua rápido, e que o `npm audit` de lá
não passa a depender do ciclo de lançamento do React Native. Este diretório
tem o próprio `package-lock.json` e a própria auditoria, que NÃO fecha em zero
no `npm audit` puro (fecha em `npm run auditar`, com as exceções nomeadas do CP-03: cinco
pacotes e sete advisories; ver a tabela acima).

## Por que `react-native-reanimated` e `react-native-worklets` estão fixados

As duas linhas em `package.json` têm versão exata, sem `~` nem `^`, e não são
usadas diretamente por nenhum arquivo deste aplicativo. **Não remova.**

Elas existem porque o `expo-router` puxa o `react-native-reanimated`, que puxa
o `react-native-worklets`. Sem o pino, o npm resolvia o worklets para `0.12.1`,
e o `expo-modules-core` aceita no máximo `0.10`. A consequência não aparece em
lugar nenhum até a compilação nativa, e lá ela aparece assim:

```
WorkletJSCallInvoker.cpp:27:21: error: no member named 'executeSync'
  in 'worklets::WorkletRuntime'
```

Vale registrar o que NÃO pegou isso, porque é a lição:

- `npm run typecheck` passou. É código C++, não TypeScript.
- Os testes passaram. Eles rodam em Node, não no aparelho.
- `npm audit` fechou em zero. Não é vulnerabilidade, é incompatibilidade.
- `npx expo-doctor` deu 21 de 21. Ele não confere dependência transitiva.
- O `npm ls` já imprimia `invalid` ao lado do pacote, e ninguém lia.

Seis minutos de compilação foram a primeira coisa a reclamar. Os números que o
SDK espera estão em `node_modules/expo/bundledNativeModules.json`, e é de lá
que os pinos saíram.
