# =========================
# 1) STAGE DE BUILD
# =========================
FROM node:22.12.0-alpine3.21 AS builder

WORKDIR /app

# Copia apenas os manifests (cache)
COPY package*.json ./

# Instala deps completas (precisa do Nest + TS)
RUN npm ci

# Copia o restante do projeto
COPY . .

# Compila TS -> JS (gera dist/)
RUN npm run build


# =========================
# 2) STAGE DE RUN
# =========================
FROM node:22.12.0-alpine3.21 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia manifests novamente
COPY package*.json ./

# Instala somente dependências de produção
RUN npm ci --omit=dev

# Copia o JS compilado do builder
COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/main.js"]