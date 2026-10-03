# Build context is the repo root: docker compose build web
FROM node:20-bookworm-slim AS base
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_DEMO_NOW=""
ARG API_INTERNAL_URL=http://api:3001
ENV NEXT_PUBLIC_DEMO_NOW=$NEXT_PUBLIC_DEMO_NOW
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @waypoint/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @waypoint/contracts run build && pnpm --filter @waypoint/web run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
