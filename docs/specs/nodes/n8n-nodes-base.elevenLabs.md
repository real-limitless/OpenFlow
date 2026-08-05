---
type: n8n-nodes-base.elevenLabs
displayName: ElevenLabs
category: Action
versions: [1]
priority: low
status: missing
---

# ElevenLabs

## Sources

| URL | Source class |
|-----|--------------|
| https://elevenlabs.io/docs/api-reference/text-to-speech/convert.md | Public docs only |
| https://elevenlabs.io/docs/llms-full.txt | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elevenlabs/ | Public docs only (404 — node exists but no docs page) |

## Wire format

- **Type string:** `n8n-nodes-base.elevenLabs`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `elevenLabsApi` (API key passed via `xi-api-key` header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | textToSpeech | true | always | The ElevenLabs resource to operate on |
| operation | string | convert | true | always | The operation to perform on the selected resource |
| voiceId | string | — | true | resource=textToSpeech, operation=convert | ElevenLabs voice ID to use for speech generation |
| text | string | — | true | resource=textToSpeech, operation=convert | Text content to convert to speech |
| modelId | string | eleven_multilingual_v2 | false | resource=textToSpeech, operation=convert | Model identifier (queried via GET /v1/models) |
| options.stability | number | 0.5 | false | resource=textToSpeech, operation=convert | Voice stability (0.0–1.0); lower = broader emotion |
| options.similarityBoost | number | 0.75 | false | resource=textToSpeech, operation=convert | How closely to replicate original speaker (0.0–1.0) |
| options.style | number | 0 | false | resource=textToSpeech, operation=convert | Style exaggeration (0.0–1.0) |
| options.speed | number | 1.0 | false | resource=textToSpeech, operation=convert | Speaking speed multiplier |
| options.useSpeakerBoost | boolean | true | false | resource=textToSpeech, operation=convert | Boost similarity to original speaker (increases latency) |
| options.outputFormat | string | mp3_44100_128 | false | resource=textToSpeech, operation=convert | Audio codec/sample-rate/bitrate string |
| options.optimizeStreamingLatency | number | — | false | resource=textToSpeech, operation=convert | Latency optimization level (0–4) |

## Runtime behavior

### Text-to-Speech → Convert

Calls `POST /v1/text-to-speech/{voiceId}` with the ElevenLabs API. Sends the configured `text` with optional voice settings, model selection, and output format parameters. The API returns binary audio data (content-type `application/octet-stream`).

#### Input

Accepts one or more input items. Each item may supply `text` and/or `voiceId` via expressions; static values are shared across items.

#### Output

For each input item, one output item is produced containing the audio data as a binary property. The original JSON data from the input item is preserved on the output item, with the addition of a `voiceId` and `modelId` metadata fields reflecting what was used.

If the operation ran with per-item expressions, exactly one output item corresponds to each input item. If static parameters were used, a single API call is made and one output item is produced carrying the binary result from that call.

#### Errors

- **4xx responses** from the ElevenLabs API (invalid voice ID, quota exceeded, text too long) throw an `ExecutionError` with the API error message. If `continueOnFail` is enabled, the failing item is passed through with `error: true` and an `errorMessage` field.
- **Network errors** (timeout, DNS failure) follow the same `continueOnFail` pattern.
- **Empty or whitespace-only text** should produce an empty output (no output items or a single error item depending on `continueOnFail`).

### Expressions

`voiceId`, `text`, `modelId`, and all `options.*` parameters accept expression strings.

## Acceptance tests

### Test: TTS-convert-with-defaults

**Given** input items:

```json
[{ "json": { "myText": "Hello world" } }]
```

**Parameters:**

```json
{
  "resource": "textToSpeech",
  "operation": "convert",
  "voiceId": "JBFqnCBsd6RMkjVDRZzb",
  "text": "={{ $json.myText }}"
}
```

**Expect** output[0] to contain one item with:
- `json` property containing the original `{ "myText": "Hello world" }` plus `voiceId` and `modelId` fields
- `binary` property containing the generated audio (default mp3)

### Test: TTS-convert-with-options

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "textToSpeech",
  "operation": "convert",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "text": "This is a test with custom voice settings.",
  "modelId": "eleven_multilingual_v2",
  "options": {
    "stability": 0.3,
    "similarityBoost": 0.8,
    "style": 0.2,
    "speed": 1.1,
    "outputFormat": "mp3_44100_128",
    "optimizeStreamingLatency": 1
  }
}
```

**Expect** output[0] to contain one item with valid binary audio data (mp3 format at 44100 Hz sample rate / 128 kbps).

### Test: TTS-multi-item-batch

**Given** input items:

```json
[
  { "json": { "text": "Sentence one." } },
  { "json": { "text": "Sentence two." } }
]
```

**Parameters:**

```json
{
  "resource": "textToSpeech",
  "operation": "convert",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "text": "={{ $json.text }}",
  "modelId": "eleven_multilingual_v2"
}
```

**Expect** output[0] to contain two items, each with:
- Original `json` data preserved
- Distinct binary audio data per item

### Test: TTS-invalid-voice-id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "textToSpeech",
  "operation": "convert",
  "voiceId": "nonexistent-voice-id",
  "text": "This should fail."
}
```

**Expect** the node to throw an `ExecutionError` with a 422 validation error from the API. With `continueOnFail: true`, the item should pass through with `error: true` and a descriptive `errorMessage`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Text-to-Speech API contract | documented | From ElevenLabs public API reference (convert endpoint) |
| Voice settings parameters | documented | stability, similarity_boost, style, speed, use_speaker_boost |
| n8n credential type | inferred | Assumes `elevenLabsApi` credential type for xi-api-key |
| Resource/operation structure | inferred | No public n8n docs page exists; assumed app-node pattern with textToSpeech resource and convert operation |
| Voice listing / model listing endpoints | inferred | May be exposed as separate operations; not confirmed from n8n docs |
| Additional resources (Speech-to-Text, Voice Cloning, Dubbing, etc.) | unknown | ElevenLabs API has many endpoints; unknown which are exposed |
| Default model ID | inferred | eleven_multilingual_v2 is the documented default on the API |
| Binary output shape | inferred | Standard n8n binary property pattern assumed |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/ElevenLabs.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
