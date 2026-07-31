---
type: n8n-nodes-base.rocketchat
displayName: Rocket.Chat
category: Communication
versions: [1]
priority: medium
status: specced
---

# Rocket.Chat

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rocketchat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/rocketchat.md | Public docs only |
| https://developer.rocket.chat/reference/api/rest-api/endpoints/team-collaboration-endpoints/chat-endpoints/postmessage | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.rocketchat`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `rocketchatApi` (required)

### Credential shape

The `rocketchatApi` credential authenticates against the Rocket.Chat REST API using personal access tokens:

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | The user ID displayed when generating an access token |
| `authKey` | string (password) | The personal access token value |
| `domain` | string | The Rocket.Chat workspace URL (e.g. `https://n8n.rocket.chat`) |

Authentication is performed by sending `X-Auth-Token` (set to the auth key) and `X-User-Id` (set to the user ID) headers on every request.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `chat` | yes | — | Fixed to `chat`; single value |
| operation | options | `postMessage` | yes | resource = `chat` | Fixed to `postMessage`; single value |
| channel | string | `""` | yes | resource = `chat`, operation = `postMessage` | Channel name or user. Prefix with `#` for channels, `@` for usernames. Room IDs also accepted |
| text | string | `""` | no | resource = `chat`, operation = `postMessage` | Message body text. Optional because attachments can carry the content |
| jsonParameters | boolean | `false` | no | resource = `chat`, operation = `postMessage` | Toggle between structured attachment UI and raw JSON editor |
| options | collection | `{}` | no | resource = `chat`, operation = `postMessage` | See Options table below |
| attachments | fixedCollection | `[]` | no | resource = `chat`, operation = `postMessage`, jsonParameters = `false` | Structured attachment items (see Attachments table) |
| attachmentsJson | json | `""` | no | resource = `chat`, operation = `postMessage`, jsonParameters = `true` | Raw JSON array of attachment objects |

### Options (collection)

| name | type | default | notes |
|------|------|---------|-------|
| alias | string | `""` | Overrides the message sender name. Requires `message-impersonate` permission on the Rocket.Chat account |
| avatar | string | `""` | URL of an image to use as the sender avatar |
| emoji | string | `""` | Emoji string (e.g. `:smile:`) to use as the sender avatar |

### Attachments (fixedCollection — `attachments.attachmentsFields`)

Each attachment item supports the following fields:

| name | type | default | notes |
|------|------|---------|-------|
| color | color | `#ff0000` | The color stripe on the left side of the attachment |
| text | string | `""` | Text content of the attachment (distinct from the message's `text`) |
| ts | dateTime | `""` | Timestamp displayed next to the text |
| thumbUrl | string | `""` | Thumbnail image URL displayed to the left of the text |
| messageLink | string | `""` | Makes the timestamp clickable (only if `ts` is provided) |
| collapsed | boolean | `false` | Whether to collapse image/audio/video sections |
| authorName | string | `""` | Author name displayed above the attachment |
| authorLink | string | `""` | Makes the author name clickable |
| authorIcon | string | `""` | Small icon to the left of the author name |
| title | string | `""` | Title displayed under the author |
| titleLink | string | `""` | Makes the title clickable |
| titleLinkDownload | boolean | `false` | Shows a download icon for the title link |
| imageUrl | string | `""` | Large image displayed in the attachment |
| audioUrl | string | `""` | Audio file URL |
| videoUrl | string | `""` | Video file URL |
| fields | fixedCollection | `{}` | Key-value field rows (see Fields table) |

### Fields (nested fixedCollection — `fields.fieldsValues`)

| name | type | default | notes |
|------|------|---------|-------|
| short | boolean | `false` | Whether to display this field inline |
| title | string | `""` | Field label |
| value | string | `""` | Field value |

## Runtime behavior

### Input

The node accepts any input items. Each item is processed independently. The node does not modify input items; it creates a new output item per execution.

### Output

For each input item, the node produces one output item `{ json: { ... } }` containing the full Rocket.Chat API response from `POST /api/v1/chat.postMessage`:

- `success` (boolean) — whether the API call succeeded
- `ts` (integer) — timestamp of the response
- `channel` (string) — the channel the message was sent to
- `message` (object) — the created message object with fields: `_id`, `rid`, `msg`, `ts`, `u` (sender user object with `_id`, `username`), `alias`, `parseUrls`, `groupable`, `_updatedAt`, `urls`, `mentions`, `attachments`, `md`

### Errors

- If the credential is missing or invalid, the node throws an error.
- If the channel is invalid or the user lacks access, the Rocket.Chat API returns an error object (`{ success: false, error: "...", errorType: "..." }`). The node should surface this as a thrown error.
- If `continueOnFail` is enabled, the node outputs a single error item `{ json: { error: { message, ... } } }` on output index 0 instead of throwing.

### Expressions

The following parameters accept expression strings: `channel`, `text`, and all fields within `options`, `attachments`, and `attachmentsJson`.

## Acceptance tests

### Test: post message to a public channel

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "chat",
  "operation": "postMessage",
  "channel": "#general",
  "text": "Hello from OpenFlow"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "success": true,
    "channel": "general",
    "message": {
      "msg": "Hello from OpenFlow",
      "rid": "GENERAL"
    }
  }
}]
```

The exact shape of `message` depends on the Rocket.Chat API response. The spec cares that `success` is `true` and `channel` and `message.msg` match the input.

### Test: post message with an attachment

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "chat",
  "operation": "postMessage",
  "channel": "#general",
  "text": "Check this out",
  "attachments": {
    "attachmentsFields": [
      {
        "title": "Status Update",
        "text": "All systems operational",
        "color": "#00ff00",
        "fields": {
          "fieldsValues": [
            { "title": "Uptime", "value": "99.9%", "short": true },
            { "title": "Latency", "value": "12ms", "short": true }
          ]
        }
      }
    ]
  }
}
```

**Expect** output[0] contains `success: true` and the API response includes the attachment data.

### Test: post message with JSON parameters mode

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "chat",
  "operation": "postMessage",
  "channel": "#general",
  "text": "JSON mode message",
  "jsonParameters": true,
  "attachmentsJson": "[{\"title\":\"Alert\",\"text\":\"Something happened\"}]"
}
```

**Expect** output[0] contains `success: true`.

### Test: invalid channel returns error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "chat",
  "operation": "postMessage",
  "channel": "#nonexistent-channel-12345",
  "text": "This should fail"
}
```

**Expect** the node throws an error with an error message containing the API's error response.

### Test: continueOnFail with invalid channel

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "chat",
  "operation": "postMessage",
  "channel": "#nonexistent-channel-12345",
  "text": "This should fail gracefully",
  "continueOnFail": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "error": {
      "message": "Rocket.Chat API returned error: invalid-channel"
    }
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and structure | Documented | Confirmed via public descriptor metadata (v2.15.1) |
| Credential shape | Documented | Confirmed via public credential docs |
| Rocket.Chat postMessage API | Documented | Confirmed via Rocket.Chat developer docs |
| Single resource (chat) / single operation (postMessage) | Documented | Confirmed via public docs and descriptor |
| Attachments sub-fields | Documented | Confirmed via descriptor and Rocket.Chat API docs |
| Error response shapes | Inferred | Based on Rocket.Chat API error response schema |
| Thread/reply support (tmid) | Not exposed | The Rocket.Chat API supports `tmid` for threaded replies, but the n8n node does not expose it as a parameter |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/rocketchat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only