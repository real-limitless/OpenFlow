---
type: "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini"
displayName: Embeddings Google Gemini
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings Google Gemini

Cluster **sub-node**: configures a Google Gemini (Generative Language API) text-embedding model and supplies it to a root node (AI Agent, Question and Answer Chain, Vector Store insert mode, Default Data Loader, etc.) on the `ai_embedding` channel. It does **not** process items on `main` directly — the parent root node invokes the embeddings provider with texts to embed and receives numeric vectors back. The node is explicitly designed to attach to a vector store (`ai_vectorStore`); its UI shows a "must be connected to a vector store" hint.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsgooglegemini.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/googleai.md | Public docs only |
| https://ai.google.dev/api/embeddings | Public docs only |
| https://ai.google.dev/gemini-api/docs/embeddings | Public docs only |
| https://ai.google.dev/models/gemini (model catalog) | Public docs only |
| https://developers.generativeai.google/api/rest/generativelanguage/models/list | Public docs only |
| https://js.langchain.com/docs/integrations/text_embedding/google_generativeai | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsGoogleGemini`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input (vector store `insert`/`load` modes, chains, agents)
- **Credentials:** `googlePalmApi` (Google AI API key + host), required
- **typeVersion:** `1`
- **Categories:** AI, Langchain
- **group:** `transform`

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies model identity and the Google API authentication for computing embeddings.

### External service

All embedding calls hit the Google **Generative Language API** (`https://generativelanguage.googleapis.com/v1beta`). Authentication is a Google AI API key issued from Google AI Studio (see credentials section). The host is **not** configurable — custom hosts/proxies are unsupported for this node.

## Parameters

The public n8n docs page documents a single parameter. UI label from **public docs**; the wire key is inferred from package metadata / sibling embedding nodes.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `modelName` | string / options | `models/gemini-embedding-001` (inferred) | yes | — | **Model** — the Gemini embedding model to use. The option list is loaded at design time from `GET /v1beta/models`, filtered to models whose resource name contains `embedding` (**public docs** points to the model catalog; filter inferred). Values follow the `models/{model}` resource-name format. |

