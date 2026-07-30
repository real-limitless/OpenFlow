---
type: "@n8n/n8n-nodes-langchain.openAi"
displayName: OpenAI
category: AI
versions: [1, 1.1, 1.2, 1.3, 2]
priority: high
status: specced
---

# OpenAI

App node: wraps the OpenAI REST API across multiple resources (text, image, audio, file, video, conversation). Replaces the older OpenAI Assistant node from v1.29. Node V2 (1.117+) adds Responses API support and drops the Assistants API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/text-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/image-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/audio-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/video-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/conversation-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.openAi`
- **Aliases:** `n8n-nodes-base.openAi` (older workflow JSON exports; see common-issues.md example)
- **typeVersion:** `1`–`1.3` pre-Responses API; `2` for Responses API (1.117+)
- **Inputs:** `main` × 1
- **Tool inputs:** `ai_tool` × 0..N — only for Text > Generate a Chat Completion and Text > Generate a Model Response (V2) when tools are connected
- **Outputs:** `main` × 1
- **Credentials:** `openAiApi` (API key + optional Organization ID)

## Parameters

### Resource selector (top-level)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `text` | yes | — | Values: `text`, `image`, `audio`, `file`, `video`, `conversation` |

### Text resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `chatCompletion` | yes | show when resource=text | Values: `chatCompletion` (Generate a Chat Completion), `modelResponse` (Generate a Model Response, V2+), `moderation` (Classify Text for Violations) |
| model | options / string | — | yes | show when operation in (`chatCompletion`, `modelResponse`) | E.g. `gpt-4o`, `gpt-4o-mini`; loaded via loadOptionsMethod |
| messages | fixedCollection | — | yes | show when operation in (`chatCompletion`, `modelResponse`) | Collection of message items; each has `role` (options: `user`, `assistant`, `system`) and `text` (string) |
| messages.messageValues.text | string | — | conditional | — | The message text |
| messages.messageValues.role | options | `user` | conditional | — | `user`, `assistant`, `system` |
| simplifyOutput | boolean | `false` | no | show when operation=chatCompletion | Return simplified response instead of raw data |
| outputContentAsJson | boolean | `false` | no | show when operation=chatCompletion | Request JSON-format output (compatible with GPT-4 Turbo + GPT-3.5 Turbo ≥1106) |
| textInput | string | — | yes | show when operation=moderation | Text to classify for violations |
| useStableModel | boolean | `false` | no | show when operation=moderation | Use the stable moderation model |
| options.frequencyPenalty | number | — | no | show when operation=chatCompletion | Range 0.0–2.0 |
| options.maxTokens | number | — | no | show when operation in (`chatCompletion`, `modelResponse`) | Maximum tokens in response |
| options.numberOfCompletions | number | `1` | no | show when operation=chatCompletion | Number of completions per prompt |
| options.presencePenalty | number | — | no | show when operation=chatCompletion | Range 0.0–2.0 |
| options.temperature | number | `1.0` | no | show when operation in (`chatCompletion`, `modelResponse`, `moderation`) | Range 0.0–1.0 |
| options.topP | number | `1.0` | no | show when operation in (`chatCompletion`, `modelResponse`) | Range 0.0–1.0 |
| options.conversationId | string | — | no | show when operation=modelResponse | Conversation this response belongs to (V2) |
| options.previousResponseId | string | — | no | show when operation=modelResponse | Previous response ID to continue from (V2) |
| options.reasoningEffort | options | — | no | show when operation=modelResponse | Reasoning effort level (V2); values documented as configurable |
| options.reasoningSummary | boolean | `false` | no | show when operation=modelResponse | Return reasoning summary (V2) |
| options.store | boolean | `true` | no | show when operation=modelResponse | Store response for later retrieval (V2) |
| options.outputFormat | options | `text` | no | show when operation=modelResponse | `text`, `jsonSchema`, `jsonObject` (V2) |
| options.background | boolean | `false` | no | show when operation=modelResponse | Run in background mode (V2) |

#### Messages fixedCollection (Text resource)

The `messages` parameter is a `fixedCollection` with a single option block:

| option name | displayName | type | default | notes |
|-------------|-------------|------|---------|-------|
| messageValues | Messages | — | — | Multiple values allowed |
| messageValues.text | Text | string | — | Prompt text |
| messageValues.role | Role | options | `user` | `user`, `assistant`, `system` |

For `modelResponse` (V2), the collection additionally supports message types `image` and `file` with a `messageType` sub-option (`text`, `image`, `file`). Image/file sub-types offer `url`, `fileId`, or `binaryData` input methods.

#### Built-in Tools (modelResponse V2)

When operation=modelResponse, a `tools` fixedCollection enables OpenAI built-in tools:

| option name | displayName | type | default | notes |
|-------------|-------------|------|---------|-------|
| tools.values.webSearch | boolean | false | no | Web Search tool |
| tools.values.fileSearch | boolean | false | no | File Search tool |
| tools.values.codeInterpreter | boolean | false | no | Code Interpreter tool |
| tools.values.mcpServers | — | — | — | Remote MCP server tools (via ai_tool sub-node connection) |

### Image resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `analyze` | yes | show when resource=image | Values: `analyze` (Analyze Image), `generate` (Generate an Image), `edit` (Edit an Image) |
| model | options / string | — | yes | show when operation in (`analyze`, `generate`, `edit`) | Model to use |
| textInput | string | — | yes | show when operation=analyze | Question about the image |
| inputType | options | `url` | yes | show when operation=analyze | `url` (Image URL(s)), `binary` (Binary File(s)) |
| imageUrls | string | — | conditional | show when inputType=url | Comma-separated URLs |
| inputDataFieldName | string | `data` | conditional | show when inputType=binary | Binary property name |
| prompt | string | — | yes | show when operation in (`generate`, `edit`) | Text description of desired image |
| respondWithImageUrl | boolean | `false` | no | show when operation=generate | Return URLs instead of binary |
| putOutputField | string | `data` | no | show when operation in (`generate`, `audio`) | Output binary field name |
| image | string | — | conditional | show when operation=edit | Binary field name for input image(s) |
| numberOfImages | number | `1` | conditional | show when operation=edit | 1–10 |
| size | string | — | conditional | show when operation=edit | Image dimensions |
| quality | string | — | conditional | show when operation=edit | `auto`, `low`, `medium`, `high`, `standard` (gpt-image-1) |
| outputFormat | string | — | conditional | show when operation=edit | `png`, `webp`, `jpg` (gpt-image-1) |
| outputCompression | number | — | conditional | show when operation=edit | 0–100% (gpt-image-1, webp/jpeg) |
| options.detail | options | — | no | show when operation=analyze | Detail level for image analysis |
| options.maxTokens | number | `300` | no | show when operation=analyze | Max tokens for description |
| options.quality | options | `standard` | no | show when operation=generate | `standard`, `hd` (dall-e-3 only) |
| options.resolution | options | — | no | show when operation=generate | `1024x1024`, `1792x1024`, `1024x1792` |
| options.style | options | `vivid` | no | show when operation=generate | `natural`, `vivid` (dall-e-3 only) |
| options.background | options | — | no | show when operation=edit | Background transparency (gpt-image-1) |
| options.inputFidelity | number | — | no | show when operation=edit | Style matching effort (gpt-image-1) |
| options.imageMask | string | — | no | show when operation=edit | Binary property for mask image |
| options.user | string | — | no | show when operation=edit | End-user identifier |

### Audio resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `generate` | yes | show when resource=audio | Values: `generate` (Generate Audio), `transcribe` (Transcribe a Recording), `translate` (Translate a Recording) |
| model | options | — | yes | show when operation=generate | `tts-1`, `tts-1-hd` |
| textInput | string | — | yes | show when operation=generate | Text to speak (max 4096 chars) |
| voice | options | — | yes | show when operation=generate | Voice selection |
| inputDataFieldName | string | `data` | yes | show when operation in (`transcribe`, `translate`) | Binary property with audio file |
| options.responseFormat | options | `mp3` | no | show when operation=generate | `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm` |
| options.audioSpeed | number | `1.0` | no | show when operation=generate | 0.25–4.0 |
| options.putOutputField | string | `data` | no | show when operation=generate | Output field name |
| options.language | string | — | no | show when operation=transcribe | ISO-639-1 language code |
| options.temperature | number | `1.0` | no | show when operation in (`transcribe`, `translate`) | Range 0.0–1.0 |

### File resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `list` | yes | show when resource=file | Values: `delete`, `list`, `upload` |
| fileId | string | — | conditional | show when operation=delete | File ID to delete; also supports fileName dropdown via loadOptionsMethod |
| inputDataFieldName | string | `data` | conditional | show when operation=upload | Binary property containing file |
| options.purpose | options | — | no | show when operation in (`list`, `upload`) | `assistants`, `fine-tune` |

### Video resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `generate` | yes | show when resource=video | Value: `generate` |
| model | options | — | yes | — | `sora-2`, `sora-2-pro` |
| prompt | string | — | yes | — | Text prompt |
| seconds | number | — | yes | — | Duration in seconds (up to 25) |
| size | string | — | yes | — | Resolution (e.g. `1024x1792`) |
| options.reference | string | — | no | — | Binary property for reference image |
| options.waitTimeout | number | `300` | no | — | Timeout in seconds |
| options.outputFieldName | string | `data` | no | — | Output binary field name |

### Conversation resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | show when resource=conversation | Values: `create`, `get`, `update`, `remove` |
| conversationId | string | — | conditional | show when operation in (`get`, `update`, `remove`) | Conversation ID |
| messages | fixedCollection | — | conditional | show when operation=create | Messages (same structure as Text messages) |
| options.metadata | fixedCollection | — | no | show when operation in (`create`, `update`) | Key-value metadata (max 16 pairs) |

## Runtime behavior

### Input

Single `main` input. Items are passed through; the node calls the OpenAI REST API per operation. Certain operations (transcribe, translate, edit image, upload file, generate audio/video, analyze image via binary) expect binary data on each item. For chat completions / model responses, the `messages` parameter may contain expressions referencing item fields.

### Output

- **Chat Completion / Model Response:** output items contain the model's response. When `simplifyOutput` is on, a reduced shape is returned; otherwise the raw API response.
- **Moderation:** output contains `flagged` (boolean), `categories`, and `category_scores`.
- **Image Generate:** binary output in specified field (default `data`) or image URLs when `respondWithImageUrl` is on.
- **Image Edit:** binary output.
- **Audio Generate/Transcribe/Translate:** binary output (audio) or text transcription/translation.
- **File operations:** metadata in JSON; `upload` also returns file metadata.
- **Video Generate:** binary output in specified field.
- **Conversation operations:** conversation metadata in JSON.

Pass-through: items not consumed by the operation's inputs are passed as-is on output[0].

### Errors

API errors (rate limits, insufficient quota, bad request) throw with the upstream error message. `continueOnFail` catches per-item failures and emits `{ json: { error } }` on the output branch.

### Expressions

All string parameters accept expressions. The `model` parameter, `messages.messageValues.text`, `textInput`, `prompt`, and options values are common expression targets. `simplifyOutput` and boolean/options fields accept expression evaluation for dynamic workflows.

## Acceptance tests

### Test: text chat completion (simplified)

**Given** input items:

```json
[{ "json": { "question": "What is 2+2?" } }]
```

**Parameters:**

```json
{
  "resource": "text",
  "operation": "chatCompletion",
  "model": "gpt-4o-mini",
  "messages": {
    "messageValues": [
      { "role": "user", "text": "={{ $json.question }}" }
    ]
  },
  "simplifyOutput": true,
  "options": {
    "temperature": 0.7,
    "maxTokens": 100
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "model": "gpt-4o-mini",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "4"
        }
      }
    ]
  }
}]
```

### Test: audio transcription

**Given** input items:

```json
[{ "json": {}, "binary": { "data": { "data": "<base64-encoded-audio>", "mimeType": "audio/mp3", "fileName": "recording.mp3" } } }]
```

**Parameters:**

```json
{
  "resource": "audio",
  "operation": "transcribe",
  "inputDataFieldName": "data",
  "options": {
    "temperature": 0.0
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "text": "Hello, this is a test recording."
  }
}]
```

### Test: image generation

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "generate",
  "model": "dall-e-3",
  "prompt": "A cute cat sitting on a laptop",
  "options": {
    "quality": "standard",
    "resolution": "1024x1024",
    "style": "vivid"
  },
  "respondWithImageUrl": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "created": 1712345678,
    "data": [
      { "url": "https://oaidalleapiprodscus.blob.core.windows.net/...", "revised_prompt": "..." }
    ]
  }
}]
```

