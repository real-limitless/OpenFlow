---
type: n8n-nodes-base.splitOut
displayName: Split Out
category: Transform
versions: [1]
priority: high
status: specced
---

# Split Out

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.splitOut`
- **Aliases (UI search / codex only, not alternate type strings):** Split, Nested, Transform, Array, List, Item (**inferred** from published descriptor)
- **Display name:** `Split Out`
- **Group / category:** `transform` · Core Nodes · Data Transformation
- **Versions:** `1`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Related:** reverse of Aggregate (`n8n-nodes-base.aggregate`); legacy Item Lists split mode maps here for import compatibility

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| fieldToSplitOut | string | `""` | yes | — | **Field(s) to Split Out** — name of the input field holding the list. Comma-separated for multiple fields. For binary-keyed split, docs allow `$binary` in an expression (**documented**). Wire name **inferred** from descriptor / exports |
| include | options | `noOtherFields` | no | — | Whether/how to copy other input fields onto each new item (**documented** labels; wire values **inferred**) |
| fieldsToInclude | string | `""` | when selected | show when `include` = `selectedOtherFields` | Comma-separated field names to keep (**documented** as Fields to Include; wire name **inferred**) |
| options | collection | `{}` | no | — | Nested options below |
| options.disableDotNotation | boolean | `false` | no | — | When **on**, treat field paths literally (no `parent.child` resolution). Default off = dot notation enabled (**documented**; default **inferred**) |
| options.destinationFieldName | string | `""` | no | — | Output field under which to place each split element (**documented**). Empty → element objects spread / primitives use source field basename (**inferred**) |
| options.includeBinary | boolean | `false` | no | — | When **on**, copy input item binary onto each output item; when **off**, omit binary (**documented**; default **inferred**) |

### `include` enum

| Wire value (**inferred**) | UI label (**documented**) |
|---------------------------|---------------------------|
| `noOtherFields` | No Other Fields |
| `allOtherFields` | All Other Fields |
| `selectedOtherFields` | Selected Other Fields |

> Older incomplete notes mentioned `options.ignoreMissingFields`. That flag is **not** on the current public docs page or published descriptor — **do not** require it for wire compatibility.

## Runtime behavior

### Role

Turn a **list inside one or more input items** into **separate items** (one item per list element). Example: one item with a customer array → one item per customer (**documented**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`. Process **each input item independently**, then concatenate results in input order (**inferred** stable order).

### Resolve the list

1. Read `fieldToSplitOut` (expression-capable). Trim; support comma-separated multi-field names when the descriptor marks multi path (**inferred** from “separate multiple field names by commas”).
2. Unless `options.disableDotNotation` is true, resolve nested paths with dot notation (`parent.child`) (**documented**).
3. The resolved value should be an **array** (or array-like list). Non-array handling:
   - Missing field / `undefined` / `null` → emit nothing for that field/item, or node error — **gap** (prefer empty contribution vs hard fail unless product always errors).
   - Scalar / object (non-array) → treat as single-element list **or** error — **gap**; acceptance fixtures below assume real arrays.
4. Binary path: when the field expression targets `$binary`, split by binary keys/entries rather than `json` — **documented** intent; exact item shape **gap**.

### Build each output item (per array element)

For each element `el` of the resolved array, in order:

1. **Base fields from include mode** (**documented**):
   - `noOtherFields`: start from `{}` (no sibling fields from the parent item).
   - `allOtherFields`: shallow-copy parent `json`, then remove/replace the field being split so it is not left as the full array (**inferred** cleanup).
   - `selectedOtherFields`: copy only names listed in `fieldsToInclude` (dot notation subject to the same disable flag) (**documented** + **inferred** path rules).
2. **Place the element**:
   - If `options.destinationFieldName` is non-empty → set `json[destinationFieldName] = el` (for object elements, still wrap under that key unless product spreads — **docs say “under which to put the split field contents”** → **wrap** under destination).
   - If destination is empty and `el` is a plain object → **spread** object keys onto the base item (**inferred** common UX; matches “item for each customer” examples).
   - If destination is empty and `el` is a primitive / array → place under the **leaf name** of the source field (last segment of the path) (**inferred**).
3. **Binary:** if `options.includeBinary` and the parent had `binary`, attach a copy to the new item; else omit (**documented**).
4. **pairedItem:** point back to the parent input item index (**inferred** engine pairing policy).

### Multiple fields in `fieldToSplitOut`

When several comma-separated fields are given, produce items for elements of each field. Zip vs cartesian vs sequential concatenation is **not** documented — **gap**. Prefer **sequential** (all elements of field A, then field B) unless exports prove otherwise; multi-field + multi-destination alignment is **gap**.

### Output

