---
type: "@n8n/n8n-nodes-langchain.lmChatOpenAi"
displayName: OpenAI Chat Model
category: AI
versions: [1, 1.2, 1.3]
priority: high
status: specced
---

# OpenAI Chat Model

Cluster **sub-node**: configures an OpenAI chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node invokes the model with messages.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://platform.openai.com/docs/api-reference/chat/create | Third-party service API docs |
| https://platform.openai.com/docs/api-reference/responses | Third-party service API docs |
| https://platform.openai.com/docs/guides/tools | Third-party service API docs (built-in tools) |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatOpenAi`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node’s language-model input (**public JSON** channel name)
- **Credentials:** `openAiApi` (**public JSON** key; docs: OpenAI API key auth)
- **typeVersion:** public templates commonly use `1`, `1.2`, or `1.3`

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly and tool loops; this node provides model identity, sampling options, auth, and (optionally) Responses API / built-in tools.

## Parameters

Wire names from **public workflow JSON** where observed; UI labels from **public docs**. CamelCase for options not seen in exports is **inferred** from standard export naming + OpenAI API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list from OpenAI account) | yes | — | **Model**. Public JSON uses resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Value is a model id such as `gpt-4.1-mini`, `gpt-4o`, `gpt-5-mini` (**documented** dynamic load + **public JSON**). |
| responsesApiEnabled | boolean | `false` | no | — | **Use Responses API**. When false/omitted, use Chat Completions API; when true, use Responses API (**documented** UI + **public JSON** key). |
| builtInTools | collection / object | `{}` | no | show when Responses API is enabled (**documented**) | Built-in OpenAI tools (Responses). Only supported with **AI Agent** root — not Basic LLM Chain (**documented**). Sub-keys below. |
| options | collection | `{}` | no | — | Sampling / request options (both APIs unless noted). |

### builtInTools sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| webSearch | collection / object | omitted / empty | **Web Search** — model may search the web before answering (**documented**). Public JSON example: `{ "searchContextSize": "medium" }` (`low` \| `medium` \| `high` **inferred** from OpenAI web-search options + template). |
| fileSearch | collection / object | omitted | **File Search** — search previously uploaded knowledge files (**documented**). Exact nested keys (vector store ids, etc.) **partially documented** via OpenAI tool docs; treat store/id fields as **gap** until observed in exports. |
| codeInterpreter | collection / object / boolean | omitted | **Code Interpreter** — run Python in a sandbox (**documented**). Nested wire shape **inferred** / **gap**. |

### options sub-parameters (Chat Completions and Responses)

| name | type | default | notes |
|------|------|---------|-------|
| frequencyPenalty | number | `0` (**inferred** OpenAI default) | Higher → less verbatim repetition (**documented**). Range typically −2..2 (**service docs**). |
| maxTokens | number | unset / model default | **Maximum Number of Tokens** — completion length cap (**documented** + **public JSON** `maxTokens`). Maps to OpenAI `max_tokens` / `max_completion_tokens` depending on model (**service docs**). |
| presencePenalty | number | `0` (**inferred**) | Higher → more new topics (**documented**). |
| temperature | number | model default (often ~1) (**inferred**) | **Sampling Temperature** — higher = more random (**documented** + **public JSON**). |
| timeout | number | implementation default (templates use e.g. `120000`) | Max request time in **milliseconds** (**documented** + **public JSON**). |
| maxRetries | number | implementation default (**gap**) | Max times to retry a failed request (**documented**). |
| topP | number | unset | Nucleus sampling mass; lower ignores less probable tokens (**documented**). Prefer altering temperature **or** top_p, not both (**service docs**). |

### options sub-parameters (Responses API only)

Visible when `responsesApiEnabled` is true (**documented**).

| name | type | default | notes |
|------|------|---------|-------|
| conversationId | string | — | Responses `conversation` / conversation id; turns append after completion (**documented**). |
| promptCacheKey | string | — | Cache similar requests (**documented**; OpenAI `prompt_cache_key`). |
| safetyIdentifier | string | — | End-user safety tracking id (**documented**). |
| serviceTier | options | `auto` (**inferred** OpenAI default) | `auto` \| `flex` \| `default` \| `priority` (**documented**). |
| metadata | fixedCollection / object | — | Up to 16 string key-value pairs (**documented**). |
| topLogprobs | number | — | Integer 0–20; most likely tokens + logprobs per position (**documented**). |
| outputFormat / textFormat | options | Text | **Output Format**: Text, JSON Schema, or JSON Object (**documented**). Exact wire key **inferred** (`text` / `json_schema` / `json_object` align with OpenAI `response_format` / Responses text format). JSON Schema recommended for structured JSON (**documented**). |
| prompt | collection | — | Dashboard prompt: id, version, substitutable variables (**documented**). Nested keys **inferred** (`promptId`, `version`, `variables`). |

## Credentials (`openAiApi`)

