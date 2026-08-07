---
type: n8n-nodes-base.odooTool
displayName: Odoo Tool
category: Sales
versions: [1]
priority: medium
status: specced
---

# Odoo Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.odoo/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/odoo/ | Public docs only |
| https://www.odoo.com/documentation/17.0/developer/reference/external_api.html | Third-party service API docs |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |
| Temporary CORPUS_DIR metadata under `/tmp/openflow-factory-run-20260806-005811/n8n-nodes-base.odooTool` | Public descriptor metadata, used only to confirm the type string and high-level resource/operation inventory |

The `odooTool` node has no dedicated documentation page. It is the AI agent tool variant of the base Odoo app node (`n8n-nodes-base.odoo`). Public n8n documentation confirms the base node can be used as an AI tool, and public `$fromAI()` documentation describes how tool-variant parameters are populated by AI agents.

The temporary corpus contained a package archive. The type string `n8n-nodes-base.odoo` was confirmed from the node JSON descriptor. The public app-node URL is the authoritative documentation source. No implementation source was used.

## Wire format

- **Type string:** `n8n-nodes-base.odooTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one required Odoo credential providing site URL, database name, username, and either an API key (recommended) or password.
- **AI tool use:** this node is exclusively an AI agent tool variant. Parameters can be populated dynamically via `$fromAI()` based on the AI agent's understanding of the Odoo API and the user's natural-language request. All eligible parameters support expression strings.

## Parameters

The tool node exposes the same resource-and-operation interface as the base Odoo node. Parameters are functionally equivalent to the base node; the primary difference is that when connected to an AI agent, the agent may supply resource, operation, and field values dynamically rather than from a fixed workflow configuration.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | option | contact | yes | always | Contact, Custom Resource, Note, or Opportunity. |
| operation | option | create | yes | selected resource | Create, delete, get, get all, or update, as supported by the selected resource. |
| custom resource | resource identifier | none | custom resource | custom resource only | Identifies an Odoo model selected from the instance or supplied as an identifier. |
| record identifier | string or number | none | get, update, delete | selected resource and operation | Identifies the record for single-record actions. May be supplied by the AI agent. |
| field values | object / repeated field mappings | none | create; optional update | create or update | Values to write to the selected Odoo record. The mapping must use fields accepted by that model. May be populated by the AI agent. |
| search and return controls | object | none | no | get all | Optional criteria, ordering, pagination, and result-limit controls for listing records. |
| additional options | object | none | no | operation-dependent | Operation-specific settings supported by the Odoo integration. |

The tool variant supports `$fromAI()` dynamic parameter population. When connected to an AI agent, the agent can set any parameter based on its reasoning about the user's intent, without requiring explicit values in the workflow configuration.

## Runtime behavior

### Input

The tool node consumes items from `main[0]` identically to the base Odoo node. For item-scoped create, update, get, and delete actions, expressions are evaluated against the current input item. A get-all action uses its configured search controls to retrieve records. When `$fromAI()` populates parameters, the agent's reasoning output replaces the expression evaluation for those parameter positions.

### External service contract

Same as the base Odoo node: the executor authenticates to the configured Odoo database and invokes the corresponding Odoo model operation via the Odoo External API (XML-RPC or JSON-RPC). Odoo model names, field names, permissions, and available custom models are instance-specific. The executor must pass model-specific mappings through without silently renaming fields or fabricating a fixed schema.

### Output

- Create, get, and update emit the successful Odoo record or operation result in the output item's `json` value. A create result preserves the created integer identifier.
- Get all emits returned records as OpenFlow items, one item per record.
- Delete emits a successful operation result.
- Output ordering follows Odoo's returned ordering for listing actions and input ordering for per-item actions.
- Binary data is not required by the public contract.

### Errors

Missing credentials, an invalid resource/operation combination, a missing required identifier or field mapping, authentication failure, an unknown model or field, insufficient permissions, and Odoo validation or transport errors must fail the operation. Preserve the service error message and relevant status/code when available. With `continueOnFail`, report the failure on the affected item and continue independent input items.

### Expressions

All scalar identifiers, mapped field values, and option parameters accept OpenFlow expression strings. When used from an AI agent via `$fromAI()`, expressions are not required — the agent supplies concrete values directly.

## Acceptance tests

### Test: create a contact via AI agent

**Given** an Odoo test database, credentials, and an AI agent configuration that routes to the odooTool:

**Parameters** (supplied by agent via `$fromAI()` based on user intent "create a contact named Alice for acme@example.com"):

```json
{
  "resource": "contact",
  "operation": "create",
  "fields": {
    "name": "Alice",
    "email": "acme@example.com"
  }
}
```

**Expect:** one output item containing a successful result and a non-empty integer created-record identifier. The persisted contact has the name "Alice" and email "acme@example.com".

### Test: get all opportunities with limit

**Given** an Odoo database containing opportunities:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "opportunity",
  "operation": "getAll",
  "returnAll": false,
  "limit": 3
}
```

**Expect:** no more than three output items, each representing an opportunity returned by Odoo. The test must not require a particular ordering or project-specific field set.

### Test: custom resource round trip

Configure a custom Odoo model available in the test database, create one item with a valid model field, then get it by the returned identifier. Assert that the value survives the round trip and that the tool node does not restrict requests to the built-in resources.

### Test: service error surfaced with continueOnFail

Use a credential without access to the selected model. Assert that execution fails with the Odoo error message preserved. With `continueOnFail` enabled and a second valid input item, assert that the valid item still produces a normal result and the failed item carries the standard item error.

### Test: $fromAI() populates record identifier

**Given** an AI agent instructed to "get the Odoo contact with ID 5":

Expect the tool to receive `resource: "contact"`, `operation: "get"`, `record identifier: 5` (or its string equivalent) from the agent's dynamic parameter resolution. Assert the single-record get returns the expected contact.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string and tool-variant identity | Inferred | The `odooTool` type string is not directly documented. It follows the established n8n naming convention (`baseNode` → `baseNodeTool`). The base node is explicitly marked "usable as a tool." The corpus node JSON confirms `n8n-nodes-base.odoo` as the type. |
| Resource families and CRUD operations | Documented | The public Odoo page lists Contact, Custom Resource, Note, and Opportunity with create/delete/get/getAll/update. |
| Credential ingredients | Documented | The credential page specifies site URL, username, database name, and password or API key. |
| $fromAI() support for tool variants | Documented | Public n8n documentation confirms tool nodes support dynamic parameter population by AI agents. |
| Exact field mappings, defaults, display conditions | Gap | These are intentionally abstracted because they are instance-specific or not part of the public documentation. |
| Tool-specific parameter differences from base node | Inferred | The tool variant likely shares the same parameter schema as the base node, with the addition of `$fromAI()` runtime resolution. No separate tool documentation exists to confirm any differences. |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/odoo.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** The odooTool executor may share or wrap the base Odoo executor, adding `$fromAI()` parameter resolution. The node must be registered under the `n8n-nodes-base.odooTool` type string with `usableAsTool` semantics in the node registry.
