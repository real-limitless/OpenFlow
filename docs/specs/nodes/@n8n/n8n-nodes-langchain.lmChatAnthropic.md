---
type: "@n8n/n8n-nodes-langchain.lmChatAnthropic"
displayName: Anthropic Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Anthropic Chat Model

Cluster **sub-node**: configures an Anthropic Claude chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node invokes the model with messages.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatanthropic.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/anthropic.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://docs.anthropic.com/en/api/messages | Third-party service API docs |
| https://docs.anthropic.com/en/docs/about-claude/models | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatAnthropic`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `anthropicApi` (**inferred** key from naming convention + sibling `openAiApi`/`googleApi` patterns; docs: Anthropic API key auth)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly and tool loops; this node provides model identity, sampling options, and auth.

## Parameters

Wire names from **public workflow JSON** conventions + sibling `lmChat*` nodes; UI labels from **public docs**. The Anthropic docs page is minimal (Model + 4 options); keys not on that page are **inferred** from sibling chat-model nodes and Anthropic API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model**. Docs list choices **Claude** and **Claude Instant** (legacy families). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Current model ids from Anthropic service docs, e.g. `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-haiku-20240307` (**documented** choices + **service docs** for ids). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| maxTokens | number | unset / model default | **Maximum Number of Tokens** — completion length cap (**documented**). Maps to Anthropic API `max_tokens` (**service docs**; required by the API itself). |
| temperature | number | model default (often ~1) (**inferred**) | **Sampling Temperature** — higher = more random (**documented**). |
| topK | number | unset | **Top K** — number of token choices the model uses to generate the next token (**documented**). Maps to Anthropic `top_k` (**service docs**). |
| topP | number | unset | **Top P** — probability mass; lower ignores less probable options (**documented**). Maps to Anthropic `top_p` (**service docs**). |
| timeout | number | implementation default (**inferred**) | Max request time in **milliseconds** (**inferred** from sibling `lmChat*` nodes; not on this docs page). |
| maxRetries | number | implementation default (**gap**) | Max times to retry a failed request (**inferred** from sibling `lmChat*` nodes; not on this docs page). |

## Credentials (`anthropicApi`)

From public credentials docs + sibling credential patterns:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | Anthropic API key; create in Anthropic Console → Settings → API Keys (**documented**) |
| header / headerName / headerValue | boolean + strings | no | Optional **Add Custom Header** toggle with Header Name + Header Value (**documented**) |

Auth header: `x-api-key: <apiKey>` (**service docs**). Default base URL `https://api.anthropic.com` (**inferred** from service docs). The Anthropic Messages API also requires an `anthropic-version` header (e.g. `2023-06-01`) (**service docs**).

## Runtime behavior

### Role

1. Resolve credentials (`anthropicApi`). Missing/invalid key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST {baseUrl}/v1/messages` (**service docs**).
   - Headers: `x-api-key`, `anthropic-version`, `content-type: application/json` (**service docs**).
   - Apply `options` (maxTokens, temperature, topK, topP).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a message list at invoke time (**service docs** + agent/chain docs).
- Role mapping: `system` → Anthropic top-level `system` parameter (not a message role); `user` → `user`; `assistant` → `assistant`; `tool` → tool-result content blocks (**service docs**).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns assistant text (and optionally tool-use blocks). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "text": "<assistant message>",
  "model": "claude-3-5-sonnet-20241022",
  "usage": { "inputTokens": 0, "outputTokens": 0 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `anthropicApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| Missing `max_tokens` (API requires it) | Fail; node should send `maxTokens` option or a model default (**service docs** + **inferred**) |
| Anthropic rate limit (429) | Fail with rate-limit error (**inferred** from service docs) |
| Bad request / opaque provider error | Fail (**inferred**) |
| Network / timeout | Fail after `options.timeout`; retry up to `maxRetries` (**inferred** from sibling options) |
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
    "value": "claude-3-5-sonnet-20241022"
  },
  "options": {
    "maxTokens": 1024,
    "temperature": 0,
    "topP": 1
  }
}
```

**Credentials:** `anthropicApi` with valid `apiKey`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `/v1/messages` for `claude-3-5-sonnet-20241022` with `max_tokens` `1024`, `temperature` `0`, `top_p` `1`.

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.claude_model }}"
  },
  "options": {
    "maxTokens": 2000,
    "temperature": 0.2,
    "topK": 40
  }
}
```

**Given** parent/first-item context `{ "claude_model": "claude-3-opus-20240229" }`.

**Expect:** resolved model id `claude-3-opus-20240229` (**public JSON** pattern + sub-node first-item expression rule).

### Test: top K + top P both set

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "claude-3-haiku-20240307" },
  "options": { "maxTokens": 512, "topK": 5, "topP": 0.9 }
}
```

**Expect:** request includes both `top_k` `5` and `top_p` `0.9` (**documented** both options exist).

### Test: missing credentials

**Parameters:** valid `model`, no `anthropicApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

### Test: rate limit surfaces

**Given** provider returns rate-limit error (429).

**Expect:** node/parent fails with a clear error (not silent empty output) (**inferred** from service docs).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (maxTokens, temperature, topK, topP) | documented | Primary docs page |
| Credential type Anthropic API key + custom header | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `anthropicApi` | inferred | Naming convention + sibling `openAiApi`/`googleApi` |
| Parameter keys `model`, `options`, `maxTokens`, `temperature`, `topK`, `topP` | documented + public JSON | High confidence |
| Option keys `timeout`, `maxRetries` | inferred | Present on sibling `lmChat*` docs pages; not on Anthropic page |
| Model choices Claude / Claude Instant (legacy) | documented | Docs page; current model ids from Anthropic service docs |
| Default numeric values for temperature / retries / timeout | inferred / gap | Anthropic defaults + sibling examples; product defaults may differ |
| `system` role → top-level `system` param mapping | service docs | Anthropic API design |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| Common-issues page | gap | No common-issues page exists for this node (404) |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-anthropic.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatAnthropic` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Anthropic Messages API (`/v1/messages`) with credential-backed HTTP (`x-api-key` + `anthropic-version` headers) — do **not** load `@n8n/n8n-nodes-langchain` packages