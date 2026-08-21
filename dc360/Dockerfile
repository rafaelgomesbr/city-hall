# =====================================================================
# Imagem da API.
#
# NÃO FOI CONSTRUÍDA NEM EXECUTADA. O ambiente onde este arquivo foi
# escrito não tem Docker, então ele é uma proposta revisável e não uma
# receita comprovada. Antes do primeiro deploy, construir e subir uma vez.
#
# Duas escolhas que valem explicação:
#
# 1. A imagem NÃO aplica migrações ao subir. Dois contêineres subindo ao
#    mesmo tempo migrariam em paralelo, e o segundo falharia no meio. A
#    migração é passo separado do deploy, rodando uma vez.
# 2. Chromium vem instalado por causa da geração de PDF. Ele engorda a
#    imagem em algumas centenas de megabytes; se o PDF virar job separado,
#    esta imagem perde o navegador e o job ganha.
# =====================================================================
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
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
RUN npm ci --workspaces --include-workspace-root \
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
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=construcao /app/packages/shared/dist packages/shared/dist
COPY --from=construcao /app/packages/shared/package.json packages/shared/
COPY --from=construcao /app/packages/campo/dist packages/campo/dist
COPY --from=construcao /app/packages/campo/package.json packages/campo/
COPY --from=construcao /app/db/dist db/dist
COPY --from=construcao /app/db/package.json db/
COPY db/migrations db/migrations
COPY --from=construcao /app/apps/api/dist apps/api/dist
COPY --from=construcao /app/apps/api/package.json apps/api/

# Processo sem privilégio: o usuário `node` já existe na imagem base.
USER node
EXPOSE 3333
# O contêiner recusa subir com esquema atrasado; ver apps/api/src/index.ts.
CMD ["node", "apps/api/dist/index.js"]
