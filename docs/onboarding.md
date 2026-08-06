# Onboarding

Get from zero to a running OpenFlow instance and your first workflow. For production hardening, use [install.md](install.md).

## Prerequisites

| Path | Requirements |
| --- | --- |
| Docker try-out | Docker Engine + Compose v2 |
| Local development | **Node.js ≥ 22**, npm, Docker (Postgres + Redis) |

## Path A — Try it (Docker only)

```sh
git clone https://github.com/real-limitless/OpenFlow.git
cd OpenFlow
docker compose up -d
```

1. Wait until `docker compose ps` shows `api` healthy (first build can take a few minutes).
2. Open [http://localhost:3000](http://localhost:3000).
3. Optional: `cp .env.example .env` and set keys, then `docker compose up -d` again.

Stop with `docker compose down` (volumes keep your data). Wipe data with `docker compose down -v`.

## Path B — Develop on the host (recommended for contributors)

### Option 1 — Install wizard (guided)

```sh
git clone https://github.com/real-limitless/OpenFlow.git
cd OpenFlow
npm run tui
```

Choose **Install wizard (multi-step)**. The wizard runs:

1. **Path** — Docker try-out vs local development  
2. **Prerequisites** — Node, npm, Docker Compose  
3. **Environment** — create `.env`, generate `CREDENTIALS_KEY`  
4. **Optional config** — auth on/off, assistant API key  
5. **Dependencies** — `npm ci` + Prisma generate  
6. **Infrastructure** — Postgres + Redis via Compose  
7. **Migrations** — `prisma migrate deploy`  
8. **Verify** — readiness checklist; optional `npm run dev`

The main menu also shows a **status strip**: `env · deps · docker · db · api`.

### Option 2 — One-shot setup

```sh
npm run setup    # non-interactive: .env, deps, db/redis, migrate
npm run dev      # http://localhost:3000
```

### After setup

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` or TUI → Run Dev Server |
| API only | `npm run dev:api` |
| Full Docker stack | `docker compose up -d` or TUI → Start Stack |
| Migrations | `npm run db:migrate` |
| Template marketplace | Open `/templates` or `npm run templates:sync` |
| Tests | `npm test` |
| Secret hygiene | `bash scripts/check-no-secrets.sh` |

### Template marketplace

Default library: [real-limitless/n8n-workflow-library](https://github.com/real-limitless/n8n-workflow-library) (`config/template-sources.json`).

- **`npm run setup`** seeds it automatically (skip with `OPENFLOW_SKIP_TEMPLATE_SYNC=1`).
- **First-time `/setup`** can load it via the “Load community templates” checkbox.
- **Empty `/templates`** has a **Load n8n-workflow-library** button.
- **Settings → Templates** — add more git repos anytime after setup.

## First-run expectations

- **Auth is disabled** by default (`AUTH_DISABLED=true`). Anyone who can reach the port can use the app. Keep it local or put it behind a private network until you enable auth.
- **`CREDENTIALS_KEY`** encrypts credential payloads in the database. Do not lose or commit it. Docker persists a generated key on the `secrets-data` volume if unset.
- **Ports**
  - App: `3000`
  - Postgres (published for host dev): `15432`
  - Redis: `6379`

## Configure the editor assistant (optional)

```sh
# .env
OPENFLOW_ASSISTANT_API_KEY="…"
OPENFLOW_ASSISTANT_BASE_URL="https://openrouter.ai/api/v1"
OPENFLOW_ASSISTANT_MODEL="openai/gpt-4o-mini"
```

Details: [assistant.md](assistant.md). You can also set the key in the TUI install wizard.

## First workflow (smoke)

1. Open the app and create or open a workflow.
2. Add a simple graph (e.g. Manual Trigger → Set / Code) and execute.
3. Or import a dogfood fixture from `workflows/dogfood/` once the UI/import path is available in your build.

Automated smoke: `npm run test:dogfood` (see [dogfood.md](dogfood.md)).

## Project map (where to look)

| Area | Path |
| --- | --- |
| API routes | `src/server/routes/` |
| Workflow engine | `src/lib/engine/` |
| Node definitions | `src/lib/nodes/definitions/` |
| Plugin SDK | `src/sdk/` |
| UI editor | `src/components/editor/` |
| Schema / migrations | `prisma/` |
| Node specs | `docs/specs/` |

## Contributing next steps

1. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [clean-room.md](clean-room.md).
2. For new nodes: spec from public docs only → implement from spec via the SDK ([sdk/OVERVIEW.md](sdk/OVERVIEW.md)).
3. Run `npm test` / batch tests before opening a PR.
4. Never commit `.env` or real keys — [SECURITY.md](../SECURITY.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run dev` can't reach DB | `docker compose up -d db redis`; `DATABASE_URL` uses port **15432** |
| Node version errors | Install Node **≥ 22** |
| Docker API unhealthy | `docker compose logs -f api`; ensure `db` is healthy |
| Missing `CREDENTIALS_KEY` | Re-run setup/wizard, or generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Port 3000 in use | Stop the other process or change the compose port mapping |

More: [install.md](install.md#troubleshooting).
