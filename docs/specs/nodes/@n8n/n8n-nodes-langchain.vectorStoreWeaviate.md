---
type: "@n8n/n8n-nodes-langchain.vectorStoreWeaviate"
displayName: Weaviate Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# Weaviate Vector Store

Cluster **root** node: provides a Weaviate-backed vector store for RAG workflows. Data is persisted in a named Weaviate collection. Supports four modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, and **Retrieve Documents (As Tool for AI Agent)**.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreweaviate/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/weaviate/ | Public docs only |
| https://weaviate.io/developers/weaviate | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreWeaviate`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node for query modes (Get Many, Retrieve, Retrieve As Tool); also used to vectorize new documents in Insert mode
  - `ai_document` × 1 — required document loader sub-node (Insert mode)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve modes, when reranking is enabled)
- **Outputs:** `main` × 1 — passthrough (Insert) or retrieved documents (Get Many) or vector-store / tool handle (Retrieve modes)
- **Credentials:** `weaviateApi`

### Credentials: weaviateApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| connection_type | options | `weaviate_cloud` | yes | Two values: `weaviate_cloud` or `custom_connection` |
| weaviate_cloud_endpoint | string | (empty) | yes (cloud) | URL of the Weaviate Cloud instance, e.g. `https://your-cluster.weaviate.cloud` |
| weaviate_api_key | string (password) | (empty) | yes | API key for the Weaviate instance (both cloud and custom) |
| custom_connection_http_host | string | `weaviate` | yes (custom) | HTTP hostname for self-hosted Weaviate |
| custom_connection_http_port | number | `8080` | yes (custom) | HTTP port for self-hosted Weaviate |
| custom_connection_http_secure | boolean | `false` | yes (custom) | Whether to use HTTPS for HTTP connections |
| custom_connection_grpc_host | string | `weaviate` | yes (custom) | gRPC hostname for self-hosted Weaviate |
| custom_connection_grpc_port | number | `50051` | yes (custom) | gRPC port for self-hosted Weaviate |
| custom_connection_grpc_secure | boolean | `false` | yes (custom) | Whether to use HTTPS for gRPC connections |

The Weaviate TypeScript client is initialized from these credentials and used for all data-plane operations.

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `retrieve` | no | — | Wire values: `load` (Get Many), `insert` (Insert Documents), `retrieve` (As Vector Store for Chain/Tool), `retrieve-as-tool` (As Tool for AI Agent). Default `retrieve`. |
| weaviateCollection | string | — | yes | all modes | Name of the Weaviate collection to target. Must already exist in the Weaviate instance. |
| useReranker | boolean | `false` | no | show when `mode` is `load` / `retrieve` / `retrieve-as-tool` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: load (Get Many)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | show when `mode` = `load` | Search query text; embedded and used for vector similarity search. Evaluated per input item. |
| topK | number | `4` | no | show when `mode` = `load` | Maximum number of results to retrieve (documented as "Limit") |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| embeddingBatchSize | number | `200` | no | show when `mode` = `insert` | Number of documents sent per batch to the embedding service |

### Mode: retrieve (As Vector Store for Chain/Tool)

No additional parameters beyond shared collection.

### Mode: retrieve-as-tool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| toolName | string | — | no | show when `mode` = `retrieve-as-tool`, version ≤ 1.2 | Tool name presented to the LLM (alphanumeric; removed in later versions — name derived from node name) |
| toolDescription | string | — | yes | show when `mode` = `retrieve-as-tool` | Tool description used by the LLM to decide when to query the store |
| topK | number | `4` | no | show when `mode` = `retrieve-as-tool` | Maximum number of results to retrieve |

