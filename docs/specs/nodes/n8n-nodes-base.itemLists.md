---
type: n8n-nodes-base.itemLists
displayName: Item Lists
category: Transform
versions: [1, 2, 2.1, 2.2, 3, 3.1]
priority: medium
status: specced
---

# Item Lists

## Sources

| URL | Source class |
|-----|----------------|
| Public docs page returns 404 — node is hidden/legacy | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

The public documentation page for this type string no longer exists. The node is present in the npm package catalog as a `hidden: true` legacy node for workflow-import backward compatibility. Each operation has a successor dedicated node type.

## Wire format

- **Type string:** `n8n-nodes-base.itemLists`
- **Aliases:** Aggregate, Dedupe, Deduplicate, Duplicates, Limit, Remove, Slice, Sort, Split, Unique, JSON, Transform, Array, List, Object, Item, Map, Format, Nested, Iterate, Summarise, Summarize, Group, Pivot, Sum, Count, Min, Max
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hidden in UI:** `true` (import compatibility only)

### Version evolution

- **V1** (1.0): 6 operations, string fieldToSplitOut (single field), fixedCollection fieldsToInclude/fieldsToExclude, sort options under options collection
- **V2** (2.0, 2.1, 2.2): Renamed `fieldToSplitOut` → `fieldToSplitOut` (plural, comma-separated), same structure otherwise
- **V3** (3.0, 3.1): Restructured with resource/operation model, includes `disableDotNotation` shared param, `concatenateItems` renamed from `aggregateItems`, `splitOutItems` gains `includeBinary`/`destinationFieldName` options, `sort` gains `disableDotNotation` in options, `summarize` gains `outputFormat`/`skipEmptySplitFields`/`disableDotNotation`
- **Default version:** 3.1

## Parameters

### Resource (hidden, fixed)

| name | type | default | notes |
|------|------|---------|-------|
| resource | hidden | `itemList` | Fixed; always `"itemList"` |

### Operation

| name | type | default | required | displayOptions.resource | notes |
|------|------|---------|----------|------------------------|-------|
| operation | options | `splitOutItems` | yes | `itemList` | Selects which transformation to apply |

### Per-operation parameters

#### concatenateItems (aggregate)

Combines fields from multiple input items into a single output item containing lists.

| name | type | default | notes |
|------|------|---------|-------|
| aggregate | options | `aggregateIndividualFields` | `aggregateIndividualFields` — one output field per input field; `aggregateAllItemData` — all data into a single list field |
| fieldsToAggregate | fixedCollection | — | Sub-fields: `fieldToAggregate` (string, input field name), `renameField` (boolean), `outputFieldName` (string) |
| include | options | `allFields` | `allFields`, `specifiedFields`, `allFieldsExcept` — controls which fields appear in the output |
| fieldsToInclude | string | — | Comma-separated field names (when include=`specifiedFields`) |
| fieldsToExclude | string | — | Comma-separated field names (when include=`allFieldsExcept`) |
| destinationFieldName | string | `data` | Output field name for the aggregated list |
| options.mergeLists | boolean | false | Merge nested lists into a single flat list |
| options.includeBinaries | boolean | false | Include binary data in the output item |
| options.keepOnlyUnique | boolean | false | Deduplicate binaries by MIME/type/size/extension |
| options.keepMissing | boolean | false | Add null entries for missing/null values |

#### limit

Truncates the item list to a maximum count.

| name | type | default | notes |
|------|------|---------|-------|
| maxItems | number | — | Maximum number of items to keep |
| keep | options | `firstItems` | `firstItems` or `lastItems` |

#### removeDuplicates

Removes items that are duplicates based on field comparison.

| name | type | default | notes |
|------|------|---------|-------|
| compare | options | `allFields` | `allFields`, `allFieldsExcept`, `selectedFields` |
| fieldsToCompare | string | — | Comma-separated field names (when compare=`selectedFields`) |
| fieldsToExclude | string | — | Comma-separated field names (when compare=`allFieldsExcept`) |
| options.removeOtherFields | boolean | false | Remove non-compared fields from output; keeps first-duplicate values if disabled |

#### sort

Reorders items by specified field values.

| name | type | default | notes |
|------|------|---------|-------|
| type | options | `simple` | `simple`, `random`, `code` |
| sortFieldsUi.sortField[].fieldName | string | — | Field to sort by |
| sortFieldsUi.sortField[].order | options | `ascending` | `ascending` or `descending` |
| code | string | — | JavaScript comparator when type=`code` |
| options.disableDotNotation | boolean | false | Disallow `parent.child` field references |

#### splitOutItems

Splits array-valued fields into separate output items.

| name | type | default | notes |
|------|------|---------|-------|
| fieldToSplitOut | string | — | Comma-separated field names to split. For binary data, use `$binary` |
| include | options | `noOtherFields` | `noOtherFields`, `allOtherFields`, `selectedOtherFields` |
| fieldsToInclude | string | — | Comma-separated field names (when include=`selectedOtherFields`) |
| options.destinationFieldName | string | — | Output field name for the split field contents |
| options.includeBinary | boolean | false | Include binary data in split items |

#### summarize

Pivot-table aggregation: groups items by split fields and computes aggregations.

