---
type: "@n8n/n8n-nodes-langchain.vectorStoreQdrant"
displayName: Qdrant Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# Qdrant Vector Store

## Purpose

Cluster **root** node: provides a Qdrant-backed vector store for RAG workflows. Data is persisted in a remote Qdrant collection (cloud or self-hosted). Supports four modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, and **Retrieve Documents (As Tool for AI Agent)**. No update-by-ID mode in the current version.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreqdrant.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/qdrant.md | Public docs only |
| https://qdrant.tech/documentation/concepts/collections/ | Public docs only (service contract) |
| https://qdrant.tech/documentation/concepts/filtering/ | Public docs only (service contract) |
| https://js.langchain.com/docs/integrations/vectorstores/qdrant | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreQdrant`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node (query, insert, and retrieve modes)
  - `ai_document` × 1 — required document loader sub-node (Insert mode)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve / Retrieve As Tool modes, when reranking is enabled)
- **Outputs:** `main` × 1 — passthrough (Insert) or retrieved documents (Get Many) or vector-store / tool handle (Retrieve modes)
- **Credentials:** `qdrantApi` (required) — Qdrant REST API key + cluster URL

### Credentials: qdrantApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| apiKey | string (password) | `''` | yes (at node level) | Qdrant API key, obtained from the Qdrant Cloud dashboard or self-hosted server |
| qdrantUrl | string | `''` | yes | Base URL of the Qdrant cluster, e.g. `https://xyz.us-east-1-0.aws.cloud.qdrant.io:6333` or a self-hosted instance |

Authentication is bearer-API-key based; requests carry the key in an authorization header against the Qdrant REST API.

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `retrieve` | no | — | Wire values: `load`, `insert`, `retrieve`, `retrieve-as-tool` (see Gaps for how these map to the documented display labels) |
| qdrantCollection | resourceLocator | `{ mode: 'list', value: '' }` | yes | all modes | Selects the target collection: pick from a list populated from the cluster via the API, or enter the collection ID directly |
| useReranker | boolean | `false` | no | show when `mode` is `load` / `retrieve` / `retrieve-as-tool` | When true, requires a reranker sub-node on `ai_reranker`; the reranker reorders search results before they are returned |

### Mode: load (Get Many)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | show when `mode` = `load` | Search query text; embedded and used for similarity search. Evaluated per input item. |
| topK | number (expression) | — | no | show when `mode` = `load` | Maximum number of results to retrieve (documented as "Limit") |
| includeDocumentMetadata | boolean | — | no | show when `mode` = `load` | Whether retrieved items carry the stored document metadata alongside the content |
| options.searchFilterJson | json (expression) | — | no | show when `mode` = `load` | Qdrant filter conditions applied to the similarity search, using the Qdrant filtering syntax (see service contract below) |

### Mode: insert (Insert Documents)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| options.collectionConfig | json | `''` | no | show when `mode` = `insert` | JSON options used when creating the target collection if it does not yet exist (Qdrant collection creation configuration) |
| options.embeddingBatchSize | number | — | no | show when `mode` = `insert` | Number of documents embedded/upserted per batch |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| options.searchFilterJson | json (expression) | — | no | show when `mode` = `retrieve` | Qdrant filter conditions applied to retrieval (same syntax as the Get Many filter) |

### Mode: retrieve-as-tool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | — | no | show when `mode` = `retrieve-as-tool` | Tool name presented to the LLM |
| toolDescription | string (expression) | — | no | show when `mode` = `retrieve-as-tool` | Tool description (documented as "Description"); explains to the LLM what the store contains so it can decide when to query it |
| topK | number (expression) | — | no | show when `mode` = `retrieve-as-tool` | Maximum number of results to retrieve (documented as "Limit") |
| includeDocumentMetadata | boolean | — | no | show when `mode` = `retrieve-as-tool` | Whether retrieved items carry the stored document metadata |
| options.searchFilterJson | json (expression) | — | no | show when `mode` = `retrieve-as-tool` | Qdrant filter conditions applied to retrieval |

### Options (collection parameter `options`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| contentPayloadKey | string | `content` | no | all modes | Qdrant payload key holding the document text |
| metadataPayloadKey | string | `metadata` | no | all modes | Qdrant payload key holding the document metadata object |

## Runtime behavior

### External service contract (Qdrant REST API)

The node talks to a Qdrant cluster via the **Qdrant REST API**, authenticated with an API key:

