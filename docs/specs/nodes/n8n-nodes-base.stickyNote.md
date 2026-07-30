---
type: n8n-nodes-base.stickyNote
displayName: Sticky Note
category: Helpers
versions: [1]
priority: high
status: specced
---

# Sticky Note

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.stickynote/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.stickyNote`
- **Aliases:** (none)
- **Inputs:** (none) — display-only
- **Outputs:** (none) — display-only
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `content` | string | `## Note\nAdd context for your team here.` | no | `rows: 8`, `noDataExpression: true` | Markdown body rendered on the canvas |
| `width` | number | `320` | no | — | Canvas width in pixels |
| `height` | number | `180` | no | — | Canvas height in pixels |
| `color` | options | `1` | no | — | `1`=Sand, `2`=Teal, `3`=Amber, `4`=Rose |

## Runtime behavior

### Input

None. The sticky note is a canvas annotation and is **not part of execution** (**documented**).

### Output

None. Produces no output items and no output branches. The executor returns an empty output run set so the engine does not propagate data through it (**inferred** from the display-only / no-input / no-output wire format; docs describe it as a UI element only).

### Errors

Should not throw under normal use. Parameters are purely presentational.

### Expressions

N/A — `content` is marked `noDataExpression: true`.

## Acceptance tests

### Test: registered as executor

**Expect** `hasExecutor("n8n-nodes-base.stickyNote")` is `true`.

### Test: no-op produces no output

**Given** no input items (display-only node).

**Parameters:**

```json
{ "content": "## Note\nhello", "width": 320, "height": 180, "color": 1 }
```

**Expect** output: `[]` (no output runs).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Empty output run set | inferred | Docs describe UI-only; engine contract for no-output nodes inferred |
| Parameter defaults | documented | Matches public node description |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/sticky-note.ts`
- **SDK:** native `ExecutionContext` only