ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CABINET_TELEMETRY_DISABLED=1
RUN npm run build

FROM deps AS prod-deps
WORKDIR /app
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ARG CLAUDE_CODE_VERSION=latest

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CABINET_TELEMETRY_DISABLED=1
ENV DISABLE_AUTOUPDATER=1
ENV HOSTNAME=0.0.0.0
ENV PORT=4000
ENV CABINET_APP_PORT=4000
ENV CABINET_DAEMON_PORT=4100
ENV CABINET_DATA_DIR=/data
ENV NODE_OPTIONS=--max-old-space-size=768

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    gosu \
    openssh-client \
    python3 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g --no-audit --no-fund "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && groupadd --system --gid 1001 cabinet \
  && useradd --system --uid 1001 --gid cabinet --home-dir /home/cabinet --create-home cabinet

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/resources ./resources
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/cabinet-release.json ./cabinet-release.json
COPY docker/entrypoint.sh /usr/local/bin/cabinet-entrypoint
COPY docker/start-cabinet.sh /usr/local/bin/start-cabinet

RUN chmod +x /usr/local/bin/cabinet-entrypoint /usr/local/bin/start-cabinet \
  && mkdir -p /data /app/.next/cache \
  && chown -R cabinet:cabinet /app /data /home/cabinet

VOLUME ["/data", "/home/cabinet"]
EXPOSE 4000 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["cabinet-entrypoint"]
CMD ["start-cabinet"]
