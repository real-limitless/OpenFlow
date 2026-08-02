---
type: "@n8n/n8n-nodes-langchain.vectorStorePinecone"
displayName: Pinecone Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# Pinecone Vector Store

Cluster **root** node: provides a Pinecone-backed vector store for RAG workflows. Data is persisted in a remote Pinecone index. Supports five modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, **Retrieve Documents (As Tool for AI Agent)**, and **Update Documents** (update by ID).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstorepinecone.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pinecone.md | Public docs only |
| https://docs.pinecone.io/reference/api/authentication | Public docs only (service contract) |
| https://docs.pinecone.io/guides/manage-data/target-an-index | Public docs only (service contract) |
| https://docs.pinecone.io/reference/api/latest/control-plane/describe_index | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStorePinecone`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node for query modes (Get Many, Retrieve, Retrieve As Tool); also used to vectorize new documents in Insert/Update
  - `ai_document` × 1 — required document loader sub-node (Insert / Update modes)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve modes, when reranking is enabled)
- **Outputs:** `main` × 1 — passthrough (Insert / Update) or retrieved documents (Get Many) or vector-store / tool handle (Retrieve modes)
- **Credentials:** `pineconeApi` — API-key authentication

### Credentials: pineconeApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| apiKey | string (password) | (empty) | yes | Pinecone API key for the target project |

Auth is sent to Pinecone REST endpoints as an `Api-Key` header with `Content-Type: application/json`; the Pinecone SDK client is initialized from the key alone (no `environment` parameter in modern client versions).

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `getMany` | no | — | Values: `getMany`, `insert`, `retrieve`, `retrieveAsTool`, `update` |
| rerankResults | boolean | `false` | no | show when `mode` is `getMany` / `retrieve` / `retrieveAsTool` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: getMany

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| index | string | — | yes | show when `mode` = `getMany` | Name of the Pinecone index to query |
| prompt | string (expression) | — | yes | show when `mode` = `getMany` | Search query text; embedded and used for similarity search. Evaluated per input item. |
| limit | number | `10` | no | show when `mode` = `getMany` | Maximum number of results to retrieve |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| index | string | — | yes | show when `mode` = `insert` | Name of the Pinecone index to insert into |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| index | string | — | yes | show when `mode` = `retrieve` | Name of the Pinecone index to retrieve from |

### Mode: retrieveAsTool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | — | no | show when `mode` = `retrieveAsTool` | Tool name presented to the LLM |
| description | string | — | no | show when `mode` = `retrieveAsTool` | Tool description used by the LLM to decide when to query the store |
| index | string | — | yes | show when `mode` = `retrieveAsTool` | Name of the Pinecone index to retrieve from |
| limit | number | `10` | no | show when `mode` = `retrieveAsTool` | Maximum number of results to retrieve |

### Mode: update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| index | string | — | yes | show when `mode` = `update` | Name of the Pinecone index containing the entry |
| id | string | — | yes | show when `mode` = `update` | ID of the embedding entry to update with the newly loaded document content |

### Options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| namespace | string | — | no | all modes | Pinecone namespace within the index; segregates stored vectors |
| metadataFilter | array of filter objects | `[]` | no | show when `mode` = `getMany` | AND-match filters against document metadata; all specified fields must match |
| clearNamespace | boolean | `false` | no | show when `mode` = `insert` | Delete all data from the namespace before inserting new documents |

## Runtime behavior

### External service contract (Pinecone REST API)

Pinecone exposes two API surfaces, both authenticated with the project API key as an `Api-Key` header and JSON encoding:

1. **Control plane** at `https://api.pinecone.io` — manages indexes. The node uses **Describe Index** (`GET /indexes/{index_name}`), which returns the index's **data-plane host** in the response `host` field (e.g. `docs-example-4zo0ijk.svc.us-east1-aws.pinecone.io`) plus status fields (`status.ready`, `status.state`). The host is not guessable from the index name alone, so it must be resolved via this call (or an equivalent SDK call) before any data operation.
2. **Data plane** at the per-index `host` returned above — carries the vector operations the node needs:
   - Query by vector (`/query`) for similarity search, with optional metadata filter and namespace.
   - Upsert vectors (`/vectors/upsert`) for insert and update-by-ID.
   - Delete vectors (`/vectors/delete`, `deleteAll` for namespace-wide clear) for the clear-namespace option.

