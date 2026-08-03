---
type: @n8n/n8n-nodes-langchain.anthropic
displayName: Anthropic
category: Transform
versions: [1]
priority: high
status: specced
---

# Anthropic

Transform node for interacting with Anthropic AI models via the Anthropic API. Supports document/image analysis, file management, prompt engineering tools, and text completion with tool calling, code execution, and web search.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.anthropic.md | Public docs only |
| https://docs.anthropic.com/en/api/overview | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.anthropic`
- **Aliases:** none
- **Inputs:** `main` × 1, plus `ai_tool` (for Text → Message operation only)
- **Outputs:** `main` × 1
- **Credentials:** `anthropicApi` (required)

## Parameters

### Common

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options (document, file, image, prompt, text) | text | yes | — | Top-level resource selector |
| `operation` | options (varies by resource) | — | yes | `show: { resource: [...] }` | Operation within the selected resource |
| `modelId` | resourceLocator (list from API / custom ID) | — | yes | all operations | Anthropic model identifier (e.g., `claude-sonnet-4-6`, `claude-opus-4-6`) |

### Document → Analyze

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `text` | string (multiline) | "What's in this document?" | yes | `show: { resource: ['document'], operation: ['analyze'] }` | Prompt/question for the document |
| `inputType` | options (url, binary) | url | yes | `show: { resource: ['document'], operation: ['analyze'] }` | Input source for document(s) |
| `documentUrls` | string (comma-separated URLs) | — | when `inputType=url` | `show: { inputType: ['url'] }` | Document URL(s) to analyze |
| `binaryPropertyName` | string (comma-separated field names) | data | when `inputType=binary` | `show: { inputType: ['binary'] }` | Binary data field name(s) containing document(s) |
| `options.maxTokens` | number (≥1) | 1024 | no | `show: { resource: ['document'], operation: ['analyze'] }` | Max tokens for response |
| `simplify` | boolean | true | no | `show: { resource: ['document'], operation: ['analyze'] }` | Return simplified vs raw response |

### File → Upload

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `inputType` | options (url, binary) | url | yes | `show: { resource: ['file'], operation: ['upload'] }` | Input source for file |
| `fileUrl` | string | — | when `inputType=url` | `show: { inputType: ['url'] }` | File URL to upload |
| `binaryPropertyName` | string | data | when `inputType=binary` | `show: { inputType: ['binary'] }` | Binary data field name containing file |
| `options.fileName` | string | file | no | `show: { resource: ['file'], operation: ['upload'] }` | File name for uploaded file |

### File → Get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `fileId` | string | — | yes | `show: { resource: ['file'], operation: ['get'] }` | File ID to retrieve metadata for |

### File → List

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `returnAll` | boolean | false | no | `show: { resource: ['file'], operation: ['list'] }` | Return all files (paginated) |
| `limit` | number (1–1000) | 50 | when `returnAll=false` | `show: { returnAll: [false] }` | Max files to return |

### File → Delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `fileId` | string | — | yes | `show: { resource: ['file'], operation: ['deleteFile'] }` | File ID to delete |

### Image → Analyze

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `text` | string (multiline) | "What's in this image?" | yes | `show: { resource: ['image'], operation: ['analyze'] }` | Prompt/question for the image |
| `inputType` | options (url, binary) | url | yes | `show: { resource: ['image'], operation: ['analyze'] }` | Input source for image(s) |
| `imageUrls` | string (comma-separated URLs) | — | when `inputType=url` | `show: { inputType: ['url'] }` | Image URL(s) to analyze |
| `binaryPropertyName` | string (comma-separated field names) | data | when `inputType=binary` | `show: { inputType: ['binary'] }` | Binary data field name(s) containing image(s) |
| `options.maxTokens` | number (≥1) | 1024 | no | `show: { resource: ['image'], operation: ['analyze'] }` | Max tokens for response |
| `simplify` | boolean | true | no | `show: { resource: ['image'], operation: ['analyze'] }` | Return simplified vs raw response |

