---
type: n8n-nodes-base.microsoftOutlookTool
displayName: Microsoft Outlook
category: AI Tool
versions: [2]
priority: medium
status: specced
---

# Microsoft Outlook (AI Tool)

A tool variant of the Microsoft Outlook node for use as an AI agent tool. When connected to an AI Agent, the agent model dynamically populates parameters via `$fromAI()` expressions or the "let model fill" toggle. Wraps the full Microsoft Graph/Outlook REST API across 8 resources (Calendar, Contact, Draft, Event, Folder, Folder Message, Message, Message Attachment) with the same CRUD, move/reply/send/sendAndWait, and attachment operations as the non-tool node.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftoutlook.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentraserviceprincipal.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOutlookTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (or 2 when using sendAndWait, where output[1] carries the approval response)
- **Credentials** (via Authentication dropdown):
  - `microsoftOutlookOAuth2Api` — Outlook-specific OAuth2 (default; supports shared inbox)
  - `microsoftOAuth2Api` — generic Microsoft Graph OAuth2, scopes: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.ReadWrite`
  - `microsoftEntraServicePrincipalApi` — app-only (no signed-in user); requires a Mailbox parameter naming the target user mailbox

## Parameters

All resources and operations match the full `microsoftOutlook` node. See the canonical spec at `docs/specs/nodes/n8n-nodes-base.microsoftOutlook.md` for the complete parameter table. Key parameter families:

- **Resource selector:** `resource` ∈ { `calendar`, `contact`, `draft`, `event`, `folder`, `folderMessage`, `message`, `messageAttachment` }
- **Operation per resource:** CRUD + action operations (e.g. `send`, `reply`, `move`, `sendAndWait` for message; `add`, `download` for attachments)
- **Entity reference:** IDs (message, folder, calendar, contact, event, attachment) are opaque Graph resource IDs
- **Message composition:** To, CC, BCC, Subject, Body (text or HTML)
- **AI tool-specific:** All parameters accept `$fromAI()` expressions for dynamic population by the agent model

## Runtime behavior

### External API

Same Microsoft Graph API contract as the full Outlook node (`/me/messages`, `/me/sendMail`, `/me/mailFolders`, `/me/events`, `/me/contacts`, `/me/messages/{id}/attachments`, etc.). List responses use `value` arrays with `@odata.nextLink` pagination. Send/reply/move return `202 Accepted` with no body.

### Input

Consumes items from `main` input. Entity IDs, message content, folder targets, and option values may reference item data. Attachment binary data is sourced from input-item binary properties.

### Output

- **Create / Update / Move / Get:** the resulting Graph resource object with fields Microsoft returns
- **Send / Reply / Draft Send:** synthesized `{ success: true, messageId }` acknowledgment (Graph returns `202 Accepted` with no body)
- **Get Many:** one output item per resource, unwrapped from the API `value` array
- **Send and Wait for Response:** output[1] receives the collected human response (approval verdict, free-text, or custom-form submission); the send acknowledgement lands on output[0]
- **Delete:** `204 No Content` — input item passed through unchanged
- **Attachment get/download:** binary payload attached to the output item alongside JSON metadata

### Errors

API errors (4xx/5xx, auth failures, resource-not-found) propagate as node errors. `continueOnFail` emits an error item instead of throwing.

### Expressions

Parameters tagged as AI-populatable accept `$fromAI()`. All string fields accept standard n8n `{{ }}` expressions.

## Acceptance tests

### Test: Send a message via AI tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "toRecipients": "recipient@example.com",
  "subject": "Automated greeting",
  "bodyContent": "Hello from AI agent",
  "bodyType": "text"
}
```

**Expect** output[0] — `{ json: { success: true, messageId: "…" } }` (synthesized acknowledgment; Graph returns `202 Accepted` with no body).

### Test: Get many messages from Inbox

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "folderMessage",
  "operation": "getAll",
  "folderId": "Inbox",
  "returnAll": true
}
```

**Expect** output[0] — one item per message, each with `id` and `subject`; the executor follows `@odata.nextLink` for pagination.

### Test: Create a calendar event

**Given** input items:
```json
[{ "json": { "title": "Meeting", "start": "2026-08-15T10:00:00Z", "end": "2026-08-15T11:00:00Z" } }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "create",
  "subject": "{{ $json.title }}",
  "startDateTime": "{{ $json.start }}",
  "endDateTime": "{{ $json.end }}"
}
```

**Expect** output[0] — the created Graph event object with non-empty `id` and the requested `subject`/`start`/`end`.

### Test: AI agent populates parameters via $fromAI()

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "toRecipients": "= $fromAI('recipient')",
  "subject": "= $fromAI('subject')",
  "bodyContent": "= $fromAI('body')",
  "bodyType": "text"
}
```

**Expect** — the executor does not throw when `$fromAI()` is present in parameter values. The actual resolution of `$fromAI()` is handled by the AI agent framework, not by this node.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | Same 8 resources / 38 operations as the full Outlook node |
| Credential choices | documented | Three credential modes; same as full Microsoft Outlook node |
| Tool-mode parameter population | documented | `$fromAI()` support documented in public n8n AI docs |
| sendAndWait with AI agent | documented | Second output branch for human-in-the-loop approval responses |
| Exact $fromAI() parameter coverage per operation | inferred | Public docs describe the feature generally; not enumerated per field |
| Output shape for send/reply (202) | documented | Same synthesized `{ success: true, messageId }` as full Outlook node |
| Graph endpoint mapping | inferred | Same Graph API contracts as canonical Outlook spec |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.microsoftOutlookTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftOutlookOAuth2Api`, `microsoftOAuth2Api`, `microsoftEntraServicePrincipalApi`
- **Canonical reference:** `docs/specs/nodes/n8n-nodes-base.microsoftOutlook.md`
