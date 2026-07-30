---
type: n8n-nodes-base.dataTable
displayName: DataTable
category: Transform
versions: [1]
priority: medium
status: specced
---

# DataTable

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dataTable`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `tableData` | `json` | `[]` | no | | JSON array of row objects. Each object becomes one output item. |
| `options` | `collection` | `{}` | no | | Additional options. |
| `options.keepInput` | `boolean` | `false` | no | | When true, merge each table row onto the corresponding input item (by index). When false, table rows replace input items entirely. |

## Runtime behavior

### Input

Accepts items on `main` input. When `options.keepInput` is `false` (default),
input items are ignored — the node acts as a standalone data source.

### Output

Reads `tableData` (a JSON array of objects). Each object in the array becomes
one output item with `json` set to that object.

- If `tableData` is a non-empty array, output one item per row.
- If `tableData` is empty or missing, output a single empty item `{ json: {} }`.
- If `options.keepInput` is `true`, each table row is merged onto the
  corresponding input item (by index). If there are more rows than input items,
  extra rows become standalone items. If there are fewer rows than input items,
  extra input items are dropped.

### Errors

No error conditions. Malformed `tableData` (not an array) is treated as empty.

### Expressions

Values inside `tableData` row objects may contain expression strings (e.g.
`={{ $json.field }}`). These are resolved per-item at runtime when `keepInput`
is true; otherwise they are resolved against an empty item context.

## Acceptance tests

### Test: basic — table data becomes items

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "tableData": [
    { "name": "Alice", "age": 30 },
    { "name": "Bob", "age": 25 }
  ]
}
```

**Expect** output:

```json
[
  { "json": { "name": "Alice", "age": 30 } },
  { "json": { "name": "Bob", "age": 25 } }
]
```

### Test: empty table data outputs single empty item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "tableData": []
}
```

**Expect** output:

```json
[
  { "json": {} }
]
```

### Test: keepInput merges rows onto input items

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**

```json
{
  "tableData": [
    { "name": "Alice" },
    { "name": "Bob" }
  ],
  "options": { "keepInput": true }
}
```

**Expect** output:

```json
[
  { "json": { "id": 1, "name": "Alice" } },
  { "json": { "id": 2, "name": "Bob" } }
]
```

### Test: missing tableData defaults to empty item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{}
```

**Expect** output:

```json
[
  { "json": {} }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter name `tableData` | inferred | Spec agent timed out; parameter name inferred from node display name and common n8n conventions. |
| `options.keepInput` merge behavior | inferred | Exact option name and merge semantics inferred; may differ from actual n8n implementation. |
| Expression resolution in table rows | inferred | Assumed expressions are supported in row values; exact resolution context may differ. |
| Column schema / type definitions | not implemented | n8n UI may support column type definitions; not modeled here. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/data-table.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only