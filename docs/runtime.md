# OpenFlow lite runtime

Embed and run an exported workflow JSON **inside your Node.js process** — no Postgres, Redis, editor, or OpenFlow server.

This is a **headless backend library**, not a browser widget and not a drop-in replacement for the full product. Your app triggers the run (cron, queue, CLI, API route). The runtime does not host webhooks or schedules.

## When to use it

| You want… | Use |
|-----------|-----|
| Run a small workflow from another Node app | **Lite runtime** (this doc) |
| Editor, credentials vault, webhooks, full catalog | Full OpenFlow (API + worker) |
| Script tag on a marketing site | Not supported — call a backend that runs lite or the full engine |

## Requirements

- **Node.js 22+**
- Native **`isolated-vm`** if the workflow uses a Code node
- Workflow JSON limited to the [allowlist](#supported-nodes)

It will **not** run in browsers, Cloudflare Workers, or most serverless platforms (Vercel/Netlify) because Code needs a native addon.

| Host | Works? |
|------|--------|
| Node 22+ long-lived process (Express, Fastify, Hono, CLI) | Yes |
| Docker sidecar | Yes |
| Next.js **Node** runtime on a host that can compile native addons | Usually |
| Vercel / Netlify serverless, Workers, browsers, edge | No |

## Supported nodes

Wire type strings are JSON identifiers (`n8n-nodes-base.*`). Prefix-stripped aliases (`nodes-base.*`) also resolve.

| Type | Role |
|------|------|
| `manualTrigger` | Start; `run({ input })` is pinned here |
| `manualWorkflowTrigger`, `start` | Same executor as manual trigger |
| `set` | Assign fields |
| `if`, `switch` | Branch |
| `merge`, `filter`, `noOp` | Combine / keep / pass-through |
| `httpRequest` | `fetch`; credentials + `allowUrl` |
| `code` | JavaScript only (`isolated-vm`). Python throws. |
| `function`, `functionItem` | Aliases of Code |
| `stickyNote` | Ignored |

Anything else (Slack, databases, AI agents, webhooks, schedules, file/binary nodes, …) **fails validation before run**. Disabled unsupported nodes still fail — fail-closed.

## Export a workflow

In the editor: **Export → For runtime…**

- Downloads `*.runtime.json`
- Keeps credential **slot names** (so HTTP still knows to ask for `httpHeaderAuth`)
- Strips OpenFlow credential **ids** (they only exist in your instance DB)
- Toasts a warning if any node is outside the allowlist

Or in code:

```ts
import { serializeForRuntime, serializeForRuntimeJson } from "@/lib/runtime";

const report = serializeForRuntime(workflow);
// report.workflow              sanitized graph
// report.requiredCredentials   [{ slot, name, node, id? }]
// report.unsupportedNodes      [{ name, type }]
// report.warnings              human-readable

const json = serializeForRuntimeJson(workflow);
```

Never put secrets in the JSON. Bind them on the host.

## Usage

```ts
import { createRuntime, LiteRuntimeError } from "@/lib/runtime";
import workflow from "./checkout.runtime.json";

const runtime = createRuntime({
  credentials: {
    httpHeaderAuth: { name: "Authorization", value: process.env.API_KEY ?? "" },
  },
  vars: { SITE: "https://example.com" },
  env: { NODE_ENV: "production" },
});

const report = runtime.validate(workflow);
if (report.unsupportedNodes.length) {
  throw new Error(
    report.unsupportedNodes.map((n) => `${n.name} (${n.type})`).join(", "),
  );
}

try {
  const result = await runtime.run(workflow, {
    input: { email: "user@example.com" },
  });
  if (!result.success) {
    console.error(result.runData);
  }
} catch (err) {
  if (err instanceof LiteRuntimeError) {
    console.error(err.code, err.unsupportedNodes);
  }
  throw err;
}
```

`@/lib/runtime` is the in-tree entry (`src/lib/runtime`). There is no published npm package yet.

### `createRuntime(options)`

| Option | Default | Meaning |
|--------|---------|---------|
| `credentials` | none | Map keyed by **slot**, credential **name**, or **id**, or an async `(ref) => data` resolver |
| `vars` | `{}` | `$vars` in expressions |
| `env` | `{}` | `$env` in expressions. **Not** `process.env` |
| `envAllowlist` | unset | If set, only these `$env` keys are visible |
| `allowUrl` | [deny private URLs](#http-url-policy) | Return `false` to block an HTTP request |

### `runtime.run(workflow, options?)`

`workflow` may be an `IWorkflow` object or a JSON string.

| Option | Meaning |
|--------|---------|
| `input` | Pinned onto the start trigger as items (see below) |
| `startNode` | Trigger name; default is the first enabled lite trigger |
| `onProgress` | Called with a `runData` snapshot as nodes finish |

**Input shapes** (all become `INodeExecutionData[]` on the trigger):

- omitted / `null` → `[{ json: {} }]`
- `{ email: "…" }` → `[{ json: { email: "…" } }]`
- `{ json: { … } }` → used as-is
- `[{ json: … }, …]` or `[{ … }, …]` → one item per element

### `runtime.validate(workflow)`

Same report as `serializeForRuntime`. Does **not** throw. Use before run, or let `run()` throw `LiteRuntimeError` (`unsupported_nodes` / `invalid_workflow` / `missing_executor`).

### `runtime.supportedTypes()`

Returns the allowlist (`LITE_NODE_TYPES`).

### Result

```ts
{
  success: boolean;
  runData: {
    [nodeName: string]: {
      status: "pending" | "running" | "success" | "error" | "skipped";
      items?: INodeExecutionData[][];
      error?: string;
      startedAt?: string;
      finishedAt?: string;
    };
  };
}
```

`success` is false if any node has `status: "error"`. Missing executors throw instead of succeeding with skipped nodes.

## Credentials

HTTP Request looks at `node.credentials.<slot>` then `ctx.getCredential(slot)`.

```ts
createRuntime({
  credentials: {
    httpHeaderAuth: { name: "X-Api-Key", value: "…" },
    httpBasicAuth: { user: "…", password: "…" },
    httpQueryAuth: { name: "api_key", value: "…" },
  },
});
```

Lookup order for a map: `ref.type` (slot) → `ref.id` → `ref.name`.

Or pass a function:

```ts
createRuntime({
  credentials: async (ref) => {
    if (ref.type === "httpHeaderAuth") {
      return { name: "Authorization", value: `Bearer ${process.env.TOKEN}` };
    }
    return null;
  },
});
```

## HTTP URL policy

Default `allowUrl` **blocks**:

- non-`http:` / `https:` URLs
- `localhost`, `*.localhost`, `*.local`, `*.internal`
- loopback (`127.0.0.0/8`, `::1`, `0.0.0.0`)
- RFC1918 (`10/8`, `172.16/12`, `192.168/16`)
- link-local / cloud metadata (`169.254.169.254`, `metadata.google.internal`)

Override to allow a host, or compose with the helper:

```ts
import { createRuntime, denyPrivateUrls } from "@/lib/runtime";

createRuntime({
  allowUrl: (url) => url.startsWith("https://api.example.com/") && denyPrivateUrls(url),
});
```

Pass `allowUrl: () => true` only if you fully trust the workflow JSON.

The full product engine does **not** apply this policy unless you pass `allowUrl` into `executeWorkflow`.

## Environment and expressions

| Surface | Lite default | Full product default |
|---------|--------------|----------------------|
| `$env` | `{}` unless you pass `env` | `process.env` |
| `$vars` | `options.vars` | project/instance variables |
| `$json` / `$("Node")` | same | same |

`$env` on **top-level** node parameters is resolved by the runner. Nested field expressions inside Set / IF / Filter evaluate against item JSON (existing engine behavior).

## Security

- Treat workflow JSON as **trusted**. Code runs in `isolated-vm` with no `fetch` / filesystem, but a bad workflow can still call HTTP or burn CPU.
- Do not forward host `process.env` into `env`.
- Do not disable `allowUrl` for untrusted graphs.
- Do not run untrusted Code in multi-tenant embeds ([SDK non-goals](sdk/NON_GOALS.md)).
- Export never includes secret values — only slot names.

## Tests

```sh
npx vitest run src/lib/runtime
```

Covers allowlist rejection, Set → IF, HTTP + credentials, private-URL block, `$env` isolation, Code JS, and an import-graph gate (runtime must not pull Prisma, BullMQ, `src/server`, or the full executor registry).

## Layout

```
src/lib/runtime/
  index.ts            public exports
  create-runtime.ts   createRuntime()
  allowlist.ts        LITE_NODE_TYPES
  executors.ts        explicit lite executor map
  validate.ts         assertLiteCompatible
  serialize.ts        serializeForRuntime
  url-policy.ts       denyPrivateUrls
  errors.ts           LiteRuntimeError
```

Kernel hooks used by lite (also available to the full engine):

- `RunOptions.env` / `envAllowlist` / `allowUrl` in `src/lib/engine/runner.ts`
- `CreateContextOptions.env` / `allowUrl` in `src/sdk`

## Lite vs full engine

| | Lite | Full OpenFlow |
|--|------|----------------|
| Trigger | Your process calls `run()` | Manual, webhook, form, schedule |
| Persistence | None | Prisma executions |
| Queue | None | Optional BullMQ |
| Nodes | Allowlist only | Full catalog |
| `$env` | Explicit map (default empty) | `process.env` |
| HTTP SSRF guard | On by default | Off unless you pass `allowUrl` |

## Non-goals

- Published `@openflow/runtime` npm package (in-tree entry only)
- Browser / WASM / script-tag engine
- Full catalog as optional add-ons
- Webhooks, cron, data tables, binary FS/S3
- Loading third-party `n8n-nodes-*` packages
- Changing product “skip missing executor” semantics globally

## Related

- [SDK overview](sdk/OVERVIEW.md)
- [SDK non-goals](sdk/NON_GOALS.md)
- [Dogfood / offline fixtures](dogfood.md)
