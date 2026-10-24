# =====================================================================
# Imagem da API.
#
# O QUE PROVA ESTA IMAGEM: o job `imagens` do `verificar.yml` (V2-F01-E08)
# constrói esta imagem em todo pull request, com `docker build` (a base é fixada
# por digest, ver abaixo), e a exercita contra um Postgres 17 de serviço, com
# `NODE_ENV=development`: aplica as migrações a partir da própria imagem, sobe
# a API, confere `/saude` 200 com `versao` e `commit` iguais aos do build,
# confere que o Chromium roda (`chromium --version`) e que o processo não é root.
# O job `implantavel` continua provando a partida no Node puro. Esta é a imagem
# de produção: `fly.toml` (`[build] dockerfile`) manda o `fly deploy` construí-la
# no construtor do Fly, e foi assim que o servidor em `defesa-civil.fly.dev` (o
# `eas.json` aponta para ele) subiu. O que o CI NÃO faz com ela: varrer
# vulnerabilidade (V2-F01-E20), gerar SBOM (E19) e promovê-la (E12).
#
# VERSÃO E COMMIT: `DC360_VERSAO` e `DC360_COMMIT` são argumentos de build que
# viram variáveis de ambiente da imagem e saem em `/saude`. Sem eles a imagem
# constrói e diz `desconhecida`. Quem constrói passa:
#   docker build \
#     --build-arg DC360_VERSAO="$(node scripts/versao.mjs mostrar | awk '/^plataforma:/ {print $2}')" \
#     --build-arg DC360_COMMIT="$(git rev-parse HEAD)" .
# (no Fly: `fly deploy --build-arg DC360_VERSAO=... --build-arg DC360_COMMIT=...`;
# receita e rollback em docs/runbooks/rollback.md).
#
# BASE POR DIGEST: `node:22-bookworm-slim@sha256:...` não muda debaixo de nós. O
# digest é o do índice multiplataforma de 2026-10-24. Quem sobe a base é o
# Dependabot (frente docker de /dc360, em PR), que troca tag e digest juntos.
#
# Quatro escolhas que valem explicação:
#
# 1. A imagem NÃO aplica migrações ao subir. Dois contêineres subindo ao
#    mesmo tempo migrariam em paralelo, e o segundo falharia no meio. A
#    migração é passo separado do deploy, rodando uma vez.
# 2. Chromium vem instalado por causa da geração de PDF. Ele engorda a
#    imagem em algumas centenas de megabytes; se o PDF virar job separado,
#    esta imagem perde o navegador e o job ganha.
# 3. O PDF ENTRA na imagem, e a decisão foi tomada em 09/09/2026: é a saída
#    (a) que estava escrita aqui como pendente. `playwright` saiu de
#    devDependencies e entrou em `dependencies` de `apps/api`, então a etapa
#    `dependencias`, que roda `--omit=dev`, agora o instala. O que estava
#    acontecendo até aqui: o import dinâmico em pdf.ts falhava na imagem, OS
#    DOIS BOTÕES DE PDF DO PAINEL respondiam 503 em produção, e o Chromium
#    instalado logo abaixo era peso morto de algumas centenas de megabytes.
#    Duas consequências que andam junto com a decisão:
#      - `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` subiu para a etapa `base`, de
#        onde TODAS as etapas herdam. Sem isso, o `npm ci` de `dependencias` e
#        o de `construcao` baixariam cada um o seu navegador, e a imagem
#        carregaria dois Chromium além do do Debian.
#      - Quem lê `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` é o nosso pdf.ts, não o
#        Playwright. Ver o comentário em apps/api/src/documentos/pdf.ts.
# 4. O certificado da autoridade certificadora do provedor de banco entra na
#    imagem (`COPY db/provedores`). Sem ele, a API não conecta: a conexão
#    passou a ser verificada, e verificar sem âncora é não conectar.
# =====================================================================
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS base
ENV NODE_ENV=production
# Nenhuma etapa baixa navegador: o Chromium da imagem final é o do Debian,
# instalado uma vez na etapa `runtime`.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

FROM base AS dependencias
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/campo/package.json packages/campo/
COPY db/package.json db/
COPY apps/api/package.json apps/api/
# `npm ci` e não `npm install`: o lockfile manda, e uma versão diferente
# entrando em produção sem ninguém pedir é como uma dependência vulnerável
# aparece sozinha.
RUN npm ci --workspaces --include-workspace-root --omit=dev

FROM base AS construcao
COPY package.json package-lock.json ./
COPY packages packages
COPY db db
COPY apps/api apps/api
# `--include=dev` não é redundante: a etapa `base` define NODE_ENV=production,
# e com isso o npm omite devDependencies sozinho, mesmo sem `--omit=dev`. O
# TypeScript é devDependency, então sem esta flag o build morre em
# `sh: 1: tsc: not found`, que é uma mensagem que não aponta para a causa.
RUN npm ci --workspaces --include-workspace-root --include=dev \
 && npm run build --workspace @dc360/shared \
 && npm run build --workspace @dc360/db \
 && npm run build --workspace @dc360/campo \
 && npm run build --workspace @dc360/api

FROM base AS runtime
# Chromium do sistema, com as bibliotecas que ele exige. Baixar o navegador
# do Playwright dentro da imagem duplicaria o peso.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Lida por apps/api/src/documentos/pdf.ts, que a repassa como `executablePath`.
# O Playwright ignora esta variável; ver o comentário no topo deste arquivo.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=construcao /app/packages/shared/dist packages/shared/dist
COPY --from=construcao /app/packages/shared/package.json packages/shared/
COPY --from=construcao /app/packages/campo/dist packages/campo/dist
COPY --from=construcao /app/packages/campo/package.json packages/campo/
COPY --from=construcao /app/db/dist db/dist
COPY --from=construcao /app/db/package.json db/
COPY db/migrations db/migrations
# A âncora de confiança do banco. É certificado público, não segredo, e vem do
# repositório de propósito: baixar a CA na partida colocaria a rede no meio de
# uma decisão de segurança. Sem este arquivo a API não sobe, porque a conexão
# está em modo verificado; ver apps/api/src/banco/postgres.ts.
COPY db/provedores db/provedores
COPY --from=construcao /app/apps/api/dist apps/api/dist
COPY --from=construcao /app/apps/api/package.json apps/api/

# O carimbo do build, DEPOIS de tudo o que é caro: mudar o commit invalida só
# estas linhas, e não a instalação de dependências nem a compilação. `/saude`
# lê as duas (apps/api/src/versao-do-build.ts).
ARG DC360_VERSAO=desconhecida
ARG DC360_COMMIT=desconhecido
ENV DC360_VERSAO=$DC360_VERSAO \
    DC360_COMMIT=$DC360_COMMIT

# Processo sem privilégio: o usuário `node` já existe na imagem base.
USER node
EXPOSE 3333
# O contêiner recusa subir com esquema atrasado; ver apps/api/src/index.ts.
CMD ["node", "apps/api/dist/index.js"]
