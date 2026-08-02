---
type: n8n-nodes-base.openAi
displayName: OpenAI
category: AI
versions: [1]
priority: medium
status: specced
---

# OpenAI

Action node that calls the OpenAI platform REST API (Chat Completions, Responses, Images, Audio, Files, Video, Conversations). Each incoming item triggers an independent API call; the raw service response becomes the output item, with an optional simplified form for text operations. Public n8n docs describe a V2 surface (Responses API era); the node has long existed as `n8n-nodes-base.openAi` with the documented resource set below.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/text-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/image-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/audio-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/file-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/video-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/conversation-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| https://platform.openai.com/docs/api-reference | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.openAi`
- **Aliases:** `ChatGPT`, `DallE`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `openAiApi` — API key (required); optional Organization ID (required only when the key belongs to multiple organizations)
- **typeVersion:** `1`

## Parameters

The node exposes a **resource** selector and, per resource, an **operation** plus resource-specific fields and an **options** collection. Parameter names below are abstracted; exact wire keys follow OpenAI REST field names where a direct mapping exists.

### Resource selection

| name | type | default | notes |
|------|------|---------|-------|
| resource | `text` \| `image` \| `audio` \| `file` \| `video` \| `conversation` | `text` | Chooses which OpenAI API sub-service is used |
| operation | string (per resource) | *see per-resource* | Picks the specific API action |

### Text

| operation | purpose |
|-----------|---------|
| Generate a Chat Completion | Chat Completions API (`POST /chat/completions`); the classic prompt-to-response call |
| Generate a Model Response | Responses API (`POST /responses`); supports built-in tools (web search, MCP, file search, code interpreter), conversation chaining, structured output |
| Classify Text for Violations | Moderation API (`POST /moderations`); flags harmful content |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | string | — | yes (chat + response) | Which model to use (e.g. `gpt-4o`, `gpt-4o-mini`) |
| messages | array of `{ role, text }` | — | yes (chat) | Multi-turn prompt; roles `user`, `assistant`, `system` |
| simplifyOutput | boolean | false | no | When on, output collapses to a simplified object instead of the raw API body |
| outputContentAsJson | boolean | false | no | Ask the model for JSON output (compatible models only) |
| textInput | string | — | yes (moderation) | Text to classify for policy violations |
| options.* | collection | `{}` | no | See below |

Text options (abstracted): **frequencyPenalty** (`0.0`–`2.0`), **maxTokens**, **numberOfCompletions** (default 1), **presencePenalty** (`0.0`–`2.0`), **temperature** (`0.0`–`1.0`, default 1.0), **topP** (`0.0`–`1.0`, default 1.0) — these map directly to the identically-named Chat Completions body fields. Response-operation extras: **conversationId**, **previousResponseId** (mutually exclusive), **reasoning** (effort level + optional summary), **store** (default true), **outputFormat** (`text` \| `jsonSchema` \| `jsonObject`), **background**. Moderation option: **useStableModel** (boolean).

### Image

| operation | purpose |
|-----------|---------|
| Analyze Image | Ask a vision-capable model questions about one or more images |
| Generate an Image | Text-to-image (`POST /images/generations`) |
| Edit an Image | Image editing from a prompt + input images (multipart) |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | string | — | yes | Image-capable model (e.g. `gpt-image-1`, `dall-e-2/3`) |
| prompt / textInput | string | — | yes | Prompt or question about the image |
| inputType | `url` \| `binary` | — | no (analyze) | How image input is supplied |
| respondWithImageUrl | boolean | false | no | Return URLs instead of binary data |
| putOutputField | string | `data` | no | Binary output field name when URLs are off |
| image* | binary references | — | no (edit) | One or more input images (png/webp/jpg, <50MB each, max 16) |
| options.* | collection | `{}` | no | See below |

