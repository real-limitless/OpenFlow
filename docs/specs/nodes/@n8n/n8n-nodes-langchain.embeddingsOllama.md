---
type: "@n8n/n8n-nodes-langchain.embeddingsOllama"
displayName: Embeddings Ollama
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings Ollama

Cluster **sub-node**: configures an Ollama-hosted text-embedding model and supplies it to a root node (AI Agent, Vector Store insert/load, Chains, etc.) on the `ai_embedding` channel. It does **not** process items on `main` directly — the parent root node invokes the embeddings provider with texts to embed and receives numeric vectors back.

Ollama runs locally by default; no cloud API key is needed unless connecting through an authenticated proxy. The node calls the Ollama REST API (`/api/embed`) to compute embeddings.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsollama.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ollama.md | Public docs only |
| https://github.com/ollama/ollama/blob/main/docs/api.md | Third-party service API docs |
| https://ollama.com/library | Third-party service docs |
| https://js.langchain.com/docs/integrations/text_embedding/ollama/ | Third-party integration docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsOllama`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input
- **Credentials:** `ollamaApi` (Base URL + optional API Key), required
- **typeVersion:** `1`
- **Categories:** AI, Langchain
- **group:** `transform`

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies model identity and connection details for computing embeddings.

### External service

All embedding calls hit the **Ollama REST API** at `{baseUrl}/api/embed`. Authentication is optional — if `apiKey` is set on the credential, it is sent as `Authorization: Bearer <apiKey>`. The default `baseUrl` is `http://localhost:11434`.

## Parameters

The public n8n docs page documents a single parameter — **Model** — with two preset options (`all-minilm`, `nomic-embed-text`) and the ability to type any Ollama model name.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `model` | string / options | `all-minilm` | yes | — | **Model** — the Ollama model used to compute embeddings. Two preset options listed in docs: `all-minilm` (384 dimensions) and `nomic-embed-text` (768 dimensions). Users may type any Ollama model name. The model list could be loaded dynamically from the Ollama API (`GET /api/tags`). |

Dimensionality note: different models produce different vector dimensionalities. The connected vector store must be configured with the same dimensionality as the chosen model. `all-minilm` yields 384-dimensional vectors; `nomic-embed-text` yields 768-dimensional vectors.

No other configuration parameters (temperature, topK, etc.) are exposed for the embeddings node — the Ollama `/api/embed` endpoint does not accept generation parameters.

## Credentials (`ollamaApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| `baseUrl` | string | yes | **Base URL** of the Ollama instance. Default: `http://localhost:11434`. May need `127.0.0.1` instead of `localhost` in containerized n8n. |
| `apiKey` | string (secret) | no | **API Key** — Bearer token for authenticated proxy connections (e.g., Open WebUI). Leave empty for local unauthenticated access. |

The node sends requests to `{baseUrl}/api/embed` (Ollama Embed API). If `apiKey` is set, it is sent as `Authorization: Bearer <apiKey>`.

## Runtime behavior

### Role

1. Resolve credentials (`ollamaApi`). Missing `baseUrl` → fail on first invocation.
2. Resolve `model` from the `model` parameter (string value from preset options or a user-typed model name). As a **sub-node**, expressions resolve against the **first** input item only.
3. Build an embeddings provider handle exposed on output channel `ai_embedding`. The parent root node invokes it with an array of strings (texts) to embed; it returns an array of numeric vectors aligned positionally with the input texts.
4. The provider must match the embedding dimensionality of the connected vector store so insert/query vectors are comparable.

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the Ollama API and returns `number[][]` (one vector per input text, in input order).

**External API contract (Ollama Embed API, `/api/embed`):**

- **Request:** `POST {baseUrl}/api/embed` with body:
  ```json
  {
    "model": "<model-name>",
    "input": ["text1", "text2", ...]
  }
  ```
  The request may also include an `options` object (standard Ollama generation options) if the node supports passing them through, though the public docs do not expose any options for this node. When `apiKey` is set, include header `Authorization: Bearer <apiKey>`.

