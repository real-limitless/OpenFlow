---
type: "@n8n/n8n-nodes-langchain.lmChatDeepSeek"
displayName: DeepSeek Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# DeepSeek Chat Model

Cluster **sub-node**: configures a DeepSeek-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. DeepSeek's API is OpenAI-compatible; the n8n docs point users at LangChain's OpenAI integration notes and at DeepSeek's own API docs for service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatdeepseek.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/deepseek.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://api-docs.deepseek.com/ | Third-party service API docs |
| https://api-docs.deepseek.com/quick_start/error_codes | Third-party service API docs |
| https://api-docs.deepseek.com/guides/json_mode | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatDeepSeek`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `deepSeekApi` (**inferred** key from package metadata credential list `DeepSeekApi.credentials.js`; docs: DeepSeek API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the DeepSeek API authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and OpenAI/DeepSeek API field names. The docs page lists Model plus nine options; option keys not on that page are **inferred** from sibling chat-model nodes and the DeepSeek Chat Completions API.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model** — the model that generates the completion. n8n loads available model IDs from the DeepSeek API at design time (**documented**). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model IDs follow DeepSeek model names, e.g. `deepseek-v4-pro`, `deepseek-v4-flash` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| baseUrl | string | `https://api.deepseek.com` (**documented** default base URL; node-level override is **inferred** to allow customizing it) | **Base URL** — overrides the default API URL (**documented**). Maps to DeepSeek `base_url` (**service docs**). |
| frequencyPenalty | number | 0 (**inferred** OpenAI default) | **Frequency Penalty** — controls the chance of the model repeating itself; higher values reduce repetition (**documented**). Maps to DeepSeek `frequency_penalty` (**service docs**, OpenAI-compatible). |
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to DeepSeek `max_tokens` (**service docs**). |
| responseFormat | string (Text \| JSON) | `text` (**inferred**) | **Response Format** — choose **Text** or **JSON**; **JSON** ensures the model returns valid JSON (**documented**). Maps to `response_format: { "type": "json_object" }` when JSON (**service docs**). |
| presencePenalty | number | 0 (**inferred** OpenAI default) | **Presence Penalty** — controls the chance of the model talking about new topics; higher values increase it (**documented**). Maps to DeepSeek `presence_penalty` (**service docs**, OpenAI-compatible). |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to DeepSeek `temperature` (**service docs**). |
| timeout | number | (provider default; **inferred**) | **Timeout** — maximum request time in milliseconds (**documented**). Applied at client level (**inferred**). |
| maxRetries | number | (sibling default, e.g. 3; **inferred**) | **Max Retries** — maximum number of times to retry a request (**documented**). Applied at client level (**inferred**). |
| topP | number | model default (**inferred**) | **Top P** — sets the probability the completion should use; lower values ignore less probable options (**documented**). Maps to DeepSeek `top_p` (**service docs**, OpenAI-compatible). |

## Credentials (`deepSeekApi`)

