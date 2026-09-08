# Colocar o DC360 de pé: servidor, banco, domínio e o app iOS

Guia operacional, na ordem, com o que criar, quanto custa, quanto demora, e o
que é caminho crítico. Escrito para você seguir no Mac com prazo curto.

Data: 08/09/2026.

---

## A verdade sobre o prazo, primeiro

**App na App Store pública até o fim de semana: não dá, e não é por causa do
código.** Os bloqueios são de terceiros e de tempo de espera:

- **Conta Apple Developer** custa US$ 99/ano. Conta de **organização** exige um
  número **D-U-N-S** da empresa, que leva de dias a semanas. Conta **pessoal**
  sai em horas a 1–2 dias, e é o caminho para o fim de semana.
- **Revisão da App Store** leva de 1 a 3 dias úteis, e o bundle atual
  (`br.gov.dc360.campo`) provavelmente é **recusado** (ver item crítico abaixo).

**O que DÁ para ter no fim de semana, e é o que importa para testar de verdade:**

1. **Backend em produção real** — servidor, banco, domínio, HTTPS. Isso é
   inteiramente possível em um fim de semana.
2. **O app rodando no seu iPhone**, via simulador do Xcode (grátis, agora) e
   via TestFlight/build interno (com a conta paga, **sem** revisão de loja).

Ou seja: a meta realista do fim de semana é **o app instalado no seu iPhone,
falando com o servidor de produção**. A loja pública vem depois, quando o
D-U-N-S e a revisão não forem gargalo.

---

## Parte 1 — O que já está pronto (não precisa mexer)

- Painel web (React + Vite), aplicativo de campo (Expo, **mesmo código para iOS
  e Android**), API (Fastify), banco (PostgreSQL + PostGIS), esquemas Zod
  compartilhados.
- **393 testes verdes, `npm audit` em zero.**
- **A API sobe contra PostgreSQL real** (provado contra o Postgres 18, à mão) e
  serve o ciclo inteiro: login, isolamento entre municípios, ocorrência,
  vistoria offline, laudo, termo de interdição e desinterdição, contagem de
  pessoas.
- O app foi verificado inteiro no emulador **Android**: menu, minuta, login,
  GPS, câmera, o ciclo completo. **Nunca rodou em iOS** — é o que você vai fazer
  no Mac.

---

## Parte 2 — Os 5 bloqueios do app iOS (resolver ANTES do primeiro build)

### CRÍTICO 1 — Trocar o bundle identifier `br.gov.dc360.campo`

`gov.br` é namespace de governo. Um desenvolvedor privado publicando sob ele cai
na **política de personificação da Apple** (e da Google), e o bundle é
definitivo: depois de publicado, trocar significa **outro aplicativo**, sem
herdar nada. Troque **agora**, antes do primeiro build, em
`apps/campo/app.config.ts`:

```
ios.bundleIdentifier: "br.gov.dc360.campo"   →   "com.SUAEMPRESA.dc360campo"
android.package:      "br.gov.dc360.campo"   →   "com.SUAEMPRESA.dc360campo"
```

Use o CNPJ/marca sob o qual você vai vender. Isto depende de uma decisão sua
(nome da empresa).

### CRÍTICO 2 — Conta Apple Developer

