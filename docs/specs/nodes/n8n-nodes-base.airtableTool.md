---
type: n8n-nodes-base.airtableTool
displayName: Airtable
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Airtable (AI Tool)

Tool-mode variant of the Airtable integration, intended to be connected to an AI Agent. When used as a tool, the agent model can supply parameters at call time through `$fromAI()` expressions (the "let model fill" toggle). Exposes Airtable record operations (create, retrieve, update, delete, search/list, upsert) and base metadata operations (list bases, read table schema) against the Airtable REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtable.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://airtable.com/developers/web/api/introduction | External API docs |
| https://airtable.com/developers/web/api/rate-limits | External API docs |
| n8n-nodes-base npm descriptor v2.15.1 (isolated under /tmp; type-string confirmation only) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.airtableTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `airtableTokenApi` (Personal Access Token) or `airtableOAuth2Api` (OAuth2). The legacy API-key method was fully deprecated by Airtable in February 2024 and must not be required. n8n recommends PAT.
- **Required PAT/OAuth2 scopes:** `data.records:read`, `data.records:write`, `schema.bases:read`

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `airtableTokenApi` | no | `airtableTokenApi` (PAT) or `airtableOAuth2Api` (OAuth2) |

### Resource and operation selection

The user selects a resource — **Record** (rows in a table) or **Base** (base/table metadata) — which determines the available operations. Record operations require a base and a table; base operations require only a base.

### Record operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Base (list/URL/ID), Table (list/URL/ID), field values mapped to columns, optional typecast |
| Get | Base, Table, Record ID |
| Update | Base, Table, Record ID (or match-column dedup), field values, optional typecast |
| Delete | Base, Table, Record ID |
| Search / List | Base, Table, optional Airtable formula filter, field selection, sort, view, Return All / Limit |
| Upsert | Base, Table, field values, matching column(s) for dedup, optional typecast |

> **Return All contract:** For `record.search` and `base.getMany`, `returnAll` is *opt-in* — the default is `false`. Only `returnAll === true` fetches the full result set; otherwise `limit` bounds the response. This prevents an unbounded API crawl by default.

### Base operations

| Operation | Key parameters |
|-----------|----------------|
| Get Many | Return All / Limit, optional permission-level filter |
| Get Schema | Base (list/URL/ID) — returns the tables and their columns |

### Base / Table identification

Base and Table accept multiple identification modes: **From list** (options loaded from the Airtable API), **By URL**, or **By ID**. Base IDs look like `app…`, table IDs like `tbl…`, record IDs like `rec…`.

### Column mapping

Field values for create/update/upsert are mapped to Airtable table columns. Modes include automatically mapping the incoming item's top-level properties to columns, or manually defining the column list. The set of valid columns is derived from the target table's schema. For upsert, matching columns are the columns used to decide create-vs-update.

### AI tool-specific behavior

When used as an AI agent tool:

- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- Tool name and description metadata are configurable in the AI Agent node

## Runtime behavior

### Input

Consumes items from the `main` input. For record create/update/upsert, each input item contributes one row; column values and resource locators accept expressions referencing `$json`.

### Output

**Output[0]** — operation result, one item per input item unless the operation collapses results. Outcome-level shapes:

- **Create**: the created record object from the Airtable API (`id`, `createdTime`, `fields`)
- **Get**: the single record object (`id`, `createdTime`, `fields`)
- **Update**: a `records` array of updated record objects
- **Delete**: the deleted record confirmation (record `id` + `deleted: true`)
- **Search / List**: an array of record objects (paginated across offset pages when Return All is set)
- **Upsert**: a `records` array of created/updated record objects
- **Get Many (base)**: an array of base objects (`id`, `name`, `permissionLevel`)
- **Get Schema**: the base schema with tables and their column metadata (`id`, `name`, `type`)

### Errors

- Airtable API errors propagate as node errors: `403 Forbidden` (insufficient scopes — "Forbidden - perhaps check your credentials"), `404` (missing base/table/record), `429` (rate limit).
- Airtable rate limits: more than 5 requests per second per base, or more than 50 requests per second across all bases on one token, returns `429`; a 30-second cooldown applies before resuming.
- `continueOnFail` lets the workflow proceed on error, emitting an error item instead of throwing.
- Deleting a record is irreversible.

### Expressions

All string/number/boolean parameters accept n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Field-value mappings, record IDs, formulas, and resource locators all support expressions.

## Acceptance tests

### Test: Create a record

**Given** input items:

```json
[{ "json": { "Name": "Alice", "Email": "alice@example.com" } }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "create",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "columns": { "mappingMode": "autoMapInputData", "value": null },
  "options": { "typecast": false }
}
```

**Expect** output[0] to contain one record object with `id`, `createdTime`, and `fields` where `fields.Name === "Alice"` and `fields.Email === "alice@example.com"`.

### Test: Search records with a formula filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "search",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "filterByFormula": "{Status} = 'Active'",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to be an array of record objects where every `fields.Status === "Active"`; the request is bounded by `limit` (no unbounded crawl when `returnAll` is false).

### Test: Get a single record by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "get",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "id": "recZZZZZZZZZZZZZZ"
}
```

**Expect** output[0] to contain the single record object whose `id` equals `recZZZZZZZZZZZZZZ`, with `createdTime` and `fields`.

### Test: Upsert a record by match column

**Given** input items:

```json
[{ "json": { "id": "recZZZZZZZZZZZZZZ", "Email": "newalice@example.com" } }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "upsert",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "columns": { "mappingMode": "autoMapInputData", "matchingColumns": ["id"] },
  "options": { "typecast": false }
}
```

**Expect** output[0] to contain a `records` array; the record with `id === "recZZZZZZZZZZZZZZ"` is updated (its `fields.Email` becomes `"newalice@example.com"`) rather than duplicated.

### Test: Get table schema

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "base",
  "operation": "getSchema",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" }
}
```

**Expect** output[0] to describe the base schema: an array of tables, each with `id`, `name`, and a `fields` array where each field has `id`, `name`, and `type`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Airtable record operations (append/create, list/search, read/get, update, delete) | documented | Public n8n docs list Append, Delete, List, Read, Update and the Filter By Formula option on List |
| Credentials (PAT / OAuth2) + required scopes | documented | Public n8n credentials doc; API key deprecated Feb 2024 |
| Rate limits (5 req/s/base, 429 + 30 s cooldown) | documented | Public n8n common-issues page and Airtable API rate-limits doc |
| 403 "Forbidden - perhaps check your credentials" | documented | Public n8n common-issues page |
| Wire type string `n8n-nodes-base.airtableTool` | factory contract | No standalone `airtableTool` descriptor exists in the n8n-nodes-base v2.15.1 package; the integration type is `n8n-nodes-base.airtable`, and this OpenFlow type is the tool-mode designation |
| Upsert, base getMany, base getSchema operations | inferred | Not named in public app-node docs; required for AI-tool parity with the Airtable node's v2 resource model, kept at functional-outcome level |
| Tool-specific parameter layout | inferred | The tool variant exposes the Airtable operations identically to the base node in agent context |
| Version list | inferred | No public version enumeration for the tool variant; `[1]` is a placeholder consistent with other tool variants |
| Exact response JSON | inferred | Outcome-level shapes documented; exact JSON varies by Airtable API version |
| Alias list | inferred | No known aliases for this tool node |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtableTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
