---
type: n8n-nodes-base.awsSnsTrigger
displayName: AWS SNS Trigger
category: Development, Communication
versions: [1]
priority: medium
status: specced
---

# AWS SNS Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.awssnstrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/sns/latest/api/welcome.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsSnsTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** `aws` (access key + secret key) or `awsAssumeRole` (STS role assumption)

### Credential fields

Same AWS credentials as the AWS SNS (Publish) node. See [docs/specs/nodes/n8n-nodes-base.awsSns.md](n8n-nodes-base.awsSns.md) for the full credential table. Fields include region, accessKeyId, secretAccessKey, sessionToken, customEndpoints (including `snsEndpoint`), and assume-role parameters (roleArn, externalId, roleSessionName, stsAccessKeyId, stsSecretAccessKey).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| topic | resourceLocator | — | yes | always | Searchable resource locator that dynamically loads available SNS topics via the ListTopics API. Accepts a topic ARN directly or allows selection from a paginated search result. |

## Runtime behavior

### Activation

When the workflow is activated, the node registers an HTTP/HTTPS endpoint (a webhook URL exposed by the n8n instance) as a subscription against the selected SNS topic. It uses the AWS SNS Subscribe API with the endpoint set to the n8n webhook URL and protocol set to `https`. On deactivation, the node calls Unsubscribe to remove the subscription.

On manual (test) execution in the editor, the node waits for a single incoming SNS notification before resolving.

### Input

No input items. This is a trigger node — execution starts when an SNS notification is received.

### Output

Each incoming SNS HTTP POST notification produces one output item on `output[0]`. The emitted item contains the full SNS notification envelope as received in the POST body. The SNS notification envelope includes:

| field | type | notes |
|-------|------|-------|
| Type | string | `Notification`, `SubscriptionConfirmation`, or `UnsubscribeConfirmation` |
| MessageId | string | UUID assigned by SNS |
| TopicArn | string | ARN of the topic that published the notification |
| Subject | string | Optional — present only when the publisher included a subject |
| Message | string \| object | The published message body (JSON string). If the publisher used `messageStructure: json`, this is a JSON string containing the per-protocol payload. |
| Timestamp | string | ISO 8601 timestamp of the notification |
| SignatureVersion | string | Version of the SNS signature (e.g. `1`) |
| Signature | string | Base64-encoded SHA1WithRSA signature for verification |
| SigningCertUrl | string | URL to retrieve the X.509 certificate for signature verification |
| UnsubscribeUrl | string | URL to manually unsubscribe from the notification |
| MessageAttributes | object | Optional — present only when the publisher included message attributes |

Before the first `Notification` event, the subscription confirmation is handled automatically (`SubscriptionConfirmation` type) by submitting a GET request to the `SubscribeURL` field inside the confirmation payload.

### Errors

- **Subscribe failure:** If the SNS Subscribe API call fails (invalid topic ARN, insufficient IAM permissions, unreachable endpoint), the node throws an execution error and activation fails.
- **Unsubscribe failure:** On deactivation, if the Unsubscribe call fails, the error is logged but does not prevent deactivation.
- **Webhook validation:** The node verifies the `x-amz-sns-message-type` header and the authenticity of the SNS message signature (optional validation). Invalid or malformed messages may be silently dropped or produce an empty output.
- `continueOnFail`: If enabled, a failing item is passed through with `error` metadata instead of halting.

### Expressions

No parameters accept expression evaluation at the trigger level. Downstream nodes can reference the emitted item fields using standard expression syntax.

## Acceptance tests

### Test: receive a Notification event (happy path)

**Given** the n8n webhook receives an SNS HTTP POST with body:

```json
{
  "Type": "Notification",
  "MessageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "TopicArn": "arn:aws:sns:us-east-1:123456789012:MyTopic",
  "Subject": "Test Alert",
  "Message": "{\"orderId\": 42, \"status\": \"shipped\"}",
  "Timestamp": "2024-01-15T10:30:00.000Z",
  "SignatureVersion": "1",
  "Signature": "...",
  "SigningCertUrl": "https://sns.us-east-1.amazonaws.com/...",
  "UnsubscribeUrl": "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&..."
}
```

**Expect** output[0] to contain one item with the full SNS envelope as its JSON body, preserving all fields above.

### Test: SubscriptionConfirmation auto-handling

**Given** the first SNS POST received after activation contains a `SubscriptionConfirmation` message with a `SubscribeURL` field.

**Expect** the node to perform an HTTP GET to the `SubscribeURL` to confirm the subscription. No output item is emitted for the confirmation event itself.

### Test: Message with MessageAttributes

**Given** the SNS POST body includes a `MessageAttributes` field:

```json
{
  "Type": "Notification",
  "MessageId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "TopicArn": "arn:aws:sns:us-east-1:123456789012:MyTopic",
  "Message": "Hello",
  "Timestamp": "2024-01-15T11:00:00.000Z",
  "SignatureVersion": "1",
  "Signature": "...",
  "SigningCertUrl": "https://sns.us-east-1.amazonaws.com/...",
  "UnsubscribeUrl": "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&...",
  "MessageAttributes": {
    "priority": { "Type": "String", "Value": "high" },
    "source": { "Type": "String", "Value": "monitoring" }
  }
}
```

**Expect** output[0] to contain one item with all fields above preserved, including the `MessageAttributes` map.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Trigger type (webhook) | documented | Confirmed from n8n public docs page: "New AWS SNS event" |
| Topic selection via resource locator | inferred from type declaration | The `listTopics` method in the type declarations indicates a dynamic topic picker pattern |
| SNS notification envelope shape | documented | AWS SNS HTTP/HTTPS notification format is fully public |
| SubscriptionConfirmation handling | documented | Standard AWS SNS behavior for HTTP/S subscriptions |
| Credential type | documented | Same `aws`/`awsAssumeRole` credentials as all AWS nodes |
| Webhook lifecycle (create/check/delete) | inferred from type declaration | The webhookMethods in the type declarations match the standard n8n webhook lifecycle pattern |
| Signature verification | inferred | Common for webhook receiver nodes in n8n, but exact algorithm not confirmed in public docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/awsSnsTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
