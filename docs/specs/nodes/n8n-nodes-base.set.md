---
type: n8n-nodes-base.set
displayName: Edit Fields (Set)
category: Transform
versions: [1, 2, 3, 3.1, 3.2, 3.3, 3.4]
priority: high
status: specced
---

# Edit Fields (Set)

Add or edit fields on each input item. Can set new data and overwrite existing keys. Commonly used before sinks (sheets, DBs) that need a shaped payload.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set.md | Public docs only |
| Public workflow export JSON (parameter wire shapes) | Public exports |

## Wire format

- **Type string:** `n8n-nodes-base.set`
- **Aliases:** UI/search aliases commonly include Set, JSON, Transform, Map (**codex**; not alternate type strings)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Default typeVersion (current):** `3.4` (**inferred** from package descriptors)
- **Legacy typeVersions:** `1`, `2` (older “Set” UI); `3`–`3.4` (“Edit Fields”)

## Parameters

### Current (typeVersion ≥ 3)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `manual` | no | — | `manual` = Manual Mapping; `raw` = JSON Output (**documented** labels; wire values from exports/descriptors) |
| fields | fixedCollection | `{}` | no | mode=`manual`; `@version` in `[3, 3.1, 3.2]` | **Fields to Set** — multi `values[]` entries (**documented** concept) |
| fields.values[].name | string | `""` | no | — | Field path; supports dot-notation when enabled (**documented**) |
| fields.values[].type | options | `stringValue` | no | — | `stringValue` \| `numberValue` \| `booleanValue` \| `arrayValue` \| `objectValue` (**inferred** wire enums) |
| fields.values[].stringValue | string | `""` | no | type=`stringValue` | Value when type is string |
| fields.values[].numberValue | string/number | `""` | no | type=`numberValue` | Coerced to number at runtime |
| fields.values[].booleanValue | options/boolean | `true` | no | type=`booleanValue` | Wire often `"true"` / `"false"` strings |
| fields.values[].arrayValue | string | `""` | no | type=`arrayValue` | Parsed/coerced to array |
| fields.values[].objectValue | json | `={}` | no | type=`objectValue` | Object body (may be expression) |
| assignments | assignmentCollection | `{}` | no | mode=`manual`; hide `@version` in `[3, 3.1, 3.2]` | v3.3+ Fields to Set UI (**inferred** wire; same role as `fields`) |
| jsonOutput | json | sample object string | no | mode=`raw` | JSON body merged/applied per item (**documented**) |
| include | options | `all` | no | v3–3.2 always; v3.3+ when `includeOtherFields` | **Include in Output**: `all` \| `none` \| `selected` \| `except` (**documented** UI; wire enums from descriptors) |
| includeOtherFields | boolean | `false` | no | hide on v3–3.2 | **Include Other Input Fields** — pass input keys along with set fields (v3.3+) (**inferred** wire; maps to docs “Include in Output” / keep-other behavior) |
| includeFields | string | `""` | no | include=`selected` | Comma-separated field names to keep from input |
| excludeFields | string | `""` | no | include=`except` | Comma-separated field names to drop from input |
| options.includeBinary | boolean | `true` | no | hide when `@version` ≥ 3.4 | **Include Binary Data** (**documented**) |
| options.stripBinary | boolean | `true` | no | `@version` ≥ 3.4 and includeOtherFields | **Strip Binary Data** when other fields included (**inferred** wire label) |
| options.ignoreConversionErrors | boolean | `false` | no | mode=`manual` | **Ignore Type Conversion Errors** (**documented**) |
| options.dotNotation | boolean | `true` | no | — | **Support Dot Notation** (**documented**; default on) |
| duplicateItem | boolean | `false` | no | node setting | Debug: duplicate each item N times (**inferred**; ignored on automatic runs per UI notice) |
| duplicateCount | number | `0` | no | duplicateItem=`true` | How many extra copies (**inferred**) |

**Include enum (wire):**

| value | UI (v3–3.2) | Meaning |
|-------|-------------|---------|
| `all` | All Input Fields | Keep all unchanged input fields plus set fields |
| `none` | No Input Fields | Only fields produced by Fields to Set / JSON Output (**“Keep Only Set Fields”** style) |
| `selected` | Selected Input Fields | Keep listed input fields via `includeFields` |
| `except` | All Input Fields Except | Keep all input fields except `excludeFields` |

### Legacy (typeVersion 1–2)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| keepOnlySet | boolean | `false` | no | — | Discard input keys not set (**documented** as Keep Only Set Fields) |
| values.string[] / values.number[] / values.boolean[] | fixedCollection | | no | — | Name + value per type bucket (**inferred** wire) |
| options.dotNotation | boolean | `true` | no | — | Same nested-key behavior (**documented**) |

## Runtime behavior

### Input

One `main` stream. Process **per item** (item-linked output).

### Output

One output item per input item on `main[0]` (unless debug duplication multiplies items).

**Manual Mapping (`mode=manual`):**

1. Start from a base object derived from the input item’s `json` according to include / keep-only rules (below).
2. For each field assignment, write `name` ← resolved value.
3. Values may be fixed or expressions; drag-from-input default is an expression referencing the source field (**documented**).
4. Apply type coercion for the selected field type unless `ignoreConversionErrors` is on (**documented**).

**JSON Output (`mode=raw`):**

1. Parse/evaluate `jsonOutput` (may embed `{{ }}` / expression fragments inside JSON text) (**documented**).
2. Merge resulting keys onto the include-filtered base (docs example with **All Input Fields** shows original keys plus `newKey`, `array`, `object`) (**documented**).

