# Single-container build — works on Railway, Fly.io, or any Docker host.
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000
# migrate + seed are idempotent — safe on every boot
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && npm start"]
