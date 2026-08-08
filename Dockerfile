FROM node:22-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/postinstall-prisma.mjs scripts/postinstall-prisma.mjs
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NITRO_PRESET=node-server
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    git \
    openssh-client \
    python3 \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    BINARY_STORAGE_DIR=/data/binary \
    OPENFLOW_SECRETS_DIR=/data/secrets
RUN npm install prisma@7.9.1 dotenv@17.4.2 \
  && mkdir -p /data/binary /data/secrets
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma/migrations prisma/migrations
COPY prisma.config.ts prisma.config.ts
COPY scripts/docker-entrypoint.sh /usr/local/bin/openflow-entrypoint.sh
RUN chmod +x /usr/local/bin/openflow-entrypoint.sh
COPY --from=build /app/.output ./.output
COPY --from=deps /app/node_modules/isolated-vm ./node_modules/isolated-vm
# Code node Python (Pyodide WASM runtime + data files)
COPY --from=deps /app/node_modules/pyodide ./node_modules/pyodide
# FTP/SFTP runtime clients (may be externalized by Nitro)
COPY --from=deps /app/node_modules/basic-ftp ./node_modules/basic-ftp
COPY --from=deps /app/node_modules/ssh2 ./node_modules/ssh2
COPY --from=deps /app/node_modules/asn1 ./node_modules/asn1
COPY --from=deps /app/node_modules/bcrypt-pbkdf ./node_modules/bcrypt-pbkdf
COPY --from=deps /app/node_modules/buildcheck ./node_modules/buildcheck
COPY --from=deps /app/node_modules/nan ./node_modules/nan
# Git node transport (simple-git + deps; may be externalized by Nitro)
COPY --from=deps /app/node_modules/simple-git ./node_modules/simple-git
COPY --from=deps /app/node_modules/@kwsites ./node_modules/@kwsites
COPY --from=deps /app/node_modules/@simple-git ./node_modules/@simple-git
COPY --from=deps /app/node_modules/debug ./node_modules/debug
COPY --from=deps /app/node_modules/ms ./node_modules/ms
EXPOSE 3000
VOLUME ["/data/binary", "/data/secrets"]
ENTRYPOINT ["/usr/local/bin/openflow-entrypoint.sh"]
