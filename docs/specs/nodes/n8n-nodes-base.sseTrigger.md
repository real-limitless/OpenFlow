---
type: n8n-nodes-base.sseTrigger
displayName: SSE Trigger
category: trigger
versions: [1]
priority: high
status: specced
---

# SSE Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssetrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sseTrigger.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sseTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| url | string | `""` | yes | — | The URL to receive the SSE from. Placeholder: `http://example.com` |

## Runtime behavior

### Input

None. Trigger nodes have no inputs.

### Output

Emits one item per SSE event received on the configured URL. Each output item contains:

```json
{
  "json": { "data": "<event data>", "event": "<event type>" },
  "binary": {}
}
```

- `data`: The raw event data as a string (parsed from the SSE `data:` field).
- `event`: The event type name (parsed from the SSE `event:` field), or empty string if not set.

Multiple `data:` lines in a single SSE event are concatenated with newline separators.

### Trigger lifecycle

1. **Activation**: When the workflow is activated (or "Execute Workflow" is clicked in editor), the node opens a long-lived HTTP connection to the configured URL.
2. **Event handling**: Each incoming SSE event triggers a new workflow execution with the event data as the input item.
3. **Deactivation**: On workflow deactivation, the SSE connection is closed.
4. **Editor testing**: While the workflow is open in the editor and "Execute Workflow" is clicked, the trigger listens temporarily; events fire executions visible in the editor. After publishing, executions occur in the background and appear only in the Executions list.

### Errors

- Connection failures (network errors, non-2xx responses) cause the trigger to retry with exponential backoff.
- Invalid SSE formatting yields an empty `data` field and logs a warning; execution continues.
- Workflow execution errors follow standard `continueOnFail` behavior: on failure, the item routes to the error output if connected, otherwise the execution fails.

### Expressions

The `url` parameter supports expressions (`{{ … }}`).

## Acceptance tests

### Test: basic SSE event

**Given** a workflow with an SSE Trigger node configured with `url = "http://test.example.com/events"`

**And** an SSE event arrives:
```
event: message
data: {"hello": "world"}
```

**When** the trigger processes the event

**Expect** output[0] contains exactly one item:
```json
[{ "json": { "data": "{\"hello\": \"world\"}", "event": "message" }, "binary": {} }]
```

### Test: SSE event without event type

**Given** same node configuration

**And** an SSE event arrives with only data:
```
data: plain text event
```

**Expect** output[0]:
```json
[{ "json": { "data": "plain text event", "event": "" }, "binary": {} }]
```

### Test: multi-line data concatenation

**Given** same node configuration

**And** an SSE event with multiple data lines:
```
data: line 1
data: line 2
data: line 3
```

**Expect** output[0] data field contains `"line 1\nline 2\nline 3"`

### Test: activation message

**Given** a fresh SSE Trigger node added to a workflow

**Expect** the activation hint displays: "You can now make calls to your SSE URL to trigger executions."

### Test: editor execute step

**Given** workflow open in editor, SSE Trigger configured, "Execute Workflow" clicked

**When** an SSE event is sent to the URL

**Expect** an execution appears in the editor with the event data as input

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter list (url) | documented | From public docs + descriptor |
| Output item shape (data, event) | inferred | Based on SSE spec and n8n trigger conventions; not explicitly detailed in public docs |
| Multi-line data concatenation | inferred | Standard SSE behavior |
| Retry/backoff behavior | inferred | Standard n8n trigger retry pattern |
| Exact activation hint text | documented | From descriptor |
| Editor vs production execution behavior | documented | From descriptor triggerPanel |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/sseTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only