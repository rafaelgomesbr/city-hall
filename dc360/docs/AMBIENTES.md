# Ambientes: DEV, HML e PROD

Este documento é o contrato de ambiente do produto (V2-F01-E09). Ele diz o que
cada ambiente é, quais variáveis cada um precisa, o que a partida recusa e como
conferir tudo antes de um deploy. A matriz que ele descreve é
`scripts/ambientes.json`; quem a confere é `scripts/conferir-ambiente.mjs`.

## 1. Por que existe

Até a E09 a única coisa que distinguia um ambiente do outro era `NODE_ENV`, e
o piloto roda como `production`. Um HML também rodaria como `production`, e
nada impediria que a `DATABASE_URL` de PROD fosse colada nele. O app de
homologação subiria (a URL é válida, tem `verify-full`, a porta é 5432) e a
equipe passaria a "testar" em cima da base dos municípios, sem uma linha de log
dizendo isso. O contrato fecha esse caminho: cada processo declara onde está, e
a partida recusa o que não combina.

A trava é uma rede de proteção contra erro de configuração. Ela não é controle de
acesso e não substitui o isolamento entre municípios: a organização (o
município) nunca vem de configuração, vem sempre do token já verificado.

## 2. Os três ambientes

| Ambiente | O que é | Onde roda | Dados |
| --- | --- | --- | --- |
| `dev` | A máquina de quem desenvolve | Local, PGlite ou o Postgres do `compose.yaml` | Sintéticos, descartáveis |
| `hml` | Homologação: ensaia migration e funcionalidade antes de PROD | Apps próprios no Fly, banco próprio (V2-F01-E11, depende do CP-05) | Sintéticos; marca d'água ligada; e-mail só a domínios de teste |
| `prod` | Os municípios de verdade | `defesa-civil` e `defesa-civil-console` no Fly | Reais |

HML ainda não existe: os apps, o banco e o painel dele nascem na E11 (e o
domínio na E10). Até lá a coluna de HML da matriz é o contrato que a E11 vai
cumprir, e `conferir-ambiente` avisa (sem reprovar) que os `fly.hml.toml` e
`fly.console.hml.toml` ainda não existem.

## 3. As variáveis do contrato

Nenhuma delas é segredo. Em HML e PROD moram no `[env]` do `fly*.toml`, e a
matriz reprova se aparecerem nos segredos do Fly (um segredo vence o `[env]`, e a
linha versionada deixaria de valer sem ninguém ver).

| Variável | App | Valor | Regra |
| --- | --- | --- | --- |
| `AMBIENTE_DC360` | API e console | `dev`, `hml` ou `prod` | Obrigatória com `NODE_ENV=production`. Ausente fora de produção vale `dev`. `dev` com `NODE_ENV=production` é recusado, e `prod` exige `NODE_ENV=production` |
| `IDENTIDADE_DO_BANCO` | API | Uma palavra (no Supabase, a referência do projeto) | Obrigatória em `hml` e `prod`. O usuário ou o host da `DATABASE_URL` precisa conter essa palavra, comparada por segmento separado por ponto |
| `CONSOLE_IDENTIDADE_DO_BANCO` | Console | Idem | Idem, para a `CONSOLE_DATABASE_URL` |
| `DOMINIO_DO_AMBIENTE` | API | O nome inteiro do domínio do painel, como `dc360-painel-web.vercel.app` | Obrigatória em `hml` e `prod`. `URL_PAINEL` e cada item de `ORIGENS_PERMITIDAS` precisam ser esse host ou ficar embaixo dele |
| `EMAIL_DOMINIOS_DE_TESTE` | API | Domínios separados por vírgula | Só HML. Com `EMAIL_ATIVO=sim` em HML é obrigatória e o envio a qualquer outro domínio é recusado. Em PROD é proibida |

Valores de PROD hoje:

| Variável | Valor | De onde vem |
| --- | --- | --- |
| `AMBIENTE_DC360` | `prod` | `fly.toml` e `fly.console.toml` |
| `IDENTIDADE_DO_BANCO` e `CONSOLE_IDENTIDADE_DO_BANCO` | `bppklrxxwjshxvkvwirw` | Referência do projeto Supabase de PROD, a mesma que aparece nos usuários de `docs/IMPLANTACAO.md` |
| `DOMINIO_DO_AMBIENTE` | `dc360-painel-web.vercel.app` | O painel de PROD (`docs/VERCEL-PAINEL.md`) |

Quando o domínio próprio for comprado (CP-04), `DOMINIO_DO_AMBIENTE` muda no
`fly.toml` no MESMO deploy em que `URL_PAINEL` e `ORIGENS_PERMITIDAS` mudam nos
segredos, e `scripts/ambientes.json` muda junto.

### Domínio compartilhado não vale

`DOMINIO_DO_AMBIENTE` não pode ser um domínio que o provedor reparte com outros
clientes (`vercel.app`, `fly.dev`, `supabase.co` e parecidos, lista em
`apps/api/src/ambiente.ts`). Um sufixo que é de todo mundo não separa ambiente
nenhum: o painel de PROD também termina em `vercel.app`. O domínio de um
ambiente é o nome inteiro do projeto.

