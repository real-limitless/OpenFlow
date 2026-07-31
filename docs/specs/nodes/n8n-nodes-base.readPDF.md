---
type: n8n-nodes-base.readPDF
displayName: Extract from PDF (Read PDF)
category: Files
versions: [1]
priority: medium
status: specced
---

# Extract from PDF (Read PDF)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/ | Public docs only |
| Public node descriptor metadata (type string, display name, category, version) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.readPDF`
- **Aliases:** (none)
- **Display name:** `Extract from PDF`
- **Group / category:** `core` · Core Nodes · Files
- **Versions:** `1` (single version)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `binaryPropertyName` | string | `data` | yes | — | Name of the input binary field containing the PDF file to extract text from |

The node has a single operation — PDF text extraction — so there is no `operation` parameter.

No options collection or additional parameters.

## Runtime behavior

### Input

Accepts one or more items. Each item must carry binary data (base64-encoded) in the field named by `binaryPropertyName`. The binary data must be a valid PDF document.

The `json` payload of each input item is not carried forward to the output.

### Output

For each input item, the node reads the PDF binary, parses it using a PDF text-extraction library, and produces a single output item with a `json` object containing:

| field | type | description |
|-------|------|-------------|
| `text` | string | Full extracted text content of the PDF, concatenated across all pages |
| `metadata` | object \| null | PDF metadata (author, creator, producer, subject, title, keywords, creationDate, modificationDate) if available; `null` if absent |
| `numPages` | number | Total number of pages in the PDF |
| `version` | string | PDF format version (e.g. `"1.4"`) |

The binary data is not carried forward to output items.

### Errors

- Throws if `binaryPropertyName` is empty.
- Throws if the named binary field is missing on an input item.
- Throws if the binary content is not a valid PDF (unparseable header or encrypted without password).
- `continueOnFail`: when enabled, a failed item produces an error item on `main[0]` with `json.error` containing the error message; other items continue processing.

### Expressions

All parameter values may contain expressions (resolved by the engine before the executor runs).

## Acceptance tests

### Test: basic PDF text extraction

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNjUgMDAwMDAgbiAKMDAwMDAwMDEyNCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjIxNgolJUVPRA==",
        "mimeType": "application/pdf",
        "fileName": "doc.pdf",
        "fileExtension": "pdf"
      }
    }
  }
]
```

**Parameters:**

```json
{ "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item. `json.text` is a non-empty string. `json.numPages` is a positive integer. `json.metadata` is an object or null.

### Test: custom binary property name

**Given** input items with binary data in a custom field:

```json
[
  {
    "json": {},
    "binary": {
      "attachment": {
        "data": "JVBERi0xLjQK...",
        "mimeType": "application/pdf"
      }
    }
  }
]
```

**Parameters:**

```json
{ "binaryPropertyName": "attachment" }
```

**Expect** output[0][0] has `json.text` populated with the extracted content (no error).

### Test: continueOnFail — invalid PDF binary

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "bm90IGEgdmFsaWQgcGRm",
        "mimeType": "application/pdf"
      }
    }
  }
]
```

(base64 of `not a valid pdf`)

**Parameters:**

```json
{ "binaryPropertyName": "data" }
```

**And** `continueOnFail: true`

**Expect** output[0] has 1 item with `json.error` containing an error message about invalid or unparseable PDF content.

### Test: per-item processing (multiple items)

**Given** input items with 2 items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "JVBERi0xLjQK...",
        "mimeType": "application/pdf"
      }
    }
  },
  {
    "json": {},
    "binary": {
      "data": {
        "data": "JVBERi0xLjQK...",
        "mimeType": "application/pdf"
      }
    }
  }
]
```

**Parameters:**

```json
{ "binaryPropertyName": "data" }
```

**Expect** output[0] has 2 items. Both have `json.text` as non-empty strings. Items are independent — the output array length equals the input array length (assuming both PDFs are valid).

### Test: missing binary field

**Given** input items with no binary data:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "binaryPropertyName": "data" }
```

**Expect** the node throws an error (or produces an error item if `continueOnFail` is true).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, group, category | documented | Public descriptor metadata |
| `binaryPropertyName` parameter | documented | Shared parent parameter on Extract From File node docs |
| PDF-only operation (no operation selector) | inferred | Separate type `n8n-nodes-base.readPDF` is exclusive to PDF extraction |
| Output shape (`text`, `metadata`, `numPages`, `version`) | inferred | Standard output shape from pdf-parse / pdfjs-dist libraries; not explicitly documented in n8n public docs |
| Exact metadata fields | inferred | Standard PDF info dictionary fields |
| Error behavior for invalid PDFs | inferred | General n8n node error conventions |
| No options collection | inferred | From public descriptor metadata |
| Single version (no version diffs) | inferred | Node version is 1.0 |
| `json` pass-through | inferred | Not documented; the parent Extract From File node drops input json for most operations |
| Zip/compressed PDF support | undocumented | `pdf-parse` typically gunzips automatically |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/read-pdf.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Library note:** Requires a PDF text-extraction library (e.g. `pdfjs-dist` or `pdf-parse`).