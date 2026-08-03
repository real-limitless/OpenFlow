---
type: "@n8n/n8n-nodes-langchain.lmOllama"
displayName: Ollama Model
category: AI
versions: [1]
priority: high
status: specced
---

# Ollama Model

Cluster **sub-node** (**Text Completion Model**, not Chat Model): configures a locally-hosted Ollama text-completion model and supplies it to a root node (Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt — the parent root node assembles the prompt text and invokes the model for text completion. Use `lmChatOllama` instead when the parent requires a chat-style (messages array) interface.

This node lacks tool-calling support and will not work with the AI Agent node. Connect it with Basic LLM Chain (`@n8n/n8n-nodes-langchain.chainLlm`) instead.

Ollama runs locally; no cloud API key is needed unless connecting through an authenticated proxy. The node calls the Ollama REST API (`/api/generate`) to produce text completions.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmollama.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ollama.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://github.com/ollama/ollama/blob/main/docs/api.md | Third-party service API docs |
| https://ollama.com/library | Third-party service docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmOllama`
- **Aliases:** `LangChain`, `AI`, `local` (observed on the sibling Ollama app-node `@n8n/n8n-nodes-langchain.ollama`; not confirmed for this sub-node)
- **Inputs:** none on `main` (sub-node; no main-item pipeline)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input
- **Credentials:** `ollamaApi` (confirmed via package metadata + credentials docs)
- **typeVersion:** `1` (no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of a Chain root (e.g., Basic LLM Chain). The root drives prompt assembly and output mapping; this node provides model identity, generation options, and the Ollama connection.

## Parameters

Parameters are abstracted from public docs, the Ollama API, and the corpus descriptor. The public docs page lists 3 options; the full set below is drawn from the wider Ollama API and confirmed in the corpus descriptor.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | options / string | `llama3.2` | yes | — | **Model** — the Ollama model that generates the completion. Dynamically loaded from the Ollama API (`GET /api/tags`) at design time. Users may also type a model name not in the list. |
| options | collection | `{}` | no | — | Generation parameters. |

### options sub-parameters

The `options` collection covers sampling, inference, and hardware-tuning parameters that map to the Ollama `/api/generate` request body's `options` object.

| name | type | default | notes |
|------|------|---------|-------|
| temperature | number | 0.7 | **Sampling Temperature** — controls randomness. Lower = more focused/deterministic; higher = more diverse (range 0–1). |
| topK | number | -1 (disabled) | **Top K** — limits the number of highest-probability tokens to consider at each step. -1 disables. |
| topP | number | 1 | **Top P** — cumulative probability threshold for token selection. Lower = fewer options. |
| frequencyPenalty | number | 0 | **Frequency Penalty** — penalizes tokens already appearing in the generated text. Higher values discourage repetition. |
| presencePenalty | number | 0 | **Presence Penalty** — penalizes tokens based on their presence in the text so far. Encourages topic diversity. |
| repeatPenalty | number | 1 | **Repetition Penalty** — factor for repeating tokens. 1.0 = disabled; higher = stronger penalty. |
| numPredict | number | -1 (no limit) | **Max Tokens to Generate** — maximum tokens in the completion. -1 for no limit. |
| numCtx | number | 2048 | **Context Length** — maximum tokens of context for generating the next token. |
| numBatch | number | 512 | **Context Batch Size** — batch size for prompt processing. Larger = faster but more memory. |
| numThread | number | 0 (auto) | **Number of CPU Threads** — CPU threads for processing. 0 = auto-detect. |
| numGpu | number | -1 (auto) | **Number of GPUs** — GPUs for parallel processing. -1 = auto-detect. |
| mainGpu | number | 0 | **Main GPU ID** — primary GPU for computation. Change only for multi-GPU setups. |
| lowVram | boolean | false | **Low VRAM Mode** — reduces memory at cost of slower generation. Useful for limited GPU memory. |
| useMLock | boolean | false | **Use Memory Locking** — lock model in memory to prevent swapping. Requires sufficient RAM. |
| useMMap | boolean | true | **Use Memory Mapping** — memory-map model loading. Reduces RAM usage; keep enabled. |
| vocabOnly | boolean | false | **Load Vocabulary Only** — load only the model vocabulary without weights. For testing tokenization. |
| penalizeNewline | boolean | true | **Penalize Newlines** — discourages newline characters, encouraging continuous text. |
| think | boolean | true | **Enable Thinking** — for supported models, separates the thinking process from output. |
| format | options | `default` | **Output Format** — `default` (free text) or `json` (structured JSON response). |
| stop | string | "" | **Stop Sequences** — comma-separated strings that stop generation when encountered. |
| seed | number | 0 | **Seed** — random number seed for reproducible generation. 0 = random. |
| keepAlive | string | `5m` | **Keep Alive** — duration to keep loaded model in memory (e.g., `5m`, `1h30m`). |

## Credentials (`ollamaApi`)

From public credentials docs + corpus:

| field | type | required | notes |
|-------|------|----------|-------|
| baseUrl | string | yes | **Base URL** of the Ollama instance. Default: `http://localhost:11434`. May need `127.0.0.1` instead of `localhost` in containerized n8n. |
| apiKey | string (secret) | no | **API Key** — Bearer token for authenticated proxy connections (e.g., Open WebUI). Leave empty for local unauthenticated access. |

The node sends requests to `{baseUrl}/api/generate` (Ollama Generate API). If `apiKey` is set, it is sent as `Authorization: Bearer <apiKey>`.

## Runtime behavior

### Role

1. Resolve credentials (`ollamaApi`). Missing `baseUrl` → fail. The default `baseUrl` is `http://localhost:11434`.
2. Resolve **model** from the `model` parameter (string value from the dynamic model list or a user-typed model name). As a **sub-node**, expressions resolve against the **first** input item only.
3. Build a language-model handle / client configuration:
   - Endpoint: `POST {baseUrl}/api/generate`
   - Headers: `content-type: application/json`; optionally `Authorization: Bearer <apiKey>`
   - Prepare the request body:
     - `model`: the resolved model name
     - `prompt`: the prompt text (supplied by the parent root node)
     - `options`: the resolved `options` collection parameters mapped to Ollama option keys (`temperature`, `top_k`, `top_p`, `num_predict`, `num_ctx`, `stop`, `seed`, `repeat_penalty`, `frequency_penalty`, `presence_penalty`, `num_batch`, `num_thread`, `num_gpu`, `main_gpu`, `low_vram`, `use_mlock`, `use_mmap`, `vocab_only`, `penalize_newline`, `min_p`, `keep_alive`)
     - `stream`: `false` (node operates in non-streaming mode)
     - `format`: if set to `json`, includes `"format": "json"` in the request
     - `system`: the `system` option value (system message / context prompt)
4. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items by itself in the cluster pattern.

### Messages / Prompt

- This is a **text completion** model (not chat). The parent (e.g., Basic LLM Chain) supplies a single `prompt` string, not a messages array.
- The `system` option provides a system-level context prompt that the Ollama `/api/generate` endpoint accepts alongside the main prompt.

### Output

When used as a language-model sub-node:
- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model calls `POST /api/generate` and returns the Ollama generate response. The **parent** maps the `response` field into main-branch outputs.
- Standalone unit tests may treat the executor as returning a model descriptor or a completion object.

Illustrative Ollama `/api/generate` response shape:

```json
{
  "model": "llama3.2",
  "created_at": "2025-01-01T00:00:00.000000Z",
  "response": "The generated text completion...",
  "done": true,
  "done_reason": "stop",
  "context": [1, 2, 3, ...],
  "total_duration": 1000000000,
  "load_duration": 100000000,
  "prompt_eval_count": 50,
  "eval_count": 200,
  "eval_duration": 800000000
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `ollamaApi` credential / `baseUrl` | Fail on invoke |
| Missing / empty model | Fail |
| Ollama server not running / unreachable | Fail (connection refused / timeout) |
| Invalid model name | Fail (HTTP 404 from Ollama) |
| Invalid API key (authenticated proxy) | Fail (HTTP 401) |
| Rate limit / proxy throttling | Fail; may be retryable |
| `continueOnFail` | Standard engine: surface error on item / continue |

### Expressions

- `model` parameter, option numerics, and strings may be expressions (`={{ … }}`).
- Sub-node rule: multi-item expressions always use the **first** item.

## Acceptance tests

### Test: basic text completion

**Credentials:** `ollamaApi` with `baseUrl` `http://localhost:11434`, no `apiKey`.

**Parameters:**

```json
{
  "model": "llama3.2",
  "options": {
    "temperature": 0.7,
    "numPredict": 100
  }
}
```

**Cluster:** connect this node's `ai_languageModel` → Basic LLM Chain `ai_languageModel` with prompt `"What is the capital of France?"`.

**Expect:** parent invokes `POST http://localhost:11434/api/generate` with `{"model":"llama3.2","prompt":"What is the capital of France?","options":{"temperature":0.7,"num_predict":100},"stream":false}`. Response contains `response` with text about Paris.

### Test: JSON output format

**Parameters:**

```json
{
  "model": "llama3.2",
  "options": {
    "format": "json",
    "temperature": 0.3
  }
}
```

**Expect:** request body includes `"format": "json"`. Response `response` field contains valid JSON text.

### Test: authenticated proxy

**Credentials:** `ollamaApi` with `baseUrl` `https://my-ollama-proxy.example.com`, `apiKey` `bearer-token-value`.

**Parameters:**

```json
{
  "model": "llama3.2",
  "options": {}
}
```

**Expect:** request to `https://my-ollama-proxy.example.com/api/generate` carries header `Authorization: Bearer bearer-token-value`.

### Test: model loaded from dynamic list

**Parameters:**

```json
{
  "model": "llama3.2:70b",
  "options": {}
}
```

**Expect:** the `model` field in the `/api/generate` request body is `"llama3.2:70b"` as specified.

### Test: sub-node first-item expression

**Given** parent/first-item context `{ "ollama_model": "llama3.2", "temperature_override": 0.5 }`.

**Parameters:**

```json
{
  "model": "={{ $json.ollama_model }}",
  "options": {
    "temperature": "={{ $json.temperature_override }}"
  }
}
```

**Expect:** resolved model name `llama3.2`, resolved temperature `0.5` in the request.

### Test: missing credentials

**Parameters:** valid `model`, no `ollamaApi` credential.

**Expect:** execution error when parent invokes the model.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Model parameter, 3 basic options (Temperature, Top K, Top P) | documented | Primary docs page |
| Credential: baseUrl + optional apiKey; default `http://localhost:11434` | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from Ollama `/api/tags` | public JSON + corpus | Confirmed via descriptor |
| Output channel `ai_languageModel` | public JSON | Sibling node exports |
| Credential wire key `ollamaApi` | inferred + corpus | Package metadata credential list |
| Parameter keys `model`, `options` + all option keys | corpus | Extracted from descriptor; mapped to Ollama API camelCase |
| Full set of `options` sub-parameters beyond 3 documented | corpus | The public docs list only 3 options; the corpus reveals the full set |
| Default values for options (temperature 0.7, numCtx 2048, etc.) | corpus | Taken from descriptor defaults |
| Ollama `/api/generate` endpoint contract | service docs | Ollama API docs |
| Non-streaming mode (`stream: false`) | inferred | Sub-nodes for LLM chains typically use non-streaming |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| `typeVersion` behavior deltas | gap | Only v1 observed |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-ollama.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmOllama` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for chain roots; call Ollama `/api/generate` (`POST {baseUrl}/api/generate`) with the resolved model, prompt (from parent), and options. Map option names to Ollama API snake_case keys (`temperature`, `top_k`, `num_predict`, `num_ctx`, etc.). Credential `baseUrl` defaults to `http://localhost:11434`. Do **not** load `@n8n/n8n-nodes-langchain` packages.
