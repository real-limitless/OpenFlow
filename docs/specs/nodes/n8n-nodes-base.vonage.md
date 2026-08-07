---
type: n8n-nodes-base.vonage
displayName: Vonage
category: Communication
versions: [1]
priority: medium
status: specced
---

# Vonage

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.vonage.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/vonage.md | Public docs only |
| https://developer.vonage.com/en/api/sms | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.vonage`
- **Aliases:** `SMS`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `vonageApi` (API Key + API Secret)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `SMS` | yes | — | Fixed to SMS |
| operation | string | `Send` | yes | resource = SMS | Fixed to Send |
| from | string | — | yes | resource = SMS, operation = Send | Originating phone number or alphanumeric sender ID assigned by Vonage |
| to | string | — | yes | resource = SMS, operation = Send | Recipient phone number in E.164 format |
| message | string | — | yes | resource = SMS, operation = Send | SMS body text |
| options | object | {} | no | resource = SMS, operation = Send | Optional SMS properties (type, ttl, statusCallbackUrl, callbackId, clientRef) |

### options sub-fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| type | string | `text` | no | SMS type: `text` or `unicode` |
| ttl | number | — | no | Time-to-live in milliseconds for the message |
| statusCallbackUrl | string | — | no | Webhook URL for delivery status callbacks |
| callbackId | string | — | no | Identifier for the status callback request |
| clientRef | string | — | no | Client reference string for reporting |

## Runtime behavior

### Input

Each input item is processed independently. The `from`, `to`, and `message` parameters are resolved per item and may use expressions.

### Output

For each input item, the node makes a single POST request to the Vonage SMS API (`https://rest.nexmo.com/sms/json`). The response from the Vonage API is forwarded as the output item JSON.

Each output item's `json` receives the Vonage SMS API response envelope. Per the documented response schema, each message in the response contains the following per-message fields: `message-id` (string), `to` (string), `status` (string, "0" for success), `remaining-balance` (string), `message-price` (string), `network` (string). Additional envelope-level fields (`message-count`, `messages` array) are forwarded as-is from the API.

If `continueOnFail` is disabled and the Vonage API returns a non-zero status code (non-delivery), the node throws an error. If `continueOnFail` is enabled, the node produces an error item with `error: { message, description }` instead.

### Errors

- Missing required parameters (`from`, `to`, `message`) cause validation errors at execution time.
- Vonage API errors (invalid credentials, invalid phone number, insufficient balance) surface as thrown errors or error items depending on `continueOnFail`.

### Expressions

All string parameters (`from`, `to`, `message`, and options sub-fields) accept expression strings.

## Acceptance tests

### Test: send basic SMS

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "SMS",
  "operation": "Send",
  "from": "AcmeInc",
  "to": "+1234567890",
  "message": "Hello from n8n"
}
```

**Expect** output[0]:

The output item's `json` contains the Vonage SMS API response including `messages` array with a `status` field. The node must not throw for a successful API call.

### Test: send with unicode option

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "SMS",
  "operation": "Send",
  "from": "AcmeInc",
  "to": "+1234567890",
  "message": "Hello ñ ñ",
  "options": {
    "type": "unicode"
  }
}
```

**Expect** output[0]:

The SMS is sent with type=unicode. The output `json` contains the Vonage API response.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "SMS",
  "operation": "Send",
  "from": "",
  "to": "",
  "message": "",
  "continueOnFail": true
}
```

**Expect** output[0]:

The output item has an `error` property with non-null `message` and `description`.

### Test: parameter expression resolution

**Given** input items:

```json
[{ "json": { "phone": "+1234567890", "body": "Alert!" } }]
```

**Parameters:**

```json
{
  "resource": "SMS",
  "operation": "Send",
  "from": "AcmeInc",
  "to": "={{ $json.phone }}",
  "message": "={{ $json.body }}"
}
```

**Expect** output[0]:

The `to` and `message` values are resolved from the input item. The node POSTs to the Vonage SMS API with the resolved values.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| SMS resource + operation | documented | Public n8n docs confirm single resource (SMS) → Send |
| from/to/message params | documented | Standard SMS parameters |
| options (type/ttl/statusCallbackUrl/callbackId/clientRef) | documented | Vonage SMS API standard optional fields |
| Credential shape | documented | vonageApi with API Key + API Secret |
| Response shape | inferred | Standard Vonage SMS API JSON response shape; not deeply documented in n8n docs |
| Alias "SMS" | inferred | Common pattern for single-operation nodes |
| continueOnFail behavior | inferred | Standard n8n pattern applied to all action nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/vonage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
