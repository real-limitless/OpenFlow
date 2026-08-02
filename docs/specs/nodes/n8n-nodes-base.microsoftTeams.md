---
type: n8n-nodes-base.microsoftTeams
displayName: Microsoft Teams
category: Communication
versions: [1, 2]
priority: medium
status: specced
---

# Microsoft Teams

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftteams.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentraserviceprincipal.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftteamstrigger.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview?view=graph-rest-1.0 | Public docs only (service API) |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftTeams`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials** (via an Authentication dropdown):
  - `microsoftTeamsOAuth2Api` — Teams-specific OAuth2 credential (default; wire name inferred from the credential file name confirmed in the corpus metadata)
  - `microsoftOAuth2Api` — generic Microsoft Graph OAuth2 credential, reusable across Microsoft nodes; must carry the scopes this node needs (`Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `Chat.ReadWrite`, `Tasks.ReadWrite`, etc.)
  - `microsoftEntraServicePrincipalApi` — app-only access through a Microsoft Entra app registration (no signed-in user); the credential is selected as "Service Principal (App-Only)" in the Authentication dropdown, available from node version 2 (wire name inferred from the public Entra credentials page)
- **Version policy:** v1 (legacy) and v2 (current; adds app-only Service Principal credential support). The public docs describe the app-only behavior and per-operation application permissions; v2 is the reference version for this spec.

> The Microsoft credentials (OAuth2 and Service Principal) expose a **Microsoft Graph API Base URL** selector (Global / US Government / US Government DOD / China) for sovereign cloud tenants. With the app-only credential there is no signed-in user: the **Team** picker lists the whole tenant, and Task operations replace the group/plan/bucket/member pickers with plain ID fields. Some operations only exist for a signed-in user and are hidden/blocked in app-only mode (see Runtime behavior).

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `channel` | yes | `channel` \| `channelMessage` \| `chatMessage` \| `task` |

### Operations per resource

| resource | operation values | purpose |
|----------|------------------|---------|
| channel | `create`, `delete`, `get`, `getAll`, `update` | Manage channels inside a team. |
| channelMessage | `create`, `getAll` | Post messages to a channel and list a channel's messages. |
| chatMessage | `create`, `get`, `getAll`, `sendAndWait` | Post/read direct (1:1 or group) chat messages; `sendAndWait` pauses the workflow for a human response. |
| task | `create`, `delete`, `get`, `getAll`, `update` | Manage Planner tasks attached to a team/group. |

### Shared parameter patterns (abstracted)

- **Team reference:** most channel/task operations take a **Team** selector (list from API or supply an ID) plus a **Channel** selector (list within the team or supply an ID).
- **Chat reference (chatMessage):** a chat ID referencing a 1:1 or group chat; message IDs are opaque strings from Graph API reads.
- **Message composition (channelMessage.create / chatMessage.create):** message content/body text; channel messages additionally target the selected channel within a team.
- **Task composition (task.create/update):** title, description/details, assignment (assignee, assignee mode), due date/time, start date, priority, and checklist metadata typical of Planner tasks; created tasks are owned by a group/plan within the team.
- **Send and Wait for Response (chatMessage.sendAndWait):** message content plus a **Response Type** of `approval` (approve/disapprove), `freeText`, or `customForm`, with wait customization — **Limit Wait Time** (interval or wall time), **Append n8n Attribution**, button labels (approval: one or both of approve/disapprove buttons), and form title/description/labels; custom forms are built from n8n Form trigger form elements.
- **Get Many / list operations:** support `returnAll` or a `limit`; list output is one item per returned resource.

## Runtime behavior

### External API (Microsoft Graph / Teams)

The node calls the Microsoft Graph API (`https://graph.microsoft.com/v1.0/`) with the authenticated user or app. Representative endpoint families (inferred from Microsoft Graph Teams public docs):