### Options (common across modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| includeDocumentMetadata | boolean | `true` | no | load, retrieve-as-tool | Whether to include metadata in returned results |
| searchFilterJson | json (expression) | — | no | load, retrieve, retrieve-as-tool | Weaviate-compatible GraphQL where filter with AND/OR operators and conditions (path, operator, valueString/valueNumber/valueTextArray/valueBoolean/valueGeoCoordinates) |
| metadataKeys | string | `source,page` | no | load, retrieve, retrieve-as-tool | Comma-separated metadata property names to return; reduces payload size |
| textKey | string | `text` | no | all modes | The document property key that contains the embedded text content |
| hybrid | object | — | no | load, retrieve, retrieve-as-tool | Enables hybrid (vector + keyword) search with sub-parameters |

### Hybrid search sub-parameters (when hybrid is enabled)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| hybridQueryText | string | — | no | Text for combined vector + keyword search (BM25) |
| hybridExplainScore | boolean | — | no | Whether to include score explanation in results |
| hybridFusionType | options | — | no | `RelativeScore` or `Ranked` fusion strategy |
| hybridAutocut | number | — | no | Groups results by score-jump detection |
| hybridAlpha | number | `0.5` | no | Weighting: `0.0` = pure keyword, `1.0` = pure vector |
| hybridQueryProperties | string | — | no | Comma-separated property paths, optionally weighted (e.g. `"title^2,content"`) |
| hybridMaxVectorDistance | number | — | no | Maximum allowed vector distance for results |

### Multi-tenancy and data lifecycle options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tenantName | string | — | no | all modes | Weaviate multi-tenancy tenant name; required if the collection has multi-tenancy enabled |
| clearData | boolean | `false` | no | show when `mode` = `insert` | Delete all data from the collection (or tenant if multi-tenancy is active) before inserting |

### Connection and timeout options

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| skipInitChecks | boolean | — | no | Skip the Weaviate client's initial connection validation |
| initTimeout | number | — | no | Connection establishment timeout in seconds |
| insertTimeout | number | — | no | Timeout for insert operations in seconds |
| queryTimeout | number | — | no | Timeout for query operations in seconds |
| grpcProxy | string | — | no | Proxy URL for gRPC connections |

## Runtime behavior

### External service contract (Weaviate API)

Weaviate exposes a GraphQL API for queries and a REST API for data management, both authenticated with the API key:

1. **Connection:** The Weaviate client connects via HTTP and gRPC endpoints (both configurable for self-hosted, or via the WCD instance URL for Weaviate Cloud).
2. **Collections:** Data is organized into named **collections**. The collection must already exist in the Weaviate instance — the node does not auto-create collections.
3. **Data operations:**
   - **Insert (Upsert):** documents are loaded, embedded, and stored as vector objects in the specified collection, optionally within a specific tenant (multi-tenancy).
   - **Query (Get Many):** runs vector similarity search against the collection, optionally combined with keyword (BM25) **hybrid search**.
   - **Retrieve:** returns a vector-store handle that downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.) can query.
   - **Retrieve As Tool:** returns a tool descriptor for use by AI Agents.
4. **Filtering:** Search filters use Weaviate's GraphQL `where` filter syntax, supporting operators: `Equal`, `Like`, `ContainsAny`, `ContainsAll`, `GreaterThan`, `LessThan`, `IsNull`, `WithinGeoRange`.
5. **Multi-tenancy:** If the collection has multi-tenancy enabled, every operation must supply a `tenantName`. Multi-tenancy is configured at collection creation time and cannot be changed afterward.
6. **Metadata:** Documents stored in Weaviate carry metadata as object properties. Specific `metadataKeys` can be selected to reduce network payload. Certain filter operators require index configuration (`indexPropertyLength` for length-related filters, inverted index null-state for `IsNull`).

### Mode: load (Get Many)

