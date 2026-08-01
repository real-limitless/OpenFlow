---
type: n8n-nodes-base.perplexity
displayName: Perplexity
category: AI
versions: [1, 2]
priority: medium
status: specced
---

# Perplexity

## Sources

| URL | Source class |
|-----|---------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.perplexity/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/perplexity/ | Public docs only |
| https://docs.perplexity.ai/home | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.perplexity`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `perplexityApi` (API key from Perplexity account), required

## Parameters

The node routes requests to `https://api.perplexity.ai` and ignores HTTP error status codes at the transport layer (delegating error handling to response inspection).

### Resource selection

Selects the Perplexity API sub-service. Version 1 supports only Chat. Version 2 exposes all four:

| name | type | default | version | notes |
|------|------|---------|---------|-------|
| resource | `chat` \| `agent` \| `embedding` \| `search` | `chat` | 2 | v1 uses hidden fixed `chat` |
| operation | string (depends on resource) | *see below* | 1,2 | Determines the specific API action |

### Chat — Message a Model (`resource: chat, operation: complete`)

POSTs to `/chat/completions` using Sonar models with built-in web search.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | `sonar` \| `sonar-deep-research` \| `sonar-pro` \| `sonar-reasoning-pro` | `sonar` | true | The Perplexity model for generation |
| messages | array of `{ role, content }` | `[{ role: "user", content: "" }]` | true | System/user/assistant message array; system must be first, then alternating user/assistant |
| simplify | boolean | false | false | When true, output is collapsed to `{ id, created, citations, message }` |
| options.* | *(collection, see below)* | `{}` | false | Optional tuning parameters |

Options collection for Chat:

- **disableSearch** (bool, v2) — disable web search for this request
- **enableSearchClassifier** (bool, v2) — enable the search classifier
- **frequencyPenalty** (number, 0+) — penalize token frequency
- **imageDomainFilter** (string, comma-separated, v2) — restrict image domains
- **imageFormatFilter** (string, comma-separated, v2) — restrict image formats
- **languagePreference** (string, ISO 639-1, v2) — response language
- **lastUpdatedAfter** / **lastUpdatedBefore** (string, MM/DD/YYYY, v2) — date range
- **maxTokens** (number, default 1) — max output tokens
- **temperature** (number, 0–1.99, default 0.2) — output randomness
- **presencePenalty** (number, -2 to 2, default 0) — topic novelty incentive
- **reasoningEffort** (`minimal` \| `low` \| `medium` \| `high`, default `medium`, v2)
- **responseFormat** (JSON, v2) — structured output schema
- **returnImages** (bool) — request image return (Tier-2+)
- **returnRelatedQuestions** (bool) — request related questions (Tier-2+)
- **searchAfterDate** / **searchBeforeDate** (string, MM/DD/YYYY, v2) — publication date filter
- **searchDomainFilter** (string, comma-separated) — domain allow/block list
- **searchLanguageFilter** (string, comma-separated, v2) — language filter (max 20)
- **searchMode** (`web` \| `academic` \| `sec`, default `web`, v2) — search corpus
- **searchRecency** (`hour` \| `day` \| `week` \| `month` \| `year`, default `month`) — time window
- **stop** (string, comma-separated, v2) — stop sequences
- **topK** (number, 0–2048, default 0) — top-K filtering
- **topP** (number, 0–1, default 0.9) — nucleus sampling threshold
- **webSearchOptions** (JSON, v2) — advanced web search configuration

### Agent — Create Response (`resource: agent, operation: createResponse`)

POSTs to `/v1/agent` for multi-step agentic responses with third-party models and tools.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| input | string | — | true | The text prompt |
| model | resourceLocator | — | false | Model ID in `provider/model` format; mutually exclusive with preset |
| preset | string | — | false | Preset name to use instead of a model |
| simplify | bool | false | false | Collapses to `{ id, model, output_text, citations, usage }` |
| options.* | *(collection)* | `{}` | false | Agent-specific options |

Agent options:

- **instructions** (string) — system-level instructions
- **languagePreference** (string, ISO 639-1)
- **maxOutputTokens** (number, 1+, default 1024)
- **maxSteps** (number, 1–10, default 5)
- **modelsFallback** (string, comma-separated model IDs, 1–5)
- **reasoning** (JSON) — reasoning config e.g. `{"effort": "high"}`
- **responseFormat** (JSON) — structured output schema
- **tools** (JSON, array) — tool objects e.g. `[{"type":"web_search"}]`

### Embedding — Create Embedding / Create Contextualized Embedding (`resource: embedding`)

| operation | endpoint | input | model |
|-----------|----------|-------|-------|
| `createEmbedding` | POST `/v1/embeddings` | Text (one per line, split into array) | `pplx-embed-v1-0.6b` \| `pplx-embed-v1-4b` (default `pplx-embed-v1-4b`) |
| `createContextualized` | POST `/v1/contextualizedembeddings` | JSON array of document-paragraph arrays | `pplx-embed-context-v1-4b` |

Embedding options: **dimensions** (number, 0 = full), **encoding_format** (`base64_int8` default \| `base64_binary`).

### Search — Search the Web (`resource: search, operation: search`)

