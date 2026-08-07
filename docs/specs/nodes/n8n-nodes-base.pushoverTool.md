---
type: n8n-nodes-base.pushoverTool
displayName: Pushover Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Pushover (AI Tool)

An AI agent tool variant of the Pushover node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Pushes push notifications to mobile devices via the Pushover service.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushover.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pushover.md | Public docs only |
| https://pushover.net/api | External API reference |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.pushoverTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `pushoverApi` (required) — API key registered via Pushover application registration

## Parameters

The node exposes a single operation (Message → Push). All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Operation (fixed — single operation, no selector needed)

The tool only performs one action: push a notification message.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `user` | string | yes | — | Pushover user key, group key, or comma-separated list of user keys (max 50); accepts expressions and `$fromAI()` |
| `message` | string | yes | — | Push notification body text; max 1024 UTF-8 characters; accepts expressions and `$fromAI()` |
| `title` | string | no | — | Message title; defaults to application name if omitted; max 250 characters |
| `device` | string | no | — | Comma-separated device names to target; sends to all devices if omitted; ignored when sending to groups or multiple users |
| `priority` | number | no | 0 | Message priority: -2 (lowest, no notification), -1 (low, no sound), 0 (normal), 1 (high, bypasses quiet hours), 2 (emergency, repeats until acknowledged) |
| `retry` | number | no | — | Required when `priority=2`; retry interval in seconds (minimum 30) |
| `expire` | number | no | — | Required when `priority=2`; expiration in seconds (max 10800, 3 hours); retries capped at 50 |
| `sound` | string | no | — | Notification sound name; blank uses user default; one of: pushover, bike, bugle, cashregister, classical, cosmic, falling, gamelan, incoming, intermission, magic, mechanical, pianobar, siren, spacealarm, tugboat, alien, climb, persistent, echo, updown, vibrate, none; or custom sound name |
| `timestamp` | number | no | — | Unix timestamp to display instead of API receipt time |
| `url` | string | no | — | Supplementary URL displayed with the message; max 512 characters |
| `url_title` | string | no | — | Title for the supplementary URL; max 100 characters |
| `html` | boolean | no | false | Enable HTML formatting in the message body |
| `ttl` | number | no | — | Time to live in seconds; message auto-deleted after this duration; ignored for priority=2 |
| `attachment` | boolean | no | false | If true, sends a binary image attachment from input item binary data; max 5 MB |
| `parentKey` | string | no | `data` | Binary data key on the input item to use as attachment (shown when `attachment` is true) |

## Runtime behavior

### Input

Each input item is processed independently. If `attachment` is true, the node reads binary data from the input item using `parentKey`.

### Output

For each input item, the node outputs the item enriched with the Pushover API response:

```json
{
  "request": "647d2300-702c-4b38-8b2f-d56326ae460b",
  "status": 1
}
```

On success (`status: 1`), the input item's JSON is replaced with the response envelope. On emergency priority messages, a `receipt` field is also returned for receipt tracking.

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:

- Populating `user`, `message`, `title`, `device`, `priority`, `sound`, `url`, `url_title`, and `html` from model-generated values
- Dynamically showing `retry` and `expire` fields when the model selects `priority=2`
- Providing clear descriptions for each parameter to guide model selection

### Errors

- Invalid user key or API token returns HTTP 4xx with `status: 0` and an `errors` array
- Message over 1024 characters results in an API-level validation error
- Missing required parameters (`user`, `message`) produces a node-level validation error before the API call
- `priority=2` without `retry` and `expire` produces a node-level validation error
- `retry` < 30 or `expire` > 10800 produces a node-level validation error
- Attachment over 5 MB results in an API-level error
- `continueOnFail` causes errored items to be passed as `[{ json: { error: string } }]` on output

## Acceptance tests

### Test: basic push via AI agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Alert from AI agent",
  "title": "AI Notification"
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
  "message": "Critical alert!",
  "priority": 2,
  "retry": 60,
  "expire": 3600
}
```

**Expect** output[0] to contain `json.status === 1`, a `json.request` string, and a `json.receipt` string.

### Test: $fromAI() dynamic parameters

**Given** input items with AI agent context:

```json
[{ "json": {} }]
```

**Parameters** populated at inference time by the model:

```json
{
  "user": "$fromAI()",
  "message": "$fromAI()",
  "priority": "$fromAI()"
}
```

**Expect** the node to accept whatever values the model provides, respecting field type constraints. If the model supplies valid values, the API call proceeds normally.

### Test: missing required message

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

### Test: attachment from binary data

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "screenshot": {
      "mimeType": "image/png",
      "data": "base64-encoded-png-data"
    }
  }
}]
```

**Parameters:**

```json
{
  "user": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "message": "Screenshot attached",
  "attachment": true,
  "parentKey": "screenshot"
}
```

**Expect** output[0] to contain `json.status === 1`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | documented | Pushover API docs + n8n public docs clearly define all parameters |
| Credential structure | documented | Pushover API key credential — single API Key field |
| AI tool pattern (`$fromAI()`) | documented | Standard n8n tool node convention; confirmed from public how-tools-work docs |
| Parameter grouping and dynamic visibility | inferred from base Pushover node | `retry`/`expire` shown only when `priority=2`; `parentKey` shown when `attachment` is true |
| Response shape | documented | Pushover API returns `{ status, request }` JSON |
| `alias` behavior | inferred | No separate Tool type string exists in public n8n docs; the pushoverTool type is a standalone AI Tool variant |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/pushoverTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
