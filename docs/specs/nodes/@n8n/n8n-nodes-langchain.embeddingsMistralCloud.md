---
type: "@n8n/n8n-nodes-langchain.embeddingsMistralCloud"
displayName: Embeddings Mistral Cloud
category: AI
versions: [1]
priority: medium
status: specced
---

# Embeddings Mistral Cloud

Cluster **sub-node**: configures a Mistral Cloud text-embedding model via the Mistral Embeddings API and supplies it to a root node (AI Agent, Question and Answer Chain, Vector Store insert mode, Default Data Loader, etc.) on the `ai_embedding` channel. The parent root node invokes the provider with texts to embed and receives numeric vectors back. The node is designed to attach to a vector store (`ai_vectorStore`).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsmistralcloud.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mistral.md | Public docs only |
| https://docs.mistral.ai/capabilities/embeddings/ | Public docs only |
| https://docs.mistral.ai/api/#tag/embeddings | Public docs only |
| https://js.langchain.com/docs/integrations/text_embedding/mistralai | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsMistralCloud`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input
- **Credentials:** `mistralCloudApi` (Mistral Cloud API key), required
- **typeVersion:** `1`
- **Categories:** AI, Langchain
- **group:** `transform`

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies model identity and Mistral API authentication.

### External service

All embedding calls hit the **Mistral Embeddings API** at `POST https://api.mistral.ai/v1/embeddings` (OpenAI-compatible endpoint). Authentication is an API key sent as `Authorization: Bearer <key>`. The API key requires a paid / billing-enabled Mistral account (documented per-requisite).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `model` | string / options | (first available model) | yes | — | **Model** — the Mistral embedding model to use. Options are loaded dynamically from the Mistral API model list (GET /v1/models, filtered to embedding-capable models). Published embedding models include `mistral-embed` and `mistral-embed-2`. |
| `options.batchSize` | number | (none) | no | — | **Batch Size** — maximum number of documents to send in each API request. Controls internal splitting of large inputs. |
| `options.stripNewLines` | boolean | `true` | no | — | **Strip New Lines** — whether to remove newline characters from input text before embedding. Enabled by default. |

## Credentials (`mistralCloudApi`)

From public credentials docs (`/integrations/builtin/credentials/mistral.md`):

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created in the Mistral console (console.mistral.ai) under API Keys. Requires a billing-enabled account. Sent as `Authorization: Bearer <key>`. |

The same credential type also authenticates the `mistralAi` (app node), `lmChatMistralCloud`, and other Mistral sub-nodes.

## Runtime behavior

### Role

1. Resolve credentials (`mistralCloudApi`); missing key → fail when the parent invokes the provider.
2. Resolve `model`; expressions allowed, but as a sub-node, expressions resolve against the **first** input item only (documented sub-node parameter resolution).
3. Resolve optional `batchSize` and `stripNewLines`.
4. Build an embeddings provider handle exposed on output channel **`ai_embedding`**. The parent calls it with an array of strings (texts) to embed; it calls `POST https://api.mistral.ai/v1/embeddings` and returns an array of numeric vectors aligned positionally with the input texts.
5. The provider must match the embedding dimensionality of the connected vector store so insert/query vectors are comparable.

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the Mistral API and returns `number[][]` (one vector per input text, in input order).

**External API contract (Mistral Embeddings API, `POST /v1/embeddings`):**

Request body (OpenAI-compatible format):
```json
{
  "model": "mistral-embed",
  "input": ["text1", "text2", ...]
}
```

- `model` (string, required): the embedding model ID.
- `input` (string or string[]): text(s) to embed. Accepts a single string or an array of strings. Per the API, the input is tokenized internally; the max input length is model-specific.
- `encoding_format` (optional): `"float"` (default) or `"base64"`.

Response body:
```json
{
  "id": "emb-...",
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.001, ...] },
    { "object": "embedding", "index": 1, "embedding": [0.002, ...] }
  ],
  "model": "mistral-embed",
  "usage": { "prompt_tokens": 10, "total_tokens": 10 }
}
```

- Each `data[i].embedding` is a `number[]` vector of fixed dimensionality for the given model.
- `mistral-embed` produces 1024-dimensional embeddings (documented).
- `mistral-embed-2` produces 1024-dimensional embeddings (documented).

Auth: `Authorization: Bearer <apiKey>` header.

