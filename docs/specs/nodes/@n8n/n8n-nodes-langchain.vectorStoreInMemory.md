---
type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory"
displayName: Simple Vector Store
category: AI
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Simple Vector Store

Cluster **root** node: provides an in-memory vector store for RAG workflows. Data is stored in server memory and lost on n8n restart. Can be used in three modes — **Insert**, **Retrieve**, **Load** — with shared `memoryKey` to coordinate across nodes.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreinmemory.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreinmemory/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/ | Public docs only |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.vectorStoreInMemory`
- **Aliases:** (none observed in public exports)
- **typeVersion:** `1` (v1), `1.1` (v1.1), `1.2` (v1.2), `1.3` (v1.3) — mode discriminant and `memoryKey` type change at v1.2
- **Inputs:**
  - `main` × 1 — workflow items (used for per-item parameters, expression evaluation)
  - `ai_embedding` × 1 — required embedding sub-node (provides vector embeddings)
  - `ai_document` × 1 — required document loader sub-node (Insert mode only)
- **Outputs:** `main` × 1 — passthrough of input items (Insert) or retrieved documents (Retrieve/Load)
- **Credentials:** none on root node (embedding credentials live on sub-node)

Cluster topology: sub-nodes connect **into** the vector store on AI channels; the vector store’s `main` output continues the workflow. The `memoryKey` is shared across Insert / Retrieve / Load nodes in the same workflow to address the same in-memory store.

## Parameters

Wire names from **public workflow JSON**; UI labels and defaults from **public docs**. Marked **inferred** where docs describe behavior but not the exact JSON key.

### Shared (all modes)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options / string | `insert` when omitted (**inferred** from UI default) | no | — | Values: `insert`, `retrieve`, `load`. Root node exposes all three; separate hidden sub-nodes exist for each mode (`vectorStoreInMemoryInsert`, `vectorStoreInMemoryLoad`) but the root node is the documented surface. |
| memoryKey | string / resourceLocator | `vector_store_key` | yes | — | **v1–v1.1:** string, default `vector_store_key`, prefixed with workflow ID at runtime. **v1.2+:** `resourceLocator` with `list` (search existing vector stores) and `manual` modes; default `{ mode: "list", value: "vector_store_key" }`. Keys are shared across workflows. |

### Mode: insert

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| clearStore | boolean | `false` | no | show when `mode` = `insert` | Whether to clear the store before inserting new documents. |

### Mode: retrieve (as retriever / tool)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| useReranker | boolean | `false` | no | show when `mode` = `retrieve` | When true, requires a `reranker` sub-node on `ai_reranker` (shown conditionally). |

### Mode: load (query + return documents)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| prompt | string (expression) | — | yes | show when `mode` = `load` | Query text to search for. Evaluated per input item via `ctx.evaluate`. |
| topK | number (expression) | `4` | no | show when `mode` = `load` | Maximum number of documents to return. |
| includeDocumentMetadata | boolean | `false` | no | show when `mode` = `load` | Whether to include document metadata in the output. |
| useReranker | boolean | `false` | no | show when `mode` = `load` | When true, requires a `reranker` sub-node on `ai_reranker` (shown conditionally). |

### Sub-nodes (connected on AI channels)

| channel | required per mode | notes |
|---------|-------------------|-------|
| `ai_embedding` | all modes | Exactly 1 embedding sub-node (e.g., `@n8n/n8n-nodes-langchain.embeddingsOpenAi`) |
| `ai_document` | `insert` only | Exactly 1 document loader sub-node (e.g., `@n8n/n8n-nodes-langchain.documentDefaultDataLoader`) |
| `ai_reranker` | `retrieve` / `load` when `useReranker=true` | Optional reranker sub-node |

## Runtime behavior

### OpenFlow implementer contract (MUST)

Independent behavioral contract for `vectorStoreInMemory.ts`. Paraphrased from public docs; OpenFlow baselines marked where docs are silent. **Do not** load third-party packages.

#### Memory key resolution

- **v1–v1.1:** `memoryKey` is a string parameter. At runtime, prefix with workflow ID: `${workflowId}__${memoryKey}`. This isolates stores per workflow execution.
- **v1.2+:** `memoryKey` is a `resourceLocator` with `mode: "list" | "id"` and `value: string`. Use `value` directly (no workflow prefix) — keys are shared across workflows. The `list` mode provides a searchable list of existing keys via `MemoryVectorStoreManager.getMemoryKeysList()`.
- Default `memoryKey` value is `vector_store_key` across versions.

#### In-memory store backend

- All operations delegate to `@n8n/ai-utilities`'s `MemoryVectorStoreManager` (singleton per embedding instance).
- The manager holds a `Map<string, MemoryVectorStore>` keyed by `memoryKey`.
- Data is **in-process memory only**: lost on n8n restart, not shared across n8n instances, and accessible to all users of the same n8n instance.
- **Warning banner** shown in UI: "For experimental use only: Data is stored in memory and will be lost if n8n restarts. Data may also be cleared if available memory gets low, and is accessible to all users of this instance."

#### Mode: insert

1. Require connected `ai_embedding` and `ai_document` handles.
2. Resolve `memoryKey` per item (string or resourceLocator.value).
3. Resolve `clearStore` boolean per item.
4. Load documents via `ai_document` handle (produces LangChain `Document[]`).
5. Call `MemoryVectorStoreManager.getInstance(embeddings, logger).addDocuments(memoryKey, documents, clearStore)`.
6. Return input items passthrough (serialized documents on `json`).

#### Mode: retrieve (as retriever / tool)

- This mode exposes the vector store as a **retriever** for use by:
  - AI Agent (`ai_tool` channel via `@n8n/n8n-nodes-langchain.toolVectorStore`)
  - Question and Answer Chain (`ai_retriever` channel)
  - Vector Store Retriever sub-node (`@n8n/n8n-nodes-langchain.retrieverVectorStore`)
- Runtime: resolve `memoryKey`, get vector store client from `MemoryVectorStoreManager`, return a retriever handle (LangChain `VectorStoreRetriever`).
- If `useReranker=true`, require `ai_reranker` sub-node and wrap retriever with reranker.

#### Mode: load

1. Require connected `ai_embedding` handle.
2. Resolve `memoryKey`, `prompt`, `topK`, `includeDocumentMetadata` per item.
3. Get vector store client from `MemoryVectorStoreManager`.
4. Perform similarity search: `vectorStore.similaritySearch(prompt, topK)`.
5. If `useReranker=true`, apply reranker from `ai_reranker` sub-node.
6. Return matched documents as output items:
   - `json.pageContent` (string)
   - `json.metadata` (object, present when `includeDocumentMetadata=true`)

### Input

- **Insert:** main items drive per-item `memoryKey`/`clearStore`; `ai_document` and `ai_embedding` sub-nodes supply documents and embeddings.
- **Retrieve:** main items typically unused (retriever is stateless); `ai_embedding` required; `ai_reranker` optional.
- **Load:** main items provide query context (expressions in `prompt`); `ai_embedding` required; `ai_reranker` optional.

### Output

| mode | output[0] shape |
|------|-----------------|
| insert | Passthrough of input items; each item’s `json` contains serialized document info (from `ai_document` output). |
| retrieve | No direct main output — node acts as a retriever handle for cluster consumers. |
| load | One item per retrieved document: `{ "json": { "pageContent": string, "metadata?: object } }`. If no matches, empty array. |

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_embedding` connected | Node error ("An Embedding sub-node must be connected") |
| Insert mode: no `ai_document` connected | Node error ("A Document Loader sub-node must be connected") |
| Load mode: empty/null `prompt` after expression evaluation | Skip item / return empty results (docs: "empty prompt returns no documents") |
| Embedding / document loading failures | Fail the item unless workflow-level `continueOnFail` is set |
| Memory store unavailable / OOM | Fail the item (manager throws) |
| `continueOnFail` | Standard: emit error on item / continue |

### Expressions

- `memoryKey` (string / resourceLocator value) — evaluated per item via `ctx.evaluate`.
- `clearStore` (boolean) — evaluated per item.
- `prompt` (string, load mode) — evaluated per item.
- `topK` (number, load mode) — evaluated per item.
- `includeDocumentMetadata` (boolean, load mode) — evaluated per item.
- `useReranker` (boolean) — evaluated per item.

## Acceptance tests

Fixtures for `batch-queue-vectorStoreInMemory.test.ts` (and equivalent). Shape assertions; embeddings/documents are mock-driven.

### Test: insert — basic

**Given** input items:
```json
[{ "json": { "text": "Hello world" } }]
```

**Cluster (logical):** `ai_embedding` → mock embedding handle returning `[0.1, 0.2, 0.3]`; `ai_document` → mock document loader returning one `Document` with `pageContent: "Hello world"`.

**Parameters:**
```json
{
  "mode": "insert",
  "memoryKey": "test_store",
  "clearStore": false
}
```

**Expect** output[0]:
```json
[{ "json": { "pageContent": "Hello world", "metadata": {} } }]
```

Notes:
- Mock `MemoryVectorStoreManager.addDocuments` called with resolved `memoryKey` (v1.2+: `"test_store"`; v1–v1.1: `"workflowId__test_store"`).
- Items passthrough with serialized documents.

### Test: insert — clearStore true

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "mode": "insert",
  "memoryKey": "test_store",
  "clearStore": true
}
```

**Expect:** `MemoryVectorStoreManager.addDocuments` called with `clearStore: true`. Output passthrough.

### Test: load — basic retrieval

**Given** input items:
```json
[{ "json": { "question": "What is the capital of France?" } }]
```

**Cluster (logical):** `ai_embedding` → mock embedding handle.

**Parameters:**
```json
{
  "mode": "load",
  "memoryKey": "test_store",
  "prompt": "={{ $json.question }}",
  "topK": 2,
  "includeDocumentMetadata": true
}
```

**Mock setup:** `MemoryVectorStoreManager.getVectorStore("test_store")` returns a store whose `similaritySearch("What is the capital of France?", 2)` resolves to two `Document` objects with `pageContent` and `metadata`.

**Expect** output[0] (order preserved):
```json
[
  { "json": { "pageContent": "Paris is the capital of France.", "metadata": { "source": "wiki" } } },
  { "json": { "pageContent": "France's capital city is Paris.", "metadata": { "source": "news" } } }
]
```

### Test: retrieve — as retriever handle (tool / agent)

**Given** no main input items (or single empty item `[{ "json": {} }]`).

**Cluster (logical):** `ai_embedding` → mock embedding handle.

**Parameters:**
```json
{
  "mode": "retrieve",
  "memoryKey": "test_store",
  "useReranker": false
}
```

**Expect:** Executor returns a retriever handle (shape opaque to tests; verified by downstream consumer tests — e.g., `toolVectorStore` or `retrieverVectorStore` acceptance tests). No main output items produced directly.

### Test: load — with reranker

**Given** input items:
```json
[{ "json": { "query": "best coffee" } }]
```

**Cluster (logical):** `ai_embedding` → mock embedding; `ai_reranker` → mock reranker that reorders results.

**Parameters:**
```json
{
  "mode": "load",
  "memoryKey": "test_store",
  "prompt": "={{ $json.query }}",
  "topK": 3,
  "useReranker": true
}
```

**Expect:** `similaritySearch` called, then reranker handle invoked; output reflects reranked order.

### Test: multi-item batching (insert)

**Given** input items:
```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**
```json
{
  "mode": "insert",
  "memoryKey": "={{ 'store_' + $json.id }}",
  "clearStore": false
}
```

**Expect:** Two separate `addDocuments` calls with keys `"store_1"` and `"store_2"`. Output length 2, order preserved.

### Test: memoryKey resourceLocator (v1.2+)

**Given** input `[{ "json": {} }]`, typeVersion `1.3`.

**Parameters:**
```json
{
  "mode": "insert",
  "memoryKey": { "mode": "list", "value": "shared_store" },
  "clearStore": false
}
```

**Expect:** `memoryKey` resolved to `"shared_store"` (no workflow prefix). `addDocuments` called with `"shared_store"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & cluster role | documented | Root vector store node |
| Three modes (insert/retrieve/load) | documented | Root node exposes all; hidden sub-nodes exist per mode |
| `memoryKey` string → resourceLocator at v1.2 | documented + public JSON | Workflow prefix dropped at v1.2 |
| Default `memoryKey` value | documented | `vector_store_key` |
| `clearStore` param | documented | Insert mode only |
| `topK`, `includeDocumentMetadata`, `prompt` | documented | Load mode only |
| `useReranker` + `ai_reranker` sub-node | documented | Retrieve/Load modes |
| Sub-node channels (`ai_embedding`, `ai_document`, `ai_reranker`) | documented + public JSON | Required per mode |
| In-memory semantics (lost on restart, shared across users) | documented | Warning banner text |
| `MemoryVectorStoreManager` singleton behavior | inferred from public code snippets | Not in end-user docs; OpenFlow uses SDK equivalent |
| Retrieve mode output shape (retriever handle) | gap | Docs describe usage, not executor return; OpenFlow: return handle via AI channel |
| Exact `similaritySearch` options (filter, score threshold) | gap | Not exposed in UI; OpenFlow: not supported unless docs add |
| `embeddingBatchSize` param | gap (seen in schema) | v1.3 insert schema has `embeddingBatchSize` optional; not in public docs — treat as optional passthrough to manager |
| Multi-item batching | gap | OpenFlow: one run per item (baseline) |
| `continueOnFail` behavior | inferred | Standard n8n pattern |

## OpenFlow mapping

- **Definition group:** `ai` (vector store root node)
- **Executor file:** `src/lib/engine/executors/vectorStoreInMemory.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; embedding/document/reranker handles supplied via OpenFlow AI sub-node runtime — **do not** load `@n8n/n8n-nodes-langchain` or `@n8n/ai-utilities` packages
- **Implement priority:**
  1. Mode discriminant (`mode` param) + shared `memoryKey` resolution (v1–v1.1 vs v1.2+)
  2. Insert: `ai_document` + `ai_embedding` → `addDocuments` with `clearStore`
  3. Load: `ai_embedding` → `similaritySearch` → optional reranker → output documents
  4. Retrieve: `ai_embedding` → return retriever handle for AI consumers (Agent tool, QA Chain, Retriever sub-node)
  5. `useReranker` conditional `ai_reranker` sub-node
  6. Multi-item batching (per-item loop)
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-vectorStoreInMemory.test.ts` — cover insert/load/retrieve modes, clearStore, multi-item, reranker, v1.2+ resourceLocator