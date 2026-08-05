---
type: "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas"
displayName: MongoDB Atlas Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# MongoDB Atlas Vector Store

Cluster **root** node: provides a MongoDB Atlas-backed vector store for RAG workflows. Data is persisted in a remote MongoDB Atlas collection with a Vector Search index. Supports four modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, and **Retrieve Documents (As Tool for AI Agent)**.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoremongodbatlas.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mongodb.md | Public docs only |
| https://www.mongodb.com/docs/atlas/atlas-vector-search/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node (provides vector embeddings)
  - `ai_document` × 1 — required document loader sub-node (Insert mode only)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve modes)
- **Outputs:** `main` × 1 — passthrough (Insert) or retrieved documents (Get Many) or retriever handle (Retrieve modes)
- **Credentials:** `mongoDb`

### Credentials: mongoDb

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| configurationType | options | `connectionString` | yes | `connectionString` or `hostPort` |
| connectionString | string | — | conditional | Required when `configurationType = connectionString`; MongoDB connection URI |
| host | string | — | conditional | Required when `configurationType = hostPort` |
| port | number | `27017` | no | Port number |
| database | string | — | conditional | Required when `configurationType = hostPort` |
| user | string | — | no | MongoDB user |
| password | string (password) | — | no | MongoDB password |

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `getMany` | no | — | Values: `getMany`, `insert`, `retrieve`, `retrieveAsTool` |
| mongoCollection | string | — | yes | all modes | Name of the MongoDB collection that holds the vector-search-enabled documents |
| vectorIndexName | string | — | yes | all modes | Name of the Atlas Vector Search index defined on the collection |
| embedding | string | — | yes | all modes | Field name in documents that contains the vector embedding array |
| metadata_field | string | — | yes | all modes | Field name in documents that contains the metadata object |
| rerankResults | boolean | `false` | no | show when `mode` is not `insert` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: getMany

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | show when `mode` = `getMany` | Search query text. Evaluated per input item. |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none beyond shared) | | | | | Insert mode uses shared parameters only; documents come from `ai_document` sub-node |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none beyond shared) | | | | | Shared parameters identify the collection and index; returns a retriever handle |

### Mode: retrieveAsTool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | — | no | show when `mode` = `retrieveAsTool` | Name for the tool, presented to the LLM |
| description | string | — | no | show when `mode` = `retrieveAsTool` | Description of the tool for the LLM |
| limit | number | — | no | show when `mode` = `retrieveAsTool` | Maximum number of results to return |

### Options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| preFilter | JSON | — | no | show when `mode` = `getMany` or `retrieveAsTool` | Pre-filter expression applied before the vector search (MongoDB $match stage). Expressed as a JSON object. |
| postFilterPipeline | JSON | — | no | show when `mode` = `getMany` or `retrieveAsTool` | Additional aggregation pipeline stages applied after the vector search. Expressed as a JSON array. |

## Runtime behavior

### Mode: getMany

1. Require connected `ai_embedding` handle.
2. Resolve shared parameters (`mongoCollection`, `vectorIndexName`, `embedding`, `metadata_field`) and `prompt` per input item.
3. Connect to MongoDB Atlas via `mongoDb` credential, target the configured database and collection.
4. Embed `prompt` using the connected embedding sub-node.
5. Perform Atlas Vector Search ($vectorSearch) against the configured Vector Search index using the embedded query vector.
6. Apply `preFilter` as a $match stage before vector search if provided.
7. Apply `postFilterPipeline` if provided.
8. If `rerankResults=true` and `ai_reranker` is connected, apply reranking.
9. Return matched documents as output items: each containing `pageContent` (string) and `metadata` (object).

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve shared parameters per input item.
3. Load documents via `ai_document` handle.
4. Connect to MongoDB Atlas, target the configured collection.
5. Embed documents via connected embedding sub-node.
6. For each document, create a MongoDB document with the embedding stored under the configured `embedding` field, text content under a `text` field, and custom attributes under the configured `metadata_field`.
7. Insert documents into the MongoDB collection.
8. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve shared parameters per input item.
3. Connect to MongoDB Atlas, target the configured collection and index.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `rerankResults=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieveAsTool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `name`, `description`, `limit`, and shared parameters per input item.
3. Connect to MongoDB Atlas, target the configured collection and index.
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
| MongoDB connection failure | Fail the item (connection refused, auth failure, etc.) |
| Collection or index does not exist | Fail the item |
| Embedding generation failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |
| Invalid preFilter or postFilterPipeline JSON | Fail the item |

### Expressions

- `mongoCollection` — evaluated per item (all modes)
- `vectorIndexName` — evaluated per item (all modes)
- `embedding` — evaluated per item (all modes)
- `metadata_field` — evaluated per item (all modes)
- `prompt` — evaluated per item (getMany mode)
- `rerankResults` — evaluated per item (all query modes)
- `name`, `description`, `limit` — evaluated per item (retrieveAsTool mode)
- `preFilter`, `postFilterPipeline` — evaluated per item (getMany, retrieveAsTool modes)

## Acceptance tests

### Test: getMany — basic similarity search

**Given** input items:
```json
[{ "json": { "query": "what is machine learning" } }]
```

**Cluster:** `ai_embedding` → mock embedding returning `[0.1, 0.2, 0.3]`.

**Parameters:**
```json
{
  "mode": "getMany",
  "mongoCollection": "my_docs",
  "vectorIndexName": "vector_index",
  "embedding": "embedding",
  "metadata_field": "metadata",
  "prompt": "={{ $json.query }}"
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string) and `json.metadata` (object). At least one result returned from mock collection.

