---
type: n8n-nodes-base.vero
displayName: Vero
category: Communication
versions: [1]
priority: medium
status: missing
---

# Vero

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.vero/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/vero/ | Public docs only |
| https://developers.getvero.com/track-api-reference/#/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.vero`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `veroApi` — API auth token (Auth Token or Tracking API Key from the Vero project settings)

## Parameters

Two resources: **User** and **Event**.

### User resource

| operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| createOrUpdate | id | string | conditional | User's unique identifier; required unless `email` is provided |
| createOrUpdate | email | string | conditional | User's email address; required unless `id` is provided |
| createOrUpdate | data | object | no | Freeform key/value properties to store on the user profile. Reserved keys: `language`, `timezone`, `userAgent` |
| createOrUpdate | extras | object | no | Reserved: `created_at` (ISO 8601 timestamp to reject stale data), `update_only` (`"true"` to skip creation if user missing) |
| alias | id | string | required | Current user ID |
| alias | newId | string | required | New identifier to merge into |
| unsubscribe | id | string | required | User ID to globally unsubscribe |
| resubscribe | id | string | required | User ID to globally resubscribe |
| delete | id | string | required | User ID to permanently delete |

### Tags sub-resource

| operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| addTags | id | string | required | User ID |
| addTags | tags | string[] | required | Tags to add to the user profile |
| removeTags | id | string | required | User ID |
| removeTags | tags | string[] | required | Tags to remove from the user profile |

### Event resource

| operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| track | identity.id | string | conditional | User ID; required unless `identity.email` is provided |
| track | identity.email | string | conditional | User email; required unless `identity.id` is provided |
| track | eventName | string | required | Event name (<255 chars). Case/underscore normalized by Vero |
| track | data | object | no | Freeform key/value properties to associate with the event |
| track | extras | object | no | Reserved: `created_at` (ISO 8601), `source` (string) |

## Runtime behavior

### Input

Each input item drives one API call. The executor selects the Vero Track API endpoint (POST/PUT to `https://api.getvero.com/api/v2`) based on the chosen resource + operation pair. The `auth_token` query parameter is populated from the credential.

### Output

For every successful API call, the output item emits a `json` object mirroring the Vero API success response: `{ status: 200, message: "Success." }`. The input item's other properties are passed through unchanged.

### Errors

Non-2xx responses trigger an error message with the HTTP status and Vero's error message body. The standard `continueOnFail` option applies: when enabled, the failing item is returned with an `error` property on the `json` object and execution continues.

### Expressions

All parameters that accept user input (`id`, `email`, `newId`, `tags[]`, `data.*`, `extras.*`, `eventName`, `identity.*`) support expression strings.

## Acceptance tests

### Test: create or update a user

**Given** input items:

```json
[{ "json": { "id": "usr_1000", "email": "alice@example.com", "firstName": "Alice" } }]
```

**Parameters:** resource=User, operation=createOrUpdate, id={{ $json.id }}, email={{ $json.email }}, data={ firstName: {{ $json.firstName }} }

**Expect** the executor POSTs to `https://api.getvero.com/api/v2/users/track` with body containing `id: "usr_1000"`, `email: "alice@example.com"`, `data: { first_name: "Alice" }`. Output `json` contains `{ status: 200, message: "Success." }`.

### Test: track an event for a user

**Given** input items:

```json
[{ "json": { "id": "usr_1000", "event": "Purchased Item", "sku": "TSHIRT-RED" } }]
```

**Parameters:** resource=Event, operation=track, identity.id={{ $json.id }}, eventName={{ $json.event }}, data={ sku: {{ $json.sku }} }

**Expect** the executor POSTs to `https://api.getvero.com/api/v2/events/track` with body containing an `identity` object (`id: "usr_1000"`), `event_name: "Purchased Item"`, and `data: { sku: "TSHIRT-RED" }`. Output `json` is the success envelope.

### Test: unsubscribe a user

**Given** input items:

```json
[{ "json": { "id": "usr_1000" } }]
```

**Parameters:** resource=User, operation=unsubscribe, id={{ $json.id }}

**Expect** the executor POSTs to `https://api.getvero.com/api/v2/users/unsubscribe` with body `{ id: "usr_1000" }`. Output `json` contains `{ status: 200, message: "Success." }`.

### Test: add tags to a user profile

**Given** input items:

```json
[{ "json": { "id": "usr_1000", "newTags": ["prospect", "trial"] } }]
```

**Parameters:** resource=User, operation=addTags, id={{ $json.id }}, tags={{ $json.newTags }}

**Expect** the executor PUTs to `https://api.getvero.com/api/v2/users/tags/edit` with body `{ id: "usr_1000", add: ["prospect", "trial"] }`. Output `json` contains the success envelope.

### Test: alias (reidentify) a user

**Given** input items:

```json
[{ "json": { "id": "usr_1000", "newId": "usr_2000" } }]
```

**Parameters:** resource=User, operation=alias, id={{ $json.id }}, newId={{ $json.newId }}

**Expect** the executor PUTs to `https://api.getvero.com/api/v2/users/reidentify` with body `{ id: "usr_1000", new_id: "usr_2000" }`. Output `json` contains the success envelope.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | documented | n8n public docs list 7 user ops + 1 event op; each maps to a well-documented Vero Track API endpoint |
| Parameter shapes | documented | Vero Track API docs provide full OpenAPI specs for every endpoint |
| Credentials | documented | n8n docs describe API auth token; Vero docs confirm `auth_token` query parameter |
| Response shape | documented | Vero Track API returns `{ status, message }` for all endpoints |
| Error handling | inferred | Standard n8n node error pattern; Vero returns 4xx/5xx with `{ status, message }` |
| Deduplication | documented | Vero Track API deduplicates identical events within 5-minute window; documented in Vero docs |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.vero.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
