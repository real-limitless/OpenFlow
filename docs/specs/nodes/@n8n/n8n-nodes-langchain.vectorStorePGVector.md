---
type: "@n8n/n8n-nodes-langchain.vectorStorePGVector"
displayName: Postgres PGVector Store
category: AI
versions: [1, 1.1, 1.2, 1.3]
priority: medium
status: specced
---

# Postgres PGVector Store

## Purpose

Cluster **root** node: provides a PGVector-backed vector store over a PostgreSQL database for RAG workflows. Data is persisted in a PostgreSQL table with a `pgvector` extension column. Supports four modes — **Get Many** (one-shot similarity search on the main flow), **Insert Documents** (upsert documents into the store), **Retrieve Documents (As Vector Store for Chain/Tool)**, and **Retrieve Documents (As Tool for AI Agent)**.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstorepgvector.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postgres.md | Public docs only |
| https://js.langchain.com/docs/integrations/vectorstores/pgvector | Public docs only (service contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStorePGVector`
- **Aliases:** (none observed)
- **Inputs:**
  - `main` × 0..1 — workflow items (present in insert, load, update modes; absent in retrieve-as-tool mode)
  - `ai_embedding` × 1 — required embedding sub-node (all modes)
  - `ai_document` × 1 — required document loader sub-node (insert mode only)
  - `ai_reranker` × 0..1 — optional reranker sub-node (load / retrieve / retrieve-as-tool modes, when `useReranker` is true)
- **Outputs:** dynamic based on mode:
  - `main` × 1 — for insert, load, update modes
  - `ai_vectorStore` × 1 — for retrieve mode
  - `ai_tool` × 1 — for retrieve-as-tool mode
- **Credentials:** `postgres` — standard Postgres connection credentials

### Credentials: postgres

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| host | string | — | yes | PostgreSQL server host |
| database | string | — | yes | Database name |
| user | string | — | yes | Database user |
| password | string (password) | — | yes | User password |
| port | number | — | yes | Connection port |
| ssl | options | `disable` | no | `disable`, `allow`, `require` |
| ignoreSSLIssues | boolean | — | no | Whether to connect if SSL validation fails |
| sshTunnel | boolean | — | no | Whether to tunnel over SSH |

## Parameters

### Mode discriminant

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `retrieve` | no | — | Values: `load` (Get Many), `insert`, `retrieve`, `retrieve-as-tool` |

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tableName | string | `n8n_vectors` | no | all modes | The table storing vectors. Created automatically if it does not exist. |

### Mode: load (Get Many)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | mode = `load` | Search query text; embedded and used for similarity search. |
| topK | number | 4 | no | mode = `load` | Number of top results to retrieve. |
| includeDocumentMetadata | boolean | true | no | mode = `load` | Whether to include document metadata in the output. |
| useReranker | boolean | false | no | mode = `load` | When true, requires a reranker sub-node on `ai_reranker`. |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| embeddingBatchSize | number | 200 | no | mode = `insert` (version >= 1.1) | Number of documents to embed in a single batch. |

### Mode: retrieve (As Vector Store for Chain/Tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| useReranker | boolean | false | no | mode = `retrieve` | When true, requires a reranker sub-node on `ai_reranker`. |

### Mode: retrieve-as-tool (As Tool for AI Agent)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| toolName | string | — | yes | mode = `retrieve-as-tool` (version <= 1.2) | Name of the vector store tool (alphanumeric). |
| toolDescription | string | — | yes | mode = `retrieve-as-tool` | Description of the tool for the LLM. |
| topK | number | 4 | no | mode = `retrieve-as-tool` | Number of top results to retrieve. |
| includeDocumentMetadata | boolean | true | no | mode = `retrieve-as-tool` | Whether to include document metadata. |
| useReranker | boolean | false | no | mode = `retrieve-as-tool` | When true, requires a reranker sub-node. |

### Options (available in load / retrieve / retrieve-as-tool modes)

These are grouped in a collection sub-parameter:

- **Distance Strategy** — options: `cosine` (default), `innerProduct`, `euclidean`
- **Collection** — sub-group with:
  - `useCollection` (boolean, default `false`)
  - `collectionName` (string, default `n8n`)
  - `collectionTableName` (string, default `n8n_vector_collections`)
