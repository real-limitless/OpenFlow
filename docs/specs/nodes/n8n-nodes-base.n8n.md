---
type: n8n-nodes-base.n8n
displayName: n8n
category: Development
versions: [1]
priority: medium
status: specced
---

# n8n

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8n.md | Public docs only |
| https://docs.n8n.io/connect/n8n-api.md | Public docs only |
| https://docs.n8n.io/connect/n8n-api/authentication.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.n8n`
- **Aliases:** `Workflow`, `Execution`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `n8nApi`

### Credential: n8nApi

| Field | Type | Description |
|-------|------|-------------|
| `apiKey` | string | The `X-N8N-API-KEY` header value |
| `baseUrl` | string | The instance API root URL, e.g. `https://<name>.app.n8n.cloud/api/v1` or `https://<instance>/api/v1` |

The node sends the API key as the `X-N8N-API-KEY` header on every request to the configured `baseUrl`. This node does not support SSL connections; if the server requires SSL, the HTTP Request node should be used instead.

## Parameters

The node exposes a **Resource** selector and an **Operation** selector. The following table describes the parameters per resource/operation:

### Resource: Audit

| Operation | Parameters | Notes |
|-----------|-----------|-------|
| `generate` | (none) | Generates a security audit report. Options: `categories` (multi-select: Credentials, Database, Filesystem, Instance, Nodes), `daysAbandonedWorkflow` (number, default 90). |

### Resource: Credential

| Operation | Parameters | Notes |
|-----------|-----------|-------|
| `create` | `name` (string), `credentialType` (string), `data` (JSON object) | The `data` field must match the schema returned by `getSchema` for the given type. |
| `delete` | `credentialId` (string) | |
| `getSchema` | `credentialType` (string) | Returns the credential data schema for the given type. |

### Resource: Execution

| Operation | Parameters | Notes |
|-----------|-----------|-------|
| `get` | `executionId` (string) | Returns a single execution. Option: `includeExecutionDetails` (boolean, default: false). |
| `getAll` | `returnAll` (boolean), `limit` (number) | When `returnAll` is false, `limit` caps results. Filters: `workflow` (resource locator: fromList/byUrl/byId), `status` (enum: error/success/waiting). Option: `includeExecutionDetails` (boolean). |
| `delete` | `executionId` (string) | |

### Resource: Workflow

| Operation | Parameters | Notes |
|-----------|-----------|-------|
| `create` | `workflowObject` (JSON object) | The object must contain `name`, `nodes`, `connections`, and `settings`. |
| `get` | `workflow` (resource locator: fromList/byUrl/byId) | |
| `getAll` | `returnAll` (boolean), `limit` (number) | Filters: `returnOnlyPublishedWorkflows` (boolean), `tags` (comma-separated string). |
| `update` | `workflow` (resource locator), `workflowObject` (JSON object) | The object must contain `name`, `nodes`, `connections`, and `settings`. |
| `delete` | `workflow` (resource locator) | |
| `activate` | `workflow` (resource locator) | Publishes (activates) the workflow. |
| `deactivate` | `workflow` (resource locator) | Unpublishes (deactivates) the workflow. |

### Resource locator pattern

The `workflow` parameter uses a resource locator with three modes:
- `fromList` — select from a pre-loaded list of workflows
- `byUrl` — enter a workflow URL string
- `byId` — enter a workflow ID string

## Runtime behavior

### Input

The node passes through the input items as-is on the output branch. Each item is processed independently against the n8n API.

### Output

Each operation produces output items with a `json` property containing the API response body for that operation. The response shape depends on the n8n API endpoint being called:
- List operations typically return `{ data: [...], nextCursor: "..." }`
- Single-resource operations return the resource object directly
- Delete operations return the deleted resource object
- `create` and `update` return the created/updated resource object
- `activate`/`deactivate` return the updated workflow object
- `getSchema` returns the credential schema definition
- `generate` (audit) returns a security audit report object

### Errors

The node throws on API errors (non-2xx responses). Error messages should include the HTTP status code and response body. When `continueOnFail` is enabled, the node outputs a single item with `{ json: { error: { message, statusCode, ... } } }` on the output branch.

### Expressions

All string parameters accept expression strings (`{{ }}`).

## Acceptance tests

### Test: credential create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "credential",
  "operation": "create",
  "name": "My GitHub Credential",
  "credentialType": "githubApi",
  "data": "{\"accessToken\": \"ghp_abc123\"}"
}
```

**Expect** output[0] to contain a `json` property with the created credential object (including `id`, `name`, `type`, `createdAt`).

### Test: execution getAll with status filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "execution",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "filters": {
    "status": "error"
  }
}
```

**Expect** output[0] to contain a `json` property with a list of execution objects, each having at least `id`, `status`, `workflowId`, `startedAt`, and `stoppedAt`.

### Test: workflow lifecycle (create → activate → deactivate → delete)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters (first call):**

```json
{
  "resource": "workflow",
  "operation": "create",
  "workflowObject": "{\"name\": \"Test Workflow\", \"nodes\": [], \"connections\": {}, \"settings\": {}}"
}
```

**Expect** output[0]'s `json` to contain the created workflow object with `id`, `name`, `active: false`.

**Parameters (second call - activate):**

```json
{
  "resource": "workflow",
  "operation": "activate",
  "workflow": { "mode": "byId", "value": "{{ $json.id }}" }
}
```

**Expect** output[0]'s `json.active` to be `true`.

**Parameters (third call - deactivate):**

```json
{
  "resource": "workflow",
  "operation": "deactivate",
  "workflow": { "mode": "byId", "value": "{{ $json.id }}" }
}
```

**Expect** output[0]'s `json.active` to be `false`.

**Parameters (fourth call - delete):**

```json
{
  "resource": "workflow",
  "operation": "delete",
  "workflow": { "mode": "byId", "value": "{{ $json.id }}" }
}
```

**Expect** output[0]'s `json` to contain the deleted workflow object.

### Test: audit generate

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "audit",
  "operation": "generate",
  "categories": ["credentials", "nodes", "instance"],
  "daysAbandonedWorkflow": 60
}
```

**Expect** output[0]'s `json` to contain a security audit report object with sections for each selected category.

### Test: continueOnFail produces error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "execution",
  "operation": "delete",
  "executionId": "nonexistent-id"
}
```

**With** `continueOnFail: true`.

**Expect** output[0]'s `json` to contain an `error` object with `message`, `statusCode`, and `description`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | Documented | Exact names from public docs: Audit→generate, Credential→create/delete/getSchema, Execution→get/getAll/delete, Workflow→create/get/getAll/update/delete/activate/deactivate |
| Parameter names | Documented | All parameter names from public docs |
| Response shapes | Inferred | Documented at outcome level; exact field names depend on n8n API v1 OpenAPI spec |
| Resource locator details | Documented | fromList/byUrl/byId pattern documented for workflow selection |
| SSL limitation | Documented | Public docs explicitly state no SSL support |
| Alias list | Inferred from descriptor | `Workflow`, `Execution` from public descriptor metadata |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only