### O que o filtro de e-mail de HML faz

Com `EMAIL_DOMINIOS_DE_TESTE`, o envio (recuperação de senha e ofício) é
recusado ANTES de chamar o provedor quando o domínio do destinatário não está na
lista. A comparação é por igualdade exata: `teste.exemplo.com.br` não autoriza
`exemplo.com.br` nem um subdomínio dele. A recusa vira falha de envio (o ofício
grava a tentativa como `falha`), e a mensagem de erro diz só o domínio, nunca o
endereço inteiro.

## 4. O que a partida recusa

Todas as recusas derrubam a partida com uma frase em português que diz a causa.
Nenhuma repete a URL do banco, porque a senha está nela.

| Situação | Mensagem começa com | O que fazer |
| --- | --- | --- |
| Produção sem `AMBIENTE_DC360` | `AMBIENTE_DC360 é obrigatória com NODE_ENV=production` | Declarar `hml` ou `prod` no `[env]` |
| Valor que não é `dev`, `hml` ou `prod` | `AMBIENTE_DC360=... não é um ambiente conhecido` | Corrigir o texto (minúsculas, sem acento) |
| `dev` em produção | `AMBIENTE_DC360=dev não combina com NODE_ENV=production` | Usar `hml` ou `prod` |
| `prod` fora de produção | `AMBIENTE_DC360=prod exige NODE_ENV=production` | Ajustar `NODE_ENV` |
| Falta a identidade | `IDENTIDADE_DO_BANCO é obrigatória em HML` (ou PROD) | Declarar no `[env]` |
| Banco de outro ambiente | `A DATABASE_URL não é do banco de HML` (ou PROD) | O caso típico é a credencial de PROD colada em HML. Conferir o segredo com `fly secrets list` (só nomes) e regravar a URL certa |
| Falta o domínio | `DOMINIO_DO_AMBIENTE é obrigatório em HML` (ou PROD) | Declarar no `[env]` |
| Domínio mal formado ou compartilhado | `DOMINIO_DO_AMBIENTE precisa ser só o nome do domínio` ou `... reparte com outros clientes` | Usar o nome inteiro do projeto |
| Painel de outro ambiente | `URL_PAINEL (...) não é do domínio de HML` | Corrigir o segredo `URL_PAINEL` |
| Origem de outro ambiente | `ORIGENS_PERMITIDAS lista ..., que não é do domínio de HML` | Corrigir o segredo `ORIGENS_PERMITIDAS` |
| `MARCA_DAGUA` vazia em HML | `MARCA_DAGUA não pode estar vazia em HML` | Voltar a preencher (ou apagar a linha, e o padrão marca) |
| E-mail ligado em HML sem lista | `O envio de e-mail está ligado em HML sem EMAIL_DOMINIOS_DE_TESTE` | Listar os domínios de teste |
| Filtro de teste em PROD | `EMAIL_DOMINIOS_DE_TESTE não pode existir em PROD` | Apagar a variável do app de PROD |

As recusas de produção que já existiam (HTTPS, localhost, `verify-full`, porta
6543, armazenamento obrigatório e as demais) continuam valendo e vêm antes.

### Formato de `ORIGENS_PERMITIDAS` em produção

O `@fastify/cors` compara o texto do cabeçalho `Origin` com a lista, letra por
letra. O navegador manda `https://host`, em minúsculas, sem barra final e sem
caminho. Por isso a partida em produção recusa, em cada item da lista: curinga,
`http://`, barra final, caminho, consulta, usuário na URL, porta padrão escrita
(`:443`), host com maiúsculas, texto que não é URL e lista vazia. Uma entrada
assim nunca casaria, e o sintoma seria um painel que não fala com a API sem
nenhuma linha de erro no servidor.

Como cada item precisa ficar sob o `DOMINIO_DO_AMBIENTE` do seu ambiente, o
mesmo valor de `ORIGENS_PERMITIDAS` nunca é válido em HML e em PROD ao mesmo
tempo. A matriz garante a outra metade: os domínios de HML e PROD não podem ser
iguais nem um dentro do outro.

## 5. A matriz e o conferidor

`scripts/ambientes.json` lista, para cada variável de cada app, o estado em cada
ambiente (`obrigatoria`, `opcional` ou `proibida`), onde ela mora (`env` ou
`segredo`) e, para as não secretas, o valor fixo esperado. A matriz nunca guarda
segredo: a validação reprova valor fixo em variável de segredo.

### Conferir o repositório (sem rede, roda no CI)

```bash
cd dc360
node scripts/conferir-ambiente.mjs
```

Confere que a matriz é bem formada; cobre exatamente as variáveis que cada
`config.ts` lê; os `fly*.toml` declaram o que a matriz manda e nada que ela
proíbe (nem segredo); HML e PROD têm identidades e domínios diferentes; e as
versões batem (Node 22 em `.nvmrc`, `.node-version`, `engines` e Dockerfiles;
Postgres 17 no `compose.yaml`). O mesmo código roda como teste em
`scripts/conferir-ambiente.test.mjs`, dentro de `npm run test:scripts`.

