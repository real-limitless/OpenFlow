---
type: n8n-nodes-base.emailSendTool
displayName: Send Email
category: AI Tool
versions: [2, 2.1]
priority: medium
status: specced
---

# Send Email (AI Tool)

An AI agent tool variant of the Send Email (SMTP) node. When connected to a Tools AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Sends email via any SMTP server.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/send-email/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.emailSendTool`
- **Aliases:** `SMTP`, `email`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (output 0: email sent; output 1: approval/response from "Send and Wait for Response")
- **Credentials:** `smtp` (SMTP account with user, password, host, port, SSL/TLS toggle)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential:smtp | — | yes | SMTP account credentials |

### Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `send` | yes | `send` — deliver message; `sendAndWait` — deliver and pause workflow for response |

### Send operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | — | yes | Sender address; supports `Name <email>` format; expressions / $fromAI() |
| toEmail | string | — | yes | Recipient(s); comma-separated; expressions / $fromAI() |
| subject | string | — | yes | Email subject line; expressions / $fromAI() |
| emailFormat | options | `text` | no | `text`, `html`, or `both` |
| text | string | — | conditional | Plain body (required when emailFormat includes text); expressions / $fromAI() |
| html | string | — | conditional | HTML body (required when emailFormat includes html); expressions / $fromAI() |
| options.ccEmail | string | — | no | Carbon-copy recipients; comma-separated |
| options.bccEmail | string | — | no | Blind carbon-copy recipients; comma-separated |
| options.replyTo | string | — | no | Reply-To header address |
| options.attachments | string | — | no | Comma-separated binary property names to attach |
| options.appendAttribution | boolean | true | no | Append "This email was sent automatically with n8n" |
| options.ignoreSslIssues | boolean | false | no | Skip TLS/SSL certificate validation |

### Send and Wait for Response operation

All send-operation parameters apply, plus:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| responseType | options | `approval` | yes | `approval`, `freeText`, or `customForm` |

**Approval mode options:**

| name | type | default | notes |
|------|------|---------|-------|
| options.approvalType | options | `approve` | `approve` (button only) or `approveAndDecline` (two buttons) |
| options.approveButtonLabel | string | `Approve` | Label for the approval button |
| options.approveButtonStyle | options | `primary` | `primary` or `secondary` |
| options.declineButtonLabel | string | `Decline` | Label for disapproval button |
| options.declineButtonStyle | options | `secondary` | `primary` or `secondary` |
| options.limitWait | boolean | false | Enable wait timeout |
| options.limitTime.maxWaitTime | number | — | Max seconds to wait |
| options.appendAttribution | boolean | true | Append n8n attribution line |

**Free Text mode options:**

| name | type | default | notes |
|------|------|---------|-------|
| options.messageButtonLabel | string | `Respond` | Button label in email |
| options.responseFormTitle | string | — | Form title |
| options.responseFormDescription | string | — | Form description |
| options.responseFormButtonLabel | string | `Submit` | Submit button label |
| options.limitWait | boolean | false | Enable wait timeout |
| options.limitTime.maxWaitTime | number | — | Max seconds to wait |
| options.appendAttribution | boolean | true | Append n8n attribution line |

**Custom Form mode options:**

| name | type | notes |
|------|------|-------|
| options.formElements | array | Array of form field definitions (field name, type, label, required, placeholder, etc.) |
| options.messageButtonLabel | string | Button label in email |
| options.responseFormTitle | string | Form title |
| options.responseFormDescription | string | Form description |
| options.responseFormButtonLabel | string | Submit button label |
| options.limitWait | boolean | Enable wait timeout |
| options.limitTime.maxWaitTime | number | Max seconds to wait |
| options.appendAttribution | boolean | Append n8n attribution line |

## Runtime behavior

### Input

Each item on `main[0]` is processed independently. Binary data attached to items can be referenced in the `attachments` option by property name. Expression strings in `fromEmail`, `toEmail`, `subject`, `text`, `html`, and option fields are evaluated per-item.

### Send operation

For each input item, the node connects to the configured SMTP server using nodemailer, builds an RFC-2822 message (plain text, HTML, or multipart/alternative), attaches any referenced binary properties, and delivers the message. Output items carry the original JSON payload augmented with an `emailSend` object containing the SMTP response: `accepted` (array of accepted recipient addresses), `rejected` (array of rejected addresses), `envelope` (from + to), `messageId`, `messageSize`, and `response` (SMTP status string). Binary data is forwarded unchanged. Non-binary response output is emitted on output 0.

If delivery fails (connection refused, auth failure, recipient rejected), the node throws an error unless `continueOnFail` is set, in which case the error details are returned as output.

### Send and Wait for Response operation

The node sends the email with an embedded action URL (approval/decline buttons, text form, or custom form). The workflow is paused via the n8n execution lifecycle. A second output (index 1) receives the user's response when the workflow resumes. The response data varies by response type:
- **Approval:** `{ data: { approval: "approved" | "declined" } }` — emitted on output 1
- **Free Text:** `{ data: { text: "<user input>" } }` — emitted on output 1
- **Custom Form:** `{ data: { <fieldName>: <value>, ... } }` — emitted on output 1

### Error handling

- SMTP connection errors, authentication failures, and invalid recipient addresses throw an `ExecutionError`.
- If `continueOnFail` is enabled, the error is returned as the output item and execution continues.
- SSL/TLS validation errors are suppressed when `ignoreSslIssues` is true.

### Expressions

All string parameters (`fromEmail`, `toEmail`, `subject`, `text`, `html`, and option values) accept expressions. When used as an AI tool, parameters can use `$fromAI()` for dynamic model-driven population.

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

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "send",
  "fromEmail": "ann@example.com",
  "toEmail": "bob@example.com",
  "subject": "HTML test",
  "emailFormat": "html",
  "html": "<h1>Hello</h1><p>World</p>",
  "options": { "ccEmail": "carol@example.com" }
}
```