Data-plane requests also target a specific **namespace**; an empty/absent namespace addresses the default `""` namespace.

- Every request requires a valid project API key (`Api-Key` header) and JSON encoding.
- Data is addressed by **index** name and optionally a **namespace** within the index.
- Vectors carry an **ID** used for update-by-ID operations.
- Similarity search matches a query vector against stored vectors; results can be constrained by a metadata filter (AND semantics).

### Mode: getMany

1. Require connected `ai_embedding` handle.
2. Resolve `index`, `prompt`, `limit`, `namespace`, `metadataFilter` per input item.
3. Connect to Pinecone via credential: resolve the index's data-plane host (control-plane Describe Index), then target that host + namespace.
4. Embed `prompt` using the connected embedding sub-node.
5. Perform similarity search; apply metadata filter (AND) if present.
6. If `rerankResults=true` and `ai_reranker` is connected, apply reranking.
7. Return matched documents as output items: each containing `pageContent` (string) and `metadata` (object); the similarity score computed by Pinecone is also surfaced per result.

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `index`, `namespace`, `clearNamespace` per input item.
3. Load documents via `ai_document` handle.
4. Connect to Pinecone, target index + namespace (resolve data-plane host first).
5. If `clearNamespace=true`, delete all vectors in the namespace first.
6. Embed documents via connected embedding sub-node.
7. Store embedded documents (vector + content + metadata) in the index/namespace.
8. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `index`, `namespace`.
3. Connect to Pinecone, target index + namespace (resolve data-plane host first).
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `rerankResults=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieveAsTool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `name`, `description`, `index`, `namespace`, `limit`.
3. Connect to Pinecone, target index + namespace (resolve data-plane host first).
4. Return a tool descriptor (name, description, and vector store handle) for use by an AI Agent's tool connector.
5. If `rerankResults=true` and `ai_reranker` is connected, wrap with reranking.

### Mode: update

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `index`, `namespace`, `id` per input item.
3. Load the replacement document via `ai_document` handle.
4. Connect to Pinecone, target index + namespace (resolve data-plane host first).
5. Embed the replacement content; upsert the vector under the given `id`.
6. Return input items as passthrough.

### Input

- **All modes:** `main` items drive per-item expression evaluation for parameters.
- **Insert / Update:** additionally consume `ai_document` sub-node output for document content.
- **Query modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- **Reranking modes:** `ai_reranker` sub-node optionally reorders search results.

### Output

| mode | output[0] shape |
|------|-----------------|
| getMany | One item per matched document: `{ "json": { "pageContent": string, "metadata": object } }` plus a similarity score per result. Empty array if no matches. |
| insert | Passthrough of input items. |
| update | Passthrough of input items. |
| retrieve | No direct main output — node acts as a vector-store/retriever handle for cluster consumers. |
| retrieveAsTool | No direct main output — node acts as a tool descriptor for AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert / Update mode: no `ai_document` connected | Node error |
| Pinecone connection/auth failure | Fail the item (invalid API key, project error, etc.) |
| Index or namespace does not exist | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `index` — evaluated per item (all modes)
- `prompt` — evaluated per item (getMany mode)
- `limit` — evaluated per item (getMany, retrieveAsTool)
- `id` — evaluated per item (update mode)
- `name`, `description` — evaluated per item (retrieveAsTool mode)
- `namespace`, `clearNamespace` — evaluated per item (all relevant modes)
- `metadataFilter` field values — evaluated per item (getMany mode options)

## Acceptance tests

### Test: getMany — basic similarity search

**Given** input items:
```json
[{ "json": { "query": "machine learning basics" } }]
```

**Cluster:** `ai_embedding` → mock embedding returning `[0.1, 0.2, 0.3]`.

**Parameters:**
```json
{
  "mode": "getMany",
  "index": "my-index",
  "prompt": "={{ $json.query }}",
  "limit": 5
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string) and `json.metadata` (object). At least one result returned from mock Pinecone.

