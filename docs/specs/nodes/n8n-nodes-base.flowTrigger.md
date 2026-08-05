---
type: n8n-nodes-base.flowTrigger
displayName: Flow Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Flow Trigger

Webhook trigger that listens for Flow (getflow.com) project and task events and starts a workflow when they occur.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.flowtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/flow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.flow.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.flowTrigger`
- **Aliases:** (none)
- **Inputs:** (none)
- **Outputs:** `main` × 1
- **Credentials:** `flowApi` (required — Organization ID + Access Token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `list` (Project), `task` (Task) | `""` | yes | — | Which resource type the webhook subscribes to |
| listIds | string | `""` | yes* | resource = `list` | Comma-separated project (list) IDs to watch |
| taskIds | string | `""` | yes* | resource = `task` | Comma-separated task IDs to watch |

\* Required when its matching resource is selected.

## Runtime behavior

### Input

This node is a webhook trigger. It has no data input — it receives HTTP POST requests from Flow's webhook system when events occur on the selected projects or tasks.

### Output

Emits one output item per received webhook payload. The output shape is the raw Flow webhook event body; the exact fields depend on the event and resource type. The workflow receives the event data on `$json`.

### Webhook lifecycle

- On activation, the node registers a webhook endpoint with the Flow API for the configured resource IDs.
- On deactivation, the webhook is unregistered.
- The webhook responds with HTTP 200 to acknowledge receipt.
- Response mode: `onReceived` — the workflow executes immediately when the webhook fires.

### Errors

- If credential validation fails at activation, the node throws and prevents workflow activation.
- If the webhook payload cannot be parsed, the item may be dropped or emit empty fields (depends on receiver handling).
- `continueOnFail` is not meaningful for trigger nodes.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: project resource selects list resource type

**Parameters:**

```json
{
  "resource": "list",
  "listIds": "12345,67890",
  "taskIds": ""
}
```

**Expect:** node registers a webhook for project IDs `12345` and `67890`. Output is the Flow project event body.

### Test: task resource selects task resource type

**Parameters:**

```json
{
  "resource": "task",
  "taskIds": "555"
}
```

**Expect:** node registers a webhook for task ID `555`. Output is the Flow task event body.

### Test: activation requires flowApi credential

**Parameters:**

```json
{
  "resource": "list",
  "listIds": "100"
}
```

**Expect:** node rejects activation or returns authentication error if `flowApi` credential is missing or has invalid Organization ID / Access Token.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource option values | documented | Public docs confirm "list" (Project) and "task" (Task) |
| Credential auth method | documented | API key: Organization ID + Access Token |
| Webhook response mode | inferred | Standard n8n trigger pattern; not explicitly documented |
| Exact output payload shape | inferred | Depends on Flow API event format; getflow.com domain is defunct |
| Webhook registration API | inferred | Standard n8n webhook trigger pattern |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/flowTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