**Include / keep-only rules:**

- **Keep Only Set Fields** / `include=none` / `includeOtherFields=false` (default on newer UI): output `json` contains only keys written by this node (**documented**).
- **All Input Fields** / `include=all` / other-fields enabled with include all: shallow-merge set keys over a copy of input `json` (**documented**).
- **Selected** / **Except**: filter which input keys survive before/with the set merge (**documented** concept; wire via `includeFields` / `excludeFields`).

**Dot notation (`options.dotNotation`, default true):**

- Name `number.one` with value `20` → `{ "number": { "one": 20 } }` (**documented**).
- When off → flat key `"number.one": 20` (**documented**).

**Binary:**

- Optionally copy or strip item `binary` depending on includeBinary / stripBinary and whether other fields are included (**documented** / version-split **inferred**).

### Errors

- Type conversion failures in manual mode: throw unless `ignoreConversionErrors` (**documented**).
- Invalid JSON in raw mode: fail the item/node (**inferred**).
- `continueOnFail`: pass error on item when engine flag set (**inferred** platform default).

### Expressions

- Field values, assignment values, `jsonOutput` content, and include field lists commonly accept expressions (`={{ … }}`, `$json`, etc.) (**documented** examples).
- Inside raw JSON text, expressions may appear unquoted for numbers and quoted for strings (docs array example) (**documented**).

## Acceptance tests

### Test: manual field + keep only set

**Given** input items:

```json
[{ "json": { "name": "Alice", "extra": 1 } }]
```

**Parameters:**

```json
{
  "mode": "manual",
  "include": "none",
  "fields": {
    "values": [
      { "name": "greeting", "type": "stringValue", "stringValue": "={{ $json.name }}" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "greeting": "Alice" } }]
```

### Test: manual field with include all

**Given** input items:

```json
[{ "json": { "name": "Alice", "extra": 1 } }]
```

**Parameters:**

```json
{
  "mode": "manual",
  "include": "all",
  "includeOtherFields": true,
  "fields": {
    "values": [
      { "name": "greeting", "type": "stringValue", "stringValue": "={{ $json.name }}" }
    ]
  }
}
```

**Expect** output[0][0].json:

```json
{ "name": "Alice", "extra": 1, "greeting": "Alice" }
```

### Test: number type + expression

**Given** input items:

```json
[{ "json": { "x": 10 } }]
```

**Parameters:**

```json
{
  "mode": "manual",
  "include": "none",
  "fields": {
    "values": [
      { "name": "doubled", "type": "numberValue", "numberValue": "={{ $json.x * 2 }}" }
    ]
  }
}
```

**Expect** output[0][0].json.doubled === `20` (number)

### Test: dot notation on vs off

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters (dot on):**

```json
{
  "mode": "manual",
  "include": "none",
  "options": { "dotNotation": true },
  "fields": {
    "values": [
      { "name": "number.one", "type": "numberValue", "numberValue": 20 }
    ]
  }
}
```

**Expect:**

```json
[{ "json": { "number": { "one": 20 } } }]
```

**Parameters (dot off):** same with `"dotNotation": false`

**Expect:**

```json
[{ "json": { "number.one": 20 } }]
```

### Test: raw JSON merge with all input fields

**Given** input items:

```json
[
  {
    "json": {
      "id": "23423532",
      "name": "Jay Gatsby",
      "email": "gatsby@west-egg.com"
    }
  }
]
```

**Parameters:**

```json
{
  "mode": "raw",
  "include": "all",
  "includeOtherFields": true,
  "jsonOutput": "{\n  \"newKey\": \"new value\",\n  \"array\": [{{ $json.id }},\"{{ $json.name }}\"],\n  \"object\": {\n    \"innerKey1\": \"new value\",\n    \"innerKey2\": \"{{ $json.id }}\",\n    \"innerKey3\": \"{{ $json.name }}\"\n  }\n}"
}
```

**Expect** output[0][0].json contains original `id`/`name`/`email` plus:

```json
{
  "newKey": "new value",
  "array": [23423532, "Jay Gatsby"],
  "object": {
    "innerKey1": "new value",
    "innerKey2": "23423532",
    "innerKey3": "Jay Gatsby"
  }
}
```

(Per public docs example pattern; numeric unquoted expression may coerce id to number.)

### Test: legacy keepOnlySet

**Given** input `{ "a": 1, "b": 2 }`

**Parameters (typeVersion 1–2):**

```json
{
  "keepOnlySet": true,
  "values": {
    "string": [{ "name": "a", "value": "z" }]
  }
}
```

**Expect** `{ "a": "z" }` only (b dropped)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| mode wire `manual` / `raw` | inferred | UI labels Manual Mapping / JSON Output documented |
| fields.values type enums | inferred | From descriptors/exports; not named in prose docs |
| assignments (v3.3+) shape | inferred | assignmentCollection; treat like name/value/type list |
| include enum strings | inferred | Labels documented; `all`/`none`/`selected`/`except` from descriptors |
| includeOtherFields vs include | inferred | UI split across typeVersions; same behavioral family |
| stripBinary vs includeBinary | inferred | Version gate ≥ 3.4; both about binary passthrough |
| duplicateItem behavior in engine | inferred | Marked node setting / debug; skip unless explicitly supported |
| Exact coercion rules per type | inferred | Docs only mention ignore conversion errors |
| Deep vs shallow merge for nested objects | inferred | Dot-notation creates nesting; raw JSON replaces keys at top level in examples |
| Binary copy semantics | partial | Documented toggle only |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/set.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
