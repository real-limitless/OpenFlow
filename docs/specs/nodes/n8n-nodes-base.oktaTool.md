---
type: n8n-nodes-base.okta
displayName: Okta
category: Development
versions: [1]
priority: medium
status: specced
---

# Okta Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.okta/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/okta/ | Public docs only |
| https://developer.okta.com/docs/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.okta`  
  (Tool variant loaded by the same type string; AI-agent context activates `$fromAI()` support.)
- **Aliases:** `authentication`, `users`, `Security`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `oktaApi` — SSWS API access token + base URL

### Credential fields

| name | type | required | notes |
|------|------|----------|-------|
| url | string | yes | Okta org base URL (e.g. `https://dev-123456.okta.com`) |
| accessToken | string | yes | SSWS API token created in Security > API > Tokens |

Authentication: `SSWS <token>` via the `Authorization` header.

## Parameters

Single resource **User** with 5 operations.

### User

| parameter | type | required | display options | notes |
|-----------|------|----------|-----------------|-------|
| resource | fixed: "user" | yes | — | Always "user" for this node |
| operation | enum | yes | resource = user | One of: create, delete, get, getAll, update |
| userId | string | yes* | operation ∈ {delete, get, update} | Okta user ID (obtained from Okta API or prior output) |
| returnAll | boolean | — | operation = getAll | If true, paginate through all results; if false, use limit |
| limit | number | — | operation = getAll, returnAll = false | Max number of records (default varies, typically 50–100) |
| options | object | — | operation = create, update | See below |

#### Create/Update options (high-level)

The create and update operations accept an options object containing user profile fields that map to the Okta User Profile schema. At minimum, create requires `firstName`, `lastName`, `email`, and `login`. Update requires `userId` and at least one writable profile field.

Fields that may be set: `firstName`, `lastName`, `email`, `login`, `displayName`, `city`, `countryCode`, `department`, `manager`, `managerEmail`, `organization`, `site`, `startDate`, `timezone`, `title`, `userType`, and other custom schema attributes supported by the target Okta org.

The create operation additionally supports setting `activate` (boolean, default true) and `password` (string) for immediate activation or password assignment.

## Runtime behavior

### Input

Input items are passed through with no structural transformation. Each item's `json` payload may reference node parameters via expressions. The tool variant (`oktaTool`) additionally exposes `$fromAI()` for AI-agent parameter injection.

### Output

Each operation emits one output item per API result on `main[0]`.

- **get / getById** — outputs the Okta user object with `id`, `status`, `created`, `lastUpdated`, `profile` (object with firstName, lastName, email, login, etc.), `credentials`, `type`, `_links`.
- **getAll** — outputs an array of user objects (same shape as above) with pagination support.
- **create** — outputs the newly created Okta user object.
- **update** — outputs the updated Okta user object.
- **delete** — passes input items through unchanged (success means the user was deleted).

### Errors

- **404** (user not found) — thrown as a non-retryable error unless `continueOnFail` is set.
- **400** (validation) — thrown if required profile fields are missing or invalid.
- **409** (conflict) — thrown if attempting to create a user with a login that already exists.
- **Rate limiting** — standard Okta API rate-limit handling; the node does not implement automatic retry.
- **`continueOnFail`** — when enabled, failed items emit an `error` property on the item JSON instead of throwing.

### Expressions

All string parameters accept expression syntax (`={{ }}`). The tool variant supports `$fromAI()` for dynamic parameter population in AI-agent workflows.

## Acceptance tests

### Test: create and get a user

**Given** input items:
```json
[{
  "json": {
    "email": "jane.doe@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "login": "jane.doe@example.com"
  }
}]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "options": {
    "activate": false
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<okta-user-id>",
    "status": "STAGED",
    "profile": {
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com",
      "login": "jane.doe@example.com"
    },
    "created": "<ISO-timestamp>"
  }
}]
```

Then with `operation: "get"` and `userId: "<okta-user-id>"`, verify the returned object matches `status: "STAGED"` and the same profile fields.

### Test: get all users with pagination

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": false,
  "limit": 25
}
```

**Expect** output[0]:
```json
[{
  "json": [
    { "id": "<user-1>", "profile": { "email": "..." } },
    { "id": "<user-2>", "profile": { "email": "..." } }
  ]
}]
```

The array length must not exceed `limit`. Each element must contain `id`, `status`, and `profile`.

### Test: delete existing user

**Parameters:**
```json
{
  "resource": "user",
  "operation": "delete",
  "userId": "<existing-user-id>"
}
```

**Expect** output[0] passes input items through unchanged. Subsequent `get` with the same userId throws a 404 error (or `continueOnFail` item with error status).

### Test: create user missing required fields (error)

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "options": {
    "firstName": "NoEmail"
  }
}
```

**Expect** execution to throw an error (400 Bad Request) — the Okta API rejects users without `email` and `login`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| User profile fields | documented | Public docs list 5 operations but not every field. Profile field set inferred from published schema JSON (Okta Users API). |
| Create activate/password | inferred | Okta Users API docs confirm these are standard creation parameters. |
| Pagination behavior | inferred | Standard Okta `/api/v1/users?limit=N` with optional `after` cursor. Public n8n doc confirms `returnAll` + `limit`. |
| `$fromAI()` support | documented | Standard for all `*Tool` node variants in n8n. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/okta.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
