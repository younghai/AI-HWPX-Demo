# syntax=docker/dockerfile:1
#
# Single-container deployment for AI HWP (review A3).
# One process serves both the API and the built SPA. The Python worker
# (build_hwpx.py) and its native diagram dependency (cairosvg → libcairo) plus
# Korean fonts are all baked in, so diagram embedding works out of the box —
# unlike a bare host where a missing libcairo silently drops diagrams.

# ---- Stage 1: install deps + build the client SPA ----
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app
COPY . .
# pnpm is the declared package manager (packageManager: pnpm@10.32.1). The
# postinstall rhwp symlink hook is a no-op under the pnpm layout.
RUN pnpm install --frozen-lockfile && pnpm -C client build

# ---- Stage 2: runtime (node + python/cairosvg + Korean fonts) ----
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv libcairo2 \
      fonts-noto-cjk fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Bring over the fully-installed + built app (node_modules, client/dist, server,
# scripts, shared, templates). pnpm's node_modules symlinks stay valid because
# the path (/app) is identical to the builder.
COPY --from=builder /app /app

# Python venv with cairosvg + defusedxml. The server auto-detects
# /app/.venv/bin/python3 (see services/hwpxBuilder.js), so no extra wiring.
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir -r requirements.txt

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8792
EXPOSE 8792

# Serves API + built SPA from one process (index.js mounts client/dist when present).
CMD ["node", "server/index.js"]
