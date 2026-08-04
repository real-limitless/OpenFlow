---
type: n8n-nodes-base.pagerDutyTool
displayName: PagerDuty
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# PagerDuty (AI Tool)

An AI agent tool variant of the PagerDuty node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports Incident, Incident Note, Log Entry, and User resources against the PagerDuty REST API v2.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pagerduty.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pagerduty.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.pagerDutyTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `pagerDutyApi` (API token) or `pagerDutyOAuth2Api` (OAuth2)

## Parameters

The node exposes a resource selector and an operation selector. Operation-specific fields appear based on the selected resource and operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `apiToken` | yes | `apiToken` or `oAuth2` |

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `incident` | yes | Incident, Incident Note, Log Entry, or User |
| operation | options | resource-dependent | yes | Operation valid for the selected resource |

### Supported operations

All operations documented publicly for the base PagerDuty node are available in the tool variant:

- **Incident:** Create, Get, Get All, Update
- **Incident Note:** Create, Get All
- **Log Entry:** Get, Get All
- **User:** Get

### Operation fields

| name | type | notes |
|------|------|-------|
| resource identifier | string / expression | Required for get, update, or single-resource operations. Identifies the specific incident, log entry, or user by its PagerDuty ID. |
| request fields | object / collection | Required for create and update operations. Contains the service-level fields to send (e.g., incident title, service ID, details, priority, urgency, incident key). |
| query / pagination | collection | Optional filters, time range, limit for get-all operations. |

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped operations, parameter values are resolved per item and sent as a PagerDuty API v2 request using the configured credential. Collection operations (Get All) may emit one item per returned resource, or a single item wrapping the list, depending on the operation's output semantics.

### Output

Successful requests produce one or more items on `main[0]`. Single-resource operations return the PagerDuty API response object for that resource. Collection operations return an array of resources. The output shape follows what the PagerDuty API returns — the implementation must not replace the service response with a generic envelope.

### `$fromAI()` support

In AI agent tool mode, resource, operation, and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target resource and operation at runtime
- Populating request fields, identifiers, and query parameters from model-generated values
- Providing clear descriptions of each parameter to guide model selection

### Errors

- Missing credentials, invalid authentication, missing required identifiers, and invalid field data must fail with an actionable error.
- PagerDuty service errors (auth failure, not-found, validation, rate-limit, server errors) must propagate with their service error context.
- When `continueOnFail` is enabled, failed items follow the runtime's standard error-item contract.

## Acceptance tests

### Test: agent creates an incident

**Given** a connected AI agent that decides to create a PagerDuty incident with title "Database server down" on service ID "SERVICE001".

**Parameters:** resource `Incident`, operation `Create`, request fields populated by the model.

**Expect:** a successful output item containing the created incident with a service-assigned ID and the submitted title and service affiliation.

### Test: agent gets an incident

**Given** an AI agent that decides to retrieve a specific incident by ID "INCIDENT001".

**Parameters:** resource `Incident`, operation `Get`.

**Expect:** the output contains the incident details with at least an `id`, `title`, and `status` field.

### Test: agent lists incidents

**Given** an AI agent that decides to fetch all incidents filtered by status "triggered".

**Parameters:** resource `Incident`, operation `Get All`, query set to the status filter.

**Expect:** a successful output containing matching incidents. An empty array is valid when none match.

### Test: agent gets a user

**Given** an AI agent that decides to retrieve a PagerDuty user by ID "USER001".

**Parameters:** resource `User`, operation `Get`.

**Expect:** the output contains the user details including `id`, `name`, and `email`.

### Test: missing credential error

**Given** no credential is configured for the node.

**Expect:** execution fails before any API call with an actionable error about missing credentials.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Confirmed from public PagerDuty node page. The tool variant shares the same resource/operation inventory. |
| Authentication methods | documented | PagerDuty credentials page covers API token and OAuth2. |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs. |
| Output shape for each operation | inferred | Follows the PagerDuty API v2 response shape; not prescribed here to avoid mirroring third-party schema. |
| Exact `additionalFields` sub-fields | partially documented | PagerDuty API has documented fields; the executor should pass through to the API without reconstructing the original node's UI nesting. |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/pagerDutyTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
