# OpenFlow Plugin SDK

The **OpenFlow Plugin SDK** (`src/sdk/`) is the only supported surface for
authoring node definitions and executors. It is an independent, clean-room API.
It is not affiliated with, endorsed by, or derived from any other project's
source code or SDK.

## Goals

1. **Stable contract** — builtins and future user plugins share one API.
2. **Clean-room foundation** — implement behavior from OpenFlow specs and public
   docs; never from third-party source trees.
3. **Wire-format interop** — workflow JSON may still use public type strings
   such as `n8n-nodes-base.httpRequest` as **identifiers only**. That is not
   branding and does not imply runtime compatibility with third-party packages.
4. **AI-safe** — implement agents target `src/sdk` + `docs/specs/**` only.

## Layout

```
src/sdk/
  index.ts           Public exports
  types.ts           NodeDefinition, ExecutionContext, items
  define-node.ts     defineNode({ type, description, execute })
  context.ts         createExecutionContext()
  registry.ts        createNodeRegistry / toExecutorMap
  helpers/           params, items, expressions, http, credentials
  aliases.ts         Optional familiar helper names (porters)
  README.md          Authoring guide
```

## Native API (preferred)

```ts
import { defineNode } from "@/sdk";

export default defineNode({
  type: "n8n-nodes-base.set", // wire id for import/export only
  description: { /* NodeDescription fields */ },
  async execute(ctx) {
    const items = ctx.getInputItems(0);
    const mode = ctx.getParam<string>("mode", "manual");
    // ...
    return [items];
  },
});
```

## Familiar aliases (optional)

`src/sdk/aliases.ts` maps a few familiar helper names onto the native context
for human porters. **New code and AI agents should prefer the native API.**
Aliases are incomplete by design and are not a third-party compatibility layer.

## What the SDK is not

See [`NON_GOALS.md`](./NON_GOALS.md).

## Related

- [`docs/clean-room.md`](../clean-room.md) — process rules
- [`docs/specs/README.md`](../specs/README.md) — per-node behavioral specs
- [`docs/prompts/`](../prompts/) — spec / implement agent prompts
