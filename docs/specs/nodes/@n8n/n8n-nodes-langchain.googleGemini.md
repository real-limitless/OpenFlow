---
type: '@n8n/n8n-nodes-langchain.googleGemini'
displayName: Google Gemini
category: AI
versions: [1, 1.1, 1.2]
priority: medium
status: specced
---

# Google Gemini

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.googlegemini.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/googleai.md | Public docs only |
| https://ai.google.dev/api/generate-content | Public docs only |
| https://ai.google.dev/api/files | Public docs only |
| https://ai.google.dev/api/file-search/file-search-stores | Public docs only |
| https://ai.google.dev/gemini-api/docs/veo | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.googleGemini`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (+ optional `ai_tool` "Tools" output for use as an AI-agent tool)
- **Credentials:** `googlePalmApi` (Google Gemini/PaLM API key), required

### External service

All operations call the **Google Gemini (Generative Language) API** at `https://generativelanguage.googleapis.com/v1beta`. Authentication is a Google AI API key from AI Studio. The host is not configurable in current versions.

## Parameters

A `resource` selector determines the media category, and an `operation` selector within it determines the exact API action. A `model` locator selects the Gemini model for generation/analysis operations. Binary inputs (audio, video, image, document, media file) are read from a binary property on the input item.

### Resource / operation matrix

| resource | operations | external contract |
|----------|-----------|-------------------|
| `audio` | `analyze` (Analyze Audio), `transcribe` (Transcribe a Recording) | `generateContent` with audio input / audio transcription request |
| `document` | `analyze` (Analyze Document) | `generateContent` with document (`pdf`, Office) input |
| `fileSearch` | `createStore`, `deleteStore`, `listStores`, `uploadToStore` | File Search Store API (`fileSearchStores` resource) for RAG |
| `image` | `analyze` (Analyze Image), `generate` (Generate an Image), `edit` (Edit Image) | `generateContent` with image input; Imagen image-generation model |
| `file` | `upload` (Upload Media File) | Files API (`upload/v1beta/files`, `files`) |
| `text` | `message` (Message a Model) | `models/*:generateContent` |
| `video` | `analyze` (Analyze Video), `generate` (Generate a Video), `download` (Download Video) | `generateContent` with video input; Veo video-generation model + long-running operation; file download |

### Common parameter surface

| name | type | notes |
|------|------|-------|
| `resource` | string | One of the resources above |
| `operation` | string | Operation within the selected resource |
| `model` | string | Model name (e.g. a `gemini-*` chat/analysis model, an Imagen image model, or a Veo video model) |
| `prompt` / `promptText` | string | The instruction or question for the model |
| `binaryData` | object | Binary property reference holding the input media (audio, video, image, document) |
| `options.*` | object | Operation-specific tuning; see below |

### Operation-specific options

- **Message a Model / Analyze operations:** generation tuning such as temperature, top-k, top-p, max output tokens, stop sequences, response MIME type (text vs JSON), and safety-setting thresholds.
- **Generate an Image:** image prompt, aspect ratio, and number of samples; the generated image is returned as binary data plus metadata (URI, MIME type).
- **Edit Image:** one or more reference images plus an edit prompt; returns the edited image(s).
- **Generate a Video:** video prompt, aspect ratio, resolution, and duration. Generation is asynchronous: the node submits a long-running operation and polls `operations/{id}` until it completes, then returns the produced video.
- **Download Video:** a video URI/URL; the node fetches the media and emits it as binary data.
- **Transcribe a Recording:** the audio binary plus optional language/task hints; returns the transcription text.
- **File Search Store:** a store display name, optional embedding model, and (for upload) a list of file binaries or file URIs to index.
- **Upload Media File:** a display name and the file binary; returns the registered file's URI and metadata for later reference in generation calls.

## Runtime behavior

### Input

Each input item is processed independently. Media-bearing operations read binary data from the binary property named by the item. `Message a Model` consumes a plain text prompt (which may reference `$json` fields via expressions). A video/image generation returns one item per input item.

### Output

