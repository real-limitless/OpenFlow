---
type: n8n-nodes-base.limit
displayName: Limit
category: Transform
versions: [1]
priority: high
status: specced
---

# Limit

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.limit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| maxItems | number | | yes | — | Maximum items to keep (**documented** as Max Items) |
| keep | options | `firstItems` | no | — | **First Items** or **Last Items** (**documented**) |

Wire values commonly `firstItems` / `lastItems` or similar (**inferred** from label text).

## Runtime behavior

### Input

Full item list on main 0.

### Output

If input length ≤ maxItems, pass all through. If greater, keep only maxItems from the beginning (First) or end (Last) (**documented**).

### Errors

Invalid maxItems (negative/NaN): clamp or treat as 0 (**inferred**).

### Expressions

maxItems may be expression-capable in UI (**inferred**).

## Acceptance tests

### Test: keep first N

**Given** input items:

```json
[
  { "json": { "i": 1 } },
  { "json": { "i": 2 } },
  { "json": { "i": 3 } },
  { "json": { "i": 4 } }
]
```

**Parameters:**

```json
{ "maxItems": 2, "keep": "firstItems" }
```

**Expect** output[0] json.i values: `1`, `2`

### Test: keep last N

**Parameters:**

```json
{ "maxItems": 2, "keep": "lastItems" }
```

**Expect** json.i values: `3`, `4`

### Test: under limit

**Given** 2 items, maxItems 5

**Expect** both items unchanged count

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact keep enum strings | inferred | Labels documented |
| Default maxItems | inferred | Docs require configuring Max Items |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/limit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
