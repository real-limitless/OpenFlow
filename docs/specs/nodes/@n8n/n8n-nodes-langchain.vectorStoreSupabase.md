---
type: "@n8n/n8n-nodes-langchain.vectorStoreSupabase"
displayName: Supabase Vector Store
category: AI
versions: [1]
priority: medium
status: specced
---

# Supabase Vector Store

## Purpose

Cluster **root** node: provides a Supabase-backed vector store for RAG workflows. Data is persisted in a Supabase Postgres table with a `pgvector` column. Supports five modes — **Get Many**, **Insert Documents**, **Retrieve Documents (As Vector Store for Chain/Tool)**, **Retrieve Documents (As Tool for AI Agent)**, and **Update Documents** (update by ID).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoresupabase.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/supabase.md | Public docs only |
| https://supabase.com/docs/guides/ai/langchain?database-method=sql | Public docs only (service contract) |
| https://supabase.com/docs/guides/api | Public docs only (service contract) |
| https://js.langchain.com/docs/integrations/vectorstores/supabase/ | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreSupabase`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameter resolution)
  - `ai_embedding` × 1 — required embedding sub-node (query, insert, and update modes)
  - `ai_document` × 1 — required document loader sub-node (Insert / Update modes)
  - `ai_reranker` × 0..1 — optional reranker sub-node (Get Many / Retrieve modes, when reranking is enabled)
- **Outputs:** `main` × 1 — passthrough (Insert / Update) or retrieved documents (Get Many) or vector-store / tool handle (Retrieve modes)
- **Credentials:** `supabaseApi` — Supabase Data API (host + secret key)

### Credentials: supabaseApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| host | string | — | yes | Supabase project URL, e.g. `https://your_project.supabase.co` (no `/rest/v1` path) |
| secretKey | string (password) | — | yes | Supabase secret/API key. Legacy `service_role` secrets keep working but are being phased out. |

The credential authenticates against the Supabase **Data API** (PostgREST), which must be enabled for the project. Requests carry the key as a bearer token / `apikey` header and JSON encoding.

## Parameters

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `getMany` | no | — | Values: `getMany`, `insert`, `retrieve`, `retrieveAsTool`, `update` |
| tableName | string | — | yes | all modes | Name of the Supabase table that stores the documents |
| rerankResults | boolean | `false` | no | show when `mode` is `getMany` / `retrieve` / `retrieveAsTool` | When true, requires a reranker sub-node on `ai_reranker` |

### Mode: getMany

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | show when `mode` = `getMany` | Search query text; embedded and used for similarity search. Evaluated per input item. |
| limit | number | `10` | no | show when `mode` = `getMany` | Maximum number of results to retrieve |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tableName | string | — | yes | show when `mode` = `insert` | Supabase table to insert into |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tableName | string | — | yes | show when `mode` = `retrieve` | Supabase table to retrieve from |

### Mode: retrieveAsTool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| name | string | — | no | show when `mode` = `retrieveAsTool` | Tool name presented to the LLM |
| description | string | — | no | show when `mode` = `retrieveAsTool` | Tool description used by the LLM to decide when to query the store |
| tableName | string | — | yes | show when `mode` = `retrieveAsTool` | Supabase table to retrieve from |
| limit | number | `10` | no | show when `mode` = `retrieveAsTool` | Maximum number of results to retrieve |

### Mode: update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tableName | string | — | yes | show when `mode` = `update` | Supabase table containing the entry |
| id | string | — | yes | show when `mode` = `update` | ID of the embedding entry to update with the newly loaded document content |

### Options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| queryName | string | `match_documents` | no | all modes | Name of the Postgres function in Supabase that performs the similarity search (as set up in the Supabase quickstart) |
| metadataFilter | array of filter objects | `[]` | no | show when `mode` = `getMany` | AND-match filters against document metadata; all specified fields must match. The filter is applied server-side as JSON containment on the metadata column. |

## Runtime behavior

