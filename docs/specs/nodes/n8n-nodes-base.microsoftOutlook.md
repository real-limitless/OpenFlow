---
type: n8n-nodes-base.microsoftOutlook
displayName: Microsoft Outlook
category: Communication
versions: [1, 2]
priority: medium
status: specced
---

# Microsoft Outlook

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftoutlook.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentraserviceprincipal.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview | Public docs only (service API) |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOutlook`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials** (via an Authentication dropdown):
  - `microsoftOutlookOAuth2Api` — Outlook-specific OAuth2 credential (default)
  - `microsoftOAuth2Api` — generic Microsoft Graph OAuth2 credential, reusable across Microsoft nodes; must be granted the scopes this node needs (`Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.ReadWrite`)
  - `microsoftEntraServicePrincipalApi` — app-only access through a Microsoft Entra app registration (no signed-in user), available from node version 2 (wire name inferred from public docs; the documented credential is "Microsoft Entra Service Principal (App-Only)")
- **Version policy:** v1 (legacy) and v2 (current; adds app-only credential support)

> The credentials support a **Microsoft Graph API Base URL** selector (Global / US Government / US Government DOD / China) for sovereign cloud tenants, and the Outlook-specific credential can target a **shared inbox** (enable "Use Shared Inbox" and supply a user's UPN or ID). With the app-only credential there is no signed-in user, so the node requires an extra **Mailbox** parameter (a user principal name or user object ID) naming which mailbox to act on; application permissions are tenant-wide (`Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.ReadWrite`, `MailboxSettings.Read` for the categories dropdown; plus `Organization.Read.All`/`Directory.Read.All` for the credential test), and the node documents no blocked operations in app-only mode.

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `message` | yes | `calendar` \| `contact` \| `draft` \| `event` \| `folder` \| `folderMessage` \| `message` \| `messageAttachment` |

### Operations per resource

| resource | operation values | purpose |
|----------|------------------|---------|
| calendar | `create`, `delete`, `get`, `getAll`, `update` | Manage calendar objects (mailbox calendars). |
| contact | `create`, `delete`, `get`, `getAll`, `update` | Manage personal contacts. |
| draft | `create`, `delete`, `get`, `send`, `update` | Manage unsent message drafts; `send` sends an existing draft. |
| event | `create`, `delete`, `get`, `getAll`, `update` | Manage calendar events/appointments. |
| folder | `create`, `delete`, `get`, `getAll`, `update` | Manage mail folder hierarchy. |
| folderMessage | `getAll` | List messages inside a specific folder. |
| message | `delete`, `get`, `getAll`, `move`, `reply`, `send`, `sendAndWait`, `update` | Full message lifecycle; `sendAndWait` pauses the workflow for a human response. |
| messageAttachment | `add`, `download`, `get`, `getAll` | Attach binary data to, or fetch attachments from, a message. |

### Shared parameter patterns (abstracted)

- **Entity reference:** most operations take an ID (message ID, folder ID, calendar ID, contact ID, event ID, attachment ID). IDs are opaque strings obtained from Graph API reads; well-known folder names (e.g. `Inbox`, `SentItems`, `DeletedItems`) are accepted where a folder is selected.
- **Message composition** (send / draft / reply): recipients (`To`, `CC`, `BCC`), subject, and body, with a body format choice (text or HTML). `reply` additionally requires the target message and can add recipients from the original thread.
- **Move:** source message ID plus a destination folder ID.
- **Send and Wait for Response:** message recipients/subject/body plus a **Response Type** of `approval` (approve/disapprove), `freeText`, or `customForm`, with wait customization — **Limit Wait Time** (interval or wall time), **Append n8n Attribution**, button/form labels, and (for custom forms) a form built from n8n Form trigger form elements.
- **Get Many / list operations:** support `returnAll` or a `limit`, plus filter options (e.g. folder scoping) where applicable.
- **Attachment operations:** binary data is referenced from input items; `download`/`get` can write binary data back onto output items.

## Runtime behavior

### External API (Microsoft Graph / Outlook REST)

The node calls the Microsoft Graph API (`https://graph.microsoft.com/v1.0/`) on behalf of the authenticated user (`/me`). Representative endpoint families (inferred from Microsoft Graph public docs):

