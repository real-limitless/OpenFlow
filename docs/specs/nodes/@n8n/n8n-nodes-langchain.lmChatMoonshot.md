---
type: "@n8n/n8n-nodes-langchain.lmChatMoonshot"
displayName: Moonshot Kimi Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Moonshot Kimi Chat Model

Cluster **sub-node**: configures a Moonshot (Kimi) hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. Moonshot exposes an OpenAI-compatible Chat Completions endpoint at `https://api.moonshot.ai/v1`; the n8n docs point users at the Kimi API documentation for model availability and service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatmoonshot.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/moonshot.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://platform.kimi.ai/docs/api/chat | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatMoonshot`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `moonshotApi` (**confirmed** from package metadata credential list `MoonshotApi.credentials.js`; docs: Kimi API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the Kimi API authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and Moonshot API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | `kimi-k2.5` | yes | — | **Model** — the model that generates the completion. n8n docs list default `kimi-k2.5`. Public workflow JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?:"..." }`. Moonshot model IDs include `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5`, `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`, `moonshot-v1-auto`, and vision-preview variants (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| frequencyPenalty | number | 0 (**service docs**) | **Frequency Penalty** — controls the chance of the model repeating itself; higher values reduce repetition (**documented**). Maps to Moonshot `frequency_penalty`; range -2.0 to 2.0 (**service docs**). |
| maxTokens | number | -1 (model default) (**documented**) | **Maximum number of tokens** — sets max completion length. Value of -1 uses model default. Maps to Moonshot `max_completion_tokens` (**service docs**; `max_tokens` is deprecated). |
| responseFormat | string (`text`) | `text` (**documented**) | **Response format** — format of the model response. Moonshot API also supports `json_object` and `json_schema` response format types (**service docs**). |
| presencePenalty | number | 0 (**service docs**) | **Presence penalty** — controls the chance of the model talking about new topics; higher values increase the chance (**documented**). Maps to Moonshot `presence_penalty`; range -2.0 to 2.0 (**service docs**). |
| temperature | number | 0.7 (**documented**) | **Sampling temperature** — controls randomness. Lower values make outputs less random; near zero the model becomes more deterministic (**documented**). Maps to Moonshot `temperature`; range 0 to 1 for moonshot-v1 models, 0 to 2 for kimi-k2.x series (**service docs**). |
| timeout | number | 360000 (**documented**) | **Timeout** — maximum request time in milliseconds. Default 360000 (6 minutes) (**documented**). |
| maxRetries | number | 2 (**documented**) | **Max retries** — maximum number of retries for failed requests. Default 2 (**documented**). |
| topP | number | 1 (**service docs**) | **Top P** — nucleus sampling parameter controlling diversity. A value of 0.5 means the model considers half of the likelihood-weighted options. Recommended to change either Top P or Temperature, not both (**documented**). Maps to Moonshot `top_p` (**service docs**). |

## Credentials (`moonshotApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created in the Kimi API Platform console ([API Keys page](https://platform.kimi.ai/console/api-keys)). Sent as `Authorization: Bearer <apiKey>` (**documented** + OpenAI-compat pattern). |

## Runtime behavior

### Role

1. Resolve credentials (`moonshotApi`). Missing API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.moonshot.ai/v1/chat/completions` (**service docs**).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` (**service docs**).
   - Apply `options` into the request: `temperature` → `temperature`, `maxTokens` → `max_completion_tokens` (when not -1), `frequencyPenalty` → `frequency_penalty`, `presencePenalty` → `presence_penalty`, `topP` → `top_p`, `responseFormat` → `response_format` (**service docs** field names).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Moonshot Chat Completions supports `tools` (function/tool calling), `tool_choice`, `response_format` (text/json_object/json_schema), `stream`, `stop`, `logprobs`/`top_logprobs`, `thinking` (kimi-k2.x reasoning mode), `reasoning_effort` (kimi-k3), `prediction` (predicted output), `prompt_cache_key`, `safety_identifier`, and `partial` mode (prefill) at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns a Chat Completions response whose first `choices[0].message` carries the assistant content (and optionally `tool_calls`). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "id": "cmpl-04ea926191a14749b7f2c7a48a68abc6",
  "object": "chat.completion",
  "model": "kimi-k2.5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "<assistant message>" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 19, "completion_tokens": 21, "total_tokens": 40 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `moonshotApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| Invalid / unauthorized API key | Fail (HTTP 401) (**service docs**) |
