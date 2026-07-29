# FlowDesk

Sistema de Gestão de Projetos e Demandas.

Stack: [TanStack Start](https://tanstack.com/start) (React 19 SSR) + Vite + Tailwind, servido em runtime pelo [Bun](https://bun.sh) (preset `bun` do Nitro).

A UI funcional hoje é o protótipo em `public/system/` (Vanilla JS) — o app React em `src/routes` ainda está vazio e só redireciona pra lá. A API que persiste os dados desse protótipo no Postgres vive dentro do próprio TanStack Start, em `src/server/db/` (interceptada em `src/server.ts` antes do SSR, nas rotas `/api/*`).

## Desenvolvimento com Docker

Pré-requisito: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up -d
bun install          # localmente, só pra ter o drizzle-kit disponível
bun run db:push       # cria as tabelas no Postgres de dev
```

Isso sobe dois containers:

- **app** (`flowdesk-dev`) — `bun run dev`, código montado como volume (hot reload), em `http://localhost:8080`
- **postgres** (`flowdesk-postgres`) — Postgres 16, dados persistidos no volume `flowdesk_postgres_data`. `DATABASE_URL` já injetada no container da app.

Acesse `http://localhost:8080/system/index.html` — Clientes, Projetos, Demandas, Equipe e Reuniões já leem/gravam no Postgres via `/api/bootstrap`, `POST /api/:col`, `DELETE /api/:col/:id`. Se a API cair, o app cai para um cache local (`localStorage`) e avisa que está offline.

```bash
docker compose logs -f app      # acompanhar logs
docker compose down             # parar (mantém o volume do Postgres)
docker compose down -v          # parar e apagar os dados do Postgres
```

### Sem Docker

```bash
bun install
bun run dev
```

## Build de produção

```bash
bun run build   # gera .output/server (SSR + API) e .output/public (estáticos)
bun run .output/server/index.mjs   # serve o build gerado, pra conferir localmente
```

## Deploy

Em produção o app roda em container próprio (`Dockerfile` + `docker-compose.prod.yml`), incluindo o Postgres (volume `flowdesk_postgres_data_prod`). Deploy atual: `http://163.176.239.42:9003/`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
bun run db:push   # uma vez, contra o DATABASE_URL de produção — não roda automático no boot
```
