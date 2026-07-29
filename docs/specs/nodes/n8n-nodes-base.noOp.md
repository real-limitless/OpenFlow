---
type: n8n-nodes-base.noOp
displayName: No Operation
category: Helpers
versions: [1]
priority: high
status: specced
---

# No Operation

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.noOp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none) | — | — | — | — | Pass-through; no operations |

## Runtime behavior

### Input

All items on main input 0.

### Output

Same items unchanged on main output 0. Purpose: readability / explicit end of a branch (**documented**).

If no input items, OpenFlow may emit a single empty item so chains continue (**inferred** for editor/engine ergonomics; docs do not specify empty-input behavior).

### Errors

Should not throw under normal use.

### Expressions

N/A.

## Acceptance tests

### Test: pass-through

**Given** input items:

```json
[{ "json": { "a": 1 } }, { "json": { "b": 2 } }]
```

**Parameters:**

```json
{}
```

**Expect** output[0]:

```json
[
  { "json": { "a": 1 }, "pairedItem": { "item": 0, "input": 0 } },
  { "json": { "b": 2 }, "pairedItem": { "item": 1, "input": 0 } }
]
```

### Test: empty input

**Given** input items:

```json
[]
```

**Parameters:**

```json
{}
```

**Expect** output[0] (OpenFlow convention):

```json
[{ "json": {} }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Empty input | inferred | Docs silent |
| pairedItem | inferred | General item-linking docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/noop.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
