---
type: "@n8n/n8n-nodes-langchain.lmChatMistralCloud"
displayName: Mistral Cloud Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Mistral Cloud Chat Model

Cluster **sub-node**: configures a Mistral-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. Mistral exposes an OpenAI-compatible Chat Completions API; the n8n docs point users at the Mistral API docs and LangChain's Mistral integration for service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatmistralcloud.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mistral.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://docs.mistral.ai/api/ | Third-party service API docs |
| https://js.langchain.com/docs/integrations/chat/mistral | Third-party service docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatMistralCloud`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `mistralCloudApi` (**confirmed** via package metadata credential list `MistralCloudApi.credentials.js` supporting `lmChatMistralCloud`; docs: Mistral Cloud API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the Mistral API authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and Mistral Chat Completions API field names. The Mistral docs page lists Model + 7 options; keys not on that page are **inferred** from sibling chat-model nodes and the Mistral API.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model** — the model that generates the completion. n8n loads available model IDs from the Mistral API at design time (**documented**). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model IDs follow Mistral model names, e.g. `mistral-large-latest`, `open-mistral-nemo` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to Mistral `max_tokens` (**service docs**). |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to Mistral `temperature` (**service docs**). |
| timeout | number | 120000 ms (**inferred**; default from sibling chat-model nodes) | **Timeout** — maximum request time in milliseconds (**documented**). |
| maxRetries | number | 2 (**inferred**; sibling default) | **Max Retries** — maximum number of times to retry a request (**documented**). |
| topP | number | model default (**inferred**) | **Top P** — nucleus sampling probability; lower values ignore less probable options (**documented**). Maps to Mistral `top_p` (**service docs**). |
| safeMode | boolean | `false` (**service docs** default `safe_prompt`) | **Enable Safe Mode** — injects a safety prompt at the beginning of the completion to help prevent offensive content (**documented**). Maps to Mistral `safe_prompt` (**service docs**). |
| randomSeed | number | (none) | **Random Seed** — seed for random sampling; if set, different calls generate deterministic results (**documented**). Maps to Mistral `random_seed` (**service docs**). |

## Credentials (`mistralCloudApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created on the Mistral console **API Keys** page; a paid/billing-enabled account is required to generate keys (**documented**). Sent as `Authorization: Bearer <apiKey>` (**service docs** pattern). |

## Runtime behavior

### Role

1. Resolve credentials (`mistralCloudApi`). Missing API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.mistral.ai/v1/chat/completions` (**service docs**).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` (**service docs**).
   - Apply `options` into the request: `maxTokens` → `max_tokens`, `temperature` → `temperature`, `topP` → `top_p`, `safeMode` → `safe_prompt`, `randomSeed` → `random_seed` (**service docs**).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Mistral Chat Completions supports `tools` / function calling, `response_format` / structured outputs, `stop` sequences, and `random_seed` at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

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
  "model": "mistral-large-latest",
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
| Missing `mistralCloudApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| Invalid / unauthorized API key | Fail (HTTP 401) (**service docs**) |
| Rate limit exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions; Mistral rate limits documented) |
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
    "value": "mistral-large-latest"
  },
  "options": {
    "maxTokens": 1024,
    "temperature": 0.7,
    "topP": 0.9,
    "safeMode": false,
    "randomSeed": 42
  }
}
```

**Credentials:** `mistralCloudApi` with `apiKey` `...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.mistral.ai/v1/chat/completions` for model `mistral-large-latest` with `max_tokens` `1024`, `temperature` `0.7`, `top_p` `0.9`, `safe_prompt` `false`, and `random_seed` `42`; request carries `Authorization: Bearer ...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.mistral_model }}"
  },
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "mistral_model": "open-mistral-nemo" }`.

**Expect:** resolved model id `open-mistral-nemo` (**public JSON** pattern + sub-node first-item expression rule + **service docs** model name format).

### Test: safe mode and seed defaults

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "mistral-small-latest" },
  "options": {}
}
```

**Expect:** request omits or sends `safe_prompt: false` and omits `random_seed` when no option is set; when `safeMode: true` is set, request carries `safe_prompt: true` and a safety prompt is injected at the beginning of the completion (**service docs**).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "mistral-large-latest" },
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

**Parameters:** valid `model`, no `mistralCloudApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (Maximum Number of Tokens, Sampling Temperature, Timeout, Max Retries, Top P, Enable Safe Mode, Random Seed) | documented | Primary docs page |
| Credential: single API key; paid/billing-enabled account required | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from Mistral API | documented | Docs page |
| Endpoint `https://api.mistral.ai/v1/chat/completions` | service docs | Mistral API |
| `safe_prompt` (default `false`, injects safety prompt), `random_seed` (deterministic when set), `top_p`, `max_tokens`, `temperature` field names | service docs | Mistral API |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `mistralCloudApi` | confirmed | Package metadata credential list (`MistralCloudApi.credentials.js`) supporting `lmChatMistralCloud` |
| Parameter keys `model`, `options` + option keys `maxTokens`, `temperature`, `timeout`, `maxRetries`, `topP`, `safeMode`, `randomSeed` | documented + inferred | Docs labels → camelCase; high confidence from Mistral API field names |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default numeric values for temperature / maxTokens / timeout / maxRetries / topP | inferred / gap | Mistral + sibling defaults; product defaults may differ |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-mistral-cloud.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatMistralCloud` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Mistral Chat Completions (`POST https://api.mistral.ai/v1/chat/completions`) with `Authorization: Bearer <apiKey>` and map options into the request (`maxTokens`→`max_tokens`, `temperature`, `topP`→`top_p`, `safeMode`→`safe_prompt`, `randomSeed`→`random_seed`) — do **not** load `@n8n/n8n-nodes-langchain` packages