1. Require connected `ai_embedding` handle.
2. Resolve `weaviateCollection`, `prompt`, `topK`, `tenantName`, and options per input item.
3. Connect to Weaviate via credentials.
4. Embed `prompt` using the connected embedding sub-node.
5. Perform similarity search (or hybrid search if configured) against the collection, applying search filters and tenant isolation as specified.
6. If `useReranker=true` and `ai_reranker` is connected, apply reranking.
7. Return matched documents as output items on `main`: each containing `pageContent` (string from the configured `textKey` property) and `metadata` (object).

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `weaviateCollection`, `embeddingBatchSize`, `tenantName`, `clearData`, `textKey` per input item.
3. Load documents via `ai_document` handle.
4. Connect to Weaviate.
5. If `clearData=true`, delete all objects in the collection (or tenant) before inserting.
6. Embed documents via connected embedding sub-node, in batches of `embeddingBatchSize`.
7. Store embedded documents (vector + content + metadata) in the collection/tenant.
8. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `weaviateCollection`, `tenantName`.
3. Connect to Weaviate.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `useReranker=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieve-as-tool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `toolDescription`, `weaviateCollection`, `topK`, `tenantName`.
3. Connect to Weaviate.
4. Return a tool descriptor (implicit name from node name, explicit `toolDescription`, and vector store handle on `ai_tool` output) for use by an AI Agent's tool connector.
5. If `useReranker=true` and `ai_reranker` is connected, wrap with reranking.

### Input

- **All modes:** `main` items drive per-item expression evaluation for parameters.
- **Insert:** additionally consume `ai_document` sub-node output for document content.
- **Query modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- **Reranking modes:** `ai_reranker` sub-node optionally reorders search results.

### Output

| mode | output[0] shape |
|------|-----------------|
| load | One item per matched document: `{ "json": { "pageContent": string, "metadata": object } }`. Empty array if no matches. |
| insert | Passthrough of input items. |
| retrieve | No direct main output — node acts as a vector-store handle (`ai_vectorStore` output) for cluster consumers. |
| retrieve-as-tool | No direct main output — node acts as a tool descriptor (`ai_tool` output) for AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert mode: no `ai_document` connected | Node error |
| Weaviate connection/auth failure (bad API key, unreachable endpoint) | Fail the item |
| Collection does not exist | Fail the item |
| Multi-tenancy required but no `tenantName` provided | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `weaviateCollection` — evaluated per item (all modes)
- `prompt` — evaluated per item (load mode)
- `topK` — evaluated per item (load, retrieve-as-tool)
- `toolDescription` — evaluated per item (retrieve-as-tool mode)
- `tenantName` — evaluated per item (all modes)
- `searchFilterJson` field values — evaluated per item (load/retrieve/retrieve-as-tool mode options)
- All option values — evaluated per item

## Acceptance tests

### Test: load — basic similarity search

**Given** input items:
```json
[{ "json": { "query": "machine learning basics" } }]
```

**Cluster:** `ai_embedding` → mock embedding returning `[0.1, 0.2, 0.3]`.

**Parameters:**
```json
{
  "mode": "load",
  "weaviateCollection": "Documents",
  "prompt": "={{ $json.query }}",
  "topK": 5
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string) and `json.metadata` (object). At least one result returned from mock Weaviate.

### Test: insert — with clearData

**Given** input items:
```json
[{ "json": { "text": "Introduction to AI" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "weaviateCollection": "Documents",
  "clearData": true
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the collection was cleared before insert.

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
  "weaviateCollection": "Documents"
}
```

**Expect:** No direct output items; executor returns a vector-store handle consumable by downstream AI sub-nodes.

### Test: load — with hybrid search and search filters

**Given** input items:
```json
[{ "json": { "topic": "neural networks" } }]
```

**Parameters:**
```json
{
  "mode": "load",
  "weaviateCollection": "Documents",
  "prompt": "={{ $json.topic }}",
  "topK": 3,
  "includeDocumentMetadata": true,
  "hybrid": {
    "hybridQueryText": "deep learning",
    "hybridAlpha": 0.7,
    "hybridFusionType": "Ranked"
  },
  "searchFilterJson": {
    "AND": [
      { "path": ["category"], "operator": "Equal", "valueString": "deep-learning" }
    ]
  }
}
```

