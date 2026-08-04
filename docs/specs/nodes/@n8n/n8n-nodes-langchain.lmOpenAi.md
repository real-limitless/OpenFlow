---
type: "@n8n/n8n-nodes-langchain.lmOpenAi"
displayName: OpenAI Model
category: AI
versions: [1]
priority: low
status: specced
---

# OpenAI Model (deprecated)

Cluster **sub-node**: configures an OpenAI **text completion** model and supplies it to a root node (Basic LLM Chain, etc.) on the `ai_languageModel` channel. This node is **deprecated** in favor of `@n8n/n8n-nodes-langchain.lmChatOpenAi` which uses the Chat Completions or Responses API.

It uses the OpenAI **Completions API** (legacy `/v1/completions` endpoint), which accepts a single prompt string (not a message list) and returns a text continuation. Models include `gpt-3.5-turbo-instruct`, `babbage-002`, `davinci-002`.

This node is **not compatible** with AI Agent, Guardrails (LLM-based checks), or other roots that require chat-model tool calling — it is excluded from their `ai_languageModel` connection filters.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmopenai/ | Public docs (404 — page removed after deprecation) |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai.md | Public docs only (successor node; deprecation notice confirmed) |
| https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| https://platform.openai.com/docs/api-reference/completions | Third-party service API docs |
| Published package descriptor (type shape only) | npm package metadata |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmOpenAi`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input
- **Credentials:** `openAiApi` (same credential type as the chat model)
- **typeVersion:** `1` only (single version, no upgrades)

Cluster topology: attached as a **sub-node** of a Chain or other root that accepts a text-completion (non-chat) language model. The parent supplies a prompt string; the model returns a text completion.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator | mode: `list`, value: `gpt-3.5-turbo-instruct` | yes | — | **Model**. Resource locator with two modes: *From List* (dynamic via `openAiModelSearch` method) or *ID* (string). Default model `gpt-3.5-turbo-instruct`. |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| baseURL | string | `https://api.openai.com/v1` | Override base URL for the API. Supports non-OpenAI endpoints. |
| frequencyPenalty | number | `0` | Range −2.0 to 2.0. Positive values penalize tokens based on frequency in text so far. |
| maxTokens | number | `-1` (model default) | Maximum number of tokens to generate. Model-dependent ceiling (older models: 2048, newer: up to 32768). |
| presencePenalty | number | `0` | Range −2.0 to 2.0. Positive values encourage new topics. |
| temperature | number | `0.7` | Range 0.0 to 1.0. Controls randomness; lower = more deterministic. |
| timeout | number | `60000` | Request timeout in milliseconds. |
| maxRetries | number | `2` | Maximum number of retry attempts on failure. |
| topP | number | `1` | Range 0.0 to 1.0. Nucleus sampling threshold. |

Note: unlike the Chat Model variant, this node has **no** `responsesApiEnabled`, `builtInTools`, `conversationId`, or Responses-specific options. It is a pure text-completion model.

## Credentials (`openAiApi`)

See the OpenAI Chat Model spec for the credential shape — same credential type:

| field | type | required | notes |
|-------|------|----------|-------|
| apiKey | string (secret) | yes | OpenAI API key |
| organizationId | string | no | Organization header for multi-org accounts |
| url | string | no | Base URL override; defaults to OpenAI API base |
| header / headerName / headerValue | boolean + strings | no | Optional custom HTTP header |

## Runtime behavior

### Role

1. Resolve credentials (`openAiApi`). Missing/invalid key → fail when parent invokes.
2. Resolve **model** id from `model` resource-locator (`.value`). Expressions allowed; as a sub-node, expressions resolve against the **first** input item only.
3. Build an OpenAI text-completion client configuration:
   - Endpoint: `/v1/completions` on the configured base URL.
   - Apply `options` (temperature, penalties, max tokens, timeout, retries, top_p, etc.).
4. Expose the model handle on `ai_languageModel` for the parent root to invoke.

### Prompt / completion

