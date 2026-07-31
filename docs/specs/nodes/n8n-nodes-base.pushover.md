---
type: n8n-nodes-base.pushover
displayName: Pushover
category: Communication
versions: [1]
priority: medium
status: specced
---

# Pushover

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushover.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pushover.md | Public docs only |
| https://pushover.net/api | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.pushover`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `pushoverApi`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `message` | yes | — | Single resource; fixed to `message` |
| operation | fixed | `push` | yes | — | Single operation; fixed to `push` |
| user | string | — | yes | — | Pushover user key or group key (USER_KEY); accepts expressions |
| message | string | — | yes | — | Push notification body text; max 1024 UTF-8 characters; accepts expressions |
| title | string | — | no | — | Message title; defaults to application name if omitted; max 250 characters |
| device | string | — | no | — | Comma-separated device names to target; sends to all devices if omitted |
| priority | number | 0 | no | — | Message priority: -2 (lowest, no notification), -1 (low, no sound/vibration), 0 (normal), 1 (high, bypasses quiet hours), 2 (emergency, repeats until acknowledged) |
| retry | number | — | no | `priority=2` | Emergency priority retry interval in seconds; minimum 30 |
| expire | number | — | no | `priority=2` | Emergency priority expiration in seconds; maximum 10800 (3 hours); retries capped at 50 |
| sound | string | — | no | — | Notification sound name; one of pushover/bike/bugle/cashregister/classical/cosmic/falling/gamelan/incoming/intermission/magic/mechanical/pianobar/siren/spacealarm/tugboat/alien/climb/persistent/echo/updown/vibrate/none; or custom sound name; blank = user default |
| timestamp | number | — | no | — | Unix timestamp to display instead of API receipt time |
| url | string | — | no | — | Supplementary URL displayed with the message; max 512 characters |
| url_title | string | — | no | — | Title for the supplementary URL; max 100 characters |
| html | boolean | false | no | — | Enable HTML formatting in the message body |
| ttl | number | — | no | — | Time to live in seconds; message auto-deleted after this duration; ignored for priority=2 |
| attachment | binary | — | no | — | Binary image attachment from input item binary data; max 5 MB |
| parentKey | string | — | no | (attachment is set) | Binary data key on the input item to use as attachment |

## Runtime behavior

### Input

Consumes one or more input items. Each item is processed independently. If `attachment` is enabled, the node reads binary data from the input item using `parentKey` (defaults to `data`).

### Output

For each input item, the node outputs the item enriched with:
- `json.request` — the unique request identifier returned by the Pushover API
- `json.status` — the API status code (1 for success)

On success, the input item's JSON is replaced with the response envelope. On failure (HTTP 4xx), the node throws an error with the API error message.

### Errors

- Invalid user key or API token returns HTTP 4xx with `status: 0` and an `errors` array
- Message over 1024 characters results in an API-level validation error
- Missing required parameters (`user`, `message`) produces a node-level validation error before the API call
- `priority=2` without `retry` and `expire` produces a node-level validation error
- `retry` < 30 or `expire` > 10800 produces a node-level validation error
- Attachment over 5 MB results in an API-level error
- `continueOnFail` causes errored items to be passed as `[{ json: { error: string } }]` on output

### Expressions

`user`, `message`, `title`, `device`, `url`, `url_title`, `sound`, `timestamp`, `ttl`, `retry`, `expire`, `parentKey` accept expression strings.

## Acceptance tests

### Test: basic push

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Hello from OpenFlow",
  "title": "Test Notification"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "request": "647d2300-702c-4b38-8b2f-d56326ae460b",
    "status": 1
  }
}]
```

### Test: emergency priority with retry/expire

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Server is down!",
  "priority": 2,
  "retry": 60,
  "expire": 3600
}
```

**Expect** output[0] to contain `json.status === 1` and a `json.request` string.

### Test: missing required params

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
}
```

**Expect** the node to throw a validation error: "Message is required".

### Test: emergency priority without retry

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Alert",
  "priority": 2
}
```

**Expect** the node to throw a validation error: "Retry and expire are required for emergency priority".

### Test: attachment from binary data

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "image": {
      "mimeType": "image/jpeg",
      "data": "base64-encoded-jpeg-data"
    }
  }
}]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Photo alert",
  "attachment": true,
  "parentKey": "image"
}
```

**Expect** output[0] to contain `json.status === 1`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | documented | Pushover API docs clearly define all parameters |
| Credential structure | documented | Pushover API key credential — single field (API Key) |
| Exact parameter ordering and UI grouping | inferred | The spec abstracts away UI organization; functional behavior is documented |
| `attachment` binary handling convention | inferred | Standard n8n binary data pattern; `parentKey` parameter name confirmed from descriptor metadata |
| Response shape | documented | Pushover API returns `{ status, request }` JSON |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/pushover.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only