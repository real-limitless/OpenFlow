---
type: "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi"
displayName: Embeddings Azure OpenAI
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings Azure OpenAI

Cluster **sub-node**: configures an Azure OpenAI-hosted text-embedding model deployment and supplies it to a root node (AI Agent, Vector Store insert/load, Chains, Default Data Loader, etc.) on the `ai_embedding` channel. It does **not** process items on `main` directly — the parent root node invokes the embeddings provider with texts to embed and receives numeric vectors back.

The node must reference an **Azure OpenAI deployment** (a deployed embedding model in an Azure OpenAI Service resource). The deployment name is specified as the model parameter; authentication uses either an API key or Azure Entra ID (OAuth2).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsazureopenai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/azureopenai.md | Public docs only |
| https://learn.microsoft.com/en-us/azure/ai-services/openai/reference | Third-party service API docs (Azure OpenAI REST API) |
| https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/embeddings?view=rest-microsoft-foundry-v1 | Third-party service API docs (Azure OpenAI Embeddings v1) |
| https://js.langchain.com/docs/integrations/text_embedding/azure_openai/ | Public docs only (LangChain integration docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input
- **Credentials:** `azureOpenAiApi` (Azure OpenAI API key), required. Also supports `azureEntraCognitiveServicesOAuth2Api` (Azure Entra ID OAuth2) for the Credential selector.
- **typeVersion:** `1`
- **Categories:** AI, Langchain
- **group:** `transform`

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies the Azure deployment identity and authentication for computing embeddings.

### External service

All embedding calls hit the **Azure OpenAI embeddings data plane endpoint** at the deployment-specific path:

```
POST https://{resourceName}.openai.azure.com/openai/deployments/{deploymentName}/embeddings?api-version={apiVersion}
```

Authentication is via `api-key` header (API key credential) or `Authorization: Bearer` (Entra ID OAuth2).

## Parameters

The public n8n docs page lists the following node options:

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `model` | string | — | yes | — | **Model (Deployment) Name** — the Azure OpenAI deployment name to use for generating embeddings. This is the deployment name you assign when deploying a model in Azure OpenAI Studio. Not a model ID; it is the deployment resource name. |
| `batchSize` | number | — | no | — | **Batch Size** — maximum number of texts to send per API request. Splits a large input array into sub-batches. |
| `stripNewLines` | boolean | `true` | no | — | **Strip New Lines** — whether to remove newline characters from input text before sending to the API. Enabled by default. |
| `timeout` | number | — | no | — | **Timeout** — maximum time in seconds for each API request. Set to `-1` for no timeout. |

The credential selector offers two authentication methods (see credentials section below).

## Credentials (`azureOpenAiApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| `resourceName` | string | yes | **Resource Name** — the name assigned to the Azure OpenAI Service resource (the subdomain before `.openai.azure.com`). |
| `apiKey` | string (secret) | yes | **API Key** — an API key for the resource (Key 1 or Key 2 from Azure portal). Sent as `api-key` header. |
| `apiVersion` | string | yes | **API Version** — the API version string to use (e.g. `2024-06-01`, `2024-10-21`). See Azure OpenAI API version lifecycle docs. |

The model name parameter should be set to the **Deployment name** (not the model name), as noted in the credentials page hint: "Once you deploy the resource, use the Deployment name as the model name."

Alternatively, the credential can use **Azure Entra ID (OAuth2)** (`azureEntraCognitiveServicesOAuth2Api`). For n8n Cloud users this is a "Connect my account" flow. Self-hosted users need to register an application with Microsoft Identity Platform and generate a client secret. Default scopes include `openid`, `offline_access`, and various `ReadWrite.All` permissions. Scopes are configurable via a Custom Scopes toggle.

## Runtime behavior

### Role

1. Resolve credentials (`azureOpenAiApi` or `azureEntraCognitiveServicesOAuth2Api`). Missing `resourceName` / `apiKey` → fail on first invocation.
2. Build the base URL: `https://{resourceName}.openai.azure.com/openai/deployments/{deploymentName}/embeddings?api-version={apiVersion}`. The deployment name comes from the `model` parameter; the API version comes from the credential.
3. Resolve `batchSize`, `stripNewLines`, `timeout` from parameters. As a **sub-node**, expressions resolve against the **first** input item only.
4. Build an embeddings provider handle exposed on output channel `ai_embedding`. The parent root node invokes it with an array of strings (texts) to embed; it returns an array of numeric vectors aligned positionally with the input texts.
5. When `stripNewLines` is true, replace `\n` and `\r` with a space in each input text before sending.
6. If `batchSize` is set, split the input array into chunks of at most `batchSize` texts and make one API call per chunk, then concatenate the results preserving input order.
7. The provider must match the embedding dimensionality of the connected vector store so insert/query vectors are comparable.

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the Azure OpenAI API and returns `number[][]` (one vector per input text, in input order).

**External API contract (Azure OpenAI Embeddings, deployment-scoped path):**

- **Request:** `POST https://{resourceName}.openai.azure.com/openai/deployments/{deploymentName}/embeddings?api-version={apiVersion}` with body:
  ```json
  {
    "input": ["text1", "text2", ...],
    "model": "{deploymentName}",
    "encoding_format": "float"
  }
  ```
  The `model` field in the body matches the deployment name. The `encoding_format` defaults to `float`. Authentication via `api-key` header.

