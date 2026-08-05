---
type: n8n-nodes-base.egoi
displayName: E-goi
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
---

# E-goi

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.egoi/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/egoi/ | Public docs only |
| https://developers.e-goi.com/api/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.egoi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `egoiApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | yes | — | Must be `contact`. |
| operation | string | create | yes | resource = contact | One of: create, get, getAll, update. |
| listId | number | — | yes | resource = contact | Target list ID. Dynamically loaded from E-goi API. |
| email | string | — | conditionally | operation in (create, get, update) | Contact email address; expression-enabled. Required for create, get, update. |
| updateAction | string | — | no | operation = update | One of: replace, append. |
| extraFields | object | — | no | resource = contact | Key-value pairs for subscriber-level custom fields. Dynamic field names loaded from E-goi API by list. |
| tagIds | array[number] | — | no | resource = contact | One or more tag IDs to assign to the contact. Options loaded from E-goi API. |
| options.status | string | active | no | resource = contact | One of: active, inactive, removed, unconfirmed. |
| options.subscribeDate | string | — | no | operation = create | ISO-8601 date string. |
| options.unsubscribeDate | string | — | no | operation = update | ISO-8601 date string. |
| options.confirmationDate | string | — | no | operation = create | ISO-8601 date string. |
| options.firstName | string | — | no | resource = contact | Expression-enabled. |
| options.lastName | string | — | no | resource = contact | Expression-enabled. |
| options.birthDate | string | — | no | resource = contact | ISO-8601 date string. |
| options.phone | string | — | no | resource = contact | Expression-enabled. |
| options.phoneIndicative | string | — | no | resource = contact | Country calling code, e.g. `+1`. |
| options.cellphone | string | — | no | resource = contact | Expression-enabled. |
| options.cellphoneIndicative | string | — | no | resource = contact | Country calling code. |
| returnAll | boolean | false | no | operation = getAll | If false, `limit` is required. |
| limit | number | 50 | no | operation = getAll, returnAll = false | Maximum contacts to return. |

## Runtime behavior

### Input

Each input item is processed independently. The node connects to the E-goi REST API v3 to perform the configured operation on the specified contact list.

### Output

| operation | Output shape |
|-----------|-------------|
| create | The created contact object from the E-goi API response (includes subscriber hash, email, status, etc.) |
| get | The single contact matching `email` within `listId` |
| getAll | An array of contact objects for the given `listId`; respects `returnAll`/`limit` |
| update | The updated contact object from E-goi API after applying changes |
| error | NodeApiError with `continueOnFail` support per n8n conventions |

### Dynamic loading

Three dynamic load functions resolve API-backed option lists:

- **getLists** — Populates the `listId` dropdown with available E-goi mailing lists (value: numeric list ID, name: list name).
- **getExtraFields** — Given a selected `listId`, loads the custom extra fields configured for that list. These appear as a key-value collection.
- **getListTags** — Given a selected `listId`, loads the available tags.

### Expressions

All string parameters accept expression strings. Dynamic-option parameters (listId, extraFields) resolve options server-side but the selected value can also be an expression.

### Errors

- Missing required params (`listId`, `email` for create/get/update) throw `NodeOperationError`.
- API-level errors (auth failure, not found, rate-limit) are wrapped as `NodeApiError`.
- `continueOnFail`: when enabled, errored items produce output items with `json` containing `error` metadata instead of halting.

## Acceptance tests

### Test: create contact

**Given** input items:

```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "listId": 1,
  "email": "={{ $json.email }}",
  "options": {
    "firstName": "Test",
    "lastName": "User"
  }
}
```

**Credentials:** valid `egoiApi` API key

**Expect** output[0]:

```json
[{
  "json": {
    "subscriber_hash": "abc123def456",
    "email": "test@example.com",
    "first_name": "Test",
    "last_name": "User",
    "status": "active",
    "uid": "12345"
  }
}]
```

### Test: get contact by email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "get",
  "listId": 1,
  "email": "test@example.com"
}
```

**Expect** output[0] to contain a single contact object with `subscriber_hash`, `email`, and `status` fields.

### Test: getAll contacts with returnAll

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "getAll",
  "listId": 1,
  "returnAll": true
}
```

**Expect** output[0] to be an array of contact objects. Array length must equal the total contacts in list 1.

### Test: update contact — replace

**Given** input items:

```json
[{ "json": { "newEmail": "updated@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "update",
  "listId": 1,
  "email": "test@example.com",
  "updateAction": "replace",
  "options": { "status": "inactive" }
}
```

**Expect** output[0] to contain a single updated contact. The `email` field in the response must be `updated@example.com` and `status` must be `inactive`.

### Test: missing email on create throws

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "listId": 1
}
```

**Expect** a `NodeOperationError` with a message indicating the email is required. With `continueOnFail: true`, output[0] contains an error-annotated item instead.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Public docs | Contact-only resource with 4 operations confirmed in n8n docs |
| Parameter shapes | Inferred from corpus metadata | Field names (extraFields, tagIds, options sub-structure) confirmed by corpus type declarations; exact option enum values for status inferred from E-goi API v3 |
| Dynamic loading | Confirmed by corpus | Three loadOptions methods: getLists, getExtraFields, getListTags |
| Credential type | Public docs | API key only; no OAuth2 |
| API endpoints | Public E-goi API v3 docs | https://developers.e-goi.com/api/v3/ |
| Error handling | Inferred from n8n conventions | Follows standard n8n NodeApiError / NodeOperationError pattern |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/Egoi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
