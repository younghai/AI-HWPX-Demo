# syntax=docker/dockerfile:1
#
# Single-container deployment for AI HWP (review A3).
# One process serves both the API and the built SPA. The Python worker
# (build_hwpx.py) and its native diagram dependency (cairosvg → libcairo) plus
# Korean fonts are all baked in, so diagram embedding works out of the box —
# unlike a bare host where a missing libcairo silently drops diagrams.

FROM eclipse-temurin:8-jdk AS hwpconv
ARG HWPCONV_SHA=9af63ea5e24f4761351559591a1b35dbdf3c78b3
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN set -eux; \
    git clone --depth 1 https://github.com/vsdn/hwpConverter.git .; \
    if git checkout "$HWPCONV_SHA"; then :; else git fetch --depth 1 origin "$HWPCONV_SHA" && git checkout FETCH_HEAD; fi; \
    mkdir -p build/classes; \
    find src -name "*.java" > build/sources.txt; \
    javac -d build/classes -cp "lib/*" -encoding UTF-8 @build/sources.txt; \
    jar cfm build/hwpConverter.jar build/MANIFEST.MF -C build/classes kr

# ---- Stage 2: install deps + build the client SPA ----
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /app
COPY . .
# pnpm is the declared package manager (packageManager: pnpm@10.32.1). The
# postinstall rhwp symlink hook is a no-op under the pnpm layout.
RUN pnpm install --frozen-lockfile && pnpm -C client build

# ---- Stage 3: runtime (node + python/cairosvg + Korean fonts + JRE) ----
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv libcairo2 openjdk-17-jre-headless \
      fonts-noto-cjk fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Bring over the fully-installed + built app (node_modules, client/dist, server,
# scripts, shared, templates). pnpm's node_modules symlinks stay valid because
# the path (/app) is identical to the builder.
COPY --from=builder /app /app
COPY --from=hwpconv /src/build/hwpConverter.jar /app/vendor/hwpconverter/hwpConverter.jar
COPY --from=hwpconv /src/lib /app/vendor/hwpconverter/lib
COPY --from=hwpconv /src/LICENSE /app/vendor/hwpconverter/LICENSE-hwpConverter
COPY --from=builder /app/NOTICE /app/vendor/hwpconverter/NOTICE

# Python venv with cairosvg + defusedxml. The server auto-detects
# /app/.venv/bin/python3 (see services/hwpxBuilder.js), so no extra wiring.
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /app/generated /app/.work \
    && chown -R node:node /app/generated /app/.work

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8792
EXPOSE 8792

# Serves API + built SPA from one process (index.js mounts client/dist when present).
USER node
CMD ["node", "server/index.js"]
