---
name: openflow-sdk
description: OpenFlow Plugin SDK authoring and maintenance. Use whenever creating or changing node executors, defineNode, ExecutionContext, src/sdk/**, node registry patterns, aliases, or when the user mentions the OpenFlow SDK, plugin SDK, or node authoring API. Prefer this over inventing ad-hoc executor helpers.
---

# OpenFlow Plugin SDK

## When to apply

- Adding or refactoring node executors
- Changing `src/sdk/**`
- Registering builtins
- AI/implement work that needs the authoring contract

## Rules

1. Author nodes against `@/sdk` (`defineNode`, `ExecutionContext` native methods).
2. Prefer native API over `withAliases` / `aliases.ts`.
3. Do **not** load third-party `n8n-nodes-*` packages.
4. Do **not** vendor third-party workflow runtimes.
5. Wire type strings (`n8n-nodes-base.*`) are JSON identifiers only.
6. Read `docs/sdk/OVERVIEW.md`, `docs/sdk/NON_GOALS.md`, `src/sdk/README.md`.

## Native context

| Method | Use |
|--------|-----|
| `getInputItems(i?)` | Input items |
| `getParam(name, default?)` | Parameters |
| `getParams()` | All params |
| `getNode()` / `node` | Current node |
| `evaluate(expr, json?)` | Expressions |
| `getCredential(name)` | Credentials |
| `continueOnFail()` | Error policy |

## Patterns

```ts
import { defineNode, definitionToExecutor, ensureItems } from "@/sdk";

export const exampleExecutor = definitionToExecutor(
  defineNode({
    type: "n8n-nodes-base.example",
    async execute(ctx) {
      const items = ensureItems(ctx.getInputItems(0));
      const mode = ctx.getParam("mode", "default");
      return [items];
    },
  }),
);
```

Legacy `(ctx, node) =>` executors remain valid if `ctx` is an `ExecutionContext`.

## Expanding the SDK

- Add helpers under `src/sdk/helpers/` only when ≥2 builtins need them.
- Keep `aliases.ts` thin; never clone an external helper catalog.
- Add/adjust `src/sdk/__tests__/sdk.test.ts`.
- Update `docs/sdk/OVERVIEW.md` if the public surface changes.
