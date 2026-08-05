---
type: n8n-nodes-base.awsS3Tool
displayName: AWS S3 (AI Tool)
category: AI Tool
versions: [2]
priority: medium
status: specced
---

# AWS S3 (AI Tool)

An AI agent tool variant of the AWS S3 node. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Wraps Bucket (create/delete/getAll/search), File (copy/delete/download/getAll/upload), and Folder (create/delete/getAll) operations against the [AWS S3 REST API](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awss3/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.awsS3Tool`
- **Aliases:** `AWS S3`
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
| additionalFields | collection | `{}` | no | operations create/search | Region override (create); delimiter, prefix, encoding, requesterPays, startAfter (search) |

### Resource: `file`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `file` | yes | — | Fixed value `file` |
| operation | options | `download` | yes | resource=file | `copy`, `delete`, `download`, `getAll`, `upload` |
| bucketName | string | `""` | yes (all file ops) | resource=file | Target bucket |
| sourcePath | string | `""` | yes (copy) | operation=copy | Source path in format `/bucket/key` |
| destinationPath | string | `""` | yes (copy) | operation=copy | Destination path in format `/bucket/key` |
| fileKey | string | `""` | yes (download, delete) | operation=download/delete | Key of the file to download/delete |
| fileName | string | `""` | conditional (upload) | operation=upload | Name for uploaded file; required when binaryData=false |
| binaryData | boolean | `true` | no (upload) | operation=upload | Whether data comes from input binary field |
| fileContent | string | `""` | no (upload) | binaryData=false | Text content when not using binary |
| binaryPropertyName | string | `data` | conditional (upload, download) | operation=upload/download | Name of binary field for input (upload) or output (download) |
| returnAll | boolean | `false` | no (getAll) | operation=getAll | When false, `limit` controls pagination |
| limit | number | `100` | no (getAll) | returnAll=false | Max results (1–500) |
| additionalFields | collection | `{}` | no (copy, upload) | operations copy/upload | Covers ACL, encryption, storage class, tags, locking |
| options | collection | `{}` | no (delete, getAll) | operations delete/getAll | Version ID (delete); fetchOwner, folderKey (getAll) |

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

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name (`AWS S3`) and description metadata are configurable in the AI Agent node
- Binary data operations (file:upload, file:download) work as in the base node but depend on the agent runtime's binary-data plumbing
- The model selects Bucket, File, or Folder resource and the appropriate operation based on the user's request context

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions or be populated by the AI model via `$fromAI()`. For file:upload with `binaryData=true`, the binary field specified by `binaryPropertyName` (default `data`) carries the file content.

### Output

Output shape per operation mirrors the base AWS S3 node:

**Bucket:**
- `create` / `delete`: `{ success: true }`
- `getAll`: Array of `{ Name, CreationDate }` objects (+ `BucketArn` on v2)
- `search`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }`

**File:**
- `copy`: `{ ETag, LastModified, ChecksumCRC64NVME? }`
- `delete`: `{ success: true }`
- `download`: Binary data in output binary field + metadata `{ ETag, Key, Size, LastModified, StorageClass }`
- `getAll`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }`
- `upload`: `{ ETag, Key, Location, Bucket, ChecksumCRC64NVME?, ChecksumType? }`

**Folder:**
- `create` / `delete`: `{ success: true }`
- `getAll`: Array of `{ Key, ETag, Size, LastModified, StorageClass, ChecksumAlgorithm?, ChecksumType? }` with `Type` subfolder indicator

### Errors

- AWS API errors (invalid credentials, bucket not found, permission denied, rate limits) propagate as thrown exceptions
- `continueOnFail` returns the failed item with an `error` property and execution continues
- Missing required parameters (bucket name, file key) throw before API calls

### Expressions

All string, numeric, boolean, and enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource and operation selectors are typically static values.

## Acceptance tests

### Test: Upload a text file to S3

Given input items:
```json
[{ "json": {}, "binary": {} }]
```

Parameters:
```json
{
  "resource": "file",
  "operation": "upload",
  "bucketName": "test-bucket",
  "fileName": "hello.txt",
  "binaryData": false,
  "fileContent": "Hello from AI agent!"
}
```

Expect output[0] JSON to contain `ETag` and `Key` fields with no error.

### Test: List files in a bucket (paginated)

Given input items:
```json
[{ "json": {} }]
```

Parameters:
```json
{
  "resource": "file",
  "operation": "getAll",
  "bucketName": "test-bucket",
  "returnAll": false,
  "limit": 50
}
```

Expect output[0] JSON to contain an array of at most 50 entries, each with `Key`, `ETag`, `Size`, and `LastModified`.

### Test: Download a file

Given input items:
```json
[{ "json": { "key": "hello.txt" } }]
```

Parameters:
```json
{
  "resource": "file",
  "operation": "download",
  "bucketName": "test-bucket",
  "fileKey": "={{ $json.key }}"
}
```

Expect output[0] has a non-empty binary property named `data` and JSON metadata including `{ "Key": "hello.txt" }`.

### Test: Create and delete a bucket

Given input items:
```json
[{ "json": {} }, { "json": {} }]
```

Parameters (item 0):
```json
{
  "resource": "bucket",
  "operation": "create",
  "name": "tool-test-bucket-{{ $randomInt }}"
}
```

Expect output[0] JSON contains `{ "success": true }`.

Parameters (item 1):
```json
{
  "resource": "bucket",
  "operation": "delete",
  "name": "tool-test-bucket-{{ $randomInt }}"
}
```

Expect output[1] JSON contains `{ "success": true }`.

### Test: AI agent tool-calling — model supplies parameters dynamically

Given the node is connected to an AI Agent as a tool, and the user asks the agent to "List files in my-bucket":

Expect the agent invokes the S3 tool with parameters approximating:
```json
{
  "resource": "file",
  "operation": "getAll",
  "bucketName": "my-bucket",
  "returnAll": true
}
```

The tool returns files without error and the agent incorporates the results into its response.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | documented | Public docs list Bucket (create/delete/getAll/search), File (copy/delete/download/getAll/upload), Folder (create/delete/getAll) |
| Credential fields | documented | AWS IAM and Assume Role credentials well-documented on docs.n8n.io |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Parameter shapes | inferred from corpus | Parameter names, types, and defaults from package descriptors; same as base awsS3 |
| Output schemas | inferred from corpus | v2.0.0 schema files; minor fields may vary by AWS API response |
| v1 vs v2 differences | inferred from corpus | v2 adds `BucketArn`, `ChecksumAlgorithm`, `ChecksumCRC64NVME` fields |
| Folder delete operation | inferred | v2 schema lacks folder/delete schema JSON; public docs list delete; implementing a zero-key delete at the S3 prefix level is the expected behavior |
| Error detail format | inferred | Standard AWS SDK error propagation assumed |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/awsS3Tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
