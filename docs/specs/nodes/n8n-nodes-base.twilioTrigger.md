---
type: n8n-nodes-base.twilioTrigger
displayName: Twilio Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Twilio Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.twiliotrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twilio/ | Public docs only |
| https://www.twilio.com/docs/phone-income/call-webhook-request | Public API docs only |
| https://www.twilio.com/docs/sms/twiml | Public API docs only |

## Wire format

- **Type string:** `n8n-nodes-base.twilioTrigger`
- **Aliases:** `SMS`, `Phone`, `Voice`
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `twilioApi` (required) — `accountSid` + `authToken` (also supports API Key auth: `apiKeySid` + `apiKeySecret`)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `event` | options | — | yes | Determines which Twilio event to listen for. Options: `On New SMS` (incoming SMS message via Twilio webhook), `On New Call` (incoming or completed voice call via Twilio webhook). |

## Runtime behavior

### Lifecycle (webhook registration)

On workflow activation, the node registers a webhook URL with Twilio for the chosen event type. The webhook URL is the n8n instance's public callback URL. On workflow deactivation, the node unregisters the webhook.

For the SMS event, Twilio is configured to send POST requests to the webhook URL when an SMS is received by the configured Twilio phone number. For the Call event, Twilio sends POST requests when a call is received.

### Input

No `main` input — this is a trigger node. Execution begins when Twilio delivers a webhook POST.

### Output

Emits one output item per received webhook event. The output item's `json` property contains the full Twilio webhook request body as key-value pairs (form-encoded POST body parsed by n8n). For SMS events this includes:

- `MessageSid` — unique SID for the message
- `From` — sender phone number (E.164)
- `To` — recipient phone number (E.164, the Twilio number)
- `Body` — message text content
- `NumMedia` — number of media attachments (0 for plain SMS)
- `SmsStatus` — status like `received`
- `AccountSid` — the receiving account SID
- `ApiVersion` — Twilio API version (e.g. `2010-04-01`)

For Call events:

- `CallSid` — unique SID for the call
- `From` — caller phone number
- `To` — callee phone number
- `CallStatus` — call state (e.g. `ringing`, `in-progress`, `completed`)
- `CallDuration` — duration in seconds (on completed call)
- `AccountSid`
- `ApiVersion`

The exact field set depends on the Twilio webhook payload for the chosen event and the call lifecycle stage at which the webhook fires.

### Manual execution

When executed manually (without a real webhook event), the node polls Twilio for recent incoming messages or calls to return a representative sample. If no recent events exist, it returns an empty output.

### Errors

- Webhook registration failure (e.g. invalid credentials, unreachable n8n URL) throws on activation.
- Invalid or malformed webhook payloads are skipped (continueOnFail behavior).
- Respects `continueOnFail`: on failure, returns error object in `json.error` for that item instead of throwing.

### Expressions

All parameters accept expressions.

## Acceptance tests

### Test: On New SMS — receives incoming message webhook

**Given** no input items (trigger node).

**Parameters:**
```json
{
  "event": "On New SMS"
}
```

**Simulated webhook payload:**
```http
POST /webhook HTTP/1.1
Content-Type: application/x-www-form-urlencoded

MessageSid=SM123&From=%2B15551234567&To=%2B15557654321&Body=Hello+world&NumMedia=0&SmsStatus=received&AccountSid=ACxxx&ApiVersion=2010-04-01
```

**Expect** output[0]:
```json
[{
  "json": {
    "MessageSid": "SM123",
    "From": "+15551234567",
    "To": "+15557654321",
    "Body": "Hello world",
    "NumMedia": "0",
    "SmsStatus": "received",
    "AccountSid": "ACxxx",
    "ApiVersion": "2010-04-01"
  }
}]
```

### Test: On New Call — receives ringing call webhook

**Parameters:**
```json
{
  "event": "On New Call"
}
```

**Simulated webhook payload:**
```http
POST /webhook HTTP/1.1
Content-Type: application/x-www-form-urlencoded

CallSid=CA456&From=%2B15551234567&To=%2B15557654321&CallStatus=ringing&AccountSid=ACxxx&ApiVersion=2010-04-01
```

**Expect** output[0]:
```json
[{
  "json": {
    "CallSid": "CA456",
    "From": "+15551234567",
    "To": "+15557654321",
    "CallStatus": "ringing",
    "AccountSid": "ACxxx",
    "ApiVersion": "2010-04-01"
  }
}]
```

### Test: On New Call — receives completed call webhook with duration

**Parameters:**
```json
{
  "event": "On New Call"
}
```

**Simulated webhook payload:**
```http
POST /webhook HTTP/1.1
Content-Type: application/x-www-form-urlencoded

CallSid=CA789&From=%2B15551234567&To=%2B15557654321&CallStatus=completed&CallDuration=42&AccountSid=ACxxx&ApiVersion=2010-04-01
```

**Expect** output[0]:
```json
[{
  "json": {
    "CallSid": "CA789",
    "From": "+15551234567",
    "To": "+15557654321",
    "CallStatus": "completed",
    "CallDuration": "42",
    "AccountSid": "ACxxx",
    "ApiVersion": "2010-04-01"
  }
}]
```

### Test: Manual execution returns recent SMS

**Given** workflow is executed manually.

**Parameters:**
```json
{
  "event": "On New SMS"
}
```

**Expect** output[0] to contain one or more items each with `MessageSid`, `From`, `To`, `Body` fields, or empty output if no recent messages exist.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event options (SMS, Call) | documented | Public n8n docs list exactly these two events |
| Webhook registration lifecycle | inferred | Standard n8n trigger pattern for webhook nodes |
| Twilio webhook payload fields | inferred from Twilio public API docs | SMS webhook fields are well-documented by Twilio; exact field superset depends on event |
| Manual execution behavior | inferred | Typical n8n trigger fallback for webhook nodes |
| Credential types | documented | Public n8n docs document Auth Token and API Key methods |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.twilioTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `twilioApi` (accountSid, authToken / apiKeySid, apiKeySecret)
