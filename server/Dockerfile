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
RUN pnpm deploy --filter=server --prod /prod/server --legacy
RUN cp -r server/dist /prod/server/dist

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/server ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
