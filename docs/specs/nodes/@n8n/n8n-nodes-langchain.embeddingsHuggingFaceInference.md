---
type: "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference"
displayName: Embeddings HuggingFace Inference
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings HuggingFace Inference

Cluster **sub-node**: supplies a HuggingFace-hosted text-embedding model to a parent root node (AI Agent, Question and Answer Chain, Vector Store insert/load, Default Data Loader, etc.) on the `ai_embedding` channel. The parent invokes the provider with texts to embed and receives numeric vectors back. The UI shows a hint that this node must be connected to a vector store.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingshuggingfaceinference/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/huggingface.md | Public docs only |
| https://huggingface.co/docs/api-inference/quicktour | Public docs only |
| https://huggingface.co/docs/api-inference/en/tasks/feature-extraction | Public docs only |
| https://huggingface.co/models?other=embeddings | Public docs only |
| https://huggingface.co/inference-endpoints | Public docs only |
| https://js.langchain.com/docs/integrations/text_embedding/hugging_face_inference | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input (vector store operations, chains, agents)
- **Credentials:** `huggingFaceApi` (HuggingFace API key), required
- **typeVersion:** `1`
- **Categories:** AI, Embeddings
- **group:** `transform`

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies model identity and authentication for computing embeddings via the HuggingFace Inference API or Inference Providers.

### External service

All embedding calls target the **HuggingFace Inference API** (serverless or dedicated). The API base URL is `https://router.huggingface.co/v1` for Inference Providers (the modern routing layer), or the model-specific `https://api-inference.huggingface.co/models/{modelId}` for the classic serverless inference API. When a custom inference endpoint URL is configured, requests are sent there instead.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `modelName` | string | `sentence-transformers/distilbert-base-nli-mean-tokens` | yes | — | **Model Name** — the HuggingFace model ID to use for embeddings. Browse available models at huggingface.co/models?other=embeddings. Produces 768-dimensional vectors by default (matching the default model). |
| `options.endpointUrl` | string | `""` | conditional | — | **Custom Inference Endpoint** — URL of a deployed model hosted on HuggingFace Inference Endpoints. When set, `modelName` is ignored and requests go to this URL instead. |
| `options.provider` | options | `auto` | no | — | **Provider** — which Inference Provider to route through. Values include `hf-inference`, `together`, `replicate`, `fireworks-ai`, `groq`, `cerebras`, `cohere`, `sambanova`, `fal-ai`, `novita`, `nebius`, `hyperbolic`, `nscale`, `ovhcloud`, `openai`, `black-forest-labs`, `featherless-ai`, `scaleway` (legacy), and `auto` (fastest available). Only relevant when using Inference Providers routing (not classic inference API). |

Dimensionality note (repeated in node UI): different embedding models produce different vector dimensionalities. The default model yields **768-dimensional** embeddings. The vector store connected to the root node must be configured with the same dimensionality as the chosen model.

## Credentials (`huggingFaceApi`)

From public credentials docs (`/integrations/builtin/credentials/huggingface.md`):

| field | type | required | notes |
|-------|------|----------|-------|
| `apiKey` | string (secret) | yes | **API Key** — a HuggingFace API token (starts with `hf_`). Created at huggingface.co/settings/tokens. Must have "Inference Providers" permission for the modern routing layer, or "Make calls to inference" for the classic API. |

These same credentials also authenticate the `lmOpenHuggingFaceInference` node.

## Runtime behavior

### Role

1. Resolve credentials (`huggingFaceApi`); missing key → fail when the parent invokes the provider.
2. Resolve `modelName`; expressions allowed, but as a sub-node expressions resolve against the **first** input item only (**documented** sub-node parameter resolution rule).
3. Build an embeddings provider handle exposed on output channel `ai_embedding`. The parent calls it with an array of strings (texts) to embed; it returns an array of numeric vectors aligned positionally with the input texts.
4. The provider must match the embedding dimensionality of the connected vector store.

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the HuggingFace Inference API and returns `number[][]` (one vector per input text, in input order).

**External API contract (HuggingFace):** two routing paths exist:

1. **Classic serverless inference API:** `POST https://api-inference.huggingface.co/models/{modelId}` with body being the text(s) to embed. Auth: `Authorization: Bearer {apiKey}`. The request body is either a single string `"text"` or an array of strings `["text1", "text2"]`. Response is `number[][]` — an array of vectors. This endpoint times out after ~60 seconds for free-tier.

2. **Inference Providers routing (modern):** `POST https://router.huggingface.co/v1/feature-extraction` with body `{ model: string, inputs: string | string[], provider?: string }`. Auth: `Authorization: Bearer {apiKey}`. Response is `number[][]`. The `provider` parameter selects the backend provider; `auto` picks the fastest.

3. **Custom Inference Endpoint:** `POST {endpointUrl}` with body being the text(s). Auth and response shape match the deployed endpoint's contract (typically the same format as classic API).

