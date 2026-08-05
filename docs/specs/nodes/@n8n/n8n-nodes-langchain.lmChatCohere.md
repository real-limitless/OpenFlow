---
type: "@n8n/n8n-nodes-langchain.lmChatCohere"
displayName: Cohere Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Cohere Chat Model

Cluster **sub-node**: configures a Cohere-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt or message list — the parent root node assembles the message history and invokes the model. Cohere exposes a Chat API v2 at `https://api.cohere.com/v2/chat`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatcohere.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cohere.md | Public docs only |
| https://docs.cohere.com/v2/reference/chat | Third-party service API docs |
| https://docs.cohere.com/v2/docs/models | Third-party service API docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatCohere`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input
- **Credentials:** `cohereApi` (confirmed in package metadata credential list `CohereApi.credentials.js`)
- **typeVersion:** `1`

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the Cohere API authentication.

## Parameters

UI labels from public n8n docs; wire keys follow sibling `lmChat*` conventions and Cohere API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model** — the model that generates the completion. n8n loads available model IDs from the Cohere API at design time (**documented**). Sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list" \| "id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model IDs follow Cohere model names, e.g. `command-a-plus-05-2026` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| temperature | number | `0.3` (**service docs**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to Cohere `temperature`. Accepts non-negative float. |
| maxTokens | number | model default | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to Cohere `max_tokens` (**service docs**). |
| maxRetries | number | — | **Max Retries** — maximum number of times to retry a request (**documented**). |

## Credentials (`cohereApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — generated at the [Cohere dashboard API Keys page](https://dashboard.cohere.com/api-keys). Sent as `Authorization: Bearer <apiKey>`. |

## Runtime behavior

### Role

1. Resolve credentials (`cohereApi`). Missing API key → fail when the parent invokes the model.
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.cohere.com/v2/chat` (**service docs**).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>`; optional `X-Client-Name` (**service docs**).
   - Apply `options` into the request: `temperature` → `temperature`, `maxTokens` → `max_tokens` (**service docs**).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern.

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list).
- Conversation messages are supplied by the **parent** agent/chain. Implementers must accept a Cohere API v2 `messages` array at invoke time (**service docs**).
- Supported roles: `system`, `user`, `assistant`, `tool` (**service docs**).
- User messages accept `content` as string or array of `Content` blocks (text + image_url) (**service docs**).
- Assistant messages can contain `tool_calls` (`ToolCallV2`) and optional `citations` (**service docs**).
- Tool messages reference a `tool_call_id` and carry the tool output as `content` (**service docs**).
- The Cohere API v2 requires `model`, `messages`, and `stream` (`false`) as required top-level fields (**service docs**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the Cohere Chat API returns a non-streaming response with `id`, `finish_reason`, `message` (AssistantMessageResponse with role, content, optional tool_calls and citations), and `usage` (billed_units + tokens).

Illustrative completion payload shape (service API; not necessarily the node's main item):

```json
{
  "id": "c14c80c3-18eb-4519-9460-6c92edd8cfb4",
  "finish_reason": "COMPLETE",
  "message": {
    "role": "assistant",
    "content": [ { "type": "text", "text": "<assistant response>" } ]
  },
  "usage": {
    "billed_units": { "input_tokens": 5, "output_tokens": 418 },
    "tokens": { "input_tokens": 71, "output_tokens": 418 }
  }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `cohereApi` credential / API key | Fail on invoke |
| Missing / empty model id | Fail |
| Invalid / unauthorized API key | Fail (HTTP 401) |
| Rate limit exceeded | Fail; retryable up to `maxRetries` |
| Bad request (invalid JSON, missing required fields) | Fail (HTTP 400) |
| Server error / unavailable | Fail (HTTP 5xx) |
| Network / timeout | Fail; retry up to maxRetries |
| `continueOnFail` | Standard engine: surface error on item / continue |

### Expressions

- `model.value`, option numerics may be expressions (`={{ … }}`).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "command-a-plus-05-2026"
  },
  "options": {
    "temperature": 0.3,
    "maxTokens": 1024,
    "maxRetries": 2
  }
}
```

**Credentials:** `cohereApi` with `apiKey` `...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.cohere.com/v2/chat` for model `command-a-plus-05-2026` with `temperature` `0.3` and `max_tokens` `1024`; request carries `Authorization: Bearer ...`.

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.cohere_model }}"
  },
  "options": {
    "temperature": 0.7
  }
}
```

**Given** parent/first-item context `{ "cohere_model": "command-r-08-2024" }`.

**Expect:** resolved model id `command-r-08-2024` (sub-node first-item expression rule + service model name).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "command-a-plus-05-2026" },
  "options": {}
}
```

**Given** parent supplies a message array:

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Summarize the meeting." }
]
```

**Expect:** request body `messages` equals the supplied array verbatim (roles preserved) (**service docs**).

### Test: missing credentials

**Parameters:** valid `model`, no `cohereApi` credential.

**Expect:** execution error when parent invokes the model.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (Sampling Temperature, Max Retries) | documented | Primary docs page |
| Credential: single API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from Cohere API | documented | Docs page |
| Cohere Chat API v2 endpoint `https://api.cohere.com/v2/chat`, message roles, response shape | service docs | Cohere API reference |
| `temperature` default `0.3`, token limits | service docs | Cohere API reference |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `cohereApi` | inferred | Package metadata credential list + naming convention |
| Parameter keys `model`, `options` + option keys `temperature`, `maxTokens`, `maxRetries` | documented + inferred | Docs labels → camelCase |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Exact `maxTokens` default / model-specific limits | gap | Varies by Cohere model |
| Cohere-specific advanced options (top_k, top_p, frequency_penalty, presence_penalty, seed, stop_sequences, citation_options, safety_mode, response_format, tools) | gap | Available via Cohere API v2 but not surfaced in public n8n docs as node options |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-cohere.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatCohere` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Cohere Chat API v2 (`POST https://api.cohere.com/v2/chat`) with `Authorization: Bearer <apiKey>` and map `temperature`/`maxTokens`/`maxRetries` into the request — do **not** load `@n8n/n8n-nodes-langchain` packages
