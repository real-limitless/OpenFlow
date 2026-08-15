# OpenFlow toolbox container

Compose service for **git / shell / catalog RAG reindex**. Starts with the stack (no profile).

## Layout

| Path | Purpose |
| --- | --- |
| `/app` | OpenFlow source + `node_modules` **baked into the image** |
| `/data/workspace` | Shared agent scratch with `api` — **starts empty** (clones/scripts) |

If you only looked at `/data/workspace` or `/workspace`, that’s why it looked empty.

## Start / rebuild

```sh
docker compose up -d --build toolbox
# or full stack
docker compose up -d --build
```

Dokploy: redeploy so the toolbox image is rebuilt with current `src/` + scripts.

## Commands

### From the host (or Dokploy “Run command” on the **compose project**, not inside toolbox)

```sh
docker compose exec toolbox bash
docker compose exec toolbox catalog-reindex-hash
docker compose exec toolbox catalog-reindex
```

### Already inside the toolbox container (`root@…:/app#`)

Do **not** run `npm run docker:toolbox:*` — those call `docker`, which is not installed in the image.

```sh
# offline index (no embed API key)
catalog-reindex-hash
# or
npm run catalog:reindex:hash

# with OPENFLOW_CATALOG_EMBED_* / ASSISTANT_* key set
catalog-reindex
# or
npm run catalog:reindex

catalog-eval
ls /app/package.json          # app is here
ls /data/workspace            # agent scratch — often empty
```

## Catalog reindex

Uses `DATABASE_URL` pointing at the `db` service (in compose: `postgresql://openflow:openflow@db:5432/openflow`).

## Production

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build toolbox
```

Keep toolbox off public ingress; operator/exec only.
