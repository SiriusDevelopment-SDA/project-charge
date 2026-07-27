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
# 2) STAGE DE DEPS DE PRODUCAO (split em 3 buckets)
# =========================
FROM node:22.12.0-alpine3.21 AS proddeps

WORKDIR /app

COPY package*.json ./

# Instala somente dependencias de producao
RUN npm ci --omit=dev

# Distribui node_modules em 3 buckets balanceados por tamanho, para que cada
# COPY no runner vire uma layer menor (<100MB). Evita um blob unico grande que
# alguns registries/proxies rejeitam no push. O conteudo do node_modules e
# identico ao original — apenas dividido; os 3 sao reassemblados no mesmo dir.
RUN cd /app/node_modules && mkdir -p /nm1 /nm2 /nm3 && \
    s1=0; s2=0; s3=0; \
    for e in $(ls -A | while read x; do echo "$(du -s "$x" | cut -f1) $x"; done | sort -rn | cut -d' ' -f2-); do \
      sz=$(du -s "$e" | cut -f1); \
      if [ "$s1" -le "$s2" ] && [ "$s1" -le "$s3" ]; then mv "$e" /nm1/; s1=$((s1 + sz)); \
      elif [ "$s2" -le "$s3" ]; then mv "$e" /nm2/; s2=$((s2 + sz)); \
      else mv "$e" /nm3/; s3=$((s3 + sz)); fi; \
    done && \
    echo "[split] buckets KB -> nm1=$s1 nm2=$s2 nm3=$s3"


# =========================
# 3) STAGE DE RUN
# =========================
FROM node:22.12.0-alpine3.21 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia manifests novamente
COPY package*.json ./

# node_modules em 3 layers menores, reassembladas no mesmo diretorio
COPY --from=proddeps /nm1 ./node_modules
COPY --from=proddeps /nm2 ./node_modules
COPY --from=proddeps /nm3 ./node_modules

# Copia o JS compilado do builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "--max-old-space-size=4096", "dist/main.js"]
