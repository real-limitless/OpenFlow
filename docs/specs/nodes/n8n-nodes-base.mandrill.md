---
type: n8n-nodes-base.mandrill
displayName: Mandrill
category: Communication
versions: [1]
priority: medium
status: specced
---

# Mandrill

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mandrill/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mandrill/ | Public docs only |
| https://mailchimp.com/developer/transactional/api/messages/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mandrill`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mandrillApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed: `message` | `message` | Y | — | Only one resource |
| operation | enum: `sendTemplate`, `sendHtml` | `sendTemplate` | Y | show: `resource: message` | How the email body is composed |
| template | string (dynamic options) | — | Y (sendTemplate only) | show: `operation: sendTemplate` | Template name or ID, loaded from Mandrill account |
| fromEmail | string (expression) | — | Y | show: `operation: sendHtml, sendTemplate` | Sender address, optionally with display name (e.g. `Admin <admin@example.com>`) |
| toEmail | string (expression) | — | Y | show: `operation: sendHtml, sendTemplate` | Recipient address; comma-separated for multiple |
| jsonParameters | boolean | false | N | — | Toggles JSON vs structured UI for attachments, headers, merge vars, metadata |
| options | object | `{}` | N | — | Collection of delivery options (see below) |

### Options fields

| name | type | default | notes |
|------|------|---------|-------|
| async | boolean | false | Background bulk-send mode; always true for >10 recipients |
| autoText | boolean | false | Auto-generate plain-text from HTML |
| autoHtml | boolean | false | Auto-generate HTML from plain-text |
| bccAddress | string | — | Blind-copy recipient |
| fromName | string | — | Override display name (alternative to inline in fromEmail) |
| googleAnalyticsCampaign | string | — | Value for `utm_campaign` parameter |
| googleAnalyticsDomains | string | — | Comma-separated domains for GA param appending |
| html | string | — | Raw HTML body (for sendHtml operation) |
| important | boolean | false | Priority delivery flag |
| inlineCss | boolean | false | Auto-inline CSS (<256KB HTML only) |
| ipPool | string | — | Dedicated IP pool name |
| preserveRecipients | boolean | false | Expose all recipients in the To header |
| returnPathDomain | string | — | Custom return-path domain |
| sendAt | string | — | UTC timestamp `YYYY-MM-DD HH:MM:SS` for scheduled sending |
| signingDomain | string | — | Custom SPF/DKIM signing domain |
| subAccount | string | — | Mandrill subaccount ID |
| subject | string | — | Email subject line |
| tags | string | — | Comma-separated tags (max 100, ≤50 chars each) |
| text | string | — | Plain-text body |
| trackClicks | boolean | false | Enable click tracking |
| trackOpens | boolean | false | Enable open tracking |
| trackingDomain | string | — | Custom tracking domain |
| urlStripQs | boolean | false | Strip query strings from tracked URLs |
| viewContentLink | boolean | false | Remove content logging for sensitive emails |

### Attachments

When `jsonParameters` is `false` (structured UI mode):

| field | type | notes |
|-------|------|-------|
| attachmentsValues | array of `{type, name, content}` | Explicit attachment entries (MIME type, filename, base64 content) |
| attachmentsBinary | array of `{property}` | Reference binary data from input item by property name |

When `jsonParameters` is `true`, a single `attachmentsJson` field accepts a JSON object of attachment definitions.

### Merge variables

- **Global** (`mergeVarsUi` or `mergeVarsJson`): name/content pairs applied to all recipients
- **Per-recipient** merge variables are not separated from global in this design; the executor should pass them via the Mandrill API's `merge_vars` / `global_merge_vars` structure

### Metadata

- Structured UI (`metadataUi`): array of `{name, value}` key-value pairs
- JSON mode (`metadataJson`): raw object up to 10 indexed keys

### Headers

- Structured UI (`headersUi`): array of `{name, value}` pairs
- JSON mode (`headersJson`): raw object

## Runtime behavior

### Input

Passes input items through. For each item, the node constructs and sends one email (or batch of emails if toEmail contains commas). The body content depends on the operation:
- **sendTemplate**: fetches the named template from Mandrill and renders it with optional merge variables
- **sendHtml**: sends the provided HTML directly with optional plain-text fallback

### Output

Each input item produces one output item with the Mandrill API response envelope:

```json
{
  "_id": "abc123...",
  "email": "recipient@example.com",
  "status": "sent"
}
```

The `status` field can be: `sent`, `queued`, `scheduled`, `rejected`, or `invalid`.

### Errors

- Throws on missing required fields (fromEmail, toEmail, template for sendTemplate)
- Throws on API errors (bad credentials, invalid template, rejected recipient, subaccount not found)
- Supports `continueOnFail`: on error, empty output for that item, processing continues

### Expressions

All string, boolean, and number parameters accept expression strings.

## Acceptance tests

### Test A: send HTML

**Given** input items:

```json
[{
  "json": {
    "fromEmail": "sender@example.com",
    "toEmail": "recipient@example.com",
    "subject": "Test from OpenFlow"
  }
}]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendHtml",
  "fromEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "options": {
    "subject": "Test from OpenFlow",
    "html": "<h1>Hello</h1><p>This is a test.</p>"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "_id": "<any non-empty string>",
    "email": "recipient@example.com",
    "status": "sent"
  }
}]
```

### Test B: send template

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendTemplate",
  "template": "welcome-email",
  "fromEmail": "team@example.com",
  "toEmail": "user@example.com",
  "options": {
    "subject": "Welcome!"
  }
}
```

**Expect** output[0] contains `_id` and `status` fields as per Test A.

### Test C: scheduled send

**Parameters** include `sendAt` with a future UTC timestamp. **Expect** output `status` equals `"scheduled"`.

### Test D: attachments from binary

**Parameters** with `attachmentsBinary` referencing a property on the input item. **Expect** output `status` equals `"sent"` and the email arrives with the attachment.

### Test E: error on missing template

**Parameters** with `operation: "sendTemplate"` but no `template` value. **Expect** the node to throw or produce an error item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire format | documented | n8n public docs + type descriptor confirm single resource, two operations |
| Parameter shapes | inferred from corpus | Schema definitions used at the parameter-name level; no implementation code copied |
| Mandrill API contract | documented | Mailchimp transactional API docs for `/messages/send` and `/messages/send-template` |
| Credentials | documented | `mandrillApi` — single API key field, Bearer token sent as HTTP header |
| Output shape | inferred | Per-recipient response with `_id`, `email`, `status` — standard Mandrill API response |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mandrill.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
