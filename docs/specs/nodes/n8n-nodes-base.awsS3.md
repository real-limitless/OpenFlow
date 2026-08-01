---
type: n8n-nodes-base.awsS3
displayName: AWS S3
category: Development, Data & Storage
versions: [2]
priority: medium
status: specced
---

# AWS S3

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awss3/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsS3`
- **Aliases:** `n8n-nodes-base.s3` (v1 variant)
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
| customEndpoints | collection | no | VPC custom endpoint overrides per service (S3, Lambda, SNS, etc.) |
| roleArn | string | yes (assume-role mode) | ARN of the IAM role to assume |
| externalId | string | yes (assume-role mode) | External ID required by the role trust policy |
| roleSessionName | string | no | Session name for auditing (default `n8n-session`) |
| stsAccessKeyId | string | conditional | Access key for STS AssumeRole call |
| stsSecretAccessKey | string | conditional | Secret key for STS AssumeRole call |
| stsSessionToken | string | no | Session token for STS call |

## Parameters

### Resource: `bucket`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `bucket` | yes | — | Fixed value `bucket` |
| operation | options | `create` | yes | resource=bucket | `create`, `delete`, `getAll`, `search` |
| name | string | `""` | yes (create, delete) | resource=bucket, operation in first group | Bucket name |
| returnAll | boolean | `false` | no | operation=getAll/search | When false, `limit` controls pagination |
| limit | number | `100` | no | returnAll=false | Max results (1–500) |
| bucketName | string | `""` | yes (search) | operation=search | Bucket to search within |
| additionalFields | collection | `{}` | no | operations create/search | See Additional Fields below |

**Bucket `create` Additional Fields:**

| name | type | default | notes |
|------|------|---------|-------|
| acl | options | `""` | Canned ACL: `authenticatedRead`, `Private`, `publicRead`, `publicReadWrite` |
| bucketObjectLockEnabled | boolean | `false` | Enable S3 Object Lock on new bucket |
| grantFullControl | boolean | `false` | Grant full control to grantee |
| grantRead | boolean | `false` | Allow grantee to list objects |
| grantReadAcp | boolean | `false` | Allow grantee to read bucket ACL |
| grantWrite | boolean | `false` | Allow grantee to create/overwrite/delete objects |
| grantWriteAcp | boolean | `false` | Allow grantee to write bucket ACL |
| region | string | `""` | Override region (default uses credential region) |

**Bucket `search` Additional Fields:**

| name | type | default | notes |
|------|------|---------|-------|
| delimiter | string | `""` | Character used to group keys |
| encodingType | options | `""` | `url` — encode object keys in response |
| fetchOwner | boolean | `false` | Return owner field per key (ListObjectsV2) |
| prefix | string | `""` | Limit response to keys starting with prefix |
| requesterPays | boolean | `false` | Requester pays for requests and data transfer |
| startAfter | string | `""` | Start listing after this key |

### Resource: `file`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `file` | yes | — | Fixed value `file` |
| operation | options | `download` | yes | resource=file | `copy`, `delete`, `download`, `getAll`, `upload` |
| bucketName | string | `""` | yes (upload, download, delete, getAll) | operation in upload/download/delete/getAll | Target bucket |
| sourcePath | string | `""` | yes (copy) | operation=copy | Source path in format `/bucket/key` |
| destinationPath | string | `""` | yes (copy) | operation=copy | Destination path in format `/bucket/key` |
| fileKey | string | `""` | yes (download, delete) | operation=download/delete | Key of the file to download/delete |
| fileName | string | `""` | conditional (upload) | operation=upload | Name for uploaded file; required when binaryData=false |
| binaryData | boolean | `true` | no (upload) | operation=upload | Whether data comes from input binary field |
| fileContent | string | `""` | no (upload) | binaryData=false | Text content when not using binary |
| binaryPropertyName | string | `data` | conditional (upload, download) | operation=upload/download | Name of binary field for input (upload) or output (download) |
| returnAll | boolean | `false` | no (getAll) | operation=getAll | When false, `limit` controls pagination |
| limit | number | `100` | no (getAll) | returnAll=false | Max results (1–500) |
| additionalFields | collection | `{}` | no (copy, upload) | operations copy/upload | Covers ACL, encryption, storage class, locks, grants |
| options | collection | `{}` | no (delete, getAll) | operations delete/getAll | Version ID (delete); fetchOwner, folderKey (getAll) |
| tagsUi | fixedCollection | `{}` | no (upload) | operation=upload | Key-value tags (multiple values allowed) |

### Resource: `folder`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `folder` | yes | — | Fixed value `folder` |
| operation | options | `create` | yes | resource=folder | `create`, `delete`, `getAll` |
| bucketName | string | `""` | yes (all) | resource=folder | Target bucket |
| folderName | string | `""` | yes (create) | operation=create | Name of new folder |
| folderKey | string | `""` | yes (delete) | operation=delete | Key of folder to delete |
| returnAll | boolean | `false` | no (getAll) | operation=getAll | When false, `limit` controls pagination |
| limit | number | `100` | no (getAll) | returnAll=false | Max results (1–500) |
| additionalFields | collection | `{}` | no (create) | operation=create | Parent folder key, requester pays, storage class |
| options | collection | `{}` | no (getAll) | operation=getAll | fetchOwner, folderKey |

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be set statically or via expressions that reference the incoming item's JSON or binary data.

For **file:upload** with `binaryData=true`, the node reads from the binary field specified by `binaryPropertyName` (default `data`). For **file:download**, the node writes the downloaded object into an output binary field at the same key name.

### Output

One output item per input item. Output shape depends on the operation:

**Bucket:**
- `create` / `delete`: `{ success: true }`
- `getAll`: Array of `{ Name, CreationDate }` objects (plus `BucketArn` on v2)
- `search`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }`

