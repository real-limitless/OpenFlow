---
type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi"
displayName: Embeddings OpenAI
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings OpenAI

Cluster **sub-node**: configures an OpenAI embeddings model and supplies it to a root node (AI Agent, Question and Answer Chain, Summarization Chain, Default Data Loader, etc.) on the `ai_embedding` channel. It does **not** process items directly — the parent root node invokes the embeddings model with documents/text to embed.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsopenai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| https://js.langchain.com/docs/integrations/text_embedding/openai/ | Third-party service API docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsOpenAi`
- **Aliases:** (none)
- **Inputs:** none (sub-node; connects via `ai_embedding` channel)
- **Outputs:** none (sub-node; connects via `ai_embedding` channel)
- **Credentials:** `openAiApi` (OpenAI API key + optional Organization ID)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `model` | options | `"text-embedding-3-small"` | yes | — | Model options: `text-embedding-ada-002`, `text-embedding-3-small`, `text-embedding-3-large`, plus custom via expression. Default from docs template examples. |
| `baseURL` | string | `""` | no | — | Base URL for self-hosted / OpenAI-compatible endpoints. Empty = official OpenAI. |
| `batchSize` | number | `512` | no | — | Maximum number of documents per batch request. n8n default documented as 512. |
| `stripNewLines` | boolean | `true` | no | — | Whether to remove `\n` from input text before embedding. n8n enables by default. |
| `timeout` | number | `-1` | no | — | Request timeout in seconds. `-1` = no timeout. |

**Model option list (documented + common OpenAI models):**
- `text-embedding-ada-002` (legacy)
- `text-embedding-3-small` (default in recent n8n)
- `text-embedding-3-large`
- Custom via expression (e.g., `{{ $json.customModel }}`)

**Credential fields (from OpenAI credentials doc):**
- `apiKey` (required)
- `organization` (optional; required if multi-org)

## Runtime behavior

### Input

None. This is a cluster sub-node. It receives no items on `main`. The parent root node (e.g., AI Agent, QA Chain, Vector Store Inserter) calls the embeddings provider via the `ai_embedding` channel with an array of strings/documents to embed.

### Output

None on `main`. The sub-node registers an embeddings provider on the `ai_embedding` channel. When invoked by a parent, it calls the OpenAI Embeddings API (`/v1/embeddings`) and returns an array of embedding vectors (number[][]) corresponding to the input texts.

### Errors

- **Missing credentials** → throw (node cannot initialize provider).
- **Invalid API key / org** → throw on first invocation (401 from OpenAI).
- **Rate limit / quota exceeded** → throw (429 / 403 from OpenAI); parent node may catch if `continueOnFail` is set on the parent.
- **Timeout** → throw after `timeout` seconds (or never if `-1`).
- **Empty input array** → parent should handle; embeddings call with empty input returns empty array.

Sub-nodes do **not** have their own `continueOnFail` — error handling is the parent root node's responsibility.

### Expressions

All parameters accept expressions (`{{ … }}`). The model parameter commonly uses expressions for dynamic model selection. `baseURL`, `batchSize`, `stripNewLines`, `timeout` may use expressions for per-item or per-run configuration.

**Sub-node expression resolution rule:** In sub-nodes, expressions always resolve to the **first input item** of the parent run (per n8n sub-node semantics). For embeddings, this means dynamic model/baseURL/etc. are evaluated once per parent execution using the first item.

## Acceptance tests

### Test: basic embedding call

**Given** parent root node invokes embeddings provider with texts:

```json
["Hello world", "OpenFlow is a workflow engine"]
```

**Parameters:**

```json
{
  "model": "text-embedding-3-small",
  "baseURL": "",
  "batchSize": 512,
  "stripNewLines": true,
  "timeout": -1
}
```

**Expect** output on `ai_embedding` channel:

```json
[
  [0.00123, -0.00456, ... 1536-dim vector ...],
  [-0.00234, 0.00789, ... 1536-dim vector ...]
]
```

Each inner array length = model dimension (1536 for `text-embedding-3-small`/`large`, 1536 for `ada-002`). Values are floats.

### Test: strip new lines enabled (default)

**Given** parent invokes with text containing newlines:

```json
["Hello\nworld", "Line1\nLine2\nLine3"]
```

**Parameters:** defaults (`stripNewLines: true`)

**Expect** texts sent to OpenAI have `\n` removed → `"Helloworld"`, `"Line1Line2Line3"`.

### Test: strip new lines disabled

**Given** parent invokes with:

```json
["Hello\nworld"]
```

**Parameters:** `{ "stripNewLines": false }`

**Expect** text sent to OpenAI preserves `\n` → `"Hello\nworld"`.

### Test: custom base URL (self-hosted / compatible)

**Given** parent invokes embeddings.

**Parameters:** `{ "baseURL": "http://localhost:1234/v1", "model": "text-embedding-3-small" }`

**Expect** requests POST to `http://localhost:1234/v1/embeddings` with same payload shape.

### Test: batch size limits request splitting

**Given** parent invokes with 1200 texts.

**Parameters:** `{ "batchSize": 512 }`

**Expect** embeddings provider splits into 3 requests (512, 512, 176) and concatenates results in order.

### Test: timeout behavior

**Given** parent invokes embeddings.

**Parameters:** `{ "timeout": 5 }`

**Expect** if OpenAI does not respond within 5 seconds, provider throws timeout error (parent handles).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Model option enum list | documented (3 models) + inferred (custom via expression) | n8n docs list 3; OpenAI may add more; expression allows arbitrary string |
| Default model | inferred | Docs examples show `text-embedding-3-small`; template default may differ by n8n version |
| `batchSize` default | documented (512) | Per docs "Batch Size: Enter the maximum number of documents to send in each request." |
| `stripNewLines` default | documented (enabled by default) | "n8n enables this by default" |
| `timeout` default | documented (-1) | "Set to `-1` for no timeout" |
| Exact request/response JSON shape | inferred from OpenAI API | OpenAI `/v1/embeddings` returns `{ data: [{ embedding: number[] }, ...] }`; provider extracts `data.map(d => d.embedding)` |
| Dimensions per model | third-party service API docs | 1536 for all three listed models |
| Sub-node expression "first item" rule | documented in n8n sub-node docs | "In sub-nodes, the expression always resolves to the first item" |
| Credential `organization` field behavior | documented in credentials doc | Optional; sent as `OpenAI-Organization` header |
| `baseURL` trailing slash handling | gap | Assume n8n appends `/embeddings`; implementer must match n8n's URL join behavior |
| typeVersion behavior | gap | Only v1 seen in corpus; treat as single version unless docs show otherwise |
| Retry / backoff policy | gap | Not documented; implementer decision (exponential backoff typical) |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsOpenAi` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide an embeddings provider on `ai_embedding` for root nodes (Agent, Chains, Vector Store Inserter, Default Data Loader); call OpenAI Embeddings API (`/v1/embeddings`) with credential-backed HTTP — do **not** load `@n8n/n8n-nodes-langchain` packages