### Errors

- **Missing credentials** → throw (provider cannot initialize).
- **Invalid / unauthorized API key** → throw on first invocation (HTTP 401/403 from HuggingFace).
- **Rate limit / quota** → throw (HTTP 429 / 503); retryable.
- **Invalid model name** → throw (HTTP 404 or model-load error).
- **Model not suited for feature-extraction** → throw (model-load error).
- **Empty input array** → no API call; return empty array.
- **Network / timeout** → throw after timeout.

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ ... }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `modelName` (e.g. `{{ $json.modelId }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call (classic API)

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{ "modelName": "sentence-transformers/distilbert-base-nli-mean-tokens" }
```

**Credentials:** `huggingFaceApi` with a valid API key.

**Expect** the provider calls `POST https://api-inference.huggingface.co/models/sentence-transformers/distilbert-base-nli-mean-tokens` with body `["Hello world", "OpenFlow is a workflow engine"]` and header `Authorization: Bearer {apiKey}`. Response is `number[][]` with 2 vectors of length 768 (default model), in input order.

### Test: inference providers routing

**Given** parent invokes the provider with one text `["Single query"]`.

**Parameters:**

```json
{ "modelName": "intfloat/multilingual-e5-large-instruct", "options": { "provider": "together" } }
```

**Expect** the provider calls `POST https://router.huggingface.co/v1/feature-extraction` with body `{ "model": "intfloat/multilingual-e5-large-instruct", "inputs": "Single query", "provider": "together" }` and header `Authorization: Bearer {apiKey}`. Response is `number[][]` with one vector matching the model's dimensionality.

### Test: custom inference endpoint

**Given** parent invokes the provider with texts.

**Parameters:**

```json
{ "modelName": "ignored-when-endpoint-is-set", "options": { "endpointUrl": "https://xyz.us-east-1.aws.endpoints.huggingface.cloud/text-embedding" } }
```

**Expect** the provider sends `POST {endpointUrl}` and does **not** call the classic or router API. The `modelName` is ignored.

### Test: model dimensionality variance

**Given** parent invokes the provider with a non-default model known to produce different dimensions.

**Parameters:**

```json
{ "modelName": "thenlper/gte-large" }
```

**Expect** returned vectors have length 1024 (gte-large dimensionality), confirming the node does not impose a fixed dimension and delegates dimensionality to the model.

### Test: expression resolves to first item only

**Given** parent run has input items with differing `modelName` values:

```json
[{ "json": { "modelId": "sentence-transformers/distilbert-base-nli-mean-tokens" } }, { "json": { "modelId": "thenlper/gte-large" } }]
```

**Parameters:**

```json
{ "modelName": "={{ $json.modelId }}" }
```

**Expect** the provider is configured once using the **first** item only (`sentence-transformers/distilbert-base-nli-mean-tokens`); all embedded texts use that model. The second item's value is never consulted.

### Test: missing credential

**Given** the node has no `huggingFaceApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error (sub-node itself has no `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, category, sub-node role | documented | Public n8n docs page (single parameter documented) |
| `modelName` parameter — name, type, default value, description | documented + corpus | Public docs confirm the parameter; default `sentence-transformers/distilbert-base-nli-mean-tokens` from corpus metadata |
| Custom Inference Endpoint option | documented | Public n8n docs page explicitly mentions this option |
| Provider selector option | corpus | Full list of provider values from corpus metadata; `auto` default confirmed |
| Credential `huggingFaceApi`: API key, token creation | documented | Public n8n credentials page |
| 768-dimensional default embedding | inferred | Node UI hint; default model produces 768d |
| Sub-node first-item expression rule | documented | Public docs parameter-resolution hint (shared across all sub-nodes) |
| Classic inference API endpoint shape | documented | HuggingFace feature-extraction task spec (body is string/string[], response number[][]) |
| Inference Providers routing endpoint | documented | HuggingFace Inference Providers docs (router.huggingface.co/v1/feature-extraction) |
| Custom endpoint override behavior | documented | Public n8n docs: "If you set this, n8n ignores the Model Name" |
| `modelName` wire key (vs UI label "Model Name") | corpus | Confirmed from package metadata |
| `endpointUrl` and `provider` wire keys | corpus | From package metadata options collection |
| Per-call timeout / retry behavior | gap | Not documented; standard HTTP retry presumed |
| Provider option list currency | gap | Provider list may change as HuggingFace adds partners; implementation should keep current list but `auto` as fallback is always valid |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-huggingface-inference.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel; calls HuggingFace Inference API (`POST https://api-inference.huggingface.co/models/{modelId}` for classic, or `POST https://router.huggingface.co/v1/feature-extraction` for Inference Providers) with the credential-backed API key; supports Custom Inference Endpoint override; do **not** load `@n8n/n8n-nodes-langchain` or `@huggingface/inference` packages
