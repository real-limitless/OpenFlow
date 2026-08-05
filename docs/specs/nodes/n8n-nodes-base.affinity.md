---
type: n8n-nodes-base.affinity
displayName: Affinity
category: Sales
versions: [1]
priority: medium
status: specced
---

# Affinity

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.affinity/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/affinity/ | Public docs only |
| https://support.affinity.co/s/article/Getting-started-with-the-Affinity-API-FAQs | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.affinity`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `affinityApi` (API key)

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `list` | yes | One of: `list`, `listEntry`, `organization`, `person` |

### Operation selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | depends on resource | See per-resource operations below |

### List

| operation | parameters |
|-----------|------------|
| Get All Lists | (none — returns all lists the authenticated user can view) |
| Get a List | `listId` (number) — numeric list identifier |

### List Entry

| operation | parameters |
|-----------|------------|
| Create a List Entry | `listId` (number), `entityId` (number), `entityType` (number) — adds an existing organization or person entity to a list |
| Delete a List Entry | `listId` (number), `entryId` (number) — removes an entry from a list |
| Get a List Entry | `listId` (number), `entryId` (number) — retrieves a specific entry |
| Get All List Entries | `listId` (number), optional `orderBy` (string), optional `direction` (`asc` \| `desc`), optional `limit` (number), optional `additionalFields` (pagination cursor) |

### Organization

| operation | parameters |
|-----------|------------|
| Create an Organization | `name` (string) — required; optional `domain` (string), `domains` (string[]), `personIds` (number[]) |
| Delete an Organization | `organizationId` (number) |
| Get an Organization | `organizationId` (number) |
| Get All Organizations | optional `orderBy` (string), `direction` (`asc` \| `desc`), `limit` (number), `additionalFields` (pagination cursor) |
| Update an Organization | `organizationId` (number) plus at least one updatable field: `name`, `domain`, `domains`, `personIds` |

### Person

| operation | parameters |
|-----------|------------|
| Create a Person | `firstName` (string), `lastName` (string) — required; optional `emails` (string[]), `organizationIds` (number[]) |
| Delete a Person | `personId` (number) |
| Get a Person | `personId` (number) |
| Get All Persons | optional `orderBy` (string), `direction` (`asc` \| `desc`), `limit` (number), `additionalFields` (pagination cursor) |
| Update a Person | `personId` (number) plus at least one updatable field: `firstName`, `lastName`, `emails`, `organizationIds` |

### Simplified / additional fields

Parameters listed above as optional (`domain`, `domains`, `personIds`, `emails`, `organizationIds`, `orderBy`, `direction`, `limit`, pagination cursor) are exposed through an `additionalFields` or `options` group at the implementer's discretion. The spec does not mandate the original n8n nesting pattern.

## Runtime behavior

### Input

Each input item is processed independently. For create/update operations, parameters may be set from item-level expressions.

### Output

- **List/GetAll operations:** One output item per returned entity (organizations, persons, lists, list entries). The JSON body of the API response is placed on `json`.
- **Get/Create/Update operations:** A single output item containing the entity JSON response body on `json`.
- **Delete operations:** The response is passed through as a single output item with the entity's JSON (typically the deleted entity or a confirmation object).

### Errors

- API HTTP errors (4xx, 5xx) propagate as node errors.
- Missing required parameters (`name` on create, `listId` on list-entry operations, etc.) throw a parameter-validation error.
- The `continueOnFail` flag, if set, suppresses the error and returns an empty output for that item.

### Expressions

All parameter values accept expression strings. Resource and operation selections can use expressions.

## Acceptance tests

### Test: Create and retrieve an organization

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "organization",
  "operation": "create",
  "name": "Acme Corp",
  "domain": "acme.example.com"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": 123,
    "name": "Acme Corp",
    "domain": "acme.example.com",
    "domains": ["acme.example.com"],
    "global": false
  }
}]
```

The response must contain at least `id`, `name`, and `domain`. Property ordering is not significant.

### Test: Get all persons with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "person",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to contain an array of person objects. Each person object must contain `id`, `first_name`, `last_name`, `emails`. If the API returns zero results, output is an empty array.

### Test: Delete a list entry

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "listEntry",
  "operation": "delete",
  "listId": 42,
  "entryId": 99
}
```

**Expect** output[0] to contain a JSON object representing the deleted list entry, or `{}` if the API returns no body. No error thrown if the entry exists.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Affinity REST API field schemas | Inferred from published JSON schema snapshot | Organization/Person/ListEntry response shapes confirmed. Update operation field subset inferred from create shapes. |
| Return-all pagination strategy | Inferred | n8n pattern: when `returnAll` is true, fetch all pages using cursor until empty. |
| Credential type | Public docs confirmed | `affinityApi` — API key at `https://api.affinity.co/`. |
| Options group nesting | Not documented | The original UI groups optional fields under `additionalFields`; implementers may choose flatter or nested structure. |
| Usable as AI tool | Public docs confirmed | Node can be used as an AI tool (`$fromAI()` support). |

## OpenFlow mapping

- **Definition group:** `sales`
- **Executor file:** `src/lib/engine/executors/affinity.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
