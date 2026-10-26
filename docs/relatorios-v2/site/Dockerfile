# Página de progresso da V2 (servidor.mjs + middleware.js + progresso/ gerado). Sem dependências: só Node.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json middleware.js servidor.mjs ./
COPY progresso ./progresso
USER node
EXPOSE 8080
CMD ["node", "servidor.mjs"]
