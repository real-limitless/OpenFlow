---
type: n8n-nodes-base.mailjet
displayName: Mailjet
category: Communication
versions: [1]
priority: medium
status: specced
---

# Mailjet

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailjet.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailjet.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailjettrigger.md | Public docs only |
| https://dev.mailjet.com/email/guides/send-api-v31/ | Third-party API docs |
| https://dev.mailjet.com/sms/reference/send-message/ | Third-party API docs |

## Wire format

- **Type string:** `n8n-nodes-base.mailjet`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**

| Credential name | Condition | Auth method |
|-----------------|-----------|-------------|
| `mailjetEmailApi` | resource = `email` | API Key + Secret Key (Basic Auth) |
| `mailjetSmsApi` | resource = `sms` | Bearer token |

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | email | yes | — | Options: `email` (Email), `sms` (SMS) |

### Email: Send

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | send | yes | resource = email | Options: `send` (Send), `sendTemplate` (Send Template) |
| fromEmail | string | — | yes | resource = email, operation = send | Sender email address |
| toEmail | string | — | yes | resource = email, operation = send | Recipient(s), comma-separated for multiple |
| subject | string | — | no | resource = email, operation = send | Email subject line |
| text | string | — | no | resource = email, operation = send | Plain text body |
| html | string | — | no | resource = email, operation = send | HTML body |
| jsonParameters | boolean | false | no | resource = email, operation = send | Toggle between UI variables and raw JSON |

### Email: Send — Additional Fields (collection)

| name | type | default | notes |
|------|------|---------|-------|
| bccEmail | string | — | BCC recipients, comma-separated |
| ccAddresses | string | — | CC recipients, comma-separated |
| fromName | string | — | Display name for sender |
| priority | number | 2 | Mailjet priority (1-3, higher = faster send) |
| replyTo | string | — | Reply-to address, comma-separated for multiple |
| templateLanguage | boolean | false | Enable Mailjet template language processing in body |
| trackClicks | options | account_default | One of: account_default, enabled, disabled |
| trackOpens | options | account_default | One of: account_default, enabled, disabled |
| customCampaign | string | — | Campaign identifier for tracking |
| deduplicateCampaign | boolean | false | Deduplicate campaign messages |

### Email: Send — Variables

When `jsonParameters` is false: `variablesUi` fixed collection of `{ name: string, value: string }` pairs.  
When `jsonParameters` is true: `variablesJson` string containing a raw JSON object.

### Email: Send Template

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | sendTemplate | yes | resource = email | Options: `send`, `sendTemplate` |
| fromEmail | string | — | yes | resource = email, operation = sendTemplate | Sender email address |
| toEmail | string | — | yes | resource = email, operation = sendTemplate | Recipient(s), comma-separated |
| templateId | options (loadOptions) | — | yes | resource = email, operation = sendTemplate | Resolved via `getTemplates` loadOptions method; fetches `GET /v3/REST/template` |
| jsonParameters | boolean | false | no | resource = email, operation = sendTemplate | Toggle variable input mode |

Additional Fields and Variables are the same as for Email: Send, with the addition of a `subject` field in Additional Fields.

### SMS: Send

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | send | yes | resource = sms | Options: `send` |
| from | string | — | yes | resource = sms, operation = send | Sender name; 3–11 alphanumeric characters |
| to | string | — | yes | resource = sms, operation = send | Recipient phone in E.164 format (+<country><number>) |
| text | string | — | yes | resource = sms, operation = send | Message body |

## Runtime behavior

### Email operations

Each input item is processed independently. The executor builds a Mailjet Send API v3.1 payload (`POST /v3/send`):

- `From.Email` ← `fromEmail`
- `To[n].Email` ← each split value from `toEmail`
- `Cc[n].Email` ← each split value from `ccAddresses`
- `Bcc[n].Email` ← each split value from `bccEmail`
- `Subject`, `HTMLPart`, `TextPart` as provided
- `SandboxMode` is injected automatically from credential (for Email API key type)
- Tracking and campaign fields mapped to top-level keys (`TrackClicks`, `TrackOpens`, `CustomCampaign`, `DeduplicateCampaign`)
- `Priority` mapped directly (1–3 integer)
- `Variables` object populated from either the UI key/value pairs or parsed from the JSON string

For Send Template, `TemplateID` and `TemplateLanguage` are set on the payload instead of body content.

### SMS operations

Each input item is processed independently. The executor calls the Mailjet SMS API (`POST /sms/send`) with:

