---
type: "@n8n/n8n-nodes-langchain.retrieverVectorStore"
displayName: Vector Store Retriever
category: AI
versions: [1]
priority: medium
status: specced
---

# Vector Store Retriever

Cluster **sub-node** that wraps a connected vector store root node as a LangChain retriever. Accepts workflow data items on `main` (passes them through on output[0]) and emits a retriever handle on output[1] (`ai_retriever`) for consumption by parent cluster nodes (QA Chain, AI Agent, etc.).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.retrievervectorstore.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.retrieverVectorStore`
- **Aliases:** (none)
- **Inputs:**
  - `main` × 1 — workflow data items. Passthrough only.
  - `ai_vectorStore` × 1 — required connection to a vector store root node (e.g. InMemory, Milvus, PGVector). The connected node provides a handle with a `similaritySearch(query, k)` method.
- **Outputs:**
  - `main` × 1 — passthrough of input items (unmodified `.json`, `.binary`, `.pairedItem`)
  - `ai_retriever` × 1 — a `RetrieverVectorStoreHandle` object (see contract below)
- **Credentials:** none (credentials are on the connected vector store root node)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `topK` | number | `4` | no | Maximum number of documents to return per retrieval query. UI display name: "Limit". |

`topK` is the only parameter. Accepts static numbers or expressions. Expression resolution follows sub-node rules (first item only).

### Sub-node expression resolution

As a sub-node, expressions resolve against the **first input item only** (`inputItems[0]?.json`). This differs from root nodes which evaluate per item. If `topK` is an expression, it is evaluated once against the first item's JSON data, and the result is used for all items.

## Runtime behavior

### Input processing

1. Receives workflow data items on `main` (input 0).
2. Locates the connected vector store root node via `ai_vectorStore` connection.
3. Retrieves the vector store handle from the connected node's output. The handle must expose `similaritySearch(query: string, k: number): Promise<Document[]>`.

### Parameter resolution

1. Reads `topK` from node parameters (default `4`).
2. If `topK` is a static number, use it directly.
3. If `topK` is an expression string (starts with `=`), evaluate against `inputItems[0]?.json` only.
4. If evaluated value is not a finite positive number, fall back to `4`.
5. The final value is floored to an integer.

### Output

Returns an array of two output arrays:

| Output | channel | contents |
|--------|---------|----------|
| `out[0]` | `main` | Passthrough: each input item copied with `.json`, `.binary`, `.pairedItem` preserved |
| `out[1]` | `ai_retriever` | Single item containing `RetrieverVectorStoreHandle` |

### RetrieverVectorStoreHandle contract

```ts
interface RetrieverVectorStoreHandle {
  type: "@n8n/n8n-nodes-langchain.retrieverVectorStore";
  topK: number;
  getRelevantDocuments(query: string): Promise<Document[]>;
  invoke(input: { query: string }): Promise<Document[]>;
}

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}
```

- `getRelevantDocuments(query)` — delegates to `vectorStore.similaritySearch(query, topK)`
- `invoke({ query })` — delegates to `vectorStore.similaritySearch(query, topK)`

Both methods respect the resolved `topK` limit: if the vector store returns more documents, only `topK` are returned.

### Errors

| condition | behavior |
|-----------|----------|
| No `ai_vectorStore` connection found | Throws error: "A Vector Store sub-node must be connected via ai_vectorStore" |
| Connected node's handle lacks `similaritySearch` | Throws error: "Connected node is not a valid vector store" |
| Expression in `topK` fails to resolve | Throws expression evaluation error |
| `continueOnFail` | Standard n8n sub-node behavior; error emitted on item, workflow continues |

## Acceptance tests

### Test: static topK with passthrough

**Given** input items:
```json
[{ "json": { "limit": 5 } }]
```

**Parameters:**
```json
{ "topK": 5 }
```

**Cluster:** `ai_vectorStore` → mock vector store handle with `similaritySearch`.

**Expect output[0] (main passthrough):**
```json
[{ "json": { "limit": 5 } }]
```

**Expect output[1] (ai_retriever):** single item whose `.json` is a `RetrieverVectorStoreHandle` with `topK === 5`.

### Test: default topK when param absent

**Given** input items: `[{}]`

**Parameters:** `{}`

**Expect:** output[1] handle has `topK === 4`. Output[0] has 1 passthrough item.

### Test: expression-driven topK (resolves against first item)

**Given** input items:
```json
[{ "json": { "desiredCount": 3 } }]
```

**Parameters:**
```json
{ "topK": "={{ $json.desiredCount }}" }
```

**Expect:** `topK` resolved to `3`. Output[1] handle has `topK === 3`.

### Test: sub-node expression resolves first item only with two inputs

**Given** input items:
```json
[{ "json": { "limit": 10 } }, { "json": { "limit": 1 } }]
```

**Parameters:**
```json
{ "topK": "={{ $json.limit }}" }
```

**Expect:** Expression resolves against the first item only → `topK === 10`. Output[0] has 2 passthrough items. Output[1] handle has `topK === 10`.

### Test: multiple items pass through unmodified

**Given** input items:
```json
[{ "json": { "a": 1 } }, { "json": { "a": 2 } }, { "json": { "a": 3 } }]
```

**Parameters:** `{ "topK": 4 }`

**Expect output[0]** has 3 items with `.json` values `{ a: 1 }`, `{ a: 2 }`, `{ a: 3 }`.

### Test: retriever handle respects topK on similarity search

**Given** mock vector store with 5 documents and `topK: 3`.

**Expect:** `handle.getRelevantDocuments('q')` and `handle.invoke({ query: 'q' })` each return exactly 3 documents, calling `similaritySearch('q', 3)` on the underlying store.

### Test: throws when no ai_vectorStore is connected

**Cluster:** No `ai_vectorStore` connection.

**Expect:** Executor throws error matching `/Vector Store.*must be connected/i`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string & sub-node role | documented | `@n8n/n8n-nodes-langchain.retrieverVectorStore`, version 1 |
| `topK` parameter (default 4) | documented | Public docs confirm "Limit"; internal name `topK`, default 4 |
| `ai_vectorStore` input | documented | Required typed connection for vector store handle |
| `main` input + passthrough on output[0] | inferred | OpenFlow executor preserves input items through output[0]; not described in public n8n sub-node docs but follows from cluster-node passthrough convention |
| `ai_retriever` on output[1] | documented | Sub-node produces retriever handle; tests confirm it lives at `out[1][0].json` |
| Sub-node expression resolution | documented | Public docs confirm sub-nodes resolve expressions against first item only |
| `RetrieverVectorStoreHandle` contract | inferred | Standard LangChain retriever interface: `getRelevantDocuments`, `invoke`, plus `type` and `topK` metadata |
| No credentials | documented | Credentials live on the vector store root node |
| Error on missing `ai_vectorStore` | inferred | Standard n8n pattern for required sub-node connections |
| Error on invalid vector store handle | inferred | Executor validates `similaritySearch` exists on the handle |

## OpenFlow mapping

- **Definition group:** `ai` (retriever sub-node)
- **Executor file:** `src/lib/engine/executors/retrieverVectorStore.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; vector store handle supplied via OpenFlow AI sub-node runtime (`ai_vectorStore` channel); `main` passthrough + `ai_retriever` handle on two outputs
- **Implement priority:**
  1. `ai_vectorStore` connection discovery and validation
  2. `topK` parameter resolution (static default 4, or expression against first item)
  3. `main` passthrough — copy input items to output[0]
  4. Retriever handle creation — wrap `similaritySearch` with resolved `topK`
  5. Return `[mainOut, [retrieverItem]]`
  6. Error handling: missing connection, invalid handle, expression failure