---
type: n8n-nodes-base.awsS3
displayName: AWS S3
category: Data & Storage
versions: [1]
priority: low
status: specced
---

# S3

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsS3.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsS3`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `s3` (required)

The `s3` credential holds an S3 Endpoint URL, Region, Access Key ID, Secret Access Key, Force Path Style toggle, and Ignore SSL Issues toggle. It authenticates against any S3-compatible service (MinIO, Wasabi, DigitalOcean Spaces, Tigris).

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options: `bucket`, `file`, `folder` | `file` | yes | — | Which S3 resource type to operate on |

### Bucket operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options: `create`, `delete`, `getAll`, `search` | `create` | yes | `resource=bucket` | — |
| `name` | string | — | yes | `resource=bucket, operation=create` | Name for the new bucket |
| `additionalFields.acl` | options | — | no | `resource=bucket, operation=create` | Canned ACL: `authenticatedRead`, `Private`, `publicRead`, `publicReadWrite` |
| `additionalFields.bucketObjectLockEnabled` | boolean | `false` | no | `resource=bucket, operation=create` | Enable S3 Object Lock |
| `additionalFields.grantFullControl` | boolean | `false` | no | `resource=bucket, operation=create` | — |
| `additionalFields.grantRead` | boolean | `false` | no | `resource=bucket, operation=create` | — |
| `additionalFields.grantReadAcp` | boolean | `false` | no | `resource=bucket, operation=create` | — |
| `additionalFields.grantWrite` | boolean | `false` | no | `resource=bucket, operation=create` | — |
| `additionalFields.grantWriteAcp` | boolean | `false` | no | `resource=bucket, operation=create` | — |
| `additionalFields.region` | string | — | no | `resource=bucket, operation=create` | Override credential region for this bucket |
| `name` | string | — | yes | `resource=bucket, operation=delete` | Name of bucket to delete |
| `returnAll` | boolean | `false` | no | `resource=bucket, operation=getAll` | — |
| `limit` | number | `100` | no | `resource=bucket, operation=getAll, returnAll=false` | Max 500 |
| `bucketName` | string | — | yes | `resource=bucket, operation=search` | Bucket to search within |
| `returnAll` | boolean | `false` | no | `resource=bucket, operation=search` | — |
| `limit` | number | `100` | no | `resource=bucket, operation=search, returnAll=false` | Max 500 |
| `additionalFields.delimiter` | string | — | no | `resource=bucket, operation=search` | Character used to group keys |
| `additionalFields.encodingType` | options: `url` | — | no | `resource=bucket, operation=search` | Encoding for object keys |
| `additionalFields.fetchOwner` | boolean | `false` | no | `resource=bucket, operation=search` | Include owner field in results |
| `additionalFields.prefix` | string | — | no | `resource=bucket, operation=search` | Limit response to keys beginning with prefix |
| `additionalFields.requesterPays` | boolean | `false` | no | `resource=bucket, operation=search` | Requester pays for requests and data transfer |
| `additionalFields.startAfter` | string | — | no | `resource=bucket, operation=search` | Start listing after this key |

### File operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options: `copy`, `delete`, `download`, `getAll`, `upload` | `download` | yes | `resource=file` | — |
| `sourcePath` | string | — | yes | `resource=file, operation=copy` | Source bucket + key: `/bucket/key` |
| `destinationPath` | string | — | yes | `resource=file, operation=copy` | Dest bucket + key: `/bucket/key` |
| `additionalFields` | collection | `{}` | no | `resource=file, operation=copy` | ACL, grants, lock, encryption, storage class, metadata/tagging directive, requester pays |
| `bucketName` | string | — | yes | `resource=file, operation=upload` | Target bucket |
| `fileName` | string | — | conditional | `resource=file, operation=upload` | Required when `binaryData=false`; optional with hint "uses binary filename" when `binaryData=true` |
| `binaryData` | boolean | `true` | no | `resource=file, operation=upload` | Whether data comes from binary field |
| `fileContent` | string | — | no | `resource=file, operation=upload, binaryData=false` | Text content for non-binary upload |
| `binaryPropertyName` | string | `data` | yes | `resource=file, operation=upload, binaryData=true` | Input binary field name |
| `additionalFields` | collection | `{}` | no | `resource=file, operation=upload` | ACL, grants, lock, parentFolderKey, encryption, storage class, requester pays |
| `tagsUi.tagsValues` | fixedCollection | `{}` | no | `resource=file, operation=upload` | Repeatable key/value pairs |
| `bucketName` | string | — | yes | `resource=file, operation=download` | — |
| `fileKey` | string | — | yes | `resource=file, operation=download` | Key of file to download |
| `binaryPropertyName` | string | `data` | yes | `resource=file, operation=download` | Output binary field name |
| `bucketName` | string | — | yes | `resource=file, operation=delete` | — |
| `fileKey` | string | — | yes | `resource=file, operation=delete` | — |
| `options.versionId` | string | — | no | `resource=file, operation=delete` | Specific version to delete |
| `bucketName` | string | — | yes | `resource=file, operation=getAll` | — |
| `returnAll` | boolean | `false` | no | `resource=file, operation=getAll` | — |
| `limit` | number | `100` | no | `resource=file, operation=getAll, returnAll=false` | Max 500 |
| `options.fetchOwner` | boolean | `false` | no | `resource=file, operation=getAll` | Include owner in results |
| `options.folderKey` | string | — | no | `resource=file, operation=getAll` | Filter to objects under this folder prefix |

### Folder operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options: `create`, `delete`, `getAll` | `create` | yes | `resource=folder` | — |
| `bucketName` | string | — | yes | `resource=folder, operation=create` | — |
| `folderName` | string | — | yes | `resource=folder, operation=create` | — |
| `additionalFields.parentFolderKey` | string | — | no | `resource=folder, operation=create` | Parent folder path |
| `additionalFields.requesterPays` | boolean | `false` | no | `resource=folder, operation=create` | — |
| `additionalFields.storageClass` | options | `standard` | no | `resource=folder, operation=create` | S3 storage class: `standard`, `standardIA`, `onezoneIA`, `intelligentTiering`, `glacier`, `deepArchive` |
| `bucketName` | string | — | yes | `resource=folder, operation=delete` | — |
| `folderKey` | string | — | yes | `resource=folder, operation=delete` | Full folder key/path |
| `bucketName` | string | — | yes | `resource=folder, operation=getAll` | — |
| `returnAll` | boolean | `false` | no | `resource=folder, operation=getAll` | — |
| `limit` | number | `100` | no | `resource=folder, operation=getAll, returnAll=false` | Max 500 |
| `options.fetchOwner` | boolean | `false` | no | `resource=folder, operation=getAll` | — |
| `options.folderKey` | string | — | no | `resource=folder, operation=getAll` | Subfolder prefix to list |

## Runtime behavior

### Input

- **Upload (binary):** reads from `binaryPropertyName` on each input item.
- **Upload (text):** reads `fileContent` string and uploads as the file body.
- **Copy:** reads `sourcePath` and `destinationPath` expressed as `/bucket/key`.
- **All other operations:** consume the input item as context (expressions) but do not carry over binary data.

### Output

Each operation produces output items on `output[0]`:

- **Bucket create/delete:** Returns a single item with `{ success: true }` (or confirmation object).
- **Bucket getAll/search:** Returns array of bucket descriptors with fields like `name`, `creationDate`.
- **File upload/copy/delete:** Returns a single item with `{ success: true }`.
- **File download:** Returns the input item augmented with binary data in `binaryPropertyName`. The `json` portion passes through unchanged.
- **File getAll:** Returns array of file descriptors with fields like `key`, `lastModified`, `size`, `eTag`.
- **Folder create/delete:** Returns `{ success: true }`.
- **Folder getAll:** Returns array of folder (common prefix) descriptors.

### Errors

- Missing required parameters (bucket name, file key, etc.) should throw a `NodeOperationError`.
- S3 API errors (auth failure, bucket not found, network) should propagate as `NodeOperationError` with the upstream error message.
- `continueOnFail`: when enabled, the node outputs `[{ json: { error: message } }]` on `output[0]` instead of throwing.

### Expressions

All string parameters accept expressions (`{{ }}`). The resource/operation selectors do not accept expressions (`noDataExpression: true`).

## Acceptance tests

### Test: bucket create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bucket",
  "operation": "create",
  "name": "test-bucket-{{ $json.id }}",
  "additionalFields": {
    "acl": "publicRead",
    "region": "us-east-1"
  }
}
```

