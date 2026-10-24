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

Os arquivos de HML existem desde a E11 (`fly.hml.toml` e `fly.console.hml.toml`),
mas o ambiente de verdade, não: os apps do Fly, o banco, o bucket e o painel
dependem do CP-05 (e o domínio da E10). Por isso a identidade do banco e o
domínio de HML nos dois toml são MARCADORES (`a-definir-no-cp-05` e
`painel-hml.a-definir.invalid`) que nenhuma URL contém: a partida recusa até
alguém trocá-los (roteiro em `docs/IMPLANTACAO.md`, seção 9). `conferir-ambiente`
passa sem aviso, porque os arquivos existem e batem com a matriz.

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
| Postgres do `compose.yaml` | 17 com PostGIS 3.5 (`postgis/postgis:17-3.5@sha256:01a6a70e...`) | `compose.yaml` (`banco` e `papeis`) |
| Postgres do CI | 17 com PostGIS 3.5, a mesma imagem e o mesmo digest do `compose.yaml` | `.github/workflows/verificar.yml` (jobs `implantavel` e `imagens`; V2-F01-E08 e E21) |
| PostGIS | 3.5, na imagem acima | só nessa imagem: o PGlite não o traz, e a extensão em PROD e em HML é da V2-F01-E22 |
| PGlite | Postgres 16 em WebAssembly | testes de unidade e painel local |

A diferença de major entre o PGlite (16) e o 17.6 de PROD é um risco conhecido e
declarado em `docs/COLOCAR-DE-PE.md`. O CI e o `compose.yaml` já estão no major 17.

### PostGIS no CI e no ambiente local (V2-F01-E21)

- **Imagem por digest.** `postgis/postgis:17-3.5@sha256:01a6a70e...` (o digest
  inteiro está no `compose.yaml`) é o índice multiarquitetura da tag, conferido
  no registro em 2026-10-24. É imagem de comunidade: o digest fixo impede que uma
  tag movida entre sem revisão. Subir a versão é trocar tag e digest juntos no
  `compose.yaml` e nos jobs `implantavel` e `imagens`; o
  `scripts/smoke-das-imagens.test.mjs` reprova se os três divergirem.
- **O que roda onde.** A suíte comum (`npm test`) segue no PGlite e não precisa de
  Docker. Os testes `*.espacial.test.ts` (`db/test/`) só rodam em Postgres real
  com PostGIS, pela suíte `db/vitest.espacial.config.ts`, com `npm run test:espacial`.
- **No CI.** O job `implantavel` roda `test:espacial` com `DC360_EXIGE_POSTGIS=1`:
  faltar servidor, variável ou extensão reprova, e "pulado" também. É a prova de
  `ST_Contains`, `ST_DWithin` e de uma tabela com `geography` sob RLS forçada que
  não devolve a geometria de outro município.
- **Local.** Sem `DC360_POSTGRES_DE_PROVA`, o teste pula com aviso que diz como
  rodar. Para rodar de verdade: `docker compose up banco` e, em outro terminal,
  `DC360_POSTGRES_DE_PROVA=postgres://dc360_setup:senha-local-de-desenvolvimento@localhost:5432/dc360 npm run test:espacial`.
  O teste cria um banco e um papel descartáveis (`prova_e21_<sorteio>`) e os apaga.
- **Não faz.** Não cria migração com PostGIS nem modelo espacial (F32), e não
  habilita a extensão no provedor nem no HML (E22).

## 7. Criar um ambiente novo (HML: os arquivos são da E11, o ambiente é do CP-05)

1. Os `fly.hml.toml` e `fly.console.hml.toml` já trazem o `[env]` que a matriz
   manda para HML: `AMBIENTE_DC360 = "hml"`, `MARCA_DAGUA` preenchida e
   `PUSH_ATIVO` desligado. Trocar neles os dois marcadores (identidade do banco
   de HML e domínio do painel de HML) pelos valores reais.
2. Preencher em `scripts/ambientes.json`: `appsNoFly`, `identidadeDoBanco`,
   `bancoHost`, `bancoPorta` (que os roteiros `*-producao` leem) e `dominio` de
   HML, no mesmo commit da troca dos marcadores.
3. Gravar os segredos de HML, DISTINTOS dos de PROD (outra `DATABASE_URL`, outro
   `JWT_SEGREDO`, outra chave de armazenamento).
4. `node scripts/conferir-ambiente.mjs` (repositório) e depois
   `node scripts/conferir-ambiente.mjs --ambiente=hml --app=api` (segredos).
5. Subir. Se a partida recusar, a mensagem diz o que está incoerente.
6. Semear com `apps/api/src/semear-homologacao.ts` (senhas sorteadas), e NUNCA
   com `--semear` (ver a seção 11 e `docs/IMPLANTACAO.md`, seção 9).

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
- Não cria app, banco, bucket nem domínio de HML (CP-05 e E10). O aplicativo de
  campo não carrega `AMBIENTE_DC360`: o ambiente dele é o endereço da API
  compilado no binário e o identificador do aplicativo (seção 12).
- Não habilita o PostGIS em PROD nem em HML (E22); o do CI e do `compose.yaml` é da E21.

