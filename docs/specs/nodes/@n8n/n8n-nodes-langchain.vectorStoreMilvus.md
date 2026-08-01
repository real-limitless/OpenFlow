---
type: "@n8n/n8n-nodes-langchain.vectorStoreMilvus"
displayName: Milvus Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# Milvus Vector Store

Cluster **root** node: provides a Milvus-backed vector store for RAG workflows. Data is persisted in a remote Milvus database instance. Supports four modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, and **Retrieve Documents (As Tool for AI Agent)**.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoremilvus.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/milvus.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreMilvus`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node (provides vector embeddings)
  - `ai_document` × 1 — required document loader sub-node (Insert mode only)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve modes)
- **Outputs:** `main` × 1 — passthrough (Insert) or retrieved documents (Get Many) or retriever handle (Retrieve modes)
- **Credentials:** `milvusApi` — basic auth with Base URL, Username, Password

### Credentials: milvusApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| baseUrl | string | `http://localhost:19530` | yes | Milvus instance base URL |
| username | string | (empty) | no | Default is `root` in Milvus |
| password | string (password) | (empty) | no | Default is `Milvus` in Milvus |

Auth is sent as `Authorization: Bearer <username>:<password>` header.

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `getMany` | no | — | Values: `getMany`, `insert`, `retrieve`, `retrieveAsTool` |
| rerankResults | boolean | `false` | no | show when `mode` is not `insert` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: getMany

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| milvusCollection | string | — | yes | show when `mode` = `getMany` | Name of the Milvus collection to query |
| prompt | string (expression) | — | yes | show when `mode` = `getMany` | Search query text. Evaluated per input item. |
| limit | number | `10` | no | show when `mode` = `getMany` | Maximum number of results to return |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| milvusCollection | string | — | yes | show when `mode` = `insert` | Name of the Milvus collection to insert into |
| clearCollection | boolean | `false` | no | show when `mode` = `insert` | Whether to clear the collection before inserting new documents |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| milvusCollection | string | — | yes | show when `mode` = `retrieve` | Name of the Milvus collection to retrieve from |

### Mode: retrieveAsTool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | — | no | show when `mode` = `retrieveAsTool` | Name for the tool, presented to the LLM |
| description | string | — | no | show when `mode` = `retrieveAsTool` | Description of the tool for the LLM |
| milvusCollection | string | — | yes | show when `mode` = `retrieveAsTool` | Name of the Milvus collection to retrieve from |
| limit | number | `10` | no | show when `mode` = `retrieveAsTool` | Maximum number of results to return |

### Options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| metadataFilter | array of filter objects | `[]` | no | show when `mode` = `getMany` | AND-match filters against document metadata. Each entry is a condition (field, operator, value). |

## Runtime behavior

### Mode: getMany

