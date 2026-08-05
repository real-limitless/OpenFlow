---
type: n8n-nodes-base.clickUpTrigger
displayName: ClickUp Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# ClickUp Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.clickuptrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clickup.md | Public docs only |
| https://developer.clickup.com/docs/webhooks | Public docs only |
| https://developer.clickup.com/docs/authentication | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.clickUpTrigger`
- **Aliases:** (none)
- **Inputs:** `main` x 0 (webhook trigger — no input items)
- **Outputs:** `main` x 1
- **Credentials:** `clickUpApi` (API access token) or `clickUpOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| teamId | resourceLocator | — | yes | — | ClickUp workspace (Team) to scope the webhook. The trigger loads available teams dynamically from the API. |
| events | multiSelect | — | yes | — | One or more event categories to subscribe to. Each selection corresponds to a group of ClickUp webhook events. Accepted groups: Task, List, Space, Folder, Goal, Key Result. |

The **events** parameter allows the user to subscribe to any combination of the following event groups:

- **Task** — taskCreated, taskUpdated, taskDeleted, taskPriorityUpdated, taskStatusUpdated, taskAssigneeUpdated, taskDueDateUpdated, taskTagUpdated, taskMoved, taskCommentPosted, taskCommentUpdated, taskTimeEstimateUpdated, taskTimeTrackedUpdated
- **List** — listCreated, listUpdated, listDeleted
- **Space** — spaceCreated, spaceUpdated, spaceDeleted
- **Folder** — folderCreated, folderUpdated, folderDeleted
- **Key Result** — keyResultCreated, keyResultUpdated, keyResultDeleted
- **Goal** — goalCreated, goalUpdated, goalDeleted

When the node activates, it registers a webhook at the ClickUp API scoped to the selected workspace, subscribing to all ClickUp event strings that correspond to the selected groups. On deactivation, the webhook is deregistered.

## Runtime behavior

### Startup (activation)

1. Validates the configured credential (API token or OAuth2).
2. Fetches the Team ID from the workspace resource locator.
3. Calls the ClickUp [Create Webhook](https://developer.clickup.com/reference/createwebhook) endpoint with:
   - The n8n instance's public-facing webhook URL
   - The expanded list of ClickUp event strings from the selected groups
   - Optional location filters if scoped to a specific space/folder/list/task (exposed in an additional options section)
4. Stores the returned webhook ID for cleanup on deactivation.

### Event delivery

When a subscribed event occurs, ClickUp sends a POST request with `Content-Type: application/json`. The node validates the request and emits one output item per received webhook payload. If multiple events arrive in a single POST (e.g., batched), the node emits one item per distinct event.

### Output shape

Each output item contains the raw ClickUp webhook payload as the JSON body, decorated with the following envelope fields:

```json
{
  "event": "taskUpdated",
  "history_items": [
    {
      "id": "8a2f82db-7718-4fdb-9493-4849e67f009d",
      "type": 6,
      "date": "1642740510345",
      "user": { "id": 183, "username": "John" },
      "before": null,
      "after": null
    }
  ],
  "list_id": "162641285",
  "task_id": "abc1234",
  "webhook_id": "7fa3ec74-69a8-4530-a251-8a13730bd204"
}
```

The exact fields vary by event type per the ClickUp webhook API contract. The node passes the payload through without transformation.

### Deactivation

Calls the ClickUp [Delete Webhook](https://developer.clickup.com/reference/deletewebhook) endpoint with the stored webhook ID to clean up the subscription.

### Error handling

- If the webhook registration endpoint returns a non-2xx response, activation fails and the node reports the error to the workflow engine.
- If incoming webhook request validation fails (e.g., missing or invalid header), the node responds with an appropriate HTTP error code and does not emit items.
- `continueOnFail` behavior follows the standard trigger pattern: unhandled exceptions during event processing are reported; no items are emitted for malformed payloads.

## Acceptance tests

### Test: basic task-created trigger

**Given** a workflow with a ClickUp Trigger configured for a valid team and the **Task** event group selected, and a public webhook URL reachable from ClickUp's servers.

**When** the workflow is activated and a new task is created in any list within the workspace.

**Expect** the node emits one output item whose `json.event` equals `"taskCreated"` and `json.task_id` is a non-empty string.

### Test: multiple event groups

**Given** the same setup with both **Task** and **List** event groups selected.

**When** a list is created and separately a task is created.

**Expect** two distinct items: one with `json.event === "listCreated"` and one with `json.event === "taskCreated"`.

### Test: deactivation cleanup

**Given** an active ClickUp Trigger node.

**When** the workflow is deactivated.

**Expect** the registered webhook is deleted via the ClickUp API, confirmed by the webhook no longer being returned by the Get Webhooks endpoint for that workspace.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook event groups vs individual events | Documented (n8n docs + ClickUp API docs) | n8n docs list events grouped by resource; ClickUp API defines per-event strings. Mapping is inferred from naming conventions. |
| Location filter options | Inferred | ClickUp API supports `space_id`, `folder_id`, `list_id`, `task_id` filters on webhooks. The node may expose these as optional parameters. |
| Webhook signature validation | Documented (ClickUp API docs) | ClickUp provides a shared secret per webhook for HMAC verification. Implementation detail — not exposed as a user-facing parameter. |
| Output payload shape | Documented (ClickUp API docs) | Pass-through of ClickUp webhook body. Exact fields vary by event. |
| Credential types | Documented (n8n credentials page) | Both API token and OAuth2 are supported. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/clickUpTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
