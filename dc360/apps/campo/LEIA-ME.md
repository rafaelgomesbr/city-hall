# Aplicativo de campo

**Estado: escrito por inteiro, compila, NUNCA RODOU EM APARELHO.**

Este diretório traz o aplicativo do agente de proteção e defesa civil, em
React Native com Expo. Ele está completo em código e configuração: telas,
navegação, coleta offline, câmera, GPS, assinatura no dedo, fila de envio,
ícones, e a configuração das duas lojas.

O que ele não tem é a única coisa que não se resolve daqui: **nenhuma tela foi
aberta em aparelho nenhum**. Não há emulador nesta máquina, e simulador de iOS
só existe em Mac.

O que É verificável daqui, e está verificado:

| Verificação | Como rodar | Resultado |
| --- | --- | --- |
| TypeScript estrito | `npm run typecheck` | limpo |
| Saúde do projeto Expo | `npx expo-doctor` | 21 de 21 |
| Dependência vulnerável | `npm audit` | zero |
| A fila que ele consome | `npm test --workspace @dc360/campo` | 46 testes |

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

Os passos 4 e 6 são os que só o aparelho responde. O 6 já tem 46 testes
cobrindo a lógica fora do celular, inclusive retomada arquivo a arquivo; o que
falta comprovar é que o `expo-sqlite` guarda o que promete quando o sistema
mata o processo.

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
feita sem sinal vive em `packages/campo`, com 46 testes de unidade, e a
integração dela com a API tem mais 10 em `apps/api`. Este diretório liga os
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
