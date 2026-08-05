---
type: n8n-nodes-base.clockifyTrigger
displayName: Clockify Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Clockify Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.clockifytrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clockify.md | Public docs only |
| https://docs.developer.clockify.me/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.clockifyTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `clockifyApi` (API key, required)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| workspaceId | options (dynamic) | — | yes | Loaded from the Clockify API. Determines which workspace to watch. |
| event | options (`timeEntry.started` \| `timeEntry.ended`) | — | yes | The type of time-entry event that triggers the workflow. |
| timezone | string | workflow timezone | no | Overrides the workflow-level timezone for computing the polling window. |

### Parameter details

- **workspaceId**: Populated dynamically by calling the Clockify `GET /v1/workspaces` endpoint (user's active workspaces). Accepts an expression.
- **event**: Determines which real-time event pattern the polling logic matches.
  - `timeEntry.started` — fires when a time entry's start time falls within the current polling window
  - `timeEntry.ended` — fires when a time entry's end time falls within the current polling window
- **triggerOn** (polling interval): Follows the standard n8n polling schedule configuration (cron or preset intervals such as Every Hour, Every Day, Every X Minutes). Not a named parameter — managed by the framework's polling infrastructure.

## Runtime behavior

### Trigger type
Polling trigger. On each polling cycle the node queries the Clockify API for time entries matching the configured event type within the current time window.

### Input
None — this is a trigger node. Execution begins on a polling schedule.

### Output
Emits one output item per time entry that matches the configured event type and falls within the current polling window. Each item contains the Clockify time-entry object as returned by the Clockify API:

```json
{
  "id": "66a987e29ae1f428e7ebe404",
  "description": "Morning standup",
  "workspaceId": "64a687e29ae1f428e7ebe303",
  "projectId": "proj_xyz789",
  "taskId": null,
  "userId": "5a0ab5acb07987125438b60f",
  "start": "2026-08-03T09:00:00Z",
  "end": null,
  "billable": false,
  "tagIds": [],
  "isLocked": false,
  "timeInterval": {
    "start": "2026-08-03T09:00:00Z",
    "end": null,
    "duration": null
  }
}
```

When no matching time entries are found in a polling cycle, no items are emitted (the workflow does not fire).

### Polling mechanics
1. On each poll, compute a time window ending at "now" and starting at "now minus the polling interval" (or the last successful poll timestamp).
2. Query the Clockify time entries API (`GET /v1/workspaces/{workspaceId}/user/{userId}/time-entries`) filtered by the computed window.
3. If `event = timeEntry.started`, match entries whose `start` falls inside the window.
4. If `event = timeEntry.ended`, match entries whose `end` falls inside the window (non-null only).
5. Emit one output item per matched entry.

The time window respects:
- The **workflow timezone** setting (default)
- An explicit **timezone** parameter override if provided

### Errors
- **Missing credentials:** Workflow fails to activate if no valid `clockifyApi` credential is configured.
- **API errors:** Clockify API errors (auth failure, network error, rate limit) are thrown as node errors. The node does not implement retry logic.
- **Empty results:** Normal behavior — no output items emitted, no error thrown.

### Expressions
All parameters accept n8n expressions (`{{ }}`).

### Constraints from Clockify
- API rate limit: 50 requests/second per addon per workspace.
- The workspace must exist and the API key must have access to it.
- The triggering user's time entries are determined by the API key owner (or the configured user).

## Acceptance tests

### Test: emits item when a time entry is started
**Given** a workflow with Clockify Trigger configured with `workspaceId: "ws_abc123"`, `event: "timeEntry.started"`, and a polling interval of 3 minutes

**When** a time entry with `start` within the last 3 minutes exists in Clockify

**Expect** output[0] contains one item with `json` containing at minimum the fields `id`, `workspaceId`, `userId`, `start`, `timeInterval`, matching the Clockify time-entry object shape

### Test: emits item when a time entry is ended
**Given** a workflow with Clockify Trigger configured with `workspaceId: "ws_abc123"`, `event: "timeEntry.ended"`, and a polling interval of 3 minutes

**When** a time entry with `end` within the last 3 minutes exists in Clockify

**Expect** output[0] contains one item with `json` containing a non-null `end` timestamp field

### Test: no emission when no matches
**Given** a workflow with Clockify Trigger configured with `workspaceId: "ws_abc123"`, `event: "timeEntry.started"`, polling interval of 1 minute

**When** no time entries were started in the last minute

**Expect** no output items emitted (workflow does not fire)

### Test: respects timezone override
**Given** a workflow with Clockify Trigger configured with `workspaceId: "ws_abc123"`, `event: "timeEntry.started"`, `timezone: "America/New_York"`

**When** a time entry is started at 14:00 UTC (10:00 AM ET)

**Expect** the polling window is computed in America/New_York timezone; the entry is correctly matched if its start time falls within the window in that timezone

### Test: lists workspaces dynamically
**Given** a workflow being edited with a Clockify Trigger node and valid `clockifyApi` credentials

**When** the user opens the workspaceId dropdown

**Expect** the dropdown is populated with workspace options loaded from `GET /v1/workspaces`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Trigger mechanism | Documented | Public n8n docs confirm this is a polling trigger referencing workflow timezone for time-entry queries |
| Exact event names | Inferred | `timeEntry.started` / `timeEntry.ended` are the natural event types for a time-tracking trigger; exact parameter names may differ |
| Polling mechanics | Inferred | Standard n8n polling pattern; exact API endpoint and filter logic deduced from Clockify API docs |
| Output shape | Inferred from Clockify API docs | The Clockify time-entry object shape is documented in the public Clockify API reference |
| Webhook alternative | Not documented | Clockify has its own webhook API, but the n8n node does not use it (no callback URL, no webhook registration); the "Trigger" suffix and timezone hint indicate polling |
| Timezone semantics | Documented | Explicitly mentioned in n8n public docs |
| Dynamic workspace loading | Inferred | Standard pattern; confirmed by Clockify API workspace endpoint |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.clockifyTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
