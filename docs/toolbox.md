# OpenFlow toolbox container

Optional Compose service for **git / shell / catalog RAG reindex** without stuffing the API image.

Shell stays available; agents should still **prefer domain nodes** (`git`, `github`, …) via `suggest_nodes` — see [catalog-rag.md](catalog-rag.md).

## Start

```sh
# core stack
docker compose up -d

# toolbox (profile: tools)
docker compose --profile tools up -d toolbox
# or
npm run docker:toolbox
```

Shared volume: `workspace-data` → `/data/workspace` on **api** and **toolbox**.

## Commands

```sh
# interactive shell (git, bash, python3, jq, rg, psql, …)
docker compose --profile tools exec toolbox bash
npm run docker:toolbox:shell

# semantic catalog reindex (needs embed key in .env, or use :hash)
docker compose --profile tools run --rm toolbox catalog-reindex
npm run docker:toolbox:reindex
npm run docker:toolbox:reindex:hash
npm run docker:toolbox:eval
```

The toolbox mounts the repo at `/workspace` so `catalog-reindex` can load `src/lib/catalog` + node definitions. First run may `npm ci` if `node_modules` is missing on the mount.

## What it’s for

| Use | How |
| --- | --- |
| Catalog RAG reindex / eval | `catalog-reindex`, `catalog-eval` |
| Manual git clone / inspect agent workdirs | `bash` → `cd /data/workspace` |
| One-off scripts next to the app | `docker compose run --rm toolbox python3 scripts/…` |
| Debugging worker filesystem layout | same shared volume as api `OPENFLOW_WORKSPACE_DIR` |

## What it’s not

- Not a replacement for **Git** / **GitHub** / **HTTP** nodes on the canvas
- Not the API or worker process
- Not exposed on a host port by default (exec/run only)

## Production

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools up -d toolbox
```

Keep the toolbox off public ingress; use it as an operator sidecar only.
