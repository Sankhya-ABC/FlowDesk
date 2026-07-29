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

EXPOSE 9003

CMD ["bun", "run", ".output/server/index.mjs"]
