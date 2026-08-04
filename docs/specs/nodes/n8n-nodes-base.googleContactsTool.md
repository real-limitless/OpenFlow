---
type: n8n-nodes-base.googleContactsTool
displayName: Google Contacts
category: AI Tool
versions: [1]
priority: high
status: specced
---

# Google Contacts (AI Tool)

A tool variant of the Google Contacts node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Contact resource CRUD operations against the Google People API (the backend service backing Google Contacts).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecontacts.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/people/api/rest/v1/people | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleContactsTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleContactsOAuth2Api` (extends `googleOAuth2Api`; OAuth2 only — Service Account is not supported per the n8n credentials compatibility table)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | Only `oAuth2` is supported for Google Contacts |

### Contact operations

The user selects one of five operations on the Contact resource:

| Operation | Required parameters | Optional parameters |
|-----------|---------------------|---------------------|
| Create | At least one contact field (e.g. name, email, phone) | Additional raw contact fields or structured person data |
| Delete | Contact ID | — |
| Get | Contact ID | Person field mask (comma-separated list of person fields to include in the response; e.g. `names,emailAddresses,phoneNumbers`) |
| Get All | — | Return All (boolean), Max Results, Person field mask, Sort Order, Sync Token |
| Update | Contact ID, ETag, at least one field to update | Additional person fields to update |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The Contact ID parameter can be resolved from expression input or model-provided value
- Optional field masks can be auto-populated by the AI agent when "let model fill" is enabled

## Runtime behavior

### Input

Consumes items from `main` input. For Create and Update operations, contact field values can reference input item properties via expressions.

### Output

All operations produce items on `output[0]`:

- **Create** — returns the created contact person object from the Google People API (`resourceName`, `etag`, person fields per mask)
- **Delete** — returns the original input item (or empty object) confirming deletion
- **Get** — returns the single person object matching the Contact ID, with fields limited by the field mask
- **Get All** — returns an array of person objects; if `returnAll` is false, limited by `maxResults`
- **Update** — returns the updated person object from the API

Output shape follows the Google People API person resource schema:
- `resourceName` (string) — unique person identifier (format: `people/{contactId}`)
- `etag` (string) — entity tag for optimistic concurrency
- `names` (array) — structured name entries (`displayName`, `givenName`, `familyName`, `metadata`)
- `emailAddresses` (array) — email address entries (`value`, `type`, `formattedType`, `metadata`)
- `phoneNumbers` (array) — phone number entries (`value`, `type`, `formattedType`, `canonicalForm`, `metadata`)
- `photos` (array) — profile photo entries (`url`, `default`, `metadata`)
- `metadata` (object) — person metadata including `sources` (which Google service owns the data)

### Errors

- API errors (auth failures, invalid contact IDs, invalid field masks, rate limits, conflicts on stale ETag) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error

### Expressions

All string/boolean/number fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "names": [{ "givenName": "Jane", "familyName": "Doe" }],
  "emailAddresses": [{ "value": "jane.doe@example.com" }]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "resourceName": "people/c12345",
    "etag": "%EgE=",
    "names": [{ "displayName": "Jane Doe", "givenName": "Jane", "familyName": "Doe" }],
    "emailAddresses": [{ "value": "jane.doe@example.com", "type": "work" }]
  }
}]
```

### Test: Get all contacts

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "returnAll": true,
  "personFields": "names,emailAddresses"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "resourceName": "people/c12345",
    "names": [{ "displayName": "Jane Doe" }],
    "emailAddresses": [{ "value": "jane.doe@example.com" }]
  }
}, {
  "json": {
    "resourceName": "people/c67890",
    "names": [{ "displayName": "John Smith" }],
    "emailAddresses": [{ "value": "john.smith@example.com" }]
  }
}]
```

### Test: Get a single contact

**Given** input items:
```json
[{ "json": { "contactId": "c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.contactId }}",
  "personFields": "names,emailAddresses,phoneNumbers"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "resourceName": "people/c12345",
    "names": [{ "displayName": "Jane Doe" }],
    "emailAddresses": [{ "value": "jane.doe@example.com" }],
    "phoneNumbers": [{ "value": "+15551234567" }]
  }
}]
```

### Test: Delete a contact

**Given** input items:
```json
[{ "json": { "contactId": "c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "delete",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0]:
```json
[{ "json": {} }]
```

### Test: Update a contact email

**Given** input items:
```json
[{ "json": { "contactId": "c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "update",
  "contactId": "={{ $json.contactId }}",
  "emailAddresses": [{ "value": "jane.doe@newdomain.com" }],
  "personFields": "emailAddresses"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "resourceName": "people/c12345",
    "etag": "%EgE=",
    "emailAddresses": [{ "value": "jane.doe@newdomain.com" }]
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (Contact CRUD) | documented | Public docs list 5 operations: Create, Delete, Get, Get All, Update |
| $fromAI() dynamic parameter support | documented | Public docs describe the feature for Google Tools category nodes |
| Backend API | documented | Google People API (`people.createContact`, `people.deleteContact`, `people.get`, `people.connections.list`, `people.updateContact`) |
| Person field mask behavior | documented | Google People API requires `personFields` query parameter; this is exposed as the field mask parameter in the node |
| ETag usage for update | inferred | Google People API requires `etag` for update operations to prevent conflicting writes; pattern matches node behavior |
| Exact create/update person data schema | inferred from API docs | The structured person object follows Google People API schema; exact field-path nesting in the node is abstracted here |
| Version differences | inferred | Single version (1.0) for this tool variant |
| Service account support | documented | Google Contacts supports OAuth2 only per credentials compatibility table |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleContactsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
