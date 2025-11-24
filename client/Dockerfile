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

ARG VITE_API_URL
ARG VITE_UPLOAD_BASE_URL
RUN test -n "$VITE_API_URL" && test -n "$VITE_UPLOAD_BASE_URL"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_UPLOAD_BASE_URL=${VITE_UPLOAD_BASE_URL}

RUN pnpm --filter client build

FROM nginx:1.27-alpine AS runner
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
