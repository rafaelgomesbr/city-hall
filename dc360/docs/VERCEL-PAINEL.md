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

Desde a V2-F01-E09 isso não basta: o `[env]` do `fly.toml` declara
`DOMINIO_DO_AMBIENTE` (hoje `dc360-painel-web.vercel.app`), e a API recusa subir
quando `URL_PAINEL` ou `ORIGENS_PERMITIDAS` não ficam embaixo dele. Mudou o
endereço do painel, muda também `DOMINIO_DO_AMBIENTE` no `fly.toml` e o
`dominio` de PROD em `scripts/ambientes.json`, no mesmo deploy. Ver
`docs/AMBIENTES.md`.

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

(A emenda de 24/10/2026, abaixo, revoga este último parágrafo para o caso de
vários ambientes: o `vercel.json` vale para todo deployment do projeto, então
uma URL fixa nele impede que a homologação tenha a sua.)

## Emenda de 24/10/2026 (V2-F01-E10): uma URL de API por ambiente, e cabeçalhos de segurança

### O que mudou no `vercel.json`

Entraram, para todo caminho (`/(.*)`): `Strict-Transport-Security`
(`max-age=31536000`), `X-Content-Type-Options: nosniff` e
`Content-Security-Policy: frame-ancestors 'none'` (mais `X-Frame-Options: DENY`
para navegador antigo). O painel não precisa ser embutido em página de ninguém,
e `frame-ancestors` é o que impede um site de terceiros de pôr o painel dentro
de um quadro invisível para enganar o clique do coordenador. O HSTS não leva
`includeSubDomains` nem `preload` de propósito: isso só se liga depois que o
domínio próprio existir (CP-04) e todos os subdomínios servirem https.

Não entrou uma CSP completa (`default-src`, `script-src`): o painel carrega o
mapa e fontes de terceiros, e uma política escrita sem inventário quebraria a
tela em produção. Isso é assunto da F25.

### Tirar a URL de PROD do `vercel.json` (PENDENTE de confirmação humana)

Hoje o bloco `build.env` ainda fixa `VITE_API_URL=https://defesa-civil.fly.dev`.
Enquanto estiver lá, não existe painel de homologação: qualquer deployment do
projeto sairia falando com a API de produção. A URL de cada ambiente deve vir
da variável do projeto Vercel daquele ambiente. O repositório NÃO consegue
saber se a variável já existe em Production, e tirar o bloco sem ela derruba o
painel de PROD para o modo local (dados de exemplo, não é o produto). Por isso
a ordem é esta, e quem faz o passo 1 é o Rafael:

1. Vercel > projeto `dc360-painel-web` > Settings > Environment Variables:
   conferir se `VITE_API_URL` existe no ambiente **Production** com o valor
   `https://defesa-civil.fly.dev`. Se não existir, cadastrar. (Preview fica
   sem a variável até o projeto de HML existir, na E11; um preview sem ela
   sobe em modo local, o que é o lado seguro: nunca fala com PROD por engano.)
2. Em `dc360/vercel.json`, apagar `VITE_API_URL` de `build.env` (o bloco inteiro
   pode sair se `VITE_GOOGLE_MAPS_CHAVE` também estiver cadastrada no painel).
3. Em `dc360/scripts/vercel-json.test.mjs`, trocar
   `LITERAL_ENQUANTO_O_PAINEL_NAO_FOI_CONFERIDO` por `null` e atualizar o caso
   "estado de hoje" para afirmar `[]`. Dali em diante um `VITE_API_URL` literal
   no arquivo reprova em `npm run test:scripts`.
4. Publicar e rodar o `conferir-dominio` (abaixo) mais uma entrada no painel de
   PROD com login, para ver que continua no modo API.
5. Rollback: reverter o commit e reimplantar o deployment anterior (Deployments >
   Redeploy), ou cadastrar a variável que faltou.

### Conferir um ambiente: `conferir-dominio`

