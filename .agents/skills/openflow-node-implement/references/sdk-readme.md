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