### External service contract (Supabase Data API)

The node talks to a Supabase project through the **Data API** (PostgREST REST layer over the project's Postgres database), authenticated with the secret key:

- Data lives in a **table** (e.g. `documents`) with at least a text content column, a JSON metadata column, and a `pgvector` embedding column (`extensions.vector(N)`). The vector dimension must match the embedding model in use.
- **Similarity search** is performed by a **Postgres function** (e.g. `match_documents`) that takes a query embedding, a match count, and an optional filter JSON, and returns rows with content, metadata, and a similarity score. The n8n node invokes it via the Data API RPC endpoint, naming the function through the `queryName` option.
- **Insert** writes new rows (content + metadata + embedding) into the table.
- **Update by ID** rewrites the row with the given `id`.
- The metadata filter maps to Postgres JSON containment (`metadata @> filter`), i.e. every specified metadata field must match.

### Mode: getMany

1. Require connected `ai_embedding` handle.
2. Resolve `tableName`, `prompt`, `limit`, `queryName`, `metadataFilter` per input item.
3. Connect to Supabase via credential (Data API host + secret key).
4. Embed `prompt` using the connected embedding sub-node.
5. Invoke the named similarity-search function on the target table with the query vector, limit, and optional metadata filter.
6. If `rerankResults=true` and `ai_reranker` is connected, apply reranking.
7. Return matched documents as output items: each containing `pageContent` (string), `metadata` (object), and the similarity score returned by the function.

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `tableName`, `queryName` per input item.
3. Load documents via `ai_document` handle.
4. Connect to Supabase via credential.
5. Embed documents via connected embedding sub-node.
6. Insert rows (content + metadata + embedding) into the table.
7. Return input items as passthrough.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `tableName`, `queryName`.
3. Connect to Supabase via credential.
4. Return a vector store handle (opaque to main output) for use by downstream AI cluster consumers (Vector Store Retriever, QA Chain, etc.).
5. If `rerankResults=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieveAsTool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `name`, `description`, `tableName`, `limit`, `queryName`.
3. Connect to Supabase via credential.
4. Return a tool descriptor (name, description, and vector store handle) for use by an AI Agent's tool connector.
5. If `rerankResults=true` and `ai_reranker` is connected, wrap with reranking.

### Mode: update

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `tableName`, `queryName`, `id` per input item.
3. Load the replacement document via `ai_document` handle.
4. Connect to Supabase via credential.
5. Embed the replacement content; update the row with the given `id` to the new content, metadata, and embedding.
6. Return input items as passthrough.

### Input

- **All modes:** `main` items drive per-item expression evaluation for parameters.
- **Insert / Update:** additionally consume `ai_document` sub-node output for document content.
- **Query modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- **Reranking modes:** `ai_reranker` sub-node optionally reorders search results.
- Sub-node expressions resolve against the **first input item** only (sub-node semantics).

### Output

| mode | output[0] shape |
|------|-----------------|
| getMany | One item per matched document: `{ "json": { "pageContent": string, "metadata": object, "similarity": number } }`. Empty array if no matches. |
| insert | Passthrough of input items. |
| update | Passthrough of input items. |
| retrieve | No direct main output — node acts as a vector-store/retriever handle for cluster consumers. |
| retrieveAsTool | No direct main output — node acts as a tool descriptor for AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert / Update mode: no `ai_document` connected | Node error |
| Supabase connection / auth failure | Fail the item (invalid secret key, Data API disabled, network error) |
| Target table does not exist or is not a valid vector store | Fail the item |
| Similarity-search function (`queryName`) missing or returns unexpected shape | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `tableName` — evaluated per item (all modes)
- `prompt` — evaluated per item (getMany mode)
- `limit` — evaluated per item (getMany, retrieveAsTool)
- `id` — evaluated per item (update mode)
- `name`, `description` — evaluated per item (retrieveAsTool mode)
- `queryName` — evaluated per item (all modes)
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
  "tableName": "documents",
  "prompt": "={{ $json.query }}",
  "limit": 5
}
```

**Expect** output[0] to be an array of items, each with `json.pageContent` (string), `json.metadata` (object), and a numeric `json.similarity`. Mock confirms the RPC function `match_documents` was called on table `documents` with the embedded prompt vector, limit `5`, and empty filter.

### Test: getMany — with metadata filter

**Given** input items:
```json
[{ "json": { "topic": "neural networks" } }]
```

**Parameters:**
```json
{
  "mode": "getMany",
  "tableName": "documents",
  "prompt": "={{ $json.topic }}",
  "limit": 3,
  "metadataFilter": [{ "field": "category", "operator": "eq", "value": "deep-learning" }]
}
```

**Expect:** Similarity search constrained server-side to documents whose metadata matches `category == "deep-learning"`. Results returned on output[0].

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
  "tableName": "documents"
}
```

**Expect:** Output[0] contains the same input item `[{ "json": { "id": 1, "content": "doc1" } }]` (passthrough). Mock confirms a row with content, metadata, and the embedded vector was inserted into `documents`.

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
  "tableName": "documents",
  "id": "={{ $json.id }}"
}
```