**Expect:** Hybrid search (70% vector, 30% keyword) with `Ranked` fusion, filtered to documents where `category == "deep-learning"`. Results returned on output[0].

### Test: insert — with multi-tenancy

**Given** input items:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "weaviateCollection": "Documents",
  "tenantName": "acme-corp"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms inserted data scoped to tenant `acme-corp`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 4 modes |
| Mode names, parameters, wire values | corpus-confirmed | Wire values: `load`, `insert`, `retrieve`, `retrieve-as-tool`. Default `retrieve`. Public docs give display labels only. |
| Credentials schema | documented | Weaviate API credential with cloud (`weaviate_cloud_endpoint`, `weaviate_api_key`) and custom connection variants (HTTP+gRPC host/port/secure) |
| Weaviate collection concept | documented | Named collection; must exist before use; selected via resource locator (From List / ID) |
| Search filters (AND/OR) with GraphQL where syntax | documented | Operators: Equal, Like, ContainsAny, ContainsAll, GreaterThan, LessThan, IsNull, WithinGeoRange |
| Multi-tenancy via tenantName | documented | Required if collection has multi-tenancy enabled; must be set at first ingestion |
| Hybrid search parameters | documented | Query text, fusion type (RelativeScore, Ranked), alpha (default 0.5), autocut, query properties, max vector distance, explain score |
| Rerank results option | documented | Available in load/retrieve/retrieve-as-tool modes; requires `ai_reranker` sub-node |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | documented | Required per mode |
| Tool name (`toolName` on version ≤ 1.2, auto from node name on later) | corpus-confirmed | `toolName` parameter typed alphanumeric, versions 1.0-1.2; removed in 1.3+; `toolDescription` required for retrieve-as-tool |
| Retrieve / retrieve-as-tool output shape | corpus-confirmed | Returns `ai_vectorStore` / `ai_tool` output respectively (no main output) |
| TextKey default `text` | corpus-confirmed | Parameter default is `"text"` |
| MetadataKeys default `source,page` | corpus-confirmed | Comma-separated string |
| Embedding batch size default | corpus-confirmed | 200 (version 1.1+) |
| Connection/timeout parameters | documented | Init timeout default 2s, insert timeout default 90s, query timeout default 30s; skip init checks boolean; gRPC proxy |
| Clear data (clear collection/tenant) | documented | Insert mode only; destructive |
| Input/output dynamic wiring | corpus-confirmed | Inputs/outputs switch dynamically based on `mode` (main + embedding for load; main + embedding + document for insert; ai_vectorStore for retrieve; ai_tool for retrieve-as-tool; ai_reranker gated by `useReranker`) |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreWeaviate.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Weaviate client via SDK dependency (API-key + endpoint init)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 4 modes; default `retrieve`
  2. Credential resolution (`weaviateApi` with cloud vs custom connection)
  3. Weaviate client initialization (HTTP + gRPC endpoints, API key, timeouts, proxies)
  4. Insert mode: `ai_document` + `ai_embedding` → batch-embed and store in Weaviate collection
  5. Load mode: `ai_embedding` → similarity search → optional hybrid search → optional reranker → output documents
  6. Retrieve mode: return `ai_vectorStore` handle for AI cluster consumers
  7. Retrieve-as-tool mode: return `ai_tool` descriptor with implicit name + `toolDescription`
  8. `useReranker` conditional `ai_reranker` sub-node
  9. Search filter support (AND/OR composite filters with Weaviate-compatible operators via `searchFilterJson`)
  10. Multi-tenancy `tenantName` isolation across all modes
  11. `clearData` for collection/tenant wipe before insert
  12. Dynamic input/output wiring per mode (main/ai_vectorStore/ai_tool)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreWeaviate.test.ts`
