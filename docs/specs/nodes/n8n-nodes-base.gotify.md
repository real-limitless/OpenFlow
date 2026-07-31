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
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotify/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gotify/ | Public docs only |
| https://gotify.net/docs/pushmsg | Third-party service docs |
| https://gotify.net/api-docs | Third-party service docs |

## Wire format

- **Type string:** `n8n-nodes-base.gotify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gotifyApi` (App API Token for create, Client API Token for delete/getAll)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `message` | yes | — | Only resource; always `message` |
| operation | options | `create` | yes | — | `create` · `delete` · `getAll` |
| messageId | number | — | yes | operation = `delete` | ID of the message to delete |
| title | string | — | no | operation = `create` | Message title (optional; Gotify API accepts empty) |
| text | string | — | yes | operation = `create` | Message body; required by Gotify API |
| priority | number | — | no | operation = `create` | Message priority (integer); controls client notification behavior (e.g. Android sound on >= 5) |
| options.limit | number | — | no | operation = `getAll` | Maximum number of messages to return |
| options.since | number | — | no | operation = `getAll` | Return only messages with ID greater than this value |

## Runtime behavior

### Input processing

Each input item is processed independently. The node performs the chosen operation for every item and collects results.

### Output shape

**Operation `create`:** Returns the created message object from the Gotify API response wrapped in `{ json: ... }`:

```json
{
  "json": {
    "id": 1,
    "appid": 1,
    "message": "hello",
    "title": "my title",
    "priority": 5,
    "date": "2024-01-01T12:00:00Z"
  }
}
```

**Operation `delete`:** Returns the input item unchanged (pass-through) on success. No response body is expected from the API.

**Operation `getAll`:** Returns an array of message objects. Each message object is emitted as a separate output item:

```json
{
  "json": {
    "id": 1,
    "appid": 1,
    "message": "hello",
    "title": "my title",
    "priority": 5,
    "date": "2024-01-01T12:00:00Z"
  }
}
```

### Errors

- HTTP 4xx/5xx responses from the Gotify API cause the node to throw an error, unless `continueOnFail` is enabled.
- When `continueOnFail` is true, the node outputs `[{ json: { error: <message> } }]` on the same (only) output branch.
- Authentication failures (wrong token type for operation) produce a clear error message.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: create a message

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "create",
  "title": "Test Title",
  "text": "Test body",
  "priority": 5
}
```

**Expect** the output[0] to contain a single item whose `json.id` is a positive integer, `json.message` equals `"Test body"`, `json.title` equals `"Test Title"`, and `json.priority` equals `5`.

### Test: delete a message

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": 1
}
```

**Expect** the output[0] to contain the same input item unchanged (pass-through).

### Test: get all messages (empty)

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "getAll"
}
```

**Expect** the output[0] to contain one item per message returned by the API. If no messages exist, the output is an empty array.

### Test: get all messages with limit

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "getAll",
  "options": {
    "limit": 5
  }
}
```

**Expect** no more than 5 items in output[0], each with `json.id`, `json.message`, `json.title`, `json.priority`, and `json.date`.

### Test: error on invalid credentials

**Given** an invalid App API Token and:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "create",
  "text": "should fail"
}
```

**Expect** the node to throw an error whose message includes "401" or "Unauthorized" (or equivalent). When `continueOnFail: true`, expect `[{ json: { error: <message> } }]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource list | Public docs | Message is the only resource |
| Operations list | Public docs | Create, Delete, GetAll confirmed |
| Credential token types | Public docs + Gotify docs | App token for create, Client token for delete/getAll |
| API endpoint paths | inferred from Gotify API docs | POST /message, DELETE /message/{id}, GET /message |
| Response shape | inferred from Gotify API docs | Standard Gotify message object with id, appid, message, title, priority, date |
| Pagination (limit/since) | inferred from Gotify API docs | Standard Gotify query parameters |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gotify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only