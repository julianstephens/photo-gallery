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
RUN mkdir -p packages/worker-gradient packages/utils
COPY packages/worker-gradient/package.json packages/worker-gradient/package.json
COPY packages/utils/package.json packages/utils/package.json

# Install dependencies (offline)
RUN pnpm install --filter worker-gradient... --frozen-lockfile --offline

# Copy utils source and build
COPY packages/utils packages/utils
RUN pnpm --filter utils build

FROM deps AS build
COPY packages/worker-gradient packages/worker-gradient
RUN pnpm --filter worker-gradient build
RUN pnpm deploy --filter=worker-gradient --prod /prod/worker-gradient --legacy
RUN cp -r packages/worker-gradient/dist /prod/worker-gradient/dist

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/worker-gradient ./

# Create non-root user and set ownership
RUN adduser -D app && chown -R app /app
USER app

EXPOSE 9876

CMD ["node", "dist/run.js"]