| Rate limit exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions) |
| Bad request / opaque provider error | Fail (**inferred**) |
| Network / timeout | Fail after timeout; retry up to maxRetries (**documented**) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `model.value`, option numerics may be expressions (`={{ … }}`) (**public JSON** conventions).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — default model + options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "kimi-k2.5"
  },
  "options": {
    "maxTokens": 2048,
    "temperature": 0.7,
    "topP": 0.9
  }
}
```

**Credentials:** `moonshotApi` with `apiKey` `sk-...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.moonshot.ai/v1/chat/completions` for model `kimi-k2.5` with `max_completion_tokens` `2048`, `temperature` `0.7`, and `top_p` `0.9`; request carries `Authorization: Bearer sk-...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.moonshot_model }}"
  },
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "moonshot_model": "kimi-k2.6" }`.

**Expect:** resolved model id `kimi-k2.6` (**public JSON** pattern + sub-node first-item expression rule).

### Test: response format JSON

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "kimi-k2.5" },
  "options": {
    "responseFormat": "json",
    "temperature": 0.1
  }
}
```

**Expect:** request includes `"response_format": { "type": "json_object" }` (**service docs** + sibling node `responseFormat` mapping).

### Test: max tokens default (-1) omitted

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "kimi-k2.5" },
  "options": {
    "maxTokens": -1
  }
}
```

**Expect:** request does NOT include `max_completion_tokens` (value -1 means use model default) (**documented**).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "kimi-k2.5" },
  "options": {}
}
```

**Given** parent supplies a message array:

```json
[
  { "role": "system", "content": "You are Kimi." },
  { "role": "user", "content": "Hello, my name is Li Lei." }
]
```

**Expect:** request body `messages` equals the supplied array verbatim (roles preserved) (**service docs**).

### Test: missing credentials

**Parameters:** valid `model`, no `moonshotApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model (default `kimi-k2.5`), options list (Frequency Penalty, Maximum Number of Tokens, Response Format, Presence Penalty, Sampling Temperature, Timeout, Max Retries, Top P) | documented | Primary docs page |
| Credential: single API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Parameter defaults (temperature 0.7, maxTokens -1, timeout 360000, maxRetries 2, penalties 0, topP 1) | documented | Primary docs page |
| OpenAI-compat base URL `https://api.moonshot.ai/v1`, Chat Completions endpoint | service docs | Moonshot API reference |
| Parameter keys `model`, `options` + option keys `frequencyPenalty`, `maxTokens`, `responseFormat`, `presencePenalty`, `temperature`, `timeout`, `maxRetries`, `topP` | documented + inferred | Docs labels → camelCase; high confidence from Moonshot API field names |
| Option default values (temperature range, penalty range, etc.) | service docs | Moonshot API reference specifies ranges |
| `maxTokens` maps to `max_completion_tokens` (not deprecated `max_tokens`) | service docs | Moonshot API reference |
| `responseFormat` maps to `response_format.type` | service docs + inferred | Moonshot supports `text`, `json_object`, `json_schema` |
| Credential wire key `moonshotApi` | confirmed | Package metadata credential list |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-moonshot.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatMoonshot` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Moonshot Chat Completions (`POST https://api.moonshot.ai/v1/chat/completions`) with `Authorization: Bearer <apiKey>` and map options into the request — do **not** load `@n8n/n8n-nodes-langchain` packages
