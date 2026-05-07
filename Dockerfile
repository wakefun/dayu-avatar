FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps ./apps
RUN pnpm build
RUN pnpm deploy --filter @dayu/api --prod --legacy /runtime

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV CWEBP_BIN=/opt/libwebp/bin/cwebp
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL "https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0-linux-x86-64.tar.gz" -o /tmp/libwebp.tar.gz \
  && mkdir -p /opt/libwebp \
  && tar -xzf /tmp/libwebp.tar.gz -C /opt/libwebp --strip-components=1 \
  && rm /tmp/libwebp.tar.gz \
  && apt-get purge -y --auto-remove curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /runtime/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data/uploads /app/data/generated
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
