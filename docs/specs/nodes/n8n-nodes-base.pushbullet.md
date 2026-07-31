---
type: n8n-nodes-base.pushbullet
displayName: Pushbullet
category: Communication
versions: [1]
priority: medium
status: specced
---

# Pushbullet

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushbullet.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pushbullet.md | Public docs only |
| https://docs.pushbullet.com/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.pushbullet`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `pushbulletOAuth2Api` (OAuth2)

## Parameters

### Resource & Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `push` | yes | Pushbullet only exposes the "Push" resource |
| operation | options | `create` | yes | `create`, `delete`, `getAll`, `update` |

### Push operations

#### Create (`create`)

Posts a new push to one or more devices via `POST /v2/pushes`. The executor must map user-facing fields to the Pushbullet API body.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| pushType | options | `note` | yes | Push type: `note`, `link`, `file` |
| title | string | — | no | Push title (accepts expression) |
| body | string | — | no | Push body / message text (accepts expression) |
| url | string | — | no | URL for `link`-type pushes (accepts expression) |
| target | options | — | no | Recipient target: `device` (by device_iden), `email`, `channel` (by channel_tag). Omit to broadcast to all devices. |
| device_iden | string | — | no | Target device ID (required when target=device) |
| email | string | — | no | Target email address (required when target=email) |
| channel_tag | string | — | no | Channel tag to broadcast to (required when target=channel) |

For `file`-type pushes, the node expects a prior file upload step. The executor must call `POST /v2/upload-request` to obtain an upload URL, upload the binary data, then use the returned `file_name`, `file_type`, and `file_url` in the push.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| binaryProperty | string | — | no | Input item binary field containing the file data (for file-type pushes) |

#### Delete (`delete`)

Deletes a push by ID via `DELETE /v2/pushes/{iden}`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| pushId | string | — | yes | The `iden` of the push to delete (accepts expression) |

#### Get All (`getAll`)

Lists pushes via `GET /v2/pushes`. Returns all non-deleted pushes by default, with optional filtering.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | no | Fetch all results (paginated) |
| limit | number | 50 | no | Max results per page (1–500) |
| filters | fixedCollection | — | no | Optional filters |
| filter.active | boolean | true | no | Exclude deleted pushes |
| filter.modifiedAfter | dateTime | — | no | Only pushes modified after this timestamp |

#### Update (`update`)

Updates an existing push via `POST /v2/pushes/{iden}`. Only `dismissed` can be updated (the Pushbullet API does not allow editing title/body/url after creation).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| pushId | string | — | yes | The `iden` of the push to update (accepts expression) |
| dismissed | boolean | true | yes | Mark the push as dismissed |

## Runtime behavior

### Input

Each input item is processed independently. For `create`, input item JSON fields can be referenced via expressions for `title`, `body`, `url`, and `pushId`. For `file`-type pushes, the binary data is read from the input item's binary property.

### Output

One output item is emitted per input item. The output `json` contains the full Pushbullet API response object for the operation:

- **create:** Returns the created [Push](https://docs.pushbullet.com/#push) object (iden, active, created, modified, type, direction, title, body, sender/receiver fields, etc.)
- **delete:** Returns an empty JSON object `{}` on success
- **getAll:** Returns `{ "pushes": [...] }` containing an array of Push objects
- **update:** Returns the updated Push object

Binary data is passed through unchanged from input to output.

### Errors

- `400 Bad Request`: Missing required parameters (e.g., no target for create, no push type fields) — the node should throw a descriptive error
- `401 Unauthorized`: Invalid or missing OAuth2 credential — throw a credential error
- `403 Forbidden`: Access token lacks permission for the operation
- `404 Not Found`: The push ID does not exist (delete/update)
- `429 Too Many Requests`: Rate-limited — throw with the rate-limit header info
- Push limit exceeded (free accounts: 500/month) — the API returns an error; propagate to the user
- On `continueOnFail: true`, errored items emit `{ json: { error: { message, type, param? } } }` on output[0] instead of throwing

### Expressions

`title`, `body`, `url`, `pushId`, `device_iden`, `email`, `channel_tag`, `binaryProperty`, `limit`, and `modifiedAfter` accept expression strings.

## Acceptance tests

### Test: create a note push

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "push",
  "operation": "create",
  "pushType": "note",
  "title": "Test Note",
  "body": "Hello from OpenFlow"
}
```

**Expect** the executor calls `POST /v2/pushes` with body `{ "type": "note", "title": "Test Note", "body": "Hello from OpenFlow" }` and output[0] contains the Push object returned by the API (including `iden`, `created`, `direction: "self"`, `type: "note"`, `title`, `body`, `sender_iden`).

### Test: create a link push to an email target

**Parameters:**

```json
{
  "resource": "push",
  "operation": "create",
  "pushType": "link",
  "title": "Check this out",
  "url": "https://example.com",
  "target": "email",
  "email": "user@example.com"
}
```

**Expect** `POST /v2/pushes` with body `{ "type": "link", "title": "Check this out", "url": "https://example.com", "email": "user@example.com" }`. Output contains the created link Push object.

### Test: get all pushes with limit

**Parameters:**

```json
{
  "resource": "push",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** `GET /v2/pushes?active=true&limit=10` is called. Output[0] contains `{ "pushes": [...] }` with at most 10 entries.

### Test: delete a push

**Given** input items:

```json
[{ "json": { "pushId": "ujpah72o0sjAoRtnM0jc" } }]
```

**Parameters:**

```json
{
  "resource": "push",
  "operation": "delete",
  "pushId": "={{ $json.pushId }}"
}
```

**Expect** `DELETE /v2/pushes/ujpah72o0sjAoRtnM0jc` is called. Output[0] is `{ "json": {} }`.

### Test: update push as dismissed

**Parameters:**

```json
{
  "resource": "push",
  "operation": "update",
  "pushId": "ujpah72o0sjAoRtnM0jc",
  "dismissed": true
}
```

**Expect** `POST /v2/pushes/ujpah72o0sjAoRtnM0jc` with body `{ "dismissed": true }`. Output contains the updated Push object with `dismissed: true`.

### Test: continue on fail — missing push ID

**Given** `continueOnFail: true` and no `pushId` provided for delete:

**Expect** no throw. Output[0] contains `{ "json": { "error": { "message": "Push ID is required", "type": "invalid_request" } } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| OAuth2 credential | Public docs only | Confirmed: OAuth2 with Client ID + Client Secret |
| Push operations (create/delete/getAll/update) | Public docs only | Documented at docs.n8n.io |
| Push API endpoint contracts | Third-party service API docs | docs.pushbullet.com fully documents `POST /v2/pushes`, `GET /v2/pushes`, `DELETE /v2/pushes/{iden}`, `POST /v2/pushes/{iden}` |
| File upload flow | Third-party service API docs | Two-part process: upload-request + push with type=file; binary upload inferred from n8n pattern |
| Update scope (only dismissed) | Inferred from Pushbullet API docs | The Pushbullet API only documents `dismissed` as an updatable field on pushes |
| Specific parameter names (pushId, pushType, target, returnAll, binaryProperty) | Inferred | Functional names chosen; actual n8n node may use different keys (e.g. `pushId` may be `pushIden`) |
| Exact `displayOptions` conditions | Not documented | Not needed for functional spec; implementation should map per-operation visibility |
| Category: Communication | Public descriptor metadata | Confirmed from node.json descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/pushbullet.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only