---
type: n8n-nodes-base.mandrillTool
displayName: Mandrill (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Mandrill (AI Tool)

An AI agent tool variant of the Mandrill app node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Sends transactional email via the Mailchimp Transactional (Mandrill) API.

**Note:** This is not a separate node type — `n8n-nodes-base.mandrill` has `usableAsTool: true`. The tool variant exposes the same Message resource with Send Template and Send HTML operations, with `$fromAI()` dynamic parameter population for AI agents.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mandrill/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mandrill/ | Public docs only |
| https://mailchimp.com/developer/transactional/api/messages/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mandrillTool` (alias of `n8n-nodes-base.mandrill` with tool semantics)
- **Aliases:** `n8n-nodes-base.mandrill`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mandrillApi` (required) — API key authentication

## Parameters

The tool variant shares the same resource/operation structure as the base Mandrill node but supports AI-agent-driven parameter population via `$fromAI()`. Parameters are documented at the functional-outcome level; exact name/default/enum values match the base `n8n-nodes-base.mandrill` spec.

### Resource (fixed)

| Value | Purpose |
|-------|---------|
| `message` | Send a transactional email (the only resource) |

### Operation (required)

| Value | Label | Purpose |
|-------|-------|---------|
| `sendTemplate` | Send Template | Send a message based on a Mandrill stored template |
| `sendHtml` | Send HTML | Send a message using raw HTML content |

### Common required fields (for both operations)

Shown when `operation = sendTemplate` or `operation = sendHtml`. Accepts `$fromAI()`.

| name | type | required | description |
|------|------|----------|-------------|
| `fromEmail` | string | yes | Sender email address, optionally with display name (e.g. `Admin <admin@example.com>`) |
| `toEmail` | string | yes | Recipient email address; comma-separated for multiple recipients |

### Send Template fields

Shown when `operation = sendTemplate`. Accepts `$fromAI()`.

| name | type | required | description |
|------|------|----------|-------------|
| `template` | string | yes | The Mandrill template name or ID; loaded dynamically from the Mandrill account |

### JSON Parameters toggle

| name | type | default | description |
|------|------|---------|-------------|
| `jsonParameters` | boolean | false | When true, attachments, headers, merge vars, and metadata use raw JSON fields instead of structured UI |

### Options collection

All ungrouped delivery options in a single collection. Accepts `$fromAI()`.

| name | type | default | description |
|------|------|---------|-------------|
| `subject` | string | — | Email subject line |
| `html` | string | — | Raw HTML body (for `sendHtml` operation) |
| `text` | string | — | Plain-text body |
| `fromName` | string | — | Override display name |
| `bccAddress` | string | — | Blind-copy recipient address |
| `important` | boolean | false | Priority delivery flag |
| `trackOpens` | boolean | false | Enable open tracking |
| `trackClicks` | boolean | false | Enable click tracking |
| `trackingDomain` | string | — | Custom tracking domain |
| `signingDomain` | string | — | Custom SPF/DKIM signing domain |
| `returnPathDomain` | string | — | Custom return-path domain |
| `ipPool` | string | — | Dedicated IP pool name |
| `subAccount` | string | — | Mandrill subaccount ID |
| `tags` | string | — | Comma-separated tags (max 100, ≤50 chars each) |
| `sendAt` | string | — | UTC timestamp `YYYY-MM-DD HH:MM:SS` for scheduled sending |
| `async` | boolean | false | Background bulk-send mode; always true for >10 recipients |
| `autoText` | boolean | false | Auto-generate plain-text from HTML |
| `autoHtml` | boolean | false | Auto-generate HTML from plain-text |
| `inlineCss` | boolean | false | Auto-inline CSS (HTML < 256KB only) |
| `preserveRecipients` | boolean | false | Expose all recipients in the To header |
| `urlStripQs` | boolean | false | Strip query strings from tracked URLs |
| `viewContentLink` | boolean | false | Remove content logging for sensitive emails |
| `googleAnalyticsCampaign` | string | — | Value for `utm_campaign` parameter |
| `googleAnalyticsDomains` | string | — | Comma-separated domains for GA param appending |

### Merge variables

- **Structured UI** (`mergeVarsUi`): array of `{name, content}` pairs — global merge variables applied to all recipients
- **JSON mode** (`mergeVarsJson`): raw JSON array of global merge variable objects

### Metadata

- **Structured UI** (`metadataUi`): array of `{name, value}` key-value pairs (up to 10 indexed keys)
- **JSON mode** (`metadataJson`): raw JSON object

### Attachments

- **Structured UI** (`attachmentsValues`): array of `{type, name, content}` (MIME type, filename, base64)
- **Binary** (`attachmentsBinary`): array of `{property}` referencing input binary data
- **JSON mode** (`attachmentsJson`): raw JSON array of attachment definitions

### Headers

- **Structured UI** (`headersUi`): array of `{name, value}` pairs
- **JSON mode** (`headersJson`): raw JSON object

### AI-agent parameter mode

In AI agent tool mode, the agent model may supply any subset of parameters dynamically via `$fromAI()`. The "let model fill" toggle further relaxes parameter requirements — the model determines values at runtime based on the user's natural language request. This is the primary distinguishing behavior of the tool variant.

## Runtime behavior

### Input

Each input item is processed independently. For each item, the node constructs and sends one email (or batch if `toEmail` contains commas). When used as a tool within an AI Agent, the agent provides parameter values dynamically.

### Output

Each input item produces one output item with the Mandrill API per-recipient response:

```json
{
  "_id": "abc123...",
  "email": "recipient@example.com",
  "status": "sent"
}
```

The `status` field can be: `sent`, `queued`, `scheduled`, `rejected`, or `invalid`.

### API endpoints

- **sendHtml:** `POST /messages/send` — body contains `html`, `text`, `subject`, and all delivery options
- **sendTemplate:** `POST /messages/send-template` — body contains `template_name`, `template_content`, and merge variables
- Base URL: `https://mandrillapp.com/api/1.0/`
- Authentication: API key passed in the `key` field of every request body

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting `sendTemplate` or `sendHtml` operation at inference time
- Populating `fromEmail`, `toEmail`, `template`, `subject`, `html`, `text`, and all option fields from model-generated values
- Providing clear parameter descriptions to guide model selection (e.g., "Email address of the recipient; multiple ones separated by comma")

### Errors

- Throws on missing required fields (fromEmail, toEmail, template for sendTemplate)
- Throws on Mandrill API errors (bad credentials, invalid template, rejected recipient, subaccount not found)
- `continueOnFail`: on error, empty output for that item, processing continues

### Expressions

All string, boolean, and number parameters accept expression strings. In tool mode, `$fromAI()` expressions can delegate parameter values to the AI agent model.

## Acceptance tests

### Test A: agent sends HTML email

**Given** a connected AI agent that decides to send an email.

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendHtml",
  "fromEmail": "admin@example.com",
  "toEmail": "user@example.com",
  "options": {
    "subject": "Hello from the AI",
    "html": "<h1>Hello</h1><p>This was sent by an AI agent.</p>"
  }
}
```

**Expect** output[0] contains `{ "_id": "<any non-empty string>", "email": "user@example.com", "status": "sent" }`.

### Test B: agent sends template email

**Given** a connected AI agent that decides to use a stored template.

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

**Expect** output[0] contains `_id`, `email`, and `status` fields.

### Test C: agent decides operation and parameters at inference time

**Given** a connected AI agent with a `$fromAI()` compatible mandrill node as tool.

**Parameters:** operation and all data fields left for the model to populate via `$fromAI()`.

**Expect:** the agent selects a valid operation (sendHtml or sendTemplate), fills required parameters (`fromEmail`, `toEmail`, optionally `template`), and the node produces a successful output.

### Test D: scheduled send via tool

**Parameters** include `sendAt` with a future UTC timestamp. **Expect** output `status` equals `"scheduled"`.

### Test E: error on missing template in tool mode

**Parameters** with `operation: "sendTemplate"` but no `template` value. **Expect** the node to throw or produce an error item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`mandrillTool`) | inferred | The base `n8n-nodes-base.mandrill` node has `usableAsTool: true`; the tool variant follows the `<base>Tool` naming convention for spec organization |
| Operations (2) | documented | Public n8n docs confirm Message resource with sendTemplate and sendHtml |
| Parameter shapes | confirmed from corpus | JSON descriptor confirms all parameter names, types, defaults at the name level only; no implementation code copied |
| Credentials | documented | `mandrillApi` — single API key, documented at docs.n8n.io |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs |
| Output shape | inferred | Per-recipient Mandrill API response with `_id`, `email`, `status` |
| No dedicated tool docs page | inferred | The mandrill node registers as tool via `usableAsTool: true`; no separate `mandrillTool` docs page exists |
| Mandrill API contract | documented | Mailchimp transactional API docs for `/messages/send` and `/messages/send-template` |

## OpenFlow mapping

- **Definition group:** `core` (AI tool variant of an app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mandrillTool.ts` (or reuse base mandrill executor with tool-mode flag and `$fromAI()` support)
- **SDK:** `defineNode` + native `ExecutionContext` only