**Expect:** Input items passed through on output[0]. Mock confirms the row for `id` was updated with the replacement content, metadata, and a fresh embedding.

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
  "tableName": "documents"
}
```

**Expect:** No direct output items; executor returns a vector-store handle consumable by downstream AI sub-nodes.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 5 modes |
| Mode display names and parameters | documented | All 5 modes with per-mode parameters |
| Mode option value strings (`getMany`, `insert`, `retrieve`, `retrieveAsTool`, `update`) | inferred | Public docs give display labels only; value strings follow vector-store node convention |
| Credentials schema | documented | Supabase host + secret key, Data API auth; omit `/rest/v1` path |
| Query Name option | documented | Named similarity-search function; default `match_documents` per Supabase quickstart |
| Metadata filter (getMany) | documented | AND-conjunctive; every specified field must match |
| Rerank results option | documented | Available in Get Many, Retrieve, Retrieve As Tool modes; requires a reranking sub-node |
| Sub-node channels (ai_embedding, ai_document, ai_reranker) | inferred | Public docs confirm required sub-node connectors by role; exact channel identifiers follow n8n cluster conventions |
| Output shape of getMany (pageContent, metadata, similarity) | inferred | Docs state returned docs carry a similarity score; `pageContent`/`metadata` key names follow the LangChain `SupabaseVectorStore` document contract |
| Table / function contract | documented | `pgvector` table (content, metadata, embedding) + RPC similarity function (`match_documents`) |
| Retrieve / retrieveAsTool output shape | inferred | Returns vector-store / tool descriptor for AI cluster consumers |
| Metadata filter operator enum | gap | Docs say "field, operator, value" without listing operators; typical: eq, neq, gt, gte, lt, lte, in, nin |
| Update-by-ID row semantics | inferred | Updates the row with the given `id` |
| Embedding batch size | gap | Not documented; OpenFlow: process per item |
| Exact PostgREST endpoints | inferred | Node may use the Data API REST/RPC endpoints; implementation detail left to implementer |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreSupabase.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; Supabase Data API client via SDK dependency (host + secret key)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 5 modes
  2. Credential resolution (`supabaseApi` with host + secret key)
  3. Insert mode: `ai_document` + `ai_embedding` → embed and insert rows into the Supabase table
  4. Get Many mode: `ai_embedding` → call the named RPC similarity function → optional reranker → output documents with similarity
  5. Retrieve mode: return vector-store handle for AI cluster consumers
  6. Retrieve As Tool mode: return tool descriptor with name/description
  7. Update mode: load replacement document, embed, and update the row by `id`
  8. `rerankResults` conditional `ai_reranker` sub-node
  9. Metadata filter support (getMany mode)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreSupabase.test.ts`
