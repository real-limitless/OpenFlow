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

The access token is a Matrix user token obtained from a client session. The homeserver URL is the base URL of the Matrix homeserver (e.g. `https://matrix-client.matrix.org`).

## Parameters

The node exposes a **resource** + **operation** paradigm. The user selects a resource (account / event / media / message / room / roomMember) and then an operation valid for that resource.

### Resource: account

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `account` | yes | fixed resource selector |
| operation | string | `me` | yes | only `me` |

### Resource: event

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `event` | yes | fixed resource selector |
| operation | string | `get` | yes | only `get` |
| roomId | string | — | yes | Matrix room ID (e.g. `!123abc:matrix.org`) |
| eventId | string | — | yes | Matrix event ID (e.g. `$1234abcd:matrix.org`) |

### Resource: media

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `media` | yes | fixed resource selector |
| operation | string | `upload` | yes | only `upload` |
| roomId | string (options, loadOptionsMethod) | — | yes | loaded from server via `getChannels` |
| binaryPropertyName | string | `data` | yes | input binary field containing the file |
| mediaType | string (options) | `image` | yes | one of `image`, `audio`, `video`, `file` |
| additionalFields.fileName | string | — | no | name of the file being uploaded |

### Resource: message

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `message` | yes | fixed resource selector |
| operation | string | `create` | yes | `create` or `getAll` |

**message:create**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |
| text | string | — | no | the text body to send |
| messageType | string (options) | `m.text` | no | `m.text`, `m.emote`, `m.notice` |
| messageFormat | string (options) | `plain` | no | `plain` or `org.matrix.custom.html` |
| fallbackText | string | — | no | plain text fallback when messageFormat is HTML |

**message:getAll**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |
| returnAll | boolean | false | yes | return all results or limit |
| limit | number | 100 | conditional | max 500, required when returnAll=false |
| otherOptions.filter | string | — | no | JSON RoomEventFilter string |

### Resource: room

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `room` | yes | fixed resource selector |
| operation | string | `create` | yes | `create`, `invite`, `join`, `kick`, `leave` |

**room:create**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomName | string | — | yes | human-readable room name |
| preset | string (options) | `public_chat` | yes | `public_chat` or `private_chat` |
| roomAlias | string | — | no | local part of room alias |

**room:join**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomIdOrAlias | string | — | yes | room ID or alias (e.g. `#room:domain`) |

**room:invite**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |
| userId | string | — | yes | fully qualified Matrix user ID |

**room:kick**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |
| userId | string | — | yes | fully qualified Matrix user ID |
| reason | string | — | no | reason for the kick |

**room:leave**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |

### Resource: roomMember

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `roomMember` | yes | fixed resource selector |
| operation | string | `getAll` | yes | only `getAll` |

**roomMember:getAll**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| roomId | string (options, loadOptionsMethod) | — | yes | loaded via `getChannels` |
| filters.membership | string (options) | — | no | `join`, `invite`, `leave`, `ban`, or empty for any |
| filters.notMembership | string (options) | — | no | exclude membership type (same options) |

## Runtime behavior

### Input

The node accepts items from any upstream node. Binary data is required only for `media:upload` (the `binaryPropertyName` field must exist on the input item).

### Output

Each operation produces output items keyed by the Matrix Client-Server API response body:

- **account:me** — emits the `/account/whoami` response: `{ user_id, device_id?, is_guest? }`.
- **event:get** — emits the Matrix event object for the given `roomId`/`eventId`.
- **media:upload** — emits the `/upload` response: `{ content_uri }`. Also passes through the input items with the `content_uri` merged.
- **message:create** — emits `{ event_id }`.
- **message:getAll** — emits an array of message objects (each with `event_id`, `type`, `sender`, `content`, `origin_server_ts`, `room_id`, `user_id`, `unsigned`).
- **room:create** — emits `{ room_id }`.
- **room:join** — emits `{ room_id }`.
- **room:invite** — emits `{}` (success acknowledgment).
- **room:kick** — emits `{}` (success acknowledgment).
- **room:leave** — emits `{}` (success acknowledgment).
- **roomMember:getAll** — emits an array of room member state event objects (each with `content`, `state_key`, `type`, `event_id`, `origin_server_ts`, `sender`, `room_id`, `unsigned`, `user_id`).

Non-list operations produce a single output item. List operations (`message:getAll`, `roomMember:getAll`) produce one item per result.

### Errors

- Authentication failures (invalid token) propagate as thrown errors.
- Matrix API error responses (non-2xx) propagate as thrown errors with the Matrix error code (`errcode`).
- Room not found, user not found, or permission errors return the Matrix API error.
- `continueOnFail` produces the error JSON wrapped in `{ json: { error, ... } }` on a single-branch output.

### Expressions

All string parameters accept n8n expression syntax. The `roomId` parameters using `loadOptionsMethod` may alternatively be supplied as a string expression instead of a dropdown selection.

### Matrix Client-Server API calls

The node translates each operation to the following Matrix CS API endpoints:

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

**Expect** output[0] to contain a single item with `user_id` as a string matching the Matrix user ID format `@localpart:domain`.

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
  "text": "Hello from n8n",
  "messageType": "m.text",
  "messageFormat": "plain"
}
```

**Expect** output[0] to contain a single item with `event_id` as a non-empty string.

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

**Expect** output[0] to contain up to 10 items, each with `event_id`, `type`, `sender`, and `content`.

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

**Expect** output[0] to contain a single item with `room_id` as a non-empty string.

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

**Expect** output[0] to contain one or more items, each with `content.membership` equal to `"join"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | Public docs + descriptor | All 6 resources and 11 operations confirmed from public n8n docs and npm descriptor |
| Parameter names & types | Public descriptor metadata | Extracted from npm package descriptor JSON; no implementation logic copied |
| Matrix CS API endpoints | Third-party protocol docs | Derived from Matrix Spec v1.19 Client-Server API |
| Credential shape | Public docs | matrixApi: accessToken + homeserverUrl confirmed from credential docs |
| Output shapes | Inferred from Matrix API | Response schemas per operation are drawn from the Matrix spec; tests verify functional contracts not exact shapes |
| loadOptionsMethod `getChannels` | Inferred from descriptor | Room selection via a dynamically loaded options method; exact API call is implementation detail |
| Error code mapping | Public Matrix spec | Matrix `errcode` values are standard per the Matrix spec |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/matrix.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only