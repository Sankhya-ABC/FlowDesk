# FlowDesk

Sistema de Gestão de Projetos e Demandas.

Stack: [TanStack Start](https://tanstack.com/start) (React 19 SSR) + Vite + Tailwind, servido em runtime pelo [Bun](https://bun.sh).

## Desenvolvimento com Docker

Pré-requisito: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up -d
```

Isso sobe dois containers:

- **app** (`flowdesk-dev`) — `bun run dev`, código montado como volume (hot reload), em `http://localhost:8080`
- **postgres** (`flowdesk-postgres`) — Postgres 16, dados persistidos no volume `flowdesk_postgres_data`. A `DATABASE_URL` já é injetada no container da app apontando para esse banco (`postgres://flowdesk:flowdesk@postgres:5432/flowdesk` por padrão — a aplicação ainda não consome o banco, é só a infra disponível).

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
bun run build   # gera .output/server (SSR) e .output/public (estáticos)
bun run preview # serve o build gerado, para conferir localmente
```

## Deploy

Em produção o app roda em container próprio (`Dockerfile` + `docker-compose.prod.yml`), com o Nitro build (`.output`) embrulhado por `server-run.mjs` num `Bun.serve`. Deploy atual: `http://163.176.239.42:9003/`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