## 10. Rollback

Reverter o commit que trouxe o contrato e as linhas do `[env]` dos dois
`fly*.toml`. Sem as linhas e sem o código novo, a partida volta a se comportar
como antes. Reverter só as linhas do `[env]` sem reverter o código derruba a
partida (a variável é obrigatória em produção).

## 11. A semente de HML e a guarda do `--semear` (V2-F01-E11)

A semente de desenvolvimento (`db/seeds/desenvolvimento.sql`) dá a toda conta a
senha `defesa-civil-2026`, que está no repositório. Antes da E11, o `--semear` do
migrador só recusava com `NODE_ENV=production` no processo: com a `DATABASE_URL`
de PROD copiada para o terminal e essa variável ausente, ele semearia contas de
coordenador com senha pública na base dos municípios.

| Comando | Banco | Resultado |
| --- | --- | --- |
| `npm run migrar -- --semear` | sem `DATABASE_URL` (efêmero) ou na própria máquina | semeia (desenvolvimento) |
| `npm run migrar -- --semear` | `NODE_ENV=production`, `AMBIENTE_DC360` `prod` ou `hml`, identidade de PROD na URL, qualquer host que não seja a própria máquina ou serviço do Docker | RECUSA com código 1, ANTES de conectar e de migrar |
| `npx tsx src/semear-homologacao.ts` (em `apps/api`) | `AMBIENTE_DC360=hml`, identidade de HML na URL, banco sem município nenhum | semeia com senha sorteada por conta, impressa uma vez |
| o mesmo | qualquer outra combinação, ou banco com município real | RECUSA antes de escrever |

A guarda é fail-closed: URL que não dá para analisar recusa. A identidade de PROD
que ela protege (`db/src/guarda-da-semente.ts`) é a mesma de
`ambientes.prod.identidadeDoBanco`, e `db/test/guarda-da-semente.test.ts` reprova
se as duas divergirem. Se o projeto de banco de PROD mudar, mudar as duas.

## 12. O aplicativo de campo por ambiente (V2-F01-E13)

O binário do aplicativo carrega o seu ambiente de dois jeitos, e os dois vêm do
perfil de build do EAS (`apps/campo/eas.json`): o endereço da API (`DC360_API_URL`)
e o identificador do aplicativo (`app.config.ts`, que lê `EAS_BUILD_PROFILE`). Os
dois aplicativos instalam lado a lado no mesmo aparelho, porque o de HML tem outro
identificador, outro nome sob o ícone e outro esquema de link.

| Perfil | Identificador (iOS e Android) | Nome sob o ícone | Esquema | API | Distribuição | Canal |
| --- | --- | --- | --- | --- | --- | --- |
| `desenvolvimento` | `com.solerte.dc360.campo` | Defesa Civil 360 | `dc360` | `http://localhost:3333` | interna, com cliente de desenvolvimento | `desenvolvimento` |
| `homologacao` | `com.solerte.dc360.campo.hml` | DC360 HML | `dc360-hml` | `https://defesa-civil-hml.fly.dev` | interna (APK no Android) | `homologacao` |
| `producao` | `com.solerte.dc360.campo` | Defesa Civil 360 | `dc360` | `https://defesa-civil.fly.dev` | loja | `producao` |

- O identificador-base é UMA constante (`IDENTIFICADOR_BASE`, em `app.config.ts`).
  O valor `com.solerte.dc360.campo` é PROVISÓRIO: o definitivo, a conta Apple, a
  conta Google Play e a conta Expo dependem do CP-04. Ao trocá-lo, o HML acompanha
  sozinho (é a base mais `.hml`), mas é preciso trocar junto o `APNS_BUNDLE` de
  `fly.toml`, o App ID no portal da Apple e o cliente do Firebase.
- A URL de HML é `https://<app>.fly.dev` do `app` de `fly.hml.toml` (a mesma regra
  do endereço de PROD). O domínio próprio de HML ainda é marcador até o CP-05; a
  URL do perfil não inventa nenhum. Quando o CP-05 mudar o nome do app, mudam
  juntos `fly.hml.toml`, `ambientes.json` e `eas.json`, e o teste reprova se um
  ficar para trás.
- `APNS_BUNDLE` de `fly.hml.toml` é o bundle de HML (é o `apns-topic`) e
  `APNS_AMBIENTE` é `teste`: o build interno fala com a APNs de sandbox. O push
  continua desligado em HML (`PUSH_ATIVO=nao`) até F14-E05.
- Quem confere é `scripts/perfis-do-eas.test.mjs`, que roda o `app.config.ts`
  de verdade com cada perfil: bundle de HML diferente do de PROD, só `producao`
  com a URL de PROD, zero endereço de exemplo, `APNS_BUNDLE` igual ao bundle de
  HML.
- Antes do primeiro build de HML: criar o cliente Android
  `com.solerte.dc360.campo.hml` no Firebase e acrescentá-lo ao
  `google-services.json` (um arquivo com os dois clientes). Sem isso o Gradle para
  com "No matching client found for package name". A conta e o console são do
  dono (CP-04), então isto é pendência humana. Ver `apps/campo/LOJAS.md`.