### Test: moderation

**Given** input items:

```json
[{ "json": { "text": "I want to hurt someone" } }]
```

**Parameters:**

```json
{
  "resource": "text",
  "operation": "moderation",
  "textInput": "={{ $json.text }}",
  "useStableModel": false
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "flagged": true,
    "categories": {
      "violence": true,
      "hate": false
    },
    "category_scores": {
      "violence": 0.99,
      "hate": 0.01
    }
  }
}]
```

### Test: file upload

**Given** input items:

```json
[{ "json": {}, "binary": { "data": { "data": "<base64-encoded-jsonl>", "mimeType": "application/jsonl", "fileName": "training.jsonl" } } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "inputDataFieldName": "data",
  "options": {
    "purpose": "fine-tune"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "file-abc123",
    "object": "file",
    "bytes": 1234,
    "created_at": 1712345678,
    "filename": "training.jsonl",
    "purpose": "fine-tune"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation IDs (chatCompletion vs generate vs …) | inferred | Public docs use human labels; wire values inferred from naming conventions and older preview docs |
| messages fixedCollection shape | inferred | Public docs describe UI fields; exact wire key (`messageValues`) inferred from n8n convention |
| Built-in tools for V2 modelResponse | documented | Public docs list webSearch, fileSearch, codeInterpreter, mcpServers |
| Reasoning effort values | documented | Described as configurable; exact enum values not enumerated in docs |
| Conversation messages shape | inferred | Assumed same structure as Text messages |
| V1 (`n8n-nodes-base.openAi`) vs V2 (`@n8n/n8n-nodes-langchain.openAi`) mapping | inferred | Type string migration from common-issues.md example; exact version boundary documented |
| Simplify output shape | inferred | Docs say "simplified"; exact fields inferred from OpenAI API response |
| Per-item vs per-workflow execution | documented | Node processes each input item independently (REST API call per item) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
