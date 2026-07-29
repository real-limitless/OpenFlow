---
type: n8n-nodes-base.example
displayName: Example
category: Transform
versions: [1]
priority: medium
status: missing
---

# Example

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.example/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.example`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| | | | | | |

## Runtime behavior

### Input

Describe items consumed.

### Output

Describe items produced (per output index).

### Errors

When to throw vs empty output; `continueOnFail` expectation.

### Expressions

Which parameters accept expression strings.

## Acceptance tests

### Test: basic

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{}
```

**Expect** output[0]:

```json
[{ "json": {} }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| | | |

## OpenFlow mapping

- **Definition group:** `core` | `flow` | `triggers` | `transform`
- **Executor file:** `src/lib/engine/executors/<name>.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
