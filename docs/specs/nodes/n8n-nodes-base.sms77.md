---
type: n8n-nodes-base.sms77
displayName: seven
category: Communication
versions: [1]
priority: medium
status: specced
---

# seven (SMS77)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sms77.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sms77.md | Public docs only |
| https://docs.seven.io/en/rest-api/endpoints/sms | Third-party service API docs |
| https://docs.seven.io/en/rest-api/endpoints/voice | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.sms77`
- **Aliases:** `SMS`, `Sms77`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sms77Api` (API key — Go to seven.io Account > Developer > API Keys)

## External API / service contract

This node interacts with the [seven.io REST API](https://docs.seven.io/en/rest-api/first-steps). All requests authenticate via the `X-Api-Key` header. The gateway base URL is `https://gateway.seven.io`.

### SMS — `POST /api/sms`

Required: `to` (recipient number, E.164 format, comma-separated for multiple), `text` (message body).

Optional: `from` (sender, max 11 alphanumeric or 16 numeric characters), `delay` (timestamp for scheduled sending), `flash` (boolean, Flash SMS), `udh` (hex user data header), `ttl` (validity in minutes, default 2880), `label` (tag for statistics, max 100 chars), `performance_tracking` (boolean, click tracking + URL shortener), `foreign_id` (custom ID for callbacks), `is_binary` (boolean, binary SMS), `get_replies` (boolean, enable reply function), `files` (array of file attachments with `name` + base64 `contents` + optional `validity` + `password`).

Response: JSON with `success` (return code), `total_price`, `balance`, `debug`, `sms_type`, `messages[]` (each with `id`, `sender`, `recipient`, `text`, `encoding`, `parts`, `price`, `success`, `error`).

Return codes: `100` = accepted, `101` = partial failure, `201`–`903` = various error conditions (invalid sender, invalid number, insufficient credit, auth failure, etc.).

### Voice — `POST /api/voice`

Required: `to` (recipient, string or array for multiple), `text` (message to read via TTS, plain text or SSML).

Optional: `from` (verified caller ID), `ringtime` (seconds, 5–60, default 30), `foreign_id` (custom ID for webhook callbacks).

Response: JSON with `success`, `total_price`, `balance`, `debug`, `messages[]` (each with `id`, `sender`, `recipient`, `text`, `price`, `success`).

## Parameters

### Resource / Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | sms | yes | `sms` or `voice` |
| operation | options | send | yes | Each resource has exactly one operation: `send` |

### SMS — send parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| to | string | — | yes | resource=sms, operation=send | Recipient phone number(s), comma-separated for bulk |
| text | string | — | yes | resource=sms, operation=send | SMS message body |
| from | string | — | no | resource=sms, operation=send | Sender ID, max 11 alphanumeric or 16 numeric |
| additionalFields | object | {} | no | resource=sms, operation=send | Grouped optional fields below |

### SMS — additionalFields

| name | type | default | notes |
|------|------|---------|-------|
| delay | string | — | Timestamp for scheduled sending |
| flash | boolean | false | Flash SMS (displayed directly on recipient screen) |
| udh | string | — | Custom hex User Data Header |
| ttl | number | 2880 | Validity period in minutes |
| label | string | — | Tag for statistics (max 100 chars, a-z A-Z 0-9 .-\_@) |
| performanceTracking | boolean | false | Click tracking + URL shortening for links in text |
| foreignId | string | — | Custom identifier echoed in callbacks |
| isBinary | boolean | false | Send as binary SMS |
| getReplies | boolean | false | Enable reply function (overrides sender) |

### Voice — send parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| to | string | — | yes | resource=voice, operation=send | Recipient phone number(s), comma-separated |
| text | string | — | yes | resource=voice, operation=send | TTS message text (plain text or SSML) |
| from | string | — | no | resource=voice, operation=send | Verified caller ID |
| additionalFields | object | {} | no | resource=voice, operation=send | Grouped optional fields below |

### Voice — additionalFields

