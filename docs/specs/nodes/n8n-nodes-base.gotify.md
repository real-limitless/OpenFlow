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
| https://gotify.net/docs/pushmsg | Third-party service API docs |
| https://gotify.net/docs/msgextras | Third-party service API docs |
| https://gotify.net/docs/priority | Third-party service API docs |
| https://gotify.net/api-docs | Third-party service API docs (Swagger 2.0 spec) |

## Wire format

- **Type string:** `n8n-nodes-base.gotify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gotifyApi` (required) — contains server URL, App API Token (for creating messages), and Client API Token (for reading/deleting messages)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `message` | `message` | yes | — | Only resource. Selects the Gotify entity to act on. |
| operation | options: `create` / `delete` / `getAll` | `create` | yes | — | The action to perform on the selected resource. |
| message | string | `""` | yes | resource=message, operation=create | The body text of the notification. Supports markdown (excluding HTML). |
| additionalFields.priority | number | `1` | no | resource=message, operation=create | Message priority 0–10. Higher values produce more prominent notifications (sound, vibration). |
| additionalFields.title | string | `""` | no | resource=message, operation=create | Optional title displayed at the top of the notification. |
| options.contentType | options: `text/plain` / `text/markdown` | `text/plain` | no | resource=message, operation=create | Content type for the message body. When set to `text/markdown`, the node sends `extras.client.display.contentType: "text/markdown"` in the API call. |
| messageId | string | `""` | yes | resource=message, operation=delete | The numeric ID of the message to delete. |
| returnAll | boolean | `false` | no | resource=message, operation=getAll | If true, fetch all messages by paginating through all pages. If false, respect the limit parameter. |
| limit | number | `20` | no | resource=message, operation=getAll, returnAll=false | Maximum number of messages to return (minimum 1, maximum 200). |

## Runtime behavior

### Input

Each input item is processed independently. The node reads parameters per-item and may issue one or more API requests per item.

### Output

Single output (`main[0]`) with one result item per input item:

- **Create:** Returns the created message object from the Gotify API: `{ id, message, title?, priority?, date, appid, extras? }`.
- **Delete:** Returns `{ success: true }` on successful deletion.
- **Get All:** Returns an array of message objects. When `returnAll=true`, all messages across pages are collected. When `returnAll=false`, the `limit` parameter caps the result size. Each message object contains `id`, `message`, `title?`, `priority?`, `date`, `appid`, `extras?`.

### Errors

On API failure (network error, invalid credentials, non-existent message ID for delete, 4xx/5xx response), the node throws an error visible to the workflow. If `continueOnFail` is enabled, the failing item produces `{ json: { error: <error message string> } }` and execution continues with the next item.

### Expressions

All parameter values support expression strings (`{{ }}`).

## Gotify API contract

The node interacts with the Gotify REST API (v2.x) at the URL configured in the credential:

- **POST /message** — Creates a message. Request body (JSON): `{ message: string, title?: string, priority?: number, extras?: object }`. Only `message` is required. When `options.contentType` is `text/markdown`, the node includes `extras: { "client::display": { contentType: "text/markdown" } }`. Authenticated via App API Token (X-Gotify-Key header).
- **DELETE /message/{id}** — Deletes a message by numeric ID. Returns 200 on success. Authenticated via Client API Token.
- **GET /message** — Lists messages. Query parameters: `?limit=N` (1–200, default 100), `?since=N` (cursor: return messages with ID less than this value). Returns `{ messages: [...], paging: { size, since, limit, next? } }`. The `paging.next` string is the relative path for the next page (empty/null when no more pages). Authenticated via Client API Token.

Authentication uses the `X-Gotify-Key` header with the appropriate token type. App tokens can only create messages; client tokens can read and delete.

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

**Expect** output[0] to contain a JSON object where `message` is "**bold** and *italic* text" and the API call includes `extras.client.display.contentType: "text/markdown"`.

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

### Test: get all messages (paginated)

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

**Expect** output[0] to contain an array of message objects (each with `id`, `message`, `title?`, `priority?`, `date`, `appid`). If more than 100 messages exist, the executor must follow `paging.next` to fetch all pages.

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

With `continueOnFail` enabled, **expect** output[0] to contain at least one item with `{ "json": { "error": <string> } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and parameters | Documented in public n8n docs + confirmed via public descriptor metadata | 1 resource (message) with 3 operations (create/delete/getAll). High confidence. |
| Credential fields | Documented in public credential docs | App API Token (for create), Client API Token (for delete/getAll), server URL. High confidence. |
| Gotify API contract | Third-party Swagger spec + docs | POST/GET/DELETE /message. Cursor-based pagination via `since` and `paging.next`. High confidence. |
| Content type extras | Documented in Gotify message extras docs | `client::display.contentType` on `extras` object. High confidence. |
| Error response shape | Inferred | `continueOnFail` produces `{ error: string }` items. Medium confidence. |
| Default limit (20) | Inferred from n8n behavior | Gotify API default is 100, but n8n node defaults to 20. Medium confidence. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gotify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only