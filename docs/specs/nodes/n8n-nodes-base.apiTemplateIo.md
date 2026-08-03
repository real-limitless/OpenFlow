---
type: n8n-nodes-base.apiTemplateIo
displayName: APITemplate.io
category: Transform
versions: [1]
priority: low
status: specced
---

# APITemplate.io

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.apitemplateio.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/apitemplateio.md | Public docs only |
| https://apitemplate.io/apiv2/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.apiTemplateIo`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `apiTemplateIoApi`

## Credentials

API-key based authentication. The credential stores a single **API Key** string obtained from the APITemplate.io dashboard under **API Integration**. The key is sent as a Bearer token or query parameter in the `Authorization` header per the upstream API contract.

## Parameters

The node exposes three resources, each with one operation. The user selects a resource, then an operation, and fills the relevant parameters.

### Resource: Account (Operation: Get)

Fetches metadata about the authenticated APITemplate.io account.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixedString | `account` | yes | Internal discriminator |
| operation | fixedString | `get` | yes | Internal discriminator |

No additional parameters.

### Resource: Image (Operation: Create)

Generates an image from a template. The upstream APITemplate.io API accepts a template ID and variable values, then returns a rendered image.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixedString | `image` | yes | Internal discriminator |
| operation | fixedString | `create` | yes | Internal discriminator |
| templateId | string | — | yes | The ID of the APITemplate.io template to render |
| data | object | `{}` | no | JSON object whose keys are template variable names and values are the substitution values. Accepts expressions. |
| options.expiration | number | — | no | Minutes until the generated image URL expires |

### Resource: PDF (Operation: Create)

Generates a PDF document from a template.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixedString | `pdf` | yes | Internal discriminator |
| operation | fixedString | `create` | yes | Internal discriminator |
| templateId | string | — | yes | The ID of the APITemplate.io template to render |
| data | object | `{}` | no | JSON template variable substitutions |
| options.expiration | number | — | no | Minutes until the generated PDF URL expires |
| options.outputFormat | string | `pdf` | no | Output format (`pdf`, `html`, etc. if supported by upstream) |

## Runtime behavior

### Input

Each input item is processed independently. The `data` parameter (and any nested fields) can reference properties of the incoming item (or any previous node output) via expressions.

### Output

For every input item, the node produces exactly one output item containing the original input properties plus a new `apiTemplateIo` envelope object whose shape depends on the resource:

- **Account → Get:** Returns the account object from the upstream API response.
- **Image → Create:** Returns an object with `url` (rendered image URL), `template_id`, and any other fields returned by the upstream render endpoint.
- **PDF → Create:** Returns an object with `url` (rendered PDF URL), `download_url`, `template_id`, and any other fields returned by the upstream render endpoint.

### Errors

- If the upstream API returns a non-2xx status (invalid API key, unknown template ID, quota exceeded), the node throws an error with the upstream error message.
- If `continueOnFail` is enabled, the node returns an error item (with `json.error` populated) instead of throwing.
- Missing required parameters (`templateId` for PDF/Image) should produce a validation error before any API call.

### Expressions

The following parameters accept expression strings that reference previous node output or workflow variables: `templateId`, `data` (and all nested keys within data), `options.expiration`, `options.outputFormat`.

## Acceptance tests

### Test: account get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "get"
}
```

**Expect** output[0] to contain an `apiTemplateIo` property with account metadata (e.g. `email`, `plan`, `credits`).

### Test: pdf create with data

**Given** input items:

```json
[{ "json": { "customerName": "Alice", "orderTotal": 49.99 } }]
```

**Parameters:**

```json
{
  "resource": "pdf",
  "operation": "create",
  "templateId": "tmpl_abc123",
  "data": {
    "name": "={{ $json.customerName }}",
    "total": "={{ $json.orderTotal }}"
  }
}
```

**Expect** output[0] to contain the original `customerName` and `orderTotal` keys plus an `apiTemplateIo` object with `url` (string starting with `https://`), `download_url`, and `template_id` equal to `"tmpl_abc123"`.

### Test: image create (minimal)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "create",
  "templateId": "tmpl_def456"
}
```

**Expect** output[0] to contain an `apiTemplateIo` object with `url` (string starting with `https://`) and `template_id` equal to `"tmpl_def456"`.

### Test: missing required parameter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "pdf",
  "operation": "create"
}
```

**Expect** a validation error indicating that `templateId` is required.

### Test: auth failure

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "get"
}
```

**With** invalid credentials. **Expect** the node to throw an error with a message indicating authentication failure.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented in public n8n docs | Account (get), Image (create), PDF (create) confirmed |
| Credential shape | Documented in public n8n docs | API key from dashboard |
| Template ID parameter | Inferred | Required for render; naming and type are reasonable assumptions |
| Data/options structure | Inferred | `data` for template variables and `expiration` for URL expiry are typical for template-render APIs |
| Upstream API endpoint URLs | Inferred | Not documented in n8n docs; executor must use APITemplate.io API v2 |
| Output envelope key name | Inferred | Named `apiTemplateIo` following OpenFlow convention |
| Output shape details | Inferred | `url`, `download_url`, `template_id` are likely but unconfirmed |
| AI tool mode | Documented in public n8n docs | The node can be used as an AI agent tool with `$fromAI()` dynamic parameters |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/ApiTemplateIoExecutor.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
