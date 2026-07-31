---
type: n8n-nodes-base.matrix
displayName: Matrix
category: Communication
versions: [1]
priority: medium
status: specced
---

# Matrix

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.matrix.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/matrix.md | Public docs only |
| https://spec.matrix.org/latest/ | Third-party protocol docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.matrix`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `matrixApi`

### Credential: matrixApi

| name | type | default | required |
|------|------|---------|----------|
| accessToken | string | — | yes |
| homeserverUrl | string | `https://matrix.org` | yes |

The access token is a Matrix user token obtained from a client session. The homeserver URL is the base URL of the Matrix homeserver.

## Parameters

The node uses a resource + operation selector. The user chooses a resource (account / event / media / message / room / roomMember) then an operation valid for that resource.

### Resource: account

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `account` | yes | single resource |
| operation | fixed | `me` | yes | single operation |

### Resource: event

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `event` | yes | single resource |
| operation | fixed | `get` | yes | single operation |
| roomId | string | — | yes | Matrix room ID |
| eventId | string | — | yes | Matrix event ID |

### Resource: media

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `media` | yes | single resource |
| operation | fixed | `upload` | yes | single operation |
| roomId | options (loadOptionsMethod) | — | yes | loaded from server via `getChannels`; also accepts expression |
| binaryPropertyName | string | `data` | yes | name of the input binary field containing the file |
| mediaType | options | `image` | yes | `image`, `audio`, `video`, or `file` |
| additionalFields.fileName | string | — | no | overrides the filename sent to Matrix |

The node uploads the binary file to the Matrix media repository, then posts it as a room message with the appropriate `m.*` message type.

### Resource: message

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `message` | yes | single resource |
| operation | options | `create` | yes | `create` or `getAll` |

**message:create**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |
| text | string | — | no | message body text |
| messageType | options | `m.text` | no | `m.text`, `m.emote`, or `m.notice` |
| messageFormat | options | `plain` | no | `plain` or `org.matrix.custom.html` |
| fallbackText | string | — | no | plain text fallback when messageFormat is HTML |

**message:getAll**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |
| returnAll | boolean | false | yes | return all results or cap at a limit |
| limit | number | 100 | conditional | max 500; required when returnAll=false |
| otherOptions.filter | string | — | no | JSON RoomEventFilter string |

### Resource: room

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `room` | yes | single resource |
| operation | options | `create` | yes | `create`, `invite`, `join`, `kick`, or `leave` |

**room:create**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomName | string | — | yes | human-readable room name |
| preset | options | `public_chat` | yes | `public_chat` or `private_chat` |
| roomAlias | string | — | no | local part of the room alias |

**room:join**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomIdOrAlias | string | — | yes | room ID or alias (e.g. `#room:domain`) |

**room:invite**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |
| userId | string | — | yes | fully qualified Matrix user ID |

**room:kick**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |
| userId | string | — | yes | fully qualified Matrix user ID |
| reason | string | — | no | reason for the kick |

**room:leave**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |

### Resource: roomMember

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `roomMember` | yes | single resource |
| operation | fixed | `getAll` | yes | single operation |

**roomMember:getAll**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | options (loadOptionsMethod) | — | yes | loaded via `getChannels`; also accepts expression |
| filters.membership | options | — | no | `join`, `invite`, `leave`, `ban`, or empty for any |
| filters.notMembership | options | — | no | exclude members with this membership type |

## Runtime behavior

### Input

The node accepts items from any upstream node. Binary data is required only for `media:upload` — the field named by `binaryPropertyName` (default `data`) must exist on the input item.

### Output

Each operation produces output items with the Matrix Client-Server API response body:

