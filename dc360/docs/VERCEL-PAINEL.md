# Subir o painel na Vercel

O projeto que está NO AR é `dc360-painel-web`, em
`https://dc360-painel-web.vercel.app`, ligado ao repositório
`rafaelgomesbr/city-hall`, branch de produção `master`. Existe também um
projeto `dc360-painel` mais antigo (criado em 08/09/2026) cujo último deploy
está em erro e que não tem domínio de produção: ele pode ser apagado na conta,
e nada aponta para ele. Conferido em 15/09/2026 pela conta da Vercel e por
uma requisição CORS à API, que já responde
`access-control-allow-origin: https://dc360-painel-web.vercel.app`.

## 1. Root Directory

Settings > General > Root Directory: trocar para

```
dc360
```

Tem que ser `dc360`, e não `dc360/apps/web`. O painel é um workspace npm que
depende de `@dc360/shared`, e esses pacotes só existem a partir da raiz do
monorepo. Apontando para `apps/web`, a instalação não acha as dependências
internas e o build morre.

O `dc360/vercel.json` cuida do resto: instala com as dependências de
desenvolvimento (o TypeScript é uma delas, e sem ele não há build), compila os
pacotes compartilhados na ordem certa, e publica `apps/web/dist`.

## 2. A variável que liga o painel na API

Desde a emenda de 08/09/2026 (no fim deste arquivo) a variável já vem declarada em
`dc360/vercel.json`, no bloco `build.env`; não é preciso cadastrá-la no painel da
Vercel. Esta seção explica o que ela faz e por que não pode faltar. Seu valor:

```
VITE_API_URL = https://defesa-civil.fly.dev
```

Isto não é detalhe de configuração, é o interruptor entre dois produtos
diferentes. `apps/web/src/dados/repositorio.ts` decide o modo por
`Boolean(import.meta.env["VITE_API_URL"])`:

- **Com** a variável: o painel fala com o servidor real, com login, banco e
  isolamento entre municípios.
- **Sem** a variável: o painel sobe em modo local, com um Postgres em
  WebAssembly dentro do navegador e dados de exemplo. Funciona, é bonito, e
  não é o produto. Serve para demonstrar sem servidor.

Se o objetivo é mostrar o sistema de verdade, a variável precisa estar no build (`vercel.json`).

## 3. Publicar

Depois dos dois ajustes, um `git push` na `master` publica. Ou, no painel da
Vercel, Deployments > Redeploy.

## 4. Depois de publicar, conferir o endereço

O endereço real é `https://dc360-painel-web.vercel.app`, e os segredos do Fly
(`URL_PAINEL` e `ORIGENS_PERMITIDAS`) já apontam para ele (conferido em
15/09/2026: a API responde ao `OPTIONS` dessa origem com o cabeçalho de CORS
certo, e não responde à origem antiga). O `index.html` do painel grava o
mesmo endereço nas tags `og:url` e `og:image`, e o portão `test/seo.test.ts`
exige que as duas concordem. Se o endereço mudar um dia, o painel deixa de
falar com a API (o navegador barra por CORS), e o conserto é um comando:

```bash
cd dc360
fly secrets set -a defesa-civil \
  URL_PAINEL='https://ENDERECO-REAL' \
  ORIGENS_PERMITIDAS='https://ENDERECO-REAL'
```

## 5. Quando o domínio próprio for comprado

Ver `docs/COLOCAR-DE-PE.md`. Em resumo: aponta o domínio para a Vercel (painel)
e para o Fly (API), e depois repete o comando acima com os endereços novos,
mais `URL_PUBLICA`. Nada no código precisa mudar.

## Emenda de 08/09/2026: a variável saiu do painel e entrou no `vercel.json`

`VITE_API_URL` passou a ser declarada em `dc360/vercel.json`, no bloco
`build.env`. Duas razões:

1. Não é segredo. É o endereço público da API, o mesmo que qualquer pessoa
   enxerga na aba de rede do navegador. Segredo de verdade continua fora do
   repositório.
2. Configuração que mora no painel de um provedor é configuração que ninguém
   revisa e que some quando o projeto é recriado. No repositório, ela entra no
   diff, aparece no histórico, e sobe junto com o código que depende dela.

Consequência prática: publicar o painel deixou de exigir cliques. Quem clonar
o repositório e ligar na Vercel recebe um painel já apontado para a API certa.
Para apontar para outro servidor (homologação, outro município), troque essa
linha e faça um commit, que é onde a mudança fica visível.
