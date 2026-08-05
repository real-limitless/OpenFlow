---
type: n8n-nodes-base.emailSendHitlTool
displayName: Send Email (HITL)
category: AI Tool
versions: [2, 2.1]
priority: medium
status: specced
---

# Send Email (HITL) — Human-in-the-Loop Approval via Email

An AI agent tool variant of the Send Email (SMTP) node, used exclusively as a human-in-the-loop approval channel in the AI Agent Tools Panel. When a connected tool requires human review, the workflow pauses and sends an email with interactive approve/deny buttons (or free-text/custom-form input) to the configured recipient. The reviewer's decision controls whether the tool executes.

The node shares the same SMTP sending mechanism, credential requirements, and send-and-wait response types as the standard Send Email node, but is accessible only from the "Human review" section of the AI Agent's Tools Panel — not from the node palette as a standalone workflow node.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/send-email/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.emailSendHitlTool`
- **Aliases:** `SMTP`, `email`, `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** (none — this node is not connected via `main` input/output; it sits in the AI Agent's Tools Panel as a HITL approval channel)
- **Outputs:** (none — the approval response is passed back to the AI Agent internally)
- **Credentials:** `smtp` (SMTP account with user, password, host, port, SSL/TLS toggle)

## Parameters

### Credential

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential:smtp | — | yes | SMTP account credentials |

### Message

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | — | yes | Sender address; supports `Name <email>` format; expressions / `$fromAI()` |
| toEmail | string | — | yes | Reviewer recipient(s); comma-separated; expressions |
| subject | string | — | yes | Email subject line; expressions |
| emailFormat | options | `text` | no | `text`, `html`, or `both` |
| text | string | — | conditional | Plain body (required when `emailFormat` includes text); supports `$tool.name` and `$tool.parameters` expression variables |
| html | string | — | conditional | HTML body (required when `emailFormat` includes html); supports `$tool.name` and `$tool.parameters` expression variables |
| message | string | `The AI wants to use {{ $tool.name }} with params: {{ JSON.stringify($tool.parameters, null, 2) }}` | no | Custom message for the reviewer; supports `$tool.name` and `$tool.parameters` |

### Options

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| options.ccEmail | string | — | no | Carbon-copy recipients; comma-separated |
| options.bccEmail | string | — | no | Blind carbon-copy recipients; comma-separated |
| options.replyTo | string | — | no | Reply-To header address |
| options.attachments | string | — | no | Comma-separated binary property names to attach |
| options.appendAttribution | boolean | true | no | Append "This email was sent automatically with n8n" |
| options.ignoreSslIssues | boolean | false | no | Skip TLS/SSL certificate validation |

### Response Type

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| responseType | options | `approval` | no | `approval` — approve/decline buttons; `freeText` — open text form; `customForm` — multi-field form |

**Approval mode options:**

| name | type | default | notes |
|------|------|---------|-------|
| options.approvalType | options | `approve` | `approve` (button only) or `approveAndDecline` (two buttons) |
| options.approveButtonLabel | string | `Approve` | Label for the approval button |
| options.approveButtonStyle | options | `primary` | `primary` or `secondary` |
| options.declineButtonLabel | string | `Decline` | Label for the decline button |
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
| options.formElements | array | Array of form field definitions |
| options.messageButtonLabel | string | Button label in email |
| options.responseFormTitle | string | Form title |
| options.responseFormDescription | string | Form description |
| options.responseFormButtonLabel | string | Submit button label |
| options.limitWait | boolean | Enable wait timeout |
| options.limitTime.maxWaitTime | number | Max seconds to wait |
| options.appendAttribution | boolean | Append n8n attribution line |

### Form Elements (custom form mode)

Each form element supports:
- **Field Name** / **Field Label** — identifier and display label
- **Field Type** — e.g. `text`, `number`, `date`, `email`, `boolean`, `file`
- **Required** — whether the field must be filled
- **Placeholder** — placeholder text
- **Multiple Values** — allow multiple selections

### The `$tool` expression variable

When constructing the reviewer message, two variables are available:

| Variable | Description |
|----------|-------------|
| `$tool.name` | The display name of the tool the AI is trying to call |
| `$tool.parameters` | The parameters (from `$fromAI()` fields) the AI proposes |

Example: `The AI wants to use {{ $tool.name }} with:\n{{ JSON.stringify($tool.parameters, null, 2) }}`

## Runtime behavior

### Lifecycle

1. The AI Agent determines it needs to call a connected tool that has human review enabled through the email channel.
2. The workflow pauses and sends an email (via SMTP) to the configured recipient with action buttons (approve/decline) or input forms.
3. The human reviewer sees the tool name, proposed parameters, and any custom message in the email body.
4. The reviewer clicks an action button or submits a form embedded in the email (via an action URL that calls back to n8n's execution webhook).
5. **If approved:** The tool executes with the AI-specified input and returns the result to the agent.
6. **If denied:** The tool call is canceled; the AI is informed of the rejection and execution continues.

### Approval email message

The email is sent via the same SMTP/nodemailer mechanism as the standard Send Email node (text, HTML, or both). Embedded in the email is an action URL (or rendered buttons/forms) that the reviewer can use to respond. The workflow remains paused on a webhook until a response is received or the timeout expires.

### Output

No data is emitted to wire outputs. The approval outcome (approved with tool parameters, or denied) is consumed internally by the AI Agent runtime:
- **Approval response:** `{ data: { approval: "approved" | "declined" } }`
- **Free text response:** `{ data: { text: "<user input>" } }`
- **Custom form response:** `{ data: { <fieldName>: <value>, ... } }`

### Errors

- SMTP connection errors, authentication failures, or invalid recipient addresses throw an `ExecutionError`.
- If the reviewer does not respond and `limitWait` is disabled, the workflow remains paused indefinitely.
- When `limitWait` is enabled and the timeout expires, execution resumes automatically (behavior depends on implementation — typically treated as rejection).
- SSL/TLS validation errors are suppressed when `ignoreSslIssues` is enabled.

### Expressions

All string parameters (`fromEmail`, `toEmail`, `subject`, `text`, `html`, option values) accept expressions. The `message` parameter supports `$tool.name` and `$tool.parameters`. Tool-level parameters can use `$fromAI()` for dynamic model-driven population.

## Acceptance tests

### Test: Basic approve flow

**Given** an AI Agent has `n8n-nodes-base.emailSendHitlTool` configured as the HITL approval channel with `toEmail: reviewer@example.com`.

**Agent** calls a gated tool named "Send Email" with parameters `{ "to": "user@example.com", "subject": "Hello" }`.

**Expect:**
1. An email is sent to `reviewer@example.com` showing the tool name and AI-determined parameters.
2. The workflow pauses.
3. When the reviewer clicks **Approve**, the "Send Email" tool executes with the proposed parameters.
4. The tool result is returned to the AI Agent.

### Test: Deny flow

**Given** the HITL tool with `approvalType: approveAndDecline`, `approveButtonLabel: "Yes, proceed"`, `declineButtonLabel: "No, stop"`.

**Agent** calls a gated tool.

**Expect:**
1. The email shows custom button labels "Yes, proceed" and "No, stop".
2. When the reviewer clicks **No, stop**, the tool is not executed.
3. The AI Agent receives a rejection signal.

### Test: Timeout

**Given** `limitWait: true` and `limitTime.maxWaitTime: 300`.

**Agent** calls a gated tool.

**Reviewer** does not respond within 300 seconds.

**Expect** the workflow resumes automatically (tool is not executed).

### Test: Free text response

**Given** `responseType: freeText`.

**Agent** calls a gated tool.

**Reviewer** submits "Please modify the parameters first."

**Expect** tool is not executed; the reviewer's text is returned to the AI Agent as feedback.

### Test: Custom message with `$tool` variable

**Given** `message: "Approve call to {{ $tool.name }} with params {{ JSON.stringify($tool.parameters) }}?"`.

**Agent** calls tool named "Lookup User".

**Expect** the email body contains: "Approve call to Lookup User with params {\"email\":\"jane@example.com\"}?"

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| SMTP sending parameters (from, to, subject, body, CC, BCC, attachments) | documented | From public Send Email docs |
| Email format (text/html/both) | documented | Public docs cover Text, HTML, Both |
| Send and Wait for Response (approval, free text, custom form) | documented | Public docs cover all three response types |
| HITL tool approval lifecycle | documented | Public HITL-for-tools page describes the pattern |
| `$tool.name` / `$tool.parameters` variables | documented | Public HITL page documents both |
| `$fromAI()` integration | documented | Standard AI tool pattern |
| Output response shapes (approval/free-text/custom-form) | documented | Same response structures as Send Email's sendAndWait operation |
| SMTP credential fields | documented | Public send-email credentials doc |
| Wire format (no `main` in/out; sits in Tools Panel) | inferred | Same pattern as Slack HITL and Chat HITL nodes — not a standalone palette node |
| Exact email action URL mechanism (how buttons/forms call back) | inferred | Uses the same sendAndWait webhook callback mechanism as the standard node |
| Timeout default (when limitWait is disabled) | not documented | Workflow pauses indefinitely; behavior matches other HITL channels |
| Number of concurrent reviewer responses handled | not documented | First response wins (assumed, matching other HITL tools) |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.emailSendHitlTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
