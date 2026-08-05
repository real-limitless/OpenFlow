---
type: n8n-nodes-base.figmaTrigger
displayName: Figma Trigger (Beta)
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# Figma Trigger (Beta)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.figmatrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/figma.md | Public docs only |
| https://www.figma.com/developers/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.figmaTrigger`
- **Aliases:** (none)
- **Inputs:** none (webhook trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `figmaApi` — supports Access Token (PAT) or OAuth2

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| credentialType | options: `accessToken`, `oAuth2` | `accessToken` | yes | - | Selects which Figma auth method to use |
| event | options (see below) | — | yes | - | The Figma event that fires the workflow |
| fileId | string | — | conditional | event ≠ `libraryPublish` | Figma file key (required for file-scoped events) |
| teamId | string | — | conditional | event = `libraryPublish` | Figma team ID (required for library publish) |

### Event options

- `fileComment` — Triggers when someone comments on a file
- `fileDeleted` — Triggers when someone deletes an individual file
- `fileUpdated` — Triggers when someone saves or deletes a file (a "save" occurs when the file is closed within 30 seconds of changes)
- `fileVersion` — Triggers when someone creates a named version in the version history
- `libraryPublish` — Triggers when someone publishes a library file

### Event → parameter dependency

| event | fileId | teamId |
|-------|--------|--------|
| `fileComment` | required | — |
| `fileDeleted` | required | — |
| `fileUpdated` | required | — |
| `fileVersion` | required | — |
| `libraryPublish` | — | required |

## Runtime behavior

### Webhook lifecycle

On activation, the node registers a webhook with the Figma API (POST /v2/webhooks). On deactivation, it deletes the webhook. On re-activation (e.g. workflow update), it first deletes any existing webhook with the same endpoint + event combination, then creates a fresh one.

### Output

Each time Figma fires the registered webhook, the node emits one output item. The item body contains the raw Figma webhook payload as described in the [Figma Webhook API docs](https://www.figma.com/developers/api#webhooks-v2). The payload shape varies by event type but always includes:

- `event_type` — the Figma webhook event type string
- `timestamp` — ISO 8601 timestamp of the event
- `file_key` — the file the event relates to (present for file-scoped events)
- `passcode` — a verification passcode, if the webhook was configured with one (not used by this trigger)
- Other event-specific fields (e.g. `comment_id` for fileComment, `version_id` for fileVersion)

### Errors

- If Figma webhook registration fails (network error, invalid credentials, unsupported plan), the node throws an error at activation time.
- If the webhook receives a payload that cannot be parsed, the node should throw an error (respecting `continueOnFail`).
- Figma does not support webhooks on the free "Starter" plan; the team must be on the "Professional" plan.

### Expressions

All parameters accept expressions.

## Acceptance tests

### Test: basic file comment trigger

**Given** a Figma credential with a valid access token.

**Parameters:**
```json
{
  "event": "fileComment",
  "fileId": "abc123"
}
```

**When** the workflow is activated, a webhook must be registered with Figma for `FILE_COMMENT` events on file `abc123`.

**When** a comment is posted on file `abc123`, **expect** output[0] to contain one item with the raw Figma webhook payload including `event_type: "FILE_COMMENT"` and `file_key: "abc123"`.

### Test: file updated trigger

**Parameters:**
```json
{
  "event": "fileUpdated",
  "fileId": "abc123"
}
```

**When** the workflow is activated, a webhook must be registered for `FILE_UPDATE` events.

**When** the file is saved and closed, **expect** output[0] to contain one item with `event_type: "FILE_UPDATE"`.

### Test: library publish trigger

**Parameters:**
```json
{
  "event": "libraryPublish",
  "teamId": "team456"
}
```

**When** activated, a webhook must be registered for `LIBRARY_PUBLISH` events on team `team456`. The `fileId` parameter must not be required.

**When** a library file is published, **expect** output[0] to contain one item with `event_type: "LIBRARY_PUBLISH"`.

### Test: webhook deregistration on deactivation

**When** the workflow is deactivated, the previously registered webhook must be deleted via the Figma API.

**Expect** that no further webhook deliveries are received by the node.

### Test: invalid credential or unsupported plan

**Given** an invalid or expired Figma access token.

**When** the workflow is activated, **expect** the node to throw an error indicating webhook registration failure.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event names and descriptions | Documented | Public docs list all 5 events with descriptions |
| Credential types (PAT + OAuth2) | Documented | Public credentials page covers both |
| Parameter schema (fileId, teamId) | Inferred from event semantics | Which params are required per event is a logical inference from the Figma Webhook API resource structure (file-scoped vs team-scoped) |
| Webhook lifecycle | Documented (standard n8n pattern) | Standard webhook register/deregister behavior across all trigger nodes |
| Raw output shape | Inferred | Public docs state the node emits webhook payloads but don't enumerate fields; actual structure follows Figma Webhook API v2 |
| "Beta" status | Documented | Marked as Beta in n8n docs |
| Plan restriction | Documented | Professional plan required; does not work on Starter |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.figmaTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
