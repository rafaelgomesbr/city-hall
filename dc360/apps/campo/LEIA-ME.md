# Aplicativo de campo

**Estado: casca escrita, NUNCA EXECUTADA.**

Este diretório traz a interface do aplicativo do agente de campo. Ele não foi
rodado em emulador nem em aparelho, e as dependências do Expo não estão
instaladas: o ambiente onde ele foi escrito não tem como abrir um simulador,
e instalar o Expo traria mais de mil pacotes para dentro de um repositório
cujo `npm audit` fecha em zero hoje.

Por isso ele está **fora do `workspaces` do monorepo**. Instalar aqui não
mexe no resto.

## O que já está pronto e testado, e não está aqui

A parte difícil do aplicativo não é a tela: é a fila que não perde nem duplica
coleta feita sem sinal. Ela vive em `packages/campo`, tem 43 testes de unidade
e mais 10 de integração contra a API de verdade, e é o que estes arquivos
consomem.

O que falta de fato é o que só existe no aparelho: câmera, assinatura no dedo,
GPS e o vínculo com `expo-sqlite`.

## Para colocar de pé

```bash
cd apps/campo
npx create-expo-app@latest . --template blank-typescript   # cuidado: sobrescreve
npx expo install expo-sqlite expo-file-system expo-camera \
    expo-location expo-router react-native-safe-area-context
npx expo start
```

Depois disso, conferir nesta ordem, porque cada item depende do anterior:

1. Entrar com email e senha contra a API.
2. Baixar as pendências e conseguir abrir uma sem sinal.
3. Coletar uma vistoria em modo avião e ver a fila encher.
4. Voltar o sinal e ver a fila esvaziar, com a foto subindo antes do envelope.
5. Matar o aplicativo no meio do envio e reabrir: nada pode duplicar no
   servidor, e é a chave de idempotência que garante isso.

O passo 5 é o que decide se o produto funciona na chuva. Ele já está coberto
por teste automatizado no nível da fila; o que falta comprovar é que o
`expo-sqlite` guarda o que promete quando o sistema mata o processo.
