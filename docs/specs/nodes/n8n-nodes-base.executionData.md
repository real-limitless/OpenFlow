---
type: n8n-nodes-base.executionData
displayName: Execution Data
category: Helpers
versions: [1, 1.1]
priority: medium
status: specced
---

# Execution Data

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executiondata.md | Public docs only |
| https://docs.n8n.io/build/understand-workflows/understand-executions/customize-executions-data.md | Public docs only |
| Public descriptor metadata (`ExecutionData.node.json`, v1/v1.1 schema) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.executionData`
- **Aliases:** `Filter`, `_Set`, `Data` (confirmed by descriptor `alias`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Categories:** `Development`, `Core Nodes` → `Helpers` (confirmed by descriptor)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `save` | no | — | Only `save`; docs label "Save Execution Data for Search", descriptor option name "Save Highlight Data (for Search/review)"; `noDataExpression` |
| `dataToSave` | fixedCollection | `{}` | no | show: `{ operation: ["save"] }` | "Data to Save" container |
| `dataToSave.values` | array | — | no | (inherited) | List of Saved Fields |
| `dataToSave.values[].key` | stringOrExpression | — | no | (inherited) | Saved field key; max 50 chars |
| `dataToSave.values[].value` | stringOrExpression | — | no | (inherited) | Saved field value; max 512 chars |

## Runtime behavior

### Input

All items on main input 0. The node is a **side-effect** node: it records custom
metadata on the current execution and passes the items through unchanged.

### Output

Same items unchanged on main output 0 (pass-through), each carrying
`pairedItem: { item, input }`. The recorded metadata is attached to the
execution and becomes searchable in the **Executions** list (**documented**).

For each Saved Field, the `key` and `value` are resolved (expressions evaluated),
coerced to strings, truncated to their limits, then stored as custom execution
data via the OpenFlow custom-data surface (see below). Stored values must be
strings (**documented** for the custom-data API).

### OpenFlow custom-data surface (SDK contract)

The executor must persist saved fields through the **native OpenFlow
`ExecutionContext`** custom-data API — never via a third-party package. This
surface is an OpenFlow-specific contract (not derived from n8n docs); it exists
so the save side-effect is observable and testable without `n8n-nodes-*`
packages, per `docs/sdk/NON_GOALS.md`.

The SDK must expose on `ExecutionContext` (`src/sdk/types.ts`):

| Method | Signature | Purpose |
|--------|-----------|---------|
| `setCustomData` | `(key: string, value: string): void` | Store one entry on the current execution. Last-write-wins for repeated keys. Strings only — the executor coerces+truncates **before** calling. |
| `getCustomData` | `(key: string): string \| undefined` | Read one entry. Used by the Code node (`$execution.customData.get`); **not** used by this node. |
| `getAllCustomData` | `(): Record<string, string>` | Snapshot of all entries. Used by the Code node and by tests to assert the save side-effect. |

**Executor contract** (`src/lib/engine/executors/executionData.ts`):

1. For each input item, for each Saved Field: resolve `key`/`value` expressions
   against the item, coerce to string, truncate (`key`→50, `value`→512, log on
   truncation), then call `ctx.setCustomData(key, value)`.
2. The store is **per-execution** and shared with the Code node's
   `$execution.customData` API, so repeated keys across items overwrite
   (last-write-wins).
3. The node is **write-only**: it never reads custom data. Retrieval is the Code
   node's responsibility.

**Testability:** tests assert the side-effect by inspecting
`ctx.getAllCustomData()` after `runNode` — no n8n packages required.

### Limitations

When storing execution metadata (**documented** on the Execution Data node page):

- `key`: limited to 50 characters.
- `value`: limited to 512 characters.

If `key` or `value` exceed the limit, n8n truncates to the maximum length and
emits a log entry (non-fatal).

> Note: the sibling Code-node API `$execution.customData` documents a `value`
> max of 255 characters and a maximum of 10 custom-data items. Those limits are
> not stated on the Execution Data node page; treat them as **inferred** to apply
> to the shared custom-data store. See Gaps.

### Retrieval

Custom execution data **cannot** be retrieved with this node — it is write-only.
Retrieval is done via the Code node (`$execution.customData.get` / `.getAll`)
(**documented**).

### Feature availability

Custom executions data is available on (**documented**):

- Cloud: Pro, Enterprise
- Self-Hosted: Enterprise, registered Community

### Errors

Should not throw under normal use. Over-length key/value is truncated and logged,
not raised. `continueOnFail` follows the standard engine behavior.

### Expressions

`dataToSave.values[].key` and `dataToSave.values[].value` accept expression
strings (resolved at runtime).

## Acceptance tests

### Test: pass-through with one saved field

**Given** input items:

```json
[{ "json": { "email": "a@example.com" } }]
```

**Parameters:**

```json
{
  "operation": "save",
  "dataToSave": {
    "values": [
      { "key": "contact", "value": "={{ $json.email }}" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "email": "a@example.com" }, "pairedItem": { "item": 0, "input": 0 } }]
```

**Expect** custom-data side effect: `ctx.getAllCustomData()` →
`{ "contact": "a@example.com" }` (executor called `ctx.setCustomData("contact", "a@example.com")`).

### Test: multiple saved fields

**Given** input items:

```json
[{ "json": { "id": 7, "status": "ok" } }]
```

**Parameters:**

```json
{
  "dataToSave": {
    "values": [
      { "key": "recordId", "value": "={{ $json.id }}" },
      { "key": "state", "value": "={{ $json.status }}" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "id": 7, "status": "ok" }, "pairedItem": { "item": 0, "input": 0 } }]
```

**Expect** custom-data side effect: `ctx.getAllCustomData()` →
`{ "recordId": "7", "state": "ok" }` (values coerced to strings before `setCustomData`).

### Test: value truncation over 512 chars

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "dataToSave": {
    "values": [
      { "key": "k", "value": "<513-character string>" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": {}, "pairedItem": { "item": 0, "input": 0 } }]
```

**Expect** custom-data side effect: `ctx.getAllCustomData().k` is exactly 512
characters (truncated before `setCustomData`); a log entry is emitted. No throw.

### Test: empty input

**Given** input items:

```json
[]
```

**Parameters:**

```json
{ "operation": "save", "dataToSave": { "values": [{ "key": "k", "value": "v" }] } }
```

**Expect** output[0] (OpenFlow convention):

```json
[{ "json": {} }]
```

**Expect** custom-data side effect: `ctx.getAllCustomData()` → `{}` (no items, so
`setCustomData` is never called).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Pass-through output | inferred | Docs describe "save metadata"; pass-through is the natural shape for a side-effect node, not explicitly stated |
| Per-item evaluation / last-write-wins | specified (OpenFlow) | Spec mandates `ctx.setCustomData` per item per field; repeated keys overwrite (mirrors `$execution.customData.set`) |
| OpenFlow custom-data surface | specified (OpenFlow) | `ctx.setCustomData/getCustomData/getAllCustomData` is an OpenFlow SDK contract, not from n8n docs; exists for testability without third-party packages |
| `value` max length | documented (512) on node page; conflicts with Code-node API (255) | Discrepancy between the two docs pages |
| Max 10 custom-data items | inferred | Stated only for the Code-node API, not the Execution Data node page |
| String coercion of values | inferred | Custom-data API requires strings; expression results are coerced |
| Empty-input behavior | inferred | Docs silent; OpenFlow emits one empty item so chains continue |
| `pairedItem` | inferred | General item-linking docs |
| Versions `[1, 1.1]` | inferred | Descriptor metadata confirms `nodeVersion: 1.0` only; v1.1 not confirmed by descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/executionData.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **SDK custom-data surface (required):** `ctx.setCustomData(key, value)` /
  `ctx.getCustomData(key)` / `ctx.getAllCustomData()` on `ExecutionContext`
  (`src/sdk/types.ts`, `src/sdk/context.ts`). The executor calls `setCustomData`
  after coerce+truncate; tests assert via `getAllCustomData`.