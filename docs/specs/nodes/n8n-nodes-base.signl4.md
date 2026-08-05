---
type: n8n-nodes-base.signl4
displayName: SIGNL4
category: Communication
versions: [1]
priority: low
status: specced
---

# SIGNL4

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.signl4.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/signl4.md | Public docs only |
| https://connect.signl4.com/webhook/docs/v1/swagger.json | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.signl4`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `signl4Api` (Team Secret — the path component of the webhook URL)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed: `alert` | `alert` | yes | — | Single resource |
| operation | fixed: `send` or `resolve` | `send` | yes | resource=alert | Send a new alert or resolve an existing one |
| alertFields.teamSecret | credentials (select) | — | yes | — | Picks which SIGNL4 credential (team secret) to use |
| alertFields.message | string | — | yes | operation=send | Human-readable alert message; becomes the body of the Signl |
| alertFields.alertFieldsAdditional.xS4Service | string | — | no | operation=send | Service/system category name assigned to the Signl (`X-S4-Service`) |
| alertFields.alertFieldsAdditional.xS4Location | string | — | no | operation=send | Comma-separated `"latitude,longitude"` for map display in the mobile app (`X-S4-Location`) |
| alertFields.alertFieldsAdditional.xS4AlertingScenario | string | `single_ack` | no | operation=send | Notification policy: `single_ack`, `multi_ack`, or `emergency` (`X-S4-AlertingScenario`) |
| alertFields.alertFieldsAdditional.xS4ExternalID | string | — | no | both | External system record ID for correlation with outbound webhooks (`X-S4-ExternalID`) |
| alertFields.alertFieldsAdditional.xS4Filtering | boolean | — | no | operation=send | Whether to apply team-level keyword filtering to this event (`X-S4-Filtering`) |
| resolveFields.xS4ExternalID | string | — | yes | operation=resolve | External ID of the Signl to resolve (`X-S4-ExternalID`) |
| options.extIdParam | string | — | no | — | Name of the incoming JSON field to use as the external ID for status correlation (query param `ExtIdParam`) |
| options.extStatusParam | string | — | no | — | Name of the incoming JSON field to use as the status value for correlation (query param `ExtStatusParam`) |
| options.newStatus | string | — | no | — | Value of the status field that indicates a new/triggering event (query param `NewStatus`) |
| options.resolvedStatus | string | — | no | — | Value of the status field that indicates a resolved event (query param `ResolvedStatus`) |
| options.ackStatus | string | — | no | — | Value of the status field that indicates an acknowledged event (query param `AckStatus`) |

All value parameters accept expression strings.

## Runtime behavior

### Input

Each input item is processed independently. The node reads the configured parameter values from the current item.

For the **send** operation, the node includes all user-supplied custom JSON body fields alongside the header parameters (`X-S4-Service`, `X-S4-Location`, `X-S4-AlertingScenario`, `X-S4-ExternalID`, `X-S4-Filtering`, `X-S4-Status`). The webhook endpoint accepts any JSON payload shape; no fixed schema is required by SIGNL4.

For the **resolve** operation, the node sets `X-S4-Status: resolved` and requires an external ID (`X-S4-ExternalID`) to identify which Signl to close. The remaining body may still carry arbitrary JSON.

### Output

Outputs one item per input item. The output item contains the original input `json` merged with the SIGNL4 API response:

```json
{
  "json": {
    "eventId": "string"
  }
}
```

- `eventId` — unique ID returned by SIGNL4 for the received event (UUID string).

The node enriches each input item; binary data and other existing `json` keys are preserved.

### Errors

- If the SIGNL4 webhook returns HTTP 404, the team secret is invalid; the node should throw with a message indicating invalid credentials.
- If the SIGNL4 webhook returns HTTP 400, the request body was empty or missing; the node should throw with a descriptive message.
- If the SIGNL4 webhook returns any non-2xx status, the node should throw including the API error details.
- `continueOnFail`: when enabled, failed items are returned as error items on output[0] with an `error` property instead of halting execution.

### Expressions

Parameters `alertFields.message`, all `alertFields.alertFieldsAdditional.*`, `resolveFields.xS4ExternalID`, and all `options.*` sub-fields accept expression strings.

## Acceptance tests

### Test: send basic alert

**Given** input items:

```json
[{
  "json": {
    "message": "Server CPU over 90%",
    "service": "Infrastructure"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "alertFields": {
    "message": "={{ $json.message }}",
    "alertFieldsAdditional": {
      "xS4Service": "={{ $json.service }}"
    }
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "message": "Server CPU over 90%",
    "service": "Infrastructure",
    "eventId": "2518975207516268778_100c76b7-5ed7-4c2a-843e-a38fc8727bd0"
  }
}]
```

### Test: send alert with all optional fields

**Given** input items:

```json
[{
  "json": {
    "message": "Security breach detected",
    "location": "40.7128,-74.0060",
    "externalId": "SEC-2024-001"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "alertFields": {
    "message": "={{ $json.message }}",
    "alertFieldsAdditional": {
      "xS4Location": "={{ $json.location }}",
      "xS4AlertingScenario": "emergency",
      "xS4ExternalID": "={{ $json.externalId }}",
      "xS4Filtering": false
    }
  }
}
```

**Expect** output[0] to contain an `eventId` string.

### Test: resolve alert by external ID

**Given** input items:

```json
[{
  "json": {
    "externalId": "SEC-2024-001"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "resolve",
  "resolveFields": {
    "xS4ExternalID": "={{ $json.externalId }}"
  }
}
```

**Expect** output[0] to contain an `eventId` string. The Signl with external ID `SEC-2024-001` is resolved in SIGNL4.

### Test: invalid team secret throws 404

**Given** input items:

```json
[{
  "json": {
    "message": "test"
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "alertFields": {
    "message": "={{ $json.message }}"
  }
}
```

**With** an invalid credential (wrong team secret), **Expect** execution to throw a 404 error.

### Test: continueOnFail

**Given** input items:

```json
[{
  "json": {
    "message": ""
  }
}]
```

**Parameters:**

```json
{
  "resource": "alert",
  "operation": "send",
  "alertFields": {
    "message": "={{ $json.message }}"
  }
}
```

**With** `continueOnFail: true` and invalid credentials, **Expect** output[0] to contain one item with an `error` property and the original `json` preserved.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | Public docs | Single `alert` resource with `send` and `resolve` operations |
| Send operation parameters | Public SIGNL4 API docs | message, X-S4-Service, X-S4-Location, X-S4-AlertingScenario, X-S4-ExternalID, X-S4-Filtering |
| Resolve operation | Public SIGNL4 API docs | Uses X-S4-Status=resolved + X-S4-ExternalID |
| Status correlation options | Public SIGNL4 API docs | ExtIdParam, ExtStatusParam, NewStatus, ResolvedStatus, AckStatus query parameters |
| Credential shape | Public n8n docs | Single team secret (webhook path component) |
| Output shape | Public SIGNL4 API docs | Returns `{ eventId: string }` on HTTP 201 |
| Internal parameter nesting | Inferred | alertFields vs resolveFields separation is a behavioral requirement, not a documented UI layout |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/signl4.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