### Test: insert — with clearNamespace

**Given** input items:
```json
[{ "json": { "text": "Introduction to AI" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "index": "my-index",
  "namespace": "training",
  "clearNamespace": true
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the namespace was cleared before insert.

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
  "index": "my-index"
}
```

**Expect:** No direct output items; executor returns a vector-store handle consumable by downstream AI sub-nodes.

### Test: getMany — with metadata filter

**Given** input items:
```json
[{ "json": { "topic": "neural networks" } }]
```

**Parameters:**
```json
{
  "mode": "getMany",
  "index": "my-index",
  "prompt": "={{ $json.topic }}",
  "limit": 3,
  "metadataFilter": [{ "field": "category", "operator": "eq", "value": "deep-learning" }]
}
```

**Expect:** Similarity search filtered to documents where `category == "deep-learning"`. Results returned on output[0].

### Test: update — by id

**Given** input items:
```json
[{ "json": { "id": "doc-42" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one replacement `Document`.

**Parameters:**
```json
{
  "mode": "update",
  "index": "my-index",
  "id": "={{ $json.id }}"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the vector for `id` was upserted with the replacement content.

### Test: insert — data-plane host resolved before upsert

**Given** input items:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "index": "my-index",
  "namespace": "training"
}
```

**Expect:** Mock confirms the control-plane Describe Index call for `my-index` returned host `my-index-abc123.svc.example.pinecone.io`, and the subsequent upsert was sent to that host (not `api.pinecone.io`). Input items passed through on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 5 modes |
| Mode names and parameters | documented | All 5 modes with per-mode parameters |
| Credentials schema | documented | Pinecone API-key credential |
| Metadata filter (getMany) | documented | AND-conjunctive; operator enum not listed |
| Control-plane / data-plane host resolution | documented | Describe Index (`GET /indexes/{index_name}`) returns `host`; data-plane ops (`/query`, `/vectors/upsert`, `/vectors/delete`) target that host |
| Rerank results option | documented | Available in query modes; requires `ai_reranker` sub-node |
| Clear namespace option | documented | Insert mode only |
| Namespace option | documented | Available across modes |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | documented | Required per mode |
| Output shape of getMany (pageContent, metadata) | documented | Standard LangChain Document structure |
| Retrieve / retrieveAsTool output shape | inferred | Returns vector-store / tool descriptor for AI cluster consumers |
| Metadata filter operator enum | gap | Docs say "field, operator, value" without listing operators; typical: eq, neq, gt, gte, lt, lte, in, nin |
| Index existence handling | documented | Control-plane Describe Index returns 404 for unknown index; fail clearly on that |
| Update-by-ID vector semantics | inferred | Uses Pinecone upsert under a fixed ID |
| Embedding batch size | gap | Not documented; OpenFlow: process per item |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStorePinecone.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Pinecone client via SDK dependency (API-key init)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 5 modes
  2. Credential resolution (`pineconeApi` with apiKey)
  3. Index host resolution: control-plane Describe Index (`GET /indexes/{index_name}`) → data-plane host
  4. Insert mode: `ai_document` + `ai_embedding` → embed and store in Pinecone index/namespace
  5. Get Many mode: `ai_embedding` → similarity search → optional reranker → output documents
  6. Retrieve mode: return vector-store handle for AI cluster consumers
  7. Retrieve As Tool mode: return tool descriptor with name/description
  8. Update mode: upsert replacement document under given `id`
  9. `rerankResults` conditional `ai_reranker` sub-node
  10. Metadata filter support (getMany mode)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStorePinecone.test.ts`
