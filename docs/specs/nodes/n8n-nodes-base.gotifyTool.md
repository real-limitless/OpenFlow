---
type: n8n-nodes-base.gotifyTool
displayName: Gotify Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Gotify (AI Tool)

An AI agent tool variant of the Gotify node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Pushes, deletes, and retrieves messages from a self-hosted Gotify server.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotify.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gotify.md | Public docs only |
| https://gotify.net/docs/pushmsg | External API reference |
| https://gotify.net/api-docs | External API reference |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.gotifyTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gotifyApi` (required) — API token with server URL (app token for create; client token for delete/getAll)

## Parameters

The node exposes an operation selector. Operation-specific fields appear based on the selected operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Operation (required)

| Value | Label | Description |
|-------|-------|-------------|
| `create` | Create | Push a new notification message |
| `delete` | Delete | Delete an existing message by ID |
| `getAll` | Get All | Retrieve all messages with optional pagination |

### Create parameters

Shown when `operation = create`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `message` | string | yes | — | The message body text to send |
| `additionalFields.title` | string | no | — | Optional message title |
| `additionalFields.priority` | number | no | 0 | Message priority (0–10); higher values give notifications higher precedence on the client |
| `options.contentType` | options | no | `text/plain` | Content type: `text/plain` or `text/markdown` |

### Delete parameters

Shown when `operation = delete`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `messageId` | number | yes | — | The numeric ID of the message to delete |

### Get All parameters

Shown when `operation = getAll`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `limit` | number | no | 20 | Max results to retrieve (used unless `returnAll` is true) |
| `returnAll` | boolean | no | false | If true, retrieves all messages ignoring `limit` |

## Runtime behavior

### Input

Each input item is processed independently. For `create` and `delete`, one API call is made per item. For `getAll`, a single API call retrieves the message list and the result is attached to every input item.

### Output

- **create:** Returns the created message object from the Gotify API (`{ id, appid, message, title, priority, date, extras }`).
- **delete:** Returns a success acknowledgment. The output item contains the original input merged with `{ success: true }`.
- **getAll:** Returns an array of message objects under the `messages` key. Each output item receives the full response shape `{ messages: [...], paging: {...} }`.

### API endpoints

- create: `POST /message` with `X-Gotify-Key: <appToken>`, body `{ message, title?, priority?, extras? }`
- delete: `DELETE /message/{messageId}` with `X-Gotify-Key: <clientToken>`
- getAll: `GET /message` with `X-Gotify-Key: <clientToken>`, query `{ limit?, since? }`

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target operation at inference time
- Populating `message`, `messageId`, `title`, `priority`, `limit`, and `contentType` from model-generated values
- Providing clear descriptions for each parameter to guide model selection

### Errors

- Non-2xx responses from the Gotify server throw an `ApiError` with the status code and response body.
- If `continueOnFail` is enabled on the node, the failing item is returned with `error` property and processing continues.
- Missing required parameters (`message` for create, `messageId` for delete) throw before making the HTTP call.

### Expressions

All string and number parameters (`message`, `title`, `priority`, `messageId`, `limit`, `contentType`) support expressions.

### Credential requirements

- **App API Token** — sufficient for the `create` operation.
- **Client API Token** — required for `delete` and `getAll` operations.
- The credential also stores the Gotify server **URL** and an optional **Ignore SSL Issues** flag.

## Acceptance tests

### Test: agent pushes a notification with title and priority

**Given** a connected AI agent that decides to push a notification.

**Parameters:** operation `create`, message `"Server disk space low"`, additionalFields.title `"Alert"`, additionalFields.priority `8`.

**Expect:** output[0] contains a JSON object with `id` (number), `message` ("Server disk space low"), `title` ("Alert"), `priority` (8), and `appid` (number).

### Test: agent deletes a message by ID

**Given** a connected AI agent that decides to delete a message.

**Parameters:** operation `delete`, messageId `42`.

**Expect:** output[0].json has `success: true`.

### Test: agent retrieves all messages

**Given** a connected AI agent that decides to retrieve messages.

**Parameters:** operation `getAll`, returnAll `true`.

**Expect:** output[0].json has `messages` (array) and `paging` (object).

### Test: agent decides operation at inference time

**Given** a connected AI agent with a `$fromAI()` compatible gotifyTool node.

**Parameters:** operation and message fields not set — left for the model to populate.

**Expect:** the agent selects an operation, fills required parameters, and the node produces a successful output.

### Test: continue on fail — invalid server URL

**Given** an input item and misconfigured credentials (unreachable Gotify server).

**Parameters:** operation `create`, message `"test"`.

**Node config:** `continueOnFail = true`

**Expect:** output[0] contains an item with `{ error: ... }` instead of throwing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`gotifyTool`) | inferred | Follows the `<base>Tool` naming convention for tool variants confirmed in other tool specs |
| Operations (3) | documented | Shared with base Gotify node: create, delete, getAll |
| Credentials | documented | `gotifyApi` API-token credential confirmed by public n8n docs; app token vs client token split documented |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs |
| Parameters and response shape | documented | Shared with base Gotify node spec; confirmed by gotify.net API docs |
| No dedicated tool docs page | inferred | The `gotifyTool` type has no separate docs.n8n.io page — it's the base node exposed as tool with `usableAsTool: true` |
| Gotify REST API contract | documented | Public gotify.net API docs confirm endpoints, auth, and message shape |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/gotifyTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