- US$ 99/ano, em [developer.apple.com](https://developer.apple.com).
- Para o fim de semana: **conta pessoal** (verificação em horas a 1–2 dias).
- Organização (com a marca da empresa na App Store) exige D-U-N-S: peça já se
  for esse o caminho, mas não bloqueie o fim de semana por ela.

### CRÍTICO 3 — Projeto Expo (EAS)

O `app.config.ts` lê `EAS_PROJECT_ID` de variável, e a EAS **não define essa
variável no worker de build**. Rode uma vez, no Mac, e ele grava o ID:

```bash
cd apps/campo
npm i -g eas-cli
eas login
eas init          # cria o projeto no Expo e grava o projectId
```

### CRÍTICO 4 — O endereço do servidor no build

Um binário aponta para um servidor fixo. `apps/campo/eas.json` tem
`https://api.exemplo.gov.br` nos perfis. **Troque pelo domínio real** (Parte 3)
antes de gerar o build que você vai usar.

### CRÍTICO 5 — HTTPS é pré-requisito, não opção

O app declara `NSAllowsArbitraryLoads: false`: ele **só conecta em `https://`**.
Sem domínio com TLS válido, a tela de login gira e não explica. É por isso que o
servidor (Parte 3) vem antes do app.

---

## Parte 3 — A infraestrutura, na ordem do caminho crítico

### 1. Domínio (primeiro de tudo — HTTPS e o app dependem dele)

- Registre em [registro.br](https://registro.br) (`.com.br`, ~R$ 40/ano) ou num
  registrador `.com`.
- Você vai usar três nomes, por exemplo: `api.seudominio.com.br` (API),
  `painel.seudominio.com.br` (painel web). O do app é o da API.

### 2. Banco: PostgreSQL gerenciado com backup automático

Não use Postgres numa VM que você administra: backup só existe depois de um
**restore testado**, e provedor gerenciado já dá isso e PITR.

- **Neon** (neon.tech) ou **Supabase** — os dois têm plano inicial grátis e
  Postgres real. Neon é o mais direto.
- Crie o banco `dc360`.
- **Modelo de três papéis** (o app depende disto; provado contra Postgres real):

  ```sql
  -- papel de SETUP: cria papéis e migra. O provedor gerenciado já te dá um
  -- papel administrativo com CREATEROLE e BYPASSRLS — use-o como setup.
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

### 3. Servidor da API

PaaS que dá HTTPS automático e roda contêiner ou Node:

- **Fly.io**, **Railway** ou **Render**. O repositório tem `Dockerfile` e
  `compose.yaml` (revisados, mas ainda não construídos — o job de CI
  `implantavel` os confere no primeiro push).
- Variáveis de ambiente obrigatórias em produção (o processo **recusa subir**
  sem elas — é de propósito):

  | Variável | O que é |
  | --- | --- |
  | `NODE_ENV` | `production` |
  | `HOST` | `0.0.0.0` (senão a porta publicada não atende) |
  | `DATABASE_URL` | do papel de **aplicação** (`dc360_api`), nunca o de setup |
  | `JWT_SEGREDO` | ≥ 32 bytes aleatórios (`openssl rand -base64 48`) |
  | `URL_PUBLICA` | `https://api.seudominio.com.br` |
  | `URL_PAINEL` | `https://painel.seudominio.com.br` |
  | `ORIGENS_PERMITIDAS` | `https://painel.seudominio.com.br` (sem curinga) |
  | `S3_ENDPOINT` `S3_BALDE` `S3_CHAVE_ID` `S3_CHAVE_SECRETA` | armazenamento (item 4) |
  | `RECUPERACAO_ATIVA` | `nao` no piloto, ou `sim` + `NOTIFICADOR_URL`/`_CHAVE` (item 5) |

  Tudo em `https://` — a config recusa `http` e `localhost` em produção.

### 4. Armazenamento de fotos e assinaturas

Sem isto, a foto da vistoria não sobe.

- **Cloudflare R2** (barato, compatível com S3) ou **AWS S3**.
- Crie um balde, gere as chaves, preencha os `S3_*` acima. Configure o CORS do
  balde para aceitar o painel.

### 5. Email para recuperação de senha

- **No piloto, o mais simples é `RECUPERACAO_ATIVA=nao`**: a tela manda procurar
  a coordenação, que redefine a senha por dentro. Zero dependência.
- Se quiser recuperação por email: provedor (Resend, SES), e
  `NOTIFICADOR_URL` + `NOTIFICADOR_CHAVE`.

### 6. Painel web (opcional para o app, necessário para o coordenador)

- Deploy estático em **Vercel**, **Netlify** ou **Cloudflare Pages**.
- Build com `VITE_API_URL=https://api.seudominio.com.br`.

### 7. O primeiro município

```bash
DATABASE_URL=postgres://SETUP:...@host/dc360 npm run provisionar --   --municipio "Nome" --uf UF   --nome "Coordenador" --matricula C-1 --email coord@municipio.gov.br
```

Anote a senha impressa: ela não é guardada em texto claro e não aparece de novo.
Na primeira entrada, o coordenador troca a senha em **Minha conta**.

---

## Parte 4 — No Mac, na ordem

```bash
# 1. Clonar e conferir que tudo passa no Mac
git clone <repo> && cd dc360
npm ci
npm run verificar          # typecheck, 393 testes, npm audit, números

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

## Parte 5 — O que só você decide (destrava o resto)

1. **Nome/CNPJ da empresa** — define o bundle identifier e a conta Apple.
2. **Conta Apple: pessoal ou organização** — pessoal para o fim de semana.
3. **Provedores** — Neon (banco), Fly/Railway (API), R2 (fotos), registro.br
   (domínio). Todos têm plano inicial barato ou grátis.
4. **Recuperação de senha** — desligada no piloto (recomendado) ou com provedor.
5. **Duas decisões de produto pendentes**, anotadas no código:
   - fechar a tomada de conta entre pares de mesmo posto (notificar email antigo
     ou exigir reautenticação);
   - PDF na imagem do servidor (incluir o gerador ou assumir impressão pelo
     navegador). Ver o comentário no topo do `Dockerfile`.

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
tempo é o D-U-N-S (se organização) e a revisão da loja — nenhum dos dois bloqueia
ter o app no seu iPhone via TestFlight neste fim de semana.
