---
type: n8n-nodes-base.freshdeskTool
displayName: Freshdesk Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Freshdesk (AI Tool)

An AI agent tool variant of the Freshdesk node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports Contact and Ticket resources against the Freshdesk API v2.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshdesk.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/freshdesk.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.freshdesk.com/api/ | Public docs only |

The temporary corpus was used only to confirm that the tool variant shares the same base Freshdesk node class with no separate type string. No implementation source was used.

## Wire format

- **Type string:** `n8n-nodes-base.freshdeskTool`
- **Aliases:** (none documented; shares the Freshdesk base node class with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Freshdesk API credential using an API key and a Freshdesk subdomain (domain). Authentication uses HTTP Basic with the API key as the username and literal `X` as the password, against `https://{domain}.freshdesk.com/api/v2/`.

## Parameters

The node exposes a resource selector (Contact or Ticket) and an operation selector within each resource. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `ticket` | yes | always | Contact or Ticket. |
| operation | options | resource-dependent | yes | selected resource | Operation valid for the selected resource: create, delete, get, getAll, update. |
| resource identifier | string / expression | none | conditional | get/delete/update | The ID of the contact or ticket. |
| request fields | collection | none | conditional | create/update | Values supported by the selected Freshdesk resource operation. |
| query / pagination controls | collection | none | conditional | getAll | Filters (e.g. email, companyId, requesterEmail), order, and limit/returnAll pagination. |

### Supported operations

All operations documented publicly for the base Freshdesk node are available in the tool variant:

- **Contact:** Create, Delete, Get, Get All, Update
- **Ticket:** Create, Delete, Get, Get All, Update

Operation-specific fields mirror those of the base Freshdesk node (e.g. requester identification method, status, priority, source, additional fields for contacts, update fields for tickets).

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped operations, parameter values are resolved per item and sent as a Freshdesk API v2 request using the configured credential. Collection operations (Get All) may use the first item or a single request; pagination parameters control the response set.

### Output

Successful requests produce one output item on `main[0]`. Single-resource operations return the Freshdesk API response for that resource. Collection operations return an array of resources. The output shape follows what the Freshdesk API returns — the implementation must not replace the service response with a generic envelope. Empty successful collections are valid outputs.

### $fromAI() support

In AI agent tool mode, resource, operation, and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target resource and operation at runtime
- Populating request fields, identifiers, and query parameters from model-generated values
- Providing clear descriptions of each parameter to guide model selection

### Errors

- Missing credentials, invalid authentication, missing required identifiers, and invalid field data must fail with an actionable error.
- Freshdesk service errors (400 validation, 401 auth, 403 access denied, 404 not found, 405 wrong method, 409 conflict, 415 unsupported content type, 429 rate limit, 500 server error) must propagate with their service error context.
- When `continueOnFail` is enabled, failed items follow the runtime's standard error-item contract.

### Expressions

Operation-specific scalar values and request/additional/update fields may be supplied by expressions. Expressions are resolved against the current input item before the request is sent.

## Acceptance tests

### Test: agent creates a ticket

**Given** a connected AI agent that decides to create a support ticket with subject "Login issue" and description "User cannot log in after password reset."

**Parameters:** resource `Ticket`, operation `Create`, request fields populated by the model.

**Expect:** a successful output item containing the created ticket with a service-assigned ID and the submitted subject and description.

### Test: agent looks up a contact

**Given** an AI agent that decides to retrieve a contact by a known contact ID.

**Parameters:** resource `Contact`, operation `Get`, resource identifier set to the known ID.

**Expect:** a successful output item containing the contact object with the matching ID.

### Test: agent searches tickets

**Given** an AI agent that decides to list tickets filtered by a known requester email.

**Parameters:** resource `Ticket`, operation `Get All`, query filter with the requester email.

**Expect:** a successful output item containing an array of tickets. At least one ticket matches the filter.

### Test: agent updates a ticket

**Given** an input item with a known ticket ID and a new status.

**Parameters:** resource `Ticket`, operation `Update`.

**Expect:** the output contains the updated ticket with the new status reflected.

### Test: missing credential error

**Given** no credential is configured for the node.

**Expect:** execution fails before any API call with an actionable error about missing credentials.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Confirmed from public Freshdesk node page. The tool variant shares the same resource/operation inventory. |
| Authentication (API key + subdomain) | documented | Confirmed by public Freshdesk credentials page and Freshdesk API docs. |
| $fromAI() support | documented | General AI tool parameter population pattern documented in n8n docs. |
| Output shape for each operation | inferred | Follows the Freshdesk API v2 response shape; not prescribed here to avoid mirroring third-party schema. |
| Tool variant alias mechanism | inferred | The tool variant wraps the same base node class as `usableAsTool: true`. |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/freshdeskTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
