---
type: n8n-nodes-base.iterableTool
displayName: Iterable Tool
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
usableAsTool: true
---

# Iterable Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.iterable/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/iterable/ | Public docs only |
| https://api.iterable.com/api/docs | Public docs only |

The dedicated `iterableTool` docs page does not exist (returns 404). This spec derives from the base `n8n-nodes-base.iterable` node which is marked `usableAsTool: true`.

## Wire format

- **Type string:** `n8n-nodes-base.iterableTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `iterableApi` (required)
  - API Key (`apiKey`, password string)
  - Region (`region`, option: `USDC` → `https://api.iterable.com` / `EDC` → `https://api.eu.iterable.com`)
  - Auth header: `Api_Key` set to the credential value
  - Base URL driven by the selected region; all API paths are under `${region}/api/`

## Parameters

This node offers the same 3 resources and operations as the base Iterable node, exposed identically for AI agent consumption. All string, number, and options parameters support `$fromAI()` dynamic population.

### Resource: `event`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: event, user, userList | user | Y | — | Top-level resource selector |
| operation | options: track | track | Y | resource=event | Single operation |
| name | string | (empty) | Y | resource=event, operation=track | Name of the tracked event |
| additionalFields | collection | {} | N | resource=event, operation=track | Supplementary event data |

**additionalFields options:**

| name | type | notes |
|------|------|-------|
| campaignId | string | Campaign tied to conversion |
| createdAt | dateTime | Timestamp of event occurrence |
| dataFieldsUi | key/value pairs | Arbitrary key-value event data |
| email | string | User email — either email or userId required |
| id | string | Optional event ID for idempotent updates |
| templateId | string | Template reference |
| userId | string | User ID from prior updateUser call |

### Resource: `user`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | user | Y | — |  |
| operation | options: upsert, delete, get | upsert | Y | resource=user |  |

**user → upsert:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| identifier | options: email, userId | (empty) | Y | resource=user, operation=upsert |  |
| value | string | (empty) | Y | resource=user, operation=upsert | The actual email or userId value |
| preferUserId | boolean | true | N | resource=user, operation=upsert, identifier=userId | Create if doesn't exist |
| additionalFields | collection | {} | N | resource=user, operation=upsert | dataFieldsUi (key/value pairs), mergeNestedObjects (boolean) |

**user → delete:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| by | options: email, userId | email | Y | resource=user, operation=delete |  |
| email | string | (empty) | Y | by=email |  |
| userId | string | (empty) | Y | by=userId |  |

**user → get:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| by | options: email, userId | email | Y | resource=user, operation=get |  |
| email | string | (empty) | Y | by=email |  |
| userId | string | (empty) | Y | by=userId |  |

### Resource: `userList`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | userList | Y | — |  |
| operation | options: add, remove | add | Y | resource=userList |  |

**userList → add:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| listId | options (dynamic) | (empty) | Y | resource=userList, operation=add | Loaded via `getLists` method from `/api/lists`; supports expression override |
| identifier | options: email, userId | (empty) | Y | resource=userList, operation=add |  |
| value | string | (empty) | Y | resource=userList, operation=add |  |

**userList → remove:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| listId | options (dynamic) | (empty) | Y | resource=userList, operation=remove | Loaded via `getLists` method from `/api/lists`; supports expression override |
| identifier | options: email, userId | (empty) | Y | resource=userList, operation=remove |  |
| value | string | (empty) | Y | resource=userList, operation=remove |  |
| additionalFields | collection | {} | N | resource=userList, operation=remove | campaignId (number), channelUnsubscribe (boolean) |

## Runtime behavior

### Input

Each input item is processed independently. For `event:track` and `user:upsert`, each item produces one API call. For `userList:add` and `userList:remove`, all items are batched into a single API call with a `subscribers` array.

### API endpoints

| Resource | Operation | Method | Path |
|----------|-----------|--------|------|
| event | track | POST | `/events/trackBulk` |
| user | upsert | POST | `/users/update` |
| user | delete (by email) | DELETE | `/users/{email}` |
| user | delete (by userId) | DELETE | `/users/byUserId/{userId}` |
| user | get (by email) | GET | `/users/getByEmail?email={email}` |
| user | get (by userId) | GET | `/users/byUserId/{userId}` |
| userList | add | POST | `/lists/subscribe` |
| userList | remove | POST | `/lists/unsubscribe` |

### Output

Each output item contains the JSON response body from the Iterable API. For `user:get`, the response is unwrapped from the `user` envelope property. For all other operations, the raw API JSON is returned.

### Errors

- `event:track`: Throws `NodeOperationError` if neither email nor userId is provided.
- `user:upsert`: Throws if the API response code is not `"Success"`.
- `user:delete`: Throws if the API response code is not `"Success"`.
- `user:get`: Throws with HTTP 404 if the user is not found.
- All requests: `NodeApiError` wraps any HTTP/connection error from the API.
- `continueOnFail` is respected.

### Expressions

All string, dateTime, and options parameters accept expressions. The `listId` parameter uses a dynamic load-options method (`getLists`) but also accepts freeform expression overrides. Additionally, all parameters support `$fromAI()` dynamic population by AI agents.

## Acceptance tests

### Test 1 — event:track via tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "track",
  "name": "purchase",
  "additionalFields": {
    "email": "user@example.com"
  }
}
```

**Expect** a POST to `/events/trackBulk` with body `{ "events": [{ "eventName": "purchase", "email": "user@example.com" }] }`. Output item contains the API JSON response.

### Test 2 — user:upsert via tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "upsert",
  "identifier": "email",
  "value": "user@example.com"
}
```

**Expect** POST to `/users/update` with `{ "email": "user@example.com" }`. Output item reflects the API response.

### Test 3 — userList:add batching

**Given** 2 input items:
```json
[
  { "json": { "email": "a@example.com" } },
  { "json": { "email": "b@example.com" } }
]
```

**Parameters:**
```json
{
  "resource": "userList",
  "operation": "add",
  "listId": 42,
  "identifier": "email",
  "value": ""
}
```

**Expect** a single POST to `/lists/subscribe` with body `{ "listId": 42, "subscribers": [{ "email": "a@example.com" }, { "email": "b@example.com" }] }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool type registration | Inferred | Dedicated docs page returns 404; the base Iterable node is marked `usableAsTool: true` meaning this tool variant shares its operations and parameters identically |
| Credential structure | Documented | Public credentials page shows API Key + Region |
| Resources & operations | Documented | Same 3 resources (event, user, userList) with same operations as base Iterable node |
| Parameter details | Inferred from corpus | Parameter names/enums derived from the base Iterable node's published JSON descriptor |
| API endpoint mapping | Documented | URL patterns at api.iterable.com |
| $fromAI() tool support | Inferred | All tool variants in n8n support `$fromAI()` dynamic parameter population; follows the established pattern of `n8n-nodes-base.{name}Tool` nodes |

## OpenFlow mapping

- **Definition group:** `core` | `app` | `tool`
- **Executor file:** `src/lib/engine/executors/iterableTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
