# Install & run

## Paths

| Goal | Command |
| --- | --- |
| Try OpenFlow | `docker compose up -d` → http://localhost:3000 → **Run sample workflow** |
| Install without cloning | `curl -fsSL …/scripts/install.sh \| bash` |
| Install with auth (owner setup) | `…/install.sh \| bash -s -- --prod` |
| Contribute / develop | `npm run setup && npm run dev` |
| Production-ish | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |

## First-run experience

After the stack is healthy:

1. Open the UI (default **http://localhost:3000**).
2. **Try-out** (`AUTH_DISABLED=true`, default): no login. On the home page use **Run sample workflow**, then **Execute** for a zero-credential success.
3. **Production / auth on** (`AUTH_DISABLED=false`, `--prod`, or prod compose overlay): if no users exist, the UI redirects to **`/setup`** to create the **instance owner**. That account gets the global `owner` role (secret providers, admin gates). Further registers are `member` unless promoted.
4. Dismiss the welcome checklist anytime; it is stored in browser `localStorage` (`openflow:onboarding.v1`).

Product readiness (not infra): `GET /api/v1/setup/status` → `{ authDisabled, hasUsers, needsOwner }`.

## Docker (recommended)

Requirements: Docker Engine + Compose v2.

```sh
git clone https://github.com/real-limitless/OpenFlow.git
cd OpenFlow
docker compose up -d
```

No `.env` file is required. On first start the container:

1. Waits for healthy Postgres and Redis
2. Generates `CREDENTIALS_KEY` if unset (persisted under the `secrets-data` volume)
3. Runs `prisma migrate deploy`
4. Serves the app on port **3000**

### Useful commands

```sh
docker compose ps
docker compose logs -f api
curl -s http://localhost:3000/health
curl -s http://localhost:3000/health/ready
docker compose down          # keep volumes
docker compose down -v       # wipe database + secrets (destructive)
```

### Optional `.env`

```sh
cp .env.example .env
# edit CREDENTIALS_KEY, assistant keys, AUTH_DISABLED, etc.
docker compose up -d
```

Compose still forces in-network `DATABASE_URL` / `REDIS_URL` to the `db` and `redis` services.

## install.sh (prebuilt image)

```sh
curl -fsSL https://raw.githubusercontent.com/real-limitless/OpenFlow/main/scripts/install.sh | bash
```

- Writes `~/openflow/docker-compose.yml` and `.env`
- Image default: `ghcr.io/real-limitless/openflow:latest` (override with `OPENFLOW_IMAGE`)
- Home dir override: `OPENFLOW_HOME=/opt/openflow bash install.sh`
- Polls `http://127.0.0.1:$PORT/health/ready` (default 90s), prints next steps, opens a browser when possible

| Flag | Meaning |
| --- | --- |
| `--prod` | New `.env` gets `AUTH_DISABLED=false` (owner setup on first open) |
| `--port N` | Host port (default 3000) |
| `--home PATH` | Install directory |
| `--no-open` | Do not open a browser |
| `--skip-wait` | Skip readiness poll |

```sh
bash install.sh --prod --port 3001 --no-open
```

Until GHCR packages are published for the repo, pull may fail — use `docker compose up -d --build` from a clone instead.

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
docker compose up -d db redis
# DATABASE_URL=postgresql://openflow:openflow@localhost:15432/openflow
npm run dev
```

Interactive menu: `npm run tui`.

## Production checklist

Use the prod overlay:

```sh
cp .env.example .env
# REQUIRED: strong 64-char hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# put result in CREDENTIALS_KEY=

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

| Item | Recommendation |
| --- | --- |
| Auth | `AUTH_DISABLED=false` (prod overlay default) |
| Secrets | Stable `CREDENTIALS_KEY`; back up `secrets-data` volume |
| Hot nodes | Off in prod (`OPENFLOW_HOT_NODES=false`) |
| Postgres / Redis | Bound to `127.0.0.1` in prod overlay; do not publish publicly |
| TLS | Terminate with Caddy, nginx, or Traefik in front of `:3000` |
| Backups | Volume snapshots for `pgdata`, `binary-data`, `secrets-data` |
| Image pin | Prefer a version tag, not only `latest` |

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
| `AUTH_DISABLED` | `true` | Set `false` for real deployments |
| `CREDENTIALS_KEY` | auto-generated | AES key for stored credentials |
| `DATABASE_URL` | compose internal | Host dev uses `localhost:15432` |
| `REDIS_URL` | compose internal | Optional for execute (in-process fallback) |
| `BINARY_STORAGE_DIR` | `/data/binary` | Workflow binary payloads (fs mode) |
| `BINARY_STORAGE` | `fs` | `fs` or `s3` (MinIO/AWS-compatible) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | `json` | `json` or `pretty` |
| `LOG_STREAM_TYPE` | `none` | `none` / `http` / `datadog` |
| `LOG_STREAM_URL` | — | HTTP sink URL when `LOG_STREAM_TYPE=http` |
| `DD_API_KEY` | — | Datadog Logs API key when type=`datadog` |
| `RUN_WORKER` | `true` | BullMQ worker inside API process |
| `OPENFLOW_ASSISTANT_*` | optional | Editor AI assistant |

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
| API unhealthy / migrate errors | `docker compose logs api`; ensure `db` is healthy |
| Port 3000 in use | `OPENFLOW_PORT=3001` with deploy compose, or change ports mapping |
| Local `npm run dev` can't reach DB | `docker compose up -d db redis` and use port **15432** |
| Native module build fails on host | Use Docker path, or install build tools (`python3`, `make`, `g++`) |
