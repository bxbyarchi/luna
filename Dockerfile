# syntax=docker/dockerfile:1

# Multi-stage build for the pnpm monorepo. api-server serves the built
# m-sklad frontend itself (see artifacts/api-server/src/app.ts), so a single
# image covers both — no separate frontend container.

FROM node:24-alpine AS base
# Pin corepack's package-manager cache to a known path so it can be copied
# into the runtime stage below — the running container must never need
# network access just to fetch its own package manager.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app

# ---- deps: full install (incl. devDependencies) needed to typecheck/build ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/m-sklad/package.json artifacts/m-sklad/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/object-storage-web/package.json lib/object-storage-web/package.json
COPY scripts/package.json scripts/package.json
RUN pnpm install --frozen-lockfile

# ---- build: full source, typecheck + build every workspace package ----
FROM deps AS build
COPY . .
RUN pnpm run build

# ---- prune: same tree, but node_modules swapped to production-only ----
# --filter "@workspace/api-server..." keeps api-server plus everything it
# depends on (lib/db, lib/api-zod, ...) and drops the frontend-only dev
# toolchain (vite, the two Vite apps' own deps, etc).
FROM build AS prune
RUN find . -name node_modules -type d -prune -exec rm -rf {} + \
  && pnpm install --frozen-lockfile --prod --filter "@workspace/api-server..."

# ---- runtime: minimal, non-root ----
FROM node:24-alpine AS runtime
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable \
  && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prune /opt/corepack /opt/corepack
COPY --from=prune --chown=app:app /app ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
