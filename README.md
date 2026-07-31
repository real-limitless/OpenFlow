# OpenFlow

Self-hosted workflow automation engine, compatible with n8n workflow definitions.

## Quick start (Docker)

**Only Docker is required.** No Node.js, no manual database setup.

```sh
docker compose up -d
```

Open **http://localhost:3000**

First boot builds the image, starts Postgres + Redis + API, runs migrations, and generates a credentials key if you did not set one.

```sh
# logs
docker compose logs -f api

# stop
docker compose down
```

### One-line install (prebuilt image)

When the GHCR image is published for your fork:

```sh
curl -fsSL https://raw.githubusercontent.com/real-limitless/OpenFlow/main/scripts/install.sh | bash
```

Installs under `~/openflow` by default (`OPENFLOW_HOME` to override).

### Production overlay

```sh
# set a strong CREDENTIALS_KEY in .env first
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Turns auth on by default, disables hot-reload, binds DB/Redis to localhost only. Put TLS (Caddy/nginx/Traefik) in front before exposing to the internet. See [docs/install.md](docs/install.md).

---

## Development

Requires **Node.js 22+** and Docker (for Postgres + Redis).

```sh
git clone https://github.com/real-limitless/OpenFlow.git
cd OpenFlow
npm run setup          # .env, deps, db/redis, migrations
npm run dev            # http://localhost:3000
```

Or use the interactive menu: `npm run tui`

| Script | What it does |
| --- | --- |
| `npm run setup` | First-time local setup |
| `npm run dev` | Vite + API (TanStack Start) |
| `npm run dev:api` | Hono API only |
| `npm run docker:up` | Full stack in Docker |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:studio` | Prisma Studio |

Copy `.env.example` → `.env` if you skip `setup` (it generates `CREDENTIALS_KEY` for you).

---

## Tech stack

- **Frontend**: React, TanStack Start, Tailwind CSS, React Flow
- **Backend**: Hono (API), Prisma (PostgreSQL), BullMQ (Redis)
- **Language**: TypeScript

## Project structure

```
src/
  server/         # Hono API server (routes, middleware)
  lib/            # Shared logic (workflow engine, node definitions, expressions)
  sdk/            # OpenFlow Plugin SDK (node authoring surface)
  components/     # React UI components
prisma/
  schema.prisma   # Database schema
docs/
  install.md      # Install / production notes
  clean-room.md   # Clean-room rules
  sdk/            # SDK overview + non-goals
  specs/          # Per-node behavioral specs
```

> `src/lib/workflow`, `src/lib/nodes`, `src/lib/expressions`, and `src/sdk` are framework-agnostic and contain no React imports.

## Clean-room node pipeline

1. Spec agent: `docs/prompts/01-spec-from-public-docs.md` → `docs/specs/nodes/*.md`
2. Implement agent (separate session): `docs/prompts/02-implement-from-spec.md` → SDK nodes
3. **OpenCode batches of 4:** `scripts/factory/README.md` + catalog `docs/specs/CATALOG.md`
4. **Hot-load (dev):** `POST /api/v1/dev/reload-nodes` when `OPENFLOW_HOT_NODES=1`
5. **Batch tests:** `npm run test:batch -- 00`
6. **Dogfood:** `npm run test:dogfood` · fixtures in `workflows/dogfood/` · `docs/dogfood.md`
7. **Factory:** `npm run factory:batch -- 05` · see `scripts/factory/README.md`

See `docs/clean-room.md` and `docs/sdk/OVERVIEW.md`.