### Conferir os segredos de um app no Fly (manual, precisa de login)

```bash
cd dc360
node scripts/conferir-ambiente.mjs --ambiente=prod --app=api
node scripts/conferir-ambiente.mjs --ambiente=prod --app=console
```

Roda `fly secrets list -a APP --json` e compara os NOMES com a coluna do
ambiente. Reprova: segredo obrigatório que falta (`FALTA`), segredo proibido
naquele ambiente (`SOBRA`; o caso típico é um segredo exclusivo de PROD aparecendo
no app de HML), nome que a matriz manda ficar no `[env]` e está nos segredos
(`LUGAR`) e nome que a matriz não conhece (`DESCONHECIDO`; num app de console, o
sinal de que um segredo da API foi parar nele). O roteiro imprime só nomes e
descarta valor e resumo antes de qualquer saída. Sem login, a saída já guardada
serve: `--lista=ARQUIVO`, ou `--lista=-` pela entrada padrão.

## 6. Versões

| O quê | Versão | Onde está declarado |
| --- | --- | --- |
| Node | 22 | `.nvmrc`, `.node-version`, `engines` (`>=22 <23`), `Dockerfile`, `Dockerfile.console`, CI |
| Postgres de PROD | 17.6 | Supabase |
| Postgres do `compose.yaml` | 17 (`postgis/postgis:17-3.5`) | `compose.yaml` |
| Postgres do CI | 16 | `.github/workflows/verificar.yml` (a troca é da V2-F01-E08) |
| PGlite | Postgres 16 em WebAssembly | testes de unidade e painel local |

A diferença entre as majors 16 e 17 do CI e do PGlite contra o 17.6 de PROD é um
risco conhecido e declarado em `docs/COLOCAR-DE-PE.md`.

## 7. Criar um ambiente novo (HML, na E11)

1. Criar o `fly.hml.toml` e o `fly.console.hml.toml` com o `[env]` que a matriz
   manda para HML: `AMBIENTE_DC360 = "hml"`, a identidade do banco de HML, o
   domínio do painel de HML, `MARCA_DAGUA` preenchida e `PUSH_ATIVO` desligado.
2. Preencher em `scripts/ambientes.json`: `arquivos` (já estão), `appsNoFly`,
   `identidadeDoBanco` e `dominio` de HML.
3. Gravar os segredos de HML, DISTINTOS dos de PROD (outra `DATABASE_URL`, outro
   `JWT_SEGREDO`, outra chave de armazenamento).
4. `node scripts/conferir-ambiente.mjs` (repositório) e depois
   `node scripts/conferir-ambiente.mjs --ambiente=hml --app=api` (segredos).
5. Subir. Se a partida recusar, a mensagem diz o que está incoerente.

## 8. Antes do primeiro deploy de PROD com estas variáveis

O deploy que traz o contrato torna `AMBIENTE_DC360` obrigatória, e as duas
linhas novas do `[env]` dependem de os segredos de hoje serem coerentes com elas.
Se não forem, o deploy novo NÃO sobe e o release anterior segue atendendo (o
Fly só troca o release quando o novo passa na verificação de saúde), mas é um
deploy perdido. Conferir antes, SEM imprimir a URL:

1. `node scripts/conferir-ambiente.mjs --ambiente=prod --app=api` e o mesmo com
   `--app=console`: os nomes dos segredos de PROD batem com a coluna de PROD.
2. A `DATABASE_URL` da API traz `bppklrxxwjshxvkvwirw` no usuário ou no host, e
   a `CONSOLE_DATABASE_URL` do console também.
3. `URL_PAINEL` e `ORIGENS_PERMITIDAS` são `https://dc360-painel-web.vercel.app`,
   sem barra final nem caminho.
4. O preflight de CORS do deploy novo lista `if-none-match` em
   `access-control-allow-headers` (o deploy anterior à V2-F00-E18 não lista), o
   que `node scripts/conferir-dominio.mjs` e o `curl` de `docs/VERCEL-PAINEL.md`
   mostram.

## 9. O que isto não cobre

- Não prova que o valor de um segredo é o certo: só o nome. Valor secreto só o
  Fly e quem o gravou conhecem.
- Não substitui o isolamento entre municípios nem o `exigirPermissao`: um
  ambiente certo com um token errado continua sendo coisa do token.
- Não cria app, banco, bucket nem domínio de HML (E11 e E10), nem perfil de
  build do aplicativo de campo (E13). O aplicativo de campo não carrega
  `AMBIENTE_DC360`: o ambiente dele é o endereço da API compilado no binário.
- Não troca o Postgres do CI (E08).

## 10. Rollback

Reverter o commit que trouxe o contrato e as linhas do `[env]` dos dois
`fly*.toml`. Sem as linhas e sem o código novo, a partida volta a se comportar
como antes. Reverter só as linhas do `[env]` sem reverter o código derruba a
partida (a variável é obrigatória em produção).
