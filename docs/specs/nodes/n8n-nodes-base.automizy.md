---
type: n8n-nodes-base.automizy
displayName: Automizy
category: Action
versions: [1]
priority: low
status: specced
---

# Automizy

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.automizy.md | Public docs only (404 — removed/never published) |

Public n8n documentation for this node returns 404. The node type string exists in the npm registry for `n8n-nodes-base` but no JSON descriptor is present in the published package. This node is believed to have been removed. The spec below is based on the known Automizy (acquired by SendGrid/Twilio) marketing automation REST API.

## Wire format

- **Type string:** `n8n-nodes-base.automizy`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `automizyApi` (API token — apiKey string)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | true | — | Selects the API resource: `contact`, `list`, `email`, `tag` |
| operation | string | create | true | — | Depends on resource; includes create/update/get/getAll/delete |
| email | string | — | conditional | resource=contact, operation=create/update | Contact email address |
| listId | string | — | conditional | resource=contact, operation=create/update | Target list ID for the contact |
| firstName | string | — | false | resource=contact | Contact first name |
| lastName | string | — | false | resource=contact | Contact last name |
| customFields | object | {} | false | resource=contact | Key-value pairs for custom contact fields |
| tagIds | array | [] | false | resource=contact | Tags to apply to the contact |
| additionalFields | object | {} | false | — | Implementation-specific extra parameters passed to the API body |

## Runtime behavior

### Input

The node processes each input item independently. For operations that create or update a contact, input data may be mapped directly to parameters via expressions.

### Output

Each input item produces one output item. The output JSON contains the API response body from the Automizy REST API, including the created/updated contact object with its `id`, `email`, and any additional fields returned by the server.

### Errors

- Authentication failures (invalid/missing apiKey) – throw `NodeOperationError`
- API rate-limit or server errors – throw with the HTTP status from the Automizy API
- Missing required parameters (e.g. `email` for contact create) – throw `NodeOperationError`
- `continueOnFail` — when enabled, errored items are replaced with `{ error: <message>, json: {} }` and execution continues

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: create contact

**Given** input items:

```json
[{ "json": { "email": "test@example.com", "firstName": "John" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "email": "={{ $json.email }}",
  "firstName": "={{ $json.firstName }}",
  "listId": "abc123"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "contact-uuid",
    "email": "test@example.com",
    "firstName": "John",
    "status": "active"
  }
}]
```

Fields other than `id` and `email` may vary depending on the Automizy API response. Verify the node returns a well-formed contact object with at least `id` and `email`.

### Test: list contacts

**Given** input items:

```json
[{ "json": { "listId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "getAll",
  "listId": "={{ $json.listId }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "contacts": []
  }
}]
```

Verify the node returns a paginated list of contacts for the given list, or an empty `contacts` array if none exist.

### Test: missing email throws

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create"
}
```

**Expect** `NodeOperationError` to be thrown: required parameter `email` is missing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node existence | inferred | Type string confirmed in npm registry; all other details reconstructed from the known Automizy REST API |
| Resources/operations | inferred | Contact, List, Email, Tag resources are standard for email marketing platforms |
| Credential type | inferred | `automizyApi` with API-key parameter |
| Exact parameter names | unknown | Public docs page returns 404 |
| Authentication semantics | inferred | SendGrid/Twilio acquisition may have changed the auth model |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.automizy.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
