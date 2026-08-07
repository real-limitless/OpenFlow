---
type: n8n-nodes-base.matrixTool
displayName: Matrix (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Matrix Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.matrix.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/matrix.md | Public docs only |
| https://spec.matrix.org/latest/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.matrixTool`
- **Aliases:** none (shares executor with `n8n-nodes-base.matrix`)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `matrixApi` (required)

The `matrixTool` type is an AI-agent tool variant of the base Matrix node. It exposes the same underlying operations as the base Matrix node but is intended for use as a tool within AI Agent workflows. It supports `$fromAI()` dynamic parameter population.

### Credential: `matrixApi`

- **Access Token**: A user-specific Matrix access token
- **Homeserver URL**: The URL of the Matrix homeserver (defaults to `https://matrix-client.matrix.org`)

## Parameters

The node exposes 6 resources, each with one or more operations.

### Resource: Account

Operation **me** — retrieves the authenticated user's account information via `GET /_matrix/client/v3/account/whoami`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `account` | yes | |
| operation | fixed | `me` | yes | |

**Output:** raw Matrix JSON — `{ user_id, device_id?, is_guest? }` — one item per input.

### Resource: Event

Operation **get** — fetches a single Matrix event by ID via `GET /_matrix/client/v3/rooms/{roomId}/event/{eventId}`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `event` | yes | |
| operation | fixed | `get` | yes | |
| roomId | string | — | yes | Matrix room ID (prefixed `!`) |
| eventId | string | — | yes | Matrix event ID (prefixed `$`) |

**Output:** raw Matrix event object — one item per input.

### Resource: Media

Operation **upload** — uploads binary data to the Matrix media repository, then posts it as a room message (`m.image`/`m.audio`/`m.video`/`m.file`).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `media` | yes | |
| operation | fixed | `upload` | yes | |
| roomId | string | — | yes | Target room |
| binaryPropertyName | string | `data` | no | Binary field name holding file content |
| mediaType | options | `image` | no | `image`, `audio`, `video`, or `file` |
| additionalFields.fileName | string | — | no | Overrides the filename sent to Matrix |

**Output:** `{ event_id }` (Matrix message-send response after upload + room post) — one item per input.

### Resource: Message

Two operations: **create** and **getAll**.

#### create

Sends a message to a room via `PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `message` | yes | |
| operation | fixed | `create` | yes | |
| roomId | string | — | yes | Target room |
| text | string | — | no | Message body (plain text or HTML fallback) |
| messageType | options | `m.text` | no | `m.text`, `m.emote`, `m.notice` |
| messageFormat | options | — | no | `plain` or `org.matrix.custom.html`; shown when messageType is `org.matrix.custom.html` |
| fallbackText | string | — | no | Plain text fallback when messageFormat is HTML |

**Output:** `{ event_id }` — one item per input.

#### getAll

Fetches paginated room messages via `GET /_matrix/client/v3/rooms/{roomId}/messages`. Produces one output item per chunk event.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `message` | yes | |
| operation | fixed | `getAll` | yes | |
| roomId | string | — | yes | Source room |
| returnAll | boolean | false | yes | Return all results or cap at limit |
| limit | number | 100 | conditional | Max 500; required when returnAll=false |
| otherOptions.filter | string | — | no | JSON RoomEventFilter per Matrix spec |

**Output:** Each output item is one raw Matrix chunk event with keys `event_id`, `type`, `sender`, `content`, `origin_server_ts`, `room_id`, `user_id`, `unsigned`. Multiple items per input.

### Resource: Room

Five operations: **create**, **invite**, **join**, **kick**, **leave**.

#### create

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | |
| operation | fixed | `create` | yes | |
| roomName | string | — | no | Human-readable room name |
| preset | options | `public_chat` | no | `public_chat`, `private_chat`, `trusted_private_chat` |
| roomAlias | string | — | no | Local part of the room alias |

**Output:** `{ room_id }` — one item per input.

#### invite

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | |
| operation | fixed | `invite` | yes | |
| roomId | string | — | yes | Target room |
| userId | string | — | yes | Fully qualified Matrix user ID |

**Output:** `{}` (empty success acknowledgment) — one item per input.

#### join

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | |
| operation | fixed | `join` | yes | |
| roomIdOrAlias | string | — | yes | Room ID or alias (e.g. `#room:domain`) |

**Output:** `{ room_id }` — one item per input.

#### kick

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | |
| operation | fixed | `kick` | yes | |
| roomId | string | — | yes | Room |
| userId | string | — | yes | Fully qualified Matrix user ID |
| reason | string | — | no | Reason for the kick |

**Output:** `{}` — one item per input.

#### leave

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | |
| operation | fixed | `leave` | yes | |
| roomId | string | — | yes | Room to leave |

**Output:** `{}` — one item per input.

### Resource: Room Member

Operation **getAll** — lists room members via `GET /_matrix/client/v3/rooms/{roomId}/members`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `roomMember` | yes | |
| operation | fixed | `getAll` | yes | |
| roomId | string | — | yes | Target room |
| filters.membership | options | — | no | `join`, `invite`, `leave`, `ban`, `knock` |
| filters.notMembership | options | — | no | Exclude members with this membership type |

**Output:** Each item is a raw member state event object with `content.membership`, `state_key`, `type`, `event_id`, `sender`, `room_id`, `user_id`. Multiple items per input.

## Runtime behavior

### Input

Each input item is processed independently. Parameters supporting expressions resolve per-item. Binary data is required only for `media:upload`.

### Output

Non-list operations produce one output item per input item. List operations (`message:getAll`, `roomMember:getAll`) produce one item per result element — potentially multiple items per input. Each output item carries the original `json` enriched with the Matrix API response at the top level. Account/message results carry raw Matrix JSON with `event_id`/`user_id` at the top level.

### Errors

- **Matrix API errors**: Non-2xx responses propagate as thrown errors including `errcode` and `error` from the Matrix homeserver.
- **Missing required parameters**: Throws for missing required fields.
- **`continueOnFail`**: When enabled, outputs `[{ json: { error: string } }]` on failure instead of throwing.

### Expressions

All string parameters accept n8n expression syntax.

### Tool behavior

When used as an AI Agent tool, parameters can be dynamically populated via `$fromAI()`. The node's `usableAsTool: true` flag and parameter descriptions inform the AI about expected data.

## Acceptance tests

### Test: message:create — send plain text

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "create",
  "roomId": "!test:matrix.org",
  "text": "Hello from OpenFlow",
  "messageType": "m.text"
}
```

**Expect** output[0] to contain a single item with `json.event_id` as a non-empty string.

### Test: message:create — send HTML

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "create",
  "roomId": "!test:matrix.org",
  "text": "fallback",
  "messageType": "org.matrix.custom.html",
  "messageFormat": "org.matrix.custom.html",
  "fallbackText": "fallback"
}
```

