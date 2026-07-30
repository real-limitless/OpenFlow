---
type: n8n-nodes-base.aggregate
displayName: Aggregate
category: Transform
versions: [1]
priority: high
status: specced
---

# Aggregate

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.aggregate`
- **Aliases:** (none as alternate type strings). UI search aliases may include Aggregate, Combine, Flatten, Transform, Array, List, Item (**inferred** descriptor metadata)
- **Display name:** `Aggregate`
- **Group / category:** `transform` · Core Nodes · Data Transformation
- **Versions:** `1` (`nodeVersion` 1.0 — **inferred** descriptor)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 — **one** item that holds aggregated arrays / lists (**documented** concept)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| aggregate | options | `aggregateIndividualFields` | no | — | Mode: **Individual Fields** → `aggregateIndividualFields`; **All Item Data** → `aggregateAllItemData` (**documented** labels; wire tokens **inferred** descriptor) |
| fieldsToAggregate | fixedCollection | `{ fieldToAggregate: [{ fieldToAggregate: "", renameField: false }] }` | when individual | show when `aggregate` = `aggregateIndividualFields` | Collection of fields to pack into arrays (**inferred** wire name; docs: Input Field Name / Rename Field / Output Field Name) |
| fieldsToAggregate.fieldToAggregate[].fieldToAggregate | string | `""` | yes (per row) | — | Input field name (or path) to collect across items (**documented** as Input Field Name) |
| fieldsToAggregate.fieldToAggregate[].renameField | boolean | `false` | no | — | When true, use a different output key (**documented** as Rename Field) |
| fieldsToAggregate.fieldToAggregate[].outputFieldName | string | — | when rename on | show when `renameField` = true | Output array field name. Docs: if aggregating **multiple** fields, each must have a distinct output name — cannot leave multiple undefined (**documented**) |
| destinationFieldName | string | `data` | when all-item | show when `aggregate` = `aggregateAllItemData` | Field that receives the list of (filtered) item objects (**documented** as Put Output in Field; default **inferred**) |
| include | options | `allFields` | no | show when `aggregate` = `aggregateAllItemData` | Which fields from each item’s `json` to keep in the packed objects (**documented**). Wire: `allFields` \| `specifiedFields` \| `allFieldsExcept` (**inferred**) |
| fieldsToInclude | string | — | when specified | show when all-item + `include` = `specifiedFields` | Comma-separated field names to keep (**documented** as Fields To Include) |
| fieldsToExclude | string | — | when except | show when all-item + `include` = `allFieldsExcept` | Comma-separated field names to drop (**documented** as Fields To Exclude) |
| options | collection | `{}` | no | — | Nested toggles below |
| options.disableDotNotation | boolean | `false` | no | individual fields only | When on, treat field names literally (no `parent.child` path resolution). Default off = allow dot paths (**documented**) |
| options.mergeLists | boolean | `false` | no | individual fields only | When the collected value is itself a list, flatten into one list instead of a list-of-lists (**documented**) |
| options.includeBinaries | boolean | `false` | no | both modes | When on, carry binary data from inputs onto the single output item (**documented**) |
| options.keepOnlyUnique | boolean | `false` | no | show when `includeBinaries` = true | When including binaries, keep only unique binaries (compare mime type, file type, size, extension) (**inferred** descriptor; not on public docs page) |
| options.keepMissing | boolean | `false` | no | individual fields only | When on, push `null` for missing/null input values; when off, skip those entries (**documented** as Keep Missing And Null Values; wire name **inferred** as `keepMissing`) |

### Mode summary

| UI label | Wire `aggregate` | Result shape (conceptual) |
|----------|------------------|---------------------------|
| Individual Fields | `aggregateIndividualFields` | One item; each selected field → array of values across input items |
| All Item Data | `aggregateAllItemData` | One item; `destinationFieldName` → array of (optionally field-filtered) item `json` objects |

### Compatibility note (OpenFlow / older shorthand)

Some in-tree tests and simplified UIs may use shorthand mode values `individualFields` / `allFields` and a flat `includeFields` list. **Canonical public wire** for current Aggregate is the table above. Implementers should accept canonical tokens; optional alias mapping for shorthand is an OpenFlow compatibility choice (**inferred**).

## Runtime behavior

### Role

Take **many** input items (or selected portions of them) and **group** them into **one** output item with array/list fields (**documented**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`. Aggregation spans the **entire** incoming item list for this node run (not per-item fan-out).

### Individual Fields (`aggregateIndividualFields`)

1. For each row in `fieldsToAggregate`:
   - Resolve the input field (`fieldToAggregate`) on every input item’s `json`.
   - Dot-path resolution applies unless `options.disableDotNotation` is true (**documented**).
   - Collect values into an array. If `options.keepMissing` is false, omit null/missing; if true, append `null` for those positions (**documented**).
   - If `options.mergeLists` is true and a collected value is an array, concatenate elements into the output array (flat list); otherwise nest arrays as elements (**documented**).
   - Write under `outputFieldName` when `renameField` is true; otherwise under the input field name (basename if path — **inferred**).
2. Emit **exactly one** item whose `json` is the map of output field name → aggregated array.
3. Multiple fields: each becomes its own array key on that single item. Docs require distinct output names when renaming multiple fields (**documented**).

### All Item Data (`aggregateAllItemData`)

1. For each input item, start from `item.json`.
2. Apply `include`:
   - `allFields` — keep all keys.
   - `specifiedFields` — keep only names listed in `fieldsToInclude` (comma-separated; trim whitespace **inferred**).
   - `allFieldsExcept` — drop names listed in `fieldsToExclude` (**documented**).