From public credentials docs + public workflow credential references:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | OpenAI API key (**documented**) |
| organizationId | string | no | Organization header when user belongs to multiple orgs (**documented**) |
| url | string | no | Base URL override; default OpenAI API base (**inferred** from common credential exports / docs “API”) |
| header / headerName / headerValue | boolean + strings | no | Optional custom header (**inferred** from credential property surface in public package metadata descriptors — name only; not algorithm source) |

Auth header: `Authorization: Bearer <apiKey>`; optional `OpenAI-Organization` when organization is set (**service docs**).

## Runtime behavior

### Role

1. Resolve credentials (`openAiApi`). Missing/invalid key → fail when the parent invokes the model (**inferred** + common-issues credential guidance).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint family: Chat Completions (`/chat/completions`) when `responsesApiEnabled` is false; Responses API when true (**documented**).
   - Apply `options` (temperature, penalties, max tokens, timeout, retries, top_p, etc.).
   - When Responses + Agent: attach enabled `builtInTools` (web search, file search, code interpreter) (**documented**).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a message list (roles `system` \| `user` \| `assistant` \| `tool` / developer as required by model) at invoke time (**service docs** + agent/chain docs).
- Chat Completions: parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Responses: optional `conversationId` for server-side persistence (**documented**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns assistant text (and optionally tool calls / structured output). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node’s main item):

```json
{
  "text": "<assistant message>",
  "model": "gpt-4.1-mini",
  "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `openAiApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| OpenAI rate limit | Error “service is receiving too many requests” / rate-limit; mitigate with batching + Wait or HTTP batch limits (**documented** common issues) |
| Insufficient quota / billing | Fail with insufficient quota; check org/project/billing and key (**documented**) |
| Bad request / opaque provider error | Fail; docs suggest HTTP Request for fuller error body (**documented**) |
| `builtInTools` with non-Agent root (e.g. Basic LLM Chain) | Tools unavailable / unsupported (**documented**) |
| Network / timeout | Fail after `options.timeout`; retry up to `maxRetries` (**documented** options + **inferred** retry semantics) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `model.value`, option numerics/strings, Responses fields, and built-in tool fields may be expressions (`={{ … }}`) (**public JSON**).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options (Chat Completions)

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "gpt-4.1-mini"
  },
  "responsesApiEnabled": false,
  "options": {
    "temperature": 0,
    "maxTokens": 1024,
    "timeout": 120000
  }
}
```

**Credentials:** `openAiApi` with valid `apiKey`.

**Cluster:** connect this node’s `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke chat completions for `gpt-4.1-mini` with temperature `0` and max tokens `1024`; no Responses built-in tools attached.

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.openai_model }}"
  },
  "options": {
    "temperature": 0.2,
    "maxTokens": 2000
  }
}
```

**Given** parent/first-item context `{ "openai_model": "gpt-4o-mini" }`.

**Expect:** resolved model id `gpt-4o-mini` (**public JSON** pattern + sub-node first-item expression rule).

### Test: Responses API + web search tool (Agent only)

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "gpt-5-mini"
  },
  "responsesApiEnabled": true,
  "builtInTools": {
    "webSearch": {
      "searchContextSize": "medium"
    }
  },
  "options": {}
}
```

**Cluster:** AI Agent root (not Basic LLM Chain).

**Expect:** invoke uses Responses API; web search built-in tool enabled with medium search context (**documented** + **public JSON**).

### Test: missing credentials

**Parameters:** valid `model`, no `openAiApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

### Test: rate limit / insufficient quota surfaces

**Given** provider returns rate-limit or insufficient-quota errors.

**Expect:** node/parent fails with a clear error (not silent empty output); aligns with documented common issues (rate limit, insufficient quota).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, Use Responses API, built-in tools list, options list | documented | Primary docs page |
| Credential type OpenAI API key + org | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs + common issues |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports |
| Parameter keys `model`, `options`, `temperature`, `maxTokens`, `timeout`, `builtInTools`, `responsesApiEnabled`, `webSearch.searchContextSize` | public JSON | High confidence |
| Option keys `frequencyPenalty`, `presencePenalty`, `maxRetries`, `topP` | inferred | Docs labels → camelCase; not heavily present in sampled templates |
| Responses-only option wire keys (`conversationId`, `promptCacheKey`, …) | inferred | Docs labels; confirm against more exports if gates require exact keys |
| `fileSearch` / `codeInterpreter` nested schema | gap | Docs name tools; nested fields from OpenAI tool guides only |
| Default numeric values for temperature / retries / timeout | inferred / gap | OpenAI defaults + template examples; product defaults may differ |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas (1 → 1.2 → 1.3) | gap | 1.3 adds Responses/built-in tools fields in templates; treat as additive |
| Base URL / custom header on credential | partial | Common OpenAI credential fields; verify against public credential docs when implementing |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatOpenAi` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call OpenAI Chat Completions or Responses with credential-backed HTTP — do **not** load `@n8n/n8n-nodes-langchain` packages
