---
type: n8n-nodes-base.awsSns
displayName: AWS SNS
category: Development, Data & Storage
versions: [1]
priority: medium
status: specced
---

# AWS SNS

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awssns/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/sns/latest/api/API_Publish.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsSns`
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
| customEndpoints | collection | no | VPC custom endpoint overrides; includes `snsEndpoint` |
| roleArn | string | yes (assume-role mode) | ARN of the IAM role to assume |
| externalId | string | yes (assume-role mode) | External ID required by the role trust policy |
| roleSessionName | string | no | Session name for auditing (default `n8n-session`) |
| stsAccessKeyId | string | conditional | Access key for STS AssumeRole call |
| stsSecretAccessKey | string | conditional | Secret key for STS AssumeRole call |

## Parameters

Single operation: **Publish** — sends a message to an SNS topic, an SMS phone number, or a mobile platform endpoint.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| topicType | string | `topicArn` | yes | — | Selector: publish to Topic ARN, Phone Number, or Target ARN (platform endpoint) |
| topicArn | string | — | conditional | when `topicType = topicArn` | ARN of the SNS topic |
| phoneNumber | string | — | conditional | when `topicType = phoneNumber` | Phone number in E.164 format |
| targetArn | string | — | conditional | when `topicType = targetArn` | ARN of the platform endpoint |
| message | string | — | yes | — | Message body (up to 256 KB for topic, 1,600 chars for SMS) |
| subject | string | — | no | — | Subject line for email delivery (max 100 chars, no line breaks) |
| messageStructure | string | `string` | no | — | `string` (plain text) or `json` (per-protocol JSON object with `"default"` key plus protocol keys) |
| messageAttributes | collection | — | no | — | Key-value metadata attributes per AWS MessageAttributeValue schema (String, Binary, or Number) |
| messageDeduplicationId | string | — | no | — | FIFO topics only — token for deduplication within 5-minute window |
| messageGroupId | string | — | no | — | FIFO topics only — tag that groups messages for FIFO ordering |

## Runtime behavior

### Input

Each input item may trigger an independent Publish call. The node processes items sequentially; a single item can produce at most one output item.

### Output

Each Publish call emits an output item containing the original input enriched with:

| field | type | notes |
|-------|------|-------|
| messageId | string | UUID assigned by SNS (present for all publish targets) |
| sequenceNumber | string | FIFO topics only — large non-consecutive number per MessageGroupId |

For standard topics, only `messageId` is returned. For FIFO topics, both `messageId` and `sequenceNumber` appear.

When publishing by **Phone Number** (SMS), the node does not resolve a topic ARN but sends directly via the SNS SMS API.

### Errors

- **AuthorizationError** (403): IAM permissions insufficient — node throws.
- **InvalidParameter**: Wrong ARN format or missing required field — node throws.
- **EndpointDisabled**: Platform endpoint is disabled — node throws.
- **InternalError**: AWS side failure — node throws.
- `continueOnFail`: If enabled, the failing item is passed through with `error: { ... }` metadata instead of halting execution.

### Expressions

All string parameters accept expression syntax. The `message`, `subject`, `topicArn`, `phoneNumber`, `targetArn`, and attribute value fields are expression-aware.

## Acceptance tests

### Test: publish plain text to a topic

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topicType": "topicArn",
  "topicArn": "arn:aws:sns:us-east-1:123456789012:MyTopic",
  "message": "Hello from n8n",
  "subject": "Test Alert"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}"
  }
}]
```

The output must contain a `messageId` field (a non-empty string). The `subject` field is not echoed back; the node merges original input with the SNS response.

### Test: publish SMS to a phone number

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topicType": "phoneNumber",
  "phoneNumber": "+12065551234",
  "message": "Your code is 8675309"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}"
  }
}]
```

The SNS API returns a `messageId` for SMS sends. No `sequenceNumber` is present for standard topics.

### Test: per-protocol JSON message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topicType": "topicArn",
  "topicArn": "arn:aws:sns:us-east-1:123456789012:MyTopic",
  "message": "{\"default\":\"Fallback message\",\"email\":\"Long email body here\",\"sms\":\"Short SMS\"}",
  "messageStructure": "json"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}"
  }
}]
```

### Test: publish to a platform endpoint

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topicType": "targetArn",
  "targetArn": "arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/d618d310-...",
  "message": "{\"GCM\":\"{\\\"notification\\\":{\\\"title\\\":\\\"Alert\\\",\\\"body\\\":\\\"Hello\\\"}}\"}",
  "messageStructure": "json"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}"
  }
}]
```

### Test: FIFO topic with deduplication and group id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topicType": "topicArn",
  "topicArn": "arn:aws:sns:us-east-1:123456789012:MyFifoTopic.fifo",
  "message": "Order processed",
  "messageDeduplicationId": "order-123-abc",
  "messageGroupId": "orders"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}",
    "sequenceNumber": "{{ $json.sequenceNumber }}"
  }
}]
```

The output must include both `messageId` and a numeric `sequenceNumber` string.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single operation (Publish) | documented | Public n8n docs explicitly state "Publish a message to a topic" as the sole operation |
| Topic / Phone / Target ARN selector | inferred | Common AWS node pattern for SNS; the API supports all three targets |
| Credential shape | documented | AWS IAM credentials page documents region, access key, secret key, session token, custom endpoints, and assume-role parameters |
| Parameter details at field level | inferred | The exact parameter names and default structure are inferred from the AWS Publish API and general n8n AWS node conventions |
| messageAttributes collection schema | inferred | Follows the AWS MessageAttributeValue specification (String/Binary/Number types with DataType and StringValue/BinaryValue) |
| FIFO deduplication / group fields | documented | AWS Publish API documents MessageDeduplicationId and MessageGroupId |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/awsSns.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
