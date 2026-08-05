---
type: n8n-nodes-base.awsSqs
displayName: AWS SQS
category: Development, Communication
versions: [1]
priority: medium
status: specced
---

# AWS SQS

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awssqs/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsSqs`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (access key + secret key) or `awsAssumeRole` (STS role assumption)

### Credential fields

Shared AWS credentials — see the [AWS credentials spec](./n8n-nodes-base.awsS3.md). The `aws` credential requires `region`, `accessKeyId`, `secretAccessKey`, optional `sessionToken`, and optional `customEndpoints` with an `sqsEndpoint` key for VPC. The `awsAssumeRole` credential adds `roleArn`, `externalId`, optional `roleSessionName`, and STS credential fields.

## Parameters

Single operation: **Send Message** — delivers a message to an SQS queue.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | string | `iam` | yes | — | `iam` (access key) or `assumeRole` (STS role assumption) |
| queue | string | — | yes | — | Queue URL or name; resolved dynamically from the SQS account via `getQueues` load method, or entered as an expression |
| queueType | string | `standard` | yes | — | `standard` or `fifo` — controls which FIFO-specific parameters are presented |
| sendInputData | boolean | `true` | no | — | When enabled, the JSON payload of each input item is serialized as the message body. When disabled, the `message` field is used instead. |
| message | string | — | conditional | when `sendInputData = false` | Static message body (plain text, XML, or JSON). Required when `sendInputData` is off. |
| messageGroupId | string | — | conditional | when `queueType = fifo` | Groups messages for FIFO ordering. Required for FIFO queues. Max 128 characters. |
| options | collection | `{}` | no | — | Optional settings (see below) |

### Options sub-fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| delaySeconds | number | `0` | no | when `queueType = standard` | Per-message delay in seconds (0–900). Not supported on FIFO queues. |
| messageDeduplicationId | string | — | no | when `queueType = fifo` | Token for deduplication within a 5-minute window. If omitted, the queue must have `ContentBasedDeduplication` enabled. |
| messageAttributes | collection | — | no | — | Custom metadata attributes. Each entry specifies `name` plus one of: `string` (value), `number` (value), or `binary` (dataPropertyName referencing an input binary field). |

## Runtime behavior

### Input

Each input item triggers one `SendMessage` call. When `sendInputData` is true, the item's `json` payload is serialized as the `MessageBody`. The node processes items sequentially.

### Output

Each successful send produces an output item containing the original input enriched with the SQS SendMessage response:

| field | type | notes |
|-------|------|-------|
| messageId | string | UUID assigned by SQS |
| md5OfMessageBody | string | MD5 digest of the message body |
| md5OfMessageAttributes | string | MD5 digest of message attributes (present when attributes were sent) |
| md5OfMessageSystemAttributes | string | MD5 digest of system attributes (present when AWSTraceHeader is set) |
| sequenceNumber | string | FIFO queues only — large non-consecutive number per MessageGroupId |

Standard queues return `messageId` and `md5OfMessageBody`. FIFO queues additionally return `sequenceNumber`.

### Errors

- **QueueDoesNotExist** (400): The queue URL is incorrect or the queue has been deleted — node throws.
- **InvalidMessageContents** (400): Message body contains characters outside the allowed Unicode set — node throws.
- **Kms* errors** (400): KMS key issues (disabled, access denied, not found, throttled) — node throws.
- **RequestThrottled** (400): Request rate exceeds SQS limits — node throws.
- `continueOnFail`: If enabled, the failing item passes through with `error` metadata instead of halting.

### Expressions

All string parameters accept expression syntax. The `queue`, `message`, `messageGroupId`, `messageDeduplicationId`, and attribute name/value fields are expression-aware.

## Acceptance tests

### Test: send message to a standard queue

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "queue": "https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue",
  "queueType": "standard",
  "sendInputData": false,
  "message": "Hello from n8n"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}",
    "md5OfMessageBody": "{{ $json.md5OfMessageBody }}"
  }
}]
```

The output must contain a non-empty `messageId` string and a non-empty `md5OfMessageBody` string.

### Test: send input data as message body

**Given** input items:

```json
[{ "json": { "orderId": "abc-123", "status": "shipped" } }]
```

**Parameters:**

```json
{
  "queue": "https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue",
  "queueType": "standard",
  "sendInputData": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}",
    "md5OfMessageBody": "{{ $json.md5OfMessageBody }}",
    "orderId": "abc-123",
    "status": "shipped"
  }
}]
```

The input `json` fields are preserved in the output. The `messageId` and `md5OfMessageBody` are added.

### Test: FIFO queue with deduplication and group id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "queue": "https://sqs.us-east-1.amazonaws.com/123456789012/MyFifoQueue.fifo",
  "queueType": "fifo",
  "sendInputData": false,
  "message": "Order processed",
  "messageGroupId": "orders",
  "options": {
    "messageDeduplicationId": "order-123-abc"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}",
    "md5OfMessageBody": "{{ $json.md5OfMessageBody }}",
    "sequenceNumber": "{{ $json.sequenceNumber }}"
  }
}]
```

The output must include a numeric `sequenceNumber` string for FIFO queues.

### Test: message with per-message delay and attributes

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "queue": "https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue",
  "queueType": "standard",
  "sendInputData": false,
  "message": "Delayed alert",
  "options": {
    "delaySeconds": 45,
    "messageAttributes": {
      "string": [
        { "name": "source", "value": "n8n" },
        { "name": "priority", "value": "high" }
      ],
      "number": [
        { "name": "version", "value": 2 }
      ]
    }
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "messageId": "{{ $json.messageId }}",
    "md5OfMessageBody": "{{ $json.md5OfMessageBody }}",
    "md5OfMessageAttributes": "{{ $json.md5OfMessageAttributes }}"
  }
}]
```

The output should include `md5OfMessageAttributes` when message attributes are provided.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single operation (Send Message) | documented | Public n8n docs confirm "Send a message to a queue" as the sole operation |
| Queue selection via dynamic list | documented | Standard n8n AWS pattern using `loadOptionsMethod` |
| FIFO vs Standard toggle | inferred from corpus | Queue type selector conditionally reveals FIFO-specific fields |
| sendInputData / message fields | inferred | Common n8n pattern for allowing static or dynamic message body |
| DelaySeconds per message | documented | AWS SQS API documents DelaySeconds (0–900) for standard queues |
| Message attributes schema | inferred | Follows AWS MessageAttributeValue spec; the node wraps String/Number/Binary types |
| Credential shape | documented | AWS credentials page documents region, access key, secret key, session token, custom endpoints (including SQS), and assume-role parameters |
| Response shape | documented | AWS SQS SendMessage response returns MessageId, MD5OfMessageBody, MD5OfMessageAttributes, SequenceNumber |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/awsSqs.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
