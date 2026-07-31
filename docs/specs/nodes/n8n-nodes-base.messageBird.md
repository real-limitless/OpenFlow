---
type: n8n-nodes-base.messageBird
displayName: MessageBird
category: Communication
versions: [1]
priority: medium
status: specced
---

# MessageBird

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.messagebird.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/messagebird.md | Public docs only |
| https://docs.bird.com/api | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.messageBird`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `messageBirdApi` (API key)

## Parameters

The node exposes a resource selector (SMS or Balance) and an operation per resource.

| Resource | Operation | Parameter | type | required | notes |
|----------|-----------|-----------|------|----------|-------|
| SMS | Send | Originator | string | yes | Sender phone number |
| SMS | Send | Recipients | string | yes | Comma-separated recipient phone numbers |
| SMS | Send | Message | string | yes | SMS text body |
| SMS | Send | Additional Fields | collection | no | Optional metadata (e.g. scheduled datetime, validity, reference) |
| Balance | Get | — | — | — | No parameters; queries current account balance |

## Runtime behavior

### Input

Each input item is processed independently. For SMS Send, the node sends one MessageBird API request per item using the configured originator, recipients, and message text. For Balance Get, the node makes a single API call regardless of the number of input items (the response is attached to each input item).

### Output

- **SMS Send:** Output items contain the full API response from MessageBird's `/messages` endpoint, including the message ID, status (`sent`, `accepted`, `delivered`, etc.), recipient count, and per-recipient details.
- **Balance Get:** Output items contain the balance response from MessageBird's `/balance` endpoint, including the remaining payment balance and currency code.
- **Pass-through:** Input item `json` data is merged into the output when the operation completes successfully.

### Errors

- API errors (invalid originator, insufficient balance, invalid recipients) are surfaced as thrown errors.
- `continueOnFail`: when enabled, the node returns the errored input item with an `error` property instead of halting the workflow.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: sms send

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "originator": "14155551234",
  "recipients": "+14155559876",
  "message": "Hello from OpenFlow"
}
```

**Expect** the executor to call the MessageBird SMS API with originator, recipients, and message body, and return the API response enriched onto each input item.

### Test: balance get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "balance",
  "operation": "get"
}
```

**Expect** the executor to call the MessageBird balance endpoint and attach the balance data (payment balance + currency) to the output item.

### Test: pass-through with additional fields

**Given** input items:

```json
[{ "json": { "orderId": 42 } }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "originator": "14155551234",
  "recipients": "+14155559876",
  "message": "Order {{ $json.orderId }} ready",
  "additionalFields": { "reference": "ORD-{{ $json.orderId }}" }
}
```

**Expect** the output item to contain both the API response under a `json` key and the original `orderId` preserved.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "originator": "",
  "recipients": "",
  "message": ""
}
```

With `continueOnFail: true`, **expect** the node to return an item with a structured `error` property and not throw.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public n8n docs page lists SMS send + Balance get |
| Parameter names and shapes | inferred | Derived from public docs summary; exact names may vary |
| Additional fields options | inferred | Known to include scheduled datetime, validity, reference — full list is implementation detail |
| API endpoint URLs | inferred | MessageBird legacy REST API `rest.messagebird.com`; exact routing is implementation detail |
| Credential shape | documented | Public credential docs confirm API key auth |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/message-bird.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only