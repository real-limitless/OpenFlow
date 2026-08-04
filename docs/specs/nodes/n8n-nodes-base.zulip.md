---
type: n8n-nodes-base.zulip
displayName: Zulip
category: Communication
versions: [1]
priority: medium
status: specced
---

# Zulip

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zulip/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zulip/ | Public docs only |
| https://zulip.com/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zulip`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `zulipApi` (required) — Zulip server URL, email, and API key (HTTP Basic auth over the Zulip REST API)

## Parameters

### Resource: `message`

| name | type | default | required | applies to | notes |
|------|------|---------|----------|------------|-------|
| resource | options | `message` | yes | all | One of `message`, `stream`, `user` |
| operation | options | `sendPrivate` | yes | message | `sendPrivate`, `sendStream`, `get`, `update`, `delete`, `updateFile` |
| to | multiOptions | `[]` | yes | sendPrivate | Recipient users (emails), loaded dynamically from Zulip |
| content | string | `""` | yes | sendPrivate, sendStream | Message body text |
| stream | options | (dynamic) | yes | sendStream | Target stream, loaded dynamically from Zulip |
| topic | options | (dynamic) | yes | sendStream | Topic within the selected stream, loaded after stream is chosen |
| messageId | string | `""` | yes | get, update, delete | Unique message identifier |
| updateFields | collection | `{}` | no | update | Optional: `content` (string), `topic` (string), `propagateMode` (options: `changeOne`, `changeLater`, `changeAll`) |
| dataBinaryProperty | string | `"data"` | yes | updateFile | Name of the input binary field containing the file to upload |

### Resource: `stream`

| name | type | default | required | applies to | notes |
|------|------|---------|----------|------------|-------|
| resource | options | `message` | yes | all | One of `message`, `stream`, `user` |
| operation | options | `create` | yes | stream | `create`, `delete`, `getAll`, `getSubscribed`, `update` |
| jsonParameters | boolean | false | no | create, update | When true, accepts raw JSON for additional fields |
| additionalFieldsJson | json | `""` | no | create, update | Raw JSON body for stream create/update (requires jsonParameters=true) |
| subscriptions | fixedCollection | `{}` | yes | create | List of { name, description } pairs for streams to create/subscribe to |
| additionalFields | collection | `{}` | no | create | Optional: `announce` (bool), `authorizationErrorsFatal` (bool), `historyPublicToSubscribers` (bool), `inviteOnly` (bool), `principals` (list of emails), `streamPostPolicy` (1=any, 2=admin, 3=new members) |
| additionalFields | collection | `{}` | no | getAll | Optional: `includePublic`, `includeSubscribed`, `includeAllActive`, `includeDefault`, `includeOwnersubscribed` (all bool, all default true) |
| additionalFields | collection | `{}` | no | getSubscribed | Optional: `includeSubscribers` (bool, default true) |
| streamId | string | `""` | yes | delete, update | Stream ID |
| additionalFields | collection | `{}` | no | update | Optional: `description` (string), `newName` (string), `isPrivate` (bool), `isAnnouncementOnly` (bool), `streamPostPolicy` (1/2/3), `historyPublicToSubscribers` (bool) |

### Resource: `user`

| name | type | default | required | applies to | notes |
|------|------|---------|----------|------------|-------|
| resource | options | `message` | yes | all | One of `message`, `stream`, `user` |
| operation | options | `create` | yes | user | `create`, `deactivate`, `get`, `getAll`, `update` |
| email | string | `""` | yes | create | Email address of the new user |
| fullName | string | `""` | yes | create | Full display name |
| password | string (password) | `""` | yes | create | User password |
| shortName | string | `""` | yes | create | Short username (not user-visible) |
| userId | string | `""` | yes | get, update, deactivate | User ID |
| additionalFields | collection | `{}` | no | get, getAll | Optional: `clientGravatar` (bool), `includeCustomProfileFields` (bool) |
| additionalFields | collection | `{}` | no | update | Optional: `fullName` (string), `isAdmin` (bool), `isGuest` (bool), `role` (100=owner, 200=admin, 300=moderator, 400=member, 600=guest), `profileData` (collection of { id, value } pairs) |

## Runtime behavior

### Input

Each input item is processed independently. Parameters supporting `$expression` can reference item data for per-item variation.

### Message operations

