---
type: n8n-nodes-base.googleCloudStorage
displayName: Google Cloud Storage
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Cloud Storage

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudstorage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://cloud.google.com/storage/docs/apis | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleCloudStorage`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCloudStorageOAuth2Api` (extends Google OAuth2 single-service credential)

## Parameters

The node exposes two resources (Bucket, Object), each with five operations.

### Resource: Bucket

| Operation | Parameters | notes |
|-----------|-----------|-------|
| Create | `projectId`, `name`, `bucketType` (regional / multi-regional, etc.), optional predefined ACL | Requires project and globally unique name |
| Delete | `name` | Deletes bucket by name |
| Get | `name` | Returns bucket metadata |
| Get Many | `projectId`, optional `maxResults`, `pageToken` | Lists buckets matching the project |
| Update | `name`, `bucketType` fields to modify | Updates bucket metadata |

### Resource: Object

| Operation | Parameters | notes |
|-----------|-----------|-------|
| Create | `bucketName`, `objectName`, `data` (binary or string body), optional `contentType`, `predefinedAcl` | Uploads file to bucket |
| Delete | `bucketName`, `objectName` | Deletes object from bucket |
| Get | `bucketName`, `objectName` | Returns object metadata (not the data body) |
| Get Many | `bucketName`, optional `prefix`, `delimiter`, `maxResults`, `pageToken` | Lists objects in a bucket |
| Update | `bucketName`, `objectName`, metadata fields to change | Updates object metadata |

All parameters accept expressions. Object Create supports binary input from a preceding node.

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be read from the item via expressions.

### Output

Each operation emits one output item per input item. The output `json` contains the API response for the performed operation (bucket metadata, object metadata, or list results). Object Create returns the uploaded object's metadata. Get Many returns an array of results under a key; the exact key name depends on the resource (buckets vs objects).

### Errors

Google Cloud API errors (403 forbidden, 404 not found, 409 conflict for duplicate names) are surfaced as thrown errors. On `continueOnFail`, the node emits an item with a `json.error` property and proceeds to the next input.

### Expressions

All parameter values accept expression strings (`{{ }}`).

## Acceptance tests

### Test: bucket create

**Given** input items:

```json
[{ "json": { "projectId": "my-project", "bucketName": "n8n-test-bucket-42" } }]
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
[{ "json": { "bucket": "my-bucket" } }]
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

### Test: object upload

**Given** input items:

```json
[{
  "json": { "bucket": "my-bucket", "key": "uploads/report.csv" },
  "binary": { "file": { "data": "bmFtZSxlbWFpbA0KQWxpY2UsYUBleGFtcGxlLmNvbQ==", "mimeType": "text/csv", "fileName": "report.csv" } }
}]
```

**Parameters:**

```json
{
  "resource": "object",
  "operation": "create",
  "bucketName": "={{ $json.bucket }}",
  "objectName": "={{ $json.key }}",
  "binaryData": true,
  "binaryPropertyName": "file"
}
```

**Expect** output[0] `json.name` to equal `"uploads/report.csv"` and `json.bucket` to equal `"my-bucket"`.

### Test: bucket delete

**Given** input items:

```json
[{ "json": { "bucketName": "temp-bucket-to-delete" } }]
```

**Parameters:**

```json
{
  "resource": "bucket",
  "operation": "delete",
  "name": "={{ $json.bucketName }}"
}
```

**Expect** output[0] to be a passthrough item (the API typically returns the deleted bucket's metadata or a success response; the node preserves the input item).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Documented | Public docs list Bucket + Object with 5 ops each |
| Credential type | Documented | Google OAuth2 single-service; extends shared Google credential |
| Exact parameter names | Inferred | Derived from GCS REST API contract — names follow Google Cloud naming conventions |
| Binary upload specifics | Inferred | Object Create supports binary data following n8n conventions for file upload nodes |
| Pagination details | Inferred | Get Many uses `maxResults` and `pageToken` consistent with GCS API |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/google-cloud-storage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only