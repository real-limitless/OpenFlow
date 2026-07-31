---
type: n8n-nodes-base.salesforce
displayName: Salesforce
category: Sales
versions: [1]
priority: high
status: specced
---

# Salesforce

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesforce.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/salesforce.md | Public docs only |

The temporary corpus was consulted only for descriptor metadata confirming the
wire type, version, category, and public documentation URLs. No package source
was consulted or copied.

## Wire format

- **Type string:** `n8n-nodes-base.salesforce`
- **Aliases:** (none documented)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Salesforce credentials using either JWT or OAuth2 authentication; the credential selects a production or sandbox environment.

The node is documented as usable as an AI tool. OpenFlow should allow ordinary
operation parameters to be supplied by an AI-tool caller, subject to the same
validation and authorization rules as workflow execution.

## Parameters

The UI should expose a resource selector, an operation selector, a credential
reference, and operation-specific values. The exact field layout is not part of
this clean-room contract. Record fields, custom fields, IDs, filters, query
text, and file content should be accepted in the most direct representation
supported by the corresponding Salesforce API operation.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | option | account | yes | -- | Select the Salesforce object or service area listed below. The default is an implementation convenience, not an external API requirement. |
| operation | option | -- | yes | resource-dependent | Select the action for the chosen resource. |
| record identifier | string or expression | -- | conditional | read/update/delete/upsert/comment/note actions | Salesforce record ID or another documented identifier required by the selected action. |
| record fields | object or mapped fields | -- | conditional | create/update/upsert actions | Values for standard and custom fields. Values may be expressions evaluated per input item. |
| query | string or expression | -- | conditional | search | SOQL query to execute against Salesforce. |
| collection controls | object | -- | no | list actions | Optional filtering, pagination, and result-limit controls where supported by the service. |
| note/comment/campaign data | object or mapped fields | -- | conditional | note, comment, or campaign actions | Data required by the selected related-record action. |
| document/attachment data | binary or mapped fields | -- | conditional | document upload or attachment actions | File content and metadata required by the selected upload action. |
| flow data | object or mapped fields | -- | conditional | flow invoke | Inputs supplied to the selected Salesforce flow. |

The documented resource areas and operation outcomes are:

- **Account:** create, get, list, update, delete, upsert, add a note, and inspect metadata.
- **Attachment:** create, get, list, update, delete, and inspect metadata.
- **Case:** create, get, list, update, delete, and add a comment or inspect metadata.
- **Contact:** create, get, list, update, delete, upsert, add a note, add to a campaign, and inspect metadata.
- **Custom Object:** create, get, list, update, delete, and upsert records.
- **Document:** upload a document.
- **Flow:** list flows and invoke a flow.
- **Lead:** create, get, list, update, delete, upsert, add a note, add to a campaign, and inspect metadata.
- **Opportunity:** create, get, list, update, delete, upsert, add a note, and inspect metadata.
- **Search:** execute one SOQL query and return all results from that query.
- **Task:** create, get, list, update, and delete.
- **User:** get one user or list users.

## Runtime behavior

### Input

The node consumes items from `main[0]`. Expressions in operation-specific
parameters are evaluated against the current item. Record mutations and
record-by-identifier actions are expected to process input items independently;
resource-list and search actions may issue one request for the execution when
their parameters do not depend on item data. An implementation may optimize
requests, but must preserve per-item expression and output semantics.

### Output

Successful results are emitted on `output[0]` as OpenFlow items. The `json`
value contains the useful Salesforce result for the selected action: a created,
updated, or retrieved record; a list member for list/search results; metadata
for metadata actions; a flow result for flow invocation; or an explicit success
confirmation for a service action with no response body. Upload actions may
also carry returned file metadata and binary content when the service provides
it. Delete and other no-content actions must not fabricate a record body.

List and search results are represented as one output item per returned result
unless the node contract explicitly requires a single aggregate result. Empty
successful result sets produce zero result items or a documented empty-result
item consistently within the chosen OpenFlow mapping; they must not be treated
as authentication failures.

### Errors

- Missing credentials, invalid credentials, expired authorization, and insufficient Salesforce permissions fail with an actionable authentication or authorization error.
- Missing identifiers, malformed field mappings, invalid query text, and missing operation-specific values fail validation before the request when possible.
- Salesforce API errors and transport failures are surfaced with the upstream status/message and selected resource and operation context.
- With `continueOnFail`, a failed input item emits an error item on the same output rather than aborting unrelated input items. Without it, the node raises the node execution error.

### Expressions

Operation-specific strings, identifiers, query text, field values, and upload
metadata accept OpenFlow expressions. Resource and operation selectors are
static configuration and should not depend on item data unless the OpenFlow
runtime explicitly supports dynamic operation dispatch.

## Acceptance tests

### Test: create an account with mapped fields

**Given** input items:

```json
[{ "json": { "name": "Acme Example" } }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "create",
  "fields": { "Name": "={{ $json.name }}" }
}
```

**Expect** one result identifying the created Salesforce record and reflecting
the submitted account name. The test must not require unrelated response
fields.

### Test: get all contacts

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "contact", "operation": "getAll" }
```

**Expect** successful output containing zero or more contact result items.
Every returned item identifies a contact, and an empty result is not an error.

### Test: execute a SOQL search

**Given** input items:

```json
[{ "json": { "accountName": "Acme Example" } }]
```

**Parameters:**

```json
{
  "resource": "search",
  "operation": "query",
  "query": "SELECT Id, Name FROM Account WHERE Name = '{{ $json.accountName }}'"
}
```

**Expect** output items representing the rows returned by Salesforce. The
number of output items equals the number of returned rows, and each row
includes the selected `Id` and `Name` values.

### Test: delete a record

**Given** input items:

```json
[{ "json": { "recordId": "001000000000001" } }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "delete",
  "recordId": "={{ $json.recordId }}"
}
```

**Expect** one successful confirmation item or the unchanged input item, as
specified by the executor mapping. The output must not claim a full account
record when Salesforce returned no record body.

### Test: invalid credentials with continue-on-fail

**Given** one account lookup item and credentials that Salesforce rejects.

**Parameters:**

```json
{ "resource": "account", "operation": "get", "recordId": "001000000000001" }
```

**Expect** `continueOnFail` produces one output error item containing a useful
authentication/authorization message; normal execution raises the same error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type, category, version, and documentation links | documented | Confirmed by public descriptor metadata and public documentation. |
| Resource and operation families | documented | Listed on the public Salesforce node page. |
| JWT and OAuth2 credentials; production/sandbox environment | documented | Confirmed by the public credentials page. |
| Salesforce transport and response details | documented at service level, abstracted here | The node page does not define a stable response schema. |
| Parameter names, defaults, nested UI layout, and pagination details | inferred/omitted | Public node docs list outcomes, not the complete node property schema; intentionally left abstract. |
| Per-item request strategy and no-content confirmation | inferred | Required as an interoperable OpenFlow outcome, but exact original behavior is not publicly specified. |
| AI-tool parameter availability | documented | The public node page states that the node can be used as an AI tool; exact tool metadata is omitted. |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/salesforce.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
