# syntax=docker/dockerfile-upstream:1.7
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="${PNPM_HOME}/store"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
COPY utils/package.json utils/package.json
RUN pnpm install --filter utils --frozen-lockfile
COPY utils utils
RUN pnpm --filter utils build
RUN pnpm install --filter client... --frozen-lockfile

FROM deps AS build
COPY client client
COPY --from=deps /app/utils ./utils
RUN pnpm --filter client build

FROM nginx:1.27-alpine AS runner
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
