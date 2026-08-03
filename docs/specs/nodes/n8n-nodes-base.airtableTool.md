---
type: n8n-nodes-base.airtableTool
displayName: Airtable
category: AI Tool
versions: [1, 2]
priority: high
status: specced
---

# Airtable (AI Tool)

A tool variant of the Airtable node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Supports Record (create/upsert/delete/get/search/update) and Base (getMany/getSchema) resources against the Airtable REST API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtable.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://airtable.com/developers/web/api/introduction | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.airtableTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `airtableTokenApi` (Personal Access Token) or `airtableOAuth2Api` (OAuth2)

The legacy `airtableApi` (API Key) credential was deprecated by Airtable in February 2024.

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `airtableTokenApi` | no | `airtableTokenApi` (PAT) or `airtableOAuth2Api` (OAuth2) |

### Resource selection

The user selects a resource (**Record** or **Base**) which determines available operations.

### Record operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Base (by list/ID), Table, Data (field values mapping) |
| Upsert | Base, Table, Data, optional: Unique Field (column used as match key) |
| Delete | Base, Table, Record ID(s) |
| Get | Base, Table, Record ID |
| Search | Base, Table, optional: Filter By Formula, Limit |
| Update | Base, Table, Record ID, Data (field values to change) |

### Base operations

| Operation | Key parameters |
|-----------|----------------|
| Get Schema | Base |
| Get Many | (none — lists all accessible bases) |

### Base/Table identification

Base is identified via resource locator (list dropdown or by ID).  
Table is identified by name (string) or by ID.

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Field data mappings accept expression strings for AI-driven value inference
- Tool name and description metadata are configurable in the AI Agent node

## Runtime behavior

### Input

Consumes items from `main` input. For create/update/upsert operations, input item JSON fields serve as the field data values when no explicit mapping is configured.

### Output

**Output[0]** — operation result:

- **Record: Create/Update/Upsert**: Returns the created/updated record object including `id`, `createdTime`, and `fields`.
- **Record: Get**: Returns the single record object (`id`, `createdTime`, `fields`).
- **Record: Search**: Returns an array of matching records (`id`, `createdTime`, `fields`).
- **Record: Delete**: Returns the deleted record object(s) with `deleted: true`.
- **Base: Get Schema**: Returns table metadata including table names, field names, and field types for all tables in the base.
- **Base: Get Many**: Returns the list of accessible bases with `id` and `name`.

### Errors

- API errors (authentication failures, rate limits, invalid base/table/record IDs, permission errors) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Deleting a record is permanent and irreversible
- Expressions in field data fields are evaluated per input item

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions.

## Acceptance tests

### Test: Create a record

**Given** input items:
```json
[{ "json": { "Name": "Alice", "Email": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "record",
  "operation": "create",
  "base": { "mode": "id", "value": "appABC123" },
  "table": "Contacts",
  "data": { "name": "={{ $json.Name }}", "email": "={{ $json.Email }}" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "recXXXX",
    "createdTime": "2024-01-01T00:00:00.000Z",
    "fields": { "Name": "Alice", "Email": "alice@example.com" }
  }
}]
```

### Test: Get a record by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "record",
  "operation": "get",
  "base": { "mode": "id", "value": "appABC123" },
  "table": "Contacts",
  "id": "recTARGET"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "recTARGET",
    "createdTime": "2024-01-01T00:00:00.000Z",
    "fields": { "Name": "Alice", "Email": "alice@example.com" }
  }
}]
```

### Test: Search records with formula filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "record",
  "operation": "search",
  "base": { "mode": "id", "value": "appABC123" },
  "table": "Contacts",
  "filterByFormula": "{Organization}='n8n'"
}
```

**Expect** output[0]:
```json
[{
  "json": [{
    "id": "rec1",
    "createdTime": "2024-01-01T00:00:00.000Z",
    "fields": { "Name": "Alice", "Organization": "n8n" }
  }, {
    "id": "rec2",
    "createdTime": "2024-01-02T00:00:00.000Z",
    "fields": { "Name": "Bob", "Organization": "n8n" }
  }]
}]
```

### Test: Get base schema

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "base",
  "operation": "getSchema",
  "base": { "mode": "id", "value": "appABC123" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "tables": [{
      "id": "tbl1",
      "name": "Contacts",
      "fields": [
        { "id": "fld1", "name": "Name", "type": "singleLineText" },
        { "id": "fld2", "name": "Email", "type": "email" }
      ]
    }]
  }
}]
```

### Test: Delete a record

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "record",
  "operation": "delete",
  "base": { "mode": "id", "value": "appABC123" },
  "table": "Contacts",
  "id": "recTARGET"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "recTARGET",
    "deleted": true
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Record operations (CRUD + search + upsert) | documented | Public n8n docs cover all 6 record operations; Airtable REST API docs confirm record endpoints |
| Base operations (getSchema, getMany) | documented | getSchema listed in public docs; getMany inferred from tool wrapper exposing base listing |
| Authentication (PAT + OAuth2) | documented | Airtable credentials page documents PAT and OAuth2; API Key deprecated Feb 2024 |
| $fromAI() dynamic parameter support | documented | Standard AI tool behavior documented across n8n AI docs |
| Output shape for each operation | documented | Public docs describe outcome-level results; exact JSON follows Airtable REST API responses |
| Tool-specific parameter layout | inferred | As with gmailTool/googleSheetsTool, the tool node exposes operations identically to the base Airtable node in agent context |
| Aliases list | inferred | No aliases found in known/nodes.json for airtableTool |
| Version differences (v1 vs v2) | inferred from corpus | Two typeVersions exist; v2 is current with full operation set including upsert and base schema |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtableTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
