---
type: n8n-nodes-base.pipedrive
displayName: Pipedrive
category: Integration
versions: [1]
priority: medium
status: specced
---

# Pipedrive

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pipedrive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pipedrive.md | Public docs only |

The node documentation lists the supported resource and action families. The
credential documentation defines API-token and OAuth2 authentication and the
corresponding read/full-access scope requirements. No third-party node source
was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.pipedrive`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Pipedrive credential, using either an API token or OAuth2

This is an action node, not a trigger. It can also be exposed as an AI tool;
that changes how values are supplied, not the service contract.

## Parameters

The implementation should expose the following concepts without requiring the
original UI nesting or names. Values may be literals or OpenFlow expressions
where the host supports expressions.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum-like string | none | yes | always | Selects Activity, Deal, Deal Activity, Deal Product, File, Lead, Note, Organization, Person, or Product. |
| operation | enum-like string | none | yes | depends on resource | Selects the documented action for the resource. The action set includes create, get, get-all/list, update, delete, search, duplicate, relationship listing, product association changes, download, and file metadata retrieval as applicable. |
| resource identifier | string/number | none | conditional | depends on action | Identifies the deal, activity, file, lead, note, organization, person, or product targeted by a single-record action. |
| request fields | object | empty | conditional | create/update actions | Fields accepted by the selected Pipedrive API operation, passed through using the service's documented names and types. |
| query and filters | object | empty | conditional | list/search actions | Pagination, filtering, search text, and related selectors supported by the selected service operation. |
| relationship identifiers | string/number | none | conditional | deal activity/product actions | Identifies the parent deal and, for product operations, the associated product. |
| file input/output settings | binary reference and options | none | conditional | file create/download actions | A create operation may read binary data from an input item; a download operation must make returned file content available as OpenFlow binary data. |
| custom API request | object | none | optional | custom API action | If custom API actions are implemented, forward the configured method, path, query, headers, and body subject to the credential's scopes. |

The exact field set is resource- and operation-specific and belongs to the
Pipedrive API contract. Unknown fields should not be silently invented by the
node.

## Runtime behavior

### Input

Process incoming `main` items independently. Each item supplies expressions,
identifiers, request fields, or binary input for one Pipedrive action. An action
that does not need item data still runs once for each input item; an explicit
empty-input invocation may run once when the engine supports that convention.

For file creation, the configured binary property is read from the current
item. For file download, the service response is converted to an OpenFlow
binary property rather than being discarded or reduced to text.

### Output

Emit one `main` item for each successful input action. The item's JSON contains
the successful Pipedrive result, preserving service identifiers and fields
needed by downstream nodes. List and search actions retain the returned
collection and pagination information at the result level; they must not be
silently reduced to only the first record. Delete actions return the service's
success/operation result. File downloads additionally include binary content
with a stable configured property name and useful MIME metadata when supplied
by the service.

The node has one output channel. It does not route records to different
outputs based on resource or operation.

### Errors

Fail the current action for missing credentials, an invalid resource/action
combination, missing required identifiers or request fields, authentication or
authorization failure, transport failure, rate limiting, and non-success API
responses. Preserve the service status/message where possible. Do not turn a
successful empty list into an error.

When the host's `continueOnFail` behavior is enabled, return an item-level
error representation for the failed input and continue processing subsequent
items. Without it, stop and surface the error. Do not claim success for a
mutation that the service rejected.

### Expressions

Resource/action selectors and all operation-specific values should accept
OpenFlow expressions when their declared type is expression-capable. Resolve
expressions separately for each input item before validating required values.

## Acceptance tests

The fixtures below use a mocked Pipedrive service adapter. Assertions are about
observable outcomes, not the vendor adapter's private request layout.

### Test: create and return a deal

**Given** input items:

```json
[{ "json": { "title": "Renewal", "value": 1200, "currency": "USD" } }]
```

**Parameters:**

```json
{ "resource": "Deal", "operation": "create", "requestFields": "={{ $json }}" }
```

**Expect** output[0] to contain one successful deal result with the service
identifier and the submitted title/value. The input item is not duplicated.

### Test: list activities without losing collection metadata

**Given** one input item and a mocked service response containing two activities
and a next-page indicator.

**Parameters:**

```json
{ "resource": "Activity", "operation": "getAll", "query": { "limit": 2 } }
```

**Expect** one output item whose JSON contains both returned activities and the
available pagination information. An empty service collection is valid output.

### Test: update an organization using an expression

**Given**:

```json
[{ "json": { "organizationId": 42, "name": "Acme Europe" } }]
```

**Parameters:**

```json
{
  "resource": "Organization",
  "operation": "update",
  "resourceIdentifier": "={{ $json.organizationId }}",
  "requestFields": { "name": "={{ $json.name }}" }
}
```

**Expect** one successful updated-organization result for identifier `42`.

### Test: download a file as binary data

**Given** a file identifier and a mocked PDF response.

**Parameters:**

```json
{ "resource": "File", "operation": "download", "resourceIdentifier": 7 }
```

**Expect** one output item with the downloaded bytes in an OpenFlow binary
property, a PDF MIME type when supplied, and JSON metadata identifying the
downloaded file.

### Test: authorization failure honors continue-on-fail

**Given** two input items and a mocked 403 response for the first action.

**Parameters:**

```json
{ "resource": "Deal", "operation": "get", "resourceIdentifier": 9 }
```

**Expect** with `continueOnFail=true`, the first output item records the
authorization error and the second item is still attempted. With it disabled,
execution fails at the rejected action.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resource families, and operation families | documented | Listed on the public Pipedrive node page. |
| API token and OAuth2 credentials | documented | Listed on the public credential page. |
| Scope differences between reads and mutations | documented | Credential documentation maps object actions to read/full-access scopes. |
| One main input and one main output | inferred | Standard action-node wire contract; the public overview does not spell out connection counts. |
| Per-input execution and continue-on-fail item behavior | inferred | Required OpenFlow execution semantics, not a Pipedrive-specific API promise. |
| Exact request field names, defaults, and conditional UI structure | intentionally unspecified | Not needed to define the external outcome and not established by the permitted overview documentation. |
| File binary property naming and pagination envelope | partially inferred | Binary output is required by the file-download outcome; exact property/envelope naming needs a public export or later compatibility fixture. |
| Custom API action details | documented capability, details unspecified | The node page points to custom API operations, but does not document this node's complete request schema. |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/pipedrive.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
