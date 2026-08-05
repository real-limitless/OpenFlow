---
type: n8n-nodes-base.awsTranscribe
displayName: AWS Transcribe
category: Utility
versions: [1]
priority: medium
status: specced
---

# AWS Transcribe

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awstranscribe/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html | Public docs only |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetTranscriptionJob.html | Public docs only |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_DeleteTranscriptionJob.html | Public docs only |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_ListTranscriptionJobs.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsTranscribe`
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

The node exposes a single resource (Transcription Job) with four operations, each mapping to an AWS Transcribe API action.

The media file to transcribe must already be uploaded to Amazon S3. The node receives the S3 URI of the media (and optional output bucket) from the user-provided parameters; it does not accept inline binary data.

### Resource: Transcription Job

#### Operation: Create

Maps to `StartTranscriptionJob`. The transcription job name is a required user-provided string. The source media is specified as an S3 URI (`MediaFileUri`). Language configuration must be one of:
- An explicit `LanguageCode` from the AWS supported-language list
- `IdentifyLanguage` (boolean) — auto-detect a single language, optionally constrained to a set of `LanguageOptions`
- `IdentifyMultipleLanguages` (boolean) — auto-detect multiple languages

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | Only resource |
| operation | fixed string | `"create"` | yes | — | Calls `StartTranscriptionJob` |
| transcriptionJobName | string (expression) | — | yes | — | Unique job name (^[0-9a-zA-Z._-]+) |
| mediaFileUri | string (expression) | — | yes | — | S3 URI of the input media file |
| languageCode | string | — | conditional* | — | Explicit language code (e.g. `en-US`) |
| identifyLanguage | boolean | false | conditional* | — | Auto-detect single language |
| identifyMultipleLanguages | boolean | false | conditional* | — | Auto-detect multiple languages |
| languageOptions | multi-option string | — | no | — | Restrict auto-detect to specific language codes |
| mediaFormat | string | `"auto"` | no | — | `mp3`, `mp4`, `wav`, `flac`, `ogg`, `amr`, `webm`, `m4a`, or auto-detect |
| mediaSampleRateHertz | number | — | no | — | Sample rate in Hz (8000–48000) |
| outputBucketName | string (expression) | — | no | — | S3 bucket for transcription output |
| outputKey | string (expression) | — | no | — | Output object key prefix or filename |
| outputEncryptionKMSKeyId | string (expression) | — | no | — | KMS key ARN for output encryption |
| modelSettings | object | — | no | — | Custom language model name |
| settings | object | — | no | — | Channel identification, speaker labels, alternatives, vocabularies |
| contentRedaction | object | — | no | — | PII redaction type, output mode, entity types |
| subtitles | object | — | no | — | Subtitle output formats (vtt, srt) and start index |
| toxicityDetection | object | — | no | — | Enable toxic speech detection with category list |
| tags | collection | — | no | — | Key-value tags for the job |
| jobExecutionSettings | object | — | no | — | Deferred execution + data access role ARN |
| languageIdSettings | object | — | no | — | Per-language vocab/model/filter for auto-detect |

> `*` = exactly one of `languageCode`, `identifyLanguage`, or `identifyMultipleLanguages` must be specified.

#### Operation: Get

Maps to `GetTranscriptionJob`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"get"` | yes | — | Calls `GetTranscriptionJob` |
| transcriptionJobName | string (expression) | — | yes | — | Name of the job to retrieve |

#### Operation: Get All

Maps to `ListTranscriptionJobs`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"getAll"` | yes | — | Calls `ListTranscriptionJobs` |
| jobNameContains | string (expression) | — | no | — | Substring filter (case-insensitive) |
| status | string | — | no | — | `QUEUED`, `IN_PROGRESS`, `FAILED`, `COMPLETED` |
| maxResults | number | 100 | no | — | Max items per page (1–100) |
| nextToken | string (expression) | — | no | — | Pagination token from a previous response |

#### Operation: Delete

Maps to `DeleteTranscriptionJob`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"delete"` | yes | — | Calls `DeleteTranscriptionJob` |
| transcriptionJobName | string (expression) | — | yes | — | Name of the job to delete |

## Runtime behavior

### Input

Each input item supplies expression values for the selected operation's parameters. For **Create**, the node submits a `StartTranscriptionJob` request to the AWS Transcribe API using the configured region (parameter or credential). For **Get**, **Get All**, and **Delete**, it submits the corresponding API call with minimal parameters.

For **Create**, the source media must already reside in S3; the node does not upload files. The `mediaFileUri` parameter must be a valid `s3://bucket/key` or an HTTPS S3 URL.

### Output

Each output item carries the direct AWS API response envelope for the operation:

- **Create:** returns the `TranscriptionJob` object from `StartTranscriptionJob` response (contains `TranscriptionJobName`, `TranscriptionJobStatus`, `CreationTime`, and optionally `FailureReason`).
- **Get:** returns the `TranscriptionJob` object from `GetTranscriptionJob` response (full job detail including status, timing, media, transcript URIs, settings, language codes, and failure reason).
- **Get All:** returns an array of `TranscriptionJobSummaries` under a key (typically `TranscriptionJobSummaries`) plus `NextToken` and `Status` metadata from the `ListTranscriptionJobs` response. Multiple items are produced by splitting the array.
- **Delete:** returns the input item unchanged (or an empty result indicating success), since `DeleteTranscriptionJob` returns an empty HTTP 200 body.

