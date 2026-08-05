---
type: n8n-nodes-base.codaTool
displayName: Coda Tool
category: AI
versions: [1]
priority: medium
status: specced
---

# Coda Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coda/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/coda/ | Public docs only |
| https://coda.io/developers/apis/v1 | External API |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.codaTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `codaApi` (API access token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | Table | yes | always | Controls which Coda API resource the operation targets: Control, Formula, Table, or View |
| operation | fixed | (varies) | yes | depends on resource | Selects the specific API action (see Runtime behavior) |
| docId | string | — | conditionally | depends on operation | Coda document ID; may be populated dynamically by `$fromAI()` |
| tableId | string | — | conditionally | depends on operation | Coda table or view ID; may be populated by `$fromAI()` |
| viewId | string | — | conditionally | depends on operation | Coda view ID (when operating on a view rather than table) |
| rowId | string | — | conditionally | depends on operation | Row identifier for single-row operations |
| columnId | string | — | conditionally | depends on operation | Column identifier for single-column operations |
| controlId | string | — | conditionally | depends on operation | Control identifier for control operations |
| formulaId | string | — | conditionally | depends on operation | Formula identifier for formula operations |
| data | json | — | conditionally | depends on operation | Row payload for create/update operations |
| options | collection | — | no | always | Additional API options (details abstracted per operation) |

All parameters that accept document/table/row identifiers support `$fromAI()` dynamic population when the node is configured as an AI agent tool.

## Runtime behavior

### Input

Each input item is processed independently. The node uses the item's `json` data along with configured parameters to construct the Coda REST API request.

### Operations by resource

**Control:**
- **Get** — retrieves a single control by `controlId` from the document
- **Get All** — lists all controls in the document

**Formula:**
- **Get** — retrieves a single formula by `formulaId`
- **Get All** — lists all formulas in the document

**Table:**
- **Create/Insert Row** — inserts one or more rows into the table using the `data` payload
- **Delete Row(s)** — deletes one or more rows by identifier
- **Get Column** — retrieves a single column by `columnId`
- **Get All Columns** — lists all columns in the table
- **Get Row** — retrieves a single row by `rowId`
- **Get All Rows** — lists rows in the table with optional query/filter
- **Push Button** — triggers a button control in the table

**View:**
- **Delete Row** — deletes a row from the view
- **Get View** — retrieves a single view by `viewId`
- **Get All Views** — lists all views in the document
- **Get All View Columns** — lists all columns in the view
- **Get All View Rows** — lists rows in the view
- **Update Row** — updates a row in the view
- **Push View Button** — triggers a button in the view

### Output

Each operation emits the Coda API response body as the `json` property of the output item. List operations return an array of items. Single-object operations return the object directly. Mutation endpoints return `202 Accepted` responses that include a `requestId` for polling the mutation status via the Coda API.

### Errors

- HTTP 4xx responses (authentication, authorization, not found, rate limit) cause the node to throw an error unless `continueOnFail` is set.
- HTTP 429 (rate limited) responses should be retried with backoff.
- HTTP 202 mutation responses are returned as-is; the caller is responsible for polling the mutation status if needed.

### Expressions

Parameters that accept string values (docId, tableId, rowId, columnId, data, etc.) accept expression strings.

## Acceptance tests

### Test: list all rows in a table

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Table",
  "operation": "Get All Rows",
  "docId": "AbCDeFGH",
  "tableId": "grid-123456"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "items": [
      { "id": "row-111", "name": "Item A", "values": { "col-1": "A", "col-2": 10 } },
      { "id": "row-222", "name": "Item B", "values": { "col-1": "B", "col-2": 20 } }
    ],
    "nextPageToken": null
  }
}]
```

### Test: insert a row

**Given** input items:
```json
[{ "json": { "name": "New Item", "quantity": 5 } }]
```

**Parameters:**
```json
{
  "resource": "Table",
  "operation": "Create/Insert Row",
  "docId": "AbCDeFGH",
  "tableId": "grid-123456",
  "data": { "rows": [{ "cells": [{"column":"col-1","value":"New Item"},{"column":"col-2","value":5}] }] }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "requestId": "req-abc-123",
    "id": "row-333"
  }
}]
```

### Test: get a formula

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Formula",
  "operation": "Get",
  "docId": "AbCDeFGH",
  "formulaId": "formula-xyz"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "formula-xyz",
    "type": "formula",
    "href": "https://coda.io/apis/v1/docs/AbCDeFGH/formulas/formula-xyz",
    "name": "Total",
    "value": 42
  }
}]
```

### Test: AI agent tool with $fromAI()

**Given** input items:
```json
[{ "json": { "docId": "AbCDeFGH", "tableId": "grid-123456" } }]
```

**Parameters:**
```json
{
  "resource": "Table",
  "operation": "Get All Rows",
  "docId": "={{ $fromAI() }}",
  "tableId": "={{ $fromAI() }}"
}
```

**Expect** output[0] contains items from the resolved doc/table. The tool must invoke `$fromAI()` before execution to populate the parameters from the AI model's context.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool node existence | documented (n8n docs index references Tool variants) | No dedicated codaTool page exists; behavior is inferred from the base Coda node pattern plus the established Tool pattern |
| Exact parameter naming | inferred | Tool variant may simplify or rename parameters from the base Coda node |
| Default operation per resource | inferred | Base Coda node does not declare a default; Tool likely uses none |
| `$fromAI()` support | documented (generic Tool docs) | All Tool parameters that accept strings should support `$fromAI()` |
| Credential type | documented | Uses `codaApi` API access token as shown in the Coda credentials page |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.codaTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