- **Response:**
  ```json
  {
    "object": "list",
    "data": [
      {
        "object": "embedding",
        "index": 0,
        "embedding": [0.1, 0.2, ...]
      },
      {
        "object": "embedding",
        "index": 1,
        "embedding": [0.3, 0.4, ...]
      }
    ],
    "model": "{deploymentName}",
    "usage": {
      "prompt_tokens": 10,
      "total_tokens": 10
    }
  }
  ```
  The `data` array contains one entry per input text, in input order (matched by `index`). The `embedding` vector length depends on the deployed model (e.g., `text-embedding-ada-002` = 1536 dimensions; `text-embedding-3-small` = 1536 default; `text-embedding-3-large` = 3072 default).

  For newer `text-embedding-3` models, the request may include an optional `dimensions` parameter to reduce vector dimensionality.

### Errors

- **Missing credentials** → throw on first invocation (provider cannot initialize).
- **Invalid / unauthorized API key** → throw on first API call (HTTP 401).
- **Deployment not found** → throw (HTTP 404 — deployment name does not match any existing deployment).
- **Rate limit / quota exceeded** → throw (HTTP 429); retryable with backoff.
- **Content filter triggered** → throw (HTTP 400 with content filter details).
- **Empty input array** → no API call; return empty array.
- **Network / timeout** → throw after timeout (configured timeout or default).
- **Invalid API version** → throw (HTTP 400).

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `model` (deployment name) is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "Azure embeddings test"]
```

**Parameters:**

```json
{
  "model": "my-text-embedding-ada-002",
  "stripNewLines": true
}
```

**Credentials:** `azureOpenAiApi` with `resourceName` `myopenai`, `apiKey` `sk-...`, `apiVersion` `2024-06-01`.

**Expect** the provider calls `POST https://myopenai.openai.azure.com/openai/deployments/my-text-embedding-ada-002/embeddings?api-version=2024-06-01` with:

```json
{
  "input": ["Hello world", "Azure embeddings test"],
  "model": "my-text-embedding-ada-002",
  "encoding_format": "float"
}
```

and the `api-key` header set to `sk-...`. Output on `ai_embedding` is `number[][]` with exactly 2 vectors, each of length 1536 (ada-002 dimensionality), in input order.

### Test: stripNewLines transforms input

**Given** input text containing newlines:

```json
["Line one\nLine two"]
```

**Parameters:**

```json
{ "model": "my-deployment", "stripNewLines": true }
```

**Expect** the request body `input` field is `["Line one Line two"]` (newline replaced with space).

### Test: batch splitting

**Given** 5 input texts with `batchSize` set to 2:

```json
["a", "b", "c", "d", "e"]
```

**Parameters:**

```json
{ "model": "my-deployment", "batchSize": 2 }
```

**Expect** the provider makes 3 sequential API calls with inputs `["a", "b"]`, `["c", "d"]`, and `["e"]`, then concatenates the results into a single `number[][]` of 5 vectors in input order.

### Test: expression resolves to first item only

**Given** parent run has input items with differing deployment name values:

```json
[{ "json": { "deployment": "deploy-a" } }, { "json": { "deployment": "deploy-b" } }]
```

**Parameters:**

```json
{ "model": "={{ $json.deployment }}" }
```

**Expect** the provider is configured once using the **first** item only (`deploy-a`); all embedded texts use that deployment. The second item's value is never consulted.

### Test: missing credential

**Given** the node has no `azureOpenAiApi` credential attached.

**Expect** provider initialization throws; the parent root node surfaces the error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, sub-node role | documented | Primary n8n docs page |
| Parameters: Model (Deployment) Name, Batch Size, Strip New Lines, Timeout | documented | Primary n8n docs page lists all four node options |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint (same across all sub-nodes) |
| Credential `azureOpenAiApi`: resource name, API key, API version | documented | n8n credentials page |
| Azure Entra ID (OAuth2) auth method and scopes | documented | n8n credentials page |
| Deployment-scoped URL path `.../deployments/{deployment}/embeddings` | documented | Azure OpenAI REST API reference (third-party) |
| Request/response shape for embeddings endpoint | documented | Azure OpenAI REST API reference (`OpenAI.CreateEmbeddingRequest` / `OpenAI.CreateEmbeddingResponse`) |
| `api-key` header authentication | documented | Azure OpenAI REST API reference |
| `dimensions` parameter for text-embedding-3 models | documented | Azure OpenAI REST API reference (documented but whether n8n exposes it is gap) |
| `encoding_format` field | documented + inferred | The n8n docs do not expose this as a parameter; the provider should default to `"float"` |
| Default `stripNewLines` value (`true`) | documented | n8n docs: "n8n enables this by default" |
| Default timeout | gap | Not documented; inferred as no timeout unless specified |
| Output channel name `ai_embedding` | inferred | Consistent with sibling embedding sub-nodes (package metadata pattern) |
| Batch size default (unlimited / all-at-once) | gap | Not documented; inferred behavior when `batchSize` is not set |
| `model` in request body duplicating the deployment name | inferred | Standard Azure OpenAI convention (same as Chat Completions) |
| Error handling specifics | inferred | Standard HTTP error propagation for Azure OpenAI service |
| `continueOnFail` behavior for sub-nodes | inferred | Sub-nodes inherit error handling from parent root node |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-azure-openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert/load, Default Data Loader); calls the Azure OpenAI deployment-scoped embeddings endpoint (`POST https://{resourceName}.openai.azure.com/openai/deployments/{deploymentName}/embeddings?api-version={apiVersion}`) with `model: {deploymentName}` in the body and `api-key` header set from credentials. The credential `resourceName` forms the endpoint hostname, `apiVersion` is the query parameter, `model` (deployment name) is the URL path segment and the request body `model` field. Do **not** load `@n8n/n8n-nodes-langchain` or `langchain` packages.
