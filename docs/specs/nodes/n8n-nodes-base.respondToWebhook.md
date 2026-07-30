---
type: n8n-nodes-base.respondToWebhook
displayName: Respond to Webhook
category: Actions
versions: [1, 1.1, 1.2, 1.3, 1.4, 1.5]
priority: high
status: specced
---

# Respond to Webhook

Controls the HTTP response sent back to an incoming webhook request. Pairs with
a Webhook trigger whose **Respond** setting is **Using 'Respond to Webhook'
Node** (i.e. `responseMode = responseNode`).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/ | Public docs only |
| Public descriptor metadata (n8n-nodes-base package, parameter names/enums/defaults only) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.respondToWebhook`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (default), or `main` × 2 when response output branch is enabled
- **Credentials:** `jwtAuth` (required when `respondWith = jwt`)

### Output branches

| Index | Label | Content |
|-------|-------|---------|
| 0 | Input Data | The node's input items, passed through unchanged |
| 1 | Response (optional) | `[{ "json": { "response": { "body", "headers", "statusCode" } } }]` |

The second output branch is enabled when:
- Node version is `1.3` (always two outputs), **or**
- Node version ≥ `1.4` **and** the node setting `enableResponseOutput` is `true`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `enableResponseOutput` | boolean | `false` | no | `@version >= 1.4`; isNodeSetting | Enables the second output branch containing the response object |
| `respondWith` | options | `firstIncomingItem` | yes | — | What data to return. Options below. |
| `redirectURL` | string | `""` | yes | `respondWith = redirect` | URL to redirect to; `validateType: url` |
| `responseBody` | json | `'{\n  "myField": "value"\n}'` | no | `respondWith = json` | JSON response body |
| `responseBody` | string | `""` | no | `respondWith = text` | Text response body (sent as `text/html` by default) |
| `payload` | json | `'{\n  "myField": "value"\n}'` | no | `respondWith = jwt`; `validateType: object` | Payload to include in the JWT token |
| `responseDataSource` | options | `automatically` | no | `respondWith = binary` | `automatically` or `set` |
| `inputFieldName` | string | `data` | yes | `respondWith = binary` + `responseDataSource = set` | Name of the input binary field |
| `options` | collection | `{}` | no | — | Optional response settings (below) |
| `options.responseCode` | number | `200` | no | — | HTTP status code; range 100–599 |
| `options.responseHeaders` | fixedCollection | `{}` | no | — | `entries[]` of `{ name, value }` pairs |
| `options.responseKey` | string | `""` | no | `/respondWith in [allIncomingItems, firstIncomingItem]` | Wraps the response data under this field name |
| `options.enableStreaming` | boolean | `true` | no | `/respondWith in [allIncomingItems, firstIncomingItem, text, json, jwt]` + `@version >= 1.5` | Streams the response; requires trigger configured with Streaming response mode |

### `respondWith` enum

| Display name | Value | Description |
|--------------|-------|-------------|
| All Incoming Items | `allIncomingItems` | Respond with all input JSON items |
| Binary File | `binary` | Respond with a binary file from input data |
| First Incoming Item | `firstIncomingItem` | Respond with the first input JSON item (default) |
| JSON | `json` | Respond with a custom JSON body |
| JWT Token | `jwt` | Respond with a signed JWT |
| No Data | `noData` | Respond with an empty body |
| Redirect | `redirect` | Respond with an HTTP redirect |
| Text | `text` | Respond with text (HTML by default) |

### Version notes

| Version | Change |
|---------|--------|
| 1, 1.1 | Original `respondWith` without `noDataExpression` |
| 1.2+ | `respondWith` gains `noDataExpression: true` |
| 1.1+ | Validates that a Webhook-type trigger exists in the parent chain |
| 1.3 | Always emits two outputs (input + response) |
| 1.4 | Second output gated by `enableResponseOutput` node setting |
| 1.5 | Adds `enableStreaming` option; default version |

## Runtime behavior

### Input

Consumes items from `main` input. **Runs once for the first data item only** —
expressions in `responseBody`, `payload`, and `redirectURL` evaluate against
item index 0. The `allIncomingItems` mode is the exception: it serializes all
input items into the response body.

### Response construction

The node builds a response object `{ body, headers, statusCode }` and delivers
it to the webhook HTTP handler via the execution's response mechanism.

1. **Headers** — collected from `options.responseHeaders.entries`; header names
   are lowercased.
2. **Status code** — `options.responseCode` or `200` default. For `redirect`,
   the default is `307` when `responseCode` is not set.
3. **Body** — depends on `respondWith` (see below).

### Per `respondWith` behavior

| `respondWith` | Body | Notes |
|---------------|------|-------|
| `firstIncomingItem` | First item's `json` | If `options.responseKey` is set, wraps as `{ [responseKey]: items[0].json }` |
| `allIncomingItems` | Array of all item `json` objects | If `options.responseKey` is set, wraps as `{ [responseKey]: [...] }` |
| `json` | Parsed `responseBody` parameter | If the string is invalid JSON, throws "Invalid JSON in 'Response Body' field". If the parameter is already an object, used directly |
| `text` | Raw `responseBody` string | Sent as `text/html` by default; a notice recommends adding a `Content-Type` header |
| `jwt` | `{ token }` | Signs `payload` with `jwtAuth` credential (`keyType`, `secret`/`privateKey`, `algorithm`). Throws "Error signing JWT token" on failure |
| `binary` | Binary data from first item | `responseDataSource=automatically` uses the first binary key; `set` uses `inputFieldName`. Throws "No binary data exists on the first item!" if absent |
| `redirect` | (none) | Sets `Location` header to `redirectURL`; status defaults to `307` |
| `noData` | (none) | Empty body |

### Streaming (v1.5+)

When `options.enableStreaming` is not `false` and the node version ≥ 1.5, the
response is streamed in chunks (begin / item / end). Requires the trigger to be
configured with **Response mode = Streaming**. Binary responses are never
streamed.

### Output

- **Output 0 (Input Data):** the original input items, passed through unchanged.
- **Output 1 (Response):** `[{ "json": { "response": { "body", "headers", "statusCode" } } }]` — present on v1.3 always, or v1.4+ when `enableResponseOutput = true`.

### Chat trigger interaction

When the workflow is started from a Chat Trigger with `responseMode =
responseNodes`, the node sends the response via the Chat Service instead of the
HTTP handler. The response message is extracted from `responseBody.output` /
`.text` / `.message`, falling back to `JSON.stringify`. The execution is put to
wait indefinitely.

### Workflow-level behavior (documented)

| Scenario | Result |
|----------|--------|
| Workflow finishes without executing any Respond to Webhook node | Standard message, HTTP 200 |
| Workflow errors before the first Respond to Webhook executes | Error message, HTTP 500 |
| A second Respond to Webhook executes after the first | Ignored |
| Respond to Webhook executes but there was no webhook trigger | Ignored |

### Validation (v1.1+)

Throws `NodeOperationError` ("No Webhook node found in the workflow") if no
Webhook-type node (`n8n-nodes-base.webhook`, form trigger, chat trigger, or
wait node) exists in the parent chain.

### Errors

- Invalid JSON in `responseBody` (`respondWith = json`) → throws with "Invalid JSON in 'Response Body' field".
- JWT signing failure (`respondWith = jwt`) → throws "Error signing JWT token".
- No binary data (`respondWith = binary`) → throws "No binary data exists on the first item!".
- Unsupported `respondWith` value → throws `The Response Data option "..." is not supported!`.
- No webhook trigger in parent chain (v1.1+) → throws "No Webhook node found in the workflow".
- When `continueOnFail` is active, the node does **not** throw. It returns
  `NodeOutput` (`INodeExecutionData[][]`) with a **single output branch**:
  `[[{ json: { error: message } }]]`. Concretely, `out[0]` is a one-element
  array whose item is `{ json: { error: message } }`; the response output
  branch (output[1]) is **not** emitted, and **no webhook response is stored**
  (the error short-circuits before the response is built). This matches the
  `INodeExecutionData[][]` return shape used by every non-error path — a flat
  `INodeExecutionData[]` is incorrect.

### Expressions

`responseBody` (json), `responseBody` (text), `payload`, and `redirectURL`
accept expressions. **All expressions evaluate against item index 0 only** —
the node does not loop over input items.

## Acceptance tests

### Test: JSON body response

**Given** input items:

```json
[{ "json": { "hello": "world" } }]
```

**Parameters:**

```json
{
  "respondWith": "json",
  "responseBody": "{\n  \"ok\": true\n}"
}
```

**Expect** response delivered to webhook handler:

```json
{
  "body": { "ok": true },
  "headers": {},
  "statusCode": 200
}
```

**Expect** output[0] (input pass-through):

```json
[{ "json": { "hello": "world" } }]
```

### Test: first incoming item (default)

**Given** input items:

```json
[
  { "json": { "id": 1, "name": "alpha" } },
  { "json": { "id": 2, "name": "beta" } }
]
```

**Parameters:**

```json
{
  "respondWith": "firstIncomingItem"
}
```

**Expect** response body:

```json
{ "id": 1, "name": "alpha" }
```

**Expect** `statusCode`: `200`

### Test: redirect with default status

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "respondWith": "redirect",
  "redirectURL": "https://example.com"
}
```

