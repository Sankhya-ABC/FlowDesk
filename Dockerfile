# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS builder

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runner

WORKDIR /app

ENV PORT=9003
ENV NODE_ENV=production

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server-run.mjs ./server-run.mjs

EXPOSE 9003

CMD ["bun", "run", "server-run.mjs"]