- `GET/POST/PATCH/DELETE /me/messages` and `/me/messages/{id}` — message CRUD
- `POST /me/sendMail` — compose-and-send a new message (used by Send), with a `message` payload plus a `saveToSentItems` flag; returns `202 Accepted` with no body
- `POST /me/messages/{id}/move`, `/me/messages/{id}/reply`, `/me/messages/{id}/send` — message actions (`reply` and `send` also return `202 Accepted` with no body)
- `GET /me/mailFolders` and `/me/mailFolders/{id}/messages` — folders and folder messages
- Drafts live in the mail system and are read/sent via the same message endpoints (draft flag / Drafts folder)
- `GET/POST/PATCH/DELETE /me/calendar(s)` and `/me/events` / `/me/events/{id}` — calendars and events
- `GET/POST /me/contacts` and `/me/contacts/{id}` — contacts
- `GET/POST /me/messages/{id}/attachments` and `/me/messages/{id}/attachments/{id}` — attachments

List responses carry a `value` array and use `@odata.nextLink` for pagination. Resource IDs may be mutable across copy/move operations; the node must always operate on current IDs.

### Input

Each input item is processed independently. Entity IDs, message content, folder targets, and option values may reference item data via `{{ }}` expressions. Attachment data is sourced from input-item binary properties.

### Output

- **Create / Update / Move / Get:** the resulting Graph resource object (message, draft, event, contact, folder, calendar, attachment), with the fields Microsoft returns (e.g. `id`, `subject`, `body`, `from`, `toRecipients`, `start`/`end` for events, `webLink`). `move` returns the relocated message object.
- **Send / Reply / Draft Send:** these Graph endpoints respond `202 Accepted` with an empty body, so no message resource comes back. The node emits a synthesized acknowledgment (e.g. `{ success: true, messageId: … }`) referencing the message acted on; it must not fabricate a Graph `id`.
- **Get Many / Folder Message Get Many:** one output item per resource, unwrapped from the API `value` array.
- **Send and Wait for Response (partial / out of scope):** the documented contract is a workflow pause after sending, resuming later with the collected response (approval verdict, free-text answer, or custom-form submission). Full wait-and-resume behavior is **out of scope** for the current executor: it does not block on an external webhook, so on completion it emits a placeholder outcome item (e.g. `{ approved, timeout }` flags) instead of a true collected response. Implementers must not emit a bare `{ success: true }` for this operation.
- **Delete:** the Graph API returns `204 No Content`; the input item is passed through unchanged.
- **Attachment download/get:** the binary payload is attached to the output item in addition to JSON metadata.

### Errors

- Missing/invalid credentials, resource-not-found (404), and other Graph API 4xx/5xx failures are surfaced as node errors with the API-provided message.
- With `continueOnFail` enabled, the node emits an error item (e.g. `{ json: { error: … } }`) instead of throwing, and processing continues.
- `sendAndWait` timeout behavior must honor **Limit Wait Time** in a full implementation; with the current placeholder, the operation returns the placeholder outcome immediately without hanging. No `_sendAndWait` marker field should leak into the emitted JSON.

### Expressions

All string and reference parameters accept `{{ }}` expression syntax (IDs, recipients, subject, body, filters, option values).

### AI tool / human-in-the-loop

The node can be surfaced as an AI agent tool (parameters settable via `$fromAI()`), and can act as a human review step where an agent pauses for approval through this service before an approved action proceeds.

## Acceptance tests

### Test: send a message

**Given** input items:
```json
[{ "json": { "to": "recipient@example.com", "subject": "Hello", "bodyText": "World" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "toRecipients": "{{ $json.to }}",
  "subject": "{{ $json.subject }}",
  "bodyContent": "{{ $json.bodyText }}",
  "bodyType": "text"
}
```

**Expect** output[0] — one item whose `json` is a synthesized acknowledgment (`{ success: true, messageId: … }`), because Graph `send` returns `202 Accepted` with no body. The executor must not fabricate a message `id` or echo the submitted fields back as API output.

### Test: get many messages in a folder (pagination)

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

**Expect** output[0] — one output item per message, each with a `json` object containing at least `id` and `subject`; the executor must follow `@odata.nextLink` when the API returns partial pages.

### Test: create a calendar event

