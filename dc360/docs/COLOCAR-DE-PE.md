# Colocar o DC360 de pé: servidor, banco, domínio e o app iOS

Guia operacional, na ordem, com o que criar, quanto custa, quanto demora, e o
que é caminho crítico. Escrito para você seguir no Mac com prazo curto.

Data: 08/09/2026. Partes 6 e 7 acrescentadas em 09/09/2026, depois que o restore
do banco foi testado de verdade pela primeira vez.

---

## A verdade sobre o prazo, primeiro

**App na App Store pública até o fim de semana: não dá, e não é por causa do
código.** Os bloqueios são de terceiros e de tempo de espera:

- **Conta Apple Developer** custa US$ 99/ano. Conta de **organização** exige um
  número **D-U-N-S** da empresa, que leva de dias a semanas. Conta **pessoal**
  sai em horas a 1–2 dias, e é o caminho para o fim de semana.
- **Revisão da App Store** leva de 1 a 3 dias úteis, e o bundle atual
  (`com.solerte.dc360.campo`) provavelmente é **recusado** (ver item crítico abaixo).

**O que DÁ para ter no fim de semana, e é o que importa para testar de verdade:**

1. **Backend em produção real**: servidor, banco, domínio, HTTPS. Isso é
   inteiramente possível em um fim de semana.
2. **O app rodando no seu iPhone**, via simulador do Xcode (grátis, agora) e
   via TestFlight/build interno (com a conta paga, **sem** revisão de loja).

Ou seja: a meta realista do fim de semana é **o app instalado no seu iPhone,
falando com o servidor de produção**. A loja pública vem depois, quando o
D-U-N-S e a revisão não forem gargalo.

---

## Parte 1: o que já está pronto (não precisa mexer)

- Painel web (React + Vite), aplicativo de campo (Expo, **mesmo código para iOS
  e Android**), API (Fastify), banco (PostgreSQL; o PostGIS é a escolha da
  stack, mas nenhuma migração cria a extensão ainda, porque nada faz consulta
  espacial), esquemas Zod compartilhados.