### Prompt → Generate

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `task` | string (multiline) | — | yes | `show: { resource: ['prompt'], operation: ['generate'] }` | Description of the prompt's purpose |
| `simplify` | boolean | true | no | `show: { resource: ['prompt'], operation: ['generate'] }` | Return simplified vs raw response |

### Prompt → Improve

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `messages` | fixedCollection (content + role) | [{ content: '', role: 'user' }] | yes | `show: { resource: ['prompt'], operation: ['improve'] }` | Messages constituting the prompt to improve |
| `options.system` | string | — | no | `show: { resource: ['prompt'], operation: ['improve'] }` | Existing system prompt to incorporate |
| `options.feedback` | string | — | no | `show: { resource: ['prompt'], operation: ['improve'] }` | Feedback for improving the prompt |
| `simplify` | boolean | true | no | `show: { resource: ['prompt'], operation: ['improve'] }` | Return simplified vs raw response |

### Prompt → Templatize

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `messages` | fixedCollection (content + role) | [{ content: '', role: 'user' }] | yes | `show: { resource: ['prompt'], operation: ['templatize'] }` | Messages constituting the prompt to templatize |
| `options.system` | string | — | no | `show: { resource: ['prompt'], operation: ['templatize'] }` | Existing system prompt to templatize |
| `simplify` | boolean | true | no | `show: { resource: ['prompt'], operation: ['templatize'] }` | Return simplified vs raw response |

> **Note:** Prompt operations (Generate/Improve/Templatize) use experimental Anthropic APIs (`/v1/experimental/*_prompt`) behind the `promptTools` beta header. Access must be requested from Anthropic.

### Text → Message

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `messages` | fixedCollection (content + role) | [{ content: '', role: 'user' }] | yes | `show: { resource: ['text'], operation: ['message'] }` | Conversation messages (user/assistant roles) |
| `addAttachments` | boolean | false | no | `show: { resource: ['text'], operation: ['message'] }` | Attach files/images to the message |
| `attachmentsInputType` | options (url, binary) | url | when `addAttachments=true` | `show: { addAttachments: [true] }` | Attachment input source |
| `attachmentsUrls` | string (comma-separated URLs) | — | when `addAttachments=true ∧ attachmentsInputType=url` | `show: { attachmentsInputType: ['url'] }` | Attachment URL(s) |
| `binaryPropertyName` | string (comma-separated field names) | data | when `addAttachments=true ∧ attachmentsInputType=binary` | `show: { attachmentsInputType: ['binary'] }` | Binary data field name(s) for attachments |
| `simplify` | boolean | true | no | `show: { resource: ['text'], operation: ['message'] }` | Return simplified vs raw response |
| `options.system` | string | — | no | `show: { resource: ['text'], operation: ['message'] }` | System prompt |
| `options.maxTokens` | number (≥1) | 1024 | no | `show: { resource: ['text'], operation: ['message'] }` | Max tokens for completion |
| `options.temperature` | number (0–1) | 1 | no | `show: { resource: ['text'], operation: ['message'] }` | Sampling temperature |
| `options.topP` | number (0–1) | 0.7 | no | `show: { resource: ['text'], operation: ['message'] }` | Top-p nucleus sampling |
| `options.topK` | number (≥0) | 5 | no | `show: { resource: ['text'], operation: ['message'] }` | Top-k sampling |
| `options.codeExecution` | boolean | false | no | `show: { resource: ['text'], operation: ['message'] }` | Enable code execution tool (model-dependent) |
| `options.webSearch` | boolean | false | no | `show: { resource: ['text'], operation: ['message'] }` | Enable web search tool |
| `options.maxUses` | number (≥0) | 5 | when `webSearch=true` | `show: { webSearch: [true] }` | Max web search uses per request |
| `options.allowedDomains` | string (comma-separated) | — | when `webSearch=true` | `show: { webSearch: [true] }` | Allowed domains for web search |
| `options.blockedDomains` | string (comma-separated) | — | when `webSearch=true` | `show: { webSearch: [true] }` | Blocked domains for web search |
| `options.includeMergedResponse` | boolean | false | no | `show: { resource: ['text'], operation: ['message'] }` | Include merged text response in output |
| `options.maxToolsIterations` | number (≥0) | 15 | no | `show: { resource: ['text'], operation: ['message'] }` | Max tool iteration cycles |

