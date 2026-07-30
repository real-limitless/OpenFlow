---
type: "@n8n/n8n-nodes-langchain.lmChatOllama"
displayName: Ollama Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Ollama Chat Model

Cluster **sub-node**: configures an Ollama chat model (locally hosted or remote) and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node invokes the model with messages. Ollama is a self-hosted LLM runtime; the n8n docs direct users to LangChain's Ollama integration docs and the Ollama API docs for service behavior.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatollama.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ollama.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatollama/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://github.com/ollama/ollama/blob/main/docs/api.md | Third-party service API docs |
| https://ollama.com/library | Third-party service docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatOllama`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `ollamaApi` (**inferred** key from naming convention + sibling `openAiApi`/`anthropicApi`/`googleApi` patterns; docs: Ollama instance URL + optional API key)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly and tool loops; this node provides model identity, sampling options, and the Ollama endpoint/auth.

## Parameters

Wire names from **public workflow JSON** conventions + sibling `lmChat*` nodes; UI labels from **public docs**. The Ollama docs page is minimal (Model + 3 options); keys not on that page are **inferred** from sibling chat-model nodes and Ollama API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | resourceLocator / string | — (dynamic list) | yes | — | **Model**. Docs list choices **Llama2**, **Llama2 13B**, **Llama2 70B**, **Llama2 Uncensored** (legacy Llama 2 family) and direct users to the Ollama [Models Library](https://ollama.com/library) for more (**documented**). Public JSON / sibling nodes use resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<model-id>", "cachedResultName"?: "..." }`. Model names follow `model:tag` format, e.g. `llama3.2`, `llama3:70b`, `orca-mini:3b-q8_0`; tag defaults to `latest` (**service docs**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but risk of hallucinations (**documented**). Maps to Ollama `options.temperature` (**service docs**). |
| topK | number | unset | **Top K** — number of token choices the model uses to generate the next token (**documented**). Maps to Ollama `options.top_k` (**service docs**). |
| topP | number | unset | **Top P** — probability mass the completion should use; lower ignores less probable options (**documented**). Maps to Ollama `options.top_p` (**service docs**). |
| timeout | number | implementation default (**inferred**) | Max request time (**inferred** from sibling `lmChat*` nodes; not on this docs page). |
| maxRetries | number | implementation default (**gap**) | Max times to retry a failed request (**inferred** from sibling `lmChat*` nodes; not on this docs page). |

## Credentials (`ollamaApi`)

From public credentials docs + sibling credential patterns:

| field | type | required | notes |
|-------|------|----------|-------|
| baseUrl | string | yes | **Base URL** of the Ollama instance or remote authenticated Ollama instance. Default `http://localhost:11434`; if `OLLAMA_HOST` env var is set, use that value. For local-server issues try `127.0.0.1` instead of `localhost` (**documented**). |
| apiKey | string (secret) | no | Optional **API Key** for Bearer token authentication when connecting to a remote, authenticated proxy (e.g. Open WebUI). Leave empty if no auth is needed. When provided, sent as `Authorization: Bearer <apiKey>` (**documented**). |

Auth: no header when `apiKey` is empty (local unauthenticated Ollama); `Authorization: Bearer <apiKey>` when set (**documented**). Default base URL `http://localhost:11434` (**documented**). Ollama does **not** support custom HTTP/HTTPS proxies in its configuration (**documented** common issues).

## Runtime behavior

### Role

1. Resolve credentials (`ollamaApi`). Missing `baseUrl` → fail when the parent invokes the model (**inferred** + credentials docs). `apiKey` is optional (local Ollama needs none).
2. Resolve **model** id from `model` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Build a chat-model handle / client configuration:
   - Endpoint: `POST {baseUrl}/api/chat` (**service docs**).
   - Headers: `content-type: application/json`; `Authorization: Bearer <apiKey>` only when `apiKey` is set (**documented** + **service docs**).
   - Apply `options` into the Ollama request `options` object: `temperature` → `temperature`, `topK` → `top_k`, `topP` → `top_p` (**service docs**).
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list + **public JSON**).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a message list at invoke time (**service docs** + agent/chain docs).
- Role mapping: standard Ollama roles `system`, `user`, `assistant`, `tool` (**service docs**). The `message` object carries `role` + `content` (and optional `images`, `tool_calls`, `tool_name`).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Ollama `/api/chat` supports `tools` (function-calling) and `format` (JSON / JSON schema) at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns an assistant `message` (and optionally `tool_calls`). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "model": "llama3.2",
  "message": { "role": "assistant", "content": "<assistant message>" },
  "done": true,
  "total_duration": 5191566416,
  "load_duration": 2154458,
  "prompt_eval_count": 26,
  "eval_count": 298
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `ollamaApi` credential / `baseUrl` | Fail on invoke (**inferred** + credentials docs) |
| Missing / empty model id | Fail (**inferred**) |
| `ECONNREFUSED ::1:11434` (IPv6 vs IPv4) | Fail; fix by using `127.0.0.1` instead of `localhost` in base URL (**documented** common issues) |
| Can't connect to local Ollama in Docker | Fail; configure container networking / `host.docker.internal` / container name as host (**documented** common issues) |
| Can't connect to remote Ollama | Fail; ensure remote URL + API key (Bearer) are set for authenticated proxies (**documented** common issues) |
| Behind HTTP/HTTPS proxy | May not work; Ollama doesn't support custom HTTP agents (**documented** common issues) |
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
    "value": "llama3.2"
  },
  "options": {
    "temperature": 0,
    "topK": 40,
    "topP": 0.9
  }
}
```

**Credentials:** `ollamaApi` with `baseUrl` `http://localhost:11434`, no `apiKey`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST http://localhost:11434/api/chat` for `llama3.2` with `options.temperature` `0`, `options.top_k` `40`, `options.top_p` `0.9`; no `Authorization` header (local, no key).