| Operation | Output shape | Item count |
|-----------|-------------|------------|
| account:me | `{ user_id, device_id?, is_guest? }` | 1 per input |
| event:get | Matrix event object | 1 per input |
| media:upload | `{ event_id }` (message-send response after upload + room post) | 1 per input |
| message:create | `{ event_id }` | 1 per input |
| message:getAll | Array of message event objects (each with `event_id`, `type`, `sender`, `content`, `origin_server_ts`, `room_id`, `user_id`, `unsigned`) | 1 per result |
| room:create | `{ room_id }` | 1 per input |
| room:join | `{ room_id }` | 1 per input |
| room:invite | `{}` (success acknowledgment) | 1 per input |
| room:kick | `{}` (success acknowledgment) | 1 per input |
| room:leave | `{}` (success acknowledgment) | 1 per input |
| roomMember:getAll | Array of member state event objects (each with `content.membership`, `state_key`, `type`, `event_id`, `sender`, `room_id`, `user_id`) | 1 per result |

Non-list operations produce one output item per input item. List operations (`message:getAll`, `roomMember:getAll`) produce one item per result element, potentially multiple items per input.

### Errors

- Authentication failures (invalid token or expired session) propagate as thrown errors.
- Matrix API error responses (non-2xx) propagate as thrown errors with the Matrix `errcode` and `error` message.
- Room not found, user not found, or permission denied errors return the Matrix API error.
- Missing binary data on `media:upload` produces a node-level validation error.
- `continueOnFail` produces errored items as `[{ json: { error: string } }]` on a single-branch output.

### Expressions

All string parameters accept n8n expression syntax. Parameters that use `loadOptionsMethod` may alternatively be supplied as a string expression instead of a dropdown selection.

### Matrix Client-Server API calls

The node translates each operation to Matrix CS API endpoints:

| Operation | HTTP method | Path |
|-----------|-------------|------|
| account:me | GET | `/_matrix/client/v3/account/whoami` |
| event:get | GET | `/_matrix/client/v3/rooms/{roomId}/event/{eventId}` |
| media:upload | POST | `/_matrix/media/v3/upload` |
| message:create | PUT | `/_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}` |
| message:getAll | GET | `/_matrix/client/v3/rooms/{roomId}/messages` |
| room:create | POST | `/_matrix/client/v3/createRoom` |
| room:join | POST | `/_matrix/client/v3/join/{roomIdOrAlias}` |
| room:invite | POST | `/_matrix/client/v3/rooms/{roomId}/invite` |
| room:kick | POST | `/_matrix/client/v3/rooms/{roomId}/kick` |
| room:leave | POST | `/_matrix/client/v3/rooms/{roomId}/leave` |
| roomMember:getAll | GET | `/_matrix/client/v3/rooms/{roomId}/members` |

## Acceptance tests

### Test: account:me — get current user

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "me"
}
```

**Expect** output[0] to contain a single item with `json.user_id` as a string matching the Matrix user ID format `@localpart:domain`.

### Test: message:create — send text message

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
  "messageType": "m.text",
  "messageFormat": "plain"
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
  "limit": 10
}
```

**Expect** output[0] to contain up to 10 items, each with `json.event_id`, `json.type`, `json.sender`, and `json.content` as defined fields.

### Test: room:create — new public room

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "room",
  "operation": "create",
  "roomName": "Test Room",
  "preset": "public_chat"
}
```

**Expect** output[0] to contain a single item with `json.room_id` as a non-empty string.

### Test: media:upload — upload binary file to a room

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

### Test: roomMember:getAll — list members

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "roomMember",
  "operation": "getAll",
  "roomId": "!test:matrix.org",
  "filters": { "membership": "join" }
}
```

**Expect** output[0] to contain one or more items, each with `json.content.membership` equal to `"join"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | documented | 6 resources and 11 operations confirmed from public n8n docs |
| Parameter names & types | documented + descriptor | Names and types confirmed from public descriptor metadata |
| Matrix CS API endpoints | documented | Matrix Client-Server API spec; paths use the v3 prefix |
| Credential shape | documented | matrixApi: accessToken + homeserverUrl confirmed from credential docs |
| Output shapes | inferred from Matrix API | Response schemas per operation drawn from the Matrix spec; tests verify functional contracts |
| loadOptionsMethod `getChannels` | inferred from descriptor | Dynamic room selection via a server-loaded options method |
| media:upload dual behavior | inferred from descriptor | Uploads binary to Matrix media repo, then posts as a room message |
| error code mapping | documented | Matrix `errcode` values are standard per the Matrix spec |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/matrix.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only