- Data lives in a **collection** of points. Each point carries a vector plus a payload object. The payload keys holding the text content and the metadata are configurable (`contentPayloadKey` / `metadataPayloadKey`, defaults `content` and `metadata`). The vector dimension must match the embedding model in use.
- **Insert** upserts points (content + metadata + embedding) into the selected collection; if the collection does not exist it is created first, honoring the optional `collectionConfig` JSON (Qdrant collection creation options).
- **Similarity search** runs a nearest-neighbor query over the collection vectors for the embedded prompt, optionally restricted to the first `topK` matches, optionally filtered by the Qdrant filter conditions in `searchFilterJson`, and optionally reordered by a connected reranker.
- **Filtering** uses Qdrant's filter syntax (e.g. a `should` list of `key`/`match`-style conditions against payload fields such as `metadata.batch`). The documented node-level "Metadata Filter" is an AND query — when more than one condition is specified, all must match.
- **Collection listing** for the resource locator is served by a list-search method that enumerates collections from the cluster.

### Mode: load (Get Many)

1. Require connected `ai_embedding` handle.
2. Resolve `qdrantCollection`, `prompt`, `topK`, `includeDocumentMetadata`, `useReranker`, and `options` per input item.
3. Connect to Qdrant via credential (`qdrantUrl` + `apiKey`).
4. Embed `prompt` using the connected embedding sub-node.
5. Run a similarity search on the selected collection for the top `topK` matches, applying `searchFilterJson` if present.
6. If `useReranker=true` and `ai_reranker` is connected, apply reranking.
7. Return matched documents as output items: each containing the page content (from `contentPayloadKey`) and, when `includeDocumentMetadata` is set, the metadata object (from `metadataPayloadKey`) and the similarity score.

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `qdrantCollection`, `options` per input item.
3. Load documents via the `ai_document` handle.
4. Connect to Qdrant via credential.
5. Create the collection if missing (honoring `collectionConfig`), embed documents via the connected embedding sub-node, and upsert points in batches of `embeddingBatchSize`.
6. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `qdrantCollection`, `useReranker`, and `options`.
3. Connect to Qdrant via credential.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `useReranker=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieve-as-tool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `name`, `toolDescription`, `qdrantCollection`, `topK`, `includeDocumentMetadata`, `useReranker`, and `options`.
3. Connect to Qdrant via credential.
4. Return a tool descriptor (name, description, and vector store handle) for use by an AI Agent's tool connector.
5. If `useReranker=true` and `ai_reranker` is connected, wrap with reranking.

### Input

- **All modes:** `main` items drive per-item expression evaluation for parameters.
- **Insert:** additionally consume `ai_document` sub-node output for document content.
- **Query modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- **Reranking modes:** `ai_reranker` sub-node optionally reorders search results.
- Sub-node expressions resolve against the **first input item** only (sub-node semantics).

### Output

| mode | output[0] shape |
|------|-----------------|
| load | One item per matched document: `{ "json": { "pageContent": string, "metadata": object, "score": number } }`. Empty array if no matches. |
| insert | Passthrough of input items. |
| retrieve | No direct main output — node acts as a vector-store/retriever handle for cluster consumers. |
| retrieve-as-tool | No direct main output — node acts as a tool descriptor for an AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert mode: no `ai_document` connected | Node error |
| Reranking enabled but no `ai_reranker` connected | Node error |
| Qdrant connection / auth failure (bad API key or URL) | Fail the item |
| Target collection missing and cannot be created | Fail the item |
| Invalid filter or collection-config JSON | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `qdrantCollection` — evaluated per item (all modes; resource-locator value extraction)
- `prompt` — evaluated per item (load mode)
- `topK` — evaluated per item (load, retrieve-as-tool)
- `includeDocumentMetadata` — evaluated per item (load, retrieve-as-tool)
- `useReranker` — evaluated per item (load, retrieve, retrieve-as-tool)
- `toolDescription` — evaluated per item (retrieve-as-tool mode)
- `options.searchFilterJson`, `options.contentPayloadKey`, `options.metadataPayloadKey` — evaluated per item (where shown)

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
  "qdrantCollection": { "mode": "list", "value": "documents" },
  "prompt": "={{ $json.query }}",
  "topK": 5,
  "includeDocumentMetadata": true
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string), `json.metadata` (object), and a numeric `json.score`. Mock confirms a similarity search was run on collection `documents` with the embedded prompt vector and limit `5`, reading text from payload key `content` and metadata from payload key `metadata`.

### Test: load — with Qdrant filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "load",
  "qdrantCollection": { "mode": "id", "value": "movies" },
  "prompt": "romantic comedies",
  "topK": 3,
  "options": {
    "searchFilterJson": { "should": [ { "key": "metadata.batch", "match": { "value": 12345 } } ] }
  }
}
```

**Expect:** Similarity search restricted to points whose payload matches the given filter conditions (here `metadata.batch == 12345`). Results returned on output[0].

### Test: insert — passthrough

**Given** input items:

```json
[{ "json": { "id": 1, "content": "doc1" } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**

```json
{
  "mode": "insert",
  "qdrantCollection": { "mode": "list", "value": "documents" }
}
```

**Expect:** Output[0] contains the same input item `[{ "json": { "id": 1, "content": "doc1" } }]` (passthrough). Mock confirms a point with the document text, metadata, and the embedded vector was upserted into `documents`, creating the collection first if it did not exist.

### Test: retrieve — as vector store handle, and reranker gating

**Given** input:

```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding.

