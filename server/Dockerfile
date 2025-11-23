# syntax=docker/dockerfile-upstream:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="${PNPM_HOME}/store"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV HUSKY=0
WORKDIR /app
RUN corepack enable && apk add --no-cache curl

FROM base AS deps
# Cache pnpm fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY utils/package.json utils/package.json

# Install dependencies (offline)
# This step is cached unless lockfile or package.jsons change
RUN pnpm install --filter server... --frozen-lockfile --offline

# Copy utils source and build
COPY utils utils
RUN pnpm --filter utils build

FROM deps AS build
COPY server server
RUN pnpm --filter server build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy store from deps
COPY --from=deps /pnpm/store /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY --from=deps /app/utils ./utils

# Install prod dependencies (offline)
RUN npm_config_ignore_scripts=true pnpm install --filter server --prod --frozen-lockfile --offline

COPY --from=build /app/server/dist ./server/dist

EXPOSE 4000
CMD ["node", "server/dist/index.js"]
