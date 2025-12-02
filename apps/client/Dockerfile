# syntax=docker/dockerfile-upstream:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="${PNPM_HOME}/store"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm install --filter utils --frozen-lockfile
COPY packages/utils packages/utils
RUN pnpm --filter utils build
RUN pnpm install --filter client... --frozen-lockfile

FROM deps AS build
COPY apps/client apps/client
COPY --from=deps /app/packages/utils ./packages/utils

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_LOG_LEVEL
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL}

RUN pnpm --filter client build

FROM nginx:1.27-alpine AS runner
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