**Expect** output[0] contains a single item with `{ success: true }`.

### Test: file upload (binary)

**Given** input items:

```json
[{
  "json": { "id": "doc1" },
  "binary": { "data": { "mimeType": "text/plain", "data": "SGVsbG8gV29ybGQ=" } }
}]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "bucketName": "my-bucket",
  "fileName": "hello.txt",
  "binaryData": true,
  "binaryPropertyName": "data",
  "additionalFields": {
    "acl": "private",
    "storageClass": "standard"
  }
}
```

**Expect** output[0] contains `{ success: true }`. The file is stored at `my-bucket/hello.txt`.

### Test: file download

**Given** input items:

```json
[{ "json": { "fileId": "123" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "download",
  "bucketName": "my-bucket",
  "fileKey": "documents/{{ $json.fileId }}.pdf",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] has `json` unchanged and `binary.data` contains the downloaded file.

### Test: file getAll with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "getAll",
  "bucketName": "my-bucket",
  "returnAll": true,
  "options": {
    "fetchOwner": true,
    "folderKey": "subfolder/"
  }
}
```

**Expect** output[0] is an array of file descriptors, each with at minimum `key`, `lastModified`, `size`, `eTag`.

### Test: folder create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "folder",
  "operation": "create",
  "bucketName": "my-bucket",
  "folderName": "new-folder",
  "additionalFields": {
    "parentFolderKey": "parent/path/"
  }
}
```

**Expect** output[0] contains `{ success: true }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output item shapes | Inferred | Exact response fields for bucket list, file list, etc. depend on the S3 API response; spec states the minimal expected fields |
| Copy operation additional fields | Documented | Full list extracted from public descriptor; covers ACL, grants, lock, encryption, storage class, directives |
| Wasabi ACL toggle requirement | Public docs | Wasabi requires ACL dropdown not toggles |
| Credential fields | Public docs | S3 Endpoint, Region, Access Key ID, Secret Access Key, Force Path Style, Ignore SSL Issues |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/awsS3.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
