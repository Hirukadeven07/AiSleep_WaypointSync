# Build context is the repo root: docker compose build api
# Full bookworm image: it ships OpenSSL, which Prisma needs (avoids an apt-get step).
FROM node:20-bookworm AS base
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR=
ENV PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @waypoint/api...
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter @waypoint/contracts run build \
    && pnpm --filter @waypoint/domain run build \
    && pnpm --filter @waypoint/api run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run seed && node dist/main.js"]
