---
type: n8n-nodes-base.mindee
displayName: Mindee
category: Utility
versions: [1]
priority: medium
status: specced
---

# Mindee

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mindee.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mindee.md | Public docs only |
| https://docs.mindee.com/use-cases/extraction-models/invoice.md | Public docs only |
| https://docs.mindee.com/use-cases/extraction-models/receipt.md | Public docs only |
| https://docs.mindee.com/integrations/api-reference/extraction-models.md | Public docs only |
| https://docs.mindee.com/integrations/client-libraries-sdk/send-a-file-or-url.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mindee`
- **Aliases:** (none)
- **Inputs:** `main` × 1 — expects one or more items, each carrying binary data (a document image or PDF) for OCR
- **Outputs:** `main` × 1 — emits one output item per input item, enriched with the Mindee prediction result
- **Credentials:** `mindeeInvoiceApi` (API key for the Invoice OCR API) or `mindeeReceiptApi` (API key for the Receipt OCR API), selected based on the chosen operation. Both are plain API-key credentials sent as the `Authorization` header.

**Important caveat:** The n8n public docs for this node describe two operations (Invoice → Predict, Receipt → Predict) that target the **legacy Mindee v1 API**. The public Mindee documentation states the v1 node is deprecated and a v2 replacement is still in development (n8n PR #18986). The Mindee v2 API uses an asynchronous enqueue → poll / webhook pattern with a `model_id` parameter, whereas the v1 API uses synchronous POST. This spec describes the node as it existed at the time of documentation (v1 wrapper), with notes where the v2 contract differs.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `invoice` | yes | — | `invoice` or `receipt`. Selects the Mindee API endpoint and credential type. |
| operation | fixed | `predict` | yes | — | Only `predict` is available for both resources. Sends the input document to Mindee for OCR extraction. |
| inputType | fixed | `binary` | yes | — | How the document is supplied. Only `binary` is used for v1; v2 may also support `url`. |
| binaryProperty | string | `data` | no | — | Name of the binary property on the input item that holds the document file (image or PDF). |
| options | object | — | no | always | Additional configuration (see below). |

### Options sub-parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| rawText | boolean | false | no | When enabled, request the full OCR text of the document alongside extracted fields (Mindee v2 feature `raw_text`). |
| polygon | boolean | false | no | When enabled, request bounding-box polygon coordinates for each extracted field (Mindee v2 feature `polygon`). |
| confidence | boolean | false | no | When enabled, request confidence scores for each extracted field (Mindee v2 feature `confidence`). |

## Runtime behavior

### Input

Each input item **must** carry a document file (image: JPG, PNG, or PDF) in its binary data. The binary property is configurable via `binaryProperty` (default `data`). For v2, the document can alternatively be supplied as a publicly accessible HTTPS URL.

Multiple input items are processed independently — each item produces one output item.

### Output (v1 — Invoice Predict)

The node calls the Mindee Invoice OCR or Receipt OCR synchronous API and attaches the full API response to the output item. The output shape mirrors the Mindee v1 API response:

**Invoice Predict output fields (v1):**
- `id` — document identifier
- `name` — file name
- `number_of_pages` — page count
- `supplier_name` — extracted supplier name
- `supplier_address` — extracted supplier address
- `customer_name` — extracted customer name
- `invoice_number` — extracted invoice number
- `date` — invoice date
- `due_date` — payment due date
- `payment_date` — payment date
- `total_amount` — total including tax
- `currency` — ISO 4217 currency code
- `line_items` — array of line items, each with `description`
- `document_type` — document classification
- `locale` — detected locale (language, country, currency)

**Receipt Predict output fields (v1):**
- `id` — document identifier
- `name` — file name
- `number_of_pages` — page count
- `supplier` — supplier name
- `date` — receipt date
- `time` — receipt time
- `category` — purchase category
- `subcategory` — purchase subcategory
- `total_amount` — total including tax
- `currency` — ISO 4217 currency code
- `document_type` — receipt type classification

The output fields are attached to the item's `json` key alongside all original input data.

### v2 contract (informational — for future node update)

The Mindee v2 Extraction API follows an asynchronous pattern:
1. **POST** `/v2/products/extraction/enqueue` — multipart/form-data or JSON body with `model_id` (required), one of `file`/`url`/`file_base64`, and optional feature toggles (`raw_text`, `polygon`, `confidence`, `rag`, `text_context`, `data_schema`). Returns a `JobResponse` with `job.polling_url`.
2. **Poll** `GET /v2/jobs/{job_id}` until status is `Processed` or `Failed`.
3. **GET** the `result_url` to retrieve the full `ExtractionResponse` with `inference.result.fields` keyed by field accessor name.

Each field value is a typed object (`SimpleFieldResult`, `ObjectFieldResult`, or `ListFieldResult`) with optional `confidence` (Certain/High/Medium) and `locations` (polygon coordinates).

### Errors

- **Missing binary data:** If the input item has no binary data on the configured property, the node should throw, or produce an empty output (depending on `continueOnFail`).
- **API error:** If the Mindee API returns an error (auth failure, unsupported file type, processing failure), the node should throw or, with `continueOnFail`, produce an empty item and append error metadata.
- **v2 timeout:** If polling exceeds the maximum wait time (~590 seconds per Mindee docs), the node should time out and report failure.

### Expressions

`binaryProperty` and `options.*` parameters accept expression strings. The `resource`, `operation`, and `inputType` are typically fixed values set in the editor.

## Acceptance tests

### Test: invoice predict from binary

**Given** input items:

```json
[{
  "json": { "documentId": "inv-001" },
  "binary": {
    "data": {
      "mimeType": "application/pdf",
      "data": "<BASE64_ENCODED_PDF>"
    }
  }
}]
```

**Parameters:**

```json
{
  "resource": "invoice",
  "operation": "predict",
  "binaryProperty": "data"
}
```

**Expect** output[0] to contain:
- `documentId` preserved from input
- `supplier_name` — a non-empty string
- `invoice_number` — a non-empty string
- `total_amount` — a number
- `date` — a date-string
- `currency` — a 3-letter ISO code
- The output shape must be a flat object (not nested under a `data` envelope).

### Test: receipt predict with rawText option

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": {
      "mimeType": "image/jpeg",
      "data": "<BASE64_ENCODED_JPEG>"
    }
  }
}]
```

**Parameters:**

```json
{
  "resource": "receipt",
  "operation": "predict",
  "options": { "rawText": true }
}
```

**Expect** output[0] to contain:
- `supplier` — a non-empty string
- `date` — a date-string
- `total_amount` — a number
- `category` — one of the known purchase categories
- If the API supports `raw_text`, the output should include the full OCR text

### Test: error on missing binary property

**Given** input items:

```json
[{
  "json": { "someKey": "value" }
}]
```

**Parameters:**

```json
{
  "resource": "invoice",
  "operation": "predict"
}
```

**Expect:** node throws or produces empty output with error metadata (depending on `continueOnFail`). No successful output items are produced.

### Test: multiple items processed independently

**Given** input items with two separate document binary payloads.

**Expect:** exactly two output items, each with its own prediction result keyed to the correct input document.

### Test: v2-style URL input (future)

When v2 support is added:

**Given** input items:

```json
[{
  "json": {
    "documentUrl": "https://example.com/invoice.pdf"
  }
}]
```

**Parameters:**

```json
{
  "resource": "invoice",
  "operation": "predict",
  "inputType": "url",
  "urlProperty": "documentUrl",
  "options": { "confidence": true, "polygon": true }
}
```

**Expect** output[0] to contain extracted invoice fields with confidence scores and polygon location data per field.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| v1 API response shape | inferred from n8n schema JSON + Mindee Invoice/Receipt field docs | The schema JSON in the n8n package shows a subset of fields; the Mindee v1 API likely returns more. The spec shows the fields confirmed by the schema. |
| v1 vs v2 distinction | documented | Mindee states the existing n8n node is for v1 (legacy). v2 uses async enqueue+polling. The n8n public docs page still describes the v1 node. |
| Credential structure | documented | n8n credentials docs show two separate API key credentials (Invoice key and Receipt key). |
| Option parameters (rawText, polygon, confidence) | inferred | These are v2 feature toggles. The v1 node may not support them. They are included as forward-looking options. |
| Polling behavior in v2 | documented | Mindee API reference describes the enqueue → poll → result pattern with up to 590s timeout. |
| Exact v1 endpoint URL | inferred | The v1 API endpoints are not documented in the public sources consulted; the node likely calls `https://api.mindee.net/v1/products/<product>/predict`. |

## OpenFlow mapping

- **Definition group:** `data-extraction`
- **Executor file:** `src/lib/engine/executors/mindee.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