**Given** input items:
```json
[{ "json": { "title": "Planning", "start": "2026-08-15T10:00:00Z", "end": "2026-08-15T11:00:00Z" } }]
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

**Expect** output[0] — the created Graph `event` object with a non-empty `id` and the requested `subject`/`start`/`end` values.

### Test: add an attachment from binary input

**Given** input items:
```json
[{ "json": { "messageId": "msg-123" }, "binary": { "file": { "mimeType": "text/plain", "fileName": "note.txt", "fileSize": 4 } } }]
```

**Parameters:**
```json
{
  "resource": "messageAttachment",
  "operation": "add",
  "messageId": "{{ $json.messageId }}",
  "binaryProperty": "file"
}
```

**Expect** output[0] — the attachment object returned by Graph (contains `id`, `name` = `note.txt`, and a non-empty `contentBytes`/content reference). No binary attachment should be silently dropped.

### Test: send and wait for response (approval) — partial

**Given** input items:
```json
[{ "json": { "approver": "manager@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "toRecipients": "{{ $json.approver }}",
  "subject": "Approve release",
  "responseType": "approval"
}
```

**Expect** — full wait-and-resume is out of scope (see Gaps); the executor must not emit a bare `{ success: true }` or leak a `_sendAndWait` marker. For now the acceptable contract is a placeholder outcome item exposing response flags (e.g. `approved` / `timeout`), which acts as a soft-skip fixture rather than a full human-in-the-loop verification. A complete pause/webhook resume flow is deferred.

### Test: delete a message with continueOnFail

**Given** input items:
```json
[{ "json": { "messageId": "NONEXISTENT" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": "{{ $json.messageId }}",
  "continueOnFail": true
}
```

**Expect** output[0] — `[{ "json": { "error": "…" } }]` emitted instead of a thrown error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | 8 resources, 38 operations per the public n8n docs page (Calendar 5, Contact 5, Draft 5, Event 5, Folder 5, Folder Message 1, Message 8, Message Attachment 4). |
| Credential choices | documented | Outlook OAuth2, generic Microsoft OAuth2 (Graph), and Entra Service Principal (app-only, v2). App-only requires a Mailbox parameter and tenant-wide application permissions. |
| Credential wire names | mixed | `microsoftOutlookOAuth2Api` and `microsoftOAuth2Api` documented/known; `microsoftEntraServicePrincipalApi` inferred (public docs name it "Microsoft Entra Service Principal (App-Only)"). |
| Send endpoint | documented | Graph `/me/sendMail` (compose-and-send) plus `/me/messages/{id}/send` (send existing draft); both return `202 Accepted` with no body, hence `{ success: true }` output. |
| Send and Wait response types | documented | Approval / Free Text / Custom Form; wait limits (interval or wall time) and n8n attribution documented. |
| Send and Wait resume payload | inferred (partial / out of scope) | Documented contract is a workflow pause followed by resumption with the collected verdict/answer/form submission, but the current executor returns a placeholder outcome (e.g. `{ approved, timeout }`) without a real pause/webhook. Full send-and-wait is **out of scope**; acceptance is a soft-skip fixture only. |
| Exact parameter names and nested option collections | inferred | Abstracted to outcome-level names; original UI nesting/option enums deliberately not reconstructed. |
| Graph endpoint mapping | inferred | From Microsoft Graph mail API public docs; per-operation HTTP details not enumerated. |
| Pagination (`@odata.nextLink`) | documented | Microsoft Graph list contract. |
| `send`/`reply` return 202 with empty body | documented | Microsoft Graph `send`/`reply` return `202 Accepted` with no body; output is a synthesized acknowledgment, not a message resource. |
| Shared-inbox support | documented | Outlook OAuth2 credential: "Use Shared Inbox" + target user UPN/ID (microsoft.md credentials page). |
| Cloud-tenant support | documented | Microsoft Graph API Base URL selector (Global / US Government / US Government DOD / China) on the credential. |
| Draft storage model | inferred | Drafts assumed managed via the Graph message/draft endpoints; exact wire shape not verified. |

## OpenFlow mapping

- **Definition group:** `core` (Communication)
- **Executor file:** `src/lib/engine/executors/microsoft-outlook.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftOutlookOAuth2Api`, `microsoftOAuth2Api`, `microsoftEntraServicePrincipalApi`