Image options (abstracted): **detail** (token-use vs response-time balance), **maxTokens** (default 300), **quality** (`hd` \| `standard`), **resolution**/size (e.g. `1024x1024`, `1792x1024`, `1024x1792`), **style** (`natural` \| `vivid`), **outputFormat** (png/webp/jpg), **outputCompression** (0–100%), **background**, **inputFidelity**, **imageMask**, **user**.

### Audio

| operation | purpose |
|-----------|---------|
| Generate Audio | Text-to-speech (`POST /audio/speech`); returns binary audio |
| Transcribe a Recording | Speech-to-text (`POST /audio/transcriptions`, whisper-1) |
| Translate a Recording | Speech-to-English (`POST /audio/translations`, whisper-1) |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | string | `tts-1` / `tts-1-hd` | no (generate) | Speech model |
| textInput | string | — | yes (generate) | Text to speak; ≤ 4096 chars |
| voice | string | — | yes (generate) | One of the documented TTS voices |
| inputDataFieldName | string | `data` | yes (transcribe/translate) | Binary property holding the audio file (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm; ≤25 MB) |
| options.* | collection | `{}` | no | See below |

Audio options (abstracted): **responseFormat** (mp3 default, opus, aac, flac, wav, pcm), **audioSpeed** (`0.25`–`4.0`, default 1), **putOutputField** (default `data`), **language** (ISO-639-1), **temperature** (default 1.0).

### File

| operation | purpose |
|-----------|---------|
| Delete a File | `DELETE /files/{id}` |
| List Files | `GET /files` |
| Upload a File | `POST /files` (multipart) |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fileId | string | — | yes (delete) | ID of the file |
| inputDataFieldName | string | `data` | yes (upload) | Binary property with the file to upload (≤512 MB / ~2M tokens for Assistants) |
| purpose | string | — | no | File purpose: Assistants or Fine-Tune (also settable via options) |

### Video

| operation | purpose |
|-----------|---------|
| Generate Video | Sora text-to-video generation (async, polled) |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| model | string | — | yes | `sora-2` \| `sora-2-pro` |
| prompt | string | — | yes | Video description |
| seconds | number | — | no | Clip length, up to 25 |
| size | string | — | no | `widthxheight`; some resolutions Pro-only |
| options.* | collection | `{}` | no | See below |

Video options (abstracted): **reference** (optional image reference via binary), **waitTimeout** (default 300s), **outputFieldName** (default `data`).

### Conversation

| operation | purpose |
|-----------|---------|
| Create a Conversation | Create a new conversation object |
| Get a Conversation | Retrieve one by ID |
| Update a Conversation | Update metadata |
| Remove a Conversation | Delete by ID |

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| conversationId | string | — | yes (get/update/remove) | Conversation identifier |
| messages | array | — | yes (create) | Initial message input (roles `system`, `user`, `assistant`) |
| options.* | collection | `{}` | no | See below |

Conversation option: **metadata** (key/value pairs, max 16) for storing structured information.

## Runtime behavior

### Input

