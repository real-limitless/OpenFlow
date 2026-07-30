---
type: n8n-nodes-base.sort
displayName: Sort
category: Transform
versions: [1]
priority: high
status: specced
---

# Sort

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort/ | Public docs only |
| https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort | Public reference (referenced by node docs for sort semantics) |
| Published node descriptor (type string, aliases, category, nodeVersion) | Public descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.sort`
- **Aliases:** `Sort`, `Order`, `Transform`, `Array`, `List`, `Item`, `Random` (**inferred** from published descriptor)
- **Display name:** `Sort`
- **Group / category:** `transform` · Core Nodes → Data Transformation (**inferred** from descriptor subcategories)
- **Versions:** `1` (`nodeVersion` 1.0 — **inferred** from descriptor; single version line)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 — the same items, reordered (**documented**)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `type` | options | `simple` | yes | — | Enum: `simple` \| `random` \| `code` (**documented** labels Simple / Random / Code; wire tokens **inferred**) |
| `fieldToSortBy` | fixedCollection (`multipleValues`) | `[]` | yes | `type` = `simple` | Rows added via "Add Field To Sort By". Each row: `fieldName` + `order` (**documented** multi-field add; wire name **inferred**) |
| `fieldToSortBy[].fieldName` | string | — | yes (per row) | — | Field path to sort by; supports dot notation `parent.child` unless disabled (**documented**) |
| `fieldToSortBy[].order` | options | `ascending` | yes (per row) | — | Enum: `ascending` \| `descending` (**documented** labels; wire tokens **inferred**) |
| `disableDotNotation` | boolean | `false` | no | `type` = `simple` | "Disable Dot Notation" Simple option. Default off → dot notation enabled (`parent.child` resolves child). On → field name treated literally (**documented**) |
| `code` | string | — | yes | `type` = `code` | Custom JavaScript comparator body (**documented**) |

> **Multi-field sort:** rows are evaluated in order — first row is the primary key, subsequent rows break ties (**inferred** from "Add Field To Sort By" repeated-add UI semantics).

## Runtime behavior

### Role

Reorder the incoming item list into a desired ordering, or produce a random
shuffle. The node does **not** filter, drop, or create items — every input item
appears exactly once on the output, only its position changes (**documented**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`. The list is treated
as a whole; individual items are not transformed.

### Type: simple

1. For each sort-field row, resolve the field value on every item. With dot
   notation enabled (default), `parent.child` descends into nested objects
   (**documented**).
2. Sort the item array. **Array sort behavior (documented):** the Sort operation
   uses the default JavaScript `Array.prototype.sort` semantics where elements
   are converted to strings and compared lexicographically. Refer to MDN
   `Array/sort`. Consequence: a numeric-looking field like `10` sorts as the
   string `"10"`, so ascending order of `[2, 10, 1]` is `[1, 10, 2]`, **not**
   `[1, 2, 10]`.
3. Apply `order`: `ascending` = default sort direction; `descending` = reversed
   (**documented**).
4. Multiple field rows: sort stably by the primary key first, then re-sort by
   each subsequent key only where the prior key ties (multi-key ordering)
   (**inferred**).

### Type: random

Produce a random permutation of the input list. Every input item is present
exactly once; only the order is randomized (**documented**). No field selection
applies.

### Type: code

Evaluate the user-supplied JavaScript **Code** as a comparator and sort the
items accordingly (**documented**). The code is expected to return a comparison
result following standard comparator semantics (negative / zero / positive).
This is the escape hatch when a simple sort is insufficient.

### Output

- **output[0]:** the reordered item array. Each item preserves its original
  `json` / `binary` / pairing payload; only position changes (**documented**).
- Empty input → empty output (not an error) (**inferred**).

### Errors

- Missing / non-resolvable field on an item under `simple` — treat as
  `undefined` for comparison (sorts to one end) or raise per engine policy
  (**gap**; prefer fail-soft `undefined` placement).
- Invalid `code` under `code` type → node error from the code evaluation
  (**inferred**).
- `continueOnFail`: follow global engine policy; Sort has no per-item fail output
  (**inferred**).

### Expressions