| name | type | default | notes |
|------|------|---------|-------|
| ringtime | number | 30 | Ring duration in seconds (5–60) |
| foreignId | string | — | Custom identifier echoed in webhook callbacks |

## Runtime behavior

### Input

Each input item produces one independent API call. Expression strings in `to`, `text`, `from`, and all `additionalFields` are evaluated per-item.

### Pre-flight validation

After resolving expressions, if `to` or `text` is empty or missing, the node must throw a descriptive error (e.g. `'seven: to and text are required'`). This check is not gated by `continueOnFail` — it is always a hard failure.

### API call

The node sends a `POST` request to the appropriate endpoint (`/api/sms` or `/api/voice`) with the resolved parameters as form-encoded body, authenticated via `X-Api-Key` header.

### Output

Each item is replaced by a single output item containing the full API response JSON:

```json
{
  "success": "100",
  "total_price": 0.075,
  "balance": 593.994,
  "debug": "false",
  "sms_type": "direct",
  "messages": [
    {
      "id": "77229318510",
      "sender": "sender",
      "recipient": "49123456789",
      "text": "Hello World",
      "encoding": "gsm",
      "parts": 1,
      "price": 0.075,
      "success": true
    }
  ]
}
```

For voice calls the response shape is similar but without `sms_type`, `encoding`, or `parts`.

### Error handling

- **Success code check:** After receiving the API response, inspect `result.success`. If it is present and is not `'100'` or `'101'`, treat the response as an error.
- **continueOnFail disabled:** Throw on any non-`100`/`101` success code, missing credentials, or network failure.
- **continueOnFail enabled:** Return the error response as output item data and continue processing the next item. The output item should contain the raw API error response including the `success` code and any error details.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: send SMS with expressions

**Given** input items:

```json
[{ "json": { "phone": "+49176123456789", "message": "Hello from OpenFlow" } }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "to": "={{ $json.phone }}",
  "text": "={{ $json.message }}",
  "from": "OpenFlow"
}
```

**Expect** output[0] items to contain `success`, `total_price`, `balance`, `messages[]` with at least one entry where `success` is `true`.

### Test: send SMS with additional fields

**Given** input items:

```json
[{ "json": { "phone": "+49176123456789", "message": "Flash alert" } }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "to": "={{ $json.phone }}",
  "text": "={{ $json.message }}",
  "additionalFields": {
    "flash": true,
    "label": "test-alert"
  }
}
```

**Expect** output[0] items to contain `messages[0].success === true`.

### Test: send voice call

**Given** input items:

```json
[{ "json": { "phone": "+49176123456789", "message": "Your appointment is tomorrow at 10 AM" } }]
```

**Parameters:**

```json
{
  "resource": "voice",
  "operation": "send",
  "to": "={{ $json.phone }}",
  "text": "={{ $json.message }}"
}
```

**Expect** output[0] items to contain `success`, `messages[]` with at least one entry.

### Test: missing required fields throws

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
  "text": ""
}
```

**Expect** node throws with a message like `'seven: to and text are required'` without making an API call.

### Test: non-100/101 success code throws

**Given** mock API returns HTTP 200 with body:

```json
{ "success": "201", "messages": [], "debug": "invalid sender" }
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "to": "+49176123456789",
  "text": "test"
}
```

**Expect** node throws with an error that includes the `success` code `201`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation split | documented | Public n8n docs list SMS + Voice operations |
| SMS send parameters | documented | seven.io API docs document all parameters |
| Voice send parameters | documented | seven.io API docs document all parameters |
| Response shape | inferred from seven.io API docs | Exact field union may vary by version |
| Error codes | documented | seven.io API docs document return codes 100–903 |
| Credential type | documented | n8n credentials docs confirm `sms77Api` with API key |
| File attachments | documented | seven.io API docs document `files` parameter |
| Expression support | inferred | Standard n8n convention; all string params accept expressions |
| Pre-flight validation contract | inferred | Standard pattern for required parameters in n8n app nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.sms77.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only