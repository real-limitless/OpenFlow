---
type: "@n8n/n8n-nodes-langchain.vectorStoreRedis"
displayName: Redis Vector Store
category: AI
versions: [1, 1.1, 1.2, 1.3]
priority: medium
status: specced
---

# Redis Vector Store

Cluster **root** node: provides a Redis-backed vector store for RAG workflows. Data is persisted in a Redis database with the Redis Query Engine (RediSearch/VSS). Supports five modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, **Retrieve Documents (As Tool for AI Agent)**, and **Update Documents** (update by ID).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreredis.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/redis.md | Public docs only |
| https://redis.io/docs/latest/develop/ai/search-and-query/vectors/ | Public docs only (service contract) |
| https://redis.io/docs/latest/develop/interact/search-and-query/ | Public docs only (service contract) |
| https://js.langchain.com/docs/integrations/vectorstores/redis | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreRedis`
- **Aliases:** (none observed)
- **Inputs** (dynamic by mode):
  - `main` × 0..1 — workflow items for per-item parameter resolution (present in Insert, Get Many, Update modes; absent in retrieve-as-tool mode)
  - `ai_embedding` × 1 — required embedding sub-node (all modes)
  - `ai_document` × 1 — required document loader sub-node (Insert mode only)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve / Retrieve As Tool modes, when reranking is enabled)
- **Outputs** (dynamic by mode):
  - `main` × 1 — passthrough (Insert / Update) or retrieved documents (Get Many)
  - `ai_vectorStore` × 1 — vector-store handle (Retrieve mode)
  - `ai_tool` × 1 — tool descriptor (retrieve-as-tool mode)
- **Credentials:** `redis` — standard Redis connection credential

### Credentials: redis

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| password | string (password) | `''` | yes | Redis user password |
| host | string | `localhost` | yes | Redis server hostname |
| port | number | `6379` | yes | Redis server port |
| database | number | `0` | yes | Redis database number |
| ssl | boolean | `false` | no | Whether to connect via TLS |
| tlsOptions | object (collection) | — | no | Contains subfield `ca` (string) for CA certificate, `cert` (string) for client cert, `key` (string, password) for client key; only if `ssl=true` |
| passwordless | boolean | `false` | no | Bypass password auth |

The node connects to a Redis instance via the `redis` credential and uses the Redis VSS / Search and Query capabilities (FT.CREATE, FT.SEARCH, HSET, etc.) via the underlying LangChain Redis vector store integration. The target Redis instance must have the Redis Query Engine (RediSearch module, included in Redis Stack and Redis OSS ≥8.0) enabled.

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `retrieve` | no | — | Values: `load` (Get Many), `insert` (Insert Documents), `retrieve` (Retrieve as Vector Store), `retrieve-as-tool` (Retrieve as AI Agent Tool), `update` (Update Documents) |
| useReranker | boolean | `false` | no | show when `mode` is `load` / `retrieve` / `retrieve-as-tool` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: load (Get Many)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| redisIndex | resourceLocator (list/ID) | `''` | yes | show when `mode` = `load` | Name of the Redis vector search index; list mode populates from the `redisIndexSearch` method |
| prompt | string (expression) | `''` | yes | show when `mode` = `load` | Search query text; embedded and used for vector similarity search |
| topK | number | `4` | no | show when `mode` = `load` | Maximum number of results to retrieve |
| includeDocumentMetadata | boolean | `true` | no | show when `mode` = `load` | Whether to include document metadata in output |

### Mode: insert (Insert Documents)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| redisIndex | resourceLocator (list/ID) | `''` | yes | show when `mode` = `insert` | Name of the Redis vector search index to insert into |
| embeddingBatchSize | number | `200` | no | show when `mode` = `insert`, `@version` ≥ `1.1` | Number of documents to embed in a single batch |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| redisIndex | resourceLocator (list/ID) | `''` | yes | show when `mode` = `retrieve` | Name of the Redis vector search index |

### Mode: retrieve-as-tool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| toolName | string | `''` | yes (v1–1.2), no (v1.3+) | show when `mode` = `retrieve-as-tool`, `@version` ≤ `1.2` | Tool name presented to the LLM (alphanumeric) |
| toolDescription | string | `''` | yes | show when `mode` = `retrieve-as-tool` | Tool description used by the LLM to decide when to query the store |
| redisIndex | resourceLocator (list/ID) | `''` | yes | show when `mode` = `retrieve-as-tool` | Name of the Redis vector search index |
| topK | number | `4` | no | show when `mode` = `retrieve-as-tool` | Maximum number of results to retrieve |
| includeDocumentMetadata | boolean | `true` | no | show when `mode` = `retrieve-as-tool` | Whether to include document metadata in output |

