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

```sh
docker compose exec toolbox bash
docker compose exec toolbox catalog-reindex        # needs embed API key
docker compose exec toolbox catalog-reindex-hash   # offline / no key
docker compose exec toolbox catalog-eval

# npm helpers
npm run docker:toolbox:shell
npm run docker:toolbox:reindex:hash
```

## Catalog reindex

```sh
# inside toolbox or via exec:
catalog-reindex-hash
# with OpenAI-compatible embeddings (OPENFLOW_CATALOG_EMBED_* or ASSISTANT_*):
catalog-reindex
```

Uses `DATABASE_URL` pointing at the `db` service.

## Production

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build toolbox
```

Keep toolbox off public ingress; operator/exec only.