1. Require connected `ai_embedding` handle.
2. Resolve `milvusCollection`, `prompt`, `limit` per input item.
3. Connect to Milvus via credential, target the specified collection.
4. Embed `prompt` using the connected embedding sub-node.
5. Perform similarity search against the collection using the embedded query vector.
6. If `rerankResults=true` and `ai_reranker` is connected, apply reranking.
7. If `metadataFilter` is specified, apply AND-conjunctive filters.
8. Return matched documents as output items: each containing `pageContent` (string) and `metadata` (object).

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `milvusCollection`, `clearCollection` per input item.
3. Load documents via `ai_document` handle.
4. Connect to Milvus, target collection.
5. If `clearCollection=true`, delete all existing documents in the collection.
6. Embed documents via connected embedding sub-node.
7. Store embedded documents in the Milvus collection.
8. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `milvusCollection`.
3. Connect to Milvus, target collection.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `rerankResults=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieveAsTool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `name`, `description`, `milvusCollection`, `limit`.
3. Connect to Milvus, target collection.
4. Return a tool descriptor (name, description, and vector store handle) for use by an AI Agent's tool connector.
5. If `rerankResults=true` and `ai_reranker` is connected, wrap with reranking.

### Input

- **All modes:** `main` items drive per-item expression evaluation for parameters.
- **Insert:** additionally consumes `ai_document` sub-node output for document content.
- **All query modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- **Reranking modes:** `ai_reranker` sub-node optionally reorders search results.

### Output

| mode | output[0] shape |
|------|-----------------|
| getMany | One item per matched document: `{ "json": { "pageContent": string, "metadata": object } }`. Empty array if no matches. |
| insert | Passthrough of input items with serialized document info. |
| retrieve | No direct main output — node acts as a retriever handle for cluster consumers. |
| retrieveAsTool | No direct main output — node acts as a tool descriptor for AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert mode: no `ai_document` connected | Node error |
| Milvus connection failure | Fail the item (connection refused, auth failure, etc.) |
| Collection does not exist | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `milvusCollection` — evaluated per item (all modes)
- `prompt` — evaluated per item (getMany mode)
- `limit` — evaluated per item (getMany, retrieveAsTool)
- `clearCollection` — evaluated per item (insert mode)
- `name`, `description` — evaluated per item (retrieveAsTool mode)
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
  "milvusCollection": "my_docs",
  "prompt": "={{ $json.query }}",
  "limit": 5
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string) and `json.metadata` (object). At least one result returned from mock Milvus.

### Test: insert — with clearCollection

**Given** input items:
```json
[{ "json": { "text": "Introduction to AI" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "milvusCollection": "my_docs",
  "clearCollection": true
}
```

**Expect:** Input items passed through on output[0]. Mock confirms collection was cleared before insert.

### Test: retrieve — as retriever handle

**Given** input:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding.

**Parameters:**
```json
{
  "mode": "retrieve",
  "milvusCollection": "my_docs"
}
```

**Expect:** No direct output items; executor returns a retriever handle consumable by downstream AI sub-nodes.

### Test: getMany — with metadata filter

**Given** input items:
```json
[{ "json": { "topic": "neural networks" } }]
```

**Parameters:**
```json
{
  "mode": "getMany",
  "milvusCollection": "my_docs",
  "prompt": "={{ $json.topic }}",
  "limit": 3,
  "metadataFilter": [{ "field": "category", "operator": "eq", "value": "deep-learning" }]
}
```

**Expect:** Similarity search filtered to documents where `category == "deep-learning"`. Results returned on output[0].

### Test: insert — passthrough

**Given** input items:
```json
[{ "json": { "id": 1, "content": "doc1" } }]
```

**Parameters:**
```json
{
  "mode": "insert",
  "milvusCollection": "my_docs",
  "clearCollection": false
}
```

**Expect:** Output[0] contains the same input item `[{ "json": { "id": 1, "content": "doc1" } }]` (passthrough).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 4 modes |
| Mode names and parameters | documented | All 4 modes with per-mode parameters |
| Credentials schema | documented | Milvus API with baseUrl, username, password |
| Metadata filter (getMany) | documented | AND-conjunctive, field/value/operator |
| Rerank results option | documented | Available in all query modes |
| Clear collection option | documented | Insert mode only |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | documented | Required per mode |
| Milvus connection semantics | inferred | OpenFlow wraps Milvus SDK client; actual connection pooling, TLS, gRPC details inferred |
| Output shape of getMany (pageContent, metadata) | documented | Standard LangChain Document structure |
| Retrieve mode output shape (retriever handle) | inferred | Returns LangChain-compatible retriever |
| retrieveAsTool output shape | inferred | Returns tool descriptor for AI Agent |
| Exact Milvus collection operations (create vs. reference) | gap | Docs describe "select or enter" collection; OpenFlow: assume exists or auto-create |
| Metadata filter operator enum | gap | Docs say "field, operator, value" without listing operators; typical: eq, neq, gt, gte, lt, lte, in, nin |
| Embedding batch size | gap | Not documented; OpenFlow: process per item |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreMilvus.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Milvus client via SDK dependency
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 4 modes
  2. Credential resolution (`milvusApi` with baseUrl/username/password)
  3. Insert mode: `ai_document` + `ai_embedding` → embed and store in Milvus collection
  4. Get Many mode: `ai_embedding` → similarity search → optional reranker → output documents
  5. Retrieve mode: return vector store handle for AI cluster consumers
  6. Retrieve As Tool mode: return tool descriptor with name/description
  7. `rerankResults` conditional `ai_reranker` sub-node
  8. Metadata filter support (getMany mode)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreMilvus.test.ts`