- **6650 testes somando o aplicativo** (contagem estática de `npm run
  conferir:numeros` em 2026-10-20; a execução imprime pulos por ambiente à
  parte). Na árvore validada da F00 (`4b96ea7`) a linha de base conferiu todos
  os passos (17 de 17 com `--sem-instalar`); medida num Mac em 2026-10-14, deu
  15 de 17, por dois passos que dependem da máquina (README, "O roteiro da linha
  de base"). O `expo-doctor` deu 20 de 21 na manhã desse dia e 21 de 21 depois da
  correção 4 da E19, no mesmo dia; voltou a 20 de 21 em 2026-10-18 (`expo` e `expo-router`
  um patch atrás) e fechou em 21 de 21 com a correção 5 da E19, no mesmo dia. `npm run auditar` sai com
  código 0 pela política do CP-03: dependência de runtime em zero, e os avisos de ferramenta
  do aplicativo só os da lista nomeada, com dono e prazo
  (`scripts/auditar-excecoes.mjs`). O `npm audit` puro do aplicativo continua
  acusando avisos. O estado de cada etapa está em `docs/roadmap-v2/STATUS.md`,
  na raiz do repositório.
- **A API sobe contra PostgreSQL real** (provado contra o Postgres 18, à mão) e
  serve o ciclo inteiro: login, isolamento entre municípios, ocorrência,
  vistoria offline, laudo, termo de interdição e desinterdição, contagem de
  pessoas.
- O aplicativo está inteiro em código e passa nos testes. Há relato de uso em
  emulador Android (menu, minuta, login, GPS, câmera, o ciclo completo) e de
  compilação nativa e três vistorias coletadas num iPhone em 08/09/2026, mas
  **nenhum artefato de aparelho físico está arquivado** (a prova é a
  V2-F14-E12), e relato não é prova. Do emulador Android há capturas e relato
  das validações de E06, E15 e E16 (ver `apps/campo/LEIA-ME.md`), que não contam como
  aparelho. O que você vai fazer no Mac é refazer essa prova com o que o
  repositório consiga guardar.

---

## Parte 2: os 5 bloqueios do app iOS (resolver ANTES do primeiro build)

### CRÍTICO 1: trocar o bundle identifier `com.solerte.dc360.campo`

`gov.br` é namespace de governo. Um desenvolvedor privado publicando sob ele cai
na **política de personificação da Apple** (e da Google), e o bundle é
definitivo: depois de publicado, trocar significa **outro aplicativo**, sem
herdar nada. Troque **agora**, antes do primeiro build, em
`apps/campo/app.config.ts`:

```
ios.bundleIdentifier: "com.solerte.dc360.campo"   →   "com.SUAEMPRESA.dc360campo"
android.package:      "com.solerte.dc360.campo"   →   "com.SUAEMPRESA.dc360campo"
```

Use o CNPJ/marca sob o qual você vai vender. Isto depende de uma decisão sua
(nome da empresa).

### CRÍTICO 2: conta Apple Developer

- US$ 99/ano, em [developer.apple.com](https://developer.apple.com).
- Para o fim de semana: **conta pessoal** (verificação em horas a 1–2 dias).
- Organização (com a marca da empresa na App Store) exige D-U-N-S: peça já se
  for esse o caminho, mas não bloqueie o fim de semana por ela.

### CRÍTICO 3: projeto Expo (EAS)

O `app.config.ts` lê `EAS_PROJECT_ID` de variável, e a EAS **não define essa
variável no worker de build**. Rode uma vez, no Mac, e ele grava o ID:

```bash
cd apps/campo
npm i -g eas-cli
eas login
eas init          # cria o projeto no Expo e grava o projectId
```

### CRÍTICO 4: o endereço do servidor no build

Um binário aponta para um servidor fixo. `apps/campo/eas.json` tem três perfis:
`producao` aponta para `https://defesa-civil.fly.dev` (o servidor de hoje),
`homologacao` aponta para `https://api-homologacao.exemplo.gov.br`, que não
existe (não há ambiente de homologação de pé), e a base, usada pelo perfil de
desenvolvimento, aponta para `http://localhost:3333`. **Se o domínio próprio
sair** (Parte 3), troque o `DC360_API_URL` do perfil que você vai usar antes de
gerar o build; com o servidor de hoje, `producao` já serve.

### CRÍTICO 5: HTTPS é pré-requisito, não opção

O app declara `NSAllowsArbitraryLoads: false`: ele **só conecta em `https://`**.
Sem domínio com TLS válido, a tela de login gira e não explica. É por isso que o
servidor (Parte 3) vem antes do app.

---

## Parte 3: a infraestrutura, na ordem do caminho crítico

### 1. Domínio (primeiro de tudo, porque HTTPS e o app dependem dele)

- Registre em [registro.br](https://registro.br) (`.com.br`, ~R$ 40/ano) ou num
  registrador `.com`.
- Você vai usar três nomes, por exemplo: `api.seudominio.com.br` (API),
  `painel.seudominio.com.br` (painel web). O do app é o da API.

### 2. Banco: PostgreSQL gerenciado com backup automático

Não use Postgres numa VM que você administra: backup só existe depois de um
**restore testado**, e provedor gerenciado já dá a cópia automática e o PITR.

Cuidado com a palavra "já dá": o provedor guarda o arquivo, e só. Quem prova que
o arquivo volta é você. Esse restore foi feito e está registrado na **Parte 6**,
com os dois erros que ele encontrou pelo caminho.

- **Neon** (neon.tech) ou **Supabase**: os dois têm plano inicial grátis e
  Postgres real. Neon é o mais direto.
- Crie o banco `dc360`.
- **Modelo de três papéis** (o app depende disto; provado contra Postgres real):

  ```sql
  -- papel de SETUP: cria papéis e migra. O provedor gerenciado já te dá um
  -- papel administrativo com CREATEROLE e BYPASSRLS, use-o como setup.
  -- papel de APLICAÇÃO: é este que vai na DATABASE_URL da API.
  CREATE ROLE dc360_api LOGIN PASSWORD '...' NOSUPERUSER;
  -- depois de migrar (a migração 001 cria dc360_app):
  GRANT dc360_app TO dc360_api WITH SET TRUE;
  ```

  O `BYPASSRLS` no papel de setup não é luxo: as funções de login são
  `SECURITY DEFINER` e a autenticação é cross-tenant; sem ele, o login responde
  "credenciais inválidas" sem erro no log. Detalhe completo no README, seção
  Implantação.

- Aplique o esquema **com o papel de setup**:
  ```bash
  DATABASE_URL=postgres://SETUP:...@host/dc360 npm run migrar
  ```

  **Não use aqui a `DATABASE_URL` do `.env` da API.** Ela é a do papel de
  aplicação, que tem `USAGE` no schema e não tem `CREATE`, de propósito: se a
  API pudesse alterar esquema, uma falha nela viraria alteração de banco. Quem
  tentar vai receber `permission denied for schema public`, e desde 13/09/2026 o
  aplicador responde dizendo qual papel está sendo usado e que o certo é o de
  setup. No Supabase, o papel de setup é o usuário `postgres` da **conexão
  direta** (Project Settings, Database, Connection string, aba URI), e não a do
  pooler.

  A conexão exige TLS validado. O certificado da autoridade vem no repositório:

  ```bash
  CA="$(pwd)/db/provedores/supabase-prod-ca-2021.crt"
  DATABASE_URL="postgresql://postgres:SENHA@db.SEU-PROJETO.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=${CA}" \
    npm run migrar -- --conferir   # confere primeiro, não aplica nada
  ```

  **Migração 048 (V2-F00-E05, correção 1): sem ordem obrigatória.** Ela só
  acrescenta uma coluna de saída (`usuario_ativo`) a `dono_do_token`. O código
  novo lê essa coluna só quando ela existe: contra um banco sem a 048 a
  renovação de conta desativada continua respondendo `sessao_encerrada`, como
  antes, e nada quebra. Migre quando puder; a frase "conta desativada" ao
  voltar depois de 15 minutos só aparece com a 048 aplicada.

  **Ordem na atualização que traz a migração 047 (família da sessão, V2-F00-E07):
  migre ANTES de implantar o código novo.** O código novo chama `abrir_sessao`
  com a família e lê `sessoes.familia_id`; contra um banco sem a 047, todo login
  e toda renovação falhariam. O contrário é seguro: o código antigo contra o
  banco já migrado continua funcionando (a função nova aceita a chamada de seis
  argumentos). A migração é aditiva e rápida (uma coluna, um índice parcial e a
  troca de uma função); sessões abertas na hora ganham família própria, e no
  máximo um token de acesso antigo cai e o cliente renova.

  **Migrações 049 e 050 (V2-F00-E07): migre ANTES de implantar o código novo.**
  O código novo da API chama `travar_sessoes_do_usuario`, que a 049 cria, em
  todo login, em toda renovação e em todo encerramento em massa das sessões de
  uma pessoa (o login passou a tomá-la na correção 3 da E07); contra um banco
  sem a 049 o login e a renovação falham. O contrário é seguro: o código
  antigo contra o banco já migrado continua funcionando (as funções recriadas
  mantêm a assinatura). A 050 só recria
  `abrir_sessao` (o login passa a ler a suspensão do município com `FOR SHARE`),
  a API não muda por causa dela e a ordem é indiferente.

  **Migração 051 (V2-F00-E10, correção 3): ordem indiferente.** Cria o gatilho
  que marca como gastos os links de recuperação pendentes em toda mudança de
  senha e em toda desativação, e recria `consumir_recuperacao` (mesma
  assinatura) para conferir a conta ativa e segurar a linha da pessoa antes
  da linha do link. A API não muda por causa dela.

### 3. Servidor da API

PaaS que dá HTTPS automático e roda contêiner ou Node:

- **Fly.io**, **Railway** ou **Render**. O repositório tem `Dockerfile` e
  `compose.yaml`. O `Dockerfile` é a imagem de produção: o `fly.toml`
  (`[build] dockerfile`) manda o `fly deploy` construí-lo, o próprio `Dockerfile`
  registra o 503 dos botões de PDF que a imagem deu em produção (sem o pacote `playwright`, que estava em `devDependencies`; o Chromium estava lá), e
  o `eas.json` aponta o perfil `producao` para `defesa-civil.fly.dev`. O que não
  existe é prova da imagem fora do CI: o job `imagens` (V2-F01-E08) a constrói em
  todo pull request e a sobe contra um Postgres 17 real (o `implantavel` sobe a
  API direto no Node, sem contêiner), mas nenhuma rodada foi conferida por uma
  pessoa. O `compose.yaml` nunca foi executado. O rollback está em
  `docs/runbooks/rollback.md`.
  As três são equivalentes para rodar o contêiner, mas **não** para o endereço
  de origem: o `fly.toml` do repositório declara `PROXY_DE_BORDA = "fly"`, e
  levar essa linha para outra PaaS transforma o cabeçalho `Fly-Client-IP` num
  campo que o cliente preenche sozinho. Em Railway ou Render, deixe
  `PROXY_DE_BORDA` em `nenhum` (o padrão) e o endereço passa a vir do salto
  imediato, que é o edge da própria PaaS.
- Variáveis de ambiente obrigatórias em produção (o processo **recusa subir**
  sem elas, e isso é de propósito):

  | Variável | O que é |
  | --- | --- |
  | `NODE_ENV` | `production` |
  | `HOST` | `0.0.0.0` (senão a porta publicada não atende) |
  | `DATABASE_URL` | do papel de **aplicação** (`dc360_api`), nunca o de setup, e ela **precisa terminar em `?sslmode=verify-full`**. A URL que o painel do provedor oferece não traz esse parâmetro, e sem ele a conexão com o banco sobe cifrada e **não autenticada**: quem estiver entre a API e o banco lê e reescreve a base de todos os municípios, e o SCRAM não acusa nada, porque o intermediário só retransmite o desafio e a resposta. A âncora de confiança já vem versionada no repositório, então o parâmetro funciona sem mais nenhuma configuração, e desde 09/09/2026 a partida em produção **recusa subir** sem ele. Exemplo: `postgres://dc360_api:SENHA@HOST:5432/postgres?sslmode=verify-full` |
  | `JWT_SEGREDO` | ≥ 32 bytes aleatórios (`openssl rand -base64 48`). Aceita **lista separada por vírgula**: o primeiro assina, todos são aceitos. É assim que se troca o segredo sem derrubar o plantão. Rode `node scripts/rotacionar-segredo.mjs` para a linha pronta, e leia o cabeçalho dele antes: rotação e revogação são procedimentos OPOSTOS que usam a mesma variável |
  | `URL_PUBLICA` | `https://api.seudominio.com.br` |
  | `URL_PAINEL` | `https://painel.seudominio.com.br` |
  | `ORIGENS_PERMITIDAS` | `https://painel.seudominio.com.br` (sem curinga) |
  | `PROXY_DE_BORDA` | `fly` **só no Fly.io**; `nenhum` (o padrão) em Railway, Render ou atrás de proxy próprio. É a declaração de quem este processo aceita como fonte do endereço de origem. Com `fly`, o servidor lê o cabeçalho `Fly-Client-IP`, que o edge do Fly reescreve; em qualquer outro lugar esse cabeçalho é só um texto que o próprio cliente escolhe, e aceitá-lo entrega ao atacante o teto de tentativas de login **e** o endereço que fica gravado na trilha como autor da exportação da base de cidadãos |
  | `S3_ENDPOINT` `S3_BALDE` `S3_CHAVE_ID` `S3_CHAVE_SECRETA` | armazenamento (item 4) |
  | `RECUPERACAO_ATIVA` | `nao` no piloto, ou `sim` + `EMAIL_ATIVO=sim` + `NOTIFICADOR_URL`/`_CHAVE`/`EMAIL_REMETENTE` (item 5, e `docs/LIGAR-O-EMAIL.md`) |
  | `SEGUNDO_FATOR_ATIVO` | `nao` por padrão. Com `sim`, o **administrador do município** passa a precisar do código de seis dígitos do aplicativo de autenticação para entrar, e os demais papéis podem ligar se quiserem. Ligar exige a variável abaixo, em qualquer ambiente: sem ela o processo não sobe |
  | `SEGUNDO_FATOR_CHAVE` | 32 bytes em base64 (`openssl rand -base64 32`). É a chave que CIFRA o segredo da segunda etapa dentro do banco, e ela fica fora do banco de propósito: é o que faz um vazamento de banco não levar o segundo fator junto. **Trocar esta chave invalida os segredos já guardados** (não há lista de chaves aceitas como no `JWT_SEGREDO`, e não pode haver: seria uma lista de chaves que ainda abrem o segredo). Depois de trocar, todo mundo refaz a ativação, e quem já estava dentro entra pelos códigos de recuperação |
  | `MAPS_KEY` | a chave de navegador do Google Maps deste município, ou vazia. Vazia (o padrão) o painel desenha o plano esquemático: as mesmas coordenadas, em escala, sem camada de ruas e **sem nenhum contato com o Google**, que é o modo prometido na seção 2.2 de `docs/SUBPROCESSADORES.md` ao município que recusar o envio. Ela mora AQUI, no servidor do município, e não no build do painel, porque o painel é um build só servindo todos: a chave assada lá seria a do fornecedor pagando o mapa de todas as prefeituras, e o Google cobra por carregamento. **Não é segredo** (ela viaja no JavaScript da página de qualquer jeito): quem protege a conta é a **restrição por referenciador HTTP** no console do Google Cloud, onde precisa constar o endereço do painel (`https://painel.seudominio.com.br/*`). Sem essa restrição, qualquer site gasta a cota. No mesmo console: faturamento ativo e a API "Maps JavaScript" habilitada. As três faltas dão o mesmo sintoma, e o painel o explica na tela em vez de ficar cinza |

  Tudo em `https://`, e a config recusa `http` e `localhost` em produção.

- Variáveis **opcionais** da versão da API (V2-F02-E06 e E08; a regra completa
  está em `docs/POLITICA-DE-VERSOES-DA-API.md`). Nenhuma é necessária para
  subir, e os padrões não recusam nenhum aplicativo:

  | Variável | O que é |
  | --- | --- |
  | `VERSAO_MINIMA_CAMPO` | `maior.menor.correção` (`1.3.0`). Vazia (o padrão) não há mínimo. Com valor, o aplicativo de campo abaixo dele recebe `426` em `/v1`, antes de autenticar. Valor fora do formato **impede a partida**. Esvaziar desliga a recusa, sem novo deploy de código |
  | `VERSAO_MINIMA_CIDADAO` | o mesmo, para o aplicativo do cidadão |
  | `ESPELHO_LEGADO_ATE` | `AAAA-MM-DD`, vai no cabeçalho `Sunset` do caminho sem prefixo. O padrão (`2027-12-31`) é **provisório**. Data inválida ou vazia impede a partida |
  | `ESPELHO_LEGADO_ENCERRADO` | `nao` (o padrão). `sim` só pela V2-F28-E11, depois da data decidida e do aviso: o caminho sem prefixo passa a responder `426` depois do fim do dia de `ESPELHO_LEGADO_ATE`. Com `sim`, `ESPELHO_LEGADO_ATE` precisa estar escrita no ambiente, ou a partida é recusada |

### 4. Armazenamento de fotos e assinaturas

Sem isto, a foto da vistoria não sobe.

- **Cloudflare R2** (barato, compatível com S3) ou **AWS S3**.
- Crie um balde, gere as chaves, preencha os `S3_*` acima. Configure o CORS do
  balde para aceitar o painel.

### 5. Email para recuperação de senha

- **No piloto, o mais simples é `RECUPERACAO_ATIVA=nao`**: a tela manda procurar
  a coordenação, que redefine a senha por dentro. Zero dependência.
- Para ligar o email de verdade (recuperação de senha **e** ofício por email), o
  passo a passo completo está em **`docs/LIGAR-O-EMAIL.md`**: qual conta criar,
  o que verificar de domínio, quais variáveis preencher e em que ordem, e como
  conferir que funcionou. O provedor escolhido é o **Resend**, e as variáveis
  são `NOTIFICADOR_URL`, `NOTIFICADOR_CHAVE`, `EMAIL_REMETENTE` e
  `EMAIL_ATIVO=sim`, nesta ordem.
- O fluxo completo de "esqueci a senha" já está pronto e provado com o notificador
  de teste (V2-F00-E10); o que falta para ligar em produção é só a conta e o
  domínio (CP-19). `vercel.json` serve as duas telas de recuperação com
  `Referrer-Policy: no-referrer` e `noindex`, e SÓ elas: `no-referrer` no painel
  inteiro quebraria a chave do Google Maps restrita por referenciador.

### 6. Painel web (opcional para o app, necessário para o coordenador)

- Deploy estático em **Vercel**, **Netlify** ou **Cloudflare Pages**.
- Build com `VITE_API_URL=https://api.seudominio.com.br`.

### 7. O primeiro município

```bash
DATABASE_URL=postgres://SETUP:...@host/dc360 npm run provisionar --   --municipio "Nome" --uf UF   --nome "Coordenador" --matricula C-1 --email coord@municipio.gov.br   --operador "Seu nome, operação da plataforma"
```

Anote a senha impressa: ela não é guardada em texto claro e não aparece de novo.
Na primeira entrada, o coordenador troca a senha em **Minha conta**.

Desde 14/09/2026 existe um segundo caminho para este mesmo ato, e ele é o
preferido: a tela de cadastro do **console do fornecedor** (item 8). Ela faz o
mesmo, dentro de uma função do banco, **sem** a credencial de dono na mão de
ninguém. A linha de comando acima continua valendo como saída de emergência.

### 8. Console do fornecedor (não é do município)

Nada nesta seção é entregue à prefeitura. O console da ADR 0008 é a ferramenta
do **fornecedor**: ele responde "o município está usando?", "alguém está com
problema?" e "quantos contratos existem", e é ele que cadastra a prefeitura. Ele
existe para essas perguntas saírem do `psql` em produção, que é a credencial de
dono do banco, aquela que ignora RLS.

O que ele **não** responde, de propósito e para sempre: "o que houve na
ocorrência 000123". Ele lê métrica agregada e o cadastro de organizações, e o
papel de banco dele não tem privilégio em tabela de negócio nenhuma. Para a
pergunta específica existe telefone com quem administra o município.

- **Aplicativo próprio no Fly**, separado da API (`Dockerfile.console` e
  `fly.console.toml`, os dois em `dc360/`). Não é rota do painel e não é um
  segundo processo dentro da imagem da API: dois processos no mesmo aplicativo
  compartilhariam a mesma lista de segredos, e a separação viraria convenção.
- **Segundo fator obrigatório**, sem exceção. A conta do fornecedor é a única do
  sistema cujo comprometimento alcança mais de um município.
- **O passo de banco que não existe em nenhum outro roteiro:** `dc360_console`
  foi criado `NOLOGIN` na migração 023, então ele não serve de usuário de
  conexão. A `CONSOLE_DATABASE_URL` aponta para outro papel, com LOGIN, membro
  dele, no mesmo desenho de `dc360_api` para `dc360_app`:

  ```sql
  CREATE ROLE dc360_console_login LOGIN PASSWORD '...' NOSUPERUSER;
  GRANT dc360_console TO dc360_console_login WITH SET TRUE;
  ```

  O `WITH SET TRUE` não é enfeite: toda transação do console emite
  `SET LOCAL ROLE dc360_console`, e sem ele **toda** consulta falha.
- **Os segredos entram por arquivo, nunca por linha de comando.**
  `fly secrets set CONSOLE_OPERADORES="..."` com aspas duplas faz o shell
  expandir `$131072`, `$8` e `$1` do hash de senha para vazio antes de o `fly`
  receber qualquer coisa. O JSON continua válido, o processo sobe normal, e a
  senha certa é recusada para sempre, sem uma linha de log. Use
  `fly secrets import < arquivo`. Desde 15/09/2026 a partida também recusa hash
  fora do formato, então o deploy errado falha em vez de subir quebrado.
- **Uma máquina só** (`fly deploy --ha=false`), por economia, e não mais por segurança: desde a migração 038 o teto de
  tentativas do segundo fator e o passo do TOTP já usado vivem na linha do operador em `console_operadores`
  (`apps/console/src/operadores.ts`), então duas máquinas contam as mesmas cinco tentativas. Antes da 038 viviam na memória do processo.

**O passo a passo completo, com os comandos na ordem, está em
`docs/IMPLANTACAO.md`, seção 6**, junto com o que fica declarado como não
coberto (o `/saude` do console não confere o banco, e o limite por endereço
conta todos os operadores juntos atrás do balanceador do Fly).

---

## Parte 4: no Mac, na ordem

```bash
# 1. Clonar e conferir que tudo passa no Mac
git clone <repo> && cd dc360
npm ci
npm run verificar          # typecheck, lint, formatação, 6650 testes com o aplicativo, auditar, números

# 2. Ver o app no simulador iOS (precisa do Xcode instalado)
cd apps/campo
npx expo run:ios           # compila e abre no simulador iPhone

# 3. (depois da Parte 2 e 3 prontas) build para o seu iPhone
eas login
eas init                   # grava o EAS_PROJECT_ID
eas build --platform ios --profile desenvolvimento   # dev client, sem revisão
#   ou, para instalar via TestFlight:
eas build --platform ios --profile producao
eas submit --platform ios --latest
```

Para o `eas submit`, preencha `apps/campo/eas.json` em `submit.producao.ios`
(`appleId`, `ascAppId`, `appleTeamId`), hoje com `PREENCHER`.

---

## Parte 5: o que só você decide (destrava o resto)

1. **Nome/CNPJ da empresa**: define o bundle identifier e a conta Apple.
2. **Conta Apple: pessoal ou organização**, sendo pessoal a do fim de semana.
3. **Provedores**: Neon (banco), Fly/Railway (API), R2 (fotos), registro.br
   (domínio). Todos têm plano inicial barato ou grátis.
4. **Recuperação de senha**: desligada no piloto (recomendado) ou com provedor.
5. **Uma decisão de produto pendente:** fechar a tomada de conta entre pares de
   mesmo posto (hoje um administrador pode gerir outro administrador; a
   proposta é notificar o e-mail antigo ou exigir reautenticação). O outro item
   que estava aqui, o PDF na imagem do servidor, foi decidido em 09/09/2026: o
   gerador entra na imagem (ver o comentário no topo do `Dockerfile`).

---

## Custo mensal estimado do piloto (um município)

| Item | Provedor exemplo | Custo |
| --- | --- | --- |
| Domínio | registro.br | ~R$ 40/ano |
| Banco | Neon (free tier) | R$ 0 no início |
| API | Fly.io / Railway | ~US$ 5/mês |
| Armazenamento | Cloudflare R2 | centavos no volume do piloto |
| Painel | Vercel/Cloudflare Pages | R$ 0 |
| Apple Developer | Apple | US$ 99/ano |

O gargalo de dinheiro não é a infraestrutura; é a conta Apple. O gargalo de
tempo é o D-U-N-S (se organização) e a revisão da loja, e nenhum dos dois bloqueia
ter o app no seu iPhone via TestFlight neste fim de semana.

---

## Parte 6: o restore do banco, testado de verdade (CA-08)

> **Registro histórico, de 2026-09-09.** O roteiro vigente é
> `RESTORE-DO-BANCO.md` (V2-F00-E25; versão 2, de 2026-10-15), provado com as 47
> migrações que existiam no Windows em 2026-10-07 e com as 50 de hoje no macOS
> em 2026-10-15 (o CI repete o roteiro em Postgres 17, ver o próprio
> documento), com o papel `dc360_console`, a extensão `pg_trgm` e a API apontada para a
> cópia. Esta parte descreve o teste com 15 migrações e 15 tabelas e, se
> seguida hoje, para no restore: faltam o papel `dc360_console` (migração 023)
> e a extensão `pg_trgm` no dump (migração 041). Ela continua valendo pelo que
> ensina sobre a origem Supabase (papéis do provedor e `sslmode`).
>
> **Para tirar a cópia de hoje, não use os comandos desta parte.** O caminho é
> `node scripts/copiar-producao.mjs --ambiente prod` (V2-F01-E15): ele funciona
> em Windows, Linux e macOS, passa `--extension=pg_trgm`, lê a senha da variável
> `DC360_SENHA_BANCO_PROD`, do chaveiro ou de uma pergunta sem eco (nunca da
> linha de comando) e grava em `~/dc360-copias/prod/` só para o seu usuário. Ver
> `docs/IMPLANTACAO.md`, seção 8.

O levantamento técnico fixa que **backup só existe depois de um restore
testado**. Até agora isso nunca tinha sido feito neste projeto: existia a
promessa do provedor, e mais nada. Esta seção é o registro do teste, com o
comando exato, o tempo medido e o resultado colado.

**Feito em:** 09/09/2026, no Mac (Darwin arm64).
**Origem:** PostgreSQL 17.6 no Supabase, pelo pooler `aws-0-sa-east-1`, com o
papel de **setup** (usado somente para ler).
**Destino:** um cluster PostgreSQL **17.6 de verdade**, criado com `initdb` na
própria máquina e apagado no fim. Não foi PGlite de propósito: o PGlite é
Postgres 16 e não tem os papéis do provedor, então restaurar nele provaria
menos do que este teste precisa provar.

### Antes de tudo: onde o dump pode morar

O dump traz **dado real de cidadão**: `ocorrencias` guarda `endereco`,
`latitude`, `longitude`, `solicitante_nome` e `solicitante_contato`. Ele nunca
entra no repositório, nunca sobe para nuvem de arquivos e nunca fica na Área de
Trabalho. Neste teste ele ficou em pasta temporária fora do repositório e foi
apagado ao fim (a confirmação está no fim desta seção).

### Passo 0: ter um `pg_dump` da mesma versão do servidor

`pg_dump` precisa ser igual ou mais novo que o servidor. O servidor é 17.6,
então o cliente tem que ser 17.x. Neste Mac não havia cliente nenhum instalado
(nem `psql`, nem `pg_dump`, nem Homebrew), e esse é o primeiro obstáculo real de
um dia de incidente:

```bash
brew install libpq                       # traz pg_dump, pg_restore e psql
export PATH="$(brew --prefix libpq)/bin:$PATH"
pg_dump --version                        # tem que responder 17.x
```

Honestidade sobre o teste: como a máquina não tinha Homebrew, os binários 17.6
foram baixados avulsos só para a verificação. O caminho acima é o que vale para
o dia a dia, e ele precisa estar resolvido **antes** do incidente, não durante.

### Passo 1: o dump

A URL de setup está comentada em `apps/api/.env`, na linha `DATABASE_URL_SETUP`.
Ela termina em `sslmode=no-verify`, que é sintaxe da biblioteca do Node: **o
libpq não entende esse valor** e o `pg_dump` morre antes de conectar, reclamando
de um `~/.postgresql/root.crt` que não existe. Troque por `sslmode=require` na
linha de comando, sem editar o `.env`:

```bash
cd dc360
DESTINO=/caminho/fora/do/repositorio            # nunca dentro do repo
URL="$(grep -o 'postgresql://postgres\.[^ ]*' apps/api/.env)"
URL="${URL%%\?*}?sslmode=require"

pg_dump --format=custom --schema=public --file="$DESTINO/dc360.dump" "$URL"
```

`--schema=public` porque o produto inteiro mora nele: os outros esquemas do
projeto (`auth`, `storage`, `realtime`, `vault`, `graphql`) são infraestrutura do
provedor. Isso tem uma consequência séria, e ela está na lista do que **não** foi
provado, mais abaixo.

**Medido:** 6,2 segundos, arquivo de 101.040 bytes (99 KiB). O tempo é quase todo
ida e volta de rede até sa-east-1, não trabalho do banco. Um banco de piloto com
um município cabe em menos de 100 KiB comprimidos.

### Passo 2: o destino descartável, e os dois erros que ninguém espera

Aqui o teste ganhou seu valor: o `pg_restore` **falhou duas vezes** antes de
passar, e nas duas o motivo só aparece na hora de restaurar. Um backup nunca
restaurado é um backup que ainda vai dar esses dois erros no pior dia possível.

1. `ERROR: schema "public" already exists`. O dump traz o `CREATE SCHEMA public`
   (o `public` do Supabase pertence a `pg_database_owner`, então ele é dumpado).
   Solução: criar o banco a partir de `template0` e derrubar o `public` de
   fábrica antes de restaurar.
2. `ERROR: role "supabase_admin" does not exist`. O dump carrega
   `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`, além de GRANTs para
   `anon`, `authenticated` e `service_role`. São nomes de papel do provedor, e o
   dump não cria papel nenhum. Solução: criar os nomes antes, vazios.

Com os dois já resolvidos, o destino se monta assim:

```bash
initdb -D "$DESTINO/pgdata" -U postgres -A trust --encoding=UTF8 --locale=C
pg_ctl -D "$DESTINO/pgdata" -l "$DESTINO/pg.log" \
       -o "-p 55432 -c listen_addresses=127.0.0.1" -w start

ALVO="postgresql://postgres@127.0.0.1:55432"

# Papéis: os do produto e os do provedor. Sem eles o restore para no meio.
psql "$ALVO/postgres" -v ON_ERROR_STOP=1 -c "
  CREATE ROLE dc360_app NOLOGIN;
  CREATE ROLE dc360_api LOGIN PASSWORD 'trocar' NOSUPERUSER;
  GRANT dc360_app TO dc360_api WITH SET TRUE;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE ROLE supabase_admin NOLOGIN;"

createdb -h 127.0.0.1 -p 55432 -U postgres -T template0 \
         --encoding=UTF8 --locale=C dc360_restaurado
psql "$ALVO/dc360_restaurado" -c "DROP SCHEMA public CASCADE;"
```

### Passo 3: o restore

```bash
pg_restore --dbname="$ALVO/dc360_restaurado" --exit-on-error "$DESTINO/dc360.dump"
```

`--exit-on-error` não é detalhe: sem ele o `pg_restore` **segue depois do erro** e
termina com aparência de sucesso, deixando um banco pela metade. Foi assim que os
dois erros acima quase passaram despercebidos.

**Medido:** 0,4 segundo, sem nenhum erro.

### Passo 4: conferir, que é a parte que prova alguma coisa

Restaurar sem conferir é achismo. São três conferências, e as três passaram.

As duas primeiras se refazem rodando o mesmo arquivo nos dois bancos, e comparando
a saída com `diff`:

```bash
# 1. linhas por tabela (gera o SELECT a partir do catálogo, então nenhuma tabela
#    nova passa despercebida no dia em que alguém esquecer de atualizar a lista)
cat > /tmp/contar.sql <<'SQL'
SELECT c.relname, (xpath('/row/c/text()',
         query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                      false, true, '')))[1]::text::bigint AS linhas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY 1;
SQL

# 2. estrutura
cat > /tmp/estrutura.sql <<'SQL'
SELECT 'tabelas', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
UNION ALL SELECT 'rls_habilitada', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
UNION ALL SELECT 'rls_forcada', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity
UNION ALL SELECT 'policies', count(*)::text FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'funcoes', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
UNION ALL SELECT 'indices', count(*)::text FROM pg_indexes WHERE schemaname='public'
UNION ALL SELECT 'constraints', count(*)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
UNION ALL SELECT 'grants_dc360_app', count(*)::text FROM information_schema.role_table_grants WHERE grantee='dc360_app' AND table_schema='public'
UNION ALL SELECT 'ultima_migracao', max(versao) FROM schema_migracoes
UNION ALL SELECT 'impressao_migracoes', md5(string_agg(versao||':'||impressao, ',' ORDER BY versao)) FROM schema_migracoes
ORDER BY 1;
SQL

for arquivo in /tmp/contar.sql /tmp/estrutura.sql; do
  psql "$URL" -At -F'|' -f "$arquivo" > /tmp/origem.txt
  psql "$ALVO/dc360_restaurado" -At -F'|' -f "$arquivo" > /tmp/destino.txt
  diff /tmp/origem.txt /tmp/destino.txt && echo "$arquivo: idêntico"
done
```

**Linhas por tabela, origem contra destino** (a mesma consulta rodada nos dois):

| Tabela | Produção | Restaurado | |
| --- | ---: | ---: | --- |
| equipes | 1 | 1 | igual |
| evidencias | 7 | 7 | igual |
| exportacoes | 0 | 0 | igual |
| interesse_municipio | 0 | 0 | igual |
| ocorrencias | 5 | 5 | igual |
| organizacoes | 1 | 1 | igual |
| protocolo_sequencias | 1 | 1 | igual |
| providencias | 1 | 1 | igual |
| recuperacoes_senha | 1 | 1 | igual |
| schema_migracoes | 15 | 15 | igual |
| sessoes | 19 | 19 | igual |
| trilha_administrativa | 2 | 2 | igual |
| trilha_eventos | 22 | 22 | igual |
| usuarios | 2 | 2 | igual |
| vistorias | 3 | 3 | igual |
| **total** | **80** | **80** | igual |

**Estrutura, origem contra destino:**

| Conferência | Produção | Restaurado | |
| --- | ---: | ---: | --- |
| tabelas em `public` | 15 | 15 | igual |
| RLS habilitada | 15 | 15 | igual |
| RLS forçada | 14 | 14 | igual |
| policies | 18 | 18 | igual |
| funções | 14 | 14 | igual |
| índices | 53 | 53 | igual |
| constraints | 97 | 97 | igual |
| grants do papel `dc360_app` | 38 | 38 | igual |
| última migração | 015_pessoas_atingidas.sql | 015_pessoas_atingidas.sql | igual |
| md5 das impressões de migração | b446363ca68b430a7ab01e380eaa0a17 | b446363ca68b430a7ab01e380eaa0a17 | igual |

RLS forçada em 14 de 15 é o estado correto, não uma falha do restore: a tabela de
fora é `schema_migracoes`, que é catálogo do próprio esquema e não tabela de
negócio. O número é idêntico nos dois lados.

**Comportamento, no banco restaurado** (contar linha não prova que o isolamento
sobreviveu; isto prova):

```bash
ORG=$(psql "$ALVO/dc360_restaurado" -At -c "SELECT id FROM organizacoes LIMIT 1")
psql "postgresql://dc360_api@127.0.0.1:55432/dc360_restaurado" -At -F'|' <<SQL
SET ROLE dc360_app;
BEGIN;
SELECT set_config('app.organizacao_atual', '$ORG', true);
SELECT 'municipio certo, ocorrencias visiveis', count(*) FROM ocorrencias;
SELECT set_config('app.organizacao_atual', '00000000-0000-0000-0000-000000000000', true);
SELECT 'municipio errado, ocorrencias visiveis', count(*) FROM ocorrencias;
COMMIT;
SELECT count(*) FROM interesse_municipio;   -- tem que dar permission denied
SQL
```

Saída obtida (só as linhas que interessam, sem os `SET` e `BEGIN` que o psql
ecoa):

```
municipio certo, ocorrencias visiveis|5
municipio errado, ocorrencias visiveis|0
ERROR:  permission denied for table interesse_municipio
```

Ou seja: no banco restaurado, o papel de aplicação continua vendo só o município
do `SET LOCAL`, e continua **sem** conseguir ler a fila de interesse. A regra
número um do produto e a decisão da migração 011 atravessaram o backup inteiras.

### Passo 5: apagar o dump

```bash
rm -f "$DESTINO/dc360.dump"
```

Feito neste teste, junto com o cluster descartável inteiro. Conferido depois com
`ls`: nenhum arquivo de dump restou na máquina.

### Tempo total

Menos de 10 segundos de comando (6,2 s de dump e 0,4 s de restore). O tempo
humano é todo na preparação: ter o cliente 17.x instalado e criar os papéis. Num
incidente de verdade, quem não tiver o Passo 0 resolvido antes vai gastar a
primeira meia hora instalando `pg_dump`.

### O que este teste NÃO provou (leia antes de dormir tranquilo)

- **As fotos não estão no dump.** As evidências ficam no balde
  `dc360-evidencias` do Storage do Supabase (hoje 7 objetos, cerca de 6,8 MB), e
  `--schema=public` não leva nem os arquivos nem os metadados de
  `storage.objects`. Restaurar só o banco devolve as linhas de `evidencias` com
  `chave_storage` apontando para arquivo que pode não existir mais. A cópia do
  balde é um segundo procedimento, ainda **não escrito e não testado**. Quando
  for feito, a conferência natural é o `sha256` que já está gravado em cada linha
  de `evidencias`.
- **Recuperação a um ponto no tempo (PITR) pelo painel do Supabase.** É recurso
  do provedor, depende do plano contratado, e não foi testado aqui. Também não
  foi conferido se o backup automático do provedor está ligado nem qual é a
  retenção: isso se olha no painel do projeto, e precisa ser olhado.
- **Restaurar por cima da produção.** O que foi provado é restaurar em banco
  novo. Sobrescrever a produção é destrutivo e não foi ensaiado.
- **Os esquemas do provedor** (`auth`, `storage`, `realtime`, `vault`,
  `graphql`) ficaram de fora. O produto não usa `auth.users` (0 linhas hoje, ele
  tem autenticação própria), mas usa `storage`, e é por isso que o item das fotos
  acima existe.
- **Senha de papel não vem no dump.** No destino, `dc360_api` foi criado com
  senha nova. Num restore de verdade é preciso definir a senha e atualizar o
  `DATABASE_URL` da API.
- **A API não foi apontada para o banco restaurado.** O que se provou pelo lado
  do comportamento foi no nível do banco (RLS e permissões), não um ciclo de
  login e vistoria contra a cópia.

### Com que frequência repetir

Este procedimento vale enquanto o esquema for o mesmo. Refaça depois de cada
migração que mexa em papel, policy ou grant, e pelo menos uma vez por mês
enquanto o piloto estiver de pé. O sinal de que ele continua válido é a linha
"md5 das impressões de migração" bater nos dois lados.

---

## Parte 7: a fila de pedidos de contato (e por que ela não é uma tela)

O formulário público grava em `interesse_municipio`. Ele é a única rota pública
que grava um pedido de contato de gente de fora, e hoje **ninguém lê o que ele
grava**. (Não é a única rota sem token que escreve: `/auth/entrar`, `/auth/recuperar`
e afins mexem em credencial e sessão; `GET /publico/oficio/:token` grava a abertura
do ofício em `oficio_aberturas`; e `PUT /armazenamento/objeto` grava o arquivo da
foto, autenticado pela assinatura da URL. A lista inteira está em
`apps/api/test/superficie-registrada.ts`.) Um
funil de entrada que ninguém abre não é funil, é caixa fechada. Esta seção
existe para fechar essa lacuna com o que dá para fazer sem inventar um poder que
o produto recusa ter.

### Por que não existe tela

Está decidido dentro da própria migração `db/migrations/011_interesse_de_municipio.sql`,
e a rota `apps/api/src/rotas/interesse.ts` repete a decisão no lugar onde a rota
de leitura não foi escrita:

- O papel de aplicação recebeu **INSERT e não recebeu SELECT** nessa tabela. É
  essa assimetria que impede um formulário aberto na internet de virar uma lista
  de contatos de servidores públicos servida a quem descobrir a rota.
- Uma tela precisaria de alguém autorizado a vê-la. Esse alguém seria um
  administrador acima do município, e a ADR 0006 (citada na migração e na rota)
  recusa o super-administrador justamente porque uma conta capaz de enxergar dois
  municípios transformaria o isolamento em promessa.
- Enquanto não existir um nível de plataforma separado do produto, a leitura é
  pelo banco, com credencial de dono. A migração diz, com todas as letras, que é
  desconfortável de propósito: melhor desconfortável e honesto do que uma rota
  "só para mim" que amanhã alguém descobre.

Consequência prática: **alguém precisa rodar a consulta abaixo de propósito**,
numa rotina. Nada avisa. O lugar natural é junto da conferência de backup da
Parte 6.

### A consulta, com o papel de setup

```bash
cd dc360
URL="$(grep -o 'postgresql://postgres\.[^ ]*' apps/api/.env)"
URL="${URL%%\?*}?sslmode=require"      # o libpq não aceita o sslmode=no-verify do .env

psql "$URL" -c "
SELECT recebido_em AT TIME ZONE 'America/Sao_Paulo' AS recebido,
       nome, cargo, email, telefone,
       municipio || '/' || uf AS municipio,
       orgao, faixa_populacao, quantos_agentes, origem, mensagem
  FROM interesse_municipio
 WHERE atendido_em IS NULL
 ORDER BY recebido_em DESC
 LIMIT 50;"
```

Depois de falar com a pessoa, feche a linha. As colunas `atendido_em` e
`observacao` existem exatamente para o formulário não virar uma caixa de entrada
onde ninguém sabe o que já foi lido:

```bash
psql "$URL" -c "
UPDATE interesse_municipio
   SET atendido_em = now(),
       observacao  = 'contato por telefone, reunião marcada para 12/09'
 WHERE id = 'COLE-O-ID-AQUI';"
```

E o resumo, que é o que serve para acompanhar sem abrir dado pessoal:

```bash
psql "$URL" -c "
SELECT count(*) AS total,
       count(*) FILTER (WHERE atendido_em IS NULL) AS na_fila,
       count(*) FILTER (WHERE recebido_em > now() - interval '7 days') AS ultimos_7_dias
  FROM interesse_municipio;"
```

### Quantos pedidos existem hoje

Rodado contra a produção em 09/09/2026:

```
 total | na_fila | ultimos_7_dias
-------+---------+----------------
     0 |       0 |              0
```

**Zero.** A fila está vazia: nenhum município preencheu o formulário até agora.
Isso é bom saber por dois motivos opostos. Não há ninguém esperando resposta há
semanas, e também não há nenhum sinal de demanda entrando pelo formulário, o que
diz mais sobre a divulgação do que sobre o produto.

### Cuidados ao rodar

- A primeira consulta devolve **dado pessoal** (nome, cargo, email e telefone de
  servidor público, mais o IP na coluna que a migração marcou com prazo de
  descarte). Não cole a saída em grupo de mensagem, não exporte para planilha
  compartilhada e não guarde cópia solta.
- Use a URL de setup **somente** para isto e para migrar. Ela nunca vira
  `DATABASE_URL` da API: o `.env` já explica que descomentar aquela linha faria a
  API rodar com `BYPASSRLS`, que é exatamente o defeito que o isolamento existe
  para impedir.
- A consulta é leitura pura. O `UPDATE` de fechamento toca uma linha por vez, com
  `WHERE id`, e não tem trilha de auditoria: `interesse_municipio` é anterior ao
  contrato e fica fora da trilha do município, então o que ficou registrado é o
  que você escrever em `observacao`.

---

## Parte 8: versões em uso e onde cada uma importa

Cinco versões diferentes de Postgres e de Node aparecem neste projeto, e confundi-las é fonte de "funciona na minha máquina". Esta tabela diz qual é qual (medidas em 2026-09-30, REL:01; a de produção vem da Parte 6).

| O quê | Versão | Onde importa |
| --- | --- | --- |
| Node | 22 (`dc360/.nvmrc` e `dc360/.node-version`; medido com 22.17.0 e npm 10.9.2) | Máquina de quem desenvolve, CI e imagem. O `engines` pede `>=22 <23` (V2-F01-E09); o npm só avisa quando a versão não bate |
| PGlite | 0.2.17 (Postgres 16 em WebAssembly) | Todos os testes de unidade e o painel no modo local. Não traz PostGIS nem os papéis do provedor |
| Postgres do CI | 17 com PostGIS 3.5 (`postgis/postgis:17-3.5` fixado por digest, V2-F01-E21) nos jobs `implantavel` e `imagens`; 17 (`postgres:17`, cliente 17) no job `restore` | O primeiro aplica as migrações, roda a API contra banco real e roda o `test:espacial` (PostGIS em Postgres real); o segundo faz o mesmo a partir das imagens Docker; o terceiro ensaia o restore (CA-08) em Linux |
| Postgres do `compose.yaml` | 17 (`postgis/postgis:17-3.5`, V2-F01-E09) | O ambiente local com PostGIS, igual em major ao de produção. A subida do compose com a imagem nova não tem registro de execução |
| Postgres de produção | 17.6 (Supabase) | O que atende o município de verdade; o restore da Parte 6 foi provado contra ele |

Duas consequências práticas: o que passa no PGlite pode falhar no Postgres 17 (função, extensão ou papel que só o provedor tem), e a prova de um recurso de PostGIS exige Postgres real, nunca PGlite. A medição das duas árvores de dependência (raiz e `apps/campo`) e o roteiro para repeti-la estão em `README.md` (seção "Como testar") e em `docs/evidencias-v2/G00/V2-F00-E01/`.