### Test: resource locator id mode + expression model

**Parameters:**

```json
{
  "model": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.ollama_model }}"
  },
  "options": {
    "temperature": 0.2,
    "topP": 0.95
  }
}
```

**Given** parent/first-item context `{ "ollama_model": "llama3:70b" }`.

**Expect:** resolved model id `llama3:70b` (**public JSON** pattern + sub-node first-item expression rule + **service docs** `model:tag` format).

### Test: remote authenticated Ollama (Bearer token)

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "llama3.2" },
  "options": { "temperature": 0.7, "maxTokens": 512 }
}
```

**Credentials:** `ollamaApi` with `baseUrl` `https://ollama-proxy.example.com`, `apiKey` `sk-...`.

**Expect:** request to `POST https://ollama-proxy.example.com/api/chat` carries `Authorization: Bearer sk-...` header (**documented** Bearer auth for remote proxies).

### Test: top K + top P both set

**Parameters:**

```json
{
  "model": { "__rl": true, "mode": "list", "value": "llama2-uncensored" },
  "options": { "topK": 5, "topP": 0.9 }
}
```

**Expect:** request `options` includes both `top_k` `5` and `top_p` `0.9` (**documented** both options exist + **service docs** field names).

### Test: missing credentials

**Parameters:** valid `model`, no `ollamaApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model, options list (temperature, topK, topP) | documented | Primary docs page |
| Credential type Ollama instance URL + optional API key | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint + common-issues page |
| Bearer token auth for remote authenticated proxies | documented | Credentials page + common-issues page |
| Default base URL `http://localhost:11434` | documented | Credentials page |
| Docker / IPv6 / proxy connection issues | documented | Common-issues page |
| Channel name `ai_languageModel` | public JSON | Confirmed in template exports (sibling nodes) |
| Credential wire key `ollamaApi` | inferred | Naming convention + sibling `openAiApi`/`anthropicApi`/`googleApi` |
| Parameter keys `model`, `options` + 3 option keys | documented + inferred | Docs labels → camelCase; high confidence from Ollama API field names |
| Option keys `timeout`, `maxRetries` | inferred | Present on sibling `lmChat*` docs pages; not on Ollama page |
| Model choices Llama2 family (legacy) | documented | Docs page; Ollama Models Library has many more |
| Ollama `/api/chat` endpoint, `options` object, `model:tag` format | service docs | Ollama API documentation |
| Default numeric values for temperature / retries / timeout | inferred / gap | Ollama defaults + sibling examples; product defaults may differ |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-ollama.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatOllama` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Ollama Chat API (`POST {baseUrl}/api/chat`) with credential-backed HTTP (optional `Authorization: Bearer <apiKey>` for remote proxies; map `temperature`/`topK`/`topP` into the Ollama `options` object) — do **not** load `@n8n/n8n-nodes-langchain` packages