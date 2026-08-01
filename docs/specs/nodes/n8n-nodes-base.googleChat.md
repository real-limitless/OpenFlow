---
type: n8n-nodes-base.googleChat
displayName: Google Chat
category: Communication
versions: [1]
priority: medium
status: specced
---

# Google Chat

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlechat/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleChat`
- **Aliases:** `human`, `form`, `wait`, `hitl`, `approval`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleChatOAuth2Api` (OAuth2) or Google service account via `googleApi`
- **Categories:** `Communication`, `HITL`

## Parameters

The node is structured as a discriminator pattern: the user selects a **resource** then an **operation** on that resource.

### Member resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `get` | `memberId` | string | Identifier of the membership to retrieve |
| `getAll` | `spaceId` | string | Parent space whose memberships to list |
| `getAll` | `returnAll` | boolean | When true, fetch all memberships; when false, use `limit` |
| `getAll` | `limit` | number | Max memberships to return (used when `returnAll` = false) |

### Message resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `create` | `spaceId` | string | Target space to post the message into |
| `create` | `messageUi.text` | string | Plain text body of the message (used when `jsonParameters` = false) |
| `create` | `messageJson` | object/string | JSON-encoded message body (used when `jsonParameters` = true) |
| `create` | `jsonParameters` | boolean | Toggle between structured UI fields and raw JSON input |
| `create` | `additionalFields.requestId` | string | Optional request ID for idempotent creation |
| `get` | `messageId` | string | Identifier of the message to retrieve |
| `delete` | `messageId` | string | Identifier of the message to delete |
| `update` | `messageId` | string | Identifier of the message to update |
| `update` | `updateFieldsUi.text` | string | New text body (used when `jsonParameters` = false) |
| `update` | `updateFieldsJson` | object/string | JSON-encoded update body (used when `jsonParameters` = true) |
| `update` | `jsonParameters` | boolean | Toggle between structured UI fields and raw JSON input |
| `sendAndWait` | `spaceId` | string | Target space for the interactive message |
| `sendAndWait` | `message` | string | Message text to send |
| `sendAndWait` | `responseType` | enum: `approval`, `freeText`, `customForm` | Type of interactive response to collect |
| `sendAndWait` | `approvalOptions.approvalType` | enum: `single`, `double` | Single approve button, or approve + disapprove |
| `sendAndWait` | `approvalOptions.approveLabel` | string | Custom label for the approve button |
| `sendAndWait` | `approvalOptions.disapproveLabel` | string | Custom label for the disapprove button |
| `sendAndWait` | `defineForm` | enum: `fields`, `json` | How to define custom form fields |
| `sendAndWait` | `formFields[]` | array | Array of form element definitions (fieldName, fieldLabel, fieldType, placeholder, defaultValue, requiredField, etc.) |
| `sendAndWait` | `jsonOutput` | object/string | JSON-encoded form definition (used when `defineForm` = `json`) |
| `sendAndWait` | `options.limitWaitTime` | interval/wall-time | Auto-resume after this duration |
| `sendAndWait` | `options.appendAttribution` | boolean | Whether to append "Sent via n8n" attribution |
| `sendAndWait` | `options.messageButtonLabel` | string | Label for the message action button |
| `sendAndWait` | `options.responseFormTitle` | string | Title for the response form |
| `sendAndWait` | `options.responseFormDescription` | string | Description for the response form |
| `sendAndWait` | `options.responseFormButtonLabel` | string | Label for the form submit button |
| `sendAndWait` | `options.responseFormCustomCss` | string | Custom CSS for the response form |

### Space resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `get` | `spaceId` | string | Identifier of the space to retrieve |
| `getAll` | `returnAll` | boolean | When true, fetch all spaces; when false, use `limit` |
| `getAll` | `limit` | number | Max spaces to return (used when `returnAll` = false) |

## Runtime behavior

### Input

The node processes each input item independently. For read operations (get/getAll), the item's JSON data may supply parameter values via expressions.

### Output

Each operation produces one output item per input item, with the Google Chat API response body placed in `json`:

- **Message create/get**: Returns the created or retrieved message resource (`{ name, text, sender, space, ... }`)
- **Message delete**: Returns the API response (typically empty body or a success indicator)
- **Message update**: Returns the updated message resource
- **Message sendAndWait**: Returns the sent message resource, including interactive card data. The wait/pause lifecycle is handled externally by the workflow engine (cycle-1: send-only stub; does not implement pause/resume).
- **Member get/getAll**: Returns membership resource(s) (`{ name, state, member, role, ... }`)
- **Space get/getAll**: Returns space resource(s) (`{ name, displayName, spaceType, ... }`)

### Errors

- API errors (auth failure, resource not found, rate limits, permission denied) throw an error that the workflow engine handles according to `continueOnFail`.
- Invalid parameters (missing required `spaceId` or `messageId`) throw before the API call.

### Expressions

All string/number/boolean parameters accept n8n expression strings.

## Acceptance tests

### Test: message create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "create",
  "spaceId": "spaces/AAA",
  "messageUi": { "text": "Hello from OpenFlow" }
}
```

**Expect** output[0].json to contain a `name` field starting with `"spaces/AAA/messages/"` and a `text` field equal to `"Hello from OpenFlow"`.

### Test: message get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "get",
  "messageId": "spaces/AAA/messages/BBB"
}
```

**Expect** output[0].json to contain `name` equal to `"spaces/AAA/messages/BBB"`.

### Test: member getAll with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "member",
  "operation": "getAll",
  "spaceId": "spaces/AAA",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain a `memberships` array (or a paginated list response per the Google Chat API) with at most 10 entries.

### Test: space getAll

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "space",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0].json to contain a `spaces` array.

### Test: sendAndWait (send-only stub, cycle-1)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "spaceId": "spaces/AAA",
  "message": "Approve this?",
  "responseType": "approval"
}
```

**Expect** output[0].json to contain the sent message resource (`name`, `text`). The output must NOT include invented `approved`, `message`, `freeText`, `values`, or `customForm` fields. The test does not assert pause/resume behavior (cycle-1 limitation).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | documented | Public docs list all 3 resources and 8 operations |
| Parameter names and structure | inferred | Extracted from corpus schema definitions — exact OpenFlow mapping may simplify nesting |
| `sendAndWait` interactive lifecycle | documented | Public docs describe response types and limit wait; OpenFlow cycle-1 implements send-only without pause/resume |
| Credential setup | documented | Service account recommended; OAuth2 also supported |
| API response shapes | inferred | Exact Google Chat API shape depends on chat API version; spec describes at outcome level only |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleChat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Cycle-1 scope:** All operations listed above. `sendAndWait` implemented as send-only stub — no pause/resume, no wait simulation. Returns provider message resource (`name`, `text`, `cards`). Output data does NOT include `approved`, `message`, `freeText`, `values`, or `customForm` fields.