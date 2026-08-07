---
type: n8n-nodes-base.pushcut
displayName: Pushcut
category: Communication
versions: [1]
priority: medium
status: specced
---

# Pushcut

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushcut.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pushcut.md | Public docs only |
| https://www.pushcut.io/guides/homekit-api-schedule-cancel | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.pushcut`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `pushcutApi` (API key — Bearer token generated from the Pushcut iOS app Account > Integrations)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `notification` | yes | — | Only value: `notification` |
| operation | options | `send` | yes | resource=notification | Only value: `send` |
| notification | string | — | yes | resource=notification, operation=send | The name of the Pushcut notification configured in the Pushcut iOS app |
| additionalFields | collection | — | no | resource=notification, operation=send | Optional modifiers for the notification |
| additionalFields.identifier | string | — | no | resource=notification, operation=send | A custom identifier string used for deduplication or cancellation. Sending a new notification with the same identifier replaces any pending notification with that identifier. |
| additionalFields.sendAt | string | — | no | resource=notification, operation=send | ISO 8601 datetime string that schedules the notification for a specific future time rather than sending immediately |
| additionalFields.delay | string | — | no | resource=notification, operation=send | A human-readable duration string (e.g. `10m`, `1h`, `30s`) that delays the notification by the specified amount of time from the moment of the API call |

## Runtime behavior

### Input

Each input item is processed independently. A single HTTP POST request is made per input item to the Pushcut API.

### Output

The response object from the Pushcut API is returned per item. It contains the following top-level fields:

- `id` (string) — unique identifier for the scheduled notification
- `notificationId` (string) — the notification name used in the request
- `message` (string) — a human-readable status message (e.g. "Notification scheduled")

If no `additionalFields` are provided and no scheduling is requested, the Pushcut app delivers the notification immediately on the user's iOS device.

### Errors

- Non-2xx responses from the Pushcut API throw an error with the HTTP status code and response body.
- If `continueOnFail` is enabled, the failing item is returned with an `error` property and processing continues for subsequent items.

### Expressions

All string parameters (`notification`, `identifier`, `sendAt`, `delay`) accept expression strings.

### API mapping

- `POST https://api.pushcut.io/v1/notifications` with `Content-Type: application/json` and `API-Key: <apiKey>` header
- Body: `{ "notification": "<name>", "identifier?": "<id>", "sendAt?": "<ISO8601>", "delay?": "<duration>" }`

## Acceptance tests

### Test: send a notification with only the required field

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "notification",
  "operation": "send",
  "notification": "My Alert"
}
```

**Expect** output[0].json contains `id` (string), `notificationId` ("My Alert"), and `message` (string).

### Test: send a notification with an identifier

**Given** input items:

```json
[{ "json": { "alertName": "Server Down" } }]
```

**Parameters:**

```json
{
  "resource": "notification",
  "operation": "send",
  "notification": "={{ $json.alertName }}",
  "additionalFields": {
    "identifier": "server-down-alert"
  }
}
```

**Expect** output[0].json has `notificationId` matching the value of `alertName`, and the API response includes an `id` field.

### Test: send a delayed notification

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "notification",
  "operation": "send",
  "notification": "Reminder",
  "additionalFields": {
    "delay": "5m"
  }
}
```

**Expect** output[0].json contains a valid `id` string and `message` indicating the notification was scheduled.

### Test: multi-item send processes each item independently

**Given** input items:

```json
[
  { "json": { "name": "First Alert" } },
  { "json": { "name": "Second Alert" } }
]
```

**Parameters:**

```json
{
  "resource": "notification",
  "operation": "send",
  "notification": "={{ $json.name }}"
}
```

**Expect** output[0] is an array of 2 items, each with a unique `id` string and the corresponding `notificationId` matching the input name.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public n8n docs confirm single resource (Notification) with single operation (Send) |
| Parameters | documented | `notification` (required name), `sendAt`, `delay` confirmed from Pushcut API guides |
| API endpoint | inferred | Pushcut API guide shows `POST https://api.pushcut.io/v1/submittedNotifications`; exact endpoint for the node may differ but follows the same pattern |
| Response shape | inferred | JSON schema in the corpus descriptor shows `id`, `notificationId`, `message` as response fields |
| `identifier` field | inferred | From Pushcut API guide showing the identifier concept for deduplication/cancellation; appears as an optional field |
| Credential auth | documented | n8n creds page confirms API key, Pushcut guide shows `API-Key` header |
| Trigger node | documented | Separate `pushcutTrigger` node exists but is out of scope for this action-node spec |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/pushcut.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
