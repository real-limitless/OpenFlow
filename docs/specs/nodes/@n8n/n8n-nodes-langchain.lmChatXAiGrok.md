---
type: "@n8n/n8n-nodes-langchain.lmChatXAiGrok"
displayName: xAI Grok Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# xAI Grok Chat Model

Cluster **sub-node**: configures an xAI Grok-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. xAI exposes an OpenAI-compatible Chat Completions endpoint at `https://api.x.ai/v1`; the n8n docs point users at xAI's API documentation for model availability and service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatxaigrok.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/xai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://docs.x.ai/docs/api-reference | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatXAiGrok`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `xAiApi` (**confirmed** from package metadata credential list `XAiApi.credentials.js` entry; docs: xAI API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the xAI API authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and xAI API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model** — the model that generates the completion. n8n loads available model IDs from the xAI API at design time (**documented**). Sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?:"..." }`. Model IDs follow xAI model names, e.g. `grok-4.5` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| frequencyPenalty | number | 0 (**service docs**) | **Frequency Penalty** — controls the chance of the model repeating itself; higher values reduce repetition (**documented**). Maps to xAI `frequency_penalty`; range -2.0 to 2.0 (**service docs**). Not supported by reasoning models. |
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the completion length. Most models have a context length of 2048 tokens, newest models up to 32,768 (**documented**). Maps to xAI `max_completion_tokens` (**service docs**; `max_tokens` is deprecated). |
| responseFormat | string (`text`/`json`) | `text` (**inferred** from sibling node docs) | **Response Format** — `json` ensures the model returns valid JSON (**documented**). Maps to xAI `response_format` with type `json_object` or `text` (**service docs**). |
| presencePenalty | number | 0 (**service docs**) | **Presence Penalty** — controls the chance of the model talking about new topics; higher values increase the chance (**documented**). Maps to xAI `presence_penalty`; range -2.0 to 2.0 (**service docs**). Not supported by `grok-3` and reasoning models. |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to xAI `temperature`; range 0 to 2 (**service docs**). |
| timeout | number | 0 (no timeout) (**inferred** from sibling nodes) | **Timeout** — maximum request time in milliseconds (**documented**). |
| maxRetries | number | 2 (**inferred** from sibling node defaults) | **Max Retries** — maximum number of times to retry a request (**documented**). |
| topP | number | 1 (**service docs**) | **Top P** — nucleus sampling parameter; lower values ignore less probable options (**documented**). Maps to xAI `top_p` (**service docs**). |

## Credentials (`xAiApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created in the xAI Console ([API Keys page](https://console.x.ai/team/default/api-keys)). Sent as `Authorization: Bearer <apiKey>` (**documented** + OpenAI-compat pattern). |

## Runtime behavior

### Role

1. Resolve credentials (`xAiApi`). Missing API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.x.ai/v1/chat/completions` (**service docs** OpenAI-compat base URL `https://api.x.ai/v1`).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` (**service docs**).
   - Apply `options` into the request: `temperature` → `temperature`, `maxTokens` → `max_completion_tokens`, `frequencyPenalty` → `frequency_penalty`, `presencePenalty` → `presence_penalty`, `topP` → `top_p`, `responseFormat` → `response_format` (**service docs** field names).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- xAI Chat Completions supports `tools` (function calling), `tool_choice`, `response_format`, `stream`, `stop`, `seed`, `parallel_tool_calls`, `logprobs`/`top_logprobs`, `reasoning_effort`, `n`, and `user` at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns a Chat Completions response whose first `choices[0].message` carries the assistant content (and optionally `tool_calls`). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "grok-4.5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "<assistant message>" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 26, "completion_tokens": 298, "total_tokens": 324 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `xAiApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| Invalid / unauthorized API key | Fail (HTTP 401) (**service docs**) |
| Rate limit exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions) |
| Bad request / opaque provider error | Fail (**inferred**) |
| Network / timeout | Fail after timeout; retry up to maxRetries (**inferred** from sibling options) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `model.value`, option numerics may be expressions (`={{ … }}`) (**public JSON** conventions).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "grok-4.5"
  },
  "options": {
    "maxTokens": 1024,
    "temperature": 0.7,
    "topP": 0.9
  }
}
```

**Credentials:** `xAiApi` with `apiKey` `xai-...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.x.ai/v1/chat/completions` for model `grok-4.5` with `max_completion_tokens` `1024`, `temperature` `0.7`, and `top_p` `0.9`; request carries `Authorization: Bearer xai-...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.xai_model }}"
  },
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "xai_model": "grok-4.5" }`.

**Expect:** resolved model id `grok-4.5` (**public JSON** pattern + sub-node first-item expression rule).

### Test: response format JSON

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "grok-4.5" },
  "options": {
    "responseFormat": "json",
    "temperature": 0.1
  }
}
```

**Expect:** request includes `"response_format": { "type": "json_object" }` (**service docs** + sibling node `responseFormat` mapping).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "grok-4.5" },
  "options": {}
}
```

**Given** parent supplies a message array:

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "What is 101*3?" }
]
```

**Expect:** request body `messages` equals the supplied array verbatim (roles preserved) (**service docs**).

### Test: missing credentials

**Parameters:** valid `model`, no `xAiApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (Frequency Penalty, Maximum Number of Tokens, Response Format, Presence Penalty, Sampling Temperature, Timeout, Max Retries, Top P) | documented | Primary docs page |
| Credential: single API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from xAI API | documented | Docs page |
| OpenAI-compat base URL `https://api.x.ai/v1`, Chat Completions endpoint | service docs | xAI API reference |
| Parameter keys `model`, `options` + option keys `frequencyPenalty`, `maxTokens`, `responseFormat`, `presencePenalty`, `temperature`, `timeout`, `maxRetries`, `topP` | documented + inferred | Docs labels → camelCase; high confidence from xAI API field names |
| Option default values (temperature, penalty range, etc.) | service docs | xAI API reference specifies ranges |
| `maxTokens` maps to `max_completion_tokens` (not deprecated `max_tokens`) | service docs | xAI API reference |
| `responseFormat` maps to `response_format.type` with `json_object` / `text` | service docs + inferred | Sibling node pattern; xAI supports `json_object` |
| Credential wire key `xAiApi` | confirmed | Package metadata credential list |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default numeric values for timeouts / retries | inferred / gap | Sibling defaults may differ |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-xai-grok.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatXAiGrok` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call xAI Chat Completions (`POST https://api.x.ai/v1/chat/completions`) with `Authorization: Bearer <apiKey>` and map `maxTokens`/`temperature`/etc. into the request — do **not** load `@n8n/n8n-nodes-langchain` packages
