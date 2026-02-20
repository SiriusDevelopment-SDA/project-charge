# =========================
# 1️⃣ Stage de build
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas os arquivos de dependência primeiro (melhora cache)
COPY package.json package-lock.json* ./

RUN npm install

# Copia o restante do projeto
COPY . .

# Build da aplicação
RUN npm run build


# =========================
# 2️⃣ Stage de produção
# =========================
FROM nginx:stable-alpine

# Remove config padrão do nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia config customizada (opcional)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia build gerado
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]