---
type: n8n-nodes-base.emailSend
displayName: Send Email
category: Communication
versions: [1, 2, 2.1]
priority: high
status: specced
---

# Send Email

Sends emails via an SMTP server using the nodemailer library. Supports plain-text, HTML, and multipart/alternative messages with attachments, CC/BCC, and reply-to headers. Also supports a "Send and Wait for Response" mode that pauses workflow execution and waits for the recipient to interact with an embedded web form (approval, free text, or custom form).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/send-email/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.emailSend`
- **Aliases:** `SMTP`, `email`, `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (slot 0: sent message metadata; slot 1: sendAndWait response data)
- **Credentials:** `smtp` (user email + password/app-password, host, port, SSL/TLS toggle, client host name)

## Parameters

### Credential

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential:smtp | — | yes | SMTP account (user, password, host, port, SSL/TLS) |

### Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `send` | yes | `send` — deliver message; `sendAndWait` — deliver and pause workflow for response |

### Send operation parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | — | yes | Sender address; supports `Name <email>` format; expressions |
| toEmail | string | — | yes | Recipient(s); comma-separated; supports `Name <email>` format |
| subject | string | — | yes | Email subject line; expressions |
| emailFormat | options | `text` | no | `text`, `html`, or `both` |
| text | string | — | conditional | Plain body (required when emailFormat includes text); expressions |
| html | string | — | conditional | HTML body (required when emailFormat includes html); expressions |
| options.ccEmail | string | — | no | Carbon-copy recipients; comma-separated |
| options.bccEmail | string | — | no | Blind carbon-copy recipients; comma-separated |
| options.replyTo | string | — | no | Reply-To header address |
| options.attachments | string | — | no | Comma-separated names of binary properties to attach |
| options.appendAttribution | boolean | true | no | Append "This email was sent automatically with n8n" |
| options.ignoreSslIssues | boolean | false | no | Skip TLS/SSL certificate validation |

### Send and Wait for Response parameters

All send-operation parameters apply, plus:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| responseType | options | `approval` | yes | `approval`, `freeText`, or `customForm` |

**Approval mode options:**

| name | type | default | notes |
|------|------|---------|-------|
| options.approvalType | options | `approve` | `approve` (button only) or `approveAndDecline` |
| options.approveButtonLabel | string | `Approve` | Label for the approval button |
| options.approveButtonStyle | options | `primary` | `primary` or `secondary` |
| options.declineButtonLabel | string | `Decline` | Label for disapproval button |
| options.declineButtonStyle | options | `secondary` | `primary` or `secondary` |
| options.limitWait | boolean | false | Enable wait timeout |
| options.limitTime.maxWaitTime | number | — | Maximum seconds to wait |
| options.appendAttribution | boolean | true | Append n8n attribution line |

**Free Text mode options:**

| name | type | default | notes |
|------|------|---------|-------|
| options.messageButtonLabel | string | `Respond` | Button label in email |
| options.responseFormTitle | string | — | Form title |
| options.responseFormDescription | string | — | Form description |
| options.responseFormButtonLabel | string | `Submit` | Submit button label |
| options.limitWait | boolean | false | Enable wait timeout |
| options.limitTime.maxWaitTime | number | — | Maximum seconds to wait |
| options.appendAttribution | boolean | true | Append n8n attribution line |

**Custom Form mode options:**

| name | type | notes |
|------|------|-------|
| options.formElements | array | Array of form field definitions (field name, type, label, required, placeholder, multiple values) |
| options.messageButtonLabel | string | Button label in email |
| options.responseFormTitle | string | Form title |
| options.responseFormDescription | string | Form description |
| options.responseFormButtonLabel | string | Submit button label |
| options.limitWait | boolean | Enable wait timeout |
| options.limitTime.maxWaitTime | number | Maximum seconds to wait |
| options.appendAttribution | boolean | Append n8n attribution line |

## Runtime behavior

### Input

Each item on `main[0]` is processed independently. Binary data attached to items can be referenced in the `attachments` option by binary property name (comma-separated). Expression strings in `fromEmail`, `toEmail`, `subject`, `text`, `html`, and option fields are evaluated per-item.

### Send operation

For each input item, the executor connects to the configured SMTP server, builds an RFC-2822 message (plain text, HTML, or multipart/alternative), attaches any referenced binary properties, and delivers. Output items carry the original JSON payload augmented with an `emailSend` object containing SMTP response metadata: `accepted` (array of accepted recipient addresses), `rejected` (array of rejected addresses), `envelope` (object with `from` and `to`), `messageId`, `messageSize`, and `response` (SMTP status string). Binary data is forwarded unchanged. Output is emitted on output slot 0.

If delivery fails (connection refused, authentication failure, recipient rejected), the node throws an `ExecutionError` unless `continueOnFail` is set, in which case the error details are returned as output items.

