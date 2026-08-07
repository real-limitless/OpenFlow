---
type: n8n-nodes-base.theHiveProjectTrigger
displayName: TheHive Project Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# TheHive Project Trigger (v3/v4)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehivetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/thehive/ | Public docs only |
| https://docs.thehive-project.org/thehive/legacy/thehive3/api/ | Public docs only |
| https://docs.thehive-project.org/thehive/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.theHiveProjectTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no input `main`)
- **Outputs:** `main` × 1
- **Credentials:** `theHiveApi`

### Credential shape (`theHiveApi`)

| field | type | notes |
|-------|------|-------|
| url | string | TheHive server base URL |
| apiKey | string | API key generated from Organization > Create API Key |
| apiVersion | enum | `theHive3` (api v0) or `theHive4` (api v1) |
| ignoreSSLIssues | boolean | Skip SSL certificate validation when enabled |

## Parameters

The node is a webhook trigger with no configurable parameters in the n8n UI beyond credential selection. Filtering of which events fire the webhook is configured server-side in TheHive's `application.conf` and notification configuration.

### Webhook lifecycle

- On activation: n8n generates a **testing** and a **production** webhook URL. The user copies these URLs into TheHive's `application.conf` configuration file.
- The webhook URL is unique per workflow instance. n8n does not register/deregister webhooks via the TheHive API — the configuration is entirely manual on the TheHive side.
- On deactivation: the webhook endpoint simply stops listening. TheHive will receive HTTP errors if it continues to send events.

### TheHive-side configuration

The user must:
1. Add webhook endpoint entries to TheHive's `application.conf` with `version: 0`
2. Enable notifications via cURL:
   ```json
   {
     "value": [
       {
         "delegate": false,
         "trigger": { "name": "AnyEvent" },
         "notifier": { "name": "webhook", "endpoint": "WEBHOOK_NAME" }
       }
     ]
   }
   ```

## Runtime behavior

### Events (resource × operation combinations)

The trigger fires for the following resource-event pairs, configured server-side by TheHive:

| Resource | Events |
|----------|--------|
| Alert | Created, Deleted, Updated |
| Case | Created, Deleted, Updated |
| Log | Created, Deleted, Updated |
| Observable | Created, Deleted, Updated |
| Task | Created, Deleted, Updated |

The webhook fires for all event types matching the notification trigger (typically `AnyEvent`). The user controls which events fire by how they configure TheHive's notification rules.

### Output

Each incoming webhook payload is emitted as one output item. The output shape is the raw TheHive webhook event envelope, which typically contains:

- `body` — the JSON payload from TheHive, including the event type identifier and the full resource object (alert, case, log, observable, or task)
- `headers` — HTTP request headers from TheHive
- `query` — query parameters on the webhook URL (typically empty)
- `webhookId` — internal identifier for which webhook endpoint received the event

The exact shape of `body` follows the TheHive webhook notification contract for v3/v4. Fields include the resource's standard properties (e.g., `title`, `description`, `severity`, `tags`, `type`, `source`, `sourceRef`, `id`, `status`, etc. depending on resource type).

### Error handling

- No input processing is needed (trigger node with no upstream connection).
- If the webhook payload is unparseable (malformed JSON), the node logs a warning and discards the event.
- Network-level errors (socket hangup, TLS failure) prevent the webhook from being reachable and are surfaced as server errors at the HTTP layer.

### Expressions

No parameter expressions are applicable since the node has no user-facing configuration parameters.

## Acceptance tests

### Test: receive an alert-created event

**Given** the webhook receives a POST with body:

```json
{
  "body": {
    "eventType": "AlertCreated",
    "object": {
      "id": "~123456",
      "title": "Suspicious login detected",
      "description": "Multiple failed logins from IP 10.0.0.1",
      "severity": 3,
      "type": "internal",
      "source": "firewall",
      "sourceRef": "fw-2026-001",
      "tags": ["n8n", "suspicious"],
      "status": "New",
      "createdAt": 1720000000000
    }
  },
  "headers": {
    "content-type": "application/json",
    "host": "n8n-webhook-url.example.com"
  },
  "query": {},
  "webhookId": "testing"
}
```

**Expect** output[0] contains:
- `json.body.eventType` equal to `"AlertCreated"`
- `json.body.object.id` is a non-empty string
- `json.body.object.title` equal to `"Suspicious login detected"`
- `json.body.object.severity` is a number
- `json.headers.content-type` is `"application/json"`

### Test: receive a case-updated event

**Given** the webhook receives a POST with body:

```json
{
  "body": {
    "eventType": "CaseUpdated",
    "object": {
      "id": "~789012",
      "title": "Incident #42",
      "description": "Updated description",
      "severity": 2,
      "tags": ["incident"],
      "status": "InProgress",
      "owner": "analyst@example.com"
    }
  },
  "headers": {},
  "query": {},
  "webhookId": "production"
}
```

**Expect** output[0] contains:
- `json.body.eventType` equal to `"CaseUpdated"`
- `json.body.object.status` equal to `"InProgress"`

### Test: unparseable payload is discarded

**Given** the webhook receives a POST with unparseable body (e.g., `not json`).

**Expect** no output items are emitted and no exception is thrown (the event is silently discarded after logging).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact eventType string format | inferred | Public docs list events as "Created/Deleted/Updated" per resource but do not show the wire format. Pattern `{Resource}{Event}` (e.g. `AlertCreated`) is a reasonable inference from TheHive API conventions. |
| Exact payload shape | inferred | The output shape depends entirely on the TheHive webhook notification contract for v3/v4 and is not documented in n8n docs. |
| Credential reuse | documented | The trigger uses the same `theHiveApi` credential as the TheHive app node. |
| Webhook lifecycle (manual config) | documented | Public docs explicitly describe the manual application.conf + cURL notification configuration process. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/theHiveProjectTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
