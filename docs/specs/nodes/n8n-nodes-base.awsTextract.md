---
type: n8n-nodes-base.awsTextract
displayName: AWS Textract
category: Utility
versions: [1]
priority: medium
status: specced
---

# AWS Textract

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awstextract/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/textract/latest/dg/API_AnalyzeExpense.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsTextract`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (access key + secret key) or `awsAssumeRole` (STS role assumption)

### Credential fields

| field | type | required | notes |
|-------|------|----------|-------|
| region | string | yes | AWS region code (e.g. `us-east-1`) |
| accessKeyId | string | yes (access-key mode) | IAM access key ID |
| secretAccessKey | string | yes (access-key mode) | IAM secret access key |
| sessionToken | string | no | Temporary security credential session token |
| customEndpoints | collection | no | VPC custom endpoint overrides per service |
| roleArn | string | yes (assume-role mode) | ARN of the IAM role to assume |
| externalId | string | yes (assume-role mode) | External ID required by the role trust policy |
| roleSessionName | string | no | Session name for auditing (default `n8n-session`) |
| stsAccessKeyId | string | conditional | Access key for STS AssumeRole call |
| stsSecretAccessKey | string | conditional | Secret key for STS AssumeRole call |
| stsSessionToken | string | no | Session token for STS call |

## Parameters

The node provides a single operation: analyze a receipt or invoice document via the AWS Textract `AnalyzeExpense` API.

### Operation: Analyze Receipt or Invoice

The document source is specified as **either** inline binary data (`Bytes`) **or** an S3 object reference (`S3Object`). These are mutually exclusive — exactly one must be provided.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"expense"` | yes | — | Only resource; always set to `expense` |
| operation | fixed string | `"analyzeExpense"` | yes | — | Only operation; calls AWS `AnalyzeExpense` |
| documentType | string (`"binary"` / `"s3Object"`) | `"binary"` | yes | — | How the input document is provided |
| binaryPropertyName | string | `"data"` | yes* | when documentType=*binary* | Name of the incoming binary property containing the document image |
| bucketName | string (expression) | — | yes* | when documentType=*s3Object* | S3 bucket name |
| keyName | string (expression) | — | yes* | when documentType=*s3Object* | S3 object key |
| version | string (expression) | — | no | when documentType=*s3Object* | S3 object version |
| region | string | — | yes | — | AWS region to use (overrides credential region) |

> `*` = conditionally required based on the value of `documentType`.

## Runtime behavior

### Input

The node expects input items to provide document data:
- In **binary** mode: a binary field (default `data`) on each input item containing a PNG, JPEG, PDF, or TIFF document.
- In **S3 Object** mode: the bucket name, object key, and optional version extracted from the field parameters or expression values on each item.

Document maximums match the AWS Textract sync API limits: 10 MB file size; supported formats are PNG, JPEG, PDF, and TIFF.

### Output

For each input item the node produces one output item containing the full `AnalyzeExpense` response envelope. The response shape matches the AWS Textract API:

```json
{
  "documentMetadata": { "pages": 1 },
  "expenseDocuments": [
    {
      "expenseIndex": 0,
      "summaryFields": [ ... ],
      "lineItemGroups": [
        {
          "lineItemGroupIndex": 0,
          "lineItems": [ ... ]
        }
      ]
    }
  ]
}
```

Key sub-structures:
- **`summaryFields`** — header-level fields (vendor name, date, total, tax, etc.) from the document header region. Each field exposes `type` (label, e.g. "NAME", "TOTAL"), `labelDetection` (the OCR label text + geometry), `valueDetection` (the value text + geometry), `currency`, and `groupProperties`.
- **`lineItemGroups`** — line-item tables. Each `lineItem` contains `lineItemExpenseFields` with per-column `type`, `labelDetection`, `valueDetection`, and `currency`.

The node also passes through the raw AWS response metadata including `documentMetadata.pages`.

### Errors

API-level errors (access denied, bad document, document too large, throttling, unsupported format, invalid parameters, internal server error) must be surfaced as thrown errors during execution. The standard `continueOnFail` option applies: when enabled, the node outputs an error item instead of halting the workflow.

### Expressions

The following parameters accept expression strings:
- `binaryPropertyName`
- `bucketName`
- `keyName`
- `version`
- `region`

## Acceptance tests

### Test: basic binary document analysis

**Given** input items:

```json
[{
  "json": { "fileName": "receipt.jpg" },
  "binary": {
    "data": {
      "mimeType": "image/jpeg",
      "data": "<base64-encoded-image-bytes>"
    }
  }
}]
```

**Parameters:**

```json
{
  "documentType": "binary",
  "binaryPropertyName": "data",
  "region": "us-east-1"
}
```

**Expect** output[0] to contain a single item with:
- A top-level `documentMetadata` object with a numeric `pages` field
- A non-empty `expenseDocuments` array
- Each expense document has `expenseIndex`, `summaryFields`, and `lineItemGroups`
- `summaryFields` entries contain `type.text` and either `valueDetection.text` or `currency`
- `lineItemGroups` entries contain `lineItems` with `lineItemExpenseFields`

### Test: S3 object document analysis

**Given** input items:

```json
[{
  "json": {}
}]
```

**Parameters:**

```json
{
  "documentType": "s3Object",
  "bucketName": "my-invoice-bucket",
  "keyName": "invoices/2024-01.pdf",
  "region": "eu-west-1"
}
```

**Expect** output[0] to contain one item with the same `AnalyzeExpense` response shape as Test 1.

### Test: error on missing document

**Given** input items:

```json
[{
  "json": {},
  "binary": {}
}]
```

**Parameters:**

```json
{
  "documentType": "binary",
  "binaryPropertyName": "data",
  "region": "us-east-1"
}
```

**Expect** the node to throw an error (no binary data available) unless `continueOnFail` is set, in which case it outputs an error item.

### Test: region override

**Given** input items and binary data as in Test 1, with `region` set to `"eu-central-1"`, **expect** the AWS SDK client to be constructed with region `eu-central-1`, overriding the credential-level region.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs | n8n docs confirm single operation "Analyze Receipt or Invoice" |
| Document input mechanism | Public docs + AWS API reference | Two mutually exclusive input modes (binary bytes vs S3 object) match the AWS `Document` union type |
| Output shape | AWS API reference | Full `AnalyzeExpense` response documented publicly by AWS |
| Error types | AWS API reference | All error codes documented in the AWS Textract API reference |
| Credential model | Public n8n docs | Standard AWS credential type shared across all n8n AWS nodes |
| region override parameter | Public docs | Confirmed by n8n AWS node patterns and public docs |
| `resource` / `operation` fixed values | Public JSON descriptor | Type string and category confirmed from package descriptor; fixed resource/operation approach inferred from n8n app-node pattern |

## OpenFlow mapping

- **Definition group:** `core` (app node with AWS SDK dependency)
- **Executor file:** `src/lib/engine/executors/awsTextract.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **AWS SDK dependency:** `@aws-sdk/client-textract` (or equivalent SDK v3 service client)
