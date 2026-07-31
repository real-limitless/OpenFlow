# Install & run

## Paths

| Goal | Command |
| --- | --- |
| Try OpenFlow | `docker compose up -d` → http://localhost:3000 |
| Install without cloning | `curl -fsSL …/scripts/install.sh \| bash` |
| Contribute / develop | `npm run setup && npm run dev` |
| Production-ish | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |

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

Until GHCR packages are published for the repo, pull may fail — use `docker compose up -d --build` from a clone instead.

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
| `BINARY_STORAGE_DIR` | `/data/binary` | Workflow binary payloads |
| `RUN_WORKER` | `true` | BullMQ worker inside API process |
| `OPENFLOW_ASSISTANT_*` | optional | Editor AI assistant |

## Health endpoints

| Path | Purpose |
| --- | --- |
| `GET /health` | Liveness (Docker healthcheck) |
| `GET /health/ready` | DB + Redis readiness JSON |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `CREDENTIALS_KEY is not set` in production | Set env or rely on entrypoint + `secrets-data` volume |
| API unhealthy / migrate errors | `docker compose logs api`; ensure `db` is healthy |
| Port 3000 in use | `OPENFLOW_PORT=3001` with deploy compose, or change ports mapping |
| Local `npm run dev` can't reach DB | `docker compose up -d db redis` and use port **15432** |
| Native module build fails on host | Use Docker path, or install build tools (`python3`, `make`, `g++`) |