- **output[0]:** flat list of items produced from all input items × all split elements.
- Empty input, empty arrays, or no resolvable lists → `[]` on output 0 (not an error) (**inferred**).
- Does **not** change branch topology (single `main` out).

### Errors

- Required `fieldToSplitOut` empty → validation / node error (**inferred**).
- Unresolvable path when not ignoring missing data — **gap**.
- Expression failures on field names — engine policy (**inferred**).
- `continueOnFail`: follow global engine policy; no special error output (**inferred**).

### Expressions

`fieldToSplitOut`, `fieldsToInclude`, and `options.destinationFieldName` accept expressions / data paths in the UI (**inferred**). `include` and boolean options are typically fixed enums (`noDataExpression` style) (**inferred**).

## Acceptance tests

### Test: split primitive array (no other fields)

**Given** input items:

```json
[
  { "json": { "names": ["a", "b"], "keep": 1 } }
]
```

**Parameters:**

```json
{
  "fieldToSplitOut": "names",
  "include": "noOtherFields"
}
```

**Expect** output[0]:

```json
[
  { "json": { "names": "a" } },
  { "json": { "names": "b" } }
]
```

(`keep` must **not** appear.)

### Test: split object array with all other fields

**Given** input items:

```json
[
  {
    "json": {
      "users": [{ "id": 1 }, { "id": 2 }],
      "batch": "B1"
    }
  }
]
```

**Parameters:**

```json
{
  "fieldToSplitOut": "users",
  "include": "allOtherFields"
}
```

**Expect** output[0] (order preserved; `users` array not retained as whole list):

```json
[
  { "json": { "id": 1, "batch": "B1" } },
  { "json": { "id": 2, "batch": "B1" } }
]
```

### Test: selected other fields

**Given:**

```json
[
  {
    "json": {
      "tags": ["x", "y"],
      "email": "a@b.c",
      "secret": "no"
    }
  }
]
```

**Parameters:**

```json
{
  "fieldToSplitOut": "tags",
  "include": "selectedOtherFields",
  "fieldsToInclude": "email"
}
```

**Expect** output[0]:

```json
[
  { "json": { "tags": "x", "email": "a@b.c" } },
  { "json": { "tags": "y", "email": "a@b.c" } }
]
```

(`secret` omitted.)

### Test: destination field name wraps element

**Given:**

```json
[{ "json": { "items": [{ "sku": "A" }, { "sku": "B" }] } }]
```

**Parameters:**

```json
{
  "fieldToSplitOut": "items",
  "include": "noOtherFields",
  "options": { "destinationFieldName": "row" }
}
```

**Expect** output[0]:

```json
[
  { "json": { "row": { "sku": "A" } } },
  { "json": { "row": { "sku": "B" } } }
]
```

### Test: nested path + empty array

**Given:**

```json
[
  { "json": { "data": { "ids": [] }, "n": 1 } },
  { "json": { "data": { "ids": [10] }, "n": 2 } }
]
```

**Parameters:**

```json
{
  "fieldToSplitOut": "data.ids",
  "include": "allOtherFields",
  "options": { "disableDotNotation": false }
}
```

**Expect** output[0]: one item from the second input only, with split value `10` under leaf key `ids` (or destination if set) and other fields retained per include rules — exact key layout after nested split is **partially inferred**:

```json
[{ "json": { "ids": 10, "n": 2 } }]
```

(First input contributes nothing.)

### Test: includeBinary off by default

**Given** parent item with `binary: { file: { ... } }`, split a one-element json array, `options.includeBinary` omitted/false.

**Expect** output items have **no** `binary` (or empty), matching docs default off.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose: list field → N items | documented | Primary contract |
| Include modes (none / all / selected) | documented | |
| Fields to Include when selected | documented | |
| Disable dot notation | documented | |
| Destination field name | documented | Wrap under named field |
| Include binary option | documented | |
| Parameter wire names + defaults + include enums | inferred | Published descriptor / exports |
| Object elements spread when destination empty | inferred | Common UX; confirm in implement tests |
| Primitive under leaf field name | inferred | |
| Removing original array under `allOtherFields` | inferred | Avoid leaving full array on each row |
| Multi-field comma split semantics | gap | Sequential vs zip |
| Non-array / missing field | gap | Empty vs error |
| `$binary` split item shape | gap | Docs mention only |
| pairedItem linkage | inferred | Engine-wide |
| `ignoreMissingFields` | absent | Not in current docs/descriptor |

## OpenFlow mapping

- **Definition group:** `transform` (`src/lib/nodes/definitions/transform.ts` → `splitOut`)
- **Executor file:** `src/lib/engine/executors/split-out.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Related specs:** Aggregate (`n8n-nodes-base.aggregate`), Item Lists legacy (`n8n-nodes-base.itemLists`)