### Mode: update (Update Documents)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| redisIndex | resourceLocator (list/ID) | `''` | yes | show when `mode` = `update` | Name of the Redis vector search index |
| id | string | `''` | yes | show when `mode` = `update` | ID of the embedding entry to update |

### Options: insert mode

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| keyPrefix | string | `doc` | no | Prefix for Redis keys storing documents |
| overwriteDocuments | boolean | `false` | no | When true, existing documents and the index are overwritten before insert |
| metadataKey | string | `metadata` | no | Redis hash key for document metadata |
| contentKey | string | `content` | no | Redis hash key for document content |
| vectorKey | string | `content_vector` | no | Redis hash key for the embedding vector |
| ttl | number | `0` (no expiry) | no | Time-to-live for documents in seconds |

### Options: load / retrieve / retrieve-as-tool modes

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| metadataFilter | string | `''` | no | Comma-separated list of words for additional full-text metadata filtering |
| keyPrefix | string | `doc` | no | Prefix for Redis keys storing documents |
| metadataKey | string | `metadata` | no | Redis hash key for document metadata |
| contentKey | string | `content` | no | Redis hash key for document content |
| vectorKey | string | `content_vector` | no | Redis hash key for the embedding vector |

## Runtime behavior

### External service contract (Redis)

Redis exposes vector search through the RediSearch / Redis Query Engine module. Key operations:

1. **Index creation / lookup:** `FT.CREATE` with vector and text field schemas; `FT._LIST` to enumerate existing indices; index discovery is done on each connection to populate the `redisIndex` list.
2. **Document storage:** Documents are stored as Redis hashes with keys prefixed by `keyPrefix` (default `doc:`). Each hash contains fields for `content`, `metadata` (JSON-serialized), and `embedding` (binary vector).
3. **Similarity search:** `FT.SEARCH` with a vector similarity query (e.g., `KNN`), optionally combined with full-text `metadataFilter`.
4. **Insert:** `HSET` on the document key.
5. **Delete / overwrite:** `FT.DROPINDEX` to recreate the index; `DEL` on individual keys.

No special API-key or URL is required beyond the standard Redis connection parameters (host, port, password, db, SSL).

### Mode: load (Get Many)

1. Require connected `ai_embedding` handle.
2. Resolve `redisIndex`, `prompt`, `topK`, `includeDocumentMetadata`, and options per input item.
3. Connect to Redis via the `redis` credential.
4. Resolve or create the Redis vector search index if it does not exist.
5. Embed `prompt` using the connected embedding sub-node.
6. Perform `FT.SEARCH` with vector similarity (KNN) on the specified index; apply metadata filter if present.
7. If `useReranker=true` and `ai_reranker` is connected, apply reranking.
8. Return matched documents as output items: each containing `pageContent` (string) and `metadata` (object).

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `redisIndex`, `embeddingBatchSize`, and insert options per input item.
3. Load documents via `ai_document` handle.
4. Connect to Redis.
5. If `overwriteDocuments=true`, drop the existing index and create a new one.
6. Embed documents (in batches of `embeddingBatchSize`) via the connected embedding sub-node.
7. Store embedded documents as Redis hashes with keyPrefix, contentKey, metadataKey, and vectorKey.
8. If `ttl` > 0, set TTL on each document key.
9. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `redisIndex` and query-mode options per input item.
3. Connect to Redis, resolve or create the index.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers.
5. If `useReranker=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieve-as-tool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `toolName`, `toolDescription`, `redisIndex`, `topK`, `includeDocumentMetadata`, and options per input item.
3. Connect to Redis, resolve or create the index.
4. Return a tool descriptor (name, description, and vector store handle) for use by an AI Agent's tool connector.
5. If `useReranker=true` and `ai_reranker` is connected, wrap with reranking.

### Mode: update

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `redisIndex` and `id` per input item.
3. Load the replacement document via `ai_document` handle.
4. Connect to Redis.
5. Embed the replacement content; update the Redis hash under the given key.
6. Return input items as passthrough.

### Output

| mode | output shape |
|------|-------------|
| load (Get Many) | One item per matched document: `{ "json": { "pageContent": string, "metadata": object } }`. Empty array if no matches. |
| insert | Passthrough of input items. |
| update | Passthrough of input items. |
| retrieve | No direct main output — node acts as a vector-store handle for cluster consumers, emitted on `ai_vectorStore`. |
| retrieve-as-tool | No direct main output — node acts as a tool descriptor for AI Agent, emitted on `ai_tool`. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert / Update mode: no `ai_document` connected | Node error |
| Redis connection failure | Fail the item |
| Specified index does not exist and cannot be auto-created | Fail the item with a descriptive error |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `redisIndex` — evaluated per item (all modes, resource locator value)
- `prompt` — evaluated per item (load mode)
- `topK` — evaluated per item (load, retrieve-as-tool)
- `id` — evaluated per item (update mode)
- `toolName`, `toolDescription` — evaluated per item (retrieve-as-tool mode)
- Options (metadataFilter, keyPrefix, metadataKey, contentKey, vectorKey) — evaluated per item

## Acceptance tests

### Test: load — basic similarity search

**Given** input items:
```json
[{ "json": { "query": "machine learning basics" } }]
```

**Cluster:** `ai_embedding` → mock embedding returning `[0.1, 0.2, 0.3, 0.4]`.

**Parameters:**
```json
{
  "mode": "load",
  "redisIndex": "my-redis-index",
  "prompt": "={{ $json.query }}",
  "topK": 5
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string) and `json.metadata` (object). At least one result returned from mock Redis.

