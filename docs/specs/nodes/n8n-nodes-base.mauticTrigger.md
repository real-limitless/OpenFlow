---
type: n8n-nodes-base.mauticTrigger
displayName: Mautic Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Mautic Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mautictrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mautic/ | Public docs only |
| https://developer.mautic.org/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mauticTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node, no main input)
- **Outputs:** `main` × 1
- **Credentials:** `mauticApi` (basic auth) or `mauticOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options: `credentials`, `oAuth2` | `credentials` | yes | | Which credential type to use |
| events | multiOptions (loaded from `/api/hooks/triggers` at runtime) | `[]` | yes | | One or more Mautic webhook trigger event IDs to subscribe to |
| eventsOrder | options: `ASC`, `DESC` | `ASC` | no | | Sort order for queued events when a webhook delivers multiple at once |

## Runtime behavior

### Input

No main input. The node is a pure trigger — it sits at the start of a workflow and fires when Mautic pushes a webhook payload.

### Output

On each POST from Mautic, the node emits one output item per firing. The output item's `json` property contains the entire Mautic webhook request body as-is. The payload shape depends on which event(s) triggered the webhook; typical Mautic webhook bodies contain:

```json
{
  "mautic.webhook.event_name": {
    "contact": { ... },
    "field": { ... }
  }
}
```

The exact fields inside each event payload are defined by Mautic's webhook system and vary per trigger type (contact created, form submitted, email opened, etc.).

### Errors

- If the Mautic API is unreachable or credentials are invalid during webhook registration (creation phase), the node activation fails with a `NodeApiError`.
- If the webhook already exists on the Mautic side (detected by `GET /api/hooks/{id}` during `checkExists`), the node reuses it instead of creating a duplicate.
- On webhook deletion failure (e.g. the remote webhook was already removed), the node silently returns `false` and continues.
- Runtime webhook execution errors: the node passes through whatever Mautic POSTs. Malformed or empty bodies produce items with whatever `req.body` contains (could be an empty object).

### Expressions

- `events` accepts expression strings (users can supply event IDs dynamically).

## Acceptance tests

### Test: activation creates webhook on Mautic

**Given** a valid Mautic credential and a reachable Mautic instance at the configured URL

**Parameters:**
```json
{
  "authentication": "credentials",
  "events": ["mautic.lead_post_save_update", "mautic.form_on_submit"],
  "eventsOrder": "ASC"
}
```

**Expect** on node activation:
1. The node calls `GET /api/hooks/triggers` to load available event options
2. The node calls `POST /api/hooks/new` with body containing `webhookUrl`, `triggers: ["mautic.lead_post_save_update", "mautic.form_on_submit"]`, `eventsOrderbyDir: "ASC"`, `isPublished: true`
3. The returned `hook.id` is persisted in workflow static data for later cleanup

### Test: received webhook produces output item

**Given** the workflow is active and Mautic sends a POST to the registered webhook URL

**Expect** output[0]:
```json
[{
  "json": {
    "mautic.lead_post_save_update": {
      "contact": {
        "id": 123,
        "email": "test@example.com",
        "firstname": "Test",
        "lastname": "User"
      }
    }
  }
}]
```

The node does not transform or inspect the body — it passes the raw request body through.

### Test: reactivation reuses existing webhook

**Given** the node has been previously activated (webhookId stored in static data)

**Expect** on re-activation:
1. The node calls `GET /api/hooks/{webhookId}` to check existence
2. It returns `true` without creating a new webhook

### Test: deactivation deletes webhook

**Given** an active webhook with stored `webhookId`

**Expect** on deactivation: `POST /api/hooks/{webhookId}/delete` is called and `webhookId` is removed from workflow static data

### Test: event options loaded dynamically

**Given** the credentials are configured

**Parameters:**
```json
{
  "authentication": "credentials"
}
```

**Expect** a call to `GET /api/hooks/triggers` returns a map of trigger IDs to `{label, description}` objects, and each key becomes a selectable option in the `events` multi-select parameter.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event trigger list | Inferred from corpus (confirmed by `GET /api/hooks/triggers` call) | The exact set of trigger IDs is Mautic-version-dependent and loaded at runtime; the spec cannot enumerate them statically |
| Webhook payload shape | Inferred from Mautic webhook API docs | The node passes through the body verbatim — exact fields depend on the Mautic instance and event type |
| Error handling on webhook receive | Inferred from implementation | The node does `return { workflowData: [this.helpers.returnJsonArray(req.body)] }` — any POST body becomes output |
| OAuth2 flow | Inferred from corpus | Uses standard OAuth2 with `includeCredentialsOnRefreshOnBody: true` |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mauticTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
