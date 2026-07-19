# node:24 has node:sqlite available without the experimental flag, matching
# what this service relies on for conversation storage (see src/db/index.ts).
FROM node:24-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# gosu drops from root to the unprivileged "node" user after
# docker-entrypoint.sh fixes up /data's ownership — the app never runs as root.
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3020
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