**Expect** output[0] to contain a single item with `json.event_id` as a non-empty string.

### Test: message:getAll — paginated messages

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "roomId": "!test:matrix.org",
  "returnAll": false,
  "limit": 10,
  "otherOptions": { "filter": "{\"types\":[\"m.room.message\"]}" }
}
```

**Expect** output[0] to contain up to 10 items, each with `json.event_id`, `json.type`, `json.sender`, and `json.content` as defined fields.

### Test: media:upload — binary file to room

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": {
      "mimeType": "image/png",
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }
  }
}]
```

**Parameters:**
```json
{
  "resource": "media",
  "operation": "upload",
  "roomId": "!test:matrix.org",
  "binaryPropertyName": "data",
  "mediaType": "image"
}
```

**Expect** output[0] to contain a single item with `json.event_id` as a non-empty string.

### Test: room:join with alias

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "room",
  "operation": "join",
  "roomIdOrAlias": "#test:matrix.org"
}
```

**Expect** output[0] to contain a single item with `json.room_id` as a non-empty string.

### Test: room:invite — empty success

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "room",
  "operation": "invite",
  "roomId": "!test:matrix.org",
  "userId": "@friend:matrix.org"
}
```

**Expect** output[0] to contain a single item with `json` as an empty object `{}`.

### Test: room:kick — continueOnFail

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "room",
  "operation": "kick",
  "roomId": "!test:matrix.org",
  "userId": "@badactor:matrix.org",
  "continueOnFail": true
}
```

**Expect** output[0] to exist with `json.error` when Matrix returns an error, or `json` as `{}` on success.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | documented | 6 resources, 11 operations from public docs |
| Parameter names and structure | documented | Verified against published node definition: `binaryPropertyName`, `mediaType`, `additionalFields.fileName`, `roomIdOrAlias`, `fallbackText`, `messageFormat`, `otherOptions.filter` |
| Credential shape | documented | `matrixApi`: accessToken + homeserverUrl from public docs |
| `usableAsTool` / `$fromAI()` | inferred | Consistent with all `n8n-nodes-base.*Tool` patterns |
| Output shapes | inferred from Matrix API | Response schemas drawn from Matrix Client-Server API spec |
| continueOnFail errored shape | inferred | Standard pattern across n8n tool nodes |
| Default values | documented | `image`, `data`, `100`, `m.text`, `public_chat`, `false` from published definition |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/matrixTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Shares executor with base Matrix node. Wire type `n8n-nodes-base.matrixTool` resolves to the same resource/operation set as `n8n-nodes-base.matrix`. The executor must be written once and aliased under both type strings. Parameters match the tool-skinned definition (`create` not `send` for message, `upload` not `send` for media, `roomIdOrAlias` for join, `otherOptions.filter` for getAll).
