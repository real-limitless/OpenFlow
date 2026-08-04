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
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mistralai/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mistral/ | Public docs only |
| https://docs.mistral.ai/api/endpoint/ocr | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mistralAi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mistralCloudApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `document` | yes | — | Only resource: `document` |
| operation | string | `extractText` | yes | — | Only operation: `extractText` |
| model | string | `mistral-ocr-latest` | no | — | OCR model identifier; currently requires `mistral-ocr-latest` |
| documentType | string | `document` | no | — | `document` or `image` — the kind of file being processed; maps to the OCR API document type key |
| inputType | string | `binary` | no | — | `binary` or `url` |
| inputBinaryField | string | `data` | no | `{ inputType: ["binary"] }` | Input binary field name when using binary input; max 50 MB, max 1000 pages |
| url | string | — | no | `{ inputType: ["url"] }` | URL of document or image to process when using URL input |
| options.batch | boolean | false | no | — | Enable batch processing — group multiple documents into one API call |
| options.batchSize | number | 50 | no | `{ options.batch: [true] }` | Maximum documents per batch request |
| options.deleteFiles | boolean | true | no | `{ options.batch: [true] }` | Whether to delete uploaded files from Mistral Cloud after batch processing completes; defaults to true when batch is enabled |

## Runtime behavior

### Input

Each input item may carry:
- **Binary data** (when `inputType=binary`): the document file in the binary field named by `inputBinaryField`.
- **A URL string** (when `inputType=url`): a resolvable HTTP/HTTPS URL pointing to the document or image.

### Output

For each input item, the node calls the Mistral `POST /v1/ocr` endpoint and produces one output item containing the API response:

```json
{
  "json": {
    "model": "<model-id>",
    "pages": [
      {
        "index": 0,
        "markdown": "...",
        "images": [
          { "id": "...", "top_left_x": 0, "top_left_y": 0, "bottom_right_x": 0, "bottom_right_y": 0, "image_base64": "..." }
        ],
        "dimensions": { "dpi": 200, "height": 2200, "width": 1700 }
      }
    ],
    "usage_info": { "pages_processed": 1, "doc_size_bytes": null }
  }
}
```

All response keys use snake_case as returned by the Mistral OCR API (e.g. `usage_info`, `pages_processed`, `doc_size_bytes`).

### API contract — document payload

When building the OCR request body, the `document` object must use the correct type key matching the document kind:

- `documentType = document` → `{ "type": "document_url", "document_url": "..." }`
- `documentType = image` → `{ "type": "image_url", "image_url": "..." }`

These are the exact keys the Mistral `/v1/ocr` endpoint expects — not camelCase variants.

### Batch processing flow

When **batch processing** is enabled (options.batch = true), the node:

1. Groups incoming items into batches of up to `batchSize` documents per API call.
2. For binary input items, uploads each file to the Mistral Files API (`POST /v1/files` with `purpose=ocr`) and tracks the returned file IDs.
3. Constructs OCR requests that reference the uploaded file IDs (using the signed URL or inline file reference).
4. After all batch pages are collected and distributed back to output items, sends `DELETE /v1/files/{id}` for each uploaded file if `deleteFiles` is true (defaults to true when batch is enabled).

### Errors

- Network or API errors (bad URL, unreachable host, auth failure) throw an exception that follows the standard `continueOnFail` behavior: if enabled, the node emits an error item instead of halting.
- Documents exceeding the 50 MB or 1000-page limit produce an error for that item.
- Empty responses (no pages returned) produce an item with a `pages` array of length 0.

### Expressions

All string and number parameters accept expression strings (e.g. `{{ $json.url }}` for the URL parameter).

## Acceptance tests

### Test: extract text from a binary document

**Given** input items:

```json
[{ "json": {}, "binary": { "file": { "data": "<base64-pdf-content>", "mimeType": "application/pdf" } } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "inputType": "binary",
  "inputBinaryField": "file"
}
```

**Expect** output[0] to contain a `pages` array where each entry has at least `index`, `markdown`, and `dimensions` fields.

### Test: extract text from a URL

**Given** input items:

```json
[{ "json": { "url": "https://arxiv.org/pdf/2201.04234" } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "inputType": "url",
  "url": "={{ $json.url }}"
}
```

**Expect** output[0] to contain a `pages` array with markdown content extracted from the PDF.

### Test: batch processing with deleteFiles

**Given** input items:

```json
[
  { "json": {}, "binary": { "file1": { "data": "<base64>" } } },
  { "json": {}, "binary": { "file1": { "data": "<base64>" } } }
]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "inputType": "binary",
  "inputBinaryField": "file1",
  "options": { "batch": true, "batchSize": 50, "deleteFiles": true }
}
```

**Expect** both output items to contain OCR results, and files to be deleted after processing.

### Test: continueOnFail with bad URL

**Given** input item with an unresolvable URL:

```json
[{ "json": { "url": "https://nonexistent.example/document.pdf" } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "extractText",
  "inputType": "url",
  "url": "={{ $json.url }}",
  "options": { "continueOnFail": true }
}
```

**Expect** output[0] to be an error item (not a throw).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact OCR API response shape | Public docs (Mistral API) | Shape confirmed via Mistral OCR API reference |
| Binary upload mechanism | Inferred | Must upload binary to Mistral Files API or use base64 inline; exact mechanism left to implementation |
| Credential type | Public docs | `mistralCloudApi` with API key |
| Batch processing upload flow | Inferred | Documents likely uploaded via Files API then referenced by ID; exact flow left to implementation |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mistralAi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
