---
type: n8n-nodes-base.emailSend
displayName: Send Email
category: Actions
versions: [2]
priority: medium
status: specced
---

# Send Email

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.emailsend/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/smtp/ | Public docs only (credential overview) |

## Wire format

- **Type string:** `n8n-nodes-base.emailSend`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `smtp` (host, port, secure, user, password) (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| fromEmail | string | | yes | — | Sender email address (**documented**) |
| fromName | string | | no | — | Sender display name (**documented**) |
| toEmail | string | | yes | — | Comma-separated recipient(s) (**documented**) |
| ccEmail | string | | no | — | Comma-separated CC (**documented**) |
| bccEmail | string | | no | — | Comma-separated BCC (**documented**) |
| replyTo | string | | no | — | Reply-to address (**documented**) |
| subject | string | | yes | — | Email subject (**documented**) |
| emailFormat | options | text | no | — | `text` or `html` (**documented**) |
| message | string | | no | emailFormat=text | Plain text body (**documented**) |
| htmlMessage | string | | no | emailFormat=html | HTML body (**documented**) |
| attachmentsUi | fixedCollection | | no | — | Attachment items: `binaryPropertyName` per entry (**documented**) |
| options | collection | | no | — | Additional options (**documented**) |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| allowUnauthorizedCerts | boolean | false | Ignore SSL/TLS certificate errors (**documented**) |

## Runtime behavior

### Input

One email sent per input item. All email parameters may reference item fields via expressions (**inferred** / standard).

### Output

One output item per input item with:

```json
{ "success": true, "to": ["user@example.com"], "subject": "..." }
```

### Errors

- Missing `smtp` credential throws (**inferred**).
- Missing required `fromEmail` or `toEmail` throws (**inferred**).
- SMTP transport failure throws unless `continueOnFail` is set (**inferred**).

### Expressions

`fromEmail`, `fromName`, `toEmail`, `ccEmail`, `bccEmail`, `replyTo`, `subject`, `message`, `htmlMessage` commonly accept expression strings (**inferred** / standard).

## Acceptance tests

### Test: send plain text email

**Given** one input item `{}`

**Parameters:**

```json
{
  "fromEmail": "bot@example.com",
  "toEmail": "user@example.com",
  "subject": "Hello",
  "emailFormat": "text",
  "message": "Hi there"
}
```

**Expect** output[0][0].json:

```json
{ "success": true, "to": ["user@example.com"], "subject": "Hello" }
```

### Test: send HTML email with cc

**Given** one input item `{}`

**Parameters:**

```json
{
  "fromEmail": "bot@example.com",
  "fromName": "Bot",
  "toEmail": "a@example.com, b@example.com",
  "ccEmail": "c@example.com",
  "subject": "Report",
  "emailFormat": "html",
  "htmlMessage": "<h1>Hi</h1>"
}
```

**Expect** output[0][0].json.to has 2 entries; transport receives html body.

### Test: missing credential throws

**Parameters:** valid email params, no `smtp` credential wired.

**Expect** throws with `smtp` in message.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact attachment wire shape | inferred | UI uses fixedCollection with binaryPropertyName entries |
| options sub-parameters | inferred | Only allowUnauthorizedCerts documented; others may exist |
| SMTP transport internals | inferred | Pluggable transport factory pattern (like FTP client factory) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/email-send.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only