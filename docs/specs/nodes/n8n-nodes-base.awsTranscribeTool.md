---
type: n8n-nodes-base.awsTranscribeTool
displayName: AWS Transcribe Tool
category: AI Tool
versions: [2]
priority: medium
status: specced
---

# AWS Transcribe Tool

An AI agent tool variant of the AWS Transcribe node. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Wraps a single Transcription Job resource with four operations (Create, Delete, Get, Get All) against the [AWS Transcribe API](https://docs.aws.amazon.com/transcribe/latest/APIReference/Welcome.html).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awstranscribe/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html | External API docs |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetTranscriptionJob.html | External API docs |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_DeleteTranscriptionJob.html | External API docs |
| https://docs.aws.amazon.com/transcribe/latest/APIReference/API_ListTranscriptionJobs.html | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.awsTranscribeTool`
- **Aliases:** `AWS Transcribe`
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

## Parameters

The node exposes a single resource (Transcription Job) with four operations, each mapping to an AWS Transcribe API action.

The media file to transcribe must already be uploaded to Amazon S3. The node receives the S3 URI of the media (and optional output bucket) from the user-provided parameters or via AI model inference; it does not accept inline binary data.

### Resource: Transcription Job

#### Operation: Create

Maps to `StartTranscriptionJob`. The transcription job name is a required string. The source media is specified as an S3 URI. Language configuration must be one of:
- An explicit `LanguageCode` from the AWS supported-language list
- `IdentifyLanguage` (boolean) — auto-detect a single language, optionally constrained to `LanguageOptions`
- `IdentifyMultipleLanguages` (boolean) — auto-detect multiple languages

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | Only resource |
| operation | fixed string | `"create"` | yes | — | Calls `StartTranscriptionJob` |
| transcriptionJobName | string | — | yes | — | Unique job name; AI-populatable |
| mediaFileUri | string | — | yes | — | S3 URI of the input media file; AI-populatable |
| languageCode | string | — | conditional* | — | Explicit language code (e.g. `en-US`) |
| identifyLanguage | boolean | false | conditional* | — | Auto-detect single language |
| identifyMultipleLanguages | boolean | false | conditional* | — | Auto-detect multiple languages |
| languageOptions | multi-option string | — | no | — | Restrict auto-detect to specific language codes |
| mediaFormat | string | `"auto"` | no | — | `mp3`, `mp4`, `wav`, `flac`, `ogg`, `amr`, `webm`, `m4a`, or auto-detect |
| mediaSampleRateHertz | number | — | no | — | Sample rate in Hz (8000–48000) |
| outputBucketName | string | — | no | — | S3 bucket for transcription output; AI-populatable |
| outputKey | string | — | no | — | Output object key prefix or filename |
| outputEncryptionKMSKeyId | string | — | no | — | KMS key ARN for output encryption |
| modelSettings | object | — | no | — | Custom language model name |
| settings | object | — | no | — | Channel identification, speaker labels, alternatives, vocabularies |
| contentRedaction | object | — | no | — | PII redaction type, output mode, entity types |
| subtitles | object | — | no | — | Subtitle output formats (vtt, srt) and start index |
| toxicityDetection | object | — | no | — | Enable toxic speech detection with category list |
| tags | collection | — | no | — | Key-value tags for the job |
| jobExecutionSettings | object | — | no | — | Deferred execution + data access role ARN |
| languageIdSettings | object | — | no | — | Per-language vocab/model/filter for auto-detect |
| region | string | — | no | — | AWS region override; AI-populatable |

> `*` = exactly one of `languageCode`, `identifyLanguage`, or `identifyMultipleLanguages` must be specified.

#### Operation: Get

Maps to `GetTranscriptionJob`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"get"` | yes | — | Calls `GetTranscriptionJob` |
| transcriptionJobName | string | — | yes | — | Name of the job to retrieve; AI-populatable |
| region | string | — | no | — | AWS region override |

#### Operation: Get All

Maps to `ListTranscriptionJobs`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"getAll"` | yes | — | Calls `ListTranscriptionJobs` |
| jobNameContains | string | — | no | — | Substring filter (case-insensitive); AI-populatable |
| status | string | — | no | — | `QUEUED`, `IN_PROGRESS`, `FAILED`, `COMPLETED` |
| maxResults | number | 100 | no | — | Max items per page (1–100) |
| nextToken | string | — | no | — | Pagination token from a previous response |
| region | string | — | no | — | AWS region override |

#### Operation: Delete

Maps to `DeleteTranscriptionJob`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed string | `"transcriptionJob"` | yes | — | |
| operation | fixed string | `"delete"` | yes | — | Calls `DeleteTranscriptionJob` |
| transcriptionJobName | string | — | yes | — | Name of the job to delete; AI-populatable |
| region | string | — | no | — | AWS region override |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters marked as AI-populatable can be filled by the agent model via `$fromAI()` expressions
- Tool name (`AWS Transcribe`) and description metadata are configurable in the AI Agent node
- The model selects the Transcription Job resource and the appropriate operation (create/get/getAll/delete) based on the user's request context
- The model typically infers `mediaFileUri`, `transcriptionJobName`, `outputBucketName`, and `region` from conversation context

## Runtime behavior

### Input

Each input item supplies expression values for the selected operation's parameters. When used as an AI agent tool, parameters may be populated by the model via `$fromAI()` expressions. The node submits the corresponding AWS Transcribe API call using the configured region (from a credential-level region, the `region` parameter, or AI-inferred value).

### Output

Each output item carries the direct AWS API response envelope for the operation, identical to the base AWS Transcribe node:

- **Create:** returns the `TranscriptionJob` object from `StartTranscriptionJob` response (contains `TranscriptionJobName`, `TranscriptionJobStatus`, `CreationTime`, and optionally `FailureReason`).
- **Get:** returns the `TranscriptionJob` object from `GetTranscriptionJob` response (full job detail including status, timing, media, transcript URIs, settings, language codes, and failure reason).
- **Get All:** returns an array of `TranscriptionJobSummaries` plus `NextToken` and `Status` metadata from `ListTranscriptionJobs`. Multiple items are produced by splitting the array.
- **Delete:** returns the input item unchanged, since `DeleteTranscriptionJob` returns an empty HTTP 200 body.

### Errors

AWS API errors (`BadRequestException`, `ConflictException`, `NotFoundException`, `LimitExceededException`, `InternalFailureException`) are surfaced as thrown errors. The standard `continueOnFail` option applies.

### Expressions

All string, numeric, boolean, and enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource and operation selectors are typically static values.

## Acceptance tests

### Test: create a transcription job via AI tool

Given the node is connected to an AI Agent as a tool, and the user asks the agent to "Transcribe the audio at s3://recordings/meeting.mp3":

Expect the agent invokes the Transcribe tool with parameters approximating:
```json
{
  "resource": "transcriptionJob",
  "operation": "create",
  "transcriptionJobName": "ai-transcribe-<random>",
  "mediaFileUri": "s3://recordings/meeting.mp3",
  "languageCode": "en-US",
  "region": "us-east-1"
}
```

The tool returns a `TranscriptionJob` object with status `QUEUED` or `IN_PROGRESS`.

### Test: get a transcription job

**Parameters:**
```json
{
  "resource": "transcriptionJob",
  "operation": "get",
  "transcriptionJobName": "my-transcribe-job",
  "region": "us-east-1"
}
```

**Expect** output[0] to contain a `TranscriptionJob` object with `TranscriptionJobName` matching and `TranscriptionJobStatus` field populated.

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

**Expect** output[0] items each contain transcription job summaries with `TranscriptionJobName` and `TranscriptionJobStatus`. Response envelope includes `Status` and optionally `NextToken`.

### Test: delete a transcription job

**Parameters:**
```json
{
  "resource": "transcriptionJob",
  "operation": "delete",
  "transcriptionJobName": "my-transcribe-job",
  "region": "us-east-1"
}
```

**Expect** the node returns successfully (HTTP 200) without throwing.

### Test: AI agent tool-calling — model infers region and job name

Given the node is connected to an AI Agent and the user says "Check on my transcription job 'call-notes' in us-west-2":

Expect the agent invokes the tool with parameters approximating:
```json
{
  "resource": "transcriptionJob",
  "operation": "get",
  "transcriptionJobName": "call-notes",
  "region": "us-west-2"
}
```

The tool returns the job detail without error and the agent incorporates the result into its response.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Public n8n docs confirm 4 operations on Transcription Job resource; tool variant shares the same operations |
| Resource name | inferred from base node | `transcriptionJob` (snake_case convention consistent across n8n AWS nodes) |
| Create parameters | AWS API reference | All `StartTranscriptionJob` parameters publicly documented by AWS |
| Get/Delete/List parameters | AWS API reference | Minimal required params per each API |
| Credential model | documented | Standard shared AWS credential type |
| Region override | inferred from n8n AWS node patterns | Consistent across all n8n AWS nodes; present as an optional parameter on tool variants |
| AI tool parameter support | documented | Public n8n docs confirm tool variants support `$fromAI()` dynamic parameter population |
| Output shape | AWS API reference | Response schemas from `StartTranscriptionJob`, `GetTranscriptionJob`, `ListTranscriptionJobs` |
| Tool name / alias | inferred | Following the pattern of other tool nodes, alias is likely `AWS Transcribe` |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/awsTranscribeTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **AWS SDK dependency:** `@aws-sdk/client-transcribe` (or equivalent SDK v3 service client)
