---
type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini"
displayName: Google Gemini Chat Model
category: AI
versions: [1, 1.1, 1.2]
priority: high
status: specced
---

# Google Gemini Chat Model

Cluster **sub-node**: configures a Google Gemini chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node invokes the model with messages.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatgooglegemini.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/googleai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatGoogleGemini`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `googleApi` (**public JSON** key; docs: Google AI API key auth)
- **typeVersion:** public templates commonly use `1`, `1.1`, or `1.2`

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly and tool loops; this node provides model identity, sampling options, and auth.

## Parameters

Wire names from **public workflow JSON** where observed; UI labels from **public docs**. CamelCase for options not seen in exports is **inferred** from standard export naming + Google Generative Language API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list from Google AI account) | yes | — | **Model**. Public JSON uses resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Value is a model id such as `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash` (**documented** dynamic load + **public JSON**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| temperature | number | model default (often ~1) (**inferred**) | **Sampling Temperature** — higher = more random (**documented** + **public JSON**). |
| maxOutputTokens | number | unset / model default | **Maximum Number of Tokens** — completion length cap (**documented** + **public JSON** `maxOutputTokens`). Maps to Google `generationConfig.maxOutputTokens` (**service docs**). |
| topP | number | unset | Nucleus sampling mass; lower ignores less probable tokens (**documented**). |
| topK | number | unset | Top-K sampling — Gemini-specific (**documented** + **public JSON**). |
| safetySettings | fixedCollection / array | unset | **Safety Settings** — adjustable Gemini safety filters and levels (**documented**). Refer to Google's Gemini API safety settings for available filters/levels. Nested wire schema (per-category threshold) **inferred** / **gap** — not confirmed in sampled exports. |
| timeout | number | implementation default (templates use e.g. `120000`) | Max request time in **milliseconds** (**documented** + **public JSON**). |
| maxRetries | number | implementation default (**gap**) | Max times to retry a failed request (**documented**). |

## Credentials (`googleApi`)

From public credentials docs + public workflow credential references:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | Google AI API key; create in Google AI Studio (**documented**) |
| host | string | no | API **Host** URL; default `https://generativelanguage.googleapis.com` (**documented**). |

Auth header: `x-goog-api-key: <apiKey>` (**service docs**). Default base URL `https://generativelanguage.googleapis.com` (**documented**).

## Runtime behavior

### Role

1. Resolve credentials (`googleApi`). Missing/invalid key → fail when the parent invokes the model (**inferred** + credentials guidance).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST {baseUrl}/models/{model}:generateContent` (**service docs**).
   - Apply `options` as `generationConfig` (temperature, maxOutputTokens, topP, topK).
   - Auth via `x-goog-api-key` header.
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a message list (roles `system` | `user` | `assistant` | `tool`) at invoke time (**service docs** + agent/chain docs).
- Role mapping: `system` → Gemini `systemInstruction`; `user` → `user`; `assistant` → `model`; `tool` → **gap** (function-calling not yet implemented).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns assistant text (and optionally tool calls / structured output). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "text": "<assistant message>",
  "model": "gemini-1.5-flash",
  "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `googleApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| Google rate limit (429) | Error "rate limit exceeded"; mitigate with batching + Wait (**documented** common issues) |
| Bad request / opaque provider error | Fail; docs suggest HTTP Request for fuller error body (**documented**) |
| Network / timeout | Fail after `options.timeout`; retry up to `maxRetries` (**documented** options + **inferred** retry semantics) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Limitations

- **No proxy support:** the node uses Google's SDK, which doesn't support proxy configuration (**documented**). Workaround: set up a dedicated reverse proxy for Gemini requests and change the **Host** credential parameter to point to the proxy address (**documented**). Note: the credentials page warns custom hosts/proxies are not fully supported by related nodes — treat custom `host` as best-effort (**documented**).

### Expressions

- `model.value`, option numerics may be expressions (`={{ … }}`) (**public JSON**).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "gemini-1.5-flash"
  },
  "options": {
    "temperature": 0,
    "maxOutputTokens": 1024,
    "timeout": 120000
  }
}
```

**Credentials:** `googleApi` with valid `apiKey`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `generateContent` for `gemini-1.5-flash` with temperature `0` and max output tokens `1024`.

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.gemini_model }}"
  },
  "options": {
    "temperature": 0.2,
    "maxOutputTokens": 2000
  }
}
```

**Given** parent/first-item context `{ "gemini_model": "gemini-1.5-pro" }`.

**Expect:** resolved model id `gemini-1.5-pro` (**public JSON** pattern + sub-node first-item expression rule).

### Test: missing credentials

**Parameters:** valid `model`, no `googleApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

### Test: rate limit surfaces

**Given** provider returns rate-limit error (429).

**Expect:** node/parent fails with a clear error (not silent empty output); aligns with documented common issues.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list | documented | Primary docs page |
| Credential type Google AI API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs + common issues |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports |
| Parameter keys `model`, `options`, `temperature`, `maxOutputTokens`, `topP`, `topK`, `timeout` | public JSON | High confidence |
| Option key `maxRetries` | inferred | Docs label → camelCase; not heavily present in sampled templates |
| Safety Settings option existence | documented | Docs list it as a node option |
| Safety Settings nested wire schema (filters/levels) | gap | Docs link to Google safety settings; per-category threshold shape not in sampled exports |
| Credential `host` field + default base URL | documented | Credentials page |
| No proxy support limitation | documented | Node limitations section |
| Default numeric values for temperature / retries / timeout | inferred / gap | Google defaults + template examples; product defaults may differ |
| `tool` role message handling | gap | Function-calling not yet implemented |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas (1 → 1.1 → 1.2) | gap | Treat as additive |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-google-gemini.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Google Generative Language API `generateContent` with credential-backed HTTP — do **not** load `@n8n/n8n-nodes-langchain` packages