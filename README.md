# OpenFlow

Self-hosted workflow automation engine, compatible with n8n workflow definitions.

## Tech Stack

- **Frontend**: React, TanStack Start, Tailwind CSS, React Flow
- **Backend**: Hono (API server), Prisma (ORM)
- **Language**: TypeScript

## Quick Start

```sh
git clone <this-repository-url>
cd openflow
npm i
npm run dev
```

The dev server starts on `http://localhost:3000`.

## API Development

Run the Hono API server independently:

```sh
npm run dev:api
```

This starts the API with hot-reload via `tsx watch`.

## Database

```sh
# Create and apply migrations
npm run db:migrate

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Regenerate Prisma client after schema changes
npm run db:generate
```

## Docker

```sh
docker-compose up
```

## Project Structure

```
src/
  server/         # Hono API server (routes, middleware)
  lib/            # Shared logic (workflow engine, node definitions, expressions)
  sdk/            # OpenFlow Plugin SDK (node authoring surface)
  components/     # React UI components
prisma/
  schema.prisma   # Database schema
docs/
  clean-room.md   # Clean-room rules
  sdk/            # SDK overview + non-goals
  specs/          # Per-node behavioral specs
  prompts/        # Spec / implement agent prompts
```

> `src/lib/workflow`, `src/lib/nodes`, `src/lib/expressions`, and `src/sdk` are framework-agnostic and contain no React imports.

## Clean-room node pipeline

1. Spec agent: `docs/prompts/01-spec-from-public-docs.md` → `docs/specs/nodes/*.md`
2. Implement agent (separate session): `docs/prompts/02-implement-from-spec.md` → SDK nodes
3. **OpenCode batches of 4:** `scripts/factory/README.md` + catalog `docs/specs/CATALOG.md`
4. **Hot-load (dev):** `POST /api/v1/dev/reload-nodes` when `OPENFLOW_HOT_NODES=1`
5. **Batch tests:** `npm run test:batch -- 00`
6. **Dogfood:** `npm run test:dogfood` · fixtures in `workflows/dogfood/` · `docs/dogfood.md`

See `docs/clean-room.md` and `docs/sdk/OVERVIEW.md`.
