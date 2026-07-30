---
type: n8n-nodes-base.twilio
displayName: Twilio
category: Communication
versions: [1]
priority: medium
status: specced
---

# Twilio

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twilio/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twilio/ | Public docs only |
| https://www.twilio.com/docs/sms/api/message-resource | Public API docs only |
| https://www.twilio.com/docs/voice/api/call-resource | Public API docs only |

## Wire format

- **Type string:** `n8n-nodes-base.twilio`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twilioApi` (required) — `accountSid` + `authToken`
- **Group:** `output`
- **Subtitle:** `={{$parameter["operation"] + ": " + $parameter["resource"]}}`

## Parameters

### Common fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `sms` | yes | — | Options: `sms`, `call`, `message` |
| `operation` | options | — | yes | depends on `resource` | See per-resource tables below |

### Resource: `sms`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `send` | yes | `resource:sms` | Options: `send` |
| `fromNumber` | string | `''` | yes | `resource:sms` | Sender phone (E.164, e.g. `+15551234567`) |
| `toNumber` | string | `''` | yes | `resource:sms` | Recipient phone (E.164) |
| `message` | string | `''` | yes | `resource:sms` | Message body (max 1600 chars for SMS) |
| `additionalFields` | collection | `{}` | no | `resource:sms` | See additional fields below |

#### `sms` additional fields

| name | type | default | notes |
|------|------|---------|-------|
| `mediaUrl` | string | `''` | URL to media attachment (sends MMS). Can be a comma-separated list of URLs. |

### Resource: `call`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `make` | yes | `resource:call` | Options: `make` |
| `fromNumber` | string | `''` | yes | `resource:call` | Caller phone (E.164) |
| `toNumber` | string | `''` | yes | `resource:call` | Callee phone (E.164) |
| `twimlUrl` | string | `''` | no | `resource:call` | URL returning TwiML instructions. Mutually exclusive with `twimlMessage`. |
| `twimlMessage` | string | `''` | no | `resource:call` | Inline TwiML (e.g. `<Response><Say>Hi</Say></Response>`). Mutually exclusive with `twimlUrl`. |
| `additionalFields` | collection | `{}` | no | `resource:call` | See additional fields below |

#### `call` additional fields

| name | type | default | notes |
|------|------|---------|-------|
| `timeout` | number | `60` | Seconds to ring before hanging up |
| `statusCallback` | string | `''` | URL Twilio calls with status updates |

### Resource: `message`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `get` | yes | `resource:message` | Options: `get`, `getAll`, `delete` |
| `messageId` | string | `''` | yes | `resource:message`, `operation:get\|delete` | Message SID |
| `returnAll` | boolean | `false` | no | `resource:message`, `operation:getAll` | Fetch all pages |
| `limit` | number | `50` | no | `resource:message`, `operation:getAll`, `returnAll:false` | Max results (1–1000) |
| `filters` | collection | `{}` | no | `resource:message`, `operation:getAll` | See filters below |

#### `message` filters

| name | type | default | notes |
|------|------|---------|-------|
| `from` | string | `''` | Filter by sender |
| `to` | string | `''` | Filter by recipient |
| `dateSent` | dateTime | `''` | Filter by date sent |

## Runtime behavior

### Input

Consumes items on `main` input (0-indexed). Each item may contain JSON data. The
node processes each input item independently based on the configured
resource/operation.

### Output

Produces items on `main` output (0-indexed). Each output item contains the
Twilio API response JSON in `json`. For `getAll`, each message becomes a
separate output item.

### Authentication

Uses HTTP Basic Auth with `accountSid` as the username and `authToken` as the
password, resolved from the `twilioApi` credential.

### API base

All requests are scoped to the account:
`https://api.twilio.com/2010-04-01/Accounts/{AccountSid}`

Request bodies are form-encoded (`application/x-www-form-urlencoded`).

### Errors

- Throws on HTTP 4xx/5xx with the Twilio error message
- Respects `continueOnFail`: on failure, returns error object in `json.error`
  for that item instead of throwing

### Expressions

All string and number parameters accept expressions (`{{ ... }}` or `=...`).

### Pagination

- `getAll` with `returnAll: true` follows `nextPageUri` from the response
- `returnAll: false` uses `limit` (default 50)

## Acceptance tests

### Test: SMS — Send text message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "fromNumber": "+15551234567",
  "toNumber": "+15557654321",
  "message": "Hello from n8n!"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "status": "queued",
    "from": "+15551234567",
    "to": "+15557654321",
    "body": "Hello from n8n!"
  }
}]
```

### Test: SMS — Send MMS with media URL

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "fromNumber": "+15551234567",
  "toNumber": "+15557654321",
  "message": "See this image",
  "additionalFields": { "mediaUrl": "https://example.com/image.png" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "MMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "status": "queued",
    "from": "+15551234567",
    "to": "+15557654321",
    "body": "See this image",
    "num_media": "1"
  }
}]
```

### Test: Call — Make a call with inline TwiML

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "call",
  "operation": "make",
  "fromNumber": "+15551234567",
  "toNumber": "+15557654321",
  "twimlMessage": "<Response><Say>Hello from n8n!</Say></Response>"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "status": "queued",
    "from": "+15551234567",
    "to": "+15557654321"
  }
}]
```

### Test: Message — Get a message by SID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "get",
  "messageId": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "status": "delivered",
    "from": "+15551234567",
    "to": "+15557654321",
    "body": "Hello"
  }
}]
```

### Test: Message — Get all messages with limit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "returnAll": false,
  "limit": 2
}
```

**Expect** output (2 items):
```json
[
  { "json": { "sid": "SMaaa", "status": "delivered", "body": "First" } },
  { "json": { "sid": "SMbbb", "status": "sent", "body": "Second" } }
]
```

### Test: Message — Delete a message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| SMS send parameters | documented | Twilio Messages API: To, From, Body, MediaUrl |
| Call make parameters | documented | Twilio Calls API: To, From, Url or Twiml |
| Form-encoded request body | documented | Twilio REST API uses `application/x-www-form-urlencoded` |
| Basic Auth scheme | documented | accountSid:authToken as HTTP Basic credentials |
| Message getAll pagination | inferred | Follows `nextPageUri` in response; `limit` param passed to API |
| additionalFields for call (timeout, statusCallback) | inferred | Common Twilio Calls API optional params |
| Twilio Trigger node | gap | Separate node type `n8n-nodes-base.twilioTrigger`; not covered here |

## OpenFlow mapping

- **Definition group:** `core` (app node, communication)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.twilio.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `twilioApi` (accountSid, authToken)