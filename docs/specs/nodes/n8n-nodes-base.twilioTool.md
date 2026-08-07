---
type: n8n-nodes-base.twilioTool
displayName: Twilio
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Twilio (AI Tool)

A tool variant of the Twilio node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters via `$fromAI()`. Wraps the Twilio REST API v2010-04-01 with two resources: SMS and Call.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twilio.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twilio.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://www.twilio.com/docs/voice/api/call-resource | External API docs |
| https://www.twilio.com/docs/usage/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.twilioTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twilioApi` (Account SID + Auth Token or API Key SID + API Key Secret)

## Parameters

### Resource selection

The user selects either `sms` or `call` as the resource.

### SMS resource (operation: send)

Sends an SMS, MMS, or WhatsApp message via the Twilio Messages API at `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | — | yes | Always `sms` |
| operation | string | — | yes | Always `send` |
| from | string | — | yes | Twilio phone number (E.164) or alphanumeric sender ID, or WhatsApp number `whatsapp:+XXXX` |
| to | string | — | yes | Recipient phone number (E.164) or WhatsApp number `whatsapp:+XXXX` |
| body | string | — | yes | Message body content (text for SMS, text/caption for MMS/WhatsApp) |
| mediaUrls | string[] | — | no | URLs of media files to attach (for MMS/WhatsApp) |

### Call resource (operation: make)

Makes a phone call using text-to-speech via the Twilio Calls API at `POST /2010-04-01/Accounts/{AccountSid}/Calls.json`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | — | yes | Always `call` |
| operation | string | — | yes | Always `make` |
| from | string | — | yes | Twilio phone number (E.164) |
| to | string | — | yes | Recipient phone number (E.164) |
| twiml | string | — | one-of | TwiML instructions for the call — must provide one of twiml or url |
| url | string | — | one-of | URL that returns TwiML instructions — must provide one of twiml or url |
| sendDigits | string | — | no | DTMF digits to dial after pickup (`0-9`, `#`, `*`, `w` pause, `W` 1s pause; max 32) |
| timeout | number | 60 | no | Seconds to allow ringing before assuming no answer (max 600) |
| record | boolean | false | no | Whether to record the call |
| recordingChannels | string | mono | no | `mono` or `dual` recording channels |
| machineDetection | string | — | no | `Enable` or `DetectMessageEnd` for answering machine detection |
| statusCallback | string | — | no | URL to receive call status callbacks |
| statusCallbackEvent | string[] | — | no | Events triggering callback: `initiated`, `ringing`, `answered`, `completed` |
| trim | string | trim-silence | no | `trim-silence` or `do-not-trim` for recording silence trimming |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Resource and operations may be inferred by the AI based on the task description
- From/To phone numbers, message body, and TwiML content are typical AI-populated parameters

## Runtime behavior

### Input

Consumes items from `main` input. Each input item is processed independently, triggering one API call per item. The `mediaUrls` parameter accepts an array of publicly accessible media URLs.

### Output

**Output[0]** — result per item:

SMS send operation returns the Twilio Message resource object:
- `sid` — the 34-character Message SID (starts with `SM`)
- `status` — message status (`queued`, `sent`, `failed`, etc.)
- `date_created`, `date_updated` — timestamps in RFC 2822 format
- `from`, `to` — phone numbers used
- `body` — message body
- `num_segments`, `num_media` — segment/media counts
- `price`, `price_unit` — cost information
- `error_code`, `error_message` — populated on failure
- `account_sid`, `api_version`, `uri` — account and API metadata
- `subresource_uris` — links to related resources (media, feedback)

Call make operation returns the Twilio Call resource object:
- `sid` — the 34-character Call SID (starts with `CA`)
- `status` — call status (`queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed`, `no-answer`, `canceled`)
- `date_created`, `date_updated` — timestamps in RFC 2822 format
- `from`, `to` — phone numbers
- `duration` — call duration in seconds (populated after completion)
- `price`, `price_unit` — cost information
- `direction` — `outbound-api`
- `answered_by` — `human` or `machine` (if machine detection enabled)
- `queue_time` — wait time in milliseconds
- `start_time`, `end_time` — call timeline
- `account_sid`, `api_version`, `uri` — account and API metadata
- `subresource_uris` — links to recordings, notifications, transcriptions, etc.

