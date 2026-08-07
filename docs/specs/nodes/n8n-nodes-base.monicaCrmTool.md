---
type: n8n-nodes-base.monicaCrmTool
displayName: Monica CRM Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Monica CRM Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.monicacrm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/monicacrm/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://www.monicahq.com/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.monicaCrmTool`
- **Base node type:** `n8n-nodes-base.monicaCrm`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `monicaCrmApi` (API token + environment selection: Cloud-Hosted or Self-Hosted + domain)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | Activity | yes | — | Activity / Call / Contact / Contact Field / Contact Tag / Conversation / Conversation Message / Journal Entry / Note / Reminder / Tag / Task |
| operation | string | (varies) | yes | — | See operations per resource below |
| activityTypeId | string | — | conditional | resource=Activity, operation=Create/Update | Dynamic list from Monica CRM API |
| contactId | string | — | conditional | depends on resource+operation | Numeric contact ID; dynamic list from Monica CRM API |
| contactFieldTypeId | string | — | conditional | resource=Contact Field, operation=Create/Update | Dynamic list from Monica CRM API |
| conversationId | string | — | conditional | resource=Conversation Message | Dynamic list from Monica CRM API |
| tagId | string | — | conditional | resource=Contact Tag | Dynamic list from Monica CRM API |
| id | string | — | conditional | operation=Get/Delete/Update | Numeric entity ID |
| simpleBody | string | — | conditional | depends on resource+operation | Text content for notes, activities, conversations, journal entries, reminders |
| subject | string | — | conditional | resource=Activity/Note/Conversation/Task | Entity subject or title |
| completed | boolean | false | no | resource=Task | Task completion flag |
| summary | string | — | conditional | resource=Activity/Reminder | Brief description |
| date | string | — | conditional | resource=Activity/Reminder | ISO 8601 date string |
| initialCallDate | string | — | conditional | resource=Call | When the call happened |
| content | string | — | conditional | resource=Journal Entry | Journal entry body text |
| title | string | — | conditional | resource=Journal Entry | Journal entry title |
| name | string | — | conditional | resource=Tag/Contact | Entity name (tag name, or contact full name) |
| firstName | string | — | conditional | resource=Contact | Contact's first name |
| lastName | string | — | conditional | resource=Contact | Contact's last name |
| genderId | string | — | conditional | resource=Contact | Dynamic list from Monica CRM API |
| contactFieldData | string | — | conditional | resource=Contact Field, operation=Create/Update | Field value data |
| conversationMessage | string | — | conditional | resource=Conversation Message, operation=Add/Update | Message content |
| tagsToAdd | array | [] | no | resource=Contact Tag, operation=Add | Array of tag IDs |
| tagsToRemove | array | [] | no | resource=Contact Tag, operation=Remove | Array of tag IDs |
| additionalFields | object | {} | no | — | Resource/operation-specific advanced options |
| options | object | {} | no | — | Pagination (limit, page), sort order |

### Resource operations

**Activity:**
- Create — requires `activityTypeId`, `summary`; optional `contactId`, `date`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination, contact filter
- Update — requires `id`; optional `activityTypeId`, `summary`, `date`

**Call:**
- Create — requires `contactId`; optional `content`, `initialCallDate`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination
- Update — requires `id`; optional `content`, `initialCallDate`

**Contact:**
- Create — requires `firstName`; optional `lastName`, `genderId`, `contactFieldData`, tags
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination, search query
- Update — requires `id`; optional `firstName`, `lastName`, `genderId`

**Contact Field:**
- Create — requires `contactId`, `contactFieldTypeId`, `contactFieldData`
- Delete — requires `contactId`, `id`
- Retrieve — requires `contactId`, `id`
- Update — requires `contactId`, `id`; optional `contactFieldData`

**Contact Tag:**
- Add — requires `contactId`; optional `tagsToAdd`
- Remove — requires `contactId`; optional `tagsToRemove`

**Conversation:**
- Create — requires `contactId`, `conversationMessage`
- Delete — requires `id`
- Retrieve — requires `id`
- Update — requires `id`; optional `conversationMessage`