- `GET /teams` (or `/me/joinedTeams` for a signed-in user) — team list for the picker; `GET/POST/PATCH/DELETE /teams/{team-id}/channels` and `/teams/{team-id}/channels/{channel-id}` — channel CRUD
- `GET /teams/{team-id}/channels/{channel-id}/messages` and `POST /teams/{team-id}/channels/{channel-id}/messages` — channel message list/create
- `GET /chats/{chat-id}/messages`, `GET /chats/{chat-id}/messages/{message-id}`, `POST /chats/{chat-id}/messages` — chat message read/create
- Planner `tasks` endpoints (e.g. `GET/POST /planner/tasks`, `PATCH/DELETE /planner/tasks/{task-id}`, with group/plan scoping) — task CRUD; exact endpoints are inferred from the Graph Planner API

List responses carry a `value` array and use `@odata.nextLink` for pagination. Reading channel messages app-only uses a **metered** Teams API that can return HTTP 402 unless the tenant has billing/evaluation configured. Microsoft restricts change-detection polling to once per day (use change-notification subscriptions for higher frequency) — relevant for trigger-like polling, not for the action node's explicit GET calls.

### Input

Each input item is processed independently. Team/channel/chat/message IDs, message content, task fields, and option values may reference item data via `{{ }}` expressions.

### Output

- **Create / Update / Get:** the resulting Graph resource object (channel, chatMessage, or Planner task), with the fields Microsoft returns (e.g. `id`, `displayName`, `description`, `body`, `createdDateTime`).
- **Get Many:** one output item per resource, unwrapped from the API `value` array.
- **Send and Wait for Response (partial / out of scope):** the documented contract is a workflow pause after sending, resuming later with the collected response (approval verdict, free-text answer, or custom-form submission). Full wait-and-resume behavior is **out of scope** for the current executor: it does not block on an external webhook, so on completion it emits a placeholder outcome item (e.g. `{ approved, timeout }` flags) instead of a true collected response. Implementers must not emit a bare `{ success: true }` for this operation.
- **Delete:** the Graph API returns `204 No Content`; the input item is passed through unchanged.
- **Channel/Chat message create:** the created `chatMessage` object is returned; a message created in a channel/chat has `messageType: message` and a body content payload.

### Errors

- Missing/invalid credentials, resource-not-found (404), permissions failures (403), and other Graph API 4xx/5xx failures are surfaced as node errors with the API-provided message. With app-only access, a missing consented application permission produces an explanatory error ("The app registration is missing a consented application permission for this operation").
- With `continueOnFail` enabled, the node emits an error item (e.g. `{ json: { error: … } }`) instead of throwing, and processing continues.
- `sendAndWait` timeout behavior must honor **Limit Wait Time** in a full implementation; with the current placeholder, the operation returns the placeholder outcome immediately without hanging. No `_sendAndWait` marker field should leak into the emitted JSON.

### Expressions

All string and reference parameters accept `{{ }}` expression syntax (team/channel/chat/message IDs, message content, task fields, option values).

### AI tool / human-in-the-loop

The node can be surfaced as an AI agent tool (parameters settable via `$fromAI()`), and can act as a human review step where an agent pauses for approval through this service before an approved action proceeds. It appears under Communication and Human-in-the-Loop categories.

## Acceptance tests

### Test: create a channel message

**Given** input items:
```json
[{ "json": { "teamId": "team-123", "channelId": "channel-456", "body": "Hello from n8n" } }]
```

**Parameters:**
```json
{
  "resource": "channelMessage",
  "operation": "create",
  "teamId": "{{ $json.teamId }}",
  "channelId": "{{ $json.channelId }}",
  "messageType": "text",
  "messageText": "{{ $json.body }}"
}
```

**Expect** output[0] — the created Graph `chatMessage` object with a non-empty `id`, `messageType: "message"`, and a `body.content` equal to the posted text. The executor must not fabricate an `id` or return an acknowledgment-only payload for a message create (unlike send-only endpoints, the create response is the message resource).

### Test: get many channel messages (pagination)

**Given** input items:
```json
[{ "json": { "teamId": "team-123", "channelId": "channel-456" } }]
```

**Parameters:**
```json
{
  "resource": "channelMessage",
  "operation": "getAll",
  "teamId": "{{ $json.teamId }}",
  "channelId": "{{ $json.channelId }}",
  "returnAll": true
}
```

