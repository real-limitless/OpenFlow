---
type: n8n-nodes-base.odoo
displayName: Odoo
category: Sales
versions: [1]
priority: medium
status: specced
---

# Odoo

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.odoo.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/odoo.md | Public docs only |
| https://www.odoo.com/documentation/17.0/developer/reference/external_api.html | Third-party service API docs |
| Temporary CORPUS_DIR metadata under `/tmp/openflow-factory-run-20260730-213027/n8n-nodes-base.odoo` | Public descriptor metadata, used only to confirm the type string and high-level resource/operation inventory |

The temporary corpus contained a package archive, but no package source was used. Its supplied core-node URL was stale; the public app-node URL above is the valid Odoo documentation page.

## Wire format

- **Type string:** `n8n-nodes-base.odoo`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one required Odoo credential providing site URL, database name, username, and either an API key or password. API-key authentication is the recommended public configuration.
- **AI tool use:** the node is documented as usable as a tool; eligible parameters may therefore be supplied by a connected AI agent when the host supports that feature.

## Parameters

The node exposes a resource-and-operation interface. Field names and model-specific values are supplied through the operation's data mapping.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | option | contact | yes | always | Contact, Custom Resource, Note, or Opportunity. |
| operation | option | create | yes | selected resource | Create, delete, get, get all, or update, as supported by the selected resource. |
| custom resource | resource identifier | none | custom resource | custom resource only | Identifies an Odoo model selected from the instance or supplied as an identifier. |
| record identifier | string or number | none | get, update, delete | selected resource and operation | Identifies the record for single-record actions. |
| field values | object / repeated field mappings | none | create; optional update | create or update | Values to write to the selected Odoo record. The mapping must use fields accepted by that model. |
| search and return controls | object | none | no | get all | Optional criteria, ordering, pagination, and result-limit controls for listing records. Exact fields are instance-dependent. |
| additional options | object | none | no | operation-dependent | Operation-specific settings supported by the Odoo integration. Options for one resource must not be assumed for another. |

Editable scalar identifiers and mapped values should support OpenFlow expressions where the imported workflow supplies an expression. A custom resource may be selected from available Odoo models or entered by identifier; the implementation must not require the model list to be known at build time.

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped create, update, get, and delete actions, it evaluates expressions against the current input item and performs the requested Odoo action for that item. A get-all action uses its configured search controls to retrieve records. An empty input collection must not invent a record; operation behavior is determined by the configured operation and its required identifiers.

### External service contract

The executor authenticates to the configured Odoo database and invokes the corresponding Odoo model operation. Odoo model names, field names, permissions, and available custom models are instance-specific. The executor must pass model-specific mappings through without silently renaming fields or fabricating a fixed schema. Odoo's external API is authoritative for validation, identifiers, filtering, and permissions.

### Output

- Create, get, and update emit the successful Odoo record or operation result in the output item's `json` value. A create result must preserve the created identifier when Odoo returns one.
- Get all emits returned records as OpenFlow items, one item per record, unless the host item contract explicitly requires one collection item. Records must not be wrapped in an invented resource-specific schema.
- Delete emits a successful operation result. If Odoo returns no body, the executor may emit a minimal success object or preserve the input item, but must not claim success when the service call failed.
- Output ordering follows Odoo's returned ordering for listing actions and input ordering for per-item actions.
- Binary data is not required by the public Odoo node contract.

### Errors

Missing credentials, an invalid resource/operation combination, a missing required identifier or field mapping, authentication failure, an unknown model or field, insufficient permissions, and Odoo validation or transport errors must fail the operation rather than produce a fabricated success item. Preserve the service error message and relevant status/code when available. With `continueOnFail`, report the failure on the affected item using the standard SDK error contract and continue independent input items; without it, stop with an execution error.

### Expressions

User-supplied scalar identifiers and mapped values may contain OpenFlow expression strings. Expressions are evaluated in the current input-item context before the Odoo request is made. Resource and operation selectors are configuration controls and should not change per item unless the host explicitly supports expression-backed selectors.

## Acceptance tests

### Test: create a contact

**Given** an Odoo test database and credentials with permission to create contacts:

```json
[{ "json": { "name": "OpenFlow test contact", "email": "openflow@example.test" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "fields": {
    "name": "={{ $json.name }}",
    "email": "={{ $json.email }}"
  }
}
```

**Expect:** one output item containing a successful result and a non-empty created-record identifier. The persisted contact has the requested name and email.

### Test: get and update a contact

**Given** an existing contact identifier `42`:

```json
[{ "json": { "contactId": 42, "newName": "Renamed by OpenFlow" } }]
```

Run get with `={{ $json.contactId }}` and assert that the returned record has identifier `42`. Run update with the same identifier and `name = {{ $json.newName }}`, then assert that a subsequent get returns the new name.

### Test: get all notes with a limit

**Given** an Odoo database containing notes:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "note",
  "operation": "getAll",
  "returnAll": false,
  "limit": 2
}
```

**Expect:** no more than two output items, each representing a note returned by Odoo. The test must not require a particular ordering or project-specific field set.

### Test: custom resource round trip

Configure a custom Odoo model available in the test database, create one item with a valid model field, then get it by the returned identifier. Assert that the value survives the round trip and that the executor does not restrict requests to the built-in resources.

### Test: service error is surfaced

Use a credential without access to the selected model, or request a nonexistent record identifier. Assert that execution fails with the Odoo error message/status preserved. With `continueOnFail` enabled and a second valid input item, assert that the valid item still produces a normal result and the failed item carries the standard item error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, main input/output, and tool capability | Documented + public descriptor metadata | The public Odoo page identifies the node and purpose; isolated metadata was used only for type and high-level inventory. |
| Resource families and CRUD-style operations | Documented | The Odoo page lists Contact, Custom Resource, Note, and Opportunity, each with create, delete, get, get all, and update actions. |
| Credential ingredients and authentication methods | Documented | The credential page specifies site URL, username, database name, and API key or password. |
| Exact UI property names, defaults, model field lists, and display conditions | Gap | These are intentionally abstracted because they are instance-specific or not required by public documentation. |
| Per-item scheduling and get-all item splitting | Inferred | Needed to map the integration to OpenFlow's item contract, but not specified by the public page. |
| Exact Odoo endpoint/RPC encoding and version differences | Gap | The executor must follow the selected Odoo external API version and must not infer a fixed REST endpoint from this spec. |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/odoo.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