- **Text / analysis / transcription:** one output item per API response. The item's `json` carries the model's response. For `generateContent` this is the raw API body (candidates, prompt feedback, usage metadata); the produced text is reachable under `candidates[0].content.parts[].text`. The node may also offer a "simplify" style option that collapses the response to the produced text.
- **Image generate / edit:** one output item per generated sample, with the image exposed as binary data and metadata (URI, MIME type) in `json`.
- **Video generate / download:** one output item carrying the produced video as binary data plus `json` metadata (URI, MIME type, size). Generation waits for the long-running operation to complete.
- **File Search stores:** list returns an array of store objects (`name`, `displayName`, status); create/delete return the affected store; upload returns a handle for the indexing operation.
- **Upload Media File:** one output item per uploaded file with the `File` object metadata (`uri`, `name`, `mimeType`, `sizeBytes`, `state`).

### Errors

- API errors (HTTP 4xx/5xx, invalid model, blocked content, quota) throw per-item unless `continueOnFail` is enabled, in which case the failed item is passed through with an `error` property.
- Missing binary property on a media operation throws a validation error for that item.
- Video generation that fails or times out during operation polling throws an error for that item.
- Invalid JSON path for the prompt or missing required parameters behave as item-level errors.

### Expressions

All string, number, boolean, JSON, and options parameters accept expression strings (e.g. `={{ $json.prompt }}`).

## Acceptance tests

### Test: message-a-model

**Given** input item `{ "json": { "prompt": "What is the capital of France?" } }` and parameters:
```json
{
  "resource": "text",
  "operation": "message",
  "model": "gemini-2.0-flash",
  "prompt": "={{ $json.prompt }}",
  "options": {}
}
```

**Expect** output[0] has 1 item whose `json.candidates` is a non-empty array, `json.candidates[0].content.parts` contains at least one part, and the concatenated text of `parts[].text` is a non-empty string that mentions Paris.

### Test: generate-image-returns-binary

**Given** input item `{ "json": {} }` and parameters:
```json
{
  "resource": "image",
  "operation": "generate",
  "model": "imagen-3.0-generate-001",
  "prompt": "a red apple on a white background",
  "options": { "aspectRatio": "1:1" }
}
```

**Expect** output[0] has 1 item with a binary data attachment (non-empty buffer) and `json` containing a URI string and an image MIME type; the buffer is decodable as an image.

### Test: transcribe-audio

**Given** input item with a binary audio attachment (e.g. `data.audio` holding an MP3 buffer) and parameters:
```json
{
  "resource": "audio",
  "operation": "transcribe",
  "model": "gemini-2.0-flash",
  "binaryData": { "property": "data.audio" },
  "prompt": "Transcribe the audio."
}
```

**Expect** output[0] has 1 item whose text output (under the same parts-based shape as the message test) is a non-empty transcription string.

### Test: create-file-search-store

**Given** input item `{ "json": { "name": "my-store" } }` and parameters:
```json
{
  "resource": "fileSearch",
  "operation": "createStore",
  "storeName": "={{ $json.name }}"
}
```

**Expect** output[0] has 1 item whose `json.name` matches the pattern `fileSearchStores/*` and `json.displayName` equals `"my-store"`.

### Test: analyze-image

**Given** input item with a binary image attachment and parameters:
```json
{
  "resource": "image",
  "operation": "analyze",
  "model": "gemini-2.0-flash",
  "prompt": "Describe this image in one sentence.",
  "binaryData": { "property": "data.image" }
}
```

**Expect** output[0] has 1 item with a non-empty text response describing the image.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation surface | documented | Public n8n docs list Audio, Document, File Search, Image, Media File, Text, Video with their operations |
| Credential (`googlePalmApi`, API key, fixed host) | documented | n8n credentials page; corpus confirms credential name |
| `generateContent` request/response contract | documented | Google Gemini API reference (contents, candidates, parts, generationConfig) |
| Files API upload contract | documented | Google Gemini API reference (resumable upload, `File` metadata) |
| File Search Store endpoints | documented | Google Gemini API reference (`fileSearchStores.create/list/delete`, upload) |
| Video generation long-running operation | documented | Veo API docs (submit + poll operation, then download URI) |
| Exact node option names, defaults, nested options | inferred from corpus | Kept abstract; only functional surface specified, not original UI schema |
| `ai_tool` output / AI-agent tool usage | inferred from corpus | Output array includes an `ai_tool` output in later versions |
| Model version specifics (exact model IDs) | inferred | Model catalogs change frequently; treated as runtime data |
| simplify / output-collapse option | inferred | Common n8n pattern; raw API body is the guaranteed contract |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/googleGemini.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