```bash
cd dc360
node scripts/conferir-dominio.mjs \
  --painel=dc360-painel-web.vercel.app \
  --api=defesa-civil.fly.dev \
  --negar=https://painel-de-outro-ambiente.exemplo
```

Confere, para o painel e a API do ambiente: TLS válido (cadeia confiável, nome
certo, mais de 14 dias de validade), `http` redirecionando para `https`, e HSTS
de pelo menos 180 dias. No painel, também `nosniff` e `frame-ancestors`. Na API,
o preflight CORS da origem do próprio painel tem de voltar com
`access-control-allow-origin` igual a ela (nunca `*`) e com credenciais, e o
preflight de uma origem inventada e de cada `--negar` tem de voltar SEM
`access-control-allow-origin`. Sai 0 quando tudo confere, 1 quando algo falha,
2 em uso errado. Só lê; não muda nada em lugar nenhum.

O cruzamento que importa, quando a homologação existir: rodar uma vez para HML
com `--negar` da origem do painel de PROD, e outra para PROD com `--negar` da
origem do painel de HML. Os dois têm de sair 0. Para isso a API de cada
ambiente precisa de `ORIGENS_PERMITIDAS` com a origem do painel DAQUELE
ambiente e nenhuma outra (segredo do Fly, não arquivo do repositório).

### O que continua dependendo do domínio próprio (CP-04)

Nomes (`painel`, `api`, `console`; `portal` e `cidadao` reservados), CNAMEs,
certificados do domínio, SPF, DKIM e DMARC (F15-E14), e o `og:url` e
`og:image` de `apps/web/index.html` (que `test/seo.test.ts` exige iguais ao
endereço do painel). Nada disso é feito antes da decisão; até lá o ambiente de
HML usa os endereços do provedor e o `conferir-dominio` vale sobre eles.

## Emenda de 24/10/2026 (V2-F01-E12): o painel sai de um ramo que só o workflow move

### O que mudou

Antes, a Vercel publicava o painel de PROD a cada push na `master`, sem esperar o
CI e sem esperar a API. Agora:

- `dc360/vercel.json` traz `git.deploymentEnabled.master = false`: a Vercel deixa
  de publicar a `master` (qualquer projeto ligado a este repositório). PR continua
  gerando preview.
- O painel de PROD sai do ramo **`producao`**, que só o workflow
  `promover-producao.yml` move, depois de a API e o console estarem no ar com a
  versão certa. O painel de HML sai do ramo **`homologacao`**, movido pelo
  `deploy-hml.yml` pelo mesmo motivo. Fluxo completo em
  `docs/runbooks/deploy.md` e `docs/IMPLANTACAO.md`, seção 10.

### O que o Rafael faz na Vercel (fora do repositório)

1. Projeto `dc360-painel-web`: Settings > Git > Production Branch trocar de
   `master` para `producao`. Enquanto não trocar, o painel de PROD não é
   publicado por commit nenhum (a `master` está desligada e o ramo `producao`
   ainda não é o de produção). É o lado seguro, mas é preciso trocar antes da
   primeira promoção.
2. Painel de HML: um segundo projeto sobre o mesmo repositório, Root Directory
   `dc360`, Production Branch `homologacao`, com a variável `VITE_API_URL` da API
   de HML no ambiente Production. **Só depois de fechar a exceção da E10** (seção
   acima): o `build.env` do `vercel.json` vale para os dois projetos e fixa a API
   de PROD, que sobrepõe a variável do projeto.
3. Conferir, no primeiro push de ramo feito pelo workflow, que a Vercel dispara o
   deploy (o push é feito com o token do próprio workflow, que não aciona outros
   workflows, mas aciona a integração da Vercel).

### Voltar atrás no painel

Promover de novo uma tag anterior pelo `promover-producao.yml` move o ramo
`producao` de volta, e a Vercel publica aquele commit. O *Instant Rollback* da
Vercel continua existindo (`docs/runbooks/rollback.md`, seção 2), mas depois dele
o domínio pode deixar de acompanhar o ramo até alguém promover à mão.
