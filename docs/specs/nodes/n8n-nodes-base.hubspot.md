---
type: n8n-nodes-base.hubspot
displayName: HubSpot
category: Sales
versions: [1, 2]
priority: high
status: specced
---

# HubSpot

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hubspot/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/hubspot.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.hubspot`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `hubspotApi` (Service Key / App Token), `hubspotOAuth2Api` (OAuth2), `hubspotDeveloperApi` (Developer API key for triggers)

## Parameters

### Top-level

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | yes | always | 7 resources: contact, contactList, company, deal, engagement, form, ticket |
| operation | string | (depends on resource) | yes | depends on resource | See per-resource operations below |

### Contact operations

| operation | parameters | notes |
|-----------|-----------|-------|
| upsert | contactId, email, properties values | Creates or updates by email or contactId. Properties passed as key-value pairs |
| delete | contactId | Requires HubSpot contact VID |
| get | contactId | Returns single contact with properties |
| getAll | limit, offset, propertyGroup, formSubmissionMode, showListMemberships | Paginated list. Returns array of contacts |
| getRecentlyCreatedUpdated | since | Timestamp filter for recent changes |
| search | searchQuery, limit, offset, propertyGroup | Searches by query string |

### Contact List operations

| operation | parameters | notes |
|-----------|-----------|-------|
| add | listId, contactId (or byEmail) | Adds contact to static list; requires list numeric ID |
| remove | listId, contactId (or byEmail) | Removes contact from static list |

### Company operations

| operation | parameters | notes |
|-----------|-----------|-------|
| create | properties values | Company properties as key-value pairs |
| delete | companyId | |
| get | companyId | Returns company with properties |
| getAll | limit, offset, propertyGroup | Paginated company list |
| getRecentlyCreated | since | |
| getRecentlyModified | since | |
| searchByDomain | domain, limit, offset | Searches by company domain name |
| update | companyId, properties values | Updates specified properties |

### Deal operations

| operation | parameters | notes |
|-----------|-----------|-------|
| create | properties values, associations | Deal properties plus optional associatedCompanyIds, associatedVids |
| delete | dealId | |
| get | dealId | |
| getAll | limit, offset, propertyGroup, includeAssociations | |
| getRecentlyCreated | since | |
| getRecentlyModified | since | |
| search | searchQuery, limit, offset | |
| update | dealId, properties values, associations | |

### Engagement operations

| operation | parameters | notes |
|-----------|-----------|-------|
| create | type, metadata, associations | Engagement type (NOTE, TASK, etc), metadata body, associated entity IDs |
| delete | engagementId | |
| get | engagementId | |
| getAll | limit, offset | |

### Form operations

| operation | parameters | notes |
|-----------|-----------|-------|
| getAllFields | formId | Returns structured field definitions |
| submit | portalId, formId, fields, context, legalConsentOptions, submittedAt, skipValidation | Submits form data. Fields as array of {name, value}; context accepts hutk, ipAddress, pageUri, pageName, pageId, etc |

### Ticket operations

| operation | parameters | notes |
|-----------|-----------|-------|
| create | properties values | Ticket properties (subject, content, hs_pipeline, hs_pipeline_stage, etc) |
| delete | ticketId | |
| get | ticketId | |
| getAll | limit, offset, propertyGroup | |
| update | ticketId, properties values | |

All operations accept a top-level `additionalOptions` (type collection) for HubSpot-API-specific overrides not covered by the main parameter surface.

## Runtime behavior

### Input

Each input item is processed independently. For create/update operations, the item's JSON fields can supply property values via expressions. For getAll/search operations, the input item is used to evaluate any expression-based parameters but does not directly affect the request body otherwise.

### Output

Each operation produces one output item per API response item:

- **Get / Create / Update / Upsert:** Single-item output. Response JSON contains the HubSpot object ID (`vid`, `companyId`, `dealId`, `engagement.id`, `ticketId`), `isDeleted` flag, `properties` object with HubSpot property values, and `portalId`.
- **GetAll / Search:** Array output. Response contains an array of objects with the same structure as individual gets.
- **Engagement create response:** Object with `engagement`, `associations`, `attachments`, `metadata` sub-objects.
- **Contact upsert response:** Object with `vid`, `isNew`, and optionally `error`.
- **Contact delete response:** Object with `vid`, `deleted`, `reason`.
- **Form submit response:** Redirect or success confirmation from HubSpot Forms API.

Output items use the shape `{ json: <response>, binary?: <any> }`.

### Errors

- API errors (4xx/5xx) from HubSpot throw a NodeError with the HubSpot error message.
- Missing required parameters (e.g. no `contactId` for contact get) throw a validation error.
- On `continueOnFail: true`, failed items produce `[{ json: { error: <message> } }]` on the output.
- HubSpot rate limiting returns 429 — the executor should handle this as a standard HTTP error.

### Expressions

All parameter values accept expressions (`={{ }}`). Property values in create/update operations are commonly set via expressions from upstream node output.

## Acceptance tests

### Test: contact upsert by email

**Given** input items:
```json
[{ "json": { "email": "test@example.com", "firstname": "Jane", "lastname": "Doe" } }]
```

**Parameters:**
```json
{ "resource": "contact", "operation": "upsert", "email": "={{ $json.email }}", "properties": { "firstname": "={{ $json.firstname }}", "lastname": "={{ $json.lastname }}" } }
```

**Expect** output[0] contains:
```json
{ "json": { "vid": 123456, "isNew": false } }
```

### Test: company create with properties

**Given** input items:
```json
[{ "json": { "name": "Acme Corp" } }]
```

**Parameters:**
```json
{ "resource": "company", "operation": "create", "properties": { "name": "={{ $json.name }}" } }
```

**Expect** output[0] contains:
```json
{ "json": { "companyId": 98765, "isDeleted": false, "portalId": 12345 } }
```

### Test: contact getAll with pagination

**Parameters:**
```json
{ "resource": "contact", "operation": "getAll", "limit": 10, "offset": 0 }
```

**Expect** output[0] contains:
```json
{ "json": [{ "vid": 111, "properties": { "firstname": { "value": "Alice" } } }] }
```
Where output[0].json is an array of contact objects.

### Test: engagement create with associations

**Parameters:**
```json
{ "resource": "engagement", "operation": "create", "type": "NOTE", "metadata": { "body": "Follow up call" }, "associations": { "contactIds": [123], "dealIds": [456] } }
```

**Expect** output[0] contains:
```json
{ "json": { "engagement": { "id": 789, "type": "NOTE" }, "associations": { "contactIds": [123], "dealIds": [456] } } }
```

### Test: form submit data

**Parameters:**
```json
{ "resource": "form", "operation": "submit", "portalId": 12345, "formId": "abc-def-ghi", "fields": [{ "name": "email", "value": "user@example.com" }, { "name": "firstname", "value": "John" }] }
```

**Expect** output[0] status indicates submission accepted.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Per-operation parameter names and defaults | Documented | Public docs list operations at abstract level; descriptor confirms resource/operation enum values |
| Property value input format | Inferred from descriptor | Properties passed as flat key-value object; HubSpot API expects `{properties: {key: value}}` |
| V1 vs V2 version differences | Inferred from descriptor | V2 (typeVersion 2+) uses HubSpot CRM API v3 with updated endpoints; contact delete/search moved to v2.2; engagement create uses associations model |
| Exact option enums for propertyGroup, formSubmissionMode | Documented via descriptor | Enum values from descriptor |
| Credential auth flows | Documented | Three auth modes documented in public credentials page |
| Response schema exact shapes | Documented via descriptor | Schema files under `__schema__` define output shapes per operation per version |

## OpenFlow mapping

- **Definition group:** `Sales`
- **Executor file:** `src/lib/engine/executors/hubspot.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