**File:**
- `copy`: `{ ETag, LastModified, ChecksumCRC64NVME? }`
- `delete`: `{ success: true }`
- `download`: Binary data in the output binary field + metadata `{ ETag, Key, Size, LastModified, StorageClass }`
- `getAll`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }`
- `upload`: `{ ETag, Key, Location, Bucket, ChecksumCRC64NVME?, ChecksumType? }`

**Folder:**
- `create`: `{ success: true }`
- `delete`: `{ success: true }`
- `getAll`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }` with a `Type` subfolder indicator

### Errors

API errors (invalid credentials, bucket not found, permission denied) propagate as thrown exceptions. If `continueOnFail` is enabled on the node, the failed item is returned with an `error` property and execution continues.

### Expressions

All string parameters accept n8n expressions. Numeric and boolean parameters accept expressions via the expression editor in the n8n UI.

## Acceptance tests

### Test: bucket — create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bucket",
  "operation": "create",
  "name": "test-bucket-{{ $randomInt }}",
  "additionalFields": {
    "region": "us-west-2"
  }
}
```

**Expect** output[0] JSON contains:

```json
[{ "json": { "success": true } }]
```

### Test: file — upload from text

**Given** input items:

```json
[{ "json": {}, "binary": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "bucketName": "my-bucket",
  "fileName": "hello.txt",
  "binaryData": false,
  "fileContent": "Hello, S3!"
}
```

**Expect** output[0] JSON contains `ETag` and `Key` fields and no error.

### Test: file — download

**Given** input items:

```json
[{ "json": { "key": "hello.txt" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "download",
  "bucketName": "my-bucket",
  "fileKey": "={{ $json.key }}"
}
```

**Expect** output[0] has a non-empty binary property named `data` and JSON metadata `{ "Key": "hello.txt" }`.

### Test: bucket — getAll with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bucket",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] contains an array JSON property with at most 10 entries, each having `Name` and `CreationDate`.

### Test: folder — create

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
  "folderName": "test-folder"
}
```

**Expect** output[0] JSON contains `{ "success": true }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential fields | Public docs | AWS IAM and Assume Role credentials well-documented |
| Resource/operation names | Public docs | Bucket, File, Folder resources confirmed by public docs and corpus schema |
| Parameter shapes | Inferred from corpus type definitions | Parameter names, types, and defaults from n8n package descriptors (non-implementation sources) |
| Output schemas | Inferred from corpus JSON schemas | v2.0.0 schema files in `__schema__` directory; minor fields may vary by AWS API response |
| v1 vs v2 differences | Inferred | v1 has slightly different output shapes; v2 adds `BucketArn`, `ChecksumAlgorithm`, `ChecksumCRC64NVME` fields |
| Error detail format | Inferred | Standard AWS SDK error propagation assumed |
| `tagsUi` collection structure | Inferred from corpus | Fixed collection with `tagsValues` sub-options containing `key`/`value` strings |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/awsS3.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only