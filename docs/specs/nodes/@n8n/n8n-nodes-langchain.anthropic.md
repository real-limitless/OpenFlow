---
type: @n8n/n8n-nodes-langchain.anthropic
displayName: Anthropic
category: AI
versions: [1]
priority: high
status: specced
---

# Anthropic Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.anthropic/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/anthropic/ | Public docs only |
| https://docs.anthropic.com/en/api/overview | Public docs only |

## Wire format

- **Type string:** `anthropic` (alias: `@n8n/n8n-nodes-langchain.anthropic`)
- **Aliases:** LangChain, document, image, assistant, claude
- **Inputs:** `main` × 1 (all operations); `main` + `ai_tool` × 1 when resource=text, operation=message (tool-mode)
- **Outputs:** `main` × 1
- **Credentials:** `anthropicApi` (API key, required)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `text` | yes | One of: `document`, `file`, `image`, `prompt`, `text` |
| operation | options | (per resource) | yes | Determined by resource; see runtime behavior |
| modelId | resourceLocator | list mode | yes | Dynamic list from Anthropic API via `modelSearch` method, or raw model ID string |
| text | string | varies | no | Prompt text for analyze/message operations |
| messages | fixedCollection | [{content:"", role:"user"}] | no | Message history with content + role (user/assistant); used by text→message and prompt→improve/templatize |
| simplify | boolean | true | no | Whether to return a simplified response instead of raw API output |
| inputType | options | `url` | no | Source of media: `url` or `binary`; used by document, image, file resources |
| documentUrls | string | "" | no | Comma-separated URLs for document analysis |
| imageUrls | string | "" | no | Comma-separated URLs for image analysis |
| fileUrl | string | "" | no | Single URL for file upload |
| binaryPropertyName | string | `data` | no | Binary input field name for binary-mode attachments |
| addAttachments | boolean | false | no | Whether to attach files to a text→message request |
| attachmentsInputType | options | `url` | no | URL or binary for message attachments |
| attachmentsUrls | string | "" | no | Comma-separated URLs for message attachments |
| fileId | string | "" | no | File identifier for file→get or file→deleteFile |
| returnAll | boolean | false | no | Pagination mode for file→list |
| limit | number | 50 | no | Max results for file→list (1-1000) |
| task | string | "" | no | Task description for prompt→generate |
| options.system | string | "" | no | System message / system prompt |
| options.maxTokens | number | 1024 | no | Max tokens in completion |
| options.temperature | number | 1 | no | Sampling temperature (0-1, step 0.1) |
| options.topP | number | 0.7 | no | Top-p nucleus sampling (0-1, step 0.1) |
| options.topK | number | 5 | no | Top-k token selection |
| options.includeMergedResponse | boolean | false | no | Include a single merged text output string |
| options.codeExecution | boolean | false | no | Enable Anthropic code execution tool |
| options.webSearch | boolean | false | no | Enable Anthropic web search tool |
| options.maxUses | number | 5 | no | Max web search invocations per request |
| options.allowedDomains | string | "" | no | Comma-separated allowed search domains |
| options.blockedDomains | string | "" | no | Comma-separated blocked search domains |
| options.maxToolsIterations | number | 15 | no | Max tool call iteration cycles (0 = unlimited) |
| options.feedback | string | "" | no | Feedback text for prompt→improve |
| options.fileName | string | "" | no | File name override for file→upload |

## Runtime behavior

### Resource / operation matrix

| resource | operation | behavior summary |
|----------|-----------|------------------|
| text | message | Sends a multi-turn message to an Anthropic model via the Messages API. Accepts attachments (images, documents via URL or binary). When connected to `ai_tool` input, tools are bound and the model can invoke them in a loop up to `maxToolsIterations` cycles. Supports web search and code execution tools. |
| document | analyze | Takes document URLs or binary files, sends them with a text prompt to an Anthropic model for document question-answering. |
| image | analyze | Takes image URLs or binary files, sends them with a text prompt for visual analysis. |
| file | upload | Uploads a file to the Anthropic Files API by URL or binary data. Returns file metadata. |
| file | get | Retrieves metadata for a previously uploaded file by file ID. |
| file | list | Lists uploaded files with pagination support. |
| file | deleteFile | Deletes a previously uploaded file by file ID. |
| prompt | generate | Generates an optimized prompt from a task description using Anthropic prompt tools APIs. |
| prompt | improve | Improves an existing prompt with optional system message and feedback. |
| prompt | templatize | Converts a prompt into a reusable template with variable placeholders. |

