FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/website-builder/ ./artifacts/website-builder/
COPY scripts/ ./scripts/

FROM base AS deps
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --no-frozen-lockfile --ignore-scripts

FROM deps AS build-frontend
WORKDIR /app
RUN pnpm --filter @workspace/website-builder run build

FROM deps AS build-backend
WORKDIR /app
RUN pnpm --filter @workspace/api-server run build

FROM node:20-slim AS production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY artifacts/website-builder/package.json ./artifacts/website-builder/package.json
COPY scripts/package.json ./scripts/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts || pnpm install --no-frozen-lockfile --prod --ignore-scripts

COPY --from=build-backend /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build-frontend /app/artifacts/website-builder/dist ./artifacts/website-builder/dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.cjs"]
