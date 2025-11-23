# syntax=docker/dockerfile-upstream:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="${PNPM_HOME}/store"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV HUSKY=0
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY utils/package.json utils/package.json
RUN pnpm install --filter server... --frozen-lockfile

FROM deps AS build
COPY server server
COPY utils utils
RUN pnpm --filter utils build
RUN pnpm --filter server build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /pnpm/store /pnpm/store
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN npm_config_ignore_scripts=true pnpm install --filter server --prod --frozen-lockfile
COPY --from=build /app/server/dist ./server/dist

EXPOSE 4000
CMD ["node", "server/dist/index.js"]