- **Column Names** — sub-group with:
  - `idColumnName` (string, default `id`)
  - `vectorColumnName` (string, default `embedding`)
  - `contentColumnName` (string, default `text`)
  - `metadataColumnName` (string, default `metadata`)
- **Metadata Filter** — name/value pairs for AND-conjunctive filter matching against document metadata.

### Options (available in insert mode)

- **Collection** — same sub-group as above (useCollection, collectionName, collectionTableName)
- **Column Names** — same sub-group as above (idColumnName, vectorColumnName, contentColumnName, metadataColumnName)

## Runtime behavior

### External service contract (PostgreSQL + pgvector)

The node connects to any PostgreSQL instance via the `postgres` credentials and uses the pgvector extension:

- Data lives in a **table** (default `n8n_vectors`) with an ID column, a text content column, a JSON metadata column, and a vector (embedding) column. The vector dimension must match the embedding model in use.
- **Auto-creation:** if the table does not exist, it is created with the configured column names and a suitable pgvector schema.
- **Collection support:** when `useCollection` is enabled, an additional collection table (default `n8n_vector_collections`) tracks vector-to-collection membership. Queries are filtered to the specified collection.
- **Similarity search** uses the configured distance strategy (`cosine`, `innerProduct`, or `euclidean`) against the vector column.
- **Metadata filter** is applied server-side via SQL WHERE clauses as AND-conjunctive name/value matches.

### Mode: load (Get Many)

1. Require connected `ai_embedding` handle.
2. Resolve `tableName`, `prompt`, `topK`, `includeDocumentMetadata`, and any options per input item.
3. Connect to PostgreSQL via credential.
4. Embed `prompt` using the connected embedding sub-node.
5. Query the configured table, matching by vector distance using the configured distance strategy, limited to `topK` results.
6. If a collection is configured, scope the query to the collection's vectors.
7. If a metadata filter is specified, apply AND-conjunctive name/value filters.
8. If `useReranker=true` and `ai_reranker` is connected, apply reranking.
9. Return matched documents as output items: each containing `pageContent` (string), `metadata` (object), and similarity score.

### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `tableName`, `embeddingBatchSize` per input item.
3. Load documents via `ai_document` handle.
4. Connect to PostgreSQL via credential.
5. Embed documents (in batches of `embeddingBatchSize`) via connected embedding sub-node.
6. Insert rows (content + metadata + embedding) into the table.
7. If a collection is configured, register vectors in the collection tracking table.
8. Return input items as passthrough on `main` output.

### Mode: retrieve (As Vector Store for Chain/Tool)

1. Require connected `ai_embedding` handle.
2. Resolve `tableName`.
3. Connect to PostgreSQL via credential.
4. Return a vector store handle (via `ai_vectorStore` output) for use by downstream AI cluster consumers.
5. If `useReranker=true` and `ai_reranker` is connected, wrap the handle with reranking.

### Mode: retrieve-as-tool (As Tool for AI Agent)

1. Require connected `ai_embedding` handle.
2. Resolve `toolName`, `toolDescription`, `tableName`, `topK`, `includeDocumentMetadata`.
3. Connect to PostgreSQL via credential.
4. Return a tool descriptor (name, description, and vector store handle) via `ai_tool` output for use by an AI Agent.

### Input

- **load mode:** `main` items drive per-item expression evaluation for parameters.
- **insert mode:** consumes `ai_document` sub-node output for document content + `main` for passthrough.
- **retrieve / retrieve-as-tool modes:** no `main` input — node acts as a store/tool provider.
- **All modes:** `ai_embedding` sub-node provides text-to-vector transformation.
- Sub-node expressions resolve against the **first input item** only (sub-node semantics).

### Output

| mode | output channel | shape |
|------|----------------|-------|
| load | `main` | One item per matched document: `{ "json": { "pageContent": string, "metadata": object, "similarity": number } }`. Empty array if no matches. |
| insert | `main` | Passthrough of input items. |
| retrieve | `ai_vectorStore` | Vector store handle for AI cluster consumers. |
| retrieve-as-tool | `ai_tool` | Tool descriptor for AI Agent. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| Insert mode: no `ai_document` connected | Node error |
| PostgreSQL connection / auth failure | Fail the item |
| Target table cannot be created or does not exist | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `tableName` — evaluated per item (all modes via `main`)
- `prompt` — evaluated per item (load mode)
- `topK` — evaluated per item (load, retrieve-as-tool)
- `toolName`, `toolDescription` — evaluated per item (retrieve-as-tool mode)
- `idColumnName`, `vectorColumnName`, `contentColumnName`, `metadataColumnName` — evaluate per item (options)
- Metadata filter values — evaluated per item (options)

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
  "tableName": "documents",
  "prompt": "={{ $json.query }}",
  "topK": 5
}
```

**Expect:** output[0] to be an array of items, each with `json.pageContent` (string), `json.metadata` (object), and a numeric `json.similarity`. Verifies a cosine-distance similarity search was executed on table `documents` with the embedded prompt vector.

### Test: load — with metadata filter and collection

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "mode": "load",
  "tableName": "documents",
  "prompt": "neural networks",
  "topK": 3,
  "options": {
    "metadata": {
      "metadataValues": [{ "name": "category", "value": "deep-learning" }]
    },
    "collection": {
      "values": {
        "useCollection": true,
        "collectionName": "tech-docs",
        "collectionTableName": "n8n_vector_collections"
      }
    }
  }
}
```

**Expect:** Similarity search restricted to the `tech-docs` collection, filtered to documents whose metadata matches `category == "deep-learning"`. Results returned on output[0].

### Test: insert — passthrough

**Given** input items:
```json
[{ "json": { "id": 1 } }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_document` → mock document loader returning one `Document`.

**Parameters:**
```json
{
  "mode": "insert",
  "tableName": "documents"
}
```

**Expect:** Output[0] contains the same input items (passthrough). Verifies a row with content, metadata, and the embedded vector was inserted into `documents`.

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

**Expect:** No direct main output; executor returns a vector-store handle via `ai_vectorStore` output, consumable by downstream AI sub-nodes.

### Test: retrieve-as-tool — with reranker

**Given** input:
```json
[{ "json": {} }]
```

**Cluster:** `ai_embedding` → mock embedding; `ai_reranker` → mock reranker.

**Parameters:**
```json
{
  "mode": "retrieve-as-tool",
  "toolDescription": "Search product documentation",
  "tableName": "documents",
  "topK": 10,
  "useReranker": true
}
```

**Expect:** A tool descriptor returned via `ai_tool` output. Upon agent invocation, reranking is applied to search results.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node with 4 modes |
| Mode option value strings | inferred | Public docs give display labels; value strings (`load`, `insert`, `retrieve`, `retrieve-as-tool`) from corpus |
| Credentials schema | documented | Standard Postgres credentials; no dedicated credential type |
| Table auto-creation | documented | Table created if not present |
| Column name configuration | documented | Defaults: id, embedding, text, metadata |
| Collection support | documented | Separate collection table for namespacing |
| Distance strategy | documented | cosine (default), innerProduct, euclidean |
| Metadata filter | documented | AND-conjunctive name/value pairs |
| Output shape of load mode | inferred | pageContent, metadata, similarity follows LangChain Document contract |
| Embedding batch size | documented | Default 200 for insert mode |
| Retrieve / retrieve-as-tool output shape | inferred | Returns vector-store / tool descriptor for AI cluster consumers |
| Reranking | documented | Available in load, retrieve, retrieve-as-tool modes |
| Update mode | gap | Public docs and type data do not list an update mode for PGVector (unlike Supabase/Pinecone). Not included. |
| Sub-node expression semantics | documented | First-item-only resolution |
| continueOnFail behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStorePGVector.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime; PostgreSQL client via SDK dependency (postgres credentials)
- **Implement priority:**
  1. Mode discriminant (`mode` param) — 4 modes
  2. Credential resolution (`postgres` with host, database, user, password, SSL, SSH tunnel)
  3. PGVector table auto-creation with configurable column names on first insert
  4. Insert mode: `ai_document` + `ai_embedding` → batch embed and insert rows
  5. Load mode: `ai_embedding` → similarity search with distance strategy → optional reranker → output documents with similarity
  6. Retrieve mode: return vector-store handle for AI cluster consumers
  7. Retrieve As Tool mode: return tool descriptor with name/description
  8. Collection namespacing across all modes
  9. Metadata filter support (load / retrieve-as-tool modes)
  10. `useReranker` conditional `ai_reranker` sub-node
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStorePGVector.test.ts`
