---
type: n8n-nodes-base.msg91
displayName: MSG91
category: Communication
versions: [1]
priority: medium
status: specced
---

# MSG91

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.msg91/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/msg91/ | Public docs only |
| https://docs.msg91.com/overview | Public docs (external API) |

## Wire format

- **Type string:** `n8n-nodes-base.msg91`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `msg91Api` (API authentication key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `sms` | yes | — | Fixed SMS resource |
| operation | fixed | `send` | yes | — | Single send operation |
| from | string | — | yes | resource=sms, operation=send | Sender ID (alphanumeric or numeric, registered with MSG91) |
| to | string | — | yes | resource=sms, operation=send | Recipient phone number with country code (e.g. `9198XXXXXXXX`) |
| message | string | — | yes | resource=sms, operation=send | SMS text content |

### Expression support

`from`, `to`, and `message` all accept expressions.

## Runtime behavior

### Input

Each input item may supply the recipient, message, and sender ID. When an item lacks a required field, the executor should fall back to the static parameter value.

### Output

Each outgoing SMS produces one output item. The output item passes through the input JSON and adds an `smsSent` envelope with the MSG91 API response (typically containing a `type` field indicating `success` or error info). When sending fails for a particular item and `continueOnFail` is enabled, the error is attached to that item and it still appears on output.

### Errors

- Missing `from`, `to`, or `message`: throw a descriptive error.
- API returns a non-success status: throw an error with the MSG91 API error message.
- With `continueOnFail`: the failing item is passed through with `_error` attached instead of throwing.

### Expressions

All three user-facing parameters (`from`, `to`, `message`) support expression interpolation.

## Acceptance tests

### Test: send a simple SMS

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "TXTSMS",
  "to": "919999999999",
  "message": "Hello from n8n"
}
```

**Expect** the executor to POST to the MSG91 SMS API with `sender=TXTSMS`, `mobiles=919999999999`, `message=Hello from n8n`, and the credential's `authkey`. Output[0] should contain the original `json` input merged with an `smsSent` field carrying the API response.

### Test: item-driven send with fallback

**Given** input items:

```json
[
  { "json": { "phone": "919000000001", "text": "Order confirmed #1" } },
  { "json": { "phone": "919000000002", "text": "Order confirmed #2" } }
]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "SHOPIFY",
  "to": "={{ $json.phone }}",
  "message": "={{ $json.text }}"
}
```

**Expect** two output items, each with the phone-specific message and an `smsSent` response.

### Test: missing required field throws

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "TXTSMS",
  "to": "",
  "message": "Missing recipient"
}
```

**Expect** a thrown error indicating the recipient is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node type + resources | Public docs | Confirmed: single SMS send operation |
| Parameters `from`, `to`, `message` | Public docs + corpus parameter names | Corpus confirms field names only; semantics from public doc description |
| Credential auth key | Public docs | Single API-key string called `authkey` |
| API endpoint shape | Inferred from MSG91 public docs | MSG91 API expects `authkey`, `sender`, `mobiles`, `message` at `https://api.msg91.com/api/v5/flow/` or similar; actual endpoint URL is n8n-internal |
| Output response shape | Inferred | Not explicitly documented on n8n docs; assumed MSG91 JSON response wrapped in `smsSent` |
| Error handling | n8n convention | Standard `continueOnFail` and item-level error behavior |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.msg91.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