### Input processing

- **text→message:** Accepts a fixed collection of message objects (content + role). When `addAttachments` is true, additional image/document content blocks are appended to the last user message using URL downloads or binary data.
- **document/image→analyze:** Accepts single or multiple URLs (comma-separated) or binary field names. URLs are downloaded server-side; binary data is read from the execution item.
- **file→upload:** Accepts a single URL or binary field. Optionally renames via `fileName` option.
- All string-type parameters support n8n expressions.

### Output shape

- **text→message (simplified):** Each output item contains `{ messages: [{ role, content }], model, usage }` where content is the assistant's text response.
- **text→message (raw):** Full Anthropic Messages API response including content blocks, stop reason, and usage metadata.
- **text→message (merged response):** When `includeMergedResponse` is true, the output includes `{ mergedResponse: "<all text blocks concatenated>" }`.
- **document/image→analyze:** Natural language answer string or raw response depending on `simplify`.
- **file→upload/get:** File metadata object with id, filename, mime_type, size_bytes, created_at.
- **file→list:** Array of file metadata objects.
- **file→deleteFile:** Deletion confirmation.
- **prompt→generate/improve/templatize:** Generated/improved/templatized prompt messages and system prompt.

### Tool mode (ai_tool input)

When the `text→message` operation is used within an AI Agent, the node exposes an `ai_tool` input connector. Connected tool sub-nodes are converted to Anthropic tool definitions and passed to the Messages API `tools` parameter. The executor orchestrates tool call → tool result cycles, respecting `maxToolsIterations`. The Anthropic SDK tool types supported are `custom` (tool name + input_schema + description), `web_search`, and `code_execution`.

### Errors

- Missing credentials → throws an error.
- API errors (auth, rate limit, server errors) → throws with Anthropic API error message, unless `continueOnFail` is set, in which case the error item is passed through with `error: { ... }`.
- Invalid file ID, URL fetch failure, or unsupported media type → throws.

## Acceptance tests

### Test: text→message basic completion

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "text",
  "operation": "message",
  "modelId": { "mode": "id", "value": "claude-sonnet-4-20250514" },
  "messages": { "values": [{ "content": "What is 2+2?", "role": "user" }] },
  "simplify": true
}
```

**Expect** output[0] to contain:
- `json.messages` array with at least one entry
- `json.messages[0].role` equal to `"assistant"`
- `json.messages[0].content` to be a non-empty string

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
  "modelId": { "mode": "id", "value": "claude-sonnet-4-20250514" },
  "messages": { "values": [{ "content": "What is the weather in London?", "role": "user" }] }
}
```

**Expect** the model to invoke the connected tool(s), produce tool_use content blocks, and return a final assistant response incorporating tool results.

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
  "modelId": { "mode": "id", "value": "claude-sonnet-4-20250514" },
  "text": "What's in this image?",
  "inputType": "url",
  "imageUrls": "https://example.com/test.png",
  "simplify": true
}
```

**Expect** output[0] to contain a non-empty string or structured response describing the image.

### Test: file→upload from URL

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "inputType": "url",
  "fileUrl": "https://example.com/document.pdf"
}
```

**Expect** output[0].json to contain `id`, `filename`, `mime_type`, `size_bytes`, and `created_at`.

### Test: prompt→generate

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "prompt",
  "operation": "generate",
  "task": "A chef for a meal prep planning service",
  "simplify": true
}
```

**Expect** output[0].json to contain `messages` and `system` fields with the generated prompt.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| AI Agent tool integration | documented | `usableAsTool: true` is confirmed from node descriptor; tool input binding via `ai_tool` is standard across n8n. |
| Prompt tools (generate/improve/templatize) | documented | Public docs confirm these operations; anthropic doc notice warns about closed research preview. |
| Tool types (web_search, code_execution) | inferred from corpus type definitions | Type definitions show web_search_20250305 and code_execution_20250522 tool types with their parameter schemas. |
| Model dynamic listing | documented | `modelSearch` list-search method confirmed from node descriptor and methods list. |

## OpenFlow mapping

- **Definition group:** `core` | `ai`
- **Executor file:** `src/lib/engine/executors/anthropic.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