Each input item is processed independently. For every item the node resolves credentials, the resource/operation, and per-item parameters (expressions evaluated against that item's JSON), then issues one API call. Text moderation, chat, model response, image generation, and conversation operations consume the item's `json`; file upload and audio/transcribe/translate consume binary properties named by the user.

### Output

Produces one output item per input item (per successful call). By default the output `json` is the **raw OpenAI API response body** for the operation:
- **Chat completion**: standard Chat Completions body (`id`, `object`, `created`, `model`, `choices[].message`, `usage`).
- **Model response**: Responses API body.
- **Moderation**: moderation results (`flagged`, `categories`, `category_scores`).
- **Image generate**: images payload (URLs or base64 depending on `response_format`).
- **Audio generate / video generate**: binary data into the configured output field.
- **Transcribe / translate**: `{ text }` (raw API body).
- **File list / upload / delete**: raw file object(s).
- **Conversation**: raw conversation object.

When **simplifyOutput** is on (text resource), output collapses to the essential fields (e.g. model + `choices[].message` for chat completions) rather than the full body. `pairedItem` should reference the originating input item.

### Errors

- Non-2xx responses should throw a descriptive error (rate limit 429, quota 402/`insufficient_quota`, auth, and generic API errors); with `continueOnFail` enabled, the error is surfaced on the item instead of aborting.
- Network / timeout / missing credential / missing required parameter → throw (respect `continueOnFail`).
- Binary-data output (images, audio, video) requires the engine to support emitting binary items; if the transport only returns text/JSON, such operations must fail loudly rather than return truncated data.

### Expressions

All string, number, boolean, JSON (messages, options, metadata) and resource/operation parameters accept `={{ ... }}` expression strings resolved per input item.

## Acceptance tests

### Test 1: Chat completion (basic)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "text",
  "operation": "chatCompletion",
  "model": "gpt-4o-mini",
  "messages": {
    "messageValues": [{ "role": "user", "text": "What is the capital of France?" }]
  }
}
```

**Expect** output[0]:
- `json.id` — non-empty string
- `json.object` — `"chat.completion"`
- `json.choices[0].message.role` — `"assistant"`, `.content` — non-empty
- `json.usage` — object with `prompt_tokens`, `completion_tokens`, `total_tokens`

### Test 2: Chat completion with simplified output

**Parameters:**

```json
{
  "resource": "text",
  "operation": "chatCompletion",
  "model": "gpt-4o-mini",
  "messages": { "messageValues": [{ "role": "user", "text": "Say hello" }] },
  "simplifyOutput": true
}
```

**Expect** output[0] `json` shape:

```json
{
  "model": "gpt-4o-mini",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hello! ..." } }]
}
```

(values dynamic; structure fixed)

### Test 3: Moderation

**Parameters:**

```json
{
  "resource": "text",
  "operation": "moderation",
  "textInput": "I want to hurt someone"
}
```

**Expect** output[0] `json`:
- `flagged` — boolean
- `categories` — object of category→boolean
- `category_scores` — object of category→number

### Test 4: Generate an image

**Parameters:**

```json
{
  "resource": "image",
  "operation": "generate",
  "model": "dall-e-3",
  "prompt": "A red apple on a white table",
  "respondWithImageUrl": true,
  "options": { "size": "1024x1024", "quality": "hd" }
}
```

**Expect** output[0]:
- `json.data` — array with at least one entry
- each `json.data[i]` contains `url` or `b64_json` (non-empty)
- request body included `size: "1024x1024"`, `quality: "hd"`, `response_format: "url"`

### Test 5: Transcribe a recording

**Given** input items:

```json
[{ "json": {}, "binary": { "data": { "data": "BASE64", "mimeType": "audio/mp3", "fileName": "rec.mp3" } } }]
```

**Parameters:**

```json
{
  "resource": "audio",
  "operation": "transcribe",
  "inputDataFieldName": "data",
  "options": { "language": "en" }
}
```

**Expect** output[0]:
- request is multipart with `file`, `model=whisper-1`, `language=en`
- `json.text` — non-empty string transcript

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, aliases (ChatGPT, DallE), credential requirement | documented | Corpus node descriptor + credentials page |
| Resource set (Text, Image, Audio, File, Video, Conversation) and per-resource operations | documented | Public operations pages |
| Parameter surface (names, defaults, option lists) | documented | Public docs enumerate these at UI-label level |
| Exact wire keys for parameters/options | inferred | Docs give UI labels; keys assumed camelCase / OpenAI body field names |
| Exact output JSON (raw API bodies) | third-party service docs | Response shapes are OpenAI API contract, not node-specific |
| Binary output handling (images/audio/video) | inferred | Docs describe "put output in field" but transport behavior is engine-level |
| V2 (Responses API) vs older V1 field differences | documented | Public docs note the V2 rename + `Generate a Model Response`; exact V1/V2 wire deltas not fully enumerated |
| Endpoint paths beyond the obvious (/chat/completions, /moderations, /images/generations, /audio/*, /files) | documented | OpenAI API reference |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/openai.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
