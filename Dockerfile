# ── Stage 1: Build TypeScript ─────────────────────────────────────────────────
# Uses the locally-installed node_modules so the build works in environments
# where the Docker daemon cannot reach the npm registry (e.g. OrbStack).
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY node_modules ./node_modules
COPY src ./src

RUN npm run build

# ── Stage 2: Prune dev dependencies ───────────────────────────────────────────
# npm prune is a local file operation — no network access required.
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules

RUN npm prune --omit=dev

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup -g 1001 -S agentvault \
 && adduser  -u 1001 -S -G agentvault agentvault

COPY package.json ./
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist

USER agentvault

EXPOSE 3500

# Lightweight health check using Alpine's built-in wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3500/health || exit 1

CMD ["node", "dist/index.js"]
