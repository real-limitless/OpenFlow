---
type: n8n-nodes-base.gmailTool
displayName: Gmail
category: AI Tool
versions: [2, 2.1, 2.2]
priority: high
status: specced
---

# Gmail (AI Tool)

A tool variant of the Gmail node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Draft, Label, Message, and Thread resources against the Gmail API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/draft-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/label-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/thread-operations.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/gmail/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.gmailTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (second output for approval responses when using "Send and Wait for Approval")
- **Credentials:** `gmailOAuth2` (OAuth2) or `googleApi` (service account)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Resource selection

The user selects a resource (Draft, Label, Message, Thread) which determines available operations.

### Draft operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Draft | Create | Subject, Email Type (text/html), Message, optional: To, CC, BCC, Attachments, From Alias, Reply-To, Thread ID |
| Draft | Delete | Draft ID |
| Draft | Get | Draft ID, optional: Download Attachments, Attachment Prefix |
| Draft | Get Many | Return All, Limit, optional: Include Spam/Trash, Download Attachments, Attachment Prefix |

### Label operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Label | Create | Name, optional: Label List Visibility, Message List Visibility |
| Label | Delete | Label ID |
| Label | Get | Label ID |
| Label | Get Many | Return All, Limit |

### Message operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Message | Add Label | Message ID, Label Names or IDs |
| Message | Delete | Message ID |
| Message | Get | Message ID, Simplify (boolean) |
| Message | Get Many | Return All, Limit, Simplify, optional: filters (Include Spam/Trash, Labels, Search, Read Status, Received After/Before, Sender) |
| Message | Mark as Read | Message ID |
| Message | Mark as Unread | Message ID |
| Message | Remove Label | Message ID, Label Names or IDs |
| Message | Reply | Message ID, Email Type, Message, optional: CC, BCC, Attachments, Sender Name, Reply to Sender Only |
| Message | Send | To, Subject, Email Type, Message, optional: CC, BCC, Attachments, Sender Name, Reply-To |
| Message | Send and Wait for Approval | To, Subject, Message, optional: Approval Type, Button Labels, Button Styles |

### Thread operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Thread | Add Label | Thread ID, Label Names or IDs |
| Thread | Delete | Thread ID |
| Thread | Get | Thread ID, Simplify, optional: Return Only Messages |
| Thread | Get Many | Return All, Limit, optional: filters (Include Spam/Trash, Labels, Search, Read Status, Received After/Before) |
| Thread | Remove Label | Thread ID, Label Names or IDs |
| Thread | Reply | Thread ID, Message ID (within thread), Email Type, Message, optional: CC, BCC, Attachments, Sender Name |
| Thread | Trash | Thread ID |
| Thread | Untrash | Thread ID |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "Simplify" option controls whether output is the simplified metadata format or raw API response
- Approval-based operations produce items on output[1] for human-in-the-loop scenarios

## Runtime behavior

### Input

Consumes items from `main` input. For operations that send or reply, the binary attachment data from input items can be referenced by field name.

### Output

**Output[0]** — main result:
- Draft/Message/Thread/Label data returned from the Gmail API, optionally simplified to metadata format (headers, IDs, labels)

**Output[1]** — approval result (only when using "Send and Wait for Approval" on Message resource):
- Contains the approval/denial response from the human reviewer

### Errors

- API errors (auth failures, rate limits, invalid IDs) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Permanent deletion operations (Message Delete, Thread Delete) are irreversible

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions.

## Acceptance tests

### Test: Send a simple text message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "emailType": "text",
  "message": "Hello from n8n workflow",
  "sendTo": "recipient@example.com",
  "subject": "Automated greeting"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<valid-gmail-message-id>",
    "threadId": "<valid-thread-id>",
    "labelIds": ["SENT"],
    "snippet": "Hello from n8n workflow"
  }
}]
```

### Test: Get Many messages with read status filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "returnAll": true,
  "simplify": true,
  "filters": { "readStatus": "unread" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<message-id>",
    "threadId": "<thread-id>",
    "labelIds": ["UNREAD", "INBOX"],
    "headers": {
      "From": "sender@example.com",
      "To": "me@example.com",
      "Subject": "Re: Meeting"
    }
  }
}]
```

### Test: Create a draft

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "draft",
  "operation": "create",
  "subject": "Draft proposal",
  "emailType": "text",
  "message": "Body of draft"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<draft-id>",
    "message": { "id": "<message-id>", "threadId": "<thread-id>" }
  }
}]
```

### Test: Mark a message as read

**Given** input items:
```json
[{ "json": { "messageId": "123abc" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "markAsRead",
  "messageId": "={{ $json.messageId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {}
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact output shape for each operation | documented | Public docs describe field-level behavior; exact JSON shape varies by Gmail API version |
| $fromAI() dynamic parameter support | documented | Public docs describe the feature but don't enumerate which fields support it per operation |
| sendAndWait approval flow output shape | documented | Second output branch for approval/denial documented in Message operations |
| Version differences (v1 vs v2.x) | inferred from corpus | v2 added Thread resource and new operations; version 1 lacks Thread and has different resource/operation structure |
| Shared mailbox ("send as") alias support | documented | From Alias and Send Replies To parameters support delegated sending |
| Attachment handling | documented | Attachments referenced by input binary field name, colon-separated for multiple fields |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.gmailTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only