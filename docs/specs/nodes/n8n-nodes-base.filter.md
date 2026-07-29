---
type: n8n-nodes-base.filter
displayName: Filter
category: Transform
versions: [1, 2]
priority: high
status: specced
---

# Filter

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.filter`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (passing items only; non-matching omitted) (**documented**)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | collection | | yes | — | Same comparison model as IF (**documented**) |
| combinator | options | `and` | no | — | AND all / OR any; **no mix of AND and OR** (**documented**) |
| options.ignoreCase | boolean | | no | — | Ignore letter case (**documented**) |
| options.looseTypeValidation | boolean | | no | — | Less strict type validation / coerce by operator (**documented**) |

### Comparison surface

Same documented sets as IF (string, number, date/time, boolean, array, object) — see IF spec.

## Runtime behavior

### Input

Items on main 0.

### Output

Only items that meet the combined conditions appear on output 0. Others are dropped (not sent to a false branch) (**documented**).

### Errors

Wrong type errors may be mitigated by less-strict validation option (**documented**).

### Expressions

Condition values support expressions (**inferred** / standard UI).

## Acceptance tests

### Test: keep matching only

**Given** input items:

```json
[
  { "json": { "status": "ok" } },
  { "json": { "status": "fail" } },
  { "json": { "status": "ok" } }
]
```

**Parameters:**

```json
{
  "conditions": [
    { "leftValue": "={{ $json.status }}", "rightValue": "ok", "operator": "equals" }
  ],
  "combinator": "and"
}
```

**Expect** output[0] length 2, both `status: "ok"`

### Test: none match

**Given** all `status: "fail"`, same condition

**Expect** output[0] length 0

### Test: OR keeps either

**Given** mixed items; OR of two field checks

**Expect** union of matches (**documented** combinator)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operator wire tokens | inferred | English labels in docs |
| Option key names | inferred | From UI labels |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/filter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
