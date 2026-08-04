---
type: '@n8n/n8n-nodes-langchain.googleGeminiTool'
displayName: Google Gemini Tool
category: AI
versions: [1, 1.1, 1.2]
priority: medium
status: specced
---

# Google Gemini Tool

The Google Gemini Tool is the AI-agent tool variant of the Google Gemini app node (`@n8n/n8n-nodes-langchain.googleGemini`).
It exposes the same audio/document/file/fileSearch/image/text/video operations as callable tool functions for AI agents. The underlying node definition carries `usableAsTool: true`, and in tool mode parameters can be populated dynamically via `$fromAI()` expressions.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.googlegemini/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/googleai/ | Public docs only |
| https://ai.google.dev/api/generate-content | Public docs only |
| https://ai.google.dev/api/files | Public docs only |
| https://ai.google.dev/api/file-search/file-search-stores | Public docs only |
| https://ai.google.dev/gemini-api/docs/veo | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.googleGeminiTool`
- **Aliases:** LangChain, video, document, audio, transcribe, assistant
- **Inputs:** `main` × 1 (+ `ai_tool` × 1 when resource=text, operation=message)
- **Outputs:** `main` × 1
- **Credentials:** `googlePalmApi` (Google AI API key, required)

The same `googleGemini` node definition has `usableAsTool: true`, which n8n registers as a Google Gemini Tool variant. In OpenFlow this should be a separate executor with an `ai_tool` input alongside the standard `main` input.

## Parameters

All parameters are identical to the base Google Gemini node (`@n8n/n8n-nodes-langchain.googleGemini`). See `@n8n/n8n-nodes-langchain.googleGemini.md` for the full parameter table covering all 7 resources and their operations.

Key differences in tool mode:

- **Resource/Operation** — same 7 resources (audio, document, file, fileSearch, image, text, video) with their sub-operations
- **`$fromAI()` support** — any parameter can be populated dynamically by the AI agent at call time; the tool definition declares the parameter schema so the agent knows what arguments to supply
- **No separate tool-specific parameters** — the tool variant inherits all parameters from the base node
- **`ai_tool` input** — only active when resource=text, operation=message (tool sub-nodes can be connected for tool calling)

### Parameter surface (abstracted)

| Parameter category | Key parameters | Notes |
|-------------------|----------------|-------|
| Resource selection | `resource` | One of: audio, document, file, fileSearch, image, text, video |
| Operation selection | `operation` | Determined by resource; see base spec |
| Model | `modelId` | Resource-locator selecting a Gemini model (gemini-*, imagen-*, veo-*) |
| Prompt / instruction | `prompt`, `text`, `promptText` | The instruction for the model |
| Binary input | `binaryPropertyName`, `imageUrls`, `binaryData` | Media input: binary property or URL reference |
| Messages | `messages` | Chat history (array of role+content objects); only for text→message |
| Built-in tools | `builtInTools` | Google Search, Google Maps, URL context, file search, code execution |
| Simplify | `simplify` | When true, collapses raw API response to extracted text/content |
| Generation options | `options.*` | Temperature, topK, topP, maxOutputTokens, stop sequences, candidate count, etc. |

## Runtime behavior

### Input

- Standard `main` input: accepts items with prompt/text, binary attachments, message history, etc. (same as base Google Gemini).
- `ai_tool` input: receives tool-call arguments from the calling AI agent. The agent may supply any subset of parameters dynamically.
- When used as a tool within an AI Agent (via `ai_tool` connection), the node supplies its own tool definitions to the agent, enabling the agent to invoke Gemini operations directly.

### Output

Same output shapes as the base Google Gemini node per resource/operation:

- **text→message:** Raw `generateContent` response body (candidates, promptFeedback, usageMetadata) or simplified text content
- **image→analyze/generate/edit:** Natural language answer or generated/edited image binaries
- **audio→analyze/transcribe:** Analysis text or transcription string
- **document→analyze:** Extracted information from document content
- **video→analyze/generate/download:** Analysis text, generated video (via long-running operation poll), or downloaded video binary
- **file→upload:** File metadata (uri, name, mimeType, sizeBytes, state)
- **fileSearch→createStore/deleteStore/listStores/uploadToStore:** Store object metadata or file indexing handle

### Errors

Same error handling as the base Google Gemini node. In tool mode, errors should be returned to the AI agent as structured tool error responses rather than throwing unconditionally.

### Expressions

All parameters support `$fromAI()` for dynamic agent-driven population. Standard expression syntax (`$json`, `$()`) also works on both `main` and `ai_tool` inputs.

## Acceptance tests

### Test: tool-text-message

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "text",
    "operation": "message",
    "modelId": { "mode": "id", "value": "gemini-2.0-flash" },
    "messages": { "values": [{ "content": "What is the capital of France?", "role": "user" }] },
    "simplify": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0] has 1 item whose `json.candidates` is a non-empty array (if not simplified) or whose extracted text mentions Paris (if simplified).

---

### Test: tool-image-analyze

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "image",
    "operation": "analyze",
    "modelId": { "mode": "id", "value": "gemini-2.0-flash" },
    "inputType": "url",
    "imageUrls": "https://example.com/photo.png",
    "text": "Describe this image in one sentence.",
    "simplify": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0].json contains a non-empty string describing the image.

---

### Test: tool-audio-transcribe

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "audio",
    "operation": "transcribe",
    "modelId": { "mode": "id", "value": "gemini-2.0-flash" },
    "binaryPropertyName": "data.audio",
    "prompt": "Transcribe this recording."
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0] has 1 item whose simplified text output is a non-empty transcription string.

---

### Test: tool-file-search-create-store

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "fileSearch",
    "operation": "createStore",
    "storeDisplayName": "My Tool Store"
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0] has 1 item whose `json.name` matches the pattern `fileSearchStores/*` and `json.displayName` equals `"My Tool Store"`.

---

### Test: tool-generate-image

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "image",
    "operation": "generate",
    "modelId": { "mode": "id", "value": "imagen-3.0-generate-001" },
    "prompt": "a red apple on a white background"
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0] has 1 item with a binary data attachment (non-empty buffer) and `json` containing a URI and image MIME type; the buffer is decodable as an image.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter schema | documented | Inherited from base Google Gemini node; `usableAsTool: true` confirmed in corpus |
| `$fromAI()` behavior | documented | Standard n8n AI-tool mechanism documented in how-tools-work.md |
| Tool-specific frontmatter | inferred | No dedicated docs page exists for `googleGeminiTool`; behavior inferred from `usableAsTool: true` |
| Error propagation to agent | inferred | Tool-mode error handling follows standard n8n AI tool conventions |
| Input/output wiring | documented | `ai_tool` input from base Google Gemini node descriptor; only active for text→message |
| Exact model ID list | inferred | Model catalog changes frequently; treated as runtime data from Gemini API |

## OpenFlow mapping

- **Definition group:** `ai` (AI agent tool)
- **Executor file:** `src/lib/engine/executors/@n8n/n8n-nodes-langchain.googleGeminiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Implementation note:** The executor should be a thin wrapper around the base Google Gemini executor, adding `ai_tool` input handling and `$fromAI()` expression support. Consider sharing the core operation dispatch logic via a shared module.
