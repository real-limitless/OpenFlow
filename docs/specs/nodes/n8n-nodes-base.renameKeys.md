---
type: n8n-nodes-base.renameKeys
displayName: Rename Keys
category: Transform
versions: [1]
priority: high
status: specced
---

# Rename Keys

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys/ | Public docs only |
| Published node descriptor (type string, group, version, parameter names/defaults/enums) | Public descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.renameKeys`
- **Aliases:** (none)
- **Display name:** `Rename Keys`
- **Group / category:** `transform` · Core Nodes → Data Transformation (**inferred** from descriptor)
- **Versions:** `1` (`nodeVersion` 1.0 — **inferred** from descriptor; single version line)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 — one item per input item, with renamed keys (**documented**)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `keys` | fixedCollection (`multipleValues`, `sortable`) | `{}` | no | — | "Keys" — rows added via "Add new key". Wire shape: `keys.key[]` (**inferred** from descriptor) |
| `keys.key[].currentKey` | string | `''` | no (per row) | — | "Current Key Name". Supports dot-notation deep paths e.g. `level1.level2.currentKey` (**documented** in descriptor field description) |
| `keys.key[].newKey` | string | `''` | no (per row) | — | "New Key Name". Supports dot-notation deep paths e.g. `level1.level2.newKey` (**documented** in descriptor field description) |
| `additionalOptions` | collection | `{}` | no | — | "Additional Options" container (**inferred** from descriptor) |
| `additionalOptions.regexReplacement` | fixedCollection (`multipleValues`, `sortable`) | `{}` | no | — | "Regex" — rows added via "Add new regular expression". Wire shape: `additionalOptions.regexReplacement.replacements[]` (**inferred** from descriptor) |
| `additionalOptions.regexReplacement.replacements[].searchRegex` | string | `''` | no (per row) | — | "Regular Expression" — regex to match key names (**documented**) |
| `additionalOptions.regexReplacement.replacements[].replaceRegex` | string | `''` | no (per row) | — | "Replace With" — replacement name; supports regex captures `$1`, `$2`, … (**documented**) |
| `additionalOptions.regexReplacement.replacements[].options` | collection | `{}` | no | — | Regex-specific options container (**inferred** from descriptor) |
| `additionalOptions.regexReplacement.replacements[].options.caseInsensitive` | boolean | `false` | no | — | "Case Insensitive" — on = case-insensitive match (`i` flag); off = case-sensitive (**documented**) |
| `additionalOptions.regexReplacement.replacements[].options.depth` | number | `-1` | no | — | "Max Depth" — `-1` = unlimited, `0` = top-level only (**documented**) |

> **UI-only field:** `regExNotice` (a `notice`-type warning row inside `replacements`) carries no data and is not part of the wire contract (**inferred** from descriptor).

## Runtime behavior

### Role

Rename the keys of each item's JSON payload. The node does **not** create, drop,
or filter items — every input item maps to exactly one output item with the same
value payload, only the key names change (**documented**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`. Each item is
processed independently.

### Per-item processing

For each input item (**inferred** from descriptor behavior):

1. Deep-copy the item's `json` (so nested data can be renamed safely).
2. Reference `binary` unchanged (binary data is not modified).
3. Set `pairedItem` to `{ item: <inputIndex> }`.
4. Apply **simple renames** (`keys.key[]`) in row order.
5. Apply **regex replacements** (`additionalOptions.regexReplacement.replacements[]`) in row order.
6. Emit the transformed item on `output[0]`.

### Simple rename (keys.key[])

For each `{ currentKey, newKey }` row (**inferred** from descriptor behavior,
dot-notation documented in field descriptions):

- **Skip** the row if `currentKey` is empty, `newKey` is empty, or
  `currentKey === newKey`.
- Resolve the value at the `currentKey` path (dot-notation descends nested
  objects, e.g. `a.b` → `item.json.a.b`).
- **Skip** if the resolved value is `undefined` (key absent).
- Write the value to the `newKey` path (dot-notation creates/sets nested paths).
- Remove the `currentKey` path from the object.

### Regex replacement (additionalOptions.regexReplacement.replacements[])

For each `{ searchRegex, replaceRegex, options: { caseInsensitive, depth } }`
row (**documented** options; recursion semantics **inferred** from descriptor
behavior):

- Build a `RegExp` from `searchRegex`, adding the `i` flag when `caseInsensitive`
  is on.
- Recursively walk the JSON object up to `depth`:
  - `depth = -1` → unlimited descent (**documented**).
  - `depth = 0` → top-level keys only (**documented**).
  - `depth = N` → descend `N` levels.
- At each visited level, for each **object key** that matches the regex, replace
  it with `key.replace(regex, replaceRegex)` (supports `$1`, `$2`, … captures).
  Only rename when the new key differs from the original.
- **Array elements** are descended into (when depth permits) but array indices
  are never renamed.
- Object-valued properties are descended into before their owning key is
  considered for renaming.

### Order interaction (documented warning)

Regex replacements run **after** simple renames. A regex can therefore match and
re-rename keys that a simple rename just produced. Users should sequence
accordingly (**documented**).

### Output

- **output[0]:** one item per input item, with renamed keys. Values, item count,
  and binary data are preserved (**documented**).
- Empty input → empty output (not an error) (**inferred**).