## Runtime behavior

### Input processing

- Each input item is processed independently (item-wise execution).
- Expression parameters (`modelId`, `text`, `documentUrls`, `imageUrls`, `fileUrl`, `fileId`, `task`, `messages[].content`, `options.system`, `options.feedback`, URLs, binary field names) are evaluated per item before API calls.
- `modelId` from resourceLocator: when mode is `list`, use the selected value; when mode is `id`, use the custom string. The `extractValue: true` semantics apply (read `.value` from `{ mode, value }` object).
- For binary inputs (`inputType=binary` or `attachmentsInputType=binary`):
  - Read binary data from the named field(s) on the input item.
  - Convert to base64 with media type for `document`/`image` analyze and text message attachments.
  - Upload to Anthropic Files API for file operations and code execution attachments.
- For URL inputs:
  - Download file/image/document from URL.
  - For text message attachments with regular (non-code-execution) mode: if URL is an Anthropic file URL (`/v1/files/{id}`), reference by file ID; otherwise download and send as base64 or URL source per media type.
  - For code execution attachments: upload external URLs to Files API first.
- For Text → Message with `addAttachments=false`: at least one non-empty message content is required.
- Connected `ai_tool` inputs (when resource=text, operation=message) are converted to Anthropic `custom` tool definitions with JSON schema from the tool's Zod schema.

### Output shape

- **Simplified mode** (`simplify=true`, default):
  - Document/Image Analyze: `{ content: [...] }` where content is array of content blocks (text, etc.)
  - File Upload/Get/List: `{ id, url, ...metadata }` with `url` = `{baseUrl}/v1/files/{id}`
  - File Delete: `{ deleted: true, id }` (per API response)
  - Prompt Generate/Improve: `{ messages: [...], system: "..." }` (Improve also returns improved system)
  - Prompt Templatize: `{ messages: [...], system: "...", variable_values: {...} }`
  - Text Message: `{ content: [...], merged_response?: "..." }` (merged when `includeMergedResponse=true`)
- **Raw mode** (`simplify=false`): Full Anthropic API response object, augmented with `merged_response` when applicable.
- All outputs include `pairedItem: { item: <input_index> }` for item tracing.

### Tool calling loop (Text → Message)

When the model returns `stop_reason: 'tool_use'`:
1. Append assistant message with tool_use blocks to conversation.
2. Invoke each matched connected tool with the tool input.
3. Append user message with `tool_result` blocks.
4. Repeat up to `maxToolsIterations` (default 15, 0 = unlimited).
5. Stop on `stop_reason: 'end_turn'` or `pause_turn` (max 3 pauses).

### Error handling

- Throw `NodeOperationError` for:
  - Missing required parameters (empty prompt/text, missing fileId, etc.)
  - Unsupported file types (only images and PDFs for analyze/attachments)
  - API errors (propagate Anthropic error response)
  - Binary data not found for named field
- Respect `continueOnFail` workflow setting: on failure, either throw (default) or emit error item and continue.
- Accumulate token usage (`input_tokens`, `output_tokens`) via `accumulateTokenUsage` helper when available in response.

### Expressions

All string parameters support n8n expressions (`{{ $json.field }}`, `{{ $parameter.x }}`, etc.). Evaluated per item before API call.

## Acceptance tests

