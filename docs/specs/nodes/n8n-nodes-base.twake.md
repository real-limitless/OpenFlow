---
type: n8n-nodes-base.twake
displayName: Twake
category: Productivity
versions: [1]
priority: medium
spec: specced
executor: implemented
---

# Twake

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twake.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twake/ | Public docs only |
| https://doc.twake.app/developers-api/api-reference/message/post-request.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.twake`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twakeCloudApi` (Cloud API key — single Workspace Key) or `twakeServerApi` (self-hosted: Host URL + Public ID + Private API Key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | sendMessage | yes | — | Only operation: `sendMessage`. |
| channelId | string | — | yes | — | Target channel to send the message to. Accepts an expression. |
| content | string | — | yes | — | Message body text. Accepts an expression. |
| groupId | string | — | no | — | Optional workspace group ID for routing. Accepts an expression. |
| ephemeral | boolean | false | no | — | If true the message is visible only to the application (ephemeral). |

## Runtime behavior

### Input

Each input item is processed independently. The node iterates over every item in `input[0]` and produces one output item per successful send.

### Output

Each output item contains the API response under `json` — an object with the created message including `id`, `channel_id`, `content`, `sender`, `creation_date`, `modification_date`, `reactions`, and `application_id`.

### Errors

- Missing credentials or invalid authentication returns a 401 and the node throws.
- Invalid `channel_id` or insufficient permissions returns a 403/404 and the node throws.
- On `continueOnFail: true` the node returns the error item instead of halting.

### Expressions

All string parameters (`channelId`, `content`, `groupId`) accept expression strings for dynamic resolution from input data.

### API contract (external)

The node calls the Twake REST API:

- **Endpoint:** `POST https://api.twake.app/api/v1/messages/save` (cloud) or `POST {hostUrl}/api/v1/messages/save` (server)
- **Auth:** Basic authentication with `public_id:private_api_key` base64-encoded (cloud uses app-generated workspace key)
- **Body:** `{ "group_id": "<groupId>", "message": { "channel_id": "<channelId>", "content": "<content>", "_once_ephemeral_message": <ephemeral> } }`
- **Response:** JSON object with an `object` property containing the created message.

The node also supports dynamic channel loading: it fetches available channels via an API call (probably `GET /api/v1/channels`) to populate a dropdown for `channelId`.

## Acceptance tests

### Test: send a simple message

**Given** input items:

```json
[{ "json": { "channel": "ch_abc123", "text": "Hello from n8n" } }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "channelId": "={{ $json.channel }}",
  "content": "={{ $json.text }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "object": {
      "id": "<any-string>",
      "channel_id": "ch_abc123",
      "sender": null,
      "content": "Hello from n8n",
      "creation_date": "<any-number>",
      "modification_date": "<any-number>",
      "reactions": []
    }
  }
}]
```

### Test: send with group ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "channelId": "ch_def456",
  "content": "Scoped message",
  "groupId": "grp_789"
}
```

**Expect** the API request body to contain both `group_id: "grp_789"` and `message.channel_id: "ch_def456"`. The output item reflects the API response.

### Test: ephemeral message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "channelId": "ch_xyz",
  "content": "Only app sees this",
  "ephemeral": true
}
```

**Expect** the API request body to include `message._once_ephemeral_message: true`. The response object includes the created message.

### Test: continue on fail

**Given** input items:

```json
[
  { "json": { "channel": "valid_ch", "text": "ok" } },
  { "json": { "channel": "", "text": "bad" } }
]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "channelId": "={{ $json.channel }}",
  "content": "={{ $json.text }}",
  "continueOnFail": true
}
```

**Expect** output[0] to contain two items: the first with a successful message object under `json`, the second with an `error` property containing the error details.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Documented | Public n8n docs confirm only "Message → Send a message". |
| Credential shapes | Documented | Public n8n credential docs cover both Cloud and Server auth. |
| API endpoint & body | Documented | Twake public API reference documents `POST /api/v1/messages/save`. |
| Response shape | Documented | Twake API docs show the response object. |
| Channel loading endpoint | Inferred | The node.d.ts shows a `getChannels` loadOptions method; the exact API route is not documented in public sources scanned. |
| groupId purpose | Inferred | Present in the Twake API reference but optional. |
| Ephemeral flag | Documented | Twake API reference includes `_once_ephemeral_message` in the body example. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Twake.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