- **sendPrivate** — POST `/messages` with `type: "private"`, `to` (comma-joined recipient emails), and `content`. Returns the Zulip API response (`{ id, msg, result }`).
- **sendStream** — POST `/messages` with `type: "stream"`, `stream` (ID), `topic`, and `content`. Returns the Zulip API response.
- **get** — GET `/messages/{messageId}`. Returns the full message object from Zulip with content, sender, timestamps, etc.
- **update** — PATCH `/messages/{messageId}` with optional `content`, `topic`, and `propagate_mode`. Returns the Zulip API response.
- **delete** — DELETE `/messages/{messageId}`. Returns success confirmation.
- **updateFile** — POST `/user_uploads` with multipart file data. Returns an object containing `uri` (absolute URL to the uploaded file) plus the Zulip response.

### Stream operations

- **create** — POST `/users/me/subscriptions` with `subscriptions` (JSON-encoded array of { name, description }) and optional additional fields. Returns subscription confirmation.
- **getAll** — GET `/streams` with optional filter booleans. Returns the `streams` array from the response. Each stream includes `stream_id`, `name`, `description`, and other Zulip metadata.
- **getSubscribed** — GET `/users/me/subscriptions` with optional `include_subscribers`. Returns the `subscriptions` array.
- **update** — PATCH `/streams/{streamId}` with optional field overrides. Returns success confirmation.
- **delete** — DELETE `/streams/{streamId}`. Returns success confirmation.

### User operations

- **create** — POST `/users` with `email`, `password`, `full_name`, `short_name`. Returns user creation confirmation.
- **get** — GET `/users/{userId}` with optional `client_gravatar` and `include_custom_profile_fields`. Returns the full user object.
- **getAll** — GET `/users` with same optional fields. Returns the `members` array (list of user objects).
- **update** — PATCH `/users/{userId}` with optional `full_name`, `is_admin`, `is_guest`, `role`, or `profile_data`. Returns success confirmation.
- **deactivate** — DELETE `/users/{userId}`. Deactivates the user account.

### Errors

API errors propagate as NodeApiError with the Zulip error message. When `continueOnFail` is enabled, error items contain `{ error: message }` instead of throwing.

### Expressions

All string parameters accept expressions. Dynamic options (streams, topics, users) are loaded at node parameter edit time via Zulip API calls (`GET /streams`, `GET /users/me/{streamId}/topics`, `GET /users`).

## Acceptance tests

### Test: send private message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "message", "operation": "sendPrivate", "to": ["user@example.com"], "content": "Hello from n8n" }
```

**Expect** output[0]:
```json
[{ "json": { "id": 123, "msg": "", "result": "success" } }]
```

### Test: send stream message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "message", "operation": "sendStream", "stream": 1, "topic": "general", "content": "Stream test" }
```

**Expect** output[0]:
```json
[{ "json": { "id": 124, "msg": "", "result": "success" } }]
```

### Test: get all users

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "user", "operation": "getAll", "additionalFields": {} }
```

**Expect** output[0]:
```json
[{ "json": { "email": "alice@example.com", "user_id": 1, "full_name": "Alice" } }]
```
The exact field set matches the Zulip `/users` response; the test should verify that the output is an array of user objects.

### Test: create stream with subscriptions

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "stream", "operation": "create", "subscriptions": { "properties": [{ "name": "test-stream", "description": "A test stream" }] }, "additionalFields": { "announce": true } }
```

**Expect** output[0]:
```json
[{ "json": { "result": "success", "msg": "", "subscribed": { "test-stream": "test-stream" } } }]
```

### Test: upload file to message

**Given** input items with binary data:
```json
[{ "json": {}, "binary": { "data": { "fileName": "test.txt", "mimeType": "text/plain" } } }]
```

**Parameters:**
```json
{ "resource": "message", "operation": "updateFile", "dataBinaryProperty": "data" }
```

**Expect** output[0]:
```json
[{ "json": { "id": 125, "msg": "", "result": "success", "uri": "https://zulip.example.com/user_uploads/..." } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Zulip endpoint paths | documented | Zulip REST API docs + public n8n docs confirm paths |
| Resource/operation structure | documented | Public n8n docs lists all operations per resource |
| Parameter shapes and types | inferred from corpus | Exact field names, defaults, and option enums derived from published package descriptor (parameter description only, not implementation) |
| Credential fields | documented | Zulip credentials page confirms URL + email + API key |
| `usableAsTool` property | inferred from corpus | The node is marked `usableAsTool: true` in the descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/zulip.ts`
- **SDK:** `defineNode` + native `ExecutionContext`