- This node has **no** top-level `prompt` / `text` parameter.
- The parent root (e.g. Basic LLM Chain) supplies the prompt string at invoke time.
- The model returns a text completion string (not message-based), with optional token usage stats.

### Output

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns a text string and optionally `finish_reason`. The **parent** maps the result into main-branch output.

Illustrative completion payload shape (OpenAI Completions API; not necessarily the node's main item):

```json
{
  "id": "cmpl-xxx",
  "object": "text_completion",
  "choices": [
    {
      "text": "<completion text>",
      "index": 0,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `openAiApi` credential / API key | Fail on invoke |
| Missing / empty model id | Fail |
| OpenAI rate limit / insufficient quota | Fail with provider error |
| Bad request / invalid model | Fail |
| Network / timeout | Fail after `options.timeout`; retry up to `maxRetries` |
| `continueOnFail` | Standard engine: surface error on item / continue |
| Connection to AI Agent or Guardrails root | Not supported — this node is excluded from chat-model connection filters |

### Expressions

- `model.value`, option numerics/strings may be expressions (`={{ … }}`).
- Sub-node rule: multi-item expressions use the **first** item.

## Acceptance tests

### Test: basic text completion

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "gpt-3.5-turbo-instruct"
  },
  "options": {
    "temperature": 0.7,
    "maxTokens": 256,
    "timeout": 60000
  }
}
```

**Credentials:** `openAiApi` with valid `apiKey`.

**Cluster:** connect this node's `ai_languageModel` → Basic LLM Chain `ai_languageModel`.

**Expect:** parent can invoke text completion on `gpt-3.5-turbo-instruct` with temperature 0.7, max 256 tokens; result is a text string (not a chat message).

### Test: model as resource-locator ID mode with expression

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.llm_model }}"
  },
  "options": {}
}
```

**Given** parent/first-item context `{ "llm_model": "gpt-3.5-turbo-instruct" }`.

**Expect:** resolved model id `gpt-3.5-turbo-instruct`.

### Test: custom base URL

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "list",
    "value": "my-custom-model"
  },
  "options": {
    "baseURL": "https://custom-endpoint.example.com/v1",
    "timeout": 120000
  }
}
```

**Expect:** requests go to `https://custom-endpoint.example.com/v1/completions` with 120s timeout.

### Test: missing credentials

**Parameters:** valid `model`, no `openAiApi` credential.

**Expect:** execution error when parent invokes the model.

### Test: connection to AI Agent is rejected

**Parameter set:** any valid config.

**Root node:** AI Agent (not Basic LLM Chain).

**Expect:** the agent's `ai_languageModel` filter excludes this node; it should not be connectable in the UI or should fail at runtime if forcibly wired.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, deprecation, hidden flag, sub-node role | published package descriptor | High confidence — confirmed from package metadata |
| Model parameter (resource locator, default `gpt-3.5-turbo-instruct`) | published package descriptor | High confidence |
| Options list (baseURL, frequencyPenalty, maxTokens, presencePenalty, temperature, timeout, maxRetries, topP) with defaults | published package descriptor | High confidence — exact values from descriptor |
| Default temperature 0.7, timeout 60000, maxRetries 2 | published package descriptor | High confidence |
| Credential type `openAiApi` | published package descriptor + public docs | High confidence |
| Exclusion from AI Agent / Guardrails chat-model filters | published package descriptor | High confidence — confirmed in multiple root-node filter lists |
| Inputs/outputs (none main → `ai_languageModel`) | published package descriptor | High confidence |
| Completions API endpoint `/v1/completions` | inferred | OpenAI API docs; the `requestDefaults.baseURL` and the non-chat nature confirm this |
| Error behavior, expression semantics | inferred | Standard n8n sub-node patterns |
| Public documentation URL (404) | documented | Page removed after deprecation |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmOpenAi` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register a text-completion language model provider on `ai_languageModel`. Call OpenAI `/v1/completions` with a prompt string (not messages). This node is **deprecated**; implement only if needed for backward compatibility with imported workflows that reference this type.
- **Priority:** low — the Chat Model variant (`lmChatOpenAi`) is the active replacement.
