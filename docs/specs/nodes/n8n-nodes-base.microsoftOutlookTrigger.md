---
type: n8n-nodes-base.microsoftOutlookTrigger
displayName: Microsoft Outlook Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Microsoft Outlook Trigger

Polling trigger that starts a workflow on the single supported event, **Message Received**, which fires for new messages in a connected Outlook mailbox. It polls the Microsoft Graph API on a configurable schedule, emits one workflow item per newly detected message, and keeps enough per-message state to avoid re-emitting already-seen messages on subsequent cycles.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftoutlooktrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only (credentials) |
| https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview | Public docs only (service API) |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOutlookTrigger`
- **Aliases:** `email`
- **Inputs:** `main` × 0 (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials** (via an Authentication dropdown):
  - `microsoftOutlookOAuth2Api` — Outlook-specific OAuth2 credential (default)
  - `microsoftOAuth2Api` — generic Microsoft Graph OAuth2 credential, reusable across other Microsoft nodes; must be granted the scopes this node needs (e.g. `Mail.ReadWrite`)
  - `microsoftEntraServicePrincipalApi` — app-only access through a Microsoft Entra app registration (no signed-in user)
- **Node version:** `1.0`
- **Category:** `Communication`

> The credentials support a **Microsoft Graph API Base URL** selector (Global / US Government / US Government DOD / China) for sovereign cloud tenants. The Outlook-specific credential can target a **shared inbox** (enable "Use Shared Inbox" and supply a user's UPN or ID). With the app-only credential the trigger requires an extra **Mailbox** parameter (user principal name or user object ID) to identity which mailbox to watch; application permissions (`Mail.ReadWrite`) are tenant-wide.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| event | options | `messageReceived` | yes | The only supported event. Currently a single option: `messageReceived`. |
| options.pollTimes.mode | options | `everyX` | yes | Polling schedule mode: `everyHour`, `everyDay`, `everyWeek`, `everyMonth`, `everyX`, `custom` (cron). Controls when the trigger calls the Graph API to check for new messages. |
| options.pollTimes.value | number | — | per mode | Interval magnitude when mode is `everyX`. |
| options.pollTimes.unit | options | `minutes` | per mode | Interval unit when mode is `everyX`: `minutes` or `hours`. |
| options.pollTimes.cronExpression | string | — | per mode | Six-field cron expression when mode is `custom`. |
| options.folders | multi-select | `Inbox` | no | List of folder names or IDs to watch. Only messages appearing in the selected folders trigger. |
| options.simplify | boolean | `true` | no | Emit a simplified per-message object (headers, IDs) instead of the raw Graph message resource. |

## Runtime behavior

### External API (Microsoft Graph)

The trigger polls the Microsoft Graph API (`https://graph.microsoft.com/v1.0/`) to discover new messages:

- `GET /me/mailFolders/{folderId}/messages` — list messages, filtered by `receivedDateTime` ≥ last-poll timestamp
- Messages are ordered by `receivedDateTime` descending; pagination follows `@odata.nextLink`.

The trigger tracks the most recently seen `receivedDateTime` and `id` (or `internetMessageId`) across poll cycles to avoid re-emitting. On the first activation (or after a reset) only messages received within a configurable lookback window are emitted.

### Input

No incoming connections (trigger node).

### Output

One output item per newly detected message. Each item's `json` contains the Graph message resource object (fields including `id`, `subject`, `from`, `toRecipients`, `receivedDateTime`, `bodyPreview`, `webLink`). When `simplify` is enabled, the object is reduced to key identifiers and header fields.

### Errors

- Missing/invalid credentials, Graph API throttling, and resource errors are surfaced as node errors.
- With `continueOnFail` enabled (on the node itself — trigger nodes expose it on the node settings), the error is logged and the poll cycle continues without emitting an error item.
- If the trigger cannot authenticate or the credential lacks sufficient permissions, activation fails immediately.

### Expressions

Poll schedule and folder parameters accept `{{ }}` expression syntax.

## Acceptance tests

### Test: message received triggers one item per new message

**Given** the trigger has not polled before (fresh workflow).

**Parameters:**
```json
{
  "event": "messageReceived",
  "options": {
    "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" },
    "folders": ["Inbox"],
    "simplify": false
  }
}
```

**Expect** — when the Graph API returns one or more messages with `receivedDateTime` after the last-seen timestamp, one output item per message is emitted with `json` containing the Graph message resource (at minimum `id`, `subject`, `receivedDateTime`, `from`). No message is emitted twice across consecutive poll cycles.

### Test: manual execution with no messages yields empty output

**Given** the inbox has no messages newer than the trigger's last-seen timestamp.

**Parameters:**
```json
{
  "event": "messageReceived",
  "options": {
    "pollTimes": { "mode": "everyX", "value": 1, "unit": "hours" }
  }
}
```

**Expect** — no output items.

### Test: simplified output shape

**Given** one new message exists.

**Parameters:**
```json
{
  "event": "messageReceived",
  "options": {
    "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" },
    "simplify": true
  }
}
```

**Expect** — one output item whose `json` contains a simplified subset of fields (at minimum `id`, `subject`, `from`, `toRecipients`, `receivedDateTime`), not the full Graph message resource.

### Test: folder scoping

**Given** one new message exists in the "Inbox" but zero in "SentItems".

**Parameters:**
```json
{
  "event": "messageReceived",
  "options": {
    "folders": ["SentItems"],
    "pollTimes": { "mode": "everyX", "value": 5, "unit": "minutes" }
  }
}
```

**Expect** — no output items; the message in Inbox is ignored.

### Test: continueOnFail — credential error on activation

**Given** the credential is invalid.

**Expect** — activation fails with an error; the workflow does not enter the executing state.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Supported events | documented | Single event "Message Received" per the public n8n docs page. |
| Authentication options | documented | Three credential types: Outlook OAuth2, Microsoft OAuth2 (Graph), and Entra Service Principal (app-only). |
| Poll vs webhook model | inferred | n8n trigger nodes typically use polling; the public page lists no webhook subscription management (unlike Stripe/Slack triggers), consistent with a polling model. |
| Poll schedule parameters | inferred from convention | n8n polling triggers share a common `pollTimes` sub-parameter set (Every Hour / Day / Week / Month / X / Custom cron). The exact set for this node is inferred from the standard polling trigger pattern. |
| Graph endpoint for message listing | documented | `/me/mailFolders/{id}/messages` is the standard Graph API endpoint for reading mailbox messages. |
| Deduplication strategy | inferred | The trigger must track the high-water mark of `receivedDateTime` and/or message IDs across polls. The exact implementation (e.g. `internetMessageId` vs Graph `id`) is an implementation detail. |
| `simplify` parameter | inferred | Analogous to the Gmail Trigger's simplify mode; not explicitly documented for Outlook Trigger but is a common pattern for email triggers. |
| Folder filtering | inferred | The node must support optionally scoping to a subset of mailbox folders. The exact parameter name (`folders`) and representation (multi-select) are inferred. |
| Shared inbox and app-only mailbox targeting | documented | From the Microsoft credentials docs and the action node spec; app-only mode requires a Mailbox parameter. |

## OpenFlow mapping

- **Definition group:** `triggers` (Communication)
- **Executor file:** `src/lib/engine/executors/microsoft-outlook-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftOutlookOAuth2Api`, `microsoftOAuth2Api`, `microsoftEntraServicePrincipalApi`
