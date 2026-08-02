---
type: n8n-nodes-base.perplexityTool
displayName: Perplexity
category: AI Tool
versions: [2]
priority: high
status: specced
---

# Perplexity (AI Tool)

A tool-mode registration of the Perplexity node, designed to be used by an AI agent. When connected to an AI Agent, the model can populate parameters dynamically via `$fromAI()` or the "let model fill" toggle, and the node performs the Perplexity API call on the agent's behalf. The underlying answer engine supports Chat (Sonar models with built-in web search), Agent (third-party models with tool calling and structured output), Search (raw ranked web results), and Embeddings (vector generation for RAG). All requests go to `https://api.perplexity.ai`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.perplexity.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/perplexity.md | Public docs only |
| https://docs.perplexity.ai/docs/getting-started/integrations/n8n | Public docs only |
| https://docs.perplexity.ai/home | Public docs only |
| https://docs.perplexity.ai/api-reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.perplexityTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `perplexityApi` (single API key field), required
- **Tool-ness:** Registered as an AI-agent tool variant of the base `n8n-nodes-base.perplexity` node; usable directly on an AI Agent canvas.

## Parameters

All request bodies are sent with `Authorization: Bearer <apiKey>`; the node is transport-configured to ignore HTTP error status codes so that non-2xx responses are inspected rather than thrown at the transport layer.

### Resource selection

Selects the Perplexity API sub-service. The tool exposes the same surface as the base node:

| name | type | default | notes |
|------|------|---------|-------|
| resource | `chat` \| `agent` \| `embedding` \| `search` | `chat` | Which Perplexity API capability to invoke |
| operation | string | depends on resource | Specific API action for the selected resource |

### Chat — Message a Model

POSTs to `/chat/completions` using Sonar models with built-in web search.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | options | `sonar` | true | Sonar model family for generation |
| messages | array `{ role, content }` | one user message | true | System message first, then alternating user/assistant |
| simplify | boolean | false | false | Collapse output to `{ id, created, citations, message }` |
| options.* | collection | `{}` | false | Tuning controls: temperature, topP, topK, maxTokens, frequency/presence penalty, stop sequences, web-search controls (search mode, recency, domain/language filters, date windows), and structured JSON response format |

### Agent — Create Response

POSTs to `/v1/agent` for multi-step agentic responses using third-party models and Perplexity's `web_search` / `fetch_url` tools.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| input | string | — | true | The prompt; supports n8n expressions |
| model | resourceLocator | — | false | Model in `provider/model` form (e.g. `openai/gpt-5.5`); mutually exclusive with preset |
| preset | string | — | false | Preset name used instead of a model |
| simplify | boolean | false | false | Collapse to `{ id, model, output_text, citations, usage }` |
| options.* | collection | `{}` | false | System instructions, max output tokens, max steps, fallback models, reasoning config, tools, structured JSON response format |

### Embedding — Create Embedding / Create Contextualized Embedding

| operation | endpoint | input | model |
|-----------|----------|-------|-------|
| createEmbedding | POST `/v1/embeddings` | Text | `pplx-embed-v1-4b` (2560 dims) \| `pplx-embed-v1-0.6b` (1024 dims) |
| createContextualized | POST `/v1/contextualizedembeddings` | JSON array of document-paragraph arrays | `pplx-embed-context-v1-4b` |

Embedding options include an optional dimension override and an encoding format.

### Search — Search the Web

POSTs to `/search` for raw, ranked web results.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| query | string | — | true | The search query; supports n8n expressions |
| simplify | boolean | false | false | Collapse to `{ id, results }` |
| options.* | collection | `{}` | false | Recency (`day`/`week`/`month`/`year`), max results, max tokens, domain filter, language (ISO 639-1), country code, date windows |

### Request-level options (shared across all resources)

| name | type | notes |
|------|------|-------|
| batching | object | Split input into batched requests |
| allowUnauthorizedCerts | boolean | Skip SSL validation |
| proxy | string | HTTP proxy URL |
| timeout | number | Request timeout in ms (default 10000) |

