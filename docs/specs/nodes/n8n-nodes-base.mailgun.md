---
type: n8n-nodes-base.mailgun
displayName: Mailgun
category: Communication
versions: [1]
priority: low
status: specced
---

# Mailgun

## Sources

| URL | Source class |
|-----|---------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailgun.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailgun.md | Public docs only |
| https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview | Third-party API docs |
| https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mailgun`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailgunApi` (required)

## Credentials (mailgunApi)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| apiDomain | options | `api.mailgun.net` | yes | `api.mailgun.net` (US) or `api.eu.mailgun.net` (EU) |
| emailDomain | string | — | yes | The sending domain configured in Mailgun |
| apiKey | string (password) | — | yes | Mailgun API key from Settings > API Keys |

Authentication: HTTP Basic Auth with username `api` and the API key as password.
Base URL: `https://{apiDomain}/v3`.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | — | yes | Sender address, optionally with display name e.g. `Admin <admin@example.com>` |
| toEmail | string | — | yes | Recipient address(es), comma-separated for multiple |
| ccEmail | string | — | no | CC recipient address(es), comma-separated |
| bccEmail | string | — | no | BCC recipient address(es), comma-separated |
| subject | string | — | no | Email subject line |
| text | string | — | no | Plain-text body (multi-line string) |
| html | string | — | no | HTML body (rich text editor) |
| attachments | string | — | no | Comma-separated list of binary property names whose data should be attached |

At least one of `text`, `html` must be provided to form a valid message.

## Runtime behavior

### Input

Each input item is processed independently. The node reads parameter values from the node configuration (with expression support). Binary properties named in `attachments` are read from the input item's binary data store.

### Output

Each input item produces one output item. The outgoing item carries:
- `json` — the Mailgun API response body (parsed JSON from `POST /v3/{domain}/messages`), typically containing `{ id: "<...>", message: "Queued. Thank you." }`
- `binary` — forwarded unchanged from the input item

### Errors

- **Missing credential:** throws `NodeOperationError`
- **API failure (4xx/5xx):** throws `NodeApiError` with the Mailgun error message
- **Missing body:** if neither `text`, `html`, nor a template-reference is provided, throws `NodeOperationError`
- **`continueOnFail`:** on error, outputs the item with a `{ json: { error: { message, ... } } }` shape on output[0]; no items on error branch

### Expressions

All string parameters accept expressions (`fromEmail`, `toEmail`, `ccEmail`, `bccEmail`, `subject`, `text`, `html`, `attachments`).

### API call

The executor sends a `POST` request to `https://{apiDomain}/v3/{emailDomain}/messages` with multipart/form-data body containing:
- `from` — `fromEmail`
- `to` — `toEmail`
- `cc` — `ccEmail` (optional)
- `bcc` — `bccEmail` (optional)
- `subject` — `subject`
- `text` — `text`
- `html` — `html`
- `attachment` — each named binary property as a file attachment (optional)

The API authenticates via HTTP Basic Auth (`api` / `apiKey`).

## Acceptance tests

### Test: send plain text email

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "fromEmail": "Sender <sender@example.com>",
  "toEmail": "recipient@example.com",
  "subject": "Hello",
  "text": "This is a test message."
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<mock-mailgun-message-id>", "message": "Queued. Thank you." } }]
```

### Test: send HTML email with CC

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "fromEmail": "admin@example.com",
  "toEmail": "to@example.com",
  "ccEmail": "cc@example.com",
  "subject": "HTML test",
  "html": "<h1>Hello</h1><p>World</p>"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<mock-id>", "message": "Queued. Thank you." } }]
```

### Test: send with binary attachment

**Given** input items:
```json
[{ "json": {}, "binary": { "myFile": { "data": "base64...", "mimeType": "text/plain", "fileName": "notes.txt" } } }]
```

**Parameters:**
```json
{
  "fromEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "subject": "With file",
  "text": "See attached",
  "attachments": "myFile"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<mock-id>", "message": "Queued. Thank you." } }]
```

### Test: continueOnFail — missing body

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "fromEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "continueOnFail": true
}
```

**Expect** output[0]:
```json
[{ "json": { "error": { "message": "At least one of text or html must be provided", "description": "" } } }]
```

### Test: multiple recipients

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "fromEmail": "sender@example.com",
  "toEmail": "a@example.com,b@example.com",
  "subject": "Group",
  "text": "Hello all"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<mock-id>", "message": "Queued. Thank you." } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node parameters | documented + descriptor | All 8 parameters confirmed from public docs and descriptor JSON |
| Credential schema | documented + descriptor | 3 fields (apiDomain, emailDomain, apiKey) confirmed |
| API endpoint | documented | POST /v3/{domain}/messages from Mailgun API docs |
| Authentication | documented | HTTP Basic Auth with username `api` |
| Output shape | inferred | Mailgun API returns `{ id, message }` JSON; shape is standard |
| Binary attachment handling | descriptor | `attachments` param references binary property names |
| Continue-on-fail behavior | convention | Standard OpenFlow error-output pattern |
| Usable as AI tool | documented | Node has `usableAsTool: true` in descriptor |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/mailgun.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only