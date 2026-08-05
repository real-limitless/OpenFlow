---
type: "@n8n/n8n-nodes-langchain.ollama"
displayName: Ollama
category: AI
versions: [1]
priority: high
status: specced
---

# Ollama

Multi-resource AI app node that interacts with a local or remote Ollama instance via its REST API. Supports text chat (with tool calling) and image analysis. Can be used as an AI agent tool (`usableAsTool: true`).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.ollama/ | Public docs only (404 — inferred from codex primaryDocumentation URL in node descriptor) |
| https://docs.n8n.io/integrations/builtin/credentials/ollama/ | Public docs only |
| https://docs.ollama.com/api/chat | Third-party service API docs |
| https://docs.ollama.com/integrations/n8n | Third-party service docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.ollama`
- **Aliases:** `LangChain`, `image`, `vision`, `AI`, `local`
- **Inputs:** `main` × 1 (all operations); `main` + `ai_tool` × 1 when resource=text, operation=message (tool-mode)
- **Outputs:** `main` × 1
- **Credentials:** `ollamaApi` (required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `text` | no | — | One of: `text`, `image` |
| operation | options | (per resource) | no | depends on resource | `text` → `message`; `image` → `analyze` |
| modelId | resourceLocator | list mode, empty value | yes | all | Dynamic list from Ollama `/api/tags` via `modelSearch` method, or raw model ID string |
| text | string | `"What's in this image?"` | no | image→analyze | Prompt for image analysis |
| inputType | options | `binary` | no | image→analyze | Source of image: `binary` or `url` |
| binaryPropertyName | string | `data` | no | image→analyze, inputType=binary | Binary field name(s) containing image data; comma-separated for multiple |
| imageUrls | string | `""` | no | image→analyze, inputType=url | Comma-separated image URLs |
| simplify | boolean | `true` | no | image→analyze, text→message | Return simplified output vs raw API response |
| messages | fixedCollection | `[{content:"", role:"user"}]` | no | text→message | Message history; each entry has `content` (string) and `role` (user/assistant) |
| options | collection | `{}` | no | all | Generation options (see sub-section) |

### Options sub-parameters

Shared across both resources; identical sets with matching defaults.

| name | type | default | notes |
|------|------|---------|-------|
| system | string | `""` | System message to set conversation context |
| temperature | number | 0.8 | Randomness control (0–2) |
| think | boolean | true | Enable thinking mode for supported models; separates reasoning trace from output |
| top_p | number | 0.7 | Nucleus sampling cumulative threshold (0–1) |
| top_k | number | 40 | Top-k token selection limit |
| num_predict | number | 1024 | Max tokens to generate |
| frequency_penalty | number | 0 | Penalty for already-appeared tokens; discourages repetition |
| presence_penalty | number | 0 | Penalty based on token presence; encourages topic diversity |
| repeat_penalty | number | 1.1 | Repetition penalty factor |
| num_ctx | number | 4096 | Context window size (tokens) |
| repeat_last_n | number | 64 | Lookback window for repetition prevention; -1 = num_ctx, 0 = disabled |
| min_p | number | 0 | Minimum token probability relative to most likely token |
| seed | number | 0 | Random seed for reproducibility; 0 = random |
| stop | string | `""` | Comma-separated stop sequences |
| keep_alive | string | `"5m"` | Duration to keep model in memory after use (e.g. `1h30m`) |
| low_vram | boolean | false | Low VRAM mode; reduces memory at cost of speed |
| main_gpu | number | 0 | Main GPU ID for multi-GPU setups |
| num_batch | number | 512 | Batch size for prompt processing |
| num_gpu | number | -1 | Number of GPUs; -1 = auto-detect |
| num_thread | number | 0 | CPU threads; 0 = auto-detect |
| penalize_newline | boolean | true | Discourage newline characters in output |
| use_mlock | boolean | false | Lock model in memory to prevent swapping |
| use_mmap | boolean | true | Use memory mapping for model loading |
| vocab_only | boolean | false | Load vocabulary only (for testing tokenization) |
| format | options | `""` (default) | Output format: `""` (free text) or `json` (structured JSON) |

## Credentials (`ollamaApi`)

| field | type | required | notes |
|-------|------|----------|-------|
| baseUrl | string | yes | Ollama instance URL. Default `http://localhost:11434`. Use `http://host.docker.internal:11434` from Docker containers. |
| apiKey | string (secret) | no | Bearer token for authenticated proxies (e.g. ollama.com). Sent as `Authorization: Bearer <apiKey>`. Leave empty for local access. |

## Runtime behavior

### Resource / operation matrix

| resource | operation | behavior summary |
|----------|-----------|------------------|
| text | message | Sends a multi-turn chat to an Ollama model via `POST /api/chat`. Accepts structured message history (user/assistant roles). When connected to `ai_tool` input, tool sub-nodes are converted to Ollama function definitions and attached to the request. Supports attachments (images via base64 in message images field). |
| image | analyze | Takes image(s) via binary field or URL, sends them to an Ollama vision model along with a text prompt. Images are base64-encoded into the message's `images` array. Calls `POST /api/chat` with multimodal messages. |

### Input processing

- **text→message:** Accepts a `messages` fixed collection of content+role pairs. The node builds a message array for the Ollama `/api/chat` request. The `system` option is mapped to a system-role message. When `simplify` is true, the output is the assistant's content as a structured object; when false, the full Ollama `/api/chat` response is returned.
- **image→analyze:** Accepts images as binary payloads (field name in `binaryPropertyName`) or URLs (comma-separated in `imageUrls`). Images are base64-encoded and placed in the `images` array of the user message.
- **Tool mode (text→message):** When the node receives a connected `ai_tool` input (from an AI Agent or other root node), it converts tool sub-nodes into Ollama `tools` array entries (type `function` with name, description, and JSON Schema parameters). The model may respond with `tool_calls` in the message; the executor invokes each tool and feeds results back in a loop until a final text response is produced.
- All string-type parameters and option values support n8n expressions (`={{ … }}`).

### API contract

The node calls `POST {baseUrl}/api/chat` with:

- `model`: resolved model ID from `modelId` parameter
- `messages`: array of `{ role, content, images? }` objects
- `options`: mapped option parameters (keys in Ollama snake_case: `temperature`, `top_k`, `num_predict`, etc.)
- `stream`: `false` (non-streaming mode)
- `tools`: optional array of function definitions (when `ai_tool` input is connected)
- `format`: `"json"` when `options.format` is set to `json`

### Output shape

- **text→message (simplified, default):** Each output item contains `{ messages: [{ role, content }], model, usage }` where `messages` contains the assistant's text response.
- **text→message (raw):** Full Ollama `/api/chat` response including `model`, `created_at`, `message` (role, content, optional tool_calls), `done`, `done_reason`, `total_duration`, `load_duration`, `prompt_eval_count`, `eval_count`, `eval_duration`.
- **image→analyze (simplified):** Same simplified shape as text→message — the assistant's content describing the image.
- **image→analyze (raw):** Full Ollama `/api/chat` response.

### Model listing

The `modelId` resource locator uses a `modelSearch` list-search method that calls `GET {baseUrl}/api/tags` at design time to populate the model dropdown. Users can also type a custom model name in "ID" mode.

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `ollamaApi` credential | Fail |
| Missing / empty `modelId` | Fail |
| Ollama server unreachable | Fail (connection refused / timeout) |
| Invalid model name | Fail (HTTP 404 from Ollama `/api/chat`) |
| Invalid API key (authenticated proxy) | Fail (HTTP 401) |
| Image decode / binary field missing | Fail |
| Tool invocation error | Fail on the current execution branch |
| `continueOnFail` | Standard engine: surface error on item / continue |

## Acceptance tests

### Test: text→message basic chat

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "id", "value": "llama3.2" },
  "messages": { "values": [{ "content": "What is the capital of France?", "role": "user" }] },
  "simplify": true
}
```

**Expect** output[0] to contain:
- `json.messages` array with at least one entry
- `json.messages[0].role` equal to `"assistant"`
- `json.messages[0].content` to be a non-empty string mentioning Paris

### Test: image→analyze with URL

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "image",
  "operation": "analyze",
  "modelId": { "mode": "id", "value": "llama3.2-vision" },
  "text": "What's in this image?",
  "inputType": "url",
  "imageUrls": "https://example.com/test.png",
  "simplify": true
}
```