POSTs to `/search` for raw ranked web results.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| query | string | — | true | The search query |
| simplify | bool | false | false | Collapses to `{ id, results }` |
| options.* | *(collection)* | `{}` | false | Search filtering options |

Search options include: country, lastUpdatedAfter/Before, maxResults (1–20, default 10), maxTokens (1–1M, default 10000), maxTokensPerPage (1–1M, default 4096), searchAfterDate/BeforeDate, searchDomainFilter, searchLanguageFilter, searchRecencyFilter.

### Request-level options (shared across all resources)

| name | type | notes |
|------|------|-------|
| batching | `{ batch: { batchSize, batchInterval } }` | Split input into batched requests; -1 = disabled, 0 = 1 |
| allowUnauthorizedCerts | bool | Skip SSL validation |
| proxy | string | HTTP proxy URL |
| timeout | number | Request timeout in ms (default 10000) |

## Runtime behavior

### Input

Each input item is processed independently. For resources/operations that accept a single message or query (Chat, Agent, Search), each item produces one API call. For Embedding operations, the input text or document array is per-item.

### Output

Produces one output item per API response. The raw response body from the Perplexity API is forwarded with possible simplification:
- **Chat**: Standard OpenAI-compatible `/chat/completions` shape: `{ id, object, created, model, choices: [{ index, message: { role, content }, finish_reason }], citations, search_results, usage }`. Simplify reduces to `{ id, created, citations, message }`.
- **Agent**: API response under `{ id, model, output, usage }` where output contains typed items (message, search_results, etc.). Simplify reduces to `{ id, model, output_text, citations, usage }`.
- **Embedding**: Standard `{ data: [{ object, index, embedding }], model, usage }`. No simplify option.
- **Search**: `{ id, results: [{ title, url, snippet, source, date, last_updated }] }`. Simplify reduces to `{ id, results }`.

### Errors

The node is configured with `ignoreHttpStatusErrors: true` at the transport level. HTTP-level errors (non-2xx) are passed through in the response body and surfaced as output data rather than thrown. The executor should inspect the response body for Perplexity error structures and either forward them or throw based on `continueOnFail`. Non-HTTP errors (network, timeout, auth) should throw normally.

### Expressions

All string, number, boolean, JSON, and options-collection parameters accept expression strings.

## Acceptance tests

### Test 1: Chat completion (basic)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "chat",
  "operation": "complete",
  "model": "sonar",
  "messages": {
    "message": [{ "role": "user", "content": "What is the capital of France?" }]
  }
}
```

**Expect** output[0] contains:
- `json.id` — a non-empty string
- `json.object` — equals `"chat.completion"`
- `json.choices[0].message.content` — a non-empty string mentioning Paris
- `json.citations` — an array (possibly empty)
- `json.usage` — an object with `prompt_tokens`, `completion_tokens`, `total_tokens`

### Test 2: Chat with simplified output

**Parameters:**
```json
{
  "resource": "chat",
  "operation": "complete",
  "model": "sonar",
  "messages": {
    "message": [{ "role": "user", "content": "Say hello" }]
  },
  "simplify": true
}
```

**Expect** output[0] `json` shape:
```json
{
  "id": "...",
  "created": 1234567890,
  "citations": [],
  "message": "Hello! ..."
}
```
(types match; values are dynamic)

### Test 3: Search the web

**Parameters:**
```json
{
  "resource": "search",
  "operation": "search",
  "query": "latest AI news",
  "options": {
    "maxResults": 5,
    "searchRecencyFilter": "week"
  }
}
```

**Expect** output[0]:
- `json.id` — non-empty string
- `json.results` — array of 1–5 objects each with `title`, `url`, `snippet`

### Test 4: Create embedding

**Parameters:**
```json
{
  "resource": "embedding",
  "operation": "createEmbedding",
  "model": "pplx-embed-v1-4b",
  "input": "Hello world"
}
```

**Expect** output[0]:
- `json.data` — array with at least one entry
- `json.data[0].embedding` — array of numbers (length matches model dimensions)
- `json.model` — equals `"pplx-embed-v1-4b"`

### Test 5: Agent response (v2)

**Parameters:**
```json
{
  "resource": "agent",
  "operation": "createResponse",
  "input": "What is 2+2? Answer concisely.",
  "options": {
    "maxSteps": 1,
    "maxOutputTokens": 200
  }
}
```

**Expect** output[0]:
- `json.id` — non-empty string
- `json.model` — non-empty string
- `json.output` — array containing at least one item
- `json.usage` — object with cost information

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Chat operation & models | documented | Public docs confirm "Message a Model" with Sonar models |
| Agent, Embedding, Search resources | inferred from corpus | Not explicitly listed in public n8n docs page (which only showed "Message a Model") but confirmed by Perplexity API docs |
| Credential schema | documented | API key, documented in n8n credentials page |
| Base URL / ignoreHttpStatusErrors | inferred from corpus | Public docs don't specify axios config |
| Exact parameter names, defaults, enums | inferred from corpus | Used only to identify functional surface, not copied |
| Response shapes | documented | Schema files in corpus; matches OpenAI-compatible / Perplexity API patterns |
| v1 vs v2 split | inferred from corpus | v1 has hidden resource selector with chat only; v2 exposes all four resources |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/perplexity.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only