3. Build an array of those (possibly filtered) objects.
4. Emit one item: `{ json: { [destinationFieldName]: <array> } }` (default key `data` **inferred**).

### Binaries

- Default: output item has no binary (or empty) even if inputs had binary (**inferred** from option default off).
- `options.includeBinaries: true` — attach binary payloads from input items onto the single output item (**documented**). Collision / keying strategy and `keepOnlyUnique` filtering — **gap** / descriptor-only.

### Output

- **output[0]:** always length **0 or 1** under normal success:
  - Empty input → empty output **or** one item with empty arrays — **gap** (prefer one item with empty arrays for all-item mode and empty arrays per field for individual mode **inferred** for downstream stability; document both in tests when implementing).
  - Non-empty input → **one** item as above.
- Preserve `pairedItem` linkage to all contributing inputs when the engine supports multi-pairing — **inferred**.

### Errors

- Missing required field name on an individual-fields row when the field is mandatory — UI validation; runtime may treat as empty name / skip — **gap**.
- Invalid field path with dot notation enabled — missing values follow `keepMissing` rules (**inferred**).
- Expression failures on field names — engine policy (**inferred**).
- `continueOnFail`: no special Aggregate branch; follow global policy (**inferred**).

### Expressions

- Field names (`fieldToAggregate`, `outputFieldName`, `destinationFieldName`, include/exclude lists) commonly accept expressions (**inferred** from descriptor `stringOrExpression` and general expression docs).
- Mode / include enums are typically fixed options (`noDataExpression` style) (**inferred**).

## Acceptance tests

### Test: all item data → single list

**Given** input items:

```json
[
  { "json": { "id": 1, "name": "a" } },
  { "json": { "id": 2, "name": "b" } },
  { "json": { "id": 3, "name": "c" } }
]
```

**Parameters:**

```json
{
  "aggregate": "aggregateAllItemData",
  "destinationFieldName": "data",
  "include": "allFields"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "data": [
        { "id": 1, "name": "a" },
        { "id": 2, "name": "b" },
        { "id": 3, "name": "c" }
      ]
    }
  }
]
```

### Test: all item data — specified fields only

**Given** same three items.

**Parameters:**

```json
{
  "aggregate": "aggregateAllItemData",
  "destinationFieldName": "rows",
  "include": "specifiedFields",
  "fieldsToInclude": "id"
}
```

**Expect** output[0] single item:

```json
[
  {
    "json": {
      "rows": [{ "id": 1 }, { "id": 2 }, { "id": 3 }]
    }
  }
]
```

### Test: individual field

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } },
  { "json": { "id": 3 } }
]
```

**Parameters:**

```json
{
  "aggregate": "aggregateIndividualFields",
  "fieldsToAggregate": {
    "fieldToAggregate": [
      {
        "fieldToAggregate": "id",
        "renameField": false
      }
    ]
  }
}
```

**Expect** output[0]:

```json
[
  { "json": { "id": [1, 2, 3] } }
]
```

### Test: individual field with rename

**Given** same id items.

**Parameters:**

```json
{
  "aggregate": "aggregateIndividualFields",
  "fieldsToAggregate": {
    "fieldToAggregate": [
      {
        "fieldToAggregate": "id",
        "renameField": true,
        "outputFieldName": "ids"
      }
    ]
  }
}
```

**Expect** `{ "ids": [1, 2, 3] }` on the single output item.

### Test: keep missing vs drop

**Given** input:

```json
[
  { "json": { "v": 1 } },
  { "json": {} },
  { "json": { "v": null } },
  { "json": { "v": 4 } }
]
```

**Parameters:** individual field `v`, `options.keepMissing: false`.

**Expect** aggregated `v` ≈ `[1, 4]` (null/missing omitted).

**Parameters:** same with `options.keepMissing: true`.

**Expect** length 4 with `null` placeholders for missing/null positions (exact placement **inferred** as positional over input order).

### Test: merge lists

**Given** input:

```json
[
  { "json": { "tags": ["a", "b"] } },
  { "json": { "tags": ["c"] } }
]
```

**Parameters:** individual field `tags`, `options.mergeLists: false`.

**Expect** `tags: [["a","b"], ["c"]]`.

**Parameters:** `options.mergeLists: true`.

**Expect** `tags: ["a", "b", "c"]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Mode wire tokens `aggregateIndividualFields` / `aggregateAllItemData` | inferred | UI labels documented |
| `fieldsToAggregate` nesting / defaults | inferred | Docs describe fields, not fixedCollection shape |
| `destinationFieldName` default `data` | inferred | Descriptor default |
| `include` enum strings | inferred | Labels documented |
| `options.keepMissing` wire name | inferred | Docs: “Keep Missing And Null Values” |
| `options.keepOnlyUnique` | inferred | Descriptor only; binary uniqueness rules coarse |
| Empty input output shape | gap | Empty vs single empty aggregate item |
| Binary key merge algorithm | gap | Docs only say “include binary data” |
| Dot-path write key (full path vs leaf) | inferred | Prefer leaf name unless rename set |
| Shorthand `individualFields` / `allFields` | inferred | OpenFlow compatibility, not public Aggregate page |
| Paired-item multi-link | inferred | Engine-level |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/aggregate.ts`
- **Definition:** `src/lib/nodes/definitions/transform.ts` (`aggregate`)
- **SDK:** `defineNode` + native `ExecutionContext` only