### Send and Wait for Response operation

The email is sent with an embedded action URL callback. The workflow pauses via the n8n execution lifecycle. When the recipient interacts with the email (clicks approve/decline, submits a free-text form, or submits a custom form), the callback resumes the workflow. The response data is emitted on output slot 1:

- **Approval:** `{ data: { approval: "approved" | "declined" } }`
- **Free Text:** `{ data: { text: "<user input>" } }`
- **Custom Form:** `{ data: { <fieldName>: <value>, ... } }`

Output slot 0 receives the sent email metadata as in the Send operation.

### Error handling

- SMTP connection errors, authentication failures, and invalid recipient addresses throw an `ExecutionError`.
- With `continueOnFail`, error details are returned as output items and execution continues.
- SSL/TLS validation errors are suppressed when `ignoreSslIssues` is true.
- For `sendAndWait`, if `limitWait` is enabled and the timeout expires, the workflow resumes automatically (typically treated as rejection).

### Expressions

All string parameters (`fromEmail`, `toEmail`, `subject`, `text`, `html`, and option values) accept expression strings.

## Acceptance tests

### Test: send plain-text email

**Given** input items:

```json
[{ "json": { "sender": "alice@example.com", "recipient": "bob@example.com" } }]
```

**Parameters:**

```json
{
  "operation": "send",
  "fromEmail": "={{ $json.sender }}",
  "toEmail": "={{ $json.recipient }}",
  "subject": "Test",
  "text": "Hello world"
}
```

**Expect** output[0] to contain one item with:
- The original `sender` and `recipient` fields preserved
- An `emailSend` object with properties `accepted` (array), `messageId` (string), `envelope` (object with `from` and `to`), `response` (string)

### Test: send HTML email with CC

**Given** one input item `{ "json": {} }`.

**Parameters:**

```json
{
  "operation": "send",
  "fromEmail": "ann@example.com",
  "toEmail": "bob@example.com",
  "subject": "HTML test",
  "emailFormat": "html",
  "html": "<h1>Hello</h1>",
  "options": { "ccEmail": "carol@example.com" }
}
```

**Expect** output[0] to contain one item with an `emailSend` object where:
- `accepted` includes `bob@example.com` and optionally `carol@example.com`
- `envelope.to` includes both recipients

### Test: send and wait for approval

**Given** one input item `{ "json": {} }` and workflow configured to receive webhook callbacks.

**Parameters:**

```json
{
  "operation": "sendAndWait",
  "fromEmail": "bot@example.com",
  "toEmail": "user@example.com",
  "subject": "Approve?",
  "text": "Please approve this action",
  "responseType": "approval",
  "options": {
    "approvalType": "approveAndDecline",
    "limitWait": true,
    "limitTime": { "maxWaitTime": 86400 }
  }
}
```

**Expect** output[0] contains sent email metadata. After the user approves via the email callback, output[1] receives `{ data: { approval: "approved" } }`.

### Test: both formats with attachment

**Given** one input item with binary property `report.pdf`.

**Parameters:**

```json
{
  "operation": "send",
  "fromEmail": "bot@example.com",
  "toEmail": "user@example.com",
  "subject": "Report",
  "emailFormat": "both",
  "text": "See attached report.",
  "html": "<p>See attached report.</p>",
  "options": { "attachments": "report.pdf" }
}
```

**Expect** the email is sent as multipart/alternative with the binary content attached.

### Test: connection failure with continueOnFail

**Given** an input item with invalid SMTP credentials.

**Parameters:**

```json
{
  "operation": "send",
  "fromEmail": "invalid@badhost",
  "toEmail": "any@example.com",
  "subject": "Should fail",
  "text": "body"
}
```

**Expect** an `ExecutionError` is thrown when `continueOnFail` is false. With `continueOnFail: true`, an output item containing an error property is emitted instead.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation parameters (from, to, subject, body, CC, BCC, reply-to) | documented | From public Send Email docs; all match SMTP conventions |
| Email format (text/html/both) | documented | Public docs cover Text, HTML, Both |
| Send and Wait for Response (approval, free text, custom form) | documented | Public docs cover all three response types and their options |
| Attachment behavior | documented | Binary property names via comma-separated string |
| Output shape (`accepted`, `rejected`, `envelope`, `messageId`, etc.) | inferred from corpus | Response contract confirmed from published schema descriptor; matches nodemailer SMTP transport response |
| SMTP credential fields | documented | Public send-email credentials doc |
| sendAndWait response payload structure | documented | Approval/free-text/custom-form shapes documented in public docs |
| Output slot count (2 outputs on v2/v2.1) | documented | Version 2 uses 2 output slots (send + response); version 1 uses 1 |
| Alias list | confirmed from corpus | Aliases from the node.json codex descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.emailSend.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