**Parameters:**

```json
{
  "mode": "retrieve",
  "qdrantCollection": { "mode": "id", "value": "documents" }
}
```

**Expect:** No direct output items; executor returns a vector-store handle consumable by downstream AI sub-nodes.

**And given** `useReranker: true` with no `ai_reranker` handle connected:

**Expect:** The node errors with a message stating that a reranker sub-node must be connected when `useReranker` is true (same contract as the in-memory vector store).

### Test: retrieve-as-tool — tool descriptor

**Given** input:

```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding.

**Parameters:**

```json
{
  "mode": "retrieve-as-tool",
  "name": "movies_store",
  "toolDescription": "Retrieve movie recommendations from the movies collection",
  "qdrantCollection": { "mode": "id", "value": "movies" },
  "topK": 4,
  "options": {
    "searchFilterJson": { "should": [ { "key": "metadata.genre", "match": { "value": "comedy" } } ] },
    "contentPayloadKey": "text",
    "metadataPayloadKey": "meta"
  }
}
```

**Expect:** No direct output items; executor returns a tool descriptor carrying the given name and description bound to the collection's vector store handle for an AI Agent's tool connector. When the tool is invoked, the underlying similarity search applies the `searchFilterJson` conditions and reads document text/metadata from the configured `contentPayloadKey` / `metadataPayloadKey` payload keys (same behavior as the load mode).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 4 modes |
| Mode display names and parameters | documented | All 4 modes with per-mode parameters |
| Mode wire value strings (`load`, `insert`, `retrieve`, `retrieve-as-tool`) | corpus-confirmed | Public docs give display labels only; value strings confirmed from the published package descriptor. Note: these differ from the abstracted `getMany`/`retrieveAsTool` labels used in the sibling Supabase/Pinecone specs, and Qdrant has no `update` mode |
| Default mode | corpus-confirmed | `retrieve` when `mode` is unset |
| Credentials schema | documented | `qdrantApi` with `apiKey` + `qdrantUrl`; bearer API-key auth |
| Collection selection | corpus-confirmed | `qdrantCollection` is a resource locator (`From List` populated from the API / `ID`), default `{ mode: 'list', value: '' }` |
| Payload key options | corpus-confirmed | `contentPayloadKey` default `content`, `metadataPayloadKey` default `metadata`; consistent with LangChain Qdrant defaults |
| Collection Config (insert) | documented | JSON Qdrant collection-creation options; created when collection is absent |
| Metadata / search filter | documented | Node-level filter is an AND query; wire option `searchFilterJson` uses Qdrant filtering syntax linked from public docs |
| Rerank results option | documented | Available in Get Many, Retrieve, Retrieve As Tool modes; requires a reranker sub-node |
| `embeddingBatchSize`, `includeDocumentMetadata`, `useReranker` naming | corpus-confirmed | Not described in public docs; semantics inferred from standard vector-store node behavior |
| Tool name/description wire names | inferred | Public docs describe Name + Description; wire uses `toolDescription` for the description, tool name mapping left to implementer |
| Sub-node channels (`ai_embedding`, `ai_document`, `ai_reranker`) | inferred | Public docs confirm required sub-node connectors by role; channel ids follow n8n cluster conventions |
| Output shape of load (`pageContent`, `metadata`, `score`) | inferred | Docs state retrieved documents carry content and a similarity score; key names follow the LangChain `QdrantVectorStore` document contract |
| Retrieve / retrieve-as-tool output shape | inferred | Returns vector-store / tool descriptor for AI cluster consumers |
| Embedding batching semantics | partially documented | `embeddingBatchSize` is an options parameter in insert mode; public docs do not describe it. Corpus confirms a default of `50`; OpenFlow: batch upserts at 50 unless overridden per item |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreQdrant.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Qdrant REST client via SDK dependency (qdrantUrl + apiKey)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 4 modes; default `retrieve`
  2. Credential resolution (`qdrantApi` with `qdrantUrl` + `apiKey`)
  3. Collection resource locator (`qdrantCollection`: list from API / id) + list-search method
  4. Insert mode: `ai_document` + `ai_embedding` → create collection if absent (honoring `collectionConfig`) → embed and upsert points (respecting `contentPayloadKey`/`metadataPayloadKey`)
  5. Load mode: `ai_embedding` → similarity search (topK, `searchFilterJson`) → optional reranker → output documents (content + metadata + score)
  6. Retrieve mode: return vector-store handle for AI cluster consumers
  7. Retrieve As Tool mode: return tool descriptor with name/description
  8. `useReranker` conditional `ai_reranker` sub-node
  9. Filter support via Qdrant filtering syntax (`searchFilterJson`)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreQdrant.test.ts`
