---
type: n8n-nodes-base.sms77Tool
displayName: seven (sms77)
category: Communication
versions: [1]
priority: medium
status: specced
---

# seven (sms77) — Tool variant

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sms77/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sms77/ | Public docs only |
| https://docs.seven.io/en/rest-api/first-steps | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sms77Tool`
- **Aliases:** `SMS`, `Sms77`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sms77Api` (API key)

## Parameters

The tool exposes two independent resources, each with a single operation:

### Resource: SMS — Operation: Send SMS

Dispatches an SMS message through the seven.io SMS API.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `sms` | yes | Fixed to `sms` for this resource |
| operation | string | `send` | yes | Fixed to `send` for this operation |
| from | string | — | no | Alphanumeric sender ID (max 11 chars) or phone number |
| to | string | — | yes | Recipient phone number(s); supports international format |
| message | string | — | yes | SMS body text |

Options (additional fields):

| name | type | default | notes |
|------|------|---------|-------|
| flash | boolean | false | Send as flash SMS (appears directly on screen) |
| foreign_id | string | — | Client-defined correlation identifier returned in webhook |
| label | string | — | Label for the SMS in the seven.io dashboard |
| no_reload | boolean | false | Skip DLR (delivery receipt) reload |
| performance_tracking | boolean | false | Enable click-tracking in the SMS |
| ttl | number | — | Time-to-live in minutes for the SMS delivery attempt |
| udh | string | — | Binary UDH (User Data Header) for concatenated/binary SMS |

### Resource: Voice — Operation: Send Voice Call

Converts text to speech and places a voice call to the given number.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `voice` | yes | Fixed to `voice` for this resource |
| operation | string | `call` | yes | Fixed to `send` for this operation |
| from | string | — | no | Caller ID (phone number or alphanumeric) |
| to | string | — | yes | Recipient phone number in international format |
| message | string | — | yes | Text to be converted to speech during the call |

Options (additional fields):

| name | type | default | notes |
|------|------|---------|-------|
| language | string | `de-DE` | TTS language/locale (e.g., `de-DE`, `en-GB`, `en-US`) |
| no_reload | boolean | false | Skip DLR (delivery receipt) reload |
| repeat | number | 1 | Number of times to repeat the TTS message during the call |
| tts | boolean | true | Prefer TTS XML tags in the message text |

### Expression support

All string fields accept expression strings for dynamic evaluation per input item.

## Runtime behavior

### Input

Each input item is processed independently. For multi-recipient sends, the executor iterates one item per destination.

### Output

Each successful operation produces one output item per processed request. The output item shape:

```json
{
  "success": "100",
  "sms_type": "direct",
  "messages": [
    {
      "parts": 1,
      "sender": "SenderID",
      "success": true,
      "udh": null
    }
  ],
  "debug": "optional-debug-info"
}
```

Key fields:
- `success`: String — `"100"` on success; non-100 values indicate errors
- `sms_type`: String — The SMS type used (e.g. `direct`)
- `messages`: Array of per-recipient results with individual `success` booleans
- `debug`: Optional server debug information

For Voice calls, the response mirrors the same envelope structure. The executor passes the HTTP response body through to the output item's `json` property.

### Errors

- API-level errors (non-2xx HTTP status) produce an error item. If `continueOnFail` is enabled, the error is returned as an output item with a `json.error` field instead of throwing.
- Per-recipient failures within the `messages` array do not fail the entire operation — each message result is reported individually in the `messages` array.

### continueOnFail

When enabled, the executor catches request errors and returns them as output items with `{ json: { error: <error-object> } }` instead of halting execution.

## Acceptance tests

### Test: send SMS with required fields

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "to": "+491771234567",
  "message": "Hello from n8n"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": "100", "messages": [{ "success": true }] } }]
```

The executor calls POST `https://gateway.seven.io/api/sms` with the provided parameters and the `sms77Api` API key in the `X-Api-Key` header. The response must contain a `success` field set to `"100"` and at least one message entry with `success: true`.

### Test: send voice call with language option

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "voice",
  "operation": "call",
  "to": "+491771234567",
  "message": "Your package has been delivered",
  "language": "en-GB"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": "100" } }]
```

The executor calls POST `https://gateway.seven.io/api/voice` with `json` format, the provided parameters, and the `sms77Api` API key in the `X-Api-Key` header.

### Test: error handling with continueOnFail

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "to": "",
  "message": "",
  "continueOnFail": true
}
```

**Expect** output[0] contains `json.error` with information about the failed request. Execution does not throw.

### Test: expression evaluation in parameters

**Given** input items:
```json
[{ "json": { "phone": "+491771234567", "text": "Alert!" } }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "to": "={{ $json.phone }}",
  "message": "={{ $json.text }}"
}
```

**Expect** the executor substitutes `$json.phone` and `$json.text` before dispatching, and output[0] contains `{ "json": { "success": "100" } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API base URL | inferred | seven.io gateway at `https://gateway.seven.io/api/` — confirmed via seven.io public API docs |
| SMS vs Voice endpoints | inferred | `/sms` and `/voice` — standard seven.io API paths |
| Auth header | inferred | `X-Api-Key` header — confirmed via seven.io public API docs |
| Response shape | inferred | From published JSON schema in n8n package descriptor; matches documented seven.io API response |
| Available options | inferred | Options listed are from the canonical parameter set; exact defaults are abstracted |
| Tool-specific metadata | documented | The `Tool` variant is identical to the base `sms77` node with the addition of `$fromAI()` expression support for AI agent parameter population |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/sms77Tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
