---
type: n8n-nodes-base.driftTool
displayName: Drift (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Drift (AI Tool)

AI agent tool variant of the Drift node. Wraps the same single Contact resource (create, delete, get, getAll, update contact + get custom attributes) against the Drift REST API at `https://driftapi.com`. When connected to an AI Agent, the model can dynamically populate parameters via `$fromAI()`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.drift.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/drift.md | Public docs only |
| https://devdocs.drift.com/docs/using-drift-apis | Public docs only |
| https://devdocs.drift.com/docs/contact-model | Public docs only |
| https://devdocs.drift.com/docs/creating-a-contact | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.driftTool`
- **Aliases:** `Drift`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `driftApi` (personal access token) or `driftOAuth2Api` (OAuth2)

## Parameters

### Resource

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | contact | required | Fixed to `contact` (single resource) |

### Operations

| operation | required params | optional params | notes |
|-----------|----------------|-----------------|-------|
| create | email | additionalFields (name, phone, externalId, customAttributes) | POST /contacts |
| delete | contactId | — | DELETE /contacts/{contactId} |
| get | contactId | — | GET /contacts/{contactId} |
| getAll | — | simplify (boolean, default false) | GET /contacts paginated |
| update | contactId | additionalFields (same as create) | PATCH /contacts/{contactId} |
| customAttributes | — | — | GET contact custom attribute schema |

### Contact fields (`additionalFields` for create / update)

| name | type | notes |
|------|------|-------|
| name | string | Contact display name |
| phone | string | Contact phone number |
| externalId | string | External system identifier; prevents duplicate contacts with same email |
| customAttributes | object | Free-form key/value map of Drift custom attributes |

### AI tool-specific behavior

- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description are configurable in the AI Agent node
- The tool exposes the Contact resource's full operation set to the agent

## Runtime behavior

### External API contract

The node wraps the Drift REST API at `https://driftapi.com/contacts/*`:

- **Create:** `POST /contacts` — sends `{ "attributes": { email, ... } }`. Requires `email`. Returns `{ "data": { id, createdAt, attributes } }`.
- **Get:** `GET /contacts/{contactId}` — returns the full contact record.
- **Update:** `PATCH /contacts/{contactId}` — sends partial `{ "attributes": ... }`.
- **Delete:** `DELETE /contacts/{contactId}` — returns 204 on success.
- **Get All:** `GET /contacts` — returns paginated results `{ "data": [...], "meta": { "total_count": N } }`.
- **customAttributes:** retrieves the custom attribute definitions for the Drift account.

### Input processing

Each input item processed independently. Missing required parameters throw validation errors before API calls.

### Output

- **Create / Get / Update:** `{ id, createdAt, attributes: { email, name, phone, ... } }` from the `data` payload.
- **Delete:** Echoes `{ id }` of the deleted contact.
- **Get All (simplify=false):** Raw `{ data: [...], meta: { total_count } }`.
- **Get All (simplify=true):** Flat array of contacts from `data`.
- **customAttributes:** Array of custom attribute definitions.

### Errors

- HTTP 4xx/5xx responses from the Drift API surface as node errors with status code and body.
- `continueOnFail` mode wraps errors as `{ json: { error: { message, code } } }` on the output.

### Expressions

All string/number/boolean/enum parameters accept n8n expression syntax. Parameters tagged for AI populatable accept `$fromAI()`.

## Acceptance tests

### Test: create contact via tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "email": "bot@example.com",
  "additionalFields": {
    "name": "Bot",
    "externalId": "ai-ext-001"
  }
}
```

**Expect** output[0].json to contain `id`, `createdAt`, and `attributes.email` equal to `"bot@example.com"`.

### Test: get contact by ID

**Given** input items:
```json
[{ "json": { "contactId": 15811408544 } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0].json to contain `id` equal to `15811408544`.

### Test: delete contact

**Given** input items:
```json
[{ "json": { "contactId": 15811408544 } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "delete",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0].json to contain `{ "id": 15811408544 }`.

### Test: list contacts (simplified)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "simplify": true
}
```

**Expect** output[0].json to be a flat array of contact records.

### Test: missing email on create throws

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

**Expect** node throws a validation error: email is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and parameters | documented | Shares Contact resource with the base Drift node — confirmed in public n8n docs |
| Credential types | documented | `driftApi` (PAT) and `driftOAuth2Api` (OAuth2) — from public credential docs |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| External API contract | documented | Drift devdocs confirm REST endpoints and response shapes |
| customAttributes operation | documented | Listed as separate operation in public n8n docs |
| Tool-specific parameter layout | inferred | Tool variant wraps the standard Drift Contact operations identically in agent context |
| Exact output shape | inferred | Drift API responses vary by operation; functional outcomes are spec'd |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.driftTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
