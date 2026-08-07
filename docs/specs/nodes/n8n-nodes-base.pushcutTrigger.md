---
type: n8n-nodes-base.pushcutTrigger
displayName: Pushcut Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Pushcut Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.pushcuttrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pushcut/ | Public docs only |
| https://www.pushcut.io/guides | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.pushcutTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no `main` input)
- **Outputs:** `main` × 1
- **Credentials:** `pushcutApi` (API key — Bearer token generated from the Pushcut iOS app Account > Integrations)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| actionName | string | — | yes | — | A user-defined label for the integration trigger action. This name must match the action label configured in the Pushcut iOS app under Notifications > Add Action > Server > Integration > Integration Trigger. The n8n webhook URL is generated based on this name in combination with the API key. |

## Runtime behavior

### Input

This is a trigger node. It has no `main` input. The node is activated when the workflow is set to active and receives incoming HTTP requests from the Pushcut iOS app.

### Activation / deactivation

When the workflow is activated, the node registers a webhook endpoint. When the workflow is deactivated, the endpoint is unregistered. The exact URL is derived from the n8n instance webhook base URL, the credential fingerprint (API key), and the configured `actionName`.

### Output

Each incoming HTTP request from Pushcut produces one output item on `main`. The output shape is the full HTTP request body and metadata as sent by Pushcut. Typical fields include:

- `body` (object) — the JSON payload delivered by the Pushcut integration. The exact shape is defined by Pushcut and may include fields such as the notification name, device context, or custom data.
- `headers` (object) — HTTP headers from the incoming request
- `query` (object) — query string parameters, if any
- `params` (object) — if using URL-path parameters

Because Pushcut's Integration Trigger feature sends user-configurable payloads, the exact body shape cannot be fully predicted by the node. The output should expose the raw request body alongside metadata.

### Errors

- If the API key is missing or invalid, the webhook may reject the request with HTTP 401.
- If the `actionName` does not match the action configured in the Pushcut app, no request will reach the workflow.
- Network infrastructure errors (SSL, DNS) propagate through the webhook layer.

### Expressions

`actionName` accepts expression strings.

### API mapping

- The node operates as a webhook receiver. Pushcut sends HTTP POST requests to the n8n webhook URL.
- Authentication is via the `API-Key` header matching the `pushcutApi` credential.
- Pushcut's Integration Trigger documentation describes the setup: select Server tab, Integration tab, Integration Trigger type, then enter the webhook URL provided by n8n.

## Acceptance tests

### Test: basic trigger with an action name

**Given** the workflow is active.

**Parameters:**

```json
{
  "actionName": "MyIntegrationAction"
}
```

**When** Pushcut sends an HTTP POST to the registered webhook URL with body:

```json
{ "notification": "My Alert", "triggeredAt": "2026-08-06T12:00:00Z" }
```

**Expect** output[0] contains the request body, headers, and query fields.

### Test: trigger with expression-based action name

**Given** the workflow is active.

**Parameters:**

```json
{
  "actionName": "={{ $parameter.someValue }}"
}
```

**Expect** the webhook URL resolves using the evaluated action name.

### Test: empty body request

**Given** the workflow is active.

**Parameters:**

```json
{
  "actionName": "EmptyBodyTest"
}
```

**When** Pushcut sends an HTTP POST with an empty body.

**Expect** output[0] contains headers and query metadata; `body` may be an empty object or null.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook trigger behavior | documented | Public docs confirm Pushcut Trigger uses the Integration Trigger feature of the Pushcut app |
| Parameters | documented | Public n8n docs show the `actionName` parameter and setup steps |
| Credential auth | documented | n8n creds page confirms API-key based auth, same as the Pushcut action node |
| Activation/deactivation lifecycle | inferred | Standard webhook trigger pattern used by all n8n trigger nodes; not explicitly documented for this node |
| Output shape | inferred | The Pushcut Integration Trigger sends user-defined payloads; the node outputs the raw request body/metadata. Exact shape depends on the Pushcut app configuration. |
| Pushcut server-side API | inferred | The Pushcut API guide at https://www.pushcut.io/guides references the integration trigger setup but does not document the HTTP request format sent to webhooks |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/pushcutTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
