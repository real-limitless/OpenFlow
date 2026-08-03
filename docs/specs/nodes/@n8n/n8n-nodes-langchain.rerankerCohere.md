---
type: "@n8n/n8n-nodes-langchain.rerankerCohere"
displayName: Reranker Cohere
category: AI
versions: [1]
priority: high
status: specced
---

# Reranker Cohere

Cluster **sub-node**: configures a Cohere reranking model and supplies it to a root node (Vector Store Retriever, Question and Answer Chain, etc.) on the `ai_reranker` channel. It does **not** process items on `main` directly — the parent root node invokes the reranker provider with a query and a list of candidate documents, and receives the documents reordered by relevance.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.rerankercohere.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cohere.md | Public docs only |
| https://docs.cohere.com/docs/models#rerank | Third-party service API docs |
| https://docs.cohere.com/reference/rerank | Third-party service API docs |
| https://api.n8n.io/api/templates/search?search=reranker%20cohere (template gallery search — confirmed type string, typeVersion, display name, categories) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.rerankerCohere`
- **Aliases:** (none)
- **Inputs:** none (sub-node; connects via `ai_reranker` channel)
- **Outputs:** none (sub-node; connects via `ai_reranker` channel)
- **Credentials:** `cohereApi` (Cohere API key)
- **typeVersion:** 1 (confirmed via public template gallery node metadata)
- **Categories:** AI, Langchain
- **group:** `transform`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `modelName` | options | `"rerank-v3.5"` | yes | — | Reranking model to use. Option labels and underlying model IDs are from Cohere's public model documentation. |
| `topN` | number | `3` | no | — | Maximum number of documents to return after reranking. |

**Model options (documented in n8n public docs and Cohere model docs):**
- **Rerank v3.5** — latest multilingual reranker (model ID: `rerank-v3.5`)
- **Rerank English v3.0** — English-optimized reranker (model ID: `rerank-english-v3.0`)
- **Rerank Multilingual v3.0** — multilingual reranker (model ID: `rerank-multilingual-v3.0`)

The option set may also allow a custom value via expression.

**Credential fields (from Cohere credentials doc):**
- `apiKey` (required) — Cohere API key from the Cohere dashboard.

## Runtime behavior

### Input

None on `main`. The parent root node invokes the reranker provider over the `ai_reranker` channel with:
- `query`: string — the search query
- `documents`: array of objects — candidate documents, each containing at minimum `pageContent` (string) and optionally `metadata`

### Output

None on `main`. When invoked, the sub-node calls the Cohere Rerank API (`POST https://api.cohere.com/v2/rerank`) with Bearer token auth and returns the reranked documents in descending relevance order.

**External API contract (Cohere Rerank v2):**
- Endpoint: `POST https://api.cohere.com/v2/rerank`, `Authorization: Bearer <apiKey>`
- Request body:
  - `model` (required): one of `rerank-v3.5`, `rerank-english-v3.0`, `rerank-multilingual-v3.0`
  - `query` (required): string
  - `documents` (required): array of strings or objects with `text` field — the candidate texts to rerank
  - `top_n` (optional): number — max results to return (default: return all)
  - `return_documents` (optional): boolean — whether to return the document text in response (default: true)
- Response: `{ id, results: [{ index, relevance_score, document }], meta }`
  - `index`: original position in the input array
  - `relevance_score`: float between 0 and 1
  - `document`: the reranked document text (if `return_documents: true`)

The provider must map the API response back to the original document objects, preserving their metadata, ordered by descending `relevance_score`, and truncated to `top_n` if specified.

### Errors

