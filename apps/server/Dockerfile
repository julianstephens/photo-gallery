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
RUN mkdir -p apps/server packages/utils packages/worker-gradient packages/worker-notifications
COPY apps/server/package.json apps/server/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/worker-gradient/package.json packages/worker-gradient/package.json
COPY packages/worker-notifications/package.json packages/worker-notifications/package.json

# Install dependencies (offline)
# This step is cached unless lockfile or package.jsons change
RUN pnpm install --filter server... --frozen-lockfile --offline

# Copy utils source and build
COPY packages/utils packages/utils
RUN pnpm --filter utils build

# Copy worker-gradient source and build
COPY packages/worker-gradient packages/worker-gradient
RUN pnpm --filter worker-gradient build

FROM deps AS build
COPY apps/server apps/server
RUN pnpm --filter server build
RUN pnpm deploy --filter=server --prod /prod/server --legacy
RUN cp -r apps/server/dist /prod/server/dist

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/server ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
