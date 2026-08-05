---
type: n8n-nodes-base.googleCloudStorageTool
displayName: Google Cloud Storage
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Cloud Storage (AI Tool)

A tool variant of the Google Cloud Storage node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Bucket (create/delete/get/getMany/update) and Object (create/delete/get/getMany/update) operations against the Google Cloud Storage JSON API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudstorage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://cloud.google.com/storage/docs/apis | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleCloudStorageTool`
- **Aliases:** (none — tool variant shares behavior with base app node)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCloudStorageOAuth2Api` (extends Google OAuth2 single-service credential)

## Parameters

The node exposes two resources (Bucket, Object), each with five operations. Parameter shapes match the base Google Cloud Storage node (`n8n-nodes-base.googleCloudStorage`), with additional AI-support metadata enabling `$fromAI()` dynamic population.

### Resource: Bucket

| Operation | Key parameters |
|-----------|----------------|
| Create | `projectId`, `name`, `bucketType`, optional `predefinedAcl` |
| Delete | `name` |
| Get | `name` |
| Get Many | `projectId`, optional `maxResults`, `pageToken` |
| Update | `name`, bucket-type fields to modify |

### Resource: Object

| Operation | Key parameters |
|-----------|----------------|
| Create | `bucketName`, `objectName`, `data` (binary or string body), optional `contentType`, `predefinedAcl` |
| Delete | `bucketName`, `objectName` |
| Get | `bucketName`, `objectName` |
| Get Many | `bucketName`, optional `prefix`, `delimiter`, `maxResults`, `pageToken` |
| Update | `bucketName`, `objectName`, metadata fields to change |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions.
- The "let model fill" toggle is available on appropriate parameter fields.
- Tool name and description metadata are configurable in the AI Agent node.
- Binary-data operations (Object Create with binary input) depend on the runtime's binary-data plumbing and may be constrained in agent contexts.

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be read from the item via expressions. In AI agent mode, some or all parameters may be supplied by the model via `$fromAI()`.

### Output

Each operation emits one output item per input item. The output `json` contains the API response for the performed operation (bucket metadata, object metadata, or list results). Object Create returns the uploaded object's metadata. Get Many returns an array of results; the exact key name depends on the resource (buckets vs objects).

### Errors

Google Cloud Storage API errors (403 forbidden, 404 not found, 409 conflict) are surfaced as thrown errors. On `continueOnFail`, the node emits an item with a `json.error` property and proceeds to the next input.

### Expressions

All parameter values accept expression strings (`{{ }}`). In AI agent context, `$fromAI()` expressions may also appear.

## Acceptance tests

### Test: bucket create

**Given** input items:

```json
[{ "json": { "projectId": "my-project", "bucketName": "n8n-test-tool-bucket" } }]
```

**Parameters:**

```json
{
  "resource": "bucket",
  "operation": "create",
  "projectId": "={{ $json.projectId }}",
  "name": "={{ $json.bucketName }}"
}
```

**Expect** output[0] to have `json.name` equal to the created bucket name and `json.kind` equal to `"storage#bucket"`.

### Test: object list

**Given** input items:

```json
[{ "json": { "bucket": "my-tool-bucket" } }]
```

**Parameters:**

```json
{
  "resource": "object",
  "operation": "getAll",
  "bucketName": "={{ $json.bucket }}"
}
```

**Expect** output[0] `json.items` to be an array; each entry has `json.kind` equal to `"storage#object"`.

### Test: AI agent tool parameter population

**Given** an AI agent context where the model calls this tool with bucket name and region from its own reasoning:

**Parameters (model-supplied via $fromAI()):**

```json
{
  "resource": "bucket",
  "operation": "create",
  "name": "ai-generated-bucket-name",
  "projectId": "my-gcp-project",
  "bucketType": "regional"
}
```

**Expect** output[0] `json.name` to equal `"ai-generated-bucket-name"` — the model-supplied parameters are used directly as if they had been entered by a user.

### Test: object delete

**Given** input items:

```json
[{ "json": { "bucketName": "my-tool-bucket", "objectName": "test-file.csv" } }]
```

**Parameters:**

```json
{
  "resource": "object",
  "operation": "delete",
  "bucketName": "={{ $json.bucketName }}",
  "objectName": "={{ $json.objectName }}"
}
```

**Expect** output[0] to contain the deleted object's metadata (or a success indication consistent with the GCS API).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations matching base node | Documented | Tool variant shares the Bucket + Object resource/operation set of the base GCS node |
| Credential type | Documented | Google OAuth2 single-service credential |
| Exact parameter names | Inferred | Derived from GCS JSON API contract and the base node spec |
| $fromAI() support | Documented | General AI tool mechanism documented in n8n docs |
| No dedicated docs page | Confirmed | Tool variant URL returns 404; tool shares base node documentation |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/google-cloud-storage-tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
