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
| https://docs.n8n.io/integrations/builtin/credentials/gotify/ | Public docs only |
| https://gotify.net/docs/pushmsg | Public docs only |
| https://gotify.net/api-docs | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.gotify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gotifyApi` (API token — uses either app token or client token depending on operation)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | — | `create` / `delete` / `getAll` |
| message | string | — | yes | operation=create | The message body text to send |
| additionalFields | collection | — | no | operation=create | Title, priority, and other optional message metadata |
| additionalFields.title | string | — | no | operation=create | Optional message title |
| additionalFields.priority | number | 0 | no | operation=create | Message priority (0–10); higher values give notifications higher precedence on the client |
| options | collection | — | no | operation=create | Additional request options |
| options.contentType | options | `text/plain` | no | operation=create | Content type of the message body: `text/plain` or `text/markdown` |
| messageId | number | — | yes | operation=delete | The numeric ID of the message to delete |
| limit | number | 20 | no | operation=getAll | Max results to retrieve |
| returnAll | boolean | false | no | operation=getAll | If true, retrieves all messages (overrides `limit`) |

## Runtime behavior

### Input

Each input item is processed independently. For `create` and `delete`, one API call is made per item. For `getAll`, a single API call retrieves the message list and the result is attached to every input item.

### Output

- **create:** Returns the created message object from the Gotify API (`{ id, appid, message, title, priority, date, extras }`).
- **delete:** Returns a success acknowledgment. The output item contains the original input merged with `{ success: true }`.
- **getAll:** Returns an array of message objects under the `messages` key. Each output item receives the full response shape `{ messages: [...], paging: {...} }`.

### Errors

- Non-2xx responses from the Gotify server throw an `ApiError` with the status code and response body.
- If `continueOnFail` is enabled on the node, the failing item is returned with `error` property and processing continues.

### Expressions

All string and number parameters (`message`, `title`, `priority`, `messageId`, `limit`, `contentType`) support expressions.

### Credential requirements

- **App API Token** — sufficient for the `create` operation.
- **Client API Token** — required for `delete` and `getAll` operations.
- The credential also stores the Gotify server **URL** and an optional **Ignore SSL Issues** flag.

### API mapping

- `create`: `POST /message` with `X-Gotify-Key: <appApiToken>`, body `{ message, title?, priority?, extras? }`
- `delete`: `DELETE /message/{messageId}` with `X-Gotify-Key: <clientApiToken>`
- `getAll`: `GET /message` with `X-Gotify-Key: <clientApiToken>`, query params `{ limit?, since? }`

## Acceptance tests

### Test: create a message with full fields

**Given** input items:

```json
[{ "json": { "alertText": "Disk space low" } }]
```

**Parameters:**

```json
{
  "operation": "create",
  "message": "={{ $json.alertText }}",
  "additionalFields": { "title": "Server Alert", "priority": 8 }
}
```

**Expect** output[0] contains a JSON object with `id` (number), `message` ("Disk space low"), `title` ("Server Alert"), `priority` (8), and `appid` (number).

### Test: delete a message by ID

**Given** input items:

```json
[{ "json": { "msgId": 42 } }]
```

**Parameters:**

```json
{
  "operation": "delete",
  "messageId": "={{ $json.msgId }}"
}
```

**Expect** output[0].json has `success: true` and preserves the original item json properties.

### Test: get all messages

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0].json has `messages` (array) and `paging` (object).

### Test: create message with only required field

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "create",
  "message": "Hello Gotify"
}
```

**Expect** output[0].json has `message` equal to "Hello Gotify", no `title`, and `priority` of 0.

### Test: multi-item create processes each item independently

**Given** input items:

```json
[
  { "json": { "text": "First" } },
  { "json": { "text": "Second" } }
]
```

**Parameters:**

```json
{
  "operation": "create",
  "message": "={{ $json.text }}"
}
```

**Expect** output[0] is an array of 2 items, each containing a unique `id` from the API.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Public n8n docs list: Create, Delete, Get All |
| Parameters for each operation | documented | Create: message, title, priority, contentType; Delete: messageId; Get All: limit, returnAll |
| Gotify REST API contract | documented | Gotify API docs confirm message shape, auth scheme, and endpoints |
| Credential token types | documented | n8n docs clearly split app token vs client token |
| Priority range | documented | Gotify priority doc confirms 0–10 |
| contentType option | inferred | Observed in node definition schema; functional option for markdown vs plain text messages |
| Pagination paging shape | inferred | Gotify API returns paging metadata alongside messages array |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gotify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only