**Expect** output[0] to contain a non-empty content field describing the image.

### Test: text→message with tool input

**Given** input item:
```json
[{ "json": {} }]
```
and a connected tool sub-node on the `ai_tool` input.

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "id", "value": "qwen3" },
  "messages": { "values": [{ "content": "What is the weather in Paris?", "role": "user" }] }
}
```

**Expect** the model to invoke the connected tool(s), produce `tool_calls` in the message, and return a final assistant response incorporating tool results.

### Test: options passthrough

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "id", "value": "llama3.2" },
  "messages": { "values": [{ "content": "Hi", "role": "user" }] },
  "options": {
    "temperature": 0.3,
    "num_predict": 200,
    "seed": 42,
    "format": "json"
  }
}
```

**Expect** the `/api/chat` request body to include `options.temperature: 0.3`, `options.num_predict: 200`, `options.seed: 42`, and `format: "json"`.

### Test: image→analyze with binary input

**Given** input item with `data` binary field containing a PNG image.

**Parameters:**
```json
{
  "resource": "image",
  "operation": "analyze",
  "modelId": { "mode": "id", "value": "llava" },
  "text": "Describe this image",
  "inputType": "binary",
  "binaryPropertyName": "data"
}
```

**Expect** the `/api/chat` request to include a message with the image base64-encoded in the `images` array.

### Test: missing credentials

**Parameters:** valid parameters, no `ollamaApi` credential.

**Expect:** execution error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, resource/operation matrix, credentials | documented | Public n8n credentials page documents `ollamaApi`; node descriptor confirms structure |
| Parameters: resource, operation, modelId, text, inputType, options, simplify, messages | corpus | Extracted from type descriptor; mapped to Ollama `/api/chat` |
| `modelSearch` method for dynamic model listing | corpus | Confirmed via listSearch methods declaration |
| Aliases (LangChain, image, vision, AI, local) | corpus | From `codex.alias` in node type descriptor |
| `usableAsTool: true` + `ai_tool` input | corpus | From `inputs` expression and `usableAsTool` property |
| Tool calling protocol (function definitions) | inferred from Ollama API | Ollama `/api/chat` supports `tools` array with `type: "function"` |
| Image attachments via base64 in messages | inferred | Standard Ollama multimodal message format |
| Full options collection (25+ parameters) | corpus | Extracted from type descriptor; matches Ollama API options |
| Output `simplify` boolean and shape | corpus | Confirmed via `simplify` property with image and text display options |
| No dedicated public docs page exists | documented | The source URL returns 404; the node type descriptor references a path that doesn't resolve |

## OpenFlow mapping

- **Definition group:** `ai` / langchain vendor app nodes
- **Executor file:** `src/lib/engine/executors/ollama-app.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.ollama` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
