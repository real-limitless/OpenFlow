---
type: n8n-nodes-base.set
displayName: Edit Fields (Set)
category: Transform
versions: [3, 3.4]
priority: high
status: specced
---

# Edit Fields (Set)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.set`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `manual` | no | — | `manual` = Manual Mapping; `raw` = JSON Output (**documented** concepts; wire values from public exports) |
| fields | fixedCollection | `{}` | no | mode=manual | Fields to Set: name + value (+ type in exports) |
| jsonOutput | json/string | | no | mode=raw | JSON body to apply |
| includeOtherFields / keep only set | boolean | | no | — | Docs: “Keep Only Set Fields” discards unused input; “Include in Output” chooses which input data to keep (**documented** UI; wire key names vary by version — **inferred** mapping to `includeOtherFields`) |
| options.dotNotation | boolean | true | no | — | Support Dot Notation (**documented**) |
| options.ignoreConversionErrors | boolean | | no | manual | Ignore type conversion errors (**documented**) |
| options.includeBinary | boolean | | no | — | Include binary data (**documented**) |

## Runtime behavior

### Input

One item stream on main. Operates per item.

### Output

One item per input item on main output 0.

**Manual mode:** set named fields from values (literals or expressions). Default drag-drop uses expressions referencing input (**documented**).

**JSON Output mode:** add/merge JSON; docs example with “All Input Fields” shows original keys plus new keys/arrays/objects with expressions inside JSON (**documented**).

**Keep Only Set Fields:** when enabled, drop input keys not used in Fields to Set (**documented**). Inverse is include-other-fields style behavior (**inferred** wire).

**Dot notation:** `number.one` → nested `{ number: { one: 20 } }` when enabled; flat key when off (**documented**).

### Errors

Type conversion errors may be ignored when option enabled (**documented**). Otherwise invalid coercions are implementation-defined (**inferred**).

### Expressions

Field values and JSON Output content commonly use `{{ }}` / `=` expressions and `$json` (**documented** examples).

## Acceptance tests

### Test: manual field + expression

**Given** input items:

```json
[{ "json": { "name": "Alice" } }]
```

**Parameters:**

```json
{
  "mode": "manual",
  "fields": [
    { "name": "greeting", "value": "={{ $json.name }}", "type": "stringValue" }
  ]
}
```

**Expect** output[0]:

```json
[{ "json": { "greeting": "Alice" } }]
```

(With include-other off / keep-only-set style.)

### Test: fields.values wrapper

**Given** input items:

```json
[{ "json": { "x": 10 } }]
```

**Parameters:**

```json
{
  "mode": "manual",
  "fields": {
    "values": [
      { "name": "doubled", "value": "={{ $json.x * 2 }}", "type": "numberValue" }
    ]
  }
}
```

**Expect** output[0][0].json.doubled === `20`

### Test: raw JSON merge (conceptual)

**Given** input with id/name; mode raw; jsonOutput adding `newKey`; include all input fields

**Expect** output items contain original fields plus `newKey` (**documented** example pattern).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter keys across typeVersions | inferred | UI labels documented; wire names from public exports |
| Type enum `stringValue` etc. | inferred | Common in exports |
| includeOtherFields vs keepOnlySet | inferred | Opposite phrasings in UI generations |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/set.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
