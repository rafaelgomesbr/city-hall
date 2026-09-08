# Subir o painel na Vercel

O projeto `dc360-painel` já existe na conta (criado em 08/09/2026, ligado ao
repositório `rafaelgomesbr/city-hall`, branch de produção `master`). Falta
apenas ajustar duas coisas no painel da Vercel, porque a API deles não expõe
essas configurações para automação.

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

Settings > Environment Variables, para Production:

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

Se o objetivo é mostrar o sistema de verdade, a variável precisa estar lá.

## 3. Publicar

Depois dos dois ajustes, um `git push` na `master` publica. Ou, no painel da
Vercel, Deployments > Redeploy.

## 4. Depois de publicar, conferir o endereço

O endereço final foi CHUTADO como `https://dc360-painel.vercel.app` e já está
gravado nos segredos do Fly (`URL_PAINEL` e `ORIGENS_PERMITIDAS`). A Vercel só
confirma o endereço no primeiro deploy. Se vier diferente, o painel não vai
conseguir falar com a API (o navegador barra por CORS), e o conserto é um
comando:

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