**Conversation Message:**
- Add a message — requires `conversationId`, `conversationMessage`
- Update a message — requires `conversationId`, `id`; optional `conversationMessage`

**Journal Entry:**
- Create — requires `title`, `content`; optional `date`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination
- Update — requires `id`; optional `title`, `content`, `date`

**Note:**
- Create — requires `contactId`, `body`; optional `title`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional `contactId`, pagination
- Update — requires `id`; optional `body`, `title`

**Reminder:**
- Create — requires `contactId`, `summary`, `date`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination
- Update — requires `id`; optional `summary`, `date`

**Tag:**
- Create — requires `name`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional pagination
- Update — requires `id`; optional `name`

**Task:**
- Create — requires `contactId`, `title`; optional `completed`
- Delete — requires `id`
- Retrieve — requires `id`
- Retrieve all — optional contact filter, pagination
- Update — requires `id`; optional `title`, `completed`

## Runtime behavior

### Input

Passthrough items. The node operates on parameters directly. When attached to an AI Agent, `$fromAI()` may dynamically populate parameters (resource, operation, and field values) based on agent context.

### Output

Each output item contains the Monica CRM API JSON response for the executed operation:
- Retrieval operations return the requested entity/envelope with `data` object.
- Mutation operations return the created/updated entity object (e.g. `{ data: { id: 123, ... } }`).
- List operations include pagination metadata (`links`, `meta`) per the Monica CRM API v1 standard.

### Errors

- Monica CRM API errors (HTTP 4xx/5xx) propagate with the API's `error.message` and `error.error_code`.
- Missing required parameters throw validation errors before the API call.
- `continueOnFail` follows standard n8n behavior.

### Expressions

All parameters accept expression strings. Dynamic option loading for activityTypeId, contactId, contactFieldTypeId, conversationId, tagId, and genderId resolves from the Monica CRM API at workflow execution time via loadOptions methods.

## Acceptance tests

### Test: create a contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Contact",
  "operation": "Create",
  "firstName": "Alice",
  "lastName": "Johnson",
  "genderId": "1"
}
```

**Expect** output[0] to contain the created contact with an `id`:
```json
[{
  "json": {
    "data": {
      "id": 42,
      "first_name": "Alice",
      "last_name": "Johnson",
      "gender_id": 1
    }
  }
}]
```

### Test: retrieve all activities

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Activity",
  "operation": "Retrieve all",
  "options": { "limit": 10, "page": 1 }
}
```

**Expect** output[0] to contain an array of activities with pagination metadata:
```json
[{
  "json": {
    "data": [
      { "id": 1, "summary": "Met for coffee", "activity_type_id": 1, "date": "2024-01-15" }
    ],
    "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
    "meta": { "current_page": 1, "per_page": 10, "total": 5 }
  }
}]
```

### Test: add a tag to a contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Contact Tag",
  "operation": "Add",
  "contactId": "42",
  "tagsToAdd": [1, 2]
}
```

**Expect** output[0] to confirm the tags were added.

### Test: create a note

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Note",
  "operation": "Create",
  "contactId": "42",
  "simpleBody": "Follow up on project proposal"
}
```

**Expect** output[0] to contain the created note with an `id`:
```json
[{
  "json": {
    "data": {
      "id": 77,
      "body": "Follow up on project proposal",
      "contact": { "id": 42 }
    }
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | Documented (public n8n docs) | Matches published node schema in corpus |
| Credential type | Documented (public n8n credentials page) | API token with environment (Cloud-Hosted or Self-Hosted + domain) |
| $fromAI() dynamic parameter support | Inferred from Tool node pattern | No dedicated monicaCrmTool docs page; consistent with all other *Tool nodes in n8n |
| Parameter names and defaults | Documented (public n8n docs) | High-level mapping from public docs; exact internal option enums omitted per abstraction rules |
| Monica CRM API response shapes | Public Monica CRM API docs (monicahq.com/api) | Paginated responses follow v1 envelope: `{ data, links, meta }` |
| Dynamic option loading sources | Inferred from published type declarations | Activity types, contact field types, genders, tags loaded from Monica CRM API |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.monicaCrmTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
