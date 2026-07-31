---
type: n8n-nodes-base.highLevel
displayName: HighLevel
category: CRM
versions: [1]
priority: medium
status: specced
---

# HighLevel

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.highlevel.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/highlevel.md | Public docs only |
| https://marketplace.gohighlevel.com/docs/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.highLevel`
- **Aliases:** (none documented)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** HighLevel credentials. The documented credential choices are an API key for legacy API v1 integrations or OAuth2 for API v2 integrations. New integrations should use OAuth2 because API v1 is deprecated.

## Parameters

The node exposes a resource/action selection followed by the fields required by that action. OpenFlow should present these as ordinary typed configuration rather than reproducing the source UI's nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | selection | documented default not specified | yes | always | One of the documented service areas: Contact, Opportunity, Task, or Calendar. |
| `operation` | selection | documented default not specified | yes | resource-dependent | Contact: create or update, delete, get, get many, update. Opportunity: create, delete, get, get many, update. Task: create, delete, get, get many, update. Calendar: book an appointment, get free slots. |
| resource identifier(s) | string / expression | none | action-dependent | operation-dependent | Identify the contact, opportunity, task, calendar, location, or appointment involved in the request. Exact field names and identifier combinations are governed by the selected HighLevel API operation. |
| request fields | typed values / expressions | none | action-dependent | operation-dependent | Supply the attributes needed to create or update the selected CRM object, or the scheduling inputs needed for calendar actions. |
| pagination and query controls | typed values / expressions | service default | optional | get many / free slots | Limit, filter, or page collection and availability queries when supported by the selected API operation. |

Expressions are allowed for values sent to the service, including identifiers and request fields. The node must resolve expressions per input item.

## Runtime behavior

### Input

For each incoming item, execute the configured HighLevel action using the item's resolved expressions and the configured credential. A node may also be invoked with no meaningful input fields when all request values are static; in that case it still performs one action using the node configuration. This no-input behavior is inferred from the normal action-node model.

The external service contract is HighLevel's REST API. Resource and operation choices must map to supported HighLevel endpoints, and authentication must use the selected API key or OAuth2 credential. The executor must not silently substitute a different resource or action.

### Output

Return one OpenFlow item for each successfully processed input item. Its `json` value contains the service response data at the outcome level: created or updated object data for write actions, the requested object for get actions, a collection/pagination result for get-many actions, and appointment or availability data for calendar actions. Preserve useful response metadata when available, but do not require an invented wrapper or a response shape that is not part of the public API contract.

For a successful delete, return the service's confirmation/result as JSON rather than fabricating the deleted object. Preserve item order for per-item execution.

### Errors

Authentication failures, invalid configuration, rejected requests, missing resources, rate limits, and service errors fail the item/node with an actionable error. Do not convert an HTTP/API error into an empty successful result. If the workflow's `continueOnFail` behavior is enabled, return an item-level error representation according to the OpenFlow SDK contract; otherwise propagate the error and stop normal execution.

### Expressions

Resolve expressions in identifiers, request fields, query controls, and calendar inputs against the current input item. Static values must remain valid when no expression is used. Do not evaluate arbitrary code as part of this node.

## Acceptance tests

### Test: create or update a contact

**Given** one input item and valid OAuth2 credentials, configure the Contact create-or-update action with a contact email and name.

**Expect:** exactly one successful output item whose JSON contains the HighLevel service result identifying the created or updated contact. The request must use the current input item's resolved values.

### Test: get many opportunities

**Given** valid credentials and a configured Opportunity get-many action with a location/query constraint.

**Expect:** one successful output item containing the returned opportunity collection and any service-provided pagination information; no unrelated resource is requested.

### Test: update and delete a task

**Given** a task identifier resolved from the input item, first configure Task update and then Task delete.

**Expect:** update returns the service's updated-task result, and delete returns a successful service confirmation/result. A missing or invalid identifier produces an actionable failure, not an empty success.

### Test: calendar availability and booking

**Given** valid calendar/location inputs, call Calendar get-free-slots and then book-an-appointment using a returned available slot.

**Expect:** availability output describes the service's free slots, and the booking output identifies the resulting appointment or service confirmation.

### Test: credential and API error

**Given** an invalid credential or a request rejected by HighLevel.

**Expect:** execution fails with an error that identifies the authentication/request failure. With `continueOnFail`, the failed input is represented as an error item according to the SDK contract.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type, resources, and operations | documented | Listed on the public HighLevel node page. |
| Main input/output channels | inferred | Standard action-node mapping; the public page does not spell out channel metadata. |
| Exact request field names, defaults, and display conditions | not specified | Intentionally delegated to the selected HighLevel API operation instead of reconstructed from package metadata. |
| API authentication choices | documented | n8n documents API key for v1 and OAuth2 for v2, and recommends OAuth2 for new credentials. |
| Per-item execution and output itemization | inferred | Follows the OpenFlow item contract and normal action-node behavior. |
| API response details and rate-limit behavior | documented/inferred | The service API documentation is authoritative for response schemas and limits; the executor should surface service errors without inventing retries. |

Confidence is high for the resource/action inventory and authentication boundary, and medium for the generic item execution/output mapping because the node page does not publish its full wire descriptor.

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/highLevel.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
