---
type: n8n-nodes-base.signl4Tool
displayName: SIGNL4 Tool
category: Communication
versions: [1]
priority: low
status: specced
---

# SIGNL4 Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.signl4.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/signl4.md | Public docs only |
| https://connect.signl4.com/webhook/docs/index.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.signl4Tool`
- **Aliases:** (none — the base node `n8n-nodes-base.signl4` has `usableAsTool: true`, so the tool variant is the same node surfaced by an AI Agent from the Tools panel)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `signl4Api` (Team Secret — the path component of the webhook URL)

## Parameters

The SIGNL4 Tool shares all parameters with the base SIGNL4 node, exposed identically. The only difference is availability context: the Tool variant is selectable from an AI Agent's Tools panel rather than placed directly on the canvas.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed: `alert` | `alert` | yes | — | Single resource |
| operation | `send` or `resolve` | `send` | yes | resource=alert | Send a new alert or resolve an existing one |
| message | string | — | yes (when operation=send) | operation=send | Human-readable alert message body |
| additionalFields.title | string | — | no | operation=send | Alert title or subject line |
| additionalFields.service | string | — | no | operation=send | Service/system category name assigned to the alert |
| additionalFields.alertingScenario | `single_ack` or `multi_ack` | `single_ack` | no | operation=send | Notification policy requiring one or multiple confirmations |
| additionalFields.externalId | string | — | no | operation=send | External system record ID for correlation with outbound webhook notifications |
| additionalFields.filtering | boolean | false | no | operation=send | Apply team-level keyword filtering to this event |
| additionalFields.locationFieldsUi | fixedCollection | — | no | operation=send | Latitude + longitude pair for map display in the mobile app |
| additionalFields.attachmentsUi | fixedCollection | — | no | operation=send | Binary property name for file attachments |
| externalId | string | — | yes (when operation=resolve) | operation=resolve | External ID of the alert to resolve |

All value parameters accept expression strings, including `$fromAI()` for AI-agent dynamic parameter population.

## Runtime behavior

### Input

Each input item is processed independently. The node reads configured parameter values and sends them as an HTTP POST to the SIGNL4 inbound webhook endpoint (`https://connect.signl4.com/webhook/{teamSecret}`).

For the **send** operation, the message body is a JSON object with a `message` field and optionally `title`. HTTP headers carry alert metadata: `X-S4-Service`, `X-S4-Location` (latitude,longitude string), `X-S4-ExternalID`, `X-S4-Filtering`, and `X-S4-AlertingScenario`. Binary attachments are sent as multipart form data.

For the **resolve** operation, the node sets `X-S4-Status: resolved` and requires an `X-S4-ExternalID` to identify which alert to close. The message body may still carry arbitrary JSON.

### Output

Outputs one item per input item. The output item contains the original input `json` merged with the SIGNL4 API response:

```json
{
  "json": {
    "eventId": "string"
  }
}
```

`eventId` is a UUID string returned by SIGNL4 for the received event. Binary data and other existing `json` keys are preserved.

### Errors

- HTTP 404: invalid team secret — throw with a message indicating invalid credentials.
- HTTP 400: empty or invalid request body — throw with a descriptive message.
- Any non-2xx status: throw including API error details.
- `continueOnFail`: failed items return as error items on output[0] with an `error` property.

### Expressions

Parameters `message`, `additionalFields.*`, and `externalId` accept expression strings. `$fromAI()` is supported for AI-agent parameter population.

## Acceptance tests

### Test: AI agent sends basic alert

**Given** input items:

```json
[{
  "json": {
    "message": "Server CPU over 90%"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "message": "={{ $json.message }}"
}
```

**Expect** output[0] to contain an `eventId` string and the original `message` preserved.

### Test: AI agent resolves alert by external ID

**Given** input items:

```json
[{
  "json": {
    "externalId": "INCIDENT-2024-001"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "resolve",
  "externalId": "={{ $json.externalId }}"
}
```

**Expect** HTTP request to include header `X-S4-Status: resolved` and `X-S4-ExternalID: INCIDENT-2024-001`. Output[0] contains an `eventId` string.

### Test: $fromAI() dynamic parameter population

**Given** a mock AI agent context that populates `message` and `additionalFields.service` via `$fromAI()`.

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "message": "={{ $fromAI('message', '') }}",
  "additionalFields": {
    "service": "={{ $fromAI('service', '') }}"
  }
}
```

**Expect** the executor resolves `$fromAI()` calls to values provided by the AI agent's tool-calling context. The HTTP request body contains the resolved message and the `X-S4-Service` header carries the resolved service name.

### Test: invalid credentials throws 404

**Given** input items with `message: "test"`, parameters operation=send, and an invalid credential.

**Expect** execution to throw a 404 error indicating an invalid team secret.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | Public corpus | `n8n-nodes-base.signl4Tool` — the base node has `usableAsTool: true`, making the Tool variant available in AI Agent Tools panel |
| Parameters and behavior | Public docs + corpus | Identical to base SIGNL4 node; no separate documentation page exists for the Tool variant |
| Credentials | Public docs | `signl4Api` — Team Secret |
| Output shape | Public SIGNL4 API docs | Returns `{ eventId: string }` on HTTP 201 |
| $fromAI() support | Inferred from Tool pattern | All Tool variants in n8n support `$fromAI()` for dynamic parameter population |
| Internal parameter nesting | Inferred | The corpus shows `additionalFields` as a collection, distinct from the older existing spec's `alertFields` nesting |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/signl4Tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
