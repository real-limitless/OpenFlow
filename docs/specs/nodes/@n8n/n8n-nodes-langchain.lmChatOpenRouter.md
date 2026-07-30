---
type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter"
displayName: OpenRouter Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# OpenRouter Chat Model

Cluster **sub-node**: configures an OpenRouter chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node invokes the model with messages. OpenRouter is a unified gateway that is **API-compatible with OpenAI** (Chat Completions); the n8n docs explicitly direct users to LangChain's OpenAI integration docs for service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenrouter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openrouter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://openrouter.ai/docs/quick-start | Third-party service API docs |
| https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatOpenRouter`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `openRouterApi` (**inferred** key from naming convention + sibling `openAiApi`/`anthropicApi`/`googleApi` patterns; docs: OpenRouter API key auth)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly and tool loops; this node provides model identity, sampling options, and auth.

## Parameters

Wire names from **public workflow JSON** conventions + sibling `lmChat*` nodes; UI labels from **public docs**. The OpenRouter docs page lists Model + 8 options; option camelCase keys are **inferred** from standard export naming + OpenAI API field names (OpenRouter is OpenAI-compatible).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list from OpenRouter account) | yes | — | **Model**. n8n dynamically loads models from OpenRouter; only models available to the account are shown (**documented**). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model slugs use `provider/model` format, e.g. `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash-exp` (**service docs** slug convention). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| frequencyPenalty | number | `0` (**inferred** OpenAI default) | **Frequency Penalty** — higher → less verbatim repetition (**documented**). Maps to OpenAI/OpenRouter `frequency_penalty` (**service docs**). Range typically −2..2 (**inferred** from OpenAI compatibility). |
| maxTokens | number | unset / model default | **Maximum Number of Tokens** — completion length cap (**documented**). Maps to `max_tokens` (**service docs**). |
| responseFormat | options | `text` (**inferred**) | **Response Format** — choose **Text** or **JSON**; JSON ensures the model returns valid JSON (**documented**). Maps to OpenAI `response_format` (`text` \| `json_object`) (**inferred** from OpenAI compatibility; exact wire values `text`/`json` **inferred**). |
| presencePenalty | number | `0` (**inferred** OpenAI default) | **Presence Penalty** — higher → more new topics (**documented**). Maps to `presence_penalty` (**service docs**). |
| temperature | number | model default (often ~1) (**inferred**) | **Sampling Temperature** — higher = more random (**documented**). |
| timeout | number | implementation default (**inferred**) | **Timeout** — max request time in **milliseconds** (**documented**). |
| maxRetries | number | implementation default (**inferred**) | **Max Retries** — max times to retry a failed request (**documented**). |
| topP | number | unset | **Top P** — probability mass; lower ignores less probable options (**documented**). Maps to `top_p` (**service docs**). Prefer altering temperature **or** top_p, not both (**inferred** from OpenAI compatibility). |

## Credentials (`openRouterApi`)

From public credentials docs + sibling credential patterns:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | OpenRouter API key; create at https://openrouter.ai/keys (**documented**) |

Auth header: `Authorization: Bearer <apiKey>` (**service docs**). Default base URL `https://openrouter.ai/api/v1` (**service docs**). OpenRouter also accepts optional attribution headers `HTTP-Referer` (site URL) and `X-OpenRouter-Title` (site name) for leaderboard ranking (**service docs**); these are not exposed as credential fields in the n8n docs.

## Runtime behavior

### Role

1. Resolve credentials (`openRouterApi`). Missing/invalid key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://openrouter.ai/api/v1/chat/completions` (**service docs**; OpenAI-compatible).
   - Headers: `Authorization: Bearer <apiKey>`, `content-type: application/json` (**service docs**).
   - Apply `options` (frequencyPenalty, maxTokens, responseFormat, presencePenalty, temperature, timeout, maxRetries, topP).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a message list (roles `system` \| `user` \| `assistant` \| `tool`) at invoke time (**service docs** + agent/chain docs).
- Role mapping: standard OpenAI roles (`system`, `user`, `assistant`, `tool`) — OpenRouter is OpenAI-compatible (**service docs**).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns assistant text (and optionally tool calls). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "text": "<assistant message>",
  "model": "openai/gpt-4o",
  "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `openRouterApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| OpenRouter rate limit (429) | Fail with rate-limit error (**inferred** from service docs FAQ on rate limits) |
| Insufficient credits / billing | Fail; OpenRouter returns a 402 when credits are exhausted (**inferred** from service docs) |
| Bad request / opaque provider error | Fail (**inferred**) |
| Network / timeout | Fail after `options.timeout`; retry up to `maxRetries` (**documented** options + **inferred** retry semantics) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `model.value`, option numerics/strings may be expressions (`={{ … }}`) (**public JSON** conventions).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "openai/gpt-4o"
  },
  "options": {
    "temperature": 0,
    "maxTokens": 1024,
    "timeout": 120000
  }
}
```

**Credentials:** `openRouterApi` with valid `apiKey`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST /api/v1/chat/completions` for `openai/gpt-4o` with `temperature` `0` and `max_tokens` `1024`; `Authorization: Bearer <apiKey>` header sent.

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.or_model }}"
  },
  "options": {
    "temperature": 0.2,
    "maxTokens": 2000
  }
}
```

**Given** parent/first-item context `{ "or_model": "anthropic/claude-3.5-sonnet" }`.

**Expect:** resolved model id `anthropic/claude-3.5-sonnet` (**public JSON** pattern + sub-node first-item expression rule).

### Test: response format JSON

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "openai/gpt-4o-mini" },
  "options": {
    "maxTokens": 512,
    "responseFormat": "json"
  }
}
```

**Expect:** request includes `response_format` set to JSON object mode so the model returns valid JSON (**documented** option + **inferred** OpenAI `json_object` mapping).

### Test: penalties + top P both set

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "google/gemini-2.0-flash-exp" },
  "options": {
    "maxTokens": 256,
    "frequencyPenalty": 0.5,
    "presencePenalty": 0.5,
    "topP": 0.9
  }
}
```

**Expect:** request includes `frequency_penalty` `0.5`, `presence_penalty` `0.5`, and `top_p` `0.9` (**documented** all options exist).

### Test: missing credentials

**Parameters:** valid `model`, no `openRouterApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model (dynamic load), options list (8 options) | documented | Primary docs page |
| Credential type OpenRouter API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| OpenRouter is OpenAI API-compatible | documented | Primary docs page + service docs |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `openRouterApi` | inferred | Naming convention + sibling `openAiApi`/`anthropicApi`/`googleApi` |
| Parameter keys `model`, `options` + 8 option keys | documented + inferred | Docs labels → camelCase; high confidence from OpenAI-compatible field names |
| `responseFormat` wire values `text`/`json` → OpenAI `text`/`json_object` | inferred | Docs say "Text or JSON"; exact wire values from OpenAI compatibility |
| Default numeric values for temperature / penalties / retries / timeout | inferred / gap | OpenAI defaults + sibling examples; product defaults may differ |
| Base URL `https://openrouter.ai/api/v1` + `Authorization: Bearer` | service docs | Confirmed in OpenRouter quick-start |
| Optional attribution headers (`HTTP-Referer`, `X-OpenRouter-Title`) | service docs | Not exposed as n8n credential fields |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| Common-issues page | gap | No common-issues page exists for this node (404) |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-open-router.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatOpenRouter` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call OpenRouter Chat Completions (`POST https://openrouter.ai/api/v1/chat/completions`) with credential-backed HTTP (`Authorization: Bearer <apiKey>`) — do **not** load `@n8n/n8n-nodes-langchain` packages