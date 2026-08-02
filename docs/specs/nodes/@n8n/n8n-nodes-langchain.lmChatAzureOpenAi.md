---
type: "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi"
displayName: Azure OpenAI Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Azure OpenAI Chat Model

Cluster **sub-node**: configures an Azure OpenAI-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. Azure OpenAI exposes an OpenAI-compatible Chat Completions REST API over a resource-specific base URL; the n8n docs point users at Microsoft's Azure OpenAI REST reference for the service contract and at the LangChain JS Azure integration for background.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatazureopenai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/azureopenai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://learn.microsoft.com/en-us/azure/ai-services/openai/reference | Third-party service API docs |
| https://js.langchain.com/docs/integrations/chat/azure | Third-party service docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatAzureOpenAi`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `azureOpenAiApi` (**inferred** key from package metadata credential list `AzureOpenAiApi.credentials.js` + sibling `groqApi`/`openAiApi` naming; docs: "Azure OpenAI credentials")
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, and the Azure OpenAI resource authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and Azure OpenAI REST field names. The Azure OpenAI docs page is minimal (Model + 8 options); keys not on that page are **inferred** from sibling chat-model nodes and the Azure OpenAI Chat Completions API.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (selectable) | yes | — | **Model** — the model that generates the completion. For Azure OpenAI, the **deployment name** of the deployed model is used as the model name (**documented** credentials hint: "use the Deployment name as the model name"). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<deployment-id>", "cachedResultName"?: "..." }`. |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| frequencyPenalty | number | model default (**inferred**) | **Frequency Penalty** — controls the chance of the model repeating itself; higher values reduce repetition (**documented**). Maps to `frequency_penalty` (**service docs**). |
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to `max_tokens` (**service docs**). |
| responseFormat | options `text`\|`json` | `text` (**inferred**) | **Response Format** — choose **Text** or **JSON**; **JSON** ensures the model returns valid JSON (**documented**). Maps to `response_format` (`json_object` when JSON) (**service docs**). |
| presencePenalty | number | model default (**inferred**) | **Presence Penalty** — controls the chance of the model talking about new topics; higher values increase it (**documented**). Maps to `presence_penalty` (**service docs**). |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of sampling; higher = more diverse but higher hallucination risk (**documented**). Maps to `temperature` (**service docs**). |
| timeout | number | client default (**inferred**) | **Timeout** — maximum request time in milliseconds (**documented**). HTTP client request timeout, not a request body field (**inferred**). |
| maxRetries | number | client default (**inferred**) | **Max Retries** — maximum number of times to retry a request (**documented**). HTTP client retry policy, not a request body field (**inferred**). |
| topP | number | model default (**inferred**) | **Top P** — probability mass the completion should use; lower values ignore less probable options (**documented**). Maps to `top_p` (**service docs**). |

## Credentials (`azureOpenAiApi`)

From public credentials docs (API key method — **documented**):

| field | type | required | notes |
|-------|------|----------|-------|
| resourceName | string | yes | **Resource Name** — the name given to the Azure OpenAI resource; composes the endpoint hostname `https://{resourceName}.openai.azure.com` (**documented** + service docs). |
| apiKey | string (secret) | yes | **API key** — Key 1 from the resource's **Keys and Endpoint** blade; sent as the `api-key` request header (**documented** + service docs). |
| apiVersion | string | yes | **API Version** — e.g. `2024-06-01`; sent as the `api-version` query parameter; see the Azure OpenAI API version lifecycle (**documented** + service docs). |

An alternative **Azure Entra ID (OAuth2)** method is **documented**: n8n Cloud users just connect their account; self-hosted users register an application with the Microsoft Identity Platform and configure client ID + client secret (+ optional custom scopes). Token auth uses an `Authorization: Bearer <token>` header (**service docs**). The exact OAuth2 wire field names are **inferred** (standard `clientId`/`clientSecret`/`scope` shape).

## Runtime behavior

### Role

1. Resolve credentials (`azureOpenAiApi`). Missing credential/API key → fail when the parent invokes the model (**inferred** + credentials docs).
2. Build the service base URL `https://{resourceName}.openai.azure.com` and pin `api-version` from the credential (**documented** + service docs).
3. Resolve **model** id from `model` (string or resource-locator `.value`) — this is the Azure **deployment name** (**documented**). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
4. Build a chat-model handle / client configuration:
   - Endpoint: `POST https://{resourceName}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}` (**service docs**).
   - Headers: `content-type: application/json`; `api-key: <apiKey>` (or `Authorization: Bearer <token>` for Entra ID) (**service docs**).
   - Apply `options` into the request body: `frequencyPenalty` → `frequency_penalty`, `maxTokens` → `max_tokens`, `presencePenalty` → `presence_penalty`, `temperature` → `temperature`, `topP` → `top_p`, `responseFormat` → `response_format` (`{"type":"json_object"}` when JSON). `timeout`/`maxRetries` configure the HTTP client, not the request body (**service docs** + inferred).
5. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept an OpenAI-style `messages` array at invoke time (**service docs** + agent/chain docs).
- Message roles: `system`, `user`, `assistant`, `tool` (**service docs**; OpenAI-compatible).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- The Chat Completions endpoint supports `tools` (function/tool calling) and `response_format` / structured outputs at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

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
  "model": "gpt-4o",
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
| Missing `azureOpenAiApi` credential / API key | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model (deployment) id | Fail (**inferred**) |
| Missing / invalid `api-version` | Fail; API version is required and versioned (`YYYY-MM-DD`) (**service docs**) |
| Invalid / unauthorized API key | Fail (HTTP 401) (**service docs**) |
| Content filter rejection (ResponsibleAI policy violation) | Fail; surfaced as an API error (**service docs** error code) |
| Rate limit / quota exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions) |
| Bad request / opaque provider error | Fail (**inferred**) |
| Network / timeout | Fail after timeout; retry up to maxRetries (**documented** options) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |
| Proxy | `NO_PROXY` env var is **not** supported by this node (**documented** proxy limitation) |

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
    "value": "gpt-4o"
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

**Credentials:** `azureOpenAiApi` with `resourceName` `my-openai-resource`, `apiKey` `sk-azure-...`, `apiVersion` `2024-06-01`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST https://my-openai-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-06-01` with body fields `max_tokens` `1024`, `temperature` `0.7`, `top_p` `0.9`, `frequency_penalty` `0`, `presence_penalty` `0`; request carries `api-key: sk-azure-...` (**service docs**).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.azure_deployment }}"
  },
  "options": {}
}
```

**Given** parent/first-item context `{ "azure_deployment": "gpt-4o-mini" }`.

**Expect:** resolved deployment id `gpt-4o-mini` used in the request path (**public JSON** pattern + sub-node first-item expression rule).

### Test: response format JSON

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "gpt-4o" },
  "options": { "responseFormat": "json" }
}
```

**Expect:** request body `response_format` is set to `{ "type": "json_object" }` so the model returns valid JSON (**documented** option + service docs).

### Test: multi-turn messages passed through

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "gpt-4o" },
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

**Parameters:** valid `model`, no `azureOpenAiApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model parameter, options list (Frequency Penalty, Maximum Number of Tokens, Response Format, Presence Penalty, Sampling Temperature, Timeout, Max Retries, Top P) | documented | Primary docs page |
| Credentials: Resource Name, API key, API Version; Entra ID (OAuth2) alternative | documented | Credentials page |
| Model name = Azure deployment name | documented | Credentials page hint |
| `NO_PROXY` unsupported | documented | Docs proxy limitations |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Endpoint `https://{resourceName}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...`; `api-key` vs `Authorization: Bearer` auth | service docs | Azure OpenAI REST reference |
| Request field mapping (`frequency_penalty`, `max_tokens`, `presence_penalty`, `temperature`, `top_p`, `response_format`); content-filter error | service docs | Azure OpenAI REST reference |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `azureOpenAiApi` | inferred | Package metadata credential list + naming convention |
| Parameter keys `model`, `options` + option keys `maxTokens`, `temperature`, `topP`, `frequencyPenalty`, `presencePenalty`, `responseFormat`, `timeout`, `maxRetries` | documented + inferred | Docs labels → camelCase; high confidence from Azure API field names |
| `model` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default numeric values for temperature / maxTokens / penalties / topP / timeouts / retries; `responseFormat` default | inferred / gap | Azure + sibling defaults; product defaults may differ |
| Exact OAuth2 (Entra ID) credential wire fields | inferred | Standard client ID/secret/scope shape |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-azure-openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatAzureOpenAi` in `executors/index.ts` `BUILTIN_EXECUTOR_MODULES` (and its dynamic import list) so `register-builtins.ts` registers it
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call `POST https://{resourceName}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}` with `api-key: <apiKey>` (or Entra bearer token) and map options into `frequency_penalty`/`max_tokens`/`presence_penalty`/`temperature`/`top_p`/`response_format` — do **not** load `@n8n/n8n-nodes-langchain` or `@langchain/openai` packages
