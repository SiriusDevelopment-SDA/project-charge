# =========================
# 1. Stage de build
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copia apenas os arquivos de dependencia primeiro
COPY package.json package-lock.json* ./

RUN npm install

# Copia o restante do projeto
COPY . .

# Build da aplicacao
RUN npm run build


# =========================
# 2. Stage de producao
# =========================
FROM nginx:stable-alpine

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Remove config padrao do nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia config customizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia build gerado
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
