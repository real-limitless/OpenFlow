# Install & run

New to the project? Start with [onboarding.md](onboarding.md) (guided TUI wizard) or the [README](../README.md). This page is the full install / production reference.

## Paths

| Goal | Command |
| --- | --- |
| Try OpenFlow | Set `REDIS_PASSWORD`, then `docker compose -f docker-compose.yml -f docker-compose.local-ports.yml up -d` → http://127.0.0.1:3000 → **Run sample workflow** |
| Toolbox (git/shell/RAG) | included in `docker compose up -d` → [toolbox.md](toolbox.md) |
| One-line TUI install | `curl -fsSL …/scripts/get-openflow.sh \| bash` |
| Non-interactive try-out | `…/get-openflow.sh \| bash -s -- --yes` |
| Install with auth (owner setup) | `…/get-openflow.sh \| bash -s -- --yes --mode production` |
| Build from source (no GHCR) | `…/get-openflow.sh \| bash -s -- --yes --mode build` |
| Contribute / develop | `…/get-openflow.sh --mode develop` or `npm run setup && npm run dev` |
| Production-ish compose overlay | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |

## First-run experience

After the stack is healthy:

1. Open the UI (loopback **http://127.0.0.1:3000** when the local-ports file is included).
2. **Auth on** (default, `AUTH_DISABLED=false`): if no real users exist, the UI redirects to **`/setup`** to create the **instance owner**.
3. **First owner**: `GET /api/v1/setup/status` returns `needsOwner: true` until a real user exists. Public `POST /api/v1/auth/register` creates that owner only when `OPENFLOW_OPEN_REGISTER=true`, or when `OPENFLOW_ALLOW_FIRST_OWNER=true` (one-time bootstrap; set it back to false after). With both false (the default), that request returns `403` and `invite_only` and does not create a user, even when no real users exist. A valid invite token can still register. The zero-user account receives the global `owner` role.
4. **INSECURE local try-out** (`AUTH_DISABLED=true` in `.env` only): no login. On the home page use **Run sample workflow**, then **Execute**. Do not expose that mode past your own machine.
5. Dismiss the welcome checklist anytime; it is stored in browser `localStorage` (`openflow:onboarding.v1`).

Product readiness (not infra): `GET /api/v1/setup/status` → `{ authDisabled, hasUsers, needsOwner, registrationOpen, inviteOnly }`.

## Docker (recommended)

Requirements: Docker Engine + Compose v2.

```sh
git clone https://github.com/real-limitless/OpenFlow.git
cd OpenFlow
cp .env.example .env
# set REDIS_PASSWORD (required, no default): openssl rand -hex 24
docker compose -f docker-compose.yml -f docker-compose.local-ports.yml up -d
```

`REDIS_PASSWORD` is required. Postgres still defaults to the dev-only password `openflow` until the prod overlay. On first start the container:

1. Waits for healthy Postgres and Redis
2. Starts the API and the worker. The worker does not wait on API health
3. Generates `CREDENTIALS_KEY` if unset (persisted under the `secrets-data` volume)
4. Runs `prisma migrate deploy`
5. Serves the app on port **3000** inside the `api` network. The local-ports file publishes it on `127.0.0.1` only.

### Useful commands

```sh
docker compose ps
docker compose logs -f api
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/ready
docker compose down          # keep volumes
docker compose down -v       # wipe database + secrets (destructive)

# Toolbox (git/shell/catalog RAG) — starts with the stack
docker compose up -d --build toolbox
docker compose exec toolbox bash
docker compose exec toolbox catalog-reindex-hash
# see docs/toolbox.md and docs/catalog-rag.md
```

### Optional `.env`

```sh
cp .env.example .env
# set REDIS_PASSWORD. AUTH_DISABLED=true is an INSECURE local try-out.
docker compose -f docker-compose.yml -f docker-compose.local-ports.yml up -d
```

Compose builds the in-network `DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` (dev default `openflow` / `openflow` / `openflow`) and builds `REDIS_URL` from `REDIS_PASSWORD`. A `DATABASE_URL` in `.env` is for the API on the host (`localhost:15432`, debug-ports overlay) and is overridden inside containers.

## get-openflow.sh (recommended one-liner)

Full installer with an interactive TUI (and non-interactive flags):

```sh
curl -fsSL https://raw.githubusercontent.com/real-limitless/OpenFlow/main/scripts/get-openflow.sh | bash
```

| Mode | What it does |
| --- | --- |
| `tryout` (default) | Prebuilt image under `~/openflow`. **INSECURE**: `AUTH_DISABLED=true` (no login). Local only |
| `production` | Same stack with auth on → first open is `/setup` owner account |
| `build` | `git clone` + `docker compose up -d --build` (when GHCR image missing) |
| `develop` | `git clone` + `npm run setup` (Node 22+) |

| Flag | Meaning |
| --- | --- |
| `--yes` / `-y` | Skip TUI and confirmations |
| `--mode tryout\|production\|build\|develop` | Install path |
| `--prod` | Shortcut for `--mode production` |
| `--port N` | Host port (default 3000) |
| `--home PATH` | Data / compose directory |
| `--clone-dir PATH` | Git clone path for build/develop |
| `--image REF` | Container image override |
| `--no-open` | Do not open a browser |
| `--skip-wait` | Skip readiness poll |

```sh
bash scripts/get-openflow.sh --yes --mode production --port 3001 --no-open
```

`scripts/install.sh` is a thin wrapper: `get-openflow.sh --yes` with the same flags (kept for older docs / bookmarks).

Until GHCR packages are published, use `--mode build` or `docker compose up -d --build` from a clone.

## Binary storage (S3 / MinIO)

Default is local filesystem (`BINARY_STORAGE=fs`, volume `binary-data` in Docker).

For multi-worker or shared object storage:

```sh
# .env
BINARY_STORAGE=s3
BINARY_S3_BUCKET=openflow
BINARY_S3_REGION=us-east-1
BINARY_S3_ENDPOINT=http://minio:9000
BINARY_S3_ACCESS_KEY=minioadmin
BINARY_S3_SECRET_KEY=minioadmin
BINARY_S3_FORCE_PATH_STYLE=true
BINARY_S3_PREFIX=openflow/binary/
```

Optional MinIO service (add alongside `api` in compose):

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio-data:/data
```

Create bucket `openflow` in the MinIO console (http://localhost:9001) before starting API workers.

## Development setup

Requirements: **Node.js ≥ 22**, npm, Docker.

```sh
npm run setup    # .env, npm ci, prisma generate, db+redis, migrate
npm run dev      # http://localhost:3000
```

Infra only (API on the host):

```sh
# publishes Postgres and Redis on loopback only
docker compose -f docker-compose.yml -f docker-compose.debug-ports.yml up -d db redis
# DATABASE_URL=postgresql://openflow:openflow@localhost:15432/openflow
# REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6379
npm run dev
```

Interactive menu + multi-step install: `npm run tui` (see [onboarding.md](onboarding.md)).

Secret hygiene before you publish a branch: `bash scripts/check-no-secrets.sh` · [SECURITY.md](../SECURITY.md).

## Production checklist

Use the prod overlay. `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required and must not be dev defaults. Compose builds `DATABASE_URL` from the Postgres variables and `REDIS_URL` from `REDIS_PASSWORD`. Do not point either password at `CREDENTIALS_KEY`. db and redis publish no host ports.

```sh
cp .env.example .env
# REQUIRED: strong 64-char hex key (credential encryption — not the DB password)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# put result in CREDENTIALS_KEY=

# REQUIRED: dedicated database password (hex is URL-safe)
openssl rand -hex 24
# put result in POSTGRES_PASSWORD=
# optional: POSTGRES_USER and POSTGRES_DB (default openflow / openflow)

# REQUIRED: dedicated Redis password (no default)
openssl rand -hex 24
# put result in REDIS_PASSWORD=

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# loopback UI only, if you are not attaching a reverse proxy to the api network:
# docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.local-ports.yml up -d
```

`docker compose` fails immediately when `POSTGRES_PASSWORD` or `REDIS_PASSWORD` is unset. The value `openflow` (and other placeholders) is refused before Postgres accepts connections. `redis`, `openflow`, and other placeholders are refused before Redis accepts connections. The API/worker entrypoint exits before migrations.

| Item | Recommendation |
| --- | --- |
| Auth | `AUTH_DISABLED=false` (default) |
| Registration | `OPENFLOW_OPEN_REGISTER=false` (default). First owner needs `OPENFLOW_ALLOW_FIRST_OWNER=true` or an invite |
| Secrets | Stable `CREDENTIALS_KEY`; back up `secrets-data` volume |
| Database | Dedicated `POSTGRES_PASSWORD`. Optional `POSTGRES_USER` / `POSTGRES_DB` |
| Redis | Dedicated `REDIS_PASSWORD`. No default. Compose builds `REDIS_URL` |
| Hot nodes | Off unless `OPENFLOW_HOT_NODES=true` |
| Metrics | Set `OPENFLOW_METRICS_TOKEN` in production or `GET /metrics` returns 404 |
| Postgres / Redis | Internal `backend` network. No host ports. Debug overlay is opt-in |
| API | No host port by default. Reverse proxy on the `api` network, or `docker-compose.local-ports.yml` |
| TLS | Terminate in front of the API |
| Backups | Volume snapshots for `pgdata`, `binary-data`, `secrets-data` |
| Image pin | Prefer a version tag, not only `latest` |
| Worker | Separate `worker` service (`OPENFLOW_ROLE=worker`). It starts once Postgres and Redis are healthy |

### Migrating an existing compose deploy

Stacks that already use the dev Postgres password `openflow` keep that volume. Set `REDIS_PASSWORD` before the next `up` (Redis now requires it; there is no default). Add `docker-compose.local-ports.yml` if you still want the API on `127.0.0.1:3000`.

Production stacks that already set `POSTGRES_PASSWORD` to a non-default value, with user and database `openflow`, keep working. You can remove `DATABASE_URL` from the environment you pass to Compose. The overlay builds `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@db:5432/POSTGRES_DB`.

If the running database was initialized with a different password than the one you want to keep using (the old hardcoded `openflow`, or a stopgap that copied `CREDENTIALS_KEY`):

```sh
# while the current password still works
docker compose exec db psql -U openflow -d openflow -c "ALTER USER openflow PASSWORD 'new-password';"
```

Then set `POSTGRES_PASSWORD=new-password` in `.env` and recreate `api` and `worker`. Changing `POSTGRES_USER` or `POSTGRES_DB` does not rename a role or database that already exists in the volume; set them only when they already match the volume.

`CREDENTIALS_KEY` stays the credential-encryption key. Rotate it on its own schedule. Rotating it does not change the database password, and rotating `POSTGRES_PASSWORD` does not re-encrypt stored credentials.

Host-side `npm run dev` still uses `DATABASE_URL` (`localhost:15432`). That variable is not the in-container URL.

### Minimal Caddy example

```caddyfile
openflow.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

### Minimal nginx snippet

```nginx
server {
  listen 443 ssl http2;
  server_name openflow.example.com;
  # ssl_certificate …;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Configuration

See [`.env.example`](../.env.example) for the full list. Common vars:

| Variable | Default (Docker try-out) | Notes |
| --- | --- | --- |
| `AUTH_DISABLED` | `false` | `true` is an INSECURE local try-out with no login |
| `OPENFLOW_OPEN_REGISTER` | `false` | `true` keeps public signup open, including the first owner |
| `OPENFLOW_ALLOW_FIRST_OWNER` | `false` | `true` allows one public first-owner signup while open register stays false |
| `OPENFLOW_HOT_NODES` | `false` | Set `true` only to hot-load node executors |
| `REDIS_PASSWORD` | required, no default | Compose builds `REDIS_URL`. Prod refuses placeholders |
| `OPENFLOW_METRICS_TOKEN` | unset | Required in production or `GET /metrics` is 404 |
| `TRUSTED_PROXY_COUNT` / `TRUSTED_PROXY_CIDRS` | unset | Rate limit and audit use the socket address until a proxy is trusted |
| `CREDENTIALS_KEY` | auto-generated | AES key for stored credentials. Not the database password |
| `POSTGRES_PASSWORD` | `openflow` (dev only) | Required in production. Compose builds `DATABASE_URL` from this |
| `POSTGRES_USER` / `POSTGRES_DB` | `openflow` | Optional. Must match the role and database already in the volume |
| `DATABASE_URL` | compose-built inside containers | Host dev uses `localhost:15432`. Do not derive it from `CREDENTIALS_KEY` |
| `REDIS_URL` | compose internal | Optional for execute (in-process fallback) |
| `BINARY_STORAGE_DIR` | `/data/binary` | Workflow binary payloads (fs mode) |
| `BINARY_STORAGE` | `fs` | `fs` or `s3` (MinIO/AWS-compatible) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | `json` | `json` or `pretty` |
| `LOG_STREAM_TYPE` | `none` | `none` / `http` / `datadog` |
| `LOG_STREAM_URL` | — | HTTP sink URL when `LOG_STREAM_TYPE=http` |
| `DD_API_KEY` | — | Datadog Logs API key when type=`datadog` |
| `OPENFLOW_ROLE` | `main` on `api`, `worker` on `worker` | Host `npm run dev` defaults to `all` (worker in the API process) |
| `RUN_WORKER` | `false` on `api`, `true` on `worker` | BullMQ consumer. Queued runs need the `worker` service |
| `OPENFLOW_ASSISTANT_*` | optional | Editor AI assistant |
| `OPENFLOW_MCP_ENABLED` / `OPENFLOW_PUBLIC_URL` | optional | Remote MCP + OAuth ([docs/mcp.md](mcp.md)) |

## Logging

Structured JSON logs go to stdout by default. Optional shipping:

```sh
# HTTP webhook (each line POSTed as JSON)
LOG_STREAM_TYPE=http
LOG_STREAM_URL=https://logs.example.com/ingest

# Datadog Logs
LOG_STREAM_TYPE=datadog
DD_API_KEY=…
# DD_SITE=datadoghq.com
```

Recent in-process logs: `GET /api/v1/logs/recent` (authenticated when auth is on).

## Health endpoints

| Path | Purpose |
| --- | --- |
| `GET /health` | Liveness (Docker healthcheck) |
| `GET /health/ready` | DB + Redis readiness JSON |
| `GET /api/v1/logs/recent` | Ring-buffer of recent structured logs |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `CREDENTIALS_KEY is not set` in production | Set env or rely on entrypoint + `secrets-data` volume |
| `POSTGRES_PASSWORD` missing or refused | Set a dedicated non-default password. Do not reuse `CREDENTIALS_KEY`. See the migration notes above |
| Worker container stays `Created` | It no longer waits on API health. `docker compose ps` should show `worker` running after Postgres and Redis are healthy. `docker compose logs worker` |
| API unhealthy / migrate errors | `docker compose logs api`; ensure `db` is healthy |
| Port 3000 in use | `OPENFLOW_PORT=3001` with deploy compose, or change ports mapping |
| Local `npm run dev` can't reach DB | `docker compose up -d db redis` and use port **15432** |
| Native module build fails on host | Use Docker path, or install build tools (`python3`, `make`, `g++`) |
