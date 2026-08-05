---
type: n8n-nodes-base.phantombuster
displayName: PhantomBuster
category: Sales, Marketing
versions: [1]
priority: medium
status: specced
---

# PhantomBuster

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.phantombuster.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/phantombuster.md | Public docs only |
| https://hub.phantombuster.com/reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.phantombuster`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `phantombusterApi` (API key, header `X-Phantombuster-Key`, base URL `https://api.phantombuster.com/api/v2`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed-options: `agent` | `agent` | yes | — | Single resource: Agent |
| operation | fixed-options | — | yes | — | See operations table below |
| agentId | string | — | yes | operations: `delete`, `get`, `getOutput`, `launch` | Agent identifier (loaded via `getAgents` dynamic options or entered manually) |
| returnAll | boolean | — | yes | operation: `getAll` | If false, `limit` controls page size |
| limit | number | 50 | no | operation: `getAll` | Max items when returnAll is false |
| resolveData | boolean | false | no | operations: `getOutput`, `launch` | When true, resolves the output result-object JSON for `getOutput`, or fetches the full container data after `launch` |
| jsonParameters | boolean | false | no | operation: `launch` | If true, `arguments` and `bonusArgument` are supplied as raw JSON strings instead of key-value pairs |
| argumentsJson | string | — | no | operation: `launch` AND `jsonParameters: true` | Raw JSON object passed as the agent's argument |
| bonusArgumentJson | string | — | no | operation: `launch` AND `jsonParameters: true` | Raw JSON object passed as the agent's bonus argument |
| argumentsUi | collection of `{key, value}` pairs | — | no | operation: `launch` AND `jsonParameters: false` | Key-value pairs assembled into a JSON object for the agent's argument |
| bonusArgumentUi | collection of `{key, value}` pairs | — | no | operation: `launch` AND `jsonParameters: false` | Key-value pairs assembled into a JSON object for the agent's bonus argument |

### Operations (Agent resource)

| operation | label | API call | Description |
|-----------|-------|----------|-------------|
| `delete` | Delete | `POST /agents/delete {id}` | Deletes an agent by ID. Returns `{success: true}`. |
| `get` | Get | `GET /agents/fetch?id=<id>` | Gets an agent record by ID. |
| `getAll` | Get Many | `GET /agents/fetch-all` | Lists all agents for the current user's organization. |
| `getOutput` | Get Output | `GET /agents/fetch-output?id=<id>` | Gets the output of the most recent container for an agent. `resolveData` optionally fetches the result object from `/containers/fetch-result-object`. |
| `launch` | Launch | `POST /agents/launch {id, arguments?, bonusArgument?}` | Adds an agent to the launch queue. `arguments` and `bonusArgument` are optional JSON objects. `resolveData` fetches the resulting container via `/containers/fetch`. |

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

All string-type parameters accept expressions: `agentId`, `argumentsJson`, `bonusArgumentJson`, key/value fields in the argument UI collections.

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
| `resolveData` behavior for `getOutput` and `launch` | Inferred from code structure | Medium-high: logic is consistent with the API reference (containers/fetch, containers/fetch-result-object) |
| Key-value argument UI vs raw JSON toggle | Inferred from code structure | Medium: the pattern (jsonParameters boolean + two input modes) is idiomatic for n8n |
| Exact error response shape on `continueOnFail` | Inferred from code structure | Low-medium: standard pattern |
| Dynamic agent options loading | Documented (`getAgents` loadOptions method present) | High: confirmed via corpus type signature |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.phantombuster.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
