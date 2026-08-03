---
type: n8n-nodes-base.mistralAi
displayName: Mistral AI
category: Utility
versions: [1]
priority: medium
status: specced
---

# Mistral AI

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mistralai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mistral.md | Public docs only |
| https://docs.mistral.ai/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mistralAi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mistralCloudApi` (API key from Mistral La Plateforme; paid/billing-enabled account required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `document` | ✓ | — | Single resource: Document |
| operation | fixed string | `extractText` | ✓ | — | Single operation: Extract Text |
| model | string \| expression | `mistral-ocr-latest` | ✗ | — | Mistral OCR model to use |
| documentType | enum: `document_url`, `image_url` | — | ✗ | — | Whether the input is a document or an image |
| inputType | enum: `binary`, `url` | `binary` | ✗ | — | How the document is supplied |
| binaryProperty | string \| expression | — | ✗ | show: `{inputType: ["binary"]}` | Name of the binary property holding the file |
| url | string \| expression | — | ✗ | show: `{inputType: ["url"]}` | URL of the document to process |
| options.batch | boolean | — | ✗ | — | Enable batch processing for multiple documents in one API call |
| options.batchSize | number | — | ✗ | — | Max documents per batch when batch processing is enabled |
| options.deleteFiles | boolean | — | ✗ | — | Delete files from Mistral Cloud after batch processing completes |

## Runtime behavior

### Input

Consumes incoming items. Each item may carry:
- A binary file (when `inputType` is `binary`) stored under the `binaryProperty` field.
- A URL string (when `inputType` is `url`).

When batch processing is enabled, the node collects documents from all incoming items before making a single API call.

### Output

Each input item produces one output item. The output item retains all original JSON properties from the input and adds an extracted OCR text field under the node's output namespace. The exact response shape mirrors the Mistral OCR API response for the processed document/image.

When the API call fails for an individual document (e.g. invalid URL, unsupported format), the behavior depends on `continueOnFail`:
- If `continueOnFail` is `false` (default), the node throws and halts execution.
- If `continueOnFail` is `true`, the failed item is passed through with an `error` property instead of the OCR result.

### Errors

- Missing binary data when `inputType` is `binary` and no binary property matches → throw.
- Invalid or unreachable URL when `inputType` is `url` → throw (or pass through on `continueOnFail`).
- Mistral API errors (auth, rate-limit, unsupported content) → throw (or pass through on `continueOnFail`).

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: extract text from binary document

**Given** input items:

```json
[
  {
    "json": { "fileRef": "invoice" },
    "binary": {
      "data": { "mimeType": "application/pdf", "data": "JVBERi0..." }
    }
  }
]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "model": "mistral-ocr-latest",
  "inputType": "binary",
  "binaryProperty": "data"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "fileRef": "invoice",
      "extractedText": "..."
    },
    "binary": {
      "data": { "mimeType": "application/pdf", "data": "JVBERi0..." }
    }
  }
]
```

### Test: extract text from URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "model": "mistral-ocr-latest",
  "inputType": "url",
  "url": "https://example.com/invoice.pdf"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "extractedText": "..."
    }
  }
]
```

### Test: batch processing with delete

**Given** input items:

```json
[
  { "json": { "id": 1 }, "binary": { "doc": { "mimeType": "application/pdf", "data": "..." } } },
  { "json": { "id": 2 }, "binary": { "doc": { "mimeType": "application/pdf", "data": "..." } } }
]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "model": "mistral-ocr-latest",
  "inputType": "binary",
  "binaryProperty": "doc",
  "options": {
    "batch": true,
    "batchSize": 5,
    "deleteFiles": true
  }
}
```

**Expect** output[0] and output[1] each contain their respective `id` plus `extractedText`.

### Test: continueOnFail with bad URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "model": "mistral-ocr-latest",
  "inputType": "url",
  "url": "https://invalid.example/nonexistent.pdf",
  "continueOnFail": true
}
```

**Expect** output[0] to contain an `error` property describing the failure and the original input data passed through.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation set | documented | Public n8n docs specify Document + Extract Text only |
| Model parameter | documented | Fixed to `mistral-ocr-latest` per docs |
| Input types (binary vs URL) | documented | Confirmed in public n8n docs and corpus schema |
| Batch processing options | documented | batch, batchSize, deleteFiles all in public docs |
| Exact output shape under `extractedText` | inferred | Depends on Mistral OCR API response; not documented by n8n |
| Error handling details | inferred | Follows standard n8n `continueOnFail` pattern |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mistralAi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
