---
type: n8n-nodes-base.iterable
displayName: Iterable
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
usableAsTool: true
---

# Iterable

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.iterable/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/iterable/ | Public docs only |
| https://api.iterable.com/api/docs | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.iterable`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `iterableApi` (required)
  - API Key (`apiKey`, password string)
  - Region (`region`, option: `USDC` → `https://api.iterable.com` / `EDC` → `https://api.eu.iterable.com`)
  - Auth header: `Api_Key` set to the credential value
  - Base URL driven by the selected region; all API paths are under `${region}/api/`

## Parameters

### Resource: `event`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: event, user, userList | user | Y | — | Top-level resource selector |
| operation | options: track | track | Y | resource=event | Single operation |
| name | string | (empty) | Y | resource=event, operation=track | Name of the tracked event |
| additionalFields | collection (see below) | {} | N | resource=event, operation=track | Supplementary event data |

**additionalFields options (collection):**

| name | type | notes |
|------|------|-------|
| campaignId | string | Campaign tied to conversion |
| createdAt | dateTime | Timestamp of event occurrence; converted to Unix epoch |
| dataFieldsUi | fixedCollection (key/value pairs) | Arbitrary key-value event data |
| email | string | User email – either email or userId required |
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
| preferUserId | boolean | true | Y | resource=user, operation=upsert, identifier=userId | Create if doesn't exist |
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
| listId | options (dynamic) | (empty) | Y | resource=userList, operation=add | Loaded via `getLists` method from `/api/lists` |
| identifier | options: email, userId | (empty) | Y | resource=userList, operation=add |  |
| value | string | (empty) | Y | resource=userList, operation=add |  |

**userList → remove:**

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| listId | options (dynamic) | (empty) | Y | resource=userList, operation=remove | Loaded via `getLists` method from `/api/lists` |
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

- `event:track`: Throws `NodeOperationError` if neither email nor userId is provided in additionalFields.
- `user:upsert`: Throws if the API response code is not `"Success"`.
- `user:delete`: Throws if the API response code is not `"Success"`.
- `user:get`: Throws with HTTP 404 if the user is not found.
- All requests: `NodeApiError` wraps any HTTP/connection error from the API.
- `continueOnFail` is respected on user upsert, delete, and get operations.

### Expressions

All `string`, `dateTime`, and `options` parameters accept expressions. The `listId` parameter uses a dynamic load-options method (`getLists`) but also accepts freeform expression overrides.

## Acceptance tests

### Test 1 — event:track with email

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
    "email": "user@example.com",
    "campaignId": "123"
  }
}
```

**Expect** a POST to `/events/trackBulk` with body `{ "events": [{ "eventName": "purchase", "email": "user@example.com", "campaignId": "123" }] }`. Output item contains the API JSON response.

### Test 2 — user:upsert with email

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

**Expect** POST to `/users/update` with `{ "email": "user@example.com" }`. API responds with `{ "code": "Success", "msg": "" }`; output item reflects the response.

### Test 3 — user:delete by userId

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "delete",
  "by": "userId",
  "userId": "abc-123"
}
```

**Expect** DELETE to `/users/byUserId/abc-123`. Output item contains the API response.

### Test 4 — userList:add with dynamic list

**Given** input items:
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
  "value": ""  /* resolved per-item from expression or fixed value */
}
```

**Expect** a single POST to `/lists/subscribe` with body `{ "listId": 42, "subscribers": [{ "email": "a@example.com" }, { "email": "b@example.com" }] }`. All items are batched together.

### Test 5 — user:get fails on missing user

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "get",
  "by": "email",
  "email": "nonexistent@example.com"
}
```

**Expect** GET to `/users/getByEmail?email=nonexistent@example.com`. API returns empty object `{}`. Executor throws `NodeApiError` with message `"User not found"` and HTTP code `404`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Documented | Public docs explicitly list 3 resources with their sub-operations |
| Credential structure | Documented | Public credentials page shows API Key + Region |
| Parameter details | Inferred from corpus | Public docs page only lists operations at high level; parameter names/enums extracted from published JSON descriptor |
| API endpoint mapping | Inferred from corpus | The URL patterns (`/events/trackBulk`, `/users/update`, `/lists/subscribe`) are documented at api.iterable.com |
| Error handling | Inferred from corpus | Behavior (throw on non-"Success" code, 404 on missing user) comes from the node's execute logic |
| Batch behavior | Inferred | `userList:add/remove` batches all items; `event:track` batches all items into a single `events` array |

## OpenFlow mapping

- **Definition group:** `core` | `app`
- **Executor file:** `src/lib/engine/executors/iterable.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
