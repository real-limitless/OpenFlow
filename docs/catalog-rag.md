# Semantic node catalog (RAG)

OpenFlow indexes the node registry (and optional `docs/specs/nodes/*.md` blurbs) into a vector catalog so agents and the UI can discover **domain nodes before shell**.

Shell (`executeCommand` / SSH) stays **available** but is **rank-penalized**.

## Architecture

| Piece | Role |
| --- | --- |
| Corpus builder | `src/lib/catalog/corpus.ts` — summary / operations / spec chunks |
| Embeddings | OpenAI-compatible `/embeddings` or offline **hash** embed |
| Storage | Postgres `node_catalog_chunks` (+ optional pgvector column) |
| Suggest | Hybrid: vector similarity + keyword fuzzy + shell penalty |
| Surfaces | MCP `suggest_nodes`, `POST /api/v1/catalog/suggest-nodes`, Node palette, AI **Node Catalog** tool |

## Setup

```bash
# migration (enables vector extension when available)
npm run db:deploy   # or db:migrate

# index (prefer real embeddings when key is set)
export OPENFLOW_CATALOG_EMBED_API_KEY=...   # or reuse OPENFLOW_ASSISTANT_API_KEY
export OPENFLOW_CATALOG_EMBED_BASE_URL=https://openrouter.ai/api/v1   # optional
export OPENFLOW_CATALOG_EMBED_MODEL=text-embedding-3-small           # or provider model
npm run catalog:reindex

# offline / CI hash index
npm run catalog:reindex:hash
```

### Env

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENFLOW_CATALOG_RAG_ENABLED` | on | Master switch |
| `OPENFLOW_CATALOG_EMBED_BASE_URL` | assistant / OpenAI base | **Remote** OpenAI-compatible embed server (`…/v1`) |
| `OPENFLOW_CATALOG_EMBED_API_KEY` | assistant key | Bearer token (optional if no-auth) |
| `OPENFLOW_CATALOG_EMBED_NO_AUTH` | auto if base URL set | Allow TEI/Ollama without API key |
| `OPENFLOW_CATALOG_EMBED_MODEL` | `text-embedding-3-small` | Model id |
| `OPENFLOW_CATALOG_EMBED_DIMS` | `1536` | Vector size (must match model) |
| `OPENFLOW_CATALOG_EMBED_BATCH` | `32` | Texts per request (raise on GPU TEI) |
| `OPENFLOW_CATALOG_EMBED_CONCURRENCY` | `4` | Parallel embed batches |
| `OPENFLOW_CATALOG_SHELL_PENALTY` | `0.35` | Score subtraction for shell-tier nodes |
| `OPENFLOW_CATALOG_USE_PGVECTOR` | on | Write/query `vector(1536)` when extension works |

### Remote embedding server (faster reindex)

Point catalog at a dedicated embed API (not the chat model):

```sh
# Dokploy / compose env — example TEI on a GPU box
OPENFLOW_CATALOG_EMBED_BASE_URL=http://10.0.0.5:8080/v1
OPENFLOW_CATALOG_EMBED_NO_AUTH=true
OPENFLOW_CATALOG_EMBED_MODEL=BAAI/bge-base-en-v1.5
OPENFLOW_CATALOG_EMBED_DIMS=768
OPENFLOW_CATALOG_EMBED_BATCH=64
OPENFLOW_CATALOG_EMBED_CONCURRENCY=4
```

Then inside toolbox:

```sh
catalog-reindex
# log should show: embed: mode=api model=… batch=64 concurrency=4
```

Changing model or dims requires a full reindex. Hash mode (`catalog-reindex-hash`) is only for offline smoke tests.

## MCP

```
suggest_nodes({ intent: "clone a git repository", limit: 8 })
```

Then `get_node_type` → `add_node`. Prefer `rankTier: domain|core` over `shell-fallback`.

Assistant / MCP instructions encode the same ladder (domain → compose → shell last).

## HTTP

- `POST /api/v1/catalog/suggest-nodes` `{ intent, limit?, includeShell? }`
- `GET /api/v1/catalog/stats`
- `POST /api/v1/catalog/reindex` `{ forceHash? }` (authenticated)

## Runtime AI Agent

Add **Node Catalog** (`openflow-node-langchain.toolNodeCatalog`) on `ai_tool`.  
The tool runs the same `suggestNodes` service and tells the model to prefer domain types.

## UI

Node palette: multi-word / longer queries call semantic suggest and show a **Suggested** strip with tier badges.

## Ops notes

- Reindex after large node definition changes.
- Changing embed model/dims requires a full reindex.
- Empty catalog falls back to keyword `list_node_types` / palette filter.
- Spec chunks are truncated paraphrases of public clean-room specs — not a substitute for `get_node_type`.

## Docker toolbox

Compose includes a **toolbox** service (no profile). App is baked at `/app`; `/data/workspace` is empty agent scratch shared with `api`.

```sh
docker compose up -d --build toolbox
docker compose exec toolbox catalog-reindex        # API embeddings
docker compose exec toolbox catalog-reindex-hash   # offline
docker compose exec toolbox catalog-eval
```

See [toolbox.md](toolbox.md). The `db` service uses `pgvector/pgvector:pg16` so the optional `vector` column / HNSW index can activate.

## Full RAG platform (target)

| Surface | Entry |
| --- | --- |
| MCP | `suggest_nodes({ intent })` then `get_node_type` / `add_node` |
| HTTP | `POST /api/v1/catalog/suggest-nodes` |
| UI | Node palette multi-word search → Suggested strip |
| Runtime agent | **Node Catalog** tool (`toolNodeCatalog`) on `ai_tool` |
| Operator | toolbox container + `npm run catalog:reindex` |

Preference ladder (shell **allowed**, ranked low):

1. Domain/core nodes from `suggest_nodes`
2. Compose Code / Set / IF when partial
3. Execute Command / SSH when no catalog node fits or user asks for host shell

## Eval (manual / CI seed)

| Intent | Expect top types to include |
| --- | --- |
| clone a git repository | `openflow-node-base.git` above `executeCommand` |
| list github issues | `openflow-node-base.github` |
| send email via smtp | `openflow-node-base.emailSend` |
| run arbitrary bash on host | `executeCommand` allowed near top |
