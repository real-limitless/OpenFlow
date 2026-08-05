---
type: n8n-nodes-base.trelloTrigger
displayName: Trello Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Trello Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.trellotrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/trello/ | Public docs only |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.trelloTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `trelloApi` (API Key + API Token)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| modelId | string | — | yes | ID of the Trello resource (board, list, card, etc.) to watch for changes. Obtainable by appending `.json` to a Trello card URL and reading the relevant ID field. |

No other parameters documented in public sources.

## Runtime behavior

### Trigger mechanism

Registers a Trello webhook via the Trello REST API (`POST /1/webhooks`) when the workflow is activated, targeting the resource identified by `modelId`. The callback URL is the n8n instance's webhook URL for this node.

When Trello fires the webhook on a matching change, the node produces one output item per webhook delivery.

### Output

Each output item contains the full webhook payload from Trello's API. The payload includes the action that triggered the webhook (type of change, member who made it, date, old/new data of the affected resource).

The exact shape of the output depends on the Trello webhook payload contract and varies by action type (card moved, list renamed, comment added, etc.).

### Activation / deactivation

- **On activate:** The node creates a webhook subscription on Trello for the given `modelId`.
- **On deactivate:** The node removes the webhook subscription from Trello.

### Errors

- If the credential is invalid or lacks permission to create webhooks on the specified model, the workflow fails to activate.
- If `modelId` does not correspond to an existing Trello resource, the webhook registration will fail.
- On webhook delivery errors or invalid payloads the node should respect `continueOnFail`.

### Expressions

The `modelId` parameter accepts expression strings.

## Acceptance tests

### Test: register webhook and receive change

**Given** valid trelloApi credentials and an existing Trello board.

**Parameters:**
```json
{
  "modelId": "{{ $json.boardId }}"
}
```

**Expect** that when the workflow is activated, a `POST /1/webhooks` call is made to the Trello API. When a change occurs on the board, the node outputs at least one item on `output[0]` containing the Trello webhook payload with a non-empty `action` field.

### Test: activation fails with bad model ID

**Given** a `modelId` that does not exist.

**Expect** the workflow activation to fail with an error indicating that the webhook could not be registered.

### Test: deactivation removes webhook

**Given** an active Trello Trigger node.

**Expect** that on workflow deactivation, the previously registered webhook is deleted from Trello (`DELETE /1/webhooks/{id}`).

### Test: manual execution returns last event

**Given** an already-configured node.

**When** executed manually (Test step), the node should return the most recent matching Trello event or produce an empty output if no prior events exist.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Model ID as sole parameter | Public docs only | The trigger page documents only a Model ID parameter. Additional optional filtering (e.g., specific action types) may exist in the implementation but is absent from public docs. |
| Webhook lifecycle | Inferred | Webhook register/unregister on activate/deactivate is standard n8n trigger behavior. Trello API webhook endpoints are well-documented externally. |
| Output shape | Inferred from Trello API contract | The public n8n docs do not specify the exact output shape; it mirrors the Trello webhook payload JSON. |
| Polling fallback | Unknown | Not documented. The node may only support webhooks. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/trelloTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