Dimensionality note (inferred from the node's UI hint, echoed by the embeddings docs): different models produce different vector dimensionalities. The default embedding model yields **768-dimensional** embeddings. The vector store connected to the root node must be configured with the same dimensionality as the chosen model.

## Credentials (`googlePalmApi`)

From public credentials docs (`/integrations/builtin/credentials/googleai.md`):

| field | type | required | notes |
|-------|------|----------|-------|
| host | string | yes | API **Host** URL. Default `https://generativelanguage.googleapis.com`. Custom hosts/proxies are **not** supported — the node must use the default host. |
| apiKey | string (secret) | yes | **API Key** — created in Google AI Studio (`aistudio.google.com/apikey`). Sent with requests as `x-goog-api-key` (or `key` query param) per Google's API convention. |

These same credentials also authenticate the `googleGemini` and `lmChatGoogleGemini` nodes (documented).

## Runtime behavior

### Role

1. Resolve credentials (`googlePalmApi`); missing host/key → fail when the parent invokes the provider (inferred + credentials docs).
2. Resolve `modelName`; expressions allowed, but as a sub-node expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build an embeddings provider handle exposed on output channel **`ai_embedding`**. The parent calls it with an array of strings (texts) to embed; it returns an array of numeric vectors aligned positionally with the input texts.
4. The provider must match the embedding dimensionality of the connected vector store so insert/query vectors are comparable (node UI hint + embeddings concept).

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the Gemini API and returns `number[][]` (one vector per input text, in input order).

**External API contract (Google Generative Language API, v1beta):** the URL path carries the **bare model id** after `/v1beta/models/` (no `models/` prefix in the path), while the request body `model` field keeps the **full resource name** `models/{id}`. Per the service reference (`models.embedContent` / `models.batchEmbedContents`):
- **Single:** `POST https://generativelanguage.googleapis.com/v1beta/models/{id}:embedContent` with body `{ model, content: { parts: [{ text }] } }` where `model` = `models/{id}` (e.g. `models/gemini-embedding-001`). Response: `{ embedding: { values: number[] }, usageMetadata }`.
- **Batch:** `POST https://generativelanguage.googleapis.com/v1beta/models/{id}:batchEmbedContents` with body `{ requests: [{ model, content: { parts: [{ text }] } }, ...] }` (up to a documented per-call limit, inferred ~100 requests), each `requests[].model` in full `models/{id}` form. Response: `{ embeddings: [{ values: number[] }] }` — one embedding per request, in request order.
- Auth: API key carried as `x-goog-api-key` header (or `key` query parameter).
- Only the `text` part content of the input is counted/embedded (service docs).

### Errors

- **Missing credentials** → throw (provider cannot initialize).
- **Invalid / unauthorized API key** → throw on first invocation (HTTP 4xx from Google).
- **Rate limit / quota** → throw (429 / 403); retryable (inferred, standard behavior).
- **Invalid request / bad model / blocked content** → throw (HTTP 4xx/5xx).
- **Empty input array** → no API call; return empty array.
- **Network / timeout** → throw after timeout (inferred).

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `modelName` (e.g. `{{ $json.model }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call (batch)

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{ "modelName": "models/gemini-embedding-001" }
```

**Credentials:** `googlePalmApi` with `host` `https://generativelanguage.googleapis.com` and an `apiKey`.

**Expect** the provider calls `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents` — the URL path uses the bare model id after `/v1beta/models/` (single `models/` segment, no duplication) — with:

```json
{
  "requests": [
    { "model": "models/gemini-embedding-001", "content": { "parts": [{ "text": "Hello world" }] } },
    { "model": "models/gemini-embedding-001", "content": { "parts": [{ "text": "OpenFlow is a workflow engine" }] } }
  ]
}
```

and the API key attached (`x-goog-api-key`). Each `requests[].model` keeps the full `models/gemini-embedding-001` resource name in the body. Output on `ai_embedding` is `number[][]` with exactly 2 vectors, each of length 768 (default model), in input order.

### Test: single embedContent

**Given** parent invokes the provider with one text `["Single text"]`.

**Parameters:** `{ "modelName": "models/gemini-embedding-001" }`

**Expect** a single call to `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent` (bare model id in path) with body `{ "model": "models/gemini-embedding-001", "content": { "parts": [{ "text": "Single text" }] } }`; the response vector `embedding.values` is returned as a single-element `number[][]`. (A one-element `batchEmbedContents` call is an acceptable alternative as long as path and body follow the same model-id convention.)

### Test: model selection / dimensionality

**Given** parent invokes embeddings with a non-default model.

**Parameters:** `{ "modelName": "models/text-embedding-004" }`

**Expect** the URL path is `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent` (bare id `text-embedding-004` after `/v1beta/models/`, single `models/` segment) while the request body `model` field is `models/text-embedding-004` (full resource name). Returned vectors match that model's dimensionality (per the Gemini model catalog) — i.e. vector length is determined by the model, and the provider does not impose its own fixed dimension.

### Test: expression resolves to first item only

**Given** parent run has input items with differing `modelName` values:

```json
[{ "json": { "model": "models/gemini-embedding-001" } }, { "json": { "model": "models/text-embedding-004" } }]
```

**Parameters:**

```json
{ "modelName": "={{ $json.model }}" }
```

**Expect** the provider is configured once using the **first** item only (`models/gemini-embedding-001`); all embedded texts use that model. The second item's value is never consulted.

### Test: missing credential

**Given** the node has no `googlePalmApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error (sub-node itself has no `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, category, sub-node role, single `Model` parameter | documented | Primary n8n docs page |
| Credential `googlePalmApi`: host URL, API key, fixed host (no custom hosts) | documented | n8n credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model option list loaded from `GET /v1beta/models`, filtered to embedding models | documented + inferred | Docs link the model selector to the Gemini models list; "filter to embedding models" inferred from public model-list filter behavior |
| Default model `models/gemini-embedding-001` and 768-dim default | inferred | Node UI hint mentions 768-dimensional default; default model string from package metadata |
| `modelName` wire key (vs UI label "Model") | inferred | Package metadata; sibling embedding nodes use similar camelCase keys |
| EmbedContent / BatchEmbedContents endpoints, request/response shape, `embedding.values` | documented | Google Generative Language API reference (service docs); the curl examples show the bare model id in the URL path (`.../v1beta/models/gemini-embedding-001:embedContent`) while the JSON body `model` field uses the full `models/{id}` resource name |
| API-key transport (`x-goog-api-key` header / `key` query param) | inferred | Google API convention; not stated on the n8n page |
| Per-call batch request limit (~100) | inferred | Google API limit; exact splitting strategy is an implementer decision |
| Retry / backoff policy | gap | Not documented; exponential backoff typical |
| Input/output channel name `ai_embedding` | inferred | Package metadata (`AiEmbedding` output); consistent with sibling embedding sub-nodes |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-google-gemini.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsGoogleGemini` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert/load, Default Data Loader); calls the Google Generative Language API (`POST https://generativelanguage.googleapis.com/v1beta/models/{id}:embedContent` / `:batchEmbedContents`, where `{id}` is the bare model id in the path and the body `model` field keeps the full `models/{id}` resource name) with the credential-backed API key — do **not** load `@n8n/n8n-nodes-langchain` or `@google/generative-ai` packages
