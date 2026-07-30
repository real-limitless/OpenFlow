# Spec: n8n-nodes-base.summarize

- **Type:** `n8n-nodes-base.summarize`
- **Display name:** Summarize
- **Group:** transform
- **Version:** 1, 1.1
- **Description:** Sum, count, max, etc. across items
- **Inputs:** main
- **Outputs:** main
- **Docs:** https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.summarize/

## Summary

The Summarize node aggregates item data using pivot-table semantics. It groups
input items by one or more "split by" fields, then computes one or more
aggregations (sum, count, average, min, max, etc.) per group.

## Parameters

### fieldsToSummarize (fixedCollection, required)

A list of aggregation rules. Each entry has:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `aggregation` | options | `count` | `append`, `average`, `concatenate`, `count`, `countUnique`, `max`, `min`, `sum` |
| `field` | string | `""` | Field to aggregate. Required for `average`/`sum`/`max`/`min`. Optional for `count`/`countUnique`/`append`/`concatenate`. |
| `includeEmpty` | boolean | `false` | Shown for `append`, `concatenate`, `count`, `countUnique`. When true, null/undefined/empty-string values are included. |
| `separateBy` | options | `,` | Shown for `concatenate`. Separator: `,`, `, `, `\n`, `""` (none), ` `, `other`. |
| `customSeparator` | string | `""` | Shown when `separateBy` = `other`. |

Default: `{ values: [{ aggregation: "count", field: "" }] }`

### fieldsToSplitBy (string)

Comma-separated field names to group by. When empty, all items form a single
group. Supports dot notation by default (e.g. `data.region`).

### options (collection)

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `continueIfFieldNotFound` | boolean | `false` | v1 only. When false, throws if a summarize field is missing from all items. When true, returns a single empty item. |
| `disableDotNotation` | boolean | `false` | Treat field paths literally (no `parent.child` resolution). |
| `outputFormat` | options | `separateItems` | `separateItems` = one item per group; `singleItem` = all groups packed into one item. |
| `skipEmptySplitFields` | boolean | `false` | Skip items that lack valid values for any split-by field. |

## Aggregations

| Aggregation | Requires field | Empty handling | Output field name |
|-------------|---------------|----------------|-------------------|
| `append` | optional | `includeEmpty` controls | `{field}` |
| `average` | yes | null/undefined/"" always ignored | `{field}` |
| `concatenate` | optional | `includeEmpty` controls | `{field}` |
| `count` | optional | `includeEmpty` controls (field); without field counts all items | `count` |
| `countUnique` | optional | `includeEmpty` controls (field); without field counts unique items | `countUnique` |
| `max` | yes | null/undefined/"" always ignored | `{field}` |
| `min` | yes | null/undefined/"" always ignored | `{field}` |
| `sum` | yes | null/undefined/"" always ignored | `{field}` |

### Numeric coercion

`average`, `sum`, `max`, `min` coerce string values to numbers via `Number()`.
Strings that are empty or produce `NaN` are skipped.

### Output field naming

- `count` and `countUnique` always use the aggregation name as the output key.
- All other aggregations use the input field name (leaf segment when dot notation
  is enabled) as the output key.
- Split-by fields appear in each output item under their leaf name (or full path
  when dot notation is disabled).

## Output formats

### separateItems (default)

One output item per group. Each item contains the split-by field values and the
aggregation results.

Input:
```json
[{"country": "US", "cost": 10}, {"country": "US", "cost": 20}, {"country": "UK", "cost": 5}]
```

With `fieldsToSummarize: [{aggregation: "sum", field: "cost"}]` and
`fieldsToSplitBy: "country"`:

```json
[{"country": "US", "cost": 30}, {"country": "UK", "cost": 5}]
```

### singleItem

All groups packed into a single output item. Split-by fields and aggregation
results become arrays (one element per group, in insertion order).

Same input as above with `options.outputFormat: "singleItem"`:

```json
[{"country": ["US", "UK"], "cost": [30, 5]}]
```

## Edge cases

- **No split-by fields, no items:** one output item with aggregations computed
  on an empty set (e.g. `count: 0`, `sum: 0`, `average: null`, `append: []`).
- **Split-by fields, no items:** zero output items (separateItems) or one item
  with empty arrays (singleItem).
- **`skipEmptySplitFields`:** items missing any split-by field value are
  excluded from grouping entirely.
- **Duplicate output field names** (e.g. `sum` and `max` on the same field):
  last write wins. This is a known limitation.

## Acceptance fixtures

### Fixture 1: sum grouped by a field

```
fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] }
fieldsToSplitBy: "country"
input: [{country:"US",cost:10},{country:"US",cost:20},{country:"UK",cost:5}]
expected: [{country:"US",cost:30},{country:"UK",cost:5}]
```

### Fixture 2: count without field, no split

```
fieldsToSummarize: { values: [{ aggregation: "count" }] }
input: [{a:1},{a:2},{a:3}]
expected: [{count:3}]
```

### Fixture 3: concatenate with separator

```
fieldsToSummarize: { values: [{ aggregation: "concatenate", field: "name", separateBy: ", " }] }
input: [{name:"a"},{name:"b"},{name:"c"}]
expected: [{name:"a, b, c"}]
```

### Fixture 4: singleItem output format

```
fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] }
fieldsToSplitBy: "country"
options: { outputFormat: "singleItem" }
input: [{country:"US",cost:10},{country:"UK",cost:5}]
expected: [{country:["US","UK"],cost:[10,5]}]
```

### Fixture 5: skipEmptySplitFields

```
fieldsToSummarize: { values: [{ aggregation: "count" }] }
fieldsToSplitBy: "country"
options: { skipEmptySplitFields: true }
input: [{country:"US",cost:1},{cost:2},{country:"UK",cost:3}]
expected: [{country:"US",count:1},{country:"UK",count:1}]
```

## Non-goals / TODOs

- `continueIfFieldNotFound` (v1 only) is accepted but not fully enforced.
- Binary data is not carried through.
- Expression evaluation in field names is not supported.