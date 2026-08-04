---
type: n8n-nodes-base.zendeskTool
displayName: Zendesk
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Zendesk (AI Tool)

An AI agent tool variant of the Zendesk node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports Ticket, Ticket Field, User, and Organization resources against the Zendesk API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zendesk.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zendesk.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zendeskTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `zendeskApi` (API token) or `zendeskOAuth2Api` (OAuth2)

## Parameters

The node exposes a resource selector and an operation selector. Operation-specific fields appear based on the selected resource and operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `apiToken` | yes | `apiToken` or `oAuth2` |

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `ticket` | yes | Ticket, Ticket Field, User, or Organization |
| operation | options | resource-dependent | yes | Operation valid for the selected resource |

### Common fields

| name | type | notes |
|------|------|-------|
| resource identifier | string / expression | Required for get, delete, update, or singlular data operations. Identifies the specific ticket, user, or organization. |
| request fields | object / collection | Required for create and update operations. Contains the service-level fields to send. |
| query / pagination | collection | Optional filters, limit, offset for get-all and search operations. |

### Supported operations

All operations documented publicly for the base Zendesk node are available in the tool variant:

- **Ticket:** Create, Delete, Get, Get All, Recover suspended ticket, Update
- **Ticket Field:** Get, Get All
- **User:** Create, Delete, Get, Get All, Get user's organizations, Get current user data, Search, Update
- **Organization:** Create, Delete, Count, Get, Get All, Get data, Update

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped operations, parameter values are resolved per item and sent as a Zendesk API request using the configured credential. Collection operations (Get All, Search) may emit one item per returned resource, or a single item wrapping the list, depending on the operation's output semantics.

### Output

Successful requests produce one or more items on `main[0]`. Single-resource operations return the service response for that resource. Collection operations return an array of resources. The output shape follows what the Zendesk API returns — the implementation must not replace the service response with a generic envelope.

### $fromAI() support

In AI agent tool mode, resource, operation, and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target resource and operation at runtime
- Populating request fields, identifiers, and query parameters from model-generated values
- Providing clear descriptions of each parameter to guide model selection

### Errors

- Missing credentials, invalid authentication, missing required identifiers, and invalid field data must fail with an actionable error.
- Zendesk service errors (auth failure, not-found, validation, rate-limit, server errors) must propagate with their service error context.
- When `continueOnFail` is enabled, failed items follow the runtime's standard error-item contract.

### Tag replacement

When updating a ticket with a complete tag list, Zendesk replaces existing tags with the supplied list. The executor must preserve this behavior and document it. Additive tagging requires using the Zendesk API's `/tags` endpoint or `additional_tags` property.

## Acceptance tests

### Test: agent creates a ticket

**Given** a connected AI agent that decides to create a support ticket with subject "Login issue" and description "User cannot log in after password reset."

**Parameters:** resource `Ticket`, operation `Create`, request fields populated by the model.

**Expect:** a successful output item containing the created ticket with a service-assigned ID and the submitted subject and description.

### Test: agent searches users

**Given** an AI agent that decides to search for users matching the email domain "example.com".

**Parameters:** resource `User`, operation `Search`, query set to the domain filter.

**Expect:** a successful output containing matching user results. An empty array is valid when no users match.

### Test: agent updates a ticket

**Given** an input item with a known ticket ID and a new status.

**Parameters:** resource `Ticket`, operation `Update`.

**Expect:** the output contains the updated ticket with the new status reflected.

### Test: missing credential error

**Given** no credential is configured for the node.

**Expect:** execution fails before any API call with an actionable error about missing credentials.

### Test: tag replacement warning

**Given** a ticket with existing tags and an Update that specifies only tag `urgent`.

**Expect:** the result ticket has only `urgent` — the previous tags are removed. The executor must document this behavior.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Confirmed from public Zendesk node page. The tool variant shares the same resource/operation inventory. |
| Authentication methods | documented | Zendesk credentials page covers API token and OAuth2. |
| $fromAI() support | documented | General AI tool parameter population pattern documented in n8n docs. |
| Output shape for each operation | inferred | Follows the Zendesk API response shape; not prescribed here to avoid mirroring third-party schema. |
| Tag replacement behavior | documented | Explicit warning on the public Zendesk node page. |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/zendeskTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