### Test: insert — with document loader

**Given** input items:
```json
[{ "json": { "text": "Introduction to AI" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "mongoCollection": "my_docs",
  "vectorIndexName": "vector_index",
  "embedding": "embedding",
  "metadata_field": "metadata"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms documents were inserted into the MongoDB collection with embedding field populated.

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
  "mongoCollection": "my_docs",
  "vectorIndexName": "vector_index",
  "embedding": "embedding",
  "metadata_field": "metadata"
}
```

**Expect:** No direct output items; executor returns a retriever handle consumable by downstream AI sub-nodes.

### Test: getMany — with preFilter

**Given** input items:
```json
[{ "json": { "query": "neural networks" } }]
```

**Parameters:**
```json
{
  "mode": "getMany",
  "mongoCollection": "my_docs",
  "vectorIndexName": "vector_index",
  "embedding": "embedding",
  "metadata_field": "metadata",
  "prompt": "={{ $json.query }}",
  "preFilter": { "category": { "$eq": "deep-learning" } }
}
```

**Expect:** Similarity search filtered to documents where category equals "deep-learning". Results returned on output[0].

### Test: getMany — with reranking

**Given** input items:
```json
[{ "json": { "query": "reinforcement learning" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_reranker` → mock reranker.

**Parameters:**
```json
{
  "mode": "getMany",
  "mongoCollection": "my_docs",
  "vectorIndexName": "vector_index",
  "embedding": "embedding",
  "metadata_field": "metadata",
  "prompt": "={{ $json.query }}",
  "rerankResults": true
}
```

**Expect:** Results on output[0] are reordered by the reranker. Each result has `json.pageContent` and `json.metadata`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 4 modes |
| Mode names and parameters | documented | All 4 modes with per-mode parameters |
| Credentials schema | documented | MongoDB connection string or host/port/database |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | documented | Required per mode |
| Shared parameters (mongoCollection, vectorIndexName, embedding, metadata_field) | documented | Confirmed from public docs |
| preFilter / postFilterPipeline | discovered from type defs | Parameter names confirmed in type declarations; JSON-serialized MongoDB filter/pipeline |
| Rerank results option | documented | Available in all query modes |
| Output shape of getMany (pageContent, metadata) | documented | Standard LangChain Document structure |
| Retrieve mode output shape (retriever handle) | inferred | Returns LangChain-compatible retriever |
| retrieveAsTool output shape | inferred | Returns tool descriptor for AI Agent |
| MongoDB Atlas Vector Search index schema | documented | Refer to MongoDB docs; user must pre-create index |
| Insert document shape (text field name) | gap | Internal field name for text content not specified in public docs; assumed standard |
| Embedding batch size | gap | Not documented; OpenFlow: process per item |
| continueOnFail behavior | inferred | Standard n8n pattern |
| preFilter exact MongoDB query DSL | inferred | Standard MongoDB $match stage |
| postFilterPipeline aggregation format | inferred | Standard MongoDB aggregation pipeline stages |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreMongoDBAtlas.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; MongoDB client via SDK dependency
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 4 modes
  2. Credential resolution (`mongoDb` with connection string or host/port/database)
  3. Insert mode: `ai_document` + `ai_embedding` → embed and store in MongoDB collection
  4. Get Many mode: `ai_embedding` → $vectorSearch → optional preFilter/postFilterPipeline → optional reranker → output documents
  5. Retrieve mode: return vector store handle for AI cluster consumers
  6. Retrieve As Tool mode: return tool descriptor with name/description
  7. `rerankResults` conditional `ai_reranker` sub-node
  8. `preFilter` / `postFilterPipeline` support (getMany and retrieveAsTool modes)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreMongoDBAtlas.test.ts`
