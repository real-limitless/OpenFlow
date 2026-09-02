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
| `httpRequest` | `fetch`; credentials + `allowUrl`. Empty `jsonBody` posts incoming `$json.body` (or the whole item). String `jsonBody` expressions are evaluated. |
| `code` | JavaScript only (`isolated-vm`). Python throws. |
| `function`, `functionItem` | Aliases of Code |
| `stickyNote` | Ignored |

Anything else (Slack, databases, webhooks, schedules, …) **fails validation before run** on the default `lite` preset. Disabled unsupported nodes still fail — fail-closed.

## Harness preset (AI Agent)

`createRuntime({ preset: "harness" })` adds an Agent cluster plus coding-agent tools. Export → For runtime… validates against this preset.

| Type | Role |
|------|------|
| `@n8n/n8n-nodes-langchain.agent` | Agent loop. `promptType: auto` reads `chatInput` / `userPrompt` / `prompt` / `text`. Zero tools allowed (clean stages). |
| `…lmChatOpenRouter` | Chat model. Bind `openRouterApi: { apiKey }` on the host. |
| `httpRequestTool` | `web_fetch` — `ai_tool` handle; `$fromAI()` via invoke args |
| `webSearchTool` | `web_search` |
| `githubTool` | GitHub file/repo/issue API |
| `gitTool` | clone / showFile / log (jailed to `fsRoot`) |
| `filesystemTool` | read / glob / grep (requires `fsRoot`) |
| `executeCommandTool` | Last-resort bash |

Aliases `openflow-node-langchain.*` and `openflow-node-base.*` resolve to the same executors.

```ts
const runtime = createRuntime({
  preset: "harness",
  credentials: { openRouterApi: { apiKey: process.env.OPENROUTER_API_KEY } },
  allowUrl: (url) => url.startsWith("https://"),
  allowedTools: ["httpRequestTool", "webSearchTool", "githubTool"],
  fsRoot: "/tmp/dirty-workspace",
});
runtime.validate(orchestrate);
await runtime.run(orchestrate, { input: { userPrompt: "…", license: "Apache-2.0" } });
```

**Dirty vs clean:** omit `allowedTools` (or list fetch/search/git/fs) for Orchestrate/Spec. Pass `allowedTools: []` (or no tool nodes) for Reveal/Improve/Implement/Check. Extra tools throw `LiteRuntimeError` (`tool_policy`).

Prefer domain tools over `executeCommandTool`. `allowUrl` applies to HTTP tool, GitHub, search, and git remotes. Default still denies private/metadata hosts.

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

**Import**

```ts
// After `npm run build:runtime` — works from another package that depends on this repo
import { createRuntime } from "openflow/runtime";

// In this repo (Vite / tsconfig `@/` alias)
import { createRuntime } from "@/lib/runtime";
```

The package is still `private`. `exports["./runtime"]` points at `dist/runtime/` (run `npm run build:runtime` first). `isolated-vm` is loaded only when a Code node runs.

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

## Tests and bundle

```sh
npm run build:runtime
npx vitest run src/lib/runtime
```

Covers allowlist rejection, Set → IF, HTTP + credentials, private-URL block, `$env` isolation, Code JS, harness Agent smoke, an import-graph gate (no Prisma / BullMQ / full executor registry), and a bundle-size gate (`dist/runtime/index.js` < 1.2 MB).

`npm run build:runtime` writes:

- `dist/runtime/index.js` — ESM bundle (`isolated-vm` external)
- `dist/runtime/index.d.ts` — public types

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

- `RunOptions.env` / `envAllowlist` / `allowUrl` / `fsRoot` in `src/lib/engine/runner.ts`
- `CreateContextOptions.env` / `allowUrl` / `fsRoot` in `src/sdk`

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

- Published `@openflow/runtime` npm package (use `openflow/runtime` from this repo after `build:runtime`)
- Browser / WASM / script-tag engine
- Full catalog as optional add-ons
- Webhooks, cron, data tables, binary FS/S3
- Loading third-party `n8n-nodes-*` packages
- Changing product “skip missing executor” semantics globally

## Related

- [SDK overview](sdk/OVERVIEW.md)
- [SDK non-goals](sdk/NON_GOALS.md)
- [Dogfood / offline fixtures](dogfood.md)

## History ingest

Headless `createRuntime().run()` does not persist executions by itself. Hosts such as CleanFlow can **best-effort ingest** a finished (or in-flight) `runData` snapshot into OpenFlow History.

Ingest is optional. If OpenFlow is down, `run()` must still succeed.

## Ingest API

Authenticate with a user API key (`of_…`) that has `openflow:execute`. Restricted keys need a `canExecute` grant on the target workflow. Session cookies are rejected. `AUTH_DISABLED=true` still resolves `of_…` keys (so grants apply); requests without a key ingest as the local user.

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/api/v1/workflows/:id/executions` | Create `mode: "runtime"` |
| `PATCH` | `/api/v1/executions/:id` | Update the same row (`onProgress`) |
| UI | `/executions/:id` | History detail (live-follows `running`) |

```json
{
  "status": "success",
  "startedAt": "2026-08-15T00:00:00.000Z",
  "finishedAt": "2026-08-15T00:00:02.000Z",
  "runData": {
    "Start": { "status": "success", "items": [[{ "json": {} }]] },
    "Agent": { "status": "success", "items": [[{ "json": { "output": "…" } }]] }
  },
  "error": null,
  "host": "cleanflow",
  "stageId": "orchestrate",
  "projectId": "cf-project-id",
  "fingerprint": "optional-graph-hash"
}
```

`201` / `200` body: `{ "id", "workflowId", "status", "mode": "runtime" }`.

| Status | When |
| --- | --- |
| 401 | Missing token, or session cookie only |
| 403 | Missing `openflow:execute` or execute grant |
| 404 | Unknown / inaccessible `workflowId` |
| 413 | `runData` JSON larger than 2MB |
| 400 | Invalid `status` or JSON |

Do **not** ingest fetch-fallback / HTTP-chat results. Only real harness `run()` snapshots.

## Redaction

The server walks `runData` before persist and masks:

- Keys such as `password`, `token`, `secret`, `apiKey`, `authorization`, `*password`
- String values matching `Bearer …`, `sk-…`, `of_…` / `oft_…` / `ofa_…`

Do not send credential payloads. The server redacts anyway.

## Host helper

```ts
import { reportRuntimeExecution } from "openflow/src/lib/runtime/report";

const reported = await reportRuntimeExecution({
  target: {
    url: process.env.OPENFLOW_URL!,
    token: process.env.OPENFLOW_TOKEN!,
    workflowId,
    host: "cleanflow",
    stageId: "orchestrate",
  },
  result: { success: result.success, runData: result.runData },
});
// reported?.id → History row; null if OpenFlow was unreachable
```

POST `{ status: "running", runData }` at start, then PATCH snapshots via `reportRuntimeExecution({ executionId, result: { status: "running", runData } })`. Terminal POST/PATCH still uses `success` / `error`.

OpenRouter Agent turns stream tokens into `runData[node].trace` / `progress` (throttled). If the model sends no tokens for 60s, or goes silent for 45s after a token, the Agent errors and keeps partial text. Opening History / `/executions/:id` fails a leftover `running` row when `phase` is still `llm` and `lastTokenAt` is stale (host crash). Tool phases are not failed this way.

`createRuntime()` does not ingest by itself. Hosts should call `reportRuntimeExecution` (POST on start / first snapshot, PATCH on later `onProgress` and finish).