- `From` ← `from`
- `To` ← `to`
- `Text` ← `text`

### Output

Email responses include per-recipient delivery metadata. Each recipient in To/Cc/Bcc receives `Email`, `MessageID`, `MessageUUID`, `MessageHref` in the response.

SMS responses return the SMS send confirmation from the Mailjet SMS API.

### Errors

- If `variablesJson` contains invalid JSON, a `NodeOperationError` is thrown.
- API errors from Mailjet (invalid addresses, authentication failures, rate limits) propagate as node errors.
- `continueOnFail`: when enabled, the failing item is replaced with `{ json: { error: <message> } }` and execution continues to the next item.

### Expressions

All string, number, and boolean parameters accept expressions.

## Acceptance tests

### Test: email send basic

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "fromEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>"
}
```

**Expect** that the executor constructs a POST request to `https://api.mailjet.com/v3/send` with body `{ "From": { "Email": "sender@example.com" }, "To": [{ "Email": "recipient@example.com" }], "Subject": "Hello", "TextPart": "Plain text body", "HTMLPart": "<p>HTML body</p>" }` and the `SandboxMode` flag from the credential. Output[0] contains the API response items.

### Test: email send with multiple recipients and CC

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "fromEmail": "sender@example.com",
  "toEmail": "a@example.com,b@example.com",
  "subject": "Group message",
  "text": "Hello all",
  "additionalFields": {
    "ccAddresses": "cc@example.com"
  }
}
```

**Expect** the executor splits recipients by comma, producing `To: [{ Email: "a@example.com" }, { Email: "b@example.com" }]` and `Cc: [{ Email: "cc@example.com" }]`.

### Test: email send template

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "sendTemplate",
  "fromEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "templateId": 12345,
  "additionalFields": {
    "templateLanguage": true
  }
}
```

**Expect** the executor constructs a POST to `https://api.mailjet.com/v3/send` with `TemplateID: 12345` and `TemplateLanguage: true` in the body, no `HTMLPart` or `TextPart`.

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
  "from": "MyApp",
  "to": "+33612345678",
  "text": "Your verification code is 1234"
}
```

**Expect** the executor calls `POST /sms/send` with body `{ "From": "MyApp", "To": "+33612345678", "Text": "Your verification code is 1234" }`.

### Test: email send with variables

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "fromEmail": "sender@example.com",
  "toEmail": "user@example.com",
  "subject": "Hi {{name}}",
  "html": "<p>Your code is {{code}}</p>",
  "jsonParameters": false,
  "variablesUi": {
    "variablesValues": [
      { "name": "name", "value": "Alice" },
      { "name": "code", "value": "9876" }
    ]
  }
}
```

**Expect** the executor sends body with `Variables: { name: "Alice", code: "9876" }`.

## Mailjet Trigger (sibling node)

A separate trigger node (`n8n-nodes-base.mailjetTrigger`) handles Mailjet event webhooks.

- **Type string:** `n8n-nodes-base.mailjetTrigger`
- **Inputs:** none
- **Outputs:** `main` × 1
- **Credentials:** `mailjetEmailApi`
- **Webhook:** POST, response mode `onReceived`, path `webhook`

### Event parameter

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| event | options | open | yes | Options: `blocked`, `bounce`, `open`, `sent`, `spam`, `unsub` |

### Runtime behavior

On workflow activation, the trigger registers a callback URL with Mailjet's EventCallbackUrl API (`POST /v3/rest/eventcallbackurl`) for the selected event type. On deactivation, it deletes the registration. Incoming POST requests from Mailjet containing event payloads are emitted as output items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Email operation parameters | Public docs + public descriptor metadata | Parameter names, types, defaults, and structure confirmed via descriptor |
| SMS operation parameters | Public docs + public descriptor metadata | Confirmed via descriptor |
| Template ID resolution | Public descriptor metadata | Loads options via `getTemplates` calling `GET /v3/REST/template` |
| API endpoint URLs | Public docs + third-party API docs | `api.mailjet.com` for email, Mailjet SMS API for SMS |
| Sandbox mode injection | Inferred from descriptor | Credential has SandboxMode boolean; executor injects it into payload body |
| Error handling | Inferred from SDK patterns | `NodeOperationError` for invalid JSON; API errors propagate as node errors |
| Trigger webhook lifecycle | Public docs + public descriptor metadata | Register/deregister via EventCallbackUrl API; event type options from descriptor |

## OpenFlow mapping

- **Definition group:** `Communication`
- **Executor file:** `src/lib/engine/executors/mailjet.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only