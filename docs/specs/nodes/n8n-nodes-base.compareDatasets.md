---
type: n8n-nodes-base.compareDatasets
displayName: Compare Datasets
category: Transform
versions: [1, 2, 2.1, 2.2, 2.3]
priority: high
status: specced
---

# Compare Datasets

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.comparedatasets.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.comparedatasets/ | Public docs only |
| Published node descriptor (type string, aliases, category, nodeVersion, inputs/outputs, parameter names/defaults/enums) | Public descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.compareDatasets`
- **Aliases:** `Join`, `Concatenate`, `Compare`, `Dataset`, `Split`, `Sync`, `Syncing` (**inferred** from published descriptor)
- **Display name:** `Compare Datasets`
- **Group / category:** `transform` · Core Nodes → Flow (**inferred** from descriptor subcategories)
- **Versions:** `1`, `2`, `2.1`, `2.2`, `2.3` (`nodeVersion` 1.0 / 2.x — **inferred** from descriptor; latest line is 2.3)
- **Inputs:** `main` × 2, named **Input A** (index 0) and **Input B** (index 1)
- **Required inputs:** 1 — Input A is required; Input B may be empty (**inferred** from descriptor `requiredInputs: 1`)
- **Outputs:** `main` × 4, named **In A only** (0), **Same** (1), **Different** (2), **In B only** (3) (**documented**)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `mergeByFields` | fixedCollection (`multipleValues`) | `{ "values": [{ "field1": "", "field2": "" }] }` | yes | — | "Fields to Match". Each row pairs an Input A field (`field1`) with an Input B field (`field2`). Multiple rows = match on multiple fields (**documented**) |
| `mergeByFields.values[].field1` | string | `""` | yes (per row) | — | "Input A Field". Field name or expression path from input A (`requiresDataPath: single`) (**inferred**) |
| `mergeByFields.values[].field2` | string | `""` | yes (per row) | — | "Input B Field". Field name or expression path from input B (`requiresDataPath: single`) (**inferred**) |
| `resolve` | options | `preferInput2` (v1/v2) · `includeBoth` (v2.1+) | yes | — | "When There Are Differences". Enum: `preferInput1` \| `preferInput2` \| `mix` \| `includeBoth` (**documented** labels; defaults/enum **inferred** from descriptor) |
| `fuzzyCompare` | boolean | `false` | no | `@version` ≠ 1 (top-level) | "Fuzzy Compare" — tolerate small type differences (e.g. `3` == `"3"`). Top-level in v2+; nested under `options` in v1 (**documented**) |
| `preferWhenMix` | options | `input1` | no | `resolve` = `mix` | "Prefer". Enum: `input1` (Input A Version) \| `input2` (Input B Version) (**documented**; wire tokens **inferred**) |
| `exceptWhenMix` | string | `""` | no | `resolve` = `mix` | "For Everything Except" — comma-separated field names pulled from the non-preferred input (`requiresDataPath: multiple`) (**documented**) |
| `options` | collection | `{}` | no | — | Container for optional refinements (**inferred**) |
| `options.skipFields` | string | `""` | no | — | "Fields to Skip Comparing" — comma-separated field names ignored when judging same/different (`requiresDataPath: multiple`) (**documented**) |
| `options.fuzzyCompare` | boolean | `false` | no | `@version` = 1 | v1-only Fuzzy Compare (moved to top-level in v2+) (**inferred** from descriptor) |
| `options.disableDotNotation` | boolean | `false` | no | — | "Disable Dot Notation". Off (default) → `parent.child` resolves nested child. On → field name treated literally (**documented**) |
| `options.multipleMatches` | options | `first` | no | — | "Multiple Matches". Enum: `first` (Include First Match Only) \| `all` (Include All Matches). Descriptor default is `first`; public docs prose states default is "Include All Matches" (**documented**; discrepancy flagged below) |

> **Two-stage comparison (documented):**
> 1. Pair items across the two inputs where the *Fields to Match* values are equal.
> 2. For each paired item, compare all remaining fields to classify it as **Same** or **Different**.

## Runtime behavior

### Role

Compare two input datasets and route each item to one of four output branches based
on whether it found a match in the other input and whether the matched pair is
identical or differs (**documented**).

### Input

- **Input A** (index 0): `{ json, binary?, pairedItem? }[]` — the first dataset.
- **Input B** (index 1): `{ json, binary?, pairedItem? }[]` — the second dataset.
- Input B may be empty (only Input A is required); an empty B sends every A item
  to the "In A only" branch (**inferred** from `requiredInputs: 1`).

### Pairing stage

1. For each match-field row, resolve the `field1` value on every A item and the
   `field2` value on every B item. With dot notation enabled (default),
   `parent.child` descends into nested objects (**documented**).
2. Two items pair when **all** match-field row values are equal across A and B
   (**documented** — multiple fields form a composite key).
3. **Fuzzy Compare** (when on) tolerates type coercion during the equality test:
   the number `3` and the string `"3"` are treated as equal (**documented**).

### Multiple matches

- `all` — every A↔B pair that shares the key is emitted (**documented**).
- `first` — only the first matching B item is paired with each A item; remaining
  duplicates flow to the appropriate branch (**documented**).

### Classification stage

For each paired (A, B) item, compare **all** fields (excluding any listed in
`options.skipFields`). With `disableDotNotation` off, nested paths are compared
as resolved values; with it on, only literal top-level keys are compared
(**documented**).

- All compared fields equal → **Same** branch (output 1).
- Any compared field differs → **Different** branch (output 2), resolved per
  `resolve` (see below).
- Unpaired A items → **In A only** branch (output 0).
- Unpaired B items → **In B only** branch (output 3).

### Resolve (Different branch output shape)

| `resolve` | Output item |
|-----------|-------------|
| `preferInput1` | The Input A version of the differing pair (**documented**) |
| `preferInput2` | The Input B version of the differing pair (**documented**) |
| `mix` | Start from the `preferWhenMix` input; for field names listed in `exceptWhenMix`, take the value from the *other* input (**documented**) |
| `includeBoth` | Include both A and B versions — the output structure is more complex (both versions present) (**documented**) |

### Output

- **output[0] "In A only":** A items with no matching B item.
- **output[1] "Same":** paired items where all compared fields are equal (one
  item per pair; the A version is emitted — **inferred**).
- **output[2] "Different":** paired items that differ, shaped per `resolve`.
- **output[3] "In B only":** B items with no matching A item.
- Empty inputs produce empty branches (not an error) (**inferred**).

### Errors

- Unresolvable / missing match field on an item → treat as no match (item routed
  to its "only" branch) or raise per engine policy (**gap**; prefer fail-soft).
- `continueOnFail`: follow global engine policy; Compare Datasets has no per-item
  fail output (**inferred**).

### Expressions

`field1`, `field2`, `exceptWhenMix`, and `options.skipFields` carry
`requiresDataPath` and accept expression paths / resolved field names
(**inferred**). The `resolve`, `preferWhenMix`, `multipleMatches` enums and the
`fuzzyCompare` / `disableDotNotation` flags are not expression-driven
(**inferred**).

## Acceptance tests

### Test: same branch — identical paired items

**Given** Input A:

```json
[{ "json": { "id": 1, "name": "Ada" } }]
```

**Given** Input B:

```json
[{ "json": { "id": 1, "name": "Ada" } }]
```

**Parameters:**

```json
{ "mergeByFields": { "values": [{ "field1": "id", "field2": "id" }] } }
```

**Expect** output[1] (Same): the paired item; output[0], output[2], output[3]
empty.

### Test: different branch — prefer Input B

**Given** Input A:

```json
[{ "json": { "id": 1, "v": "a" } }]
```

**Given** Input B:

```json
[{ "json": { "id": 1, "v": "b" } }]
```

**Parameters:**

```json
{
  "mergeByFields": { "values": [{ "field1": "id", "field2": "id" }] },
  "resolve": "preferInput2"
}
```

**Expect** output[2] (Different): `[{ "json": { "id": 1, "v": "b" } }]`.

### Test: in A only / in B only — no match

**Given** Input A:

```json
[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]
```

**Given** Input B:

```json
[{ "json": { "id": 3 } }]
```

**Parameters:**

```json
{ "mergeByFields": { "values": [{ "field1": "id", "field2": "id" }] } }
```

**Expect** output[0] (In A only): both A items (`id` 1 and 2).
**Expect** output[3] (In B only): the B item (`id` 3).

### Test: fuzzy compare treats `3` and `"3"` as equal

**Given** Input A:

```json
[{ "json": { "id": 3, "v": "x" } }]
```

**Given** Input B:

```json
[{ "json": { "id": "3", "v": "x" } }]
```

**Parameters:**

```json
{
  "mergeByFields": { "values": [{ "field1": "id", "field2": "id" }] },
  "fuzzyCompare": true
}
```

**Expect** output[1] (Same): the paired item. Without `fuzzyCompare`, the items
would be unpaired (numeric `3` ≠ string `"3"`) → routed to "In A only" /
"In B only".

### Test: fields to skip comparing makes a differing pair "same"

**Given** Input A:

```json
[{ "json": { "id": 1, "name": "Stefan", "lang": "de" } }]
```

**Given** Input B:

```json
[{ "json": { "id": 1, "name": "Sara", "lang": "de" } }]
```

**Parameters:**

```json
{
  "mergeByFields": { "values": [{ "field1": "id", "field2": "id" }] },
  "options": { "skipFields": "name" }
}
```

**Expect** output[1] (Same): the pair is identical once `name` is ignored.
Without `skipFields`, the pair differs on `name` → Different branch.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Four named outputs (In A only / Same / Different / In B only) | documented | Primary contract |
| Two-stage compare: pair by key, then compare all fields | documented | Core algorithm |
| Fuzzy Compare type-coercion equality | documented | Key behavior |
| Fields to Skip Comparing | documented | |
| Disable Dot Notation semantics | documented | |
| Multiple Matches: First vs All | documented | |
| Resolve options (prefer A / B / mix / both) | documented | Mix field-merge detail inferred |
| Wire tokens `mergeByFields`, `field1`/`field2`, `resolve`, `preferWhenMix`, `exceptWhenMix`, `skipFields`, `multipleMatches` | inferred | Public docs give labels; exact keys from descriptor/export shapes |
| Enum tokens `preferInput1`/`preferInput2`/`mix`/`includeBoth`, `input1`/`input2`, `first`/`all` | inferred | Labels documented |
| `multipleMatches` default | partial | Descriptor says `first`; public docs prose says "Include All Matches". Flagged for implementer verification |
| `fuzzyCompare` placement (top-level v2+ vs options v1) | inferred | Descriptor |
| `requiredInputs: 1` (B optional) | inferred | Descriptor |
| "Same" branch emits which version (A vs B) | inferred | Docs show paired items; exact emitted version unspecified — assume A |
| `includeBoth` exact output structure ("more complex") | partial | Docs note both versions present; precise shape not fully specified |
| Unresolvable / missing match-field handling | gap | Prefer fail-soft (no match) |
| `pairedItem` propagation to outputs | gap | Not documented |

## OpenFlow mapping

- **Definition group:** `transform` (`src/lib/nodes/definitions/transform.ts` → `compareDatasets`)
- **Executor file:** `src/lib/engine/executors/compareDatasets.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Related specs:** Merge (`n8n-nodes-base.merge`) combines streams; Compare Datasets classifies pairs across two streams. Remove Duplicates (`n8n-nodes-base.removeDuplicates`) deduplicates a single stream.