### Errors

- Twilio API errors (invalid phone numbers, insufficient credits, unverified caller IDs, account suspended) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- SMS and Call operations that fail due to invalid parameters will return error_code and error_message in the response object

### Expressions

All string, number, and boolean parameters accept standard n8n expression strings. Parameters are AI-populatable when the node is used as a tool.

## Acceptance tests

### Test: Send an SMS message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "from": "+15017122661",
  "to": "+15558675310",
  "body": "Hello from OpenFlow workflow"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "date_created": "Tue, 31 Aug 2025 12:00:00 +0000",
    "date_updated": "Tue, 31 Aug 2025 12:00:01 +0000",
    "date_sent": null,
    "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "to": "+15558675310",
    "from": "+15017122661",
    "body": "Hello from OpenFlow workflow",
    "status": "queued",
    "num_segments": "1",
    "num_media": "0",
    "direction": "outbound-api",
    "api_version": "2010-04-01",
    "price": null,
    "price_unit": "USD",
    "error_code": null,
    "error_message": null,
    "uri": "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json",
    "subresource_uris": {
      "media": "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Media.json",
      "feedback": "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Feedback.json"
    }
  }
}]
```

### Test: Send a WhatsApp message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sms",
  "operation": "send",
  "from": "whatsapp:+14155238886",
  "to": "whatsapp:+15558675310",
  "body": "Hello from WhatsApp via Twilio!"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "SMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "from": "whatsapp:+14155238886",
    "to": "whatsapp:+15558675310",
    "body": "Hello from WhatsApp via Twilio!",
    "status": "queued",
    "direction": "outbound-api",
    "num_segments": "1",
    "num_media": "0"
  }
}]
```

### Test: Make a phone call with TwiML

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "call",
  "operation": "make",
  "from": "+15017122661",
  "to": "+15558675310",
  "twiml": "<Response><Say>Hello, this is your automated workflow calling.</Say></Response>",
  "record": true,
  "timeout": 30
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "date_created": "Tue, 31 Aug 2025 12:00:00 +0000",
    "date_updated": "Tue, 31 Aug 2025 12:00:01 +0000",
    "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "to": "+15558675310",
    "from": "+15017122661",
    "status": "queued",
    "direction": "outbound-api",
    "api_version": "2010-04-01",
    "price": null,
    "price_unit": "USD",
    "queue_time": "1000",
    "uri": "/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json"
  }
}]
```

### Test: Make a phone call with URL-hosted TwiML

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "call",
  "operation": "make",
  "from": "+15017122661",
  "to": "+15558675310",
  "url": "http://demo.twilio.com/docs/voice.xml"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sid": "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "status": "queued",
    "direction": "outbound-api"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Two resources (SMS, Call) | documented | Public n8n docs list SMS send and Call make operations |
| Twilio API credentials | documented | Public docs confirm Account SID + Auth Token or API Key auth |
| SMS parameters (from, to, body, mediaUrls) | documented | Twilio Messages API is standard; mediaUrls enables MMS/WhatsApp media |
| Call parameters (from, to, twiml, url) | documented | Twilio Calls API documented at twilio.com/docs |
| Output shape (Message resource, Call resource) | documented | Twilio REST API returns full resource objects per the Twilio API reference |
| AI tool $fromAI() support | documented | Public docs confirm tool-mode pattern for app nodes |
| WhatsApp support via `whatsapp:` prefix | documented | Standard Twilio WhatsApp API convention |
| Exact supported SMS subresource fields | inferred | Full Twilio Message resource object is returned; spec covers common fields |
| Call optional parameter defaults | inferred | Twilio API docs specify defaults; n8n may override some (e.g., timeout default 60) |
| Media URL upload behavior (binary vs URL) | inferred | The tool variant likely uses mediaUrls (URL-only) rather than binary file upload |
| Version differences | inferred | Single version assumed; no version-specific changes documented for tool variant |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.twilioTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