### Test: Text Message basic

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "list", "value": "claude-sonnet-4-6" },
  "messages": { "values": [{ "content": "Say hello", "role": "user" }] },
  "simplify": true
}
```

**Expect** output[0]:
- Status success
- Output item has `json.content` array with at least one text block
- `json.merged_response` undefined (since `includeMergedResponse` not set)

### Test: Text Message with system prompt and options

**Given** input items:
```json
[{ "json": { "userQuery": "What is 2+2?" } }]
```

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "id", "value": "claude-sonnet-4-6" },
  "messages": { "values": [{ "content": "={{ $json.userQuery }}", "role": "user" }] },
  "options": {
    "system": "You are a concise math tutor.",
    "maxTokens": 100,
    "temperature": 0.2,
    "topP": 0.9,
    "topK": 10,
    "includeMergedResponse": true
  },
  "simplify": true
}
```

**Expect** output[0]:
- Request body sent to `/v1/messages` includes `model: "claude-sonnet-4-6"`, `system: "You are a concise math tutor."`, `max_tokens: 100`, `temperature: 0.2`, `top_p: 0.9`, `top_k: 10`
- Output `json.merged_response` is a non-empty string

### Test: Image Analyze with binary input

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "imageData": { "mimeType": "image/png", "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
  }
}]
```

**Parameters:**
```json
{
  "resource": "image",
  "operation": "analyze",
  "modelId": { "mode": "list", "value": "claude-sonnet-4-6" },
  "text": "Describe this image in one sentence.",
  "inputType": "binary",
  "binaryPropertyName": "imageData",
  "simplify": true
}
```

**Expect** output[0]:
- Request body to `/v1/messages` includes a message with `content` array containing:
  - An `image` block with `source: { type: "base64", media_type: "image/png", data: "<base64>" }`
  - A `text` block with the prompt
- Output `json.content` exists

### Test: Document Analyze with URL input

**Given** input items:
```json
[{ "json": { "docUrl": "https://example.com/document.pdf" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "analyze",
  "modelId": { "mode": "list", "value": "claude-sonnet-4-6" },
  "text": "Summarize this document.",
  "inputType": "url",
  "documentUrls": "={{ $json.docUrl }}",
  "simplify": true
}
```

**Expect** output[0]:
- Request body includes a `document` block with `source: { type: "url", url: "https://example.com/document.pdf" }`
- Output `json.content` exists

### Test: File Upload from binary

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "fileData": { "mimeType": "application/pdf", "data": "JVBERi0xLjQK..." }
  }
}]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "inputType": "binary",
  "binaryPropertyName": "fileData",
  "options": { "fileName": "report.pdf" }
}
```

**Expect** output[0]:
- File uploaded via multipart to `/v1/files`
- Output `json.id` exists (file ID)
- Output `json.url` equals `{baseUrl}/v1/files/{id}`

### Test: Prompt Improve with feedback

**Given** input items:
```json
[{ "json": { "prompt": "Write a poem about cats", "feedback": "Make it funnier" } }]
```

**Parameters:**
```json
{
  "resource": "prompt",
  "operation": "improve",
  "messages": { "values": [{ "content": "={{ $json.prompt }}", "role": "user" }] },
  "options": { "feedback": "={{ $json.feedback }}" },
  "simplify": true
}
```

**Expect** output[0]:
- Request to `/v1/experimental/improve_prompt` with `enableAnthropicBetas: { promptTools: true }`
- Body includes `messages`, `feedback`
- Output `json.messages` and `json.system` exist

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Model list endpoint / available models | inferred | Model list loaded via `modelSearch` method; exact models not in public docs |
| Exact Anthropic API version | documented | Uses `/v1/messages`, `/v1/files`, `/v1/experimental/*_prompt` |
| Supported file types for analyze/attachments | documented | Images (image/*) and PDFs (application/pdf) only |
| Code execution beta availability | documented | Model-dependent; enabled via `enableAnthropicBetas: { codeExecution: true }` |
| Web search beta availability | documented | Enabled via `web_search_20250305` tool type |
| Prompt tools (generate/improve/templatize) access | documented | Closed research preview; requires organization access request |
| Token usage accumulation | inferred | Uses n8n's `accumulateTokenUsage` helper when response has `usage` |
| `maxToolsIterations` default | documented | Default 15 per source; 0 = unlimited |
| Pause turn handling | inferred | Max 3 pause turns before breaking |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-langchain.anthropic.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only