**Expect** output[0] — one output item per message, each with a `json` object containing at least `id` and `body`; the executor must follow `@odata.nextLink` when the API returns partial pages.

### Test: create a task

**Given** input items:
```json
[{ "json": { "teamId": "team-123", "title": "Ship release", "due": "2026-08-20" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "create",
  "teamId": "{{ $json.teamId }}",
  "taskTitle": "{{ $json.title }}",
  "dueDateTime": "{{ $json.due }}"
}
```

**Expect** output[0] — the created Planner task object with a non-empty `id` and the requested `title` (and due date if the Graph API reflects it).

### Test: send and wait for response (approval) — partial

**Given** input items:
```json
[{ "json": { "chatId": "chat-789", "approver": "manager@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "chatMessage",
  "operation": "sendAndWait",
  "chatId": "{{ $json.chatId }}",
  "messageText": "Approve the release?",
  "responseType": "approval"
}
```

**Expect** — full wait-and-resume is out of scope (see Gaps); the executor must not emit a bare `{ success: true }` or leak a `_sendAndWait` marker. For now the acceptable contract is a placeholder outcome item exposing response flags (e.g. `approved` / `timeout`), which acts as a soft-skip fixture rather than a full human-in-the-loop verification. A complete pause/webhook resume flow is deferred.

### Test: delete a channel with continueOnFail

**Given** input items:
```json
[{ "json": { "teamId": "team-123", "channelId": "NONEXISTENT" } }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "delete",
  "teamId": "{{ $json.teamId }}",
  "channelId": "{{ $json.channelId }}",
  "continueOnFail": true
}
```

**Expect** output[0] — `[{ "json": { "error": "…" } }]` emitted instead of a thrown error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | 4 resources, 19 operations per the public n8n docs page (Channel 5, Channel Message 2, Chat Message 4, Task 5). |
| Credential choices | documented | Teams OAuth2, generic Microsoft OAuth2 (Graph), and Entra Service Principal (app-only, v2). App-only requires per-operation tenant-wide application permissions (`Team.ReadBasic.All` plus operation-specific ones) and blocks Chat Message, Channel Message Create, and Task Get Many in Group Member mode. |
| Credential wire names | mixed | `microsoftTeamsOAuth2Api` confirmed from corpus metadata (file name); `microsoftOAuth2Api` known; `microsoftEntraServicePrincipalApi` inferred (public docs name it "Microsoft Entra Service Principal (App-Only)"). |
| Graph endpoint mapping | inferred | From Microsoft Graph Teams/Planner public docs; per-operation HTTP details not enumerated. |
| Pagination (`@odata.nextLink`) | documented | Microsoft Graph list contract. |
| Send and Wait response types | documented | Approval / Free Text / Custom Form; wait limits (interval or wall time), n8n attribution, and button/form customization documented. |
| Send and Wait resume payload | inferred (partial / out of scope) | Documented contract is a workflow pause followed by resumption with the collected verdict/answer/form submission, but the current executor returns a placeholder outcome (e.g. `{ approved, timeout }`) without a real pause/webhook. Full send-and-wait is **out of scope**; acceptance is a soft-skip fixture only. |
| Message create response | documented | Graph `POST .../messages` returns the created `chatMessage` resource (unlike `send`-style endpoints that return 202/no body). |
| Metered Teams API for app-only channel message reads | documented | HTTP 402 possible without billing/evaluation configuration (Entra Service Principal credentials page). |
| Exact parameter names and nested option collections | inferred | Abstracted to outcome-level names; original UI nesting/option enums deliberately not reconstructed. |
| Task (Planner) parameter surface | inferred | title/details/assignment/due etc. abstracted; exact Planner field names not verified. |

## OpenFlow mapping

- **Definition group:** `core` (Communication, Human-in-the-Loop)
- **Executor file:** `src/lib/engine/executors/microsoft-teams.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftTeamsOAuth2Api`, `microsoftOAuth2Api`, `microsoftEntraServicePrincipalApi`
