---
type: n8n-nodes-base.gotify
displayName: Gotify
category: Communication
versions: [1]
priority: medium
status: specced
---

# Gotify

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotify.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gotify.md | Public docs only |
| https://gotify.net/api-docs | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.gotify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gotifyApi` (required) — API token credential containing server URL, App API Token (for creating messages), and Client API Token (for reading/deleting messages)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `message` | `message` | yes | — | Only resource. Selects the Gotify entity to act on. |
| operation | options: `create` / `delete` / `getAll` | `create` | yes | — | The action to perform on the selected resource. |
| message | string | `""` | yes | resource=message, operation=create | The body text of the notification message. |
| additionalFields.priority | number | `1` | no | resource=message, operation=create | Message priority (Gotify 0–10 scale, default 1). Higher values produce more prominent notifications. |
| additionalFields.title | string | `""` | no | resource=message, operation=create | Optional title displayed at the top of the notification. |
| options.contentType | options: `text/plain` / `text/markdown` | `text/plain` | no | resource=message, operation=create | Content type for the message body. Markdown enables rich formatting in the notification. |
| messageId | string | `""` | yes | resource=message, operation=delete | The numeric ID of the message to delete. |
| returnAll | boolean | `false` | no | resource=message, operation=getAll | If true, fetch all messages (paginating internally). If false, respect the limit parameter. |
| limit | number | `20` | no | resource=message, operation=getAll, returnAll=false | Maximum number of messages to return (minimum 1). |

## Runtime behavior

### Input

Each input item is processed independently. The node reads parameters per-item and may issue one API request per item.

### Output

Single output (`main[0]`) with one result item per input item:

- **Create:** Returns the created message object from the Gotify API, containing `id`, `message`, `title`, `priority`, `date`, `appid`, etc.
- **Delete:** Returns `{ success: true }` on successful deletion.
- **Get All:** Returns an array of message objects (each containing `id`, `message`, `title`, `priority`, `date`, `appid`). When `returnAll=true`, all messages across pages are collected. When `returnAll=false`, only the number of results specified by `limit` are returned.

### Errors

On API failure (network error, invalid credentials, non-existent message ID for delete, etc.), the node throws an error visible to the workflow. If `continueOnFail` is enabled on the node, the failing item produces `{ json: { error: <message> } }` and execution continues with the next item.

### Expressions

All parameter values support expression strings (`{{ }}`).

## Gotify API contract

The node interacts with the Gotify REST API (v2.x/3.x) at the URL configured in the credential:

- **POST /message** — Creates a message. Request body: `{ message, title?, priority? }`. Content type is sent via the `extras.client.display.contentType` field. Authenticated via App API Token.
- **DELETE /message/{id}** — Deletes a message by numeric ID. Authenticated via Client API Token.
- **GET /message** — Lists messages. Supports `?limit=N` and `?offset=N` query parameters. Returns `{ messages: [...], paging: { ... } }`. Authenticated via Client API Token.

Authentication is via the `X-Gotify-Key` header (or `Authorization: Bearer <token>`), with the token type (app vs client) determining allowed operations.

## Acceptance tests

### Test: create a message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "create",
  "message": "Hello from OpenFlow",
  "additionalFields": {
    "title": "Test Notification",
    "priority": 5
  }
}
```

**Expect** output[0] to contain a JSON object with keys: `id` (number), `message` ("Hello from OpenFlow"), `title` ("Test Notification"), `priority` (5), `appid` (number), `date` (string).

### Test: create a message with markdown content type

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "create",
  "message": "**bold** and *italic* text",
  "options": {
    "contentType": "text/markdown"
  }
}
```

**Expect** output[0] to contain a JSON object where `message` is "**bold** and *italic* text" and the API call sends the content type as markdown in the extras field.

### Test: delete a message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": "42"
}
```

**Expect** output[0] to contain `{ "success": true }`.

### Test: get all messages

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] to contain an array of message objects (each with `id`, `message`, `title`, `priority`, `date`, `appid`).

### Test: get limited messages

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] to contain at most 5 message objects.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }, { "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": "999999"
}
```

With `continueOnFail` enabled on the node, **expect** output[0] to contain at least one item with `{ "json": { "error": <string> } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and parameters | Documented in public n8n docs + confirmed via public descriptor metadata | 1 resource (message) with 3 operations (create/delete/getAll). High confidence. |
| Credential fields | Documented in public credential docs | App API Token (for create), Client API Token (for delete/getAll), server URL. High confidence. |
| Gotify API contract | Third-party API docs | POST/GET/DELETE /message endpoints. Pagination via messages array in response body. High confidence. |
| Error response shapes | Inferred from implementation | `continueOnFail` produces `{ error: string }` items. Medium confidence. |
| Exact output field names | Inferred from Gotify API spec | Standard fields: id, message, title, priority, date, appid. Medium-high confidence. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gotify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only