---
type: n8n-nodes-base.netlifyTrigger
displayName: Netlify Trigger
category: triggers
versions: [1]
priority: medium
status: specced
---

# Netlify Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.netlifytrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/netlify.md | Public docs only |
| https://docs.netlify.com/api/get-started/ | Public docs only |
| https://docs.netlify.com/site-deploys/notifications/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.netlifyTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger nodes have no incoming connection)
- **Outputs:** `main` × 1
- **Credentials:** `netlifyApi` (API access token — OAuth2 personal access token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiSelect | (empty) | yes | — | One or more Netlify deploy events to listen for. Options: deployStarted, deploySucceeded, deployFailed, deployDeleted, deployLocked, deployUnlocked, deployRequestPending, deployRequestAccepted, deployRequestRejected, deployRestored, previouslySuccessfulDeployFailed, previouslyFailedDeploySucceeded |
| credentials | credentialSelector | — | yes | — | Selector for a `netlifyApi` credential |

## Runtime behavior

### Trigger mechanism

This node is an **outgoing-webhook trigger**. When the workflow is activated, it registers a public webhook URL with the configured Netlify site via the Netlify Hooks API (`POST /api/v1/hooks`). Subsequently, whenever a matching deploy event occurs on that site, Netlify sends an HTTP POST notification to the registered URL, which n8n receives and processes as a workflow invocation.

### Output

Each received webhook payload is emitted as one output item. The payload is the raw JSON body that Netlify POSTs for the given event type. The structure varies by event type but typically contains the deploy object (with fields such as `id`, `site_id`, `name`, `url`, `ssl_url`, `admin_url`, `deploy_url`, `created_at`, `updated_at`, `state`, `branch`, `commit_ref`, `commit_url`, `skipped`, `error_message`, `context`, `locked`, `published_at`) and a `site` object (with fields such as `id`, `name`, `url`, `ssl_url`, `admin_url`, `created_at`, `updated_at`, `user_id`).

The output object is the full JSON payload as received — the node does not reshape or filter fields.

### Errors

- If the webhook registration fails (e.g., invalid credentials, network error), the node activation should fail with a descriptive error.
- If a received payload is malformed or cannot be parsed, the item should still be emitted with the raw body available. The `continueOnFail` option is not applicable for trigger nodes.
- If the webhook URL becomes unreachable and Netlify reports delivery failures, the trigger node should log the failures but continue running.

### Expressions

The `events` parameter accepts a multi-select of event type strings.

## Acceptance tests

### Test: registers webhook on activation

**Given** a valid `netlifyApi` credential and `events` = `["deploySucceeded", "deployFailed"]`

**When** the workflow is activated

**Then** the node calls `POST /api/v1/hooks` to register an outgoing webhook with the configured Netlify site, listing both selected events

**Expect** the activation succeeds and the hook ID is stored for cleanup on deactivation

### Test: emits item per received deploy event

**Given** a running workflow

**When** a deploy_succeeded webhook payload is received:

```json
{
  "id": "deploy-abc-123",
  "site_id": "site-xyz-789",
  "name": "my-site",
  "url": "https://my-site.netlify.app",
  "ssl_url": "https://my-site.netlify.app",
  "admin_url": "https://app.netlify.com/sites/my-site",
  "deploy_url": "http://deploy-abc-123--my-site.netlify.app",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "state": "ready",
  "branch": "main",
  "commit_ref": "a1b2c3d4",
  "commit_url": "https://github.com/owner/repo/commit/a1b2c3d4",
  "context": "production",
  "locked": false,
  "published_at": "2024-01-15T10:30:05Z",
  "site": {
    "id": "site-xyz-789",
    "name": "my-site",
    "url": "https://my-site.netlify.app",
    "ssl_url": "https://my-site.netlify.app",
    "admin_url": "https://app.netlify.com/sites/my-site",
    "created_at": "2023-06-01T00:00:00Z",
    "updated_at": "2024-01-15T10:30:05Z",
    "user_id": "user-456"
  }
}
```

**Then** one output item is produced on `main[0]`

**Expect** the JSON payload matches the received body exactly — no fields are stripped or added

### Test: deletes webhook on deactivation

**Given** an activated workflow

**When** the workflow is deactivated

**Then** the node calls `DELETE /api/v1/hooks/{hook_id}` using the hook ID stored during activation

**Expect** the deactivation succeeds and no further events are received

### Test: single event registration

**Given** a valid `netlifyApi` credential and `events` = `["deployFailed"]`

**When** the workflow is activated

**Then** the node registers a webhook for only the `deploy_failed` event

**Expect** only deploy-failed notifications trigger the workflow; other events (e.g., deploy_succeeded) are ignored

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook lifecycle | Inferred | Netlify's outgoing webhook API uses `POST /api/v1/hooks` to create and `DELETE /api/v1/hooks/{id}` to remove hooks. The trigger node must manage this lifecycle on activate/deactivate. Confirmed by combining n8n trigger pattern docs with Netlify Hooks API docs. |
| Available event types | Inferred from Netlify docs | Netlify docs list 12 deploy events. The exact option labels used in n8n's UI may differ (camelCase vs snake_case). Mapped to camelCase identifiers. |
| Payload shape | Inferred from Netlify API docs | The deploy and site object shapes are documented in Netlify's REST API reference. The event notification payload is documented to contain the object relevant to the event. |
| Per-site scoping | Inferred | The trigger likely requires a site ID or uses the credential to scope the webhook to a specific Netlify site. The public n8n docs do not detail this parameter. |
| Webhook secret / signature | Documented (Netlify) | Netlify supports optional JWS signing of webhook payloads via `X-Webhook-Signature`. The node may or may not expose this as a configuration option. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.netlifyTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