### Errors

- A row that references a missing key is silently skipped (not an error)
  (**inferred**).
- An invalid `searchRegex` → node error from regex construction (**inferred**).
- `continueOnFail`: on a per-item error, emit an error item (`{ error: <message> }`
  with `pairedItem`) and continue; otherwise throw (**inferred** from descriptor
  behavior).

### Expressions

`currentKey`, `newKey`, `searchRegex`, and `replaceRegex` accept expressions
(`={{ … }}`) in general n8n fashion (**inferred** from general expression docs).
`caseInsensitive` and `depth` are not expression-driven (**inferred**).

## Acceptance tests

### Test: simple rename

**Given** input items:

```json
[
  { "json": { "old": 1 } }
]
```

**Parameters:**

```json
{
  "keys": { "key": [ { "currentKey": "old", "newKey": "new" } ] }
}
```

**Expect** output[0]:

```json
[
  { "json": { "new": 1 } }
]
```

### Test: multiple renames preserve values

**Given** input items:

```json
[
  { "json": { "first": "a", "second": "b" } }
]
```

**Parameters:**

```json
{
  "keys": { "key": [
    { "currentKey": "first", "newKey": "firstName" },
    { "currentKey": "second", "newKey": "lastName" }
  ] }
}
```

**Expect** output[0]:

```json
[
  { "json": { "firstName": "a", "lastName": "b" } }
]
```

### Test: dot-notation deep key rename

**Given** input items:

```json
[
  { "json": { "user": { "oldName": "Kim" } } }
]
```

**Parameters:**

```json
{
  "keys": { "key": [ { "currentKey": "user.oldName", "newKey": "user.fullName" } ] }
}
```

**Expect** output[0]:

```json
[
  { "json": { "user": { "fullName": "Kim" } } }
]
```

### Test: regex rename with capture group

**Given** input items:

```json
[
  { "json": { "user_name": "a", "user_age": 30 } }
]
```

**Parameters:**

```json
{
  "additionalOptions": {
    "regexReplacement": {
      "replacements": [
        {
          "searchRegex": "^user_(.*)",
          "replaceRegex": "$1",
          "options": { "caseInsensitive": false, "depth": 0 }
        }
      ]
    }
  }
}
```

**Expect** output[0] (top-level keys `user_name` → `name`, `user_age` → `age`):

```json
[
  { "json": { "name": "a", "age": 30 } }
]
```

### Test: regex case-insensitive with max depth

**Given** input items:

```json
[
  { "json": { "Name": { "SubKey": 1 } } }
]
```

**Parameters:**

```json
{
  "additionalOptions": {
    "regexReplacement": {
      "replacements": [
        {
          "searchRegex": "name",
          "replaceRegex": "label",
          "options": { "caseInsensitive": true, "depth": 0 }
        }
      ]
    }
  }
}
```

**Expect** output[0] (`depth: 0` → top-level only; `Name` → `label`, nested
`SubKey` untouched):

```json
[
  { "json": { "label": { "SubKey": 1 } } }
]
```

### Test: skip when currentKey equals newKey or key absent

**Given** input items:

```json
[
  { "json": { "same": 1, "present": 2 } }
]
```

**Parameters:**

```json
{
  "keys": { "key": [
    { "currentKey": "same", "newKey": "same" },
    { "currentKey": "missing", "newKey": "x" },
    { "currentKey": "present", "newKey": "value" }
  ] }
}
```

**Expect** output[0] (equal-key and missing-key rows skipped):

```json
[
  { "json": { "same": 1, "value": 2 } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Rename via Current Key Name + New Key Name | documented | Primary contract |
| Multiple key rows ("Add new key") | documented | |
| Dot-notation deep keys for current/new key | documented (descriptor field description) | Not on the public docs page |
| Regex option: Regular Expression + Replace With | documented | |
| Replace With supports `$1`, `$2` captures | documented | |
| Case Insensitive flag | documented | |
| Max Depth: -1 unlimited, 0 top-level only | documented | Recursion semantics inferred |
| Regex can re-match already-renamed keys (order) | documented | Warning in docs |
| Wire tokens `keys`, `keys.key[]`, `currentKey`, `newKey` | inferred | From descriptor |
| Wire tokens `additionalOptions`, `regexReplacement`, `replacements[]`, `searchRegex`, `replaceRegex`, `options`, `caseInsensitive`, `depth` | inferred | From descriptor |
| Per-item deep-copy + binary-by-reference + pairedItem | inferred | From descriptor behavior |
| Simple rename skip rules (empty/equal/undefined) | inferred | From descriptor behavior |
| Array indices never renamed; descent order | inferred | From descriptor behavior |
| continueOnFail error-item shape | inferred | From descriptor behavior |
| nodeVersion 1.0, single version, group transform | inferred | Descriptor |
| `regExNotice` is UI-only (not wire data) | inferred | Descriptor `notice` type |

## OpenFlow mapping

- **Definition group:** `transform` (`src/lib/nodes/definitions/transform.ts` → `renameKeys`)
- **Executor file:** `src/lib/engine/executors/rename-keys.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Related specs:** Edit Fields / Set (`n8n-nodes-base.set`) adds/edits values; Rename Keys only changes key names. Aggregate / Split Out restructure item shape rather than renaming keys.