**Expect** response:

```json
{
  "body": null,
  "headers": { "location": "https://example.com" },
  "statusCode": 307
}
```

### Test: text response with custom code and headers

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "respondWith": "text",
  "responseBody": "Workflow completed",
  "options": {
    "responseCode": 202,
    "responseHeaders": {
      "entries": [
        { "name": "Content-Type", "value": "text/plain" },
        { "name": "X-Custom", "value": "abc" }
      ]
    }
  }
}
```

**Expect** response:

```json
{
  "body": "Workflow completed",
  "headers": { "content-type": "text/plain", "x-custom": "abc" },
  "statusCode": 202
}
```

### Test: all incoming items with responseKey

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**

```json
{
  "respondWith": "allIncomingItems",
  "options": {
    "responseKey": "data"
  }
}
```

**Expect** response body:

```json
{
  "data": [{ "id": 1 }, { "id": 2 }]
}
```

### Test: response output branch (v1.4+)

**Given** input items:

```json
[{ "json": { "x": 1 } }]
```

**Parameters:**

```json
{
  "respondWith": "json",
  "responseBody": "{\n  \"ok\": true\n}",
  "enableResponseOutput": true
}
```

**Expect** output[0] (input pass-through):

```json
[{ "json": { "x": 1 } }]
```

**Expect** output[1] (response):

```json
[{ "json": { "response": { "body": { "ok": true }, "headers": {}, "statusCode": 200 } } }]
```

### Test: continueOnFail returns a single-branch error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "respondWith": "json",
  "responseBody": "{ not valid"
}
```