When `batchSize` is set, the node splits the input array into chunks of at most `batchSize` texts and issues one API request per chunk, then concatenates the resulting vectors in input order.

When `stripNewLines` is `true`, each input text has newline characters removed before being sent to the API.

### Errors

- **Missing credentials** → throw (provider cannot initialize).
- **Invalid / unauthorized API key** → throw on first invocation (HTTP 401 from Mistral).
- **Insufficient quota / billing required** → throw (HTTP 402 / 403).
- **Rate limited** → throw (HTTP 429); retryable (standard behavior).
- **Input too long** → throw (HTTP 422 / 400); model-specific token limits apply.
- **Empty input array** → no API call; return empty array.
- **Network / timeout** → throw after timeout.

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `model` (e.g. `{{ $json.model }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call (batch)

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{
  "model": "mistral-embed",
  "options": { "stripNewLines": true }
}
```

**Credentials:** `mistralCloudApi` with a valid `apiKey`.

**Expect** the provider calls `POST https://api.mistral.ai/v1/embeddings` with:

```json
{
  "model": "mistral-embed",
  "input": ["Hello world", "OpenFlow is a workflow engine"]
}
```

and `Authorization: Bearer <apiKey>`. Output on `ai_embedding` is `number[][]` with exactly 2 vectors, each of length 1024 (for `mistral-embed`), in input order.

### Test: single text embed

**Given** parent invokes the provider with one text `["Single text"]`.

**Parameters:** `{ "model": "mistral-embed" }`

**Expect** a single call to `POST https://api.mistral.ai/v1/embeddings` with `{ "model": "mistral-embed", "input": ["Single text"] }`; the response `data[0].embedding` is returned as a single-element `number[][]`.

### Test: batch size splitting

**Given** parent invokes with 5 input texts and `batchSize: 2`.

**Parameters:**

```json
{
  "model": "mistral-embed",
  "options": { "batchSize": 2 }
}
```

**Expect** 3 sequential API calls:
- Call 1: `input` = [text1, text2]
- Call 2: `input` = [text3, text4]
- Call 3: `input` = [text5]

Output vectors are concatenated in input order (5 vectors total).

### Test: strip new lines

**Given** input text contains newlines: `["Hello\nworld"]`.

**Parameters:**

```json
{
  "model": "mistral-embed",
  "options": { "stripNewLines": true }
}
```

**Expect** the API call sends `"input": ["Helloworld"]` (newlines removed).

### Test: expression resolves to first item only

**Given** parent run has input items with differing model names:

```json
[{ "json": { "model": "mistral-embed" } }, { "json": { "model": "mistral-embed-2" } }]
```

**Parameters:**

```json
{ "model": "={{ $json.model }}" }
```

**Expect** the provider is configured once using the **first** item only (`mistral-embed`); all embedded texts use that model.

### Test: missing credential

**Given** the node has no `mistralCloudApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, sub-node role | documented | Primary n8n docs page |
| Credential `mistralCloudApi`: API key, billing requirement | documented | n8n credentials page |
| Parameters: Model, Batch Size, Strip New Lines | documented | n8n docs page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model option list loaded from Mistral API (`GET /v1/models`), filtered to embedding models | inferred | Consistent with other Mistral sub-nodes; model list is dynamically loaded |
| Default model (first available) | inferred | No explicit default documented; first model from the list is used |
| Mistral Embeddings API endpoint `POST /v1/embeddings`, request/response shape, `data[i].embedding` | documented | Mistral API documentation |
| `mistral-embed` dimensionality (1024) | documented | Mistral docs and pricing page |
| `mistral-embed-2` dimensionality (1024) | documented | Mistral docs |
| Auth transport `Authorization: Bearer` | documented | Mistral API documentation |
| Batch splitting strategy | inferred | `batchSize` parameter implies batching; exact implementation is an executor decision |
| Retry / backoff policy | gap | Not documented; exponential backoff typical |
| Input/output channel name `ai_embedding` | inferred | Package metadata; consistent with sibling embedding sub-nodes |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-mistral-cloud.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsMistralCloud` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert/load, Default Data Loader); calls the Mistral API (`POST https://api.mistral.ai/v1/embeddings`) with the credential-backed API key — do **not** load `@n8n/n8n-nodes-langchain` or `@mistralai/mistralai` packages