`fieldName` and `code` accept expressions (`={{ … }}`) in general n8n fashion
(**inferred** from general expression docs). `type`, `order` enums and the
`disableDotNotation` flag are not expression-driven (**inferred**).

## Acceptance tests

### Test: simple ascending numbers (string-conversion semantics)

**Given** input items:

```json
[
  { "json": { "n": 2 } },
  { "json": { "n": 10 } },
  { "json": { "n": 1 } }
]
```

**Parameters:**

```json
{
  "type": "simple",
  "fieldToSortBy": [{ "fieldName": "n", "order": "ascending" }]
}
```

**Expect** output[0] (documented JS string-sort behavior — `10` precedes `2`):

```json
[
  { "json": { "n": 1 } },
  { "json": { "n": 10 } },
  { "json": { "n": 2 } }
]
```

### Test: simple descending strings

**Given** input items:

```json
[
  { "json": { "name": "c" } },
  { "json": { "name": "a" } },
  { "json": { "name": "b" } }
]
```

**Parameters:**

```json
{
  "type": "simple",
  "fieldToSortBy": [{ "fieldName": "name", "order": "descending" }]
}
```

**Expect** output[0]:

```json
[
  { "json": { "name": "c" } },
  { "json": { "name": "b" } },
  { "json": { "name": "a" } }
]
```

### Test: dot notation nested field

**Given** input items:

```json
[
  { "json": { "user": { "age": 3 } } },
  { "json": { "user": { "age": 1 } } },
  { "json": { "user": { "age": 2 } } }
]
```

**Parameters:**

```json
{
  "type": "simple",
  "fieldToSortBy": [{ "fieldName": "user.age", "order": "ascending" }]
}
```

**Expect** output[0] ordered by resolved `user.age`: `1`, `2`, `3`.

### Test: disable dot notation treats name literally

**Given** input items with a literal key `"user.age"`:

```json
[
  { "json": { "user.age": 3 } },
  { "json": { "user.age": 1 } }
]
```

**Parameters:**

```json
{
  "type": "simple",
  "disableDotNotation": true,
  "fieldToSortBy": [{ "fieldName": "user.age", "order": "ascending" }]
}
```

**Expect** output[0] ordered by the literal field: `1`, `3`.

### Test: random is a permutation

**Given** input items `n = 1, 2, 3, 4, 5`.

**Parameters:**

```json
{ "type": "random" }
```

**Expect** output[0]: a permutation of the input — same 5 items, each exactly
once, order randomized (assert set equality + length, not a fixed sequence).

### Test: code comparator

**Given** input items `n = 3, 1, 2`.

**Parameters:**

```json
{ "type": "code", "code": "return a.json.n - b.json.n;" }
```

**Expect** output[0] ordered `1`, `2`, `3` (numeric comparator overrides default
string-sort).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three types: Simple, Random, Code | documented | Primary contract |
| Simple uses Field Name + Ascending/Descending | documented | |
| Multi-field "Add Field To Sort By" | documented | Tie-break ordering inferred |
| Disable Dot Notation default + meaning | documented | |
| JS `Array.sort` string-conversion semantics | documented | Key non-numeric behavior |
| Random = permutation, no field selection | documented | |
| Code = custom JS comparator | documented | Comparator return contract inferred |
| Wire tokens `type`, `fieldToSortBy`, `fieldName`, `order`, `disableDotNotation`, `code` | inferred | Public docs give labels; exact wire keys from export shapes |
| Enum tokens `simple`/`random`/`code`, `ascending`/`descending` | inferred | Labels documented |
| nodeVersion 1.0, single version | inferred | Descriptor |
| Aliases list | inferred | Descriptor |
| Missing-field handling under simple | gap | Prefer `undefined` placement |
| `code` execution sandbox / available vars (`a`, `b`, `$json`) | partial | Documented as custom JS; exact binding surface inferred |
| Multi-field stability / equal-key preservation | inferred | Standard stable-sort expectation |

## OpenFlow mapping

- **Definition group:** `transform` (`src/lib/nodes/definitions/transform.ts` → `sort`)
- **Executor file:** `src/lib/engine/executors/sort.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Related specs:** Filter (`n8n-nodes-base.filter`) reorders by dropping; Sort reorders by position only