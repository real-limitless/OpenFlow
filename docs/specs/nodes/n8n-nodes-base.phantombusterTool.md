---
type: n8n-nodes-base.phantombusterTool
displayName: PhantomBuster
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# PhantomBuster (AI Tool)

AI agent tool variant of the PhantomBuster app node, wrapping the Agent resource with 5 operations (Delete, Get, Get Many, Get Output, Launch) against the PhantomBuster REST API v2. Designed for use as an AI agent tool where the model dynamically populates parameters via `$fromAI()`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.phantombuster.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/phantombuster.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://hub.phantombuster.com/reference | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.phantombusterTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `phantombusterApi` (API key, header `X-Phantombuster-Key`, base URL `https://api.phantombuster.com/api/v2`)

## Parameters

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed-options: `agent` | `agent` | yes | Single resource |

### Operation selection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed-options | `launch` | yes | resource: `agent` | See operations table |
| agentId | options or string | — | yes | operations: `delete`, `get`, `getOutput`, `launch` | Agent identifier; loaded dynamically via `getAgents` when the resource supports dropdown, entered as free text for `get` |
| returnAll | boolean | `false` | no | operation: `getAll` | If false, `limit` controls page size |
| limit | number | `25` | no | operation: `getAll` AND `returnAll: false` | Max items to return (1-50) |
| resolveData | boolean | `true` | no | operations: `getOutput`, `launch` | When true, resolves the output result-object JSON for `getOutput`, or fetches the full container data after `launch` |
| jsonParameters | boolean | `false` | no | operation: `launch` | When true, `arguments` and `bonusArgument` are supplied as raw JSON strings instead of key-value pairs |

### Additional Fields (getOutput)

| name | type | default | notes |
|------|------|---------|-------|
| prevContainerId | string | — | Output retrieval starts after the specified previous container ID |
| prevStatus | options | — | Previously retrieved status: `finished`, `lauch error`, `never launched`, `running`, `starting`, `unknown` |
| prevRuntimeEventIndex | number | `0` | Runtime events returned starting from the provided previous index |

### Additional Fields (launch)

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| argumentsJson | json | — | `jsonParameters: true` | Raw JSON string used as agent argument |
| argumentsUi | fixedCollection | — | `jsonParameters: false` | Key-value pairs (`{key, value}`) assembled into agent argument JSON |
| bonusArgumentJson | string | — | `jsonParameters: true` | Raw JSON string for single-use bonus argument |
| bonusArgumentUi | fixedCollection | — | `jsonParameters: false` | Key-value pairs for single-use bonus argument |
| manualLaunch | boolean | `false` | — | When true, agent is considered "launched manually" |
| maxInstanceCount | number | `0` | — | Agent only launches if running instances are below this number (0 = no limit) |
| saveArgument | string | — | — | If truthy, saves argument as default launch options for the agent |

### Operations (Agent resource)

| operation | label | API call | Description |
|-----------|-------|----------|-------------|
| `delete` | Delete | `POST /agents/delete {id}` | Delete an agent by ID |
| `get` | Get | `GET /agents/fetch?id=<id>` | Get an agent record by ID |
| `getAll` | Get Many | `GET /agents/fetch-all` | List all agents for the current user's organization |
| `getOutput` | Get Output | `GET /agents/fetch-output?id=<id>` | Get the output of the most recent container for an agent; optionally resolves result object via `/containers/fetch-result-object` |
| `launch` | Launch | `POST /agents/launch {id, arguments?, bonusArgument?}` | Add an agent to the launch queue; optionally fetches container via `/containers/fetch` |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- Argument values for `launch` accept expression strings for AI-driven value inference

## Runtime behavior

### Input

Each input item is processed independently. The operation and its parameters are read from the node configuration; input item data is not consumed unless the user binds it via expressions.

### Output

One output item per input item per operation:

- **delete:** `{ success: true }`
- **get:** The full agent record object from the API.
- **getAll:** An array of agent objects (all agents or limited).
- **getOutput (resolveData=false):** The raw `fetch-output` response (container metadata + output data).
- **getOutput (resolveData=true):** The parsed JSON result object of the most recent container, or `{}` if null.
- **launch (resolveData=false):** The launch result object (includes `containerId`).
- **launch (resolveData=true):** The full container record fetched via `/containers/fetch`.

### Errors

On API error, if `continueOnFail` is set, the node emits `{ error: <message> }` for that item and continues to the next. Otherwise the workflow stops with the exception.

### Expressions

All string-type parameters accept expressions, including `$fromAI()` for AI agent tool contexts.

## Acceptance tests

### Test: get an agent by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "agent",
  "operation": "get",
  "agentId": "42"
}
```

**Expect** output[0] to contain the body of the `GET /agents/fetch?id=42` response — an agent record object with fields like `id`, `name`, `scriptId`, etc.

### Test: launch an agent with key-value arguments

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "agent",
  "operation": "launch",
  "agentId": "42",
  "jsonParameters": false,
  "argumentsUi": {
    "argumentValues": [
      { "key": "profileUrl", "value": "https://linkedin.com/in/example" }
    ]
  }
}
```

**Expect** the executor to POST `{id: "42", arguments: {profileUrl: "https://linkedin.com/in/example"}}` to `/agents/launch` and output the launch response (which includes `containerId`).

### Test: launch an agent with resolveData

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "agent",
  "operation": "launch",
  "agentId": "42",
  "resolveData": true
}
```

**Expect** after launch, the executor fetches `/containers/fetch?id=<containerId>` and outputs the full container record.

### Test: delete an agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "agent",
  "operation": "delete",
  "agentId": "99"
}
```

**Expect** output[0] to be `{ "success": true }` after a successful `POST /agents/delete {id: "99"}`.

### Test: list all agents with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "agent",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** the executor to call `GET /agents/fetch-all`, slice the result to the first 10 items, and output them as an array.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Agent resource + 5 operations | Documented (public n8n docs + PhantomBuster API reference) | High confidence; matches public documentation |
| API key credential in header `X-Phantombuster-Key` | Documented (public n8n credentials page + PhantomBuster API spec) | High confidence |
| Tool-only type registration | Inferred from catalog | `phantombusterTool` is a separate type from `phantombuster`; the app node has `usableAsTool: true` |
| $fromAI() dynamic parameter support | Documented (n8n AI tool docs) | Standard AI tool behavior confirmed in public docs |
| `resolveData` behavior for `getOutput` and `launch` | Inferred from code structure | Medium-high: logic consistent with the API reference |
| Exact limit default (25) | Inferred from corpus | Low; default may differ across versions |
| Dynamic agent options loading | Documented (`getAgents` loadOptionsMethod) | High; confirmed via corpus |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.phantombusterTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