- **Missing credentials** → throw (provider cannot initialize)
- **Invalid API key** → throw on first invocation (401 from Cohere)
- **Rate limit / quota** → throw (429 / 403 from Cohere); the parent root node may handle it if its own `continueOnFail` is set
- **Invalid request** → throw (400/422 from Cohere, e.g. malformed body, invalid model, empty documents array)
- **Empty documents array** → no API call; return empty array

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first input item** of the parent run. So a dynamic `modelName` or `topN` (e.g. `{{ $json.model }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic rerank call

**Given** parent root node invokes the reranker provider with:

```json
{
  "query": "What is OpenFlow?",
  "documents": [
    { "pageContent": "OpenFlow is a workflow engine", "metadata": { "source": "doc1" } },
    { "pageContent": "The weather is sunny today", "metadata": { "source": "doc2" } },
    { "pageContent": "Workflows automate business processes", "metadata": { "source": "doc3" } }
  ]
}
```

**Parameters:**

```json
{ "modelName": "rerank-v3.5", "topN": 2 }
```

**Expect** the provider calls Cohere `POST https://api.cohere.com/v2/rerank` with:

```json
{
  "model": "rerank-v3.5",
  "query": "What is OpenFlow?",
  "documents": ["OpenFlow is a workflow engine", "The weather is sunny today", "Workflows automate business processes"],
  "top_n": 2,
  "return_documents": true
}
```

and `Authorization: Bearer <apiKey>`. Output on `ai_reranker` is an array of 2 document objects (with original metadata preserved), ordered by descending relevance score. The first result should be the document about OpenFlow/workflows.

### Test: model selection

**Given** parent invokes reranker.

**Parameters:** `{ "modelName": "rerank-english-v3.0", "topN": 3 }`

**Expect** request body `model` = `rerank-english-v3.0`; all 3 documents returned (since `topN` >= input count). With `rerank-multilingual-v3.0`, same behavior but multilingual model.

### Test: expression resolves to first item only

**Given** parent run has input items with differing `modelName` values:

```json
[{ "json": { "modelName": "rerank-v3.5" } }, { "json": { "modelName": "rerank-english-v3.0" } }]
```

**Parameters:**

```json
{ "modelName": "={{ $json.modelName }}", "topN": 2 }
```

**Expect** the provider is configured once using the **first** item only (`rerank-v3.5`); both rerank calls use that model. The second item's `modelName` value is never consulted.

### Test: topN limits results

**Given** parent invokes reranker with 10 documents.

**Parameters:** `{ "modelName": "rerank-v3.5", "topN": 3 }`

**Expect** request body `top_n` = `3`; returned array contains exactly 3 document objects.

### Test: missing credential

**Given** the node has no `cohereApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error (sub-node itself has no `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, categories, typeVersion | documented (public workflow JSON metadata) | Confirmed `@n8n/n8n-nodes-langchain.rerankerCohere`, v1, "Reranker Cohere", AI + Langchain |
| Parameter names `modelName`, `topN` | documented (public docs + node descriptor) | n8n docs mention "Model" parameter; v1.ts confirms names and defaults |
| Model option set | documented | n8n docs link to Cohere model docs; Cohere public docs list the three rerank models |
| Default values | documented | v1.ts shows `modelName` default `rerank-v3.5`, `topN` default `3` |
| Credential type string `cohereApi` | inferred | Docs name the credential "Cohere" (API key); `cohereApi` follows the sibling langchain credential naming pattern (e.g. `openAiApi`) |
| Channel name `ai_reranker` | inferred | Standard naming pattern for LangChain cluster sub-nodes (`ai_embedding`, `ai_languageModel`, `ai_vectorStore`, `ai_memory`, `ai_tool`) |
| Parameters beyond `modelName`, `topN` | inferred (none) | Only these two are documented for this node |
| Cohere Rerank API version | inferred | Current Cohere API uses v2; n8n implementation likely targets v2 |
| Batch/rate limit handling | gap | Not documented; implementer decision (exponential backoff typical) |
| Document mapping strategy | inferred | Must preserve original document metadata when mapping API response back |
| Retry / backoff policy | gap | Not documented; implementer decision |
| Sub-node "first item" expression rule | documented | Covered in the n8n sub-nodes doc pages |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/reranker-cohere.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.rerankerCohere` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers a reranker provider on the `ai_reranker` channel for root nodes (Vector Store Retriever, Chains); calls the Cohere Rerank API (`/v2/rerank`) with credential-backed Bearer auth — do **not** load `@n8n/n8n-nodes-langchain` or Cohere SDK packages