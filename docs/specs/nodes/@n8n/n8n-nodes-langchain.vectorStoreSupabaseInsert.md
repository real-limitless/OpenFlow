---
type: "@n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert"
displayName: "Supabase: Insert"
category: AI
versions: [1]
priority: medium
status: specced
---

# Supabase: Insert

## Purpose

Specialized **cluster root** node: inserts documents into a Supabase vector store. This is a single-mode variant of the full Supabase Vector Store node (`@n8n/n8n-nodes-langchain.vectorStoreSupabase`), restricted to **Insert Documents** only. It requires Document and Embedding sub-nodes and emits input items as passthrough.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoresupabase.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/supabase.md | Public docs only |
| https://supabase.com/docs/guides/ai/langchain | Public docs only (service contract) |
| https://supabase.com/docs/guides/api | Public docs only (service contract) |

The Insert-only variant has no dedicated documentation page. Its behavior is the Insert Documents mode of the full Supabase Vector Store node, confirmed by the published JSON descriptor.

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert`
- **Aliases:** (none)
- **Inputs:**
  - `main` × 1 — workflow items (drives per-item expression resolution)
  - `ai_embedding` × 1 — required embedding sub-node
  - `ai_document` × 1 — required document loader sub-node
- **Outputs:** `main` × 1 — passthrough of input items
- **Credentials:** `supabaseApi`

### Credentials: supabaseApi

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| host | string | — | yes | Supabase project URL, e.g. `https://your_project.supabase.co` (omit `/rest/v1` path) |
| secretKey | string (password) | — | yes | Supabase secret/API key |

The credential authenticates against the Supabase **Data API** (PostgREST), which must be enabled for the project. Requests use bearer token / `apikey` header with JSON encoding.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tableName | resourceLocator (list/string) | — | yes | always | Supabase table to insert into. Supports dynamic listing via search method. |
| queryName | string | `match_documents` | yes | always | Name of the matching function set up in Supabase (per Supabase quickstart). |
| notice | notice | — | — | always | Informational text: "Specify the document to load in the document loader sub-node" |

The node also displays a setup notice linking to the Supabase documentation for database-as-vector-store setup.

No mode selector is exposed — this node always performs insert.

## Runtime behavior

### External service contract (Supabase Data API)

- Data lives in a Supabase Postgres table with `pgvector` column (e.g. `documents` with content, metadata, and embedding columns). The vector dimension must match the embedding model.
- Insert writes new rows (content + metadata + embedding vector) into the target table via the Data API.

### Execution flow

1. Resolve `tableName` per input item using the resource-locator value.
2. Connect to Supabase via `supabaseApi` credential (host + secret key, Data API).
3. Load documents via connected `ai_document` sub-node.
4. Embed document content via connected `ai_embedding` sub-node.
5. Insert rows (content + metadata + embedding) into the target Supabase table.
6. Return original input items as passthrough on `main` output[0].

### Input

- `main` items drive per-item expression evaluation for `tableName`.
- `ai_document` sub-node provides the document(s) to insert (content + metadata).
- `ai_embedding` sub-node provides text-to-vector transformation for each document.
- Sub-node expressions resolve against the **first input item** only (standard sub-node semantics).

### Output

| output | shape |
|--------|-------|
| main[0] | Passthrough of input items. Each item is unchanged: `{ "json": { ... }, "binary": { ... } }` |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error |
| No `ai_document` connected | Node error |
| Supabase connection / auth failure | Fail the item (invalid secret key, Data API disabled, network error) |
| Target table does not exist or lacks pgvector column | Fail the item |
| Embedding failure | Fail the item unless `continueOnFail` |
| `continueOnFail` | Standard: emit error on item, continue workflow |

### Expressions

- `tableName` — evaluated per item
- `queryName` — evaluated per item

## Acceptance tests

### Test: insert single document — passthrough

**Given** input items:
```json
[{ "json": { "id": 1, "source": "doc1" } }]
```

**Cluster:** `ai_embedding` → mock embedding returning `[0.1, 0.2, 0.3]`; `ai_document` → mock document loader returning one `Document` with pageContent `"test content"` and metadata `{ "source": "test" }`.

**Parameters:**
```json
{
  "tableName": "documents",
  "queryName": "match_documents"
}
```

**Expect** output[0] to equal input items (passthrough). Mock confirms a row with content `"test content"`, metadata `{ "source": "test" }`, and the embedding vector `[0.1, 0.2, 0.3]` was inserted into table `documents`.

### Test: insert with tableName expression

**Given** input items:
```json
[{ "json": { "table": "my_vectors" } }]
```

**Parameters:**
```json
{
  "tableName": "={{ $json.table }}"
}
```

**Expect** executor resolves `tableName` to `"my_vectors"` and inserts into that table. Output is passthrough.

### Test: insert multiple documents from loader

**Given** input items:
```json
[{ "json": { "batch": "a" } }]
```

**Cluster:** `ai_document` → mock returning two `Document` objects (different content). `ai_embedding` → mock returning one vector per document.

**Expect** two rows inserted into the target table. Output is the single input item (passthrough).

### Test: missing sub-node error

**Given** input items:
```json
[{ "json": {} }]
```

**Cluster:** no `ai_embedding` connected.

**Expect** node throws an error stating that the embedding sub-node is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Hidden single-mode variant of the Supabase Vector Store |
| No mode selector | confirmed | Node always performs insert (no mode parameter) |
| tableName as resourceLocator | confirmed | Supports list mode (dynamic search) and ID mode (string) |
| Credentials (supabaseApi) | documented | Same host + secret key as full Supabase node |
| Inputs (ai_embedding, ai_document) | confirmed | Both required |
| Output (passthrough) | inferred | Standard insert behavior in vector store nodes |
| Insert mechanics | documented | Public Supabase Vector Store docs describe insert mode |
| queryName default `match_documents` | confirmed | Hardcoded default from descriptor |
| Sub-node expression semantics | documented | Standard n8n sub-node behavior (first item only) |
| tableName resolved per item | inferred | Follows standard expression resolution pattern |
| continueOnFail handling | inferred | Standard n8n pattern |
| Embedding batch size | gap | Not documented; OpenFlow: process per item |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node — insert-only variant)
- **Executor file:** `src/lib/engine/executors/vectorStoreSupabaseInsert.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document handles via OpenFlow AI sub-node runtime; Supabase Data API client via SDK dependency
- **Implement priority:**
  1. Credential resolution (`supabaseApi` with host + secret key)
  2. `tableName` parameter (resource-locator, both list and string modes)
  3. Document loading via `ai_document` sub-node
  4. Embedding via `ai_embedding` sub-node
  5. Row insertion into target Supabase table
  6. Output passthrough
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreSupabaseInsert.test.ts`
