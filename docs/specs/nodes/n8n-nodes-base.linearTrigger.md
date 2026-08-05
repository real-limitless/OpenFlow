---
type: n8n-nodes-base.linearTrigger
displayName: Linear Trigger
category: Triggers
versions: [1]
priority: high
status: specced
---

# Linear Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.lineartrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/linear.md | Public docs only |
| https://developers.linear.app/docs/graphql/working-with-the-graphql-api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.linearTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no input connection)
- **Outputs:** `main` × 1
- **Credentials:** `linearApi` (API key) or `linearOAuth2Api` (OAuth2)

The Linear Trigger is a webhook-based trigger node. It starts a workflow whenever a matching event occurs in the connected Linear workspace. The node registers a webhook with Linear's API on workflow activation and unregisters it on deactivation.

For OAuth2 credentials, the **Include Admin Scope** toggle must be enabled in the credential configuration for use with the trigger node.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | string | `issue` | yes | — | One of the event kinds to subscribe to |
| additionalFields | object | `{}` | no | — | Optional modifiers for the webhook registration |

### Event

The trigger subscribes to one of the following high-level event categories in Linear:

- **Comment Reaction** — fired when a comment reaction is created or deleted
- **Cycle** — fired when a cycle is created, updated, or deleted
- **Issue** — fired when an issue is created, updated, deleted, or its state changes
- **Issue Comment** — fired when an issue comment is created, updated, or deleted
- **Issue Label** — fired when an issue label is created, updated, or deleted
- **Project** — fired when a project is created, updated, or deleted

### Additional Fields

Optional refinements that can be attached to the webhook registration:

- **Project ID** — If set, filters events to only those occurring within a specific project. The webhook will only fire for objects that belong to this project.
- **Filter** — Allows definition of one or more field-based conditions that incoming events must match. Each condition specifies a field path (dot-notation on the Linear resource), an operator (`equals`, `notEqual`, `contains`, `notContains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`), and a value. All conditions must be satisfied for the trigger to fire.

## Runtime behavior

### Activation

On workflow activation, the node sends a POST request to the Linear GraphQL API (`https://api.linear.app/graphql`) to create a webhook subscription. The request is authenticated using the configured credential. The webhook is bound to the selected event kind and any additional filter parameters.

On deactivation, the node sends a mutation to delete the previously created webhook subscription by its ID.

### Output

Each firing produces a single output item. The item contains the full payload delivered by Linear's webhook system. At minimum the output includes:

- A `body` object containing the event's resource data (shape depends on the event kind — for example an Issue event includes fields like `id`, `title`, `description`, `state`, `assignee`, `priority`, `team`, `createdAt`, `updatedAt`, etc.)
- Metadata about the webhook delivery such as the event type, timestamp, and webhook ID

The exact shape mirrors the Linear webhook payload contract for the chosen event type, as specified by the [Linear API documentation](https://developers.linear.app/docs/graphql/webhooks).

### Errors

- If webhook registration fails (e.g., invalid credentials, network error, insufficient permissions), the node throws and the workflow is not activated.
- If a webhook delivery fails (e.g., malformed payload), the node logs the error and does not emit output for that delivery.
- The node respects `continueOnFail` — when enabled, errors during event processing produce an error item on the output instead of halting execution.

### Expressions

- All parameter values accept expression strings for dynamic configuration (e.g., selecting an event based on workflow-level data).

## Acceptance tests

### Test: issue created event fires once

**Given** the workflow is activated with the `Issue` event and default additional fields.

**When** a new issue is created in the connected Linear workspace.

**Expect** output[0] to contain one item with:
- A `body` property that includes an `id` (string) and `title` (string) matching the created issue
- An event type indicator set to `Issue`

### Test: cycle updated event with project filter

**Given** the workflow is activated with the `Cycle` event and `additionalFields.projectId` set to a known project ID.

**When** a cycle belonging to that project is updated.

**Expect** output[0] to contain one item with the cycle's updated data including `id` and `name`.

**When** a cycle belonging to a different project is updated.

**Expect** no output items are produced.

### Test: invalid credentials throw on activation

**Given** the credential is invalid (e.g., revoked API key).

**When** the workflow is activated.

**Expect** an error to be thrown and the workflow remains inactive.

### Test: continueOnFail swallows delivery error

**Given** the node has `continueOnFail: true`.

**When** a malformed webhook payload is received.

**Expect** an error item (with `error: true`) to appear on output[0] instead of throwing.

### Test: comment reaction event shape

**Given** the workflow is activated with the `Comment Reaction` event.

**When** a user adds a reaction to an issue comment.

**Expect** output[0] to contain one item with a `body` that includes both comment identifiers and reaction emoji data.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event list | Public docs | Six event categories confirmed from docs.n8n.io |
| Credential requirements | Public docs | API key + OAuth2 methods, Include Admin Scope for trigger |
| Webhook lifecycle | Inferred | Standard trigger pattern: create on activate, delete on deactivate |
| Additional fields (projectId, filter) | Inferred from common trigger patterns | Exact parameter names and filter operators may differ — the spec uses abstraction |
| Output payload shape | Inferred | Mirrors Linear webhook contract; exact fields per event type are not enumerated here |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/linearTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
