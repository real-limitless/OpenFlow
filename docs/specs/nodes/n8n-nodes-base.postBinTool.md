---
type: n8n-nodes-base.postBinTool
displayName: PostBin Tool
category: Development, Data & Storage
versions: [1]
priority: medium
status: specced
---

# PostBin Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postbin.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://www.toptal.com/developers/postbin/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postBinTool`
- **Aliases:** (none; the base type `n8n-nodes-base.postBin` has `usableAsTool: true`, which enables AI agent usage without a separate tool type in later node versions)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** none (unauthenticated public API at `https://www.postb.in`)

## Parameters

This node shares the same two-resource API model as the base PostBin node. When used as an AI agent tool, the AI model may populate parameters dynamically via `$fromAI()`.

### Resource: Bin

| parameter | type | default | required | displayOptions | notes |
|-----------|------|---------|----------|----------------|-------|
| resource | fixed options | `bin` | yes | — | Options: `bin`, `request` |
| operation | fixed options | `create` | yes | resource == `bin` | `create` (POST /api/bin), `get` (GET /api/bin/{binId}), `delete` (DELETE /api/bin/{binId}) |
| binId | string | `""` | yes | operation in (`get`, `delete`) | Opaque bin identifier; accepts raw ID or full PostBin URL |

### Resource: Request

| parameter | type | default | required | displayOptions | notes |
|-----------|------|---------|----------|----------------|-------|
| resource | fixed options | `bin` | yes | — | Set to `request` |
| operation | fixed options | `get` | yes | resource == `request` | `get` (GET /api/bin/{binId}/req/{requestId}), `removeFirst` (GET /api/bin/{binId}/req/shift), `send` (POST /{binId}) |
| binId | string | `""` | yes | operation != none | Unique bin identifier for all request operations |
| requestId | string | `""` | yes | operation == `get` | Request identifier returned when a request is sent to the bin |
| binContent | string (textarea, 5 rows) | `""` | no | operation == `send` | Body content for the test POST request |
| requestOptions | collection | `{}` | no | — | Batch settings, SSL override, proxy, timeout (identical to base PostBin node) |

### Expression support

All string parameters accept n8n expressions. When used as an AI agent tool, `$fromAI()` is the recommended approach for dynamic parameter population.

## Runtime behavior

### Input

Each input item is processed independently. For the `send` operation the item JSON is forwarded as the POST body content property. All other operations ignore input item data.

### Output

**Bin — Create / Get:** one output item per input with `binId`, `nowTimestamp`, `nowIso`, `expiresTimestamp`, `expiresIso`, `requestUrl`, `viewUrl`.

**Bin — Delete:** input items pass through unchanged. The API confirmation (`{"msg":"Bin Deleted"}`) is suppressed.

**Request — Get / Remove First:** output item's `json` contains the PostBin request object with fields: `method`, `path`, `headers`, `query`, `body`, `ip`, `binId`, `inserted`.

**Request — Send:** output item contains `{ "requestId": "<opaque string>" }`.

### Error handling

- Invalid binId format triggers a `NodeApiError` with message "Bin ID format is not valid".
- HTTP 404/500 from PostBin API propagate as node errors.
- Standard `continueOnFail` semantics: on error, an `error` property is added to the item and execution continues if enabled.

## Acceptance tests

### Test: Bin — Create (AI tool invocation)

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bin",
  "operation": "create"
}
```

**Expect** output[0] to contain a `json` object with non-empty string fields `binId`, `requestUrl`, `viewUrl`, and integer fields `nowTimestamp`, `expiresTimestamp`.

### Test: Request — Send and Get via AI agent

Step 1 — **Send:**

```json
{
  "resource": "request",
  "operation": "send",
  "binId": "YS4il4gS",
  "binContent": "test payload from AI agent"
}
```

**Expect** output[0].json to contain `{ "requestId": "<non-empty string>" }`.

Step 2 — **Get:**

```json
{
  "resource": "request",
  "operation": "get",
  "binId": "YS4il4gS",
  "requestId": "<requestId from step 1>"
}
```

**Expect** output[0].json to contain `method`, `path`, `headers`, `body`, `binId`.

### Test: Request — Remove First

```json
{
  "resource": "request",
  "operation": "removeFirst",
  "binId": "YS4il4gS"
}
```

**Expect** output[0].json to contain a request object (same shape as Get). The returned request is removed from the bin server-side.

### Test: Invalid binId

```json
{
  "resource": "bin",
  "operation": "get",
  "binId": ""
}
```

**Expect** a `NodeApiError` with message describing invalid bin ID format.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| $fromAI() support | documented (public n8n docs for Tool nodes) | AI agent tools support `$fromAI()` for dynamic parameter population; this is a cross-cutting Tool pattern, not unique to PostBin |
| Parameter set | documented (postbin.md, types/nodes.json) | The tool variant shares all parameters with the base PostBin node; no additional parameters |
| API base URL | documented (types/nodes.json + PostBin API) | `https://www.postb.in` |
| Credential requirement | documented (types/nodes.json) | None — the node is unauthenticated |
| Assertion on usableAsTool | inferred | The base node descriptor sets `usableAsTool: true`, which in n8n enables AI Agent tool panel usage under the base type name |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/postBinTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