### Test: insert — with overwrite

**Given** input items:
```json
[{ "json": { "text": "Introduction to AI" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "redisIndex": "my-redis-index",
  "overwriteDocuments": true,
  "keyPrefix": "doc:",
  "contentKey": "content",
  "metadataKey": "metadata",
  "vectorKey": "content_vector"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the index was dropped and recreated before insert.

### Test: retrieve — as vector store handle

**Given** input:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding.

**Parameters:**
```json
{
  "mode": "retrieve",
  "redisIndex": "my-redis-index"
}
```

**Expect:** No direct output items; executor returns a vector-store handle consumable by downstream AI sub-nodes.

### Test: retrieve-as-tool — with description

**Given** input:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding.

**Parameters:**
```json
{
  "mode": "retrieve-as-tool",
  "toolName": "product_kb",
  "toolDescription": "Search the product knowledge base",
  "redisIndex": "my-redis-index",
  "topK": 10
}
```

**Expect:** No direct main output; executor returns a tool descriptor with the given name and description on the `ai_tool` output.

### Test: update — by id

**Given** input items:
```json
[{ "json": { "id": "doc:42" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one replacement `Document`.

**Parameters:**
```json
{
  "mode": "update",
  "redisIndex": "my-redis-index",
  "id": "={{ $json.id }}"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the Redis hash for `doc:42` was updated with the replacement content.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 5 modes |
| Mode names and parameters | documented | All 5 modes with per-mode parameters |
| Credentials schema | documented | Standard Redis connection credential |
| Redis index as resource locator | documented | Supports list (search method) and ID modes |
| Metadata filter (load/retrieve modes) | documented | Comma-separated full-text filter string |
| Rerank results option | documented | Available in load/retrieve/retrieve-as-tool modes |
| Redis hash key configuration | documented | keyPrefix, contentKey, metadataKey, vectorKey |
| Overwrite Documents option | documented | Insert mode: drops and recreates index |
| TTL option | documented | Insert mode only |
| Embedding batch size | documented | Insert mode, v1.1+ |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | documented | Required per mode |
| Output shape of load (pageContent, metadata) | documented | Standard LangChain Document structure |
| Retrieve / retrieve-as-tool output shape | documented | Returns ai_vectorStore / ai_tool handle |
| index auto-creation logic | inferred | Index created if missing (public docs confirm) |
| Metadata filter as comma-separated string | documented | Not an AND/OR filter builder like Pinecone vector store |
| toolName required in v1–1.2, optional in v1.3+ | documented | Version-gated display condition |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreRedis.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Redis connection via the `redis` credential (ioredis or similar client)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 5 modes
  2. Credential resolution (`redis` with host, port, password, db, ssl)
  3. Redis index resolution: `FT._LIST` to discover indices; `FT.CREATE` if missing with schema matching keyPrefix/contentKey/metadataKey/vectorKey
  4. Insert mode: `ai_document` + `ai_embedding` → embed and store as Redis hashes
  5. Load mode: `ai_embedding` → FT.SEARCH vector KNN → optional reranker → output documents
  6. Retrieve mode: return vector-store handle for AI cluster consumers
  7. Retrieve As Tool mode: return tool descriptor with name/description
  8. Update mode: embed and update Redis hash under given `id`
  9. `useReranker` conditional `ai_reranker` sub-node
  10. Metadata filter support (comma-separated full-text filter in load/retrieve modes)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreRedis.test.ts`