**With** `continueOnFail = true`:

**Expect** `out` is `INodeExecutionData[][]` with one output branch:

```json
[[{ "json": { "error": "Invalid JSON in 'Response Body' field" } }]]
```

- `out[0]` is a one-element array (`out[0].length === 1`).
- `out[0][0].json.error` matches `/Invalid JSON in 'Response Body' field/i`.
- `out[1]` is absent (no response output branch).
- No webhook response is stored for the execution.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| `respondWith` enum values and defaults | documented + descriptor | Docs list all 8 options; descriptor confirms exact wire values and `firstIncomingItem` default |
| Redirect default status 307 | inferred | Observable from descriptor metadata; docs do not state the default explicitly |
| Header name lowercasing | inferred | Observable behavior; not stated in public docs |
| Chat trigger `responseNodes` interaction | inferred | Observable from descriptor; docs do not describe this path |
| Streaming chunk protocol (begin/item/end) | inferred | Observable from descriptor; docs only mention "Enable Streaming" option |
| v1.3 always-two-outputs vs v1.4 gated | inferred | Observable from descriptor version logic |
| `responseKey` wrapping with lodash `set` | inferred | Observable from descriptor; docs mention "Put Response in Field" but not the wrapping mechanism |
| HTML iframe wrapping (security) | documented | Docs describe iframe sandboxing since n8n 1.103.0; this is an engine-level concern, not the node itself |
| `noDataExpression` on v1.2+ `respondWith` | inferred | Descriptor metadata only |
| `continueOnFail` output shape | inferred | Docs do not describe continueOnFail. Contract fixed in cycle 2: single-branch `[[{ json: { error } }]]` (`INodeExecutionData[][]`), no response branch, no stored webhook response — matches the engine `NodeOutput` type used by all other return paths |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/respond-to-webhook.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Pairs with:** `n8n-nodes-base.webhook` (`responseMode = responseNode`) — the Webhook trigger holds the HTTP response open until this node calls `sendResponse`.