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
  components/     # React UI components
prisma/
  schema.prisma   # Database schema
```

> `src/lib/workflow`, `src/lib/nodes`, and `src/lib/expressions` are framework-agnostic and contain no React imports.
