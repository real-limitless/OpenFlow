---
type: "@n8n/n8n-nodes-langchain.embeddingsCohere"
displayName: Embeddings Cohere
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings Cohere

Cluster **sub-node**: configures a Cohere embeddings model and supplies it to a root node (AI Agent, Question and Answer Chain, Simple Vector Store insert, Default Data Loader, etc.) on the `ai_embedding` channel. It does **not** process items on `main` directly — the parent root node invokes the embeddings provider with documents/text to embed, and receives numeric vectors back.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingscohere.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cohere.md | Public docs only |
| https://docs.cohere.com/docs/models | Third-party service API docs |
| https://docs.cohere.com/reference/embed | Third-party service API docs |
| https://api.n8n.io/api/templates/search?search=embeddings%20cohere (template gallery search — confirmed type string, typeVersion, display name, categories) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsCohere`
- **Aliases:** (none)
- **Inputs:** none (sub-node; connects via `ai_embedding` channel)
- **Outputs:** none (sub-node; connects via `ai_embedding` channel)
- **Credentials:** `cohereApi` (Cohere API key)
- **typeVersion:** 1 (confirmed via public template gallery node metadata)
- **Categories:** AI, Langchain
- **group:** `transform`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `model` | options | `"embed-english-v2.0"` | yes | — | Embeddings model to use. Option labels and dimensions below are from public docs; the underlying model ID strings follow Cohere's model naming. |

**Model options (documented in n8n public docs):**
- **Embed-English-v2.0** — 4096 dimensions
- **Embed-English-Light-v2.0** — 1024 dimensions
- **Embed-Multilingual-v2.0** — 768 dimensions

Underlying model ID strings inferred to be `embed-english-v2.0`, `embed-english-light-v2.0`, `embed-multilingual-v2.0` (Cohere's public model IDs for these v2.0 models). The option set may also allow a custom value via expression.

**Credential fields (from Cohere credentials doc):**
- `apiKey` (required) — Cohere API key from the Cohere dashboard.

## Runtime behavior

### Input

None on `main`. The parent root node invokes the provider over the `ai_embedding` channel with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the sub-node calls the Cohere Embed API (`POST https://api.cohere.com/v2/embed`) with Bearer token auth and returns an array of embedding vectors (`number[][]`) aligned positionally with the input texts.

**External API contract (Cohere Embed v2):**
- Endpoint: `POST https://api.cohere.com/v2/embed`, `Authorization: Bearer <apiKey>`.
- Request body: `model` (required), `input_type` (required for v3+ models; one of `search_document`, `search_query`, `classification`, `clustering`, `image`), `texts` (array of strings, max **96** per call), optional `embedding_types` (default `["float"]`), `truncate` (default `END`).
- Response: `{ id, embeddings: { float: number[][] }, texts, meta }`. The provider must extract `embeddings.float` (or the requested type) and return vectors in the same order as the input texts.

### Errors

- **Missing credentials** → throw (provider cannot initialize).
- **Invalid API key** → throw on first invocation (401 from Cohere).
- **Rate limit / quota** → throw (429 / 403 from Cohere); the parent root node may handle it if its own `continueOnFail` is set.
- **Invalid request** → throw (400/422 from Cohere, e.g. malformed body, invalid model).
- **Empty input array** → no API call; return empty array.

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first input item** of the parent run. So a dynamic `model` (e.g. `{{ $json.model }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{ "model": "embed-english-v2.0" }
```

**Expect** the provider calls Cohere `POST https://api.cohere.com/v2/embed` with:

```json
{
  "model": "embed-english-v2.0",
  "input_type": "search_document",
  "texts": ["Hello world", "OpenFlow is a workflow engine"],
  "embedding_types": ["float"]
}
```

and `Authorization: Bearer <apiKey>`. Output on `ai_embedding` is `number[][]` with exactly 2 vectors, each of length 4096 (for `embed-english-v2.0`), in input order.

### Test: model selection

**Given** parent invokes embeddings.

**Parameters:** `{ "model": "embed-english-light-v2.0" }`

**Expect** request body `model` = `embed-english-light-v2.0`; returned vectors have length 1024. With `embed-multilingual-v2.0`, vector length 768.

### Test: expression resolves to first item only

**Given** parent run has input items with differing `model` values:

```json
[{ "json": { "model": "embed-english-v2.0" } }, { "json": { "model": "embed-english-light-v2.0" } }]
```

**Parameters:**

```json
{ "model": "={{ $json.model }}" }
```

**Expect** the provider is configured once using the **first** item only (`embed-english-v2.0`); both embedded texts use that model. The second item's `model` value is never consulted.

### Test: batch splitting at the API limit

**Given** parent invokes the provider with 200 texts.

**Expect** requests are split so no single call contains more than 96 texts (Cohere API limit), and the returned vectors are concatenated in input order (3 calls: 96, 96, 8).

### Test: missing credential

**Given** the node has no `cohereApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error (sub-node itself has no `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, categories, typeVersion | documented (public workflow JSON metadata) | Confirmed `@n8n/n8n-nodes-langchain.embeddingsCohere`, v1, "Embeddings Cohere", AI + Langchain |
| Model option set + dimensions | documented | n8n docs list the three v2.0 models with 4096/1024/768 dimensions |
| Underlying model ID strings | inferred | Cohere public model IDs for v2.0 models; templates reference "Embed v4" in prose but the node's documented options are the v2.0 set |
| Credential type string `cohereApi` | inferred | Docs name the credential "Cohere" (API key); `cohereApi` follows the sibling langchain credential naming pattern (e.g. `openAiApi`) |
| Parameters beyond `model` | inferred (none) | Only `model` is documented for this node; no baseURL/batchSize/inputType/options documented, unlike Embeddings OpenAI |
| `input_type` value sent | inferred | Required by Cohere for v3+ models; `search_document` is the natural choice for vector-store embedding use — implementer must pick a valid enum value |
| Batch limit (96) and batching behavior | inferred | Limit is documented on the Cohere API; whether the node splits batches is not documented for this node |
| Model deprecation | documented (third-party) | Cohere marks the v2.0 models as legacy; current catalog offers embed-v3.x / embed-v4.0. n8n docs still present the v2.0 options — spec follows n8n's documented list |
| Retry / backoff policy | gap | Not documented; implementer decision (exponential backoff typical) |
| Sub-node "first item" expression rule | documented | Covered in the n8n sub-nodes doc pages |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-cohere.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsCohere` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert, Default Data Loader); calls the Cohere Embed API (`/v2/embed`) with credential-backed Bearer auth — do **not** load `@n8n/n8n-nodes-langchain` or Cohere SDK packages
