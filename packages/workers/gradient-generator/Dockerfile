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
RUN mkdir -p packages/workers/gradient-generator packages/utils
COPY packages/workers/gradient-generator/package.json packages/workers/gradient-generator/package.json
COPY packages/utils/package.json packages/utils/package.json

# Install dependencies (offline)
RUN pnpm install --filter worker-gradient-generator... --frozen-lockfile --offline

# Copy utils source and build
COPY packages/utils packages/utils
RUN pnpm --filter utils build

FROM deps AS build
COPY packages/workers/gradient-generator packages/workers/gradient-generator
RUN pnpm --filter worker-gradient-generator build
RUN pnpm deploy --filter=worker-gradient-generator --prod /prod/worker-gradient-generator
RUN cp -r packages/workers/gradient-generator/dist /prod/worker-gradient-generator/dist

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/worker-gradient-generator ./

# Create non-root user and set ownership
RUN adduser -D app && chown -R app /app
USER app

CMD ["node", "dist/run.js"]