- **Response:**
  ```json
  {
    "model": "<model-name>",
    "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]],
    "total_duration": 123456789,
    "load_duration": 123456,
    "prompt_eval_count": 10
  }
  ```
  The `embeddings` field is an array of vectors — one per input text, in input order. Each vector's length is determined by the model.

### Errors

- **Missing credentials** → throw on first invocation (provider cannot initialize).
- **Ollama server not running / unreachable** → throw (connection refused / timeout).
- **Invalid model name** → throw (HTTP 404 from Ollama — model not pulled).
- **Invalid API key (authenticated proxy)** → throw (HTTP 401).
- **Empty input array** → no API call; return empty array.
- **Network / timeout** → throw after timeout.

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

The `model` parameter accepts expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `model` (e.g. `{{ $json.modelName }}`) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call (batch)

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{ "model": "all-minilm" }
```

**Credentials:** `ollamaApi` with `baseUrl` `http://localhost:11434`, no `apiKey`.

**Expect** the provider calls `POST http://localhost:11434/api/embed` with:

```json
{
  "model": "all-minilm",
  "input": ["Hello world", "OpenFlow is a workflow engine"]
}
```

Output on `ai_embedding` is `number[][]` with exactly 2 vectors, each of length 384 (all-minilm dimensionality), in input order.

### Test: single text embedding

**Given** parent invokes the provider with one text `["Single text"]`.

**Parameters:** `{ "model": "all-minilm" }`

**Expect** a single call to `POST http://localhost:11434/api/embed` with `input: ["Single text"]`; response `embeddings` is a single-element array containing one vector of 384 floats.

### Test: model selection and dimensionality

**Given** parent invokes embeddings with `nomic-embed-text`.

**Parameters:** `{ "model": "nomic-embed-text" }`

**Expect** request body `model` is `"nomic-embed-text"`. Returned vectors each have length 768.

### Test: expression resolves to first item only

**Given** parent run has input items with differing `model` values:

```json
[{ "json": { "model": "all-minilm" } }, { "json": { "model": "nomic-embed-text" } }]
```

**Parameters:**

```json
{ "model": "={{ $json.model }}" }
```

**Expect** the provider is configured once using the **first** item only (`all-minilm`); all embedded texts use that model. The second item's value is never consulted.

### Test: missing credential

**Given** the node has no `ollamaApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, sub-node role, single `Model` parameter, two preset models | documented | Primary n8n docs page |
| Credential `ollamaApi`: base URL, optional API key, default `http://localhost:11434` | documented | n8n credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Dimensionality per model (all-minilm 384, nomic-embed-text 768) | documented | Linked from n8n docs to Ollama model pages |
| Model list loaded dynamically from `GET /api/tags` | inferred from sibling node | Not confirmed for embeddings sub-node explicitly, but consistent with lmOllama behavior |
| `model` wire key (vs UI label "Model") | inferred from sibling node | Consistent with lmOllama convention |
| Ollama `/api/embed` endpoint contract | documented | Ollama API docs (third-party) |
| No options/generation parameters exposed | documented + inferred | Public docs list only Model; no options section |
| Output channel name `ai_embedding` | inferred from sibling node | Consistent with embeddingsGoogleGemini pattern |
| Default model `all-minilm` | documented | Primary docs page lists it first |
| Error handling for model not found / server unreachable | inferred | Standard HTTP error propagation |
| Exact request/response shape of `/api/embed` | documented | Ollama API docs; response may include `total_duration`, `load_duration`, `prompt_eval_count` alongside `embeddings` |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-ollama.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsOllama` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert/load, Default Data Loader); calls the Ollama API (`POST {baseUrl}/api/embed`) with the resolved model and input texts. Credential `baseUrl` defaults to `http://localhost:11434`. Do **not** load `@n8n/n8n-nodes-langchain` or `langchain` packages.
