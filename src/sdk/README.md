# OpenFlow Plugin SDK

Author nodes against this package (`@/sdk`), not against engine internals.

## Quick start

```ts
import { defineNode, ensureItems } from "@/sdk";

export const myNode = defineNode({
  type: "n8n-nodes-base.noOp",
  async execute(ctx) {
    const items = ensureItems(ctx.getInputItems(0));
    return [items];
  },
});
```

Register executors via `definitionToExecutor` or keep using
`src/lib/engine/executors` with `ExecutionContext` (same shape the runner builds).

## Native context

| Method | Purpose |
|--------|---------|
| `getInputItems(i?)` | Input items for current node |
| `getParam(name, default?)` | Parameter value |
| `getParams()` | All parameters |
| `getNode()` / `node` | Current node |
| `getWorkflow()` | Workflow |
| `continueOnFail()` | Error policy |
| `getCredential(name)` | Resolved credential payload |
| `evaluate(expr, json?)` | Expression preview/eval helper |

## Per-execution custom data

The Execution Data node writes searchable metadata; the Code node reads it via
`$execution.customData`. Both go through the same per-execution store on
`ExecutionContext` — no n8n packages required.

| Method | Purpose |
|--------|---------|
| `setCustomData(key, value)` | Store one string entry (last-write-wins). Callers coerce+truncate before writing. |
| `getCustomData(key)` | Read one entry (used by the Code node). |
| `getAllCustomData()` | Snapshot of all entries (used by tests to assert the save side-effect). |

The runner creates one store per `executeWorkflow` call and shares it across all
nodes, so writes in an Execution Data node are visible to a later Code node.
`createExecutionContext` defaults to a fresh store when `customData` is omitted.

## Aliases

```ts
import { withAliases } from "@/sdk";

const a = withAliases(ctx);
a.getNodeParameter("url");
a.getInputData(0);
```

Prefer native methods in new code.

## Clean-room

- No third-party engine source
- No loading `n8n-nodes-*` packages
- See `docs/sdk/NON_GOALS.md`
