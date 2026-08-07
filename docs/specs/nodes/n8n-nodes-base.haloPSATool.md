---
type: n8n-nodes-base.haloPSATool
displayName: HaloPSA
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# HaloPSA (AI Tool)

An AI agent tool variant of the HaloPSA node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports Client, Site, Ticket, and User resources against the HaloPSA REST API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.halopsa/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/halopsa/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.haloPSATool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `haloPSAApi` (OAuth2 client-credentials flow with authorization server + resource server)

## Parameters

The node exposes a resource selector and an operation selector. Operation-specific fields appear based on the selected resource and operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `client` | yes | Client, Site, Ticket, or User |
| operation | options | resource-dependent | yes | Operation valid for the selected resource |

### Supported operations

All operations documented publicly for the base HaloPSA node are available in the tool variant:

- **Client:** Create, Delete, Get, Get All, Update
- **Site:** Create, Delete, Get, Get All, Update
- **Ticket:** Create, Delete, Get, Get All, Update
- **User:** Create, Delete, Get, Get All, Update

### Common field patterns

| name | type | notes |
|------|------|-------|
| resource identifier | string / expression | Required for get, delete, update operations. Identifies the specific client, site, ticket, or user by its numeric ID. |
| request fields | object / collection | Required for create and update operations. Contains the HaloPSA API entity fields to send. Supported fields per resource are determined by the HaloPSA API schema (e.g. client name, site address, ticket summary/details/agent/status/target date, user name/email). |
| query / pagination | collection | Optional filters, pagination, and status filters for get-all operations. |

## Runtime behavior

### Input

Each input item is processed independently. For create and update operations, request body data is taken from the configured parameters per item. For get, delete operations the resource ID is resolved per item.

### Output

Output items contain the HaloPSA API response for the executed operation. For get and get-all operations the node may simplify nested response structures into flat key-value objects. For create and update operations the response includes the created or modified entity. For delete operations the node passes the input item through unchanged.

### Errors

- API errors (invalid credentials, insufficient permissions, not found) are thrown as node errors.
- `continueOnFail` option allows the node to output an error item instead of halting execution.

### Expressions

All parameter fields that accept dynamic input support n8n expressions. Tool parameters intended for AI agent use additionally support `$fromAI()`.

## Acceptance tests

### Test: get all tickets

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "ticket",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0]:

A JSON array of ticket objects. Each ticket contains at minimum `id`, `summary`, `details`, `agent_id`, and `targetdate` fields. Actual shape matches the HaloPSA API ticket list response.

### Test: create a client

**Given** input items:

```json
[{ "json": { "clientName": "Acme Corp" } }]
```

**Parameters:**

```json
{
  "resource": "client",
  "operation": "create",
  "name": "={{ $json.clientName }}"
}
```

**Expect** output[0]:

A single JSON object representing the created client, including its `id` and `name` fields as returned by the HaloPSA API.

### Test: get a ticket by ID

**Given** input items:

```json
[{ "json": { "ticketId": 123 } }]
```

**Parameters:**

```json
{
  "resource": "ticket",
  "operation": "get",
  "ticketId": "={{ $json.ticketId }}"
}
```

**Expect** output[0]:

A single JSON object for the matching ticket containing at minimum `id`, `summary`, `details`, `agent_id`, and `targetdate`.

### Test: update a site

**Given** input items:

```json
[{ "json": { "siteId": 456, "newName": "Headquarters" } }]
```

**Parameters:**

```json
{
  "resource": "site",
  "operation": "update",
  "siteId": "={{ $json.siteId }}",
  "name": "={{ $json.newName }}"
}
```

**Expect** output[0]:

A single JSON object representing the updated site, including the modified `name` field and `id`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available resources and operations | documented | Public docs list Client, Site, Ticket, User with CRUD operations |
| Authentication protocol | documented | OAuth2 client-credentials with separate auth server and resource server URLs |
| Exact field names per resource | inferred | Field naming follows the HaloPSA REST API; exact parameter names (e.g. `ticketId`, `agent_id`) inferred from schema descriptors |
| $fromAI() support | documented | Standard tool node behavior documented in n8n AI integration docs |
| Pagination details (returnAll/limit) | inferred | De facto standard across n8n node-base tool nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.haloPSATool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