From public credentials docs:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | **API Key** — created in the DeepSeek platform ([API Keys page](https://platform.deepseek.com/api_keys)); requires a DeepSeek account. Sent as `Authorization: Bearer <apiKey>` (**documented** + OpenAI-compat pattern). |

## Runtime behavior

### Role

1. Resolve credentials (`deepSeekApi`). Missing API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://api.deepseek.com/chat/completions` (**service docs**; base URL `https://api.deepseek.com`, override via `baseUrl`).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` (**service docs**).
   - Apply `options` into the request: `baseUrl` → base URL override, `frequencyPenalty` → `frequency_penalty`, `maxTokens` → `max_tokens`, `responseFormat` → `response_format`, `presencePenalty` → `presence_penalty`, `temperature` → `temperature`, `topP` → `top_p`; `timeout`/`maxRetries` at client level (**service docs** + sibling conventions).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- DeepSeek Chat Completions supports `tools` / function calling, `response_format` / JSON output, and streaming (`stream`) at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.
- JSON mode caveat: the API may occasionally return empty content; prompts must include the word "json" and an example, and `max_tokens` should be set reasonably to avoid truncation (**service docs**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns an OpenAI-style Chat Completions response whose first `choices[0].message` carries the assistant content (and optionally `tool_calls`). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "deepseek-v4-pro",
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
| Missing `deepSeekApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| 400 — invalid request body format | Fail (**service docs**) |
| 401 — authentication fails (wrong API key) | Fail (**service docs**) |
| 402 — insufficient balance | Fail; user must top up account (**service docs**) |
| 422 — invalid parameters | Fail (**service docs**) |
| 429 — rate limit reached | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions; rate limiting documented by DeepSeek) |
| 500 — server error / 503 — server overloaded | Fail; retryable after a brief wait (**service docs**) |
| Network / timeout | Fail after timeout; retry up to maxRetries (**inferred** from sibling options) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `model.value`, option numerics may be expressions (`={{ … }}`) (**public JSON** conventions).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + sampling options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "deepseek-v4-pro"
  },
  "options": {
    "maxTokens": 1024,
    "temperature": 0.7,
    "topP": 0.9,
    "frequencyPenalty": 0,
    "presencePenalty": 0
  }
}
```

**Credentials:** `deepSeekApi` with `apiKey` `sk-...`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://api.deepseek.com/chat/completions` for model `deepseek-v4-pro` with `max_tokens` `1024`, `temperature` `0.7`, `top_p` `0.9`, `frequency_penalty` `0`, `presence_penalty` `0`; request carries `Authorization: Bearer sk-...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.deepseek_model }}"
  },
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "deepseek_model": "deepseek-v4-flash" }`.

**Expect:** resolved model id `deepseek-v4-flash` (**public JSON** pattern + sub-node first-item expression rule + **service docs** model name format).

### Test: response format JSON

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "deepseek-v4-pro" },
  "options": { "responseFormat": "json" }
}
```

**Expect:** request body carries `response_format: { "type": "json_object" }`; the prompt/messages are sent verbatim from the parent (**service docs** JSON Output guide). The completion's `choices[0].message.content` is parseable JSON (**service docs**).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "deepseek-v4-pro" },
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

**Parameters:** valid `model`, no `deepSeekApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model parameter, options list (Base URL, Frequency Penalty, Maximum Number of Tokens, Response Format, Presence Penalty, Sampling Temperature, Timeout, Max Retries, Top P) | documented | Primary docs page |
| Credential: single API key; requires DeepSeek account | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from DeepSeek API | documented | Docs page |
| OpenAI-compatible base URL `https://api.deepseek.com`, Chat Completions endpoint `https://api.deepseek.com/chat/completions` | service docs | DeepSeek "Your First API Call" page |
| Error codes (400/401/402/422/429/500/503) | service docs | DeepSeek Error Codes page |
| JSON mode via `response_format: { "type": "json_object" }` | service docs | DeepSeek JSON Output guide |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `deepSeekApi` | inferred | Package metadata credential list `DeepSeekApi.credentials.js` + naming convention |
| Parameter keys `model`, `options` + option keys (`baseUrl`, `frequencyPenalty`, `maxTokens`, `responseFormat`, `presencePenalty`, `temperature`, `timeout`, `maxRetries`, `topP`) | documented + inferred | Docs labels → camelCase; high confidence from DeepSeek/OpenAI API field names |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default numeric values for penalties / temperature / maxTokens / timeouts / retries | inferred / gap | DeepSeek + sibling defaults; product defaults may differ |
| `temperature` coercion range, exact request-time streaming behavior | gap | Not enumerated in the docs fetched; assume OpenAI-compatible defaults |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-deepseek.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatDeepSeek` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call DeepSeek Chat Completions (`POST https://api.deepseek.com/chat/completions`, base URL overridable) with `Authorization: Bearer <apiKey>` and map `maxTokens`/`temperature`/`topP`/penalties/`responseFormat` into the request (`max_tokens`/`temperature`/`top_p`/`frequency_penalty`/`presence_penalty`/`response_format`) — do **not** load `@n8n/n8n-nodes-langchain` packages