**Expect** output[0] to contain one item with an `emailSend` object where:
- `accepted` includes `bob@example.com` and optionally `carol@example.com`
- `envelope.to` includes both recipients

### Test: send and wait for response (approval)

**Given** an input item with `{ "json": {} }` and workflow configured to receive webhook responses.

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

**Expect** output[0] to contain the sent email metadata. After the user approves via the email link, output[1] receives `{ data: { approval: "approved" } }`.

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

**Expect** an `ExecutionError` to be thrown when `continueOnFail` is false. With `continueOnFail: true`, expect an output item containing an error property instead.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation parameters (from, to, subject, body, CC, BCC, reply-to) | documented | From public Send Email docs; all match SMTP email conventions |
| Email format (text/html/both) | documented | Public docs cover Text, HTML, Both modes |
| Send and Wait for Response (approval, free text, custom form) | documented | Public docs cover all three response types and their sub-options |
| Attachment behavior | documented | Binary property names via comma-separated string; documented in public docs |
| `$fromAI()` tool integration | documented | Standard AI tool pattern documented at use-ai-for-parameters.md |
| Output shape (`accepted`, `rejected`, `envelope`, `messageId`, etc.) | inferred from corpus schema (output shape only) | The JSON response fields were confirmed from the schema at `/dist/nodes/EmailSend/__schema__/v2.1.0/email/send.json` for the response contract only |
| SMTP credential fields | documented | Public send-email credentials doc covers user, password, host, port, SSL/TLS, client host name |
| `sendAndWait` exact payload structure | documented | Approval/free-text/custom-form response structures documented in public Send Email docs |
| Tool-mode-specific parameter behavior | inferred | As a tool variant, this node exposes the same parameters as the standard Send Email node with the added ability for AI agents to populate them dynamically |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/emailSendTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