| name | type | default | notes |
|------|------|---------|-------|
| fieldsToSummarize | fixedCollection | — | Sub-fields: `values[].field` (string), `values[].aggregation` (options: `append`, `average`, `concatenate`, `count`, `countUnique`, `max`, `min`, `sum`), `values[].includeEmpty` (boolean) |
| fieldsToSplitBy | string | — | Comma-separated field names to group/split by |
| options.outputFormat | options | `separateItems` | `separateItems` (one item per split value) or `singleItem` (all splits in one output item) |
| options.skipEmptySplitFields | boolean | false | Ignore items where the split-by field is empty |
| options.disableDotNotation | boolean | false | Disallow `parent.child` field references |

For the concatenate aggregation, additional appearance options are available: `separateBy` (options: `,`, `, `, `\n`, ` `, `none`, `other`) and `customSeparator` (string).

## Runtime behavior

### Input

Each operation receives the full item list on `main[0]`. All operations process all items in a single pass; there is no per-item iteration.

### Output

Each operation outputs a single stream on `main[0]`:

- **concatenateItems:** one output item (or fewer, depending on `include` mode) with each aggregated field containing an array of values
- **limit:** N items where N = min(input length, maxItems), in original or reversed order depending on `keep`
- **removeDuplicates:** subset of input items with duplicates removed; first occurrence of each unique combination is kept
- **sort:** all input items reordered; `simple` sort sorts by field value (lexicographic for strings, numeric for numbers), `random` shuffles, `code` uses a user-provided JavaScript comparator
- **splitOutItems:** each element of the specified array fields becomes a separate output item; other fields are included/excluded per `include` mode
- **summarize:** one output item per unique combination of `fieldsToSplitBy` values, with computed aggregations; or all in a single item depending on `outputFormat`

### Errors

- Missing required fields (e.g., no `fieldToSplitOut`, no `fieldsToAggregate` entries) produce a validation error
- Invalid `maxItems` (negative/NaN) clamps to 0
- `sort` with `code` type and invalid JavaScript throws an execution error
- `removeDuplicates` warns when field types vary across items
- `summarize` with no `fieldsToSplitBy` outputs a single aggregate row

### Expressions

All string parameters accept expressions. `code` (sort) accepts a JavaScript expression string.

## Acceptance tests

### Test: concatenateItems — individual fields

**Given** input items:

```json
[
  { "json": { "name": "a", "val": 1 } },
  { "json": { "name": "b", "val": 2 } }
]
```

**Parameters:**

```json
{
  "resource": "itemList",
  "operation": "concatenateItems",
  "aggregate": "aggregateIndividualFields",
  "fieldsToAggregate": {
    "values": [
      { "fieldToAggregate": "name", "renameField": false },
      { "fieldToAggregate": "val", "renameField": false }
    ]
  },
  "include": "allFields",
  "destinationFieldName": "data"
}
```

**Expect** output[0] to contain a single item where `name` is `["a", "b"]` and `val` is `[1, 2]`.

### Test: limit — keep first 2

**Given** 4 items with `{ "i": 1..4 }`.

**Parameters:**

```json
{
  "resource": "itemList",
  "operation": "limit",
  "maxItems": 2,
  "keep": "firstItems"
}
```

**Expect** 2 items with `i` = 1, 2.

### Test: removeDuplicates — all fields

**Given** 3 items with `{ "x": 1, "y": 2 }`, `{ "x": 1, "y": 2 }`, `{ "x": 2, "y": 3 }`.

**Parameters:**

```json
{
  "resource": "itemList",
  "operation": "removeDuplicates",
  "compare": "allFields"
}
```

**Expect** 2 items: `{ "x": 1, "y": 2 }` and `{ "x": 2, "y": 3 }`.

### Test: splitOutItems — array field

**Given** 1 item with `{ "id": 1, "tags": ["a", "b", "c"] }`.

**Parameters:**

```json
{
  "resource": "itemList",
  "operation": "splitOutItems",
  "fieldToSplitOut": "tags",
  "include": "allOtherFields"
}
```

**Expect** 3 items, each with `id` = 1 and `tags` = `"a"`, `"b"`, `"c"` respectively.

### Test: summarize — count grouped by field

**Given** 3 items: `{ "cat": "x", "val": 1 }`, `{ "cat": "x", "val": 2 }`, `{ "cat": "y", "val": 3 }`.

**Parameters:**

```json
{
  "resource": "itemList",
  "operation": "summarize",
  "fieldsToSummarize": {
    "values": [
      { "field": "val", "aggregation": "sum" }
    ]
  },
  "fieldsToSplitBy": "cat",
  "options": { "outputFormat": "separateItems" }
}
```

**Expect** 2 items: `{ "cat": "x", "val": 3 }` and `{ "cat": "y", "val": 3 }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public docs | 404 | The page at `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.itemLists.md` does not exist |
| Node hidden status | confirmed from descriptor | `hidden: true` in compiled node metadata |
| V3 parameter names and defaults | confirmed from descriptor | Extracted from compiled JS description arrays |
| V1/V2 vs V3 differences | confirmed from descriptor | V1/V2 use `fixedCollection` for fieldsToInclude/fieldsToExclude, V3 uses string |
| Version default | confirmed from descriptor | `defaultVersion: 3.1` |
| Operation descriptions | confirmed from descriptor | Extracted from operation option definitions |
| Successor mapping | inferred | Each operation has a dedicated successor node type (limit, sort, removeDuplicates, splitOut, summarize) |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/item-lists.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only