For **Get All**, the response items are structured as:

```json
{
  "TranscriptionJobSummaries": [
    {
      "TranscriptionJobName": "my-job",
      "TranscriptionJobStatus": "COMPLETED",
      "LanguageCode": "en-US",
      "CreationTime": 1.23456789e9,
      "CompletionTime": 1.23456789e9,
      "OutputLocationType": "serviceBucket"
    }
  ],
  "Status": "COMPLETED",
  "NextToken": "string"
}
```

### Errors

AWS API errors (`BadRequestException`, `ConflictException`, `NotFoundException`, `LimitExceededException`, `InternalFailureException`) are surfaced as thrown errors during execution. The standard `continueOnFail` option applies: when enabled, the node outputs an error item instead of halting the workflow.

### Expressions

The following parameters accept expression strings:
- `transcriptionJobName`
- `mediaFileUri`
- `outputBucketName`
- `outputKey`
- `outputEncryptionKMSKeyId`
- `jobNameContains`
- `nextToken`
- Settings, sub-object parameters may also accept expressions

## Acceptance tests

### Test: create a transcription job

**Given** input items:

```json
[{
  "json": {}
}]
```

**Parameters:**

```json
{
  "resource": "transcriptionJob",
  "operation": "create",
  "transcriptionJobName": "my-transcription-001",
  "mediaFileUri": "s3://my-audio-bucket/recordings/call-001.mp3",
  "languageCode": "en-US",
  "mediaFormat": "mp3",
  "outputBucketName": "my-transcript-bucket",
  "region": "us-east-1"
}
```

**Expect** output[0] to contain a single item with:
- A `TranscriptionJob` object
- `TranscriptionJob.TranscriptionJobName` equals `"my-transcription-001"`
- `TranscriptionJob.TranscriptionJobStatus` is one of `"QUEUED"` or `"IN_PROGRESS"`
- `TranscriptionJob.Media.MediaFileUri` matches the input URI

### Test: get a transcription job

**Given** input items:

```json
[{
  "json": {}
}]
```

**Parameters:**

```json
{
  "resource": "transcriptionJob",
  "operation": "get",
  "transcriptionJobName": "my-transcription-001",
  "region": "us-east-1"
}
```

**Expect** output[0] to contain one item with a `TranscriptionJob` object that includes:
- `TranscriptionJobName` matching the request
- `TranscriptionJobStatus` field
- `Transcript.TranscriptFileUri` when status is `COMPLETED`

### Test: list transcription jobs

**Parameters:**

```json
{
  "resource": "transcriptionJob",
  "operation": "getAll",
  "status": "COMPLETED",
  "maxResults": 50,
  "region": "us-east-1"
}
```

**Expect** output[0] items to each contain a transcription job summary with at least `TranscriptionJobName` and `TranscriptionJobStatus`. The response also includes `Status` and optionally `NextToken` at the envelope level.

### Test: delete a transcription job

**Parameters:**

```json
{
  "resource": "transcriptionJob",
  "operation": "delete",
  "transcriptionJobName": "my-transcription-001",
  "region": "us-east-1"
}
```

**Expect** the node to not throw an error (HTTP 200 success). The output item may be the original input item passed through or an empty result.

### Test: auto-detect language

**Parameters:**

```json
{
  "resource": "transcriptionJob",
  "operation": "create",
  "transcriptionJobName": "auto-detect-job",
  "mediaFileUri": "s3://my-audio-bucket/recordings/multi-lang.mp3",
  "identifyLanguage": true,
  "languageOptions": ["en-US", "es-US"],
  "region": "us-east-1"
}
```

**Expect** the node to create a transcription job with `IdentifyLanguage` set to true and `LanguageOptions` populated, and return the resulting `TranscriptionJob` with `IdentifiedLanguageScore`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs | n8n docs confirm 4 operations on Transcription Job resource |
| Resource name | Public n8n docs | Pattern matches `transcriptionJob` (snake_case convention) |
| Create parameters | AWS API reference | All `StartTranscriptionJob` parameters publicly documented by AWS |
| Get/Delete/List parameters | AWS API reference | Minimal required params per each API |
| Credential model | Public n8n docs | Standard shared AWS credential type |
| Region override | n8n AWS node patterns | Consistent across all n8n AWS nodes |
| Output shape | AWS API reference | Verified from `StartTranscriptionJob`, `GetTranscriptionJob`, `ListTranscriptionJobs` response schemas |
| Pagination for Get All | AWS API reference | `NextToken` + `MaxResults` pattern is standard AWS |
| Exact UI nesting | Inferred | The exact parameter-grouping and displayOptions layout is not confirmed by public docs but follows the standard n8n app-node pattern |
| LanguageOptions as multi-option | Inferred | The node likely provides a multi-select or dynamic list, exact UX not documented |

## OpenFlow mapping

- **Definition group:** `core` (app node with AWS SDK dependency)
- **Executor file:** `src/lib/engine/executors/awsTranscribe.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **AWS SDK dependency:** `@aws-sdk/client-transcribe` (or equivalent SDK v3 service client)
