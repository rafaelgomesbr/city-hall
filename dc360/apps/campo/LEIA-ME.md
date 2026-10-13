# Aplicativo de campo

**Estado: escrito por inteiro, compila, sem artefato de aparelho arquivado.**

Este diretório traz o aplicativo do agente de proteção e defesa civil, em
React Native com Expo. Ele está completo em código e configuração: telas,
navegação, coleta offline, câmera, GPS, assinatura no dedo, fila de envio,
ícones, e a configuração das duas lojas.

O que ele não tem é a única coisa que não se resolve daqui: **prova arquivada
de que ele roda num aparelho**. Há relato de uso (o `README.md` da raiz fala de
compilação nativa num iPhone em 08/09/2026, com três vistorias coletadas, e
outras sessões falaram de emulador), mas nenhuma foto, vídeo, registro ou
captura de aparelho está no repositório, e relato não é prova. Até a
V2-F14-E12 arquivar esse artefato, nada aqui deve ser lido como "testado em
aparelho". Não há emulador nesta máquina, e simulador de iOS só existe em Mac.

O que É verificável daqui, e está verificado:

| Verificação | Como rodar | Resultado |
| --- | --- | --- |
| TypeScript estrito | `npm run typecheck` | limpo com o cache `.expo/types` em dia (ver o parágrafo abaixo); `npm run test:campo` na raiz limpa o cache velho antes |
| Saúde do projeto Expo | `npx expo-doctor` | **21 de 21** em 2026-10-08, depois de alinhar `expo`, `expo-camera`, `expo-router`, `expo-sqlite` e outros pacotes ao SDK 57 (versões de correção). Mudou a versão de pacote nativo: o próximo binário do aparelho precisa ser recompilado |
| Dependência vulnerável | `npm audit` (aqui) e `npm run auditar` (na raiz) | **NÃO fecha** em 2026-10-07: o `npm audit` daqui acusa dezenas de avisos, altos e um crítico, e a raiz tem um aviso alto de execução no `fastify`. A única aceita com motivo escrito continua sendo `decode-uri-component` (`scripts/auditar.mjs`). No Windows, `npm run auditar` morre com `spawnSync npm ENOENT` antes de auditar. A correção é da V2-F00-E19, que espera o CP-03 |
| A fila que ele consome | `npm test --workspace @dc360/campo` | 223 testes do motor de campo |

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
velho, apaga `.expo/types` à mão ou roda `npm run test:campo`.

## Para colocar de pé

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

Os passos 4 e 6 são os que só o aparelho responde. O 6 já tem
223 testes do motor de campo cobrindo a lógica fora do celular, inclusive
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
feita sem sinal vive em `packages/campo`, com 223 testes de unidade do motor de campo, e a
integração dela com a API tem mais 15 em `apps/api`. Este diretório liga os
fios: o que sobra é tela, permissão de aparelho e persistência local, e é por
isso que ele é fino de propósito.

## Por que fica fora do `workspaces` do monorepo

O Expo traz quase seiscentos pacotes. Deixá-lo fora significa que
`npm install` na raiz do produto continua rápido, e que o `npm audit` de lá
não passa a depender do ciclo de lançamento do React Native. Este diretório
tem o próprio `package-lock.json` e a própria auditoria, que também fecha em
zero.

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