### AI tool-specific behavior

- When connected to an AI Agent, parameters such as the prompt/query, model choice, and structured-output schema can be populated dynamically by the model through `$fromAI()` expressions and "let model fill" toggles.
- The tool performs exactly one Perplexity API call per invocation and returns the result to the agent as item data.
- Tool name and description metadata are configured on the connecting AI Agent node.

## Runtime behavior

### Input

Each input item is processed independently. Resources that accept a single prompt or query (Chat, Agent, Search) perform one API call per item. Embedding operations embed the per-item text or document array. When batching is enabled, items may be grouped across calls.

### Output

One output item per API response, forwarding the Perplexity API body (with optional simplification):
- **Chat**: OpenAI-compatible chat completion shape — `{ id, object, created, model, choices: [{ index, message: { role, content }, finish_reason }], citations, search_results, usage }`. Simplify reduces to `{ id, created, citations, message }`.
- **Agent**: `{ id, model, output, usage }` where `output` is a list of typed items (message, search_results, ...). Simplify reduces to `{ id, model, output_text, citations, usage }`.
- **Embedding**: `{ data: [{ object, index, embedding }], model, usage }`.
- **Search**: `{ id, results: [{ title, url, snippet, source, date }] }`. Simplify reduces to `{ id, results }`.

### Errors

The node ignores HTTP error status codes at the transport layer, so API-level errors (4xx/5xx) arrive in the response body and are surfaced as output data rather than thrown. The executor should inspect the body for Perplexity error structures and either forward them or throw according to `continueOnFail`. Transport failures (network, timeout, auth/401) throw normally. Common retryable conditions: 429 Too Many Requests (add backoff), 401 Unauthorized (bad credential), 500 (retry on fail).

### Expressions

All string, number, boolean, JSON, and options-collection parameters accept expression strings, including AI-populated `$fromAI()` expressions.

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

**Expect** output[0]:
- `json.id` — non-empty string
- `json.object` — equals `"chat.completion"`
- `json.choices[0].message.content` — non-empty string mentioning Paris
- `json.citations` — array (possibly empty)
- `json.usage` — object with `prompt_tokens`, `completion_tokens`, `total_tokens`

### Test 2: Agent response with model-supplied prompt

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "agent",
  "operation": "createResponse",
  "input": "= {{ $fromAI('question', 'The question to research') }}",
  "options": {
    "maxSteps": 3,
    "maxOutputTokens": 300,
    "tools": "[{ \"type\": \"web_search\" }]"
  }
}
```

**Expect** output[0]:
- `json.id` — non-empty string
- `json.model` — non-empty string
- `json.output` — array with at least one item whose `type` is `message`
- `json.usage` — object present

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
- `json.results` — array of 1–5 objects, each with `title`, `url`, `snippet`

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
- `json.data[0].embedding` — array of numbers
- `json.model` — equals `"pplx-embed-v1-4b"`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant type string | inferred | `perplexityTool` appears as a used node type in public workflow listings; the package descriptor confirms the base `perplexity` node is `usableAsTool: true` but ships no separate Tool descriptor |
| Chat operation & Sonar models | documented | n8n docs confirm "Message a Model"; Perplexity docs confirm Sonar chat completions |
| Agent, Search, Embeddings resources | documented | Perplexity's own n8n integration guide documents all three alongside Chat |
| Credential schema | documented | Single `perplexityApi` API key, documented in n8n credentials page |
| Base URL / ignoreHttpStatusErrors | inferred from corpus | Public docs don't state transport config |
| Exact parameter names, defaults, enums | inferred from corpus | Used only to identify functional surface, not copied |
| Response shapes | documented | Matches OpenAI-compatible / Perplexity API patterns |
| $fromAI() dynamic population | documented | Standard AI-tool behavior described in n8n AI documentation |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.perplexityTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
