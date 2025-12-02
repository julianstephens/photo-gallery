# syntax=docker/dockerfile-upstream:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="${PNPM_HOME}/store"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV HUSKY=0
WORKDIR /app
RUN corepack enable

FROM base AS deps
# Cache pnpm fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# Copy package files
COPY package.json pnpm-workspace.yaml ./
RUN mkdir -p packages/worker-notifications packages/utils
COPY packages/worker-notifications/package.json packages/worker-notifications/package.json
COPY packages/utils/package.json packages/utils/package.json

# Install dependencies (offline)
RUN pnpm install --filter worker-notifications... --frozen-lockfile --offline

# Copy utils source and build
COPY packages/utils packages/utils
RUN pnpm --filter utils build

FROM deps AS build
COPY packages/worker-notifications packages/worker-notifications
RUN pnpm --filter worker-notifications build
RUN pnpm deploy --filter=worker-notifications --prod /prod/worker-notifications
RUN cp -r packages/worker-notifications/dist /prod/worker-notifications/dist

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/worker-notifications ./

# Create non-root user and set ownership
RUN adduser -D app && chown -R app /app
USER app

CMD ["node", "dist/index.js"]
