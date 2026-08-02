---
type: "@n8n/n8n-nodes-langchain.lmChatGroq"
displayName: Groq Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Groq Chat Model

Cluster **sub-node**: configures a Groq-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. Groq exposes an OpenAI-compatible Chat Completions endpoint; the n8n docs point users at the Groq console docs for model availability and service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatgroq.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/groq.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://console.groq.com/docs/quickstart | Third-party service API docs |
| https://console.groq.com/docs/openai | Third-party service API docs |
| https://console.groq.com/docs/models | Third-party service docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatGroq`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `groqApi` (**inferred** key from package metadata credential list `GroqApi.credentials.js` + sibling `openAiApi`/`anthropicApi`/`ollamaApi` naming; docs: Groq API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the Groq API authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and Groq API field names. The Groq docs page is minimal (Model + 2 options); keys not on that page are **inferred** from sibling chat-model nodes and the Groq Chat Completions API.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model** — the model that generates the completion. n8n loads available model IDs from the Groq API at design time (**documented**). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model IDs follow Groq model names, e.g. `llama-3.3-70b-versatile` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to Groq `max_tokens` (**service docs**). |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to Groq `temperature`; Groq converts `0` to `1e-8` and accepts values `> 0` and `<= 2` (**service docs**). |

## Credentials (`groqApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created in the Groq console ([API Keys page](https://console.groq.com/keys)). Sent as `Authorization: Bearer <apiKey>` (**documented** + OpenAI-compat pattern). Groq binds API keys to the organization, not the user (**documented**). |

## Runtime behavior

### Role

1. Resolve credentials (`groqApi`). Missing API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.groq.com/openai/v1/chat/completions` (**service docs** OpenAI-compat base URL `https://api.groq.com/openai/v1`).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` (**service docs**).
   - Apply `options` into the request: `maxTokens` → `max_tokens`, `temperature` → `temperature` (**service docs**).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible). Note `messages[].name` is **not** supported by Groq (400 error) (**service docs**).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Groq Chat Completions supports `tools` (function/tool calling), `response_format` / structured outputs, and `reasoning` at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.
- Groq rejects `logprobs`, `logit_bias`, `top_logprobs`, and `n != 1` (**service docs**).

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
  "model": "llama-3.3-70b-versatile",
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
| Missing `groqApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| 400 with `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, or `n != 1` | Fail; these fields are unsupported by Groq (**service docs**) |
| `temperature` outside `(0, 2]` | Fail or coerced; Groq converts `0` to `1e-8` and rejects out-of-range values (**service docs**) |
| Invalid / unauthorized API key | Fail (HTTP 401) (**service docs**) |
| Rate limit exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions; Groq rate limits documented) |
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
    "value": "llama-3.3-70b-versatile"
  },
  "options": {
    "maxTokens": 1024,
    "temperature": 0.7
  }
}
```

**Credentials:** `groqApi` with `apiKey` `gsk_...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.groq.com/openai/v1/chat/completions` for model `llama-3.3-70b-versatile` with `max_tokens` `1024` and `temperature` `0.7`; request carries `Authorization: Bearer gsk_...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.groq_model }}"
  },
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "groq_model": "meta-llama/llama-4-scout-17b-16e-instruct" }`.

**Expect:** resolved model id `meta-llama/llama-4-scout-17b-16e-instruct` (**public JSON** pattern + sub-node first-item expression rule + **service docs** model name format).

### Test: minimum temperature coercion

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "llama-3.3-70b-versatile" },
  "options": { "temperature": 0 }
}
```

**Expect:** request `temperature` is sent as `1e-8` (Groq converts `0`), or the executor rejects values outside `(0, 2]` (**service docs**).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "llama-3.3-70b-versatile" },
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

**Expect:** request body `messages` equals the supplied array verbatim (roles preserved, no `name` field) (**service docs**).

### Test: missing credentials

**Parameters:** valid `model`, no `groqApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (Maximum Number of Tokens, Sampling Temperature) | documented | Primary docs page |
| Credential: single API key; keys bound to organization | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from Groq API | documented | Docs page |
| OpenAI-compat base URL `https://api.groq.com/openai/v1`, Chat Completions endpoint | service docs | Groq OpenAI Compatibility page |
| `temperature` conversion (`0` → `1e-8`), range `(0, 2]`; unsupported fields (logprobs, logit_bias, top_logprobs, `messages[].name`, `n != 1`) | service docs | Groq OpenAI Compatibility page |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `groqApi` | inferred | Package metadata credential list + naming convention |
| Parameter keys `model`, `options` + option keys `maxTokens`, `temperature` | documented + inferred | Docs labels → camelCase; high confidence from Groq API field names |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default numeric values for temperature / maxTokens / timeouts / retries | inferred / gap | Groq + sibling defaults; product defaults may differ |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-groq.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatGroq` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Groq Chat Completions (`POST https://api.groq.com/openai/v1/chat/completions`) with `Authorization: Bearer <apiKey>` and map `maxTokens`/`temperature` into the request (`max_tokens`/`temperature`) — do **not** load `@n8n/n8n-nodes-langchain` packages
