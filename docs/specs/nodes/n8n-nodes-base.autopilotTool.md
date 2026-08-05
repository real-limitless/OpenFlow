---
type: n8n-nodes-base.autopilotTool
displayName: Autopilot Tool
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Autopilot Tool

AI agent tool variant of the Autopilot node. Exposes the same Autopilot CRM operations as callable tools for an AI agent, with parameters that can be dynamically populated via `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.autopilot.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/autopilot/ | Public docs only |
| https://autopilot.docs.apiary.io/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.autopilotTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `autopilotApi` (API key)

The `autopilotApi` credential requires a single API Key field, generated from Autopilot Settings > Autopilot API.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: contact, contactJourney, contactList, list | contact | yes | — | High-level category of the operation |
| operation | options (depends on resource) | upsert | yes | depends on resource | The specific action to perform |
| email | string | "" | yes (when operation=upsert, resource=contact) | operation=upsert, resource=contact | Contact email address; the primary lookup key for upsert |
| additionalFields | collection | {} | no | various | Per-operation optional fields |

### Resource: Contact

| operation | required params | notes |
|-----------|----------------|-------|
| upsert (Create or Update) | email, optional additionalFields | Upserts a contact by email; additionalFields include Company (string), Custom Fields (key/value pairs), and any other standard contact fields exposed by the Autopilot API |
| delete | — | Deletes a contact identified by input item's `contactId` field |
| get | — | Retrieves a single contact by `contactId` |
| getAll | — | Retrieves all contacts with optional pagination |

### Resource: Contact Journey

| operation | required params | notes |
|-----------|----------------|-------|
| add | — | Adds a contact identified by `contactId` to a journey/list identified by `listId` |

### Resource: Contact List

| operation | required params | notes |
|-----------|----------------|-------|
| add | — | Adds contact to a list |
| check | — | Checks if contact is already on a list |
| getAll | — | Gets all contacts on a list |
| remove | — | Removes contact from a list |

### Resource: List

| operation | required params | notes |
|-----------|----------------|-------|
| create | name | Creates a new list with the given name |
| getAll | — | Retrieves all lists |

### Dynamic field loading

The executor must call Autopilot API endpoints to populate dynamic option lists for custom fields and lists. Referenced API methods:
- `getCustomFields` — retrieves available custom field definitions for the Contact resource
- `getLists` — retrieves available list identifiers
- `getTriggers` — retrieves available trigger event types

### $fromAI() support

As an AI agent tool, all string/collection parameters should accept `$fromAI()` expressions that the AI model can populate dynamically at runtime.

## Runtime behavior

### Input

Each input item represents a single tool invocation. When `executeOnce` is true (tool mode default), only the first item is processed.

### Output

Output items contain the HTTP response body from the Autopilot REST API (https://autopilot.docs.apiary.io/). Response shapes vary per resource/operation:
- Contact upsert: returns the contact object with `contact_id`, `email`, and any additional fields
- Contact delete: returns success confirmation
- Contact get: returns the contact object
- Contact getAll: returns an array of contact objects
- List operations: return list objects or membership status
- Journey operations: return success confirmation

### Errors

- API errors (4xx/5xx from Autopilot) are surfaced as node errors
- Missing required parameters (e.g., upsert without email) produce validation errors
- `continueOnFail` handling: when enabled, failed items are returned with error info instead of halting execution

### Expressions

All string and collection parameters accept expression strings, including `$json`, `$fromAI()`, and standard n8n expressions.

## Acceptance tests

### Test: contact upsert

**Given** input items:

```json
[{ "json": { "email": "test@example.com", "company": "Acme" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "upsert",
  "email": "={{ $json.email }}",
  "additionalFields": { "Company": "={{ $json.company }}" }
}
```

**Expect** output[0] to contain a contact object with `contact_id` and `email` fields matching the input.

### Test: contact get

**Given** input items:

```json
[{ "json": { "contactId": "person_123" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0] to contain a contact object with `contact_id: "person_123"`.

### Test: list all contacts

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "getAll"
}
```

**Expect** output[0] to contain an array of contact objects under the response key.

### Test: create list

**Given** input items:

```json
[{ "json": { "name": "My Newsletter List" } }]
```

**Parameters:**

```json
{
  "resource": "list",
  "operation": "create",
  "name": "={{ $json.name }}"
}
```

**Expect** output[0] to contain a list object with the provided name.

### Test: add contact to journey

**Given** input items:

```json
[{ "json": { "contactId": "person_456", "listId": "list_789" } }]
```

**Parameters:**

```json
{
  "resource": "contactJourney",
  "operation": "add",
  "contactId": "={{ $json.contactId }}",
  "listId": "={{ $json.listId }}"
}
```

**Expect** output[0] to contain a success confirmation for the journey addition.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Specific Autopilot API response shapes | Inferred from API docs | The Autopilot REST API (apiary.io) defines exact response schemas; node passes through API responses |
| Custom fields structure | Inferred from JSON descriptor | Dynamic key/value pairs loaded via `getCustomFields` referenced method |
| $fromAI() behavior | Documented | Standard n8n AI agent tool pattern — all string parameters accept dynamic model-supplied values |
| Exact option enums for sub-operations | Documented | Public docs list all operations per resource; the corpus confirms enums |
| Deprecation notice | Documented | Autopilot has rebranded to Ortto; these nodes work only with the old Autopilot API |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/AutopilotTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
