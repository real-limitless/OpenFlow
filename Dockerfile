FROM node:22-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
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
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
RUN npm install prisma@7.9.1
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma/migrations prisma/migrations
COPY prisma.config.ts prisma.config.ts
COPY --from=build /app/.output ./.output
COPY --from=deps /app/node_modules/isolated-vm ./node_modules/isolated-vm
EXPOSE 3000
CMD npx prisma migrate deploy && node .output/server/index.mjs
