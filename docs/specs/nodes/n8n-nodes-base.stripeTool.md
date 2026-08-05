---
type: n8n-nodes-base.stripeTool
displayName: Stripe Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Stripe Tool

An AI agent tool variant of the [Stripe action node](./n8n-nodes-base.stripe.md). When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports the same set of Stripe resources and operations against the Stripe REST API.

The node exposes no dedicated public n8n documentation page — its behavior is the base Stripe node applied in tool context.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.stripe.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/stripe/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.stripe.com/api | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.stripeTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `stripeApi` (Secret key, optional Signature Secret)

### Credential fields

| field | type | required | notes |
|-------|------|----------|-------|
| secretKey | string | yes | Stripe Secret API key (prefixed `sk_live_` or `sk_test_`) |
| signatureSecret | string | no | Webhook signing secret for trigger verification; not used by the tool node |

## Parameters

The node exposes the same resource/operation selector pattern as the base Stripe node. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `secretKey` | yes | Always `secretKey` for this tool |

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `balance` | yes | Selects the Stripe API entity: Balance, Charge, Coupon, Customer, Customer Card, Meter Event, Source, Token |
| operation | options | resource-dependent | yes | Operation valid for the selected resource |

### Supported resources and operations

All operations publicly documented for the base Stripe node are available in the tool variant:

- **Balance:** Get
- **Charge:** Create, Get, Get All, Update
- **Coupon:** Create, Get All
- **Customer:** Create, Delete, Get, Get All, Update
- **Customer Card:** Add, Get, Remove
- **Meter Event:** Create
- **Source:** Create, Delete, Get
- **Token:** Create

### Operation fields

Each operation exposes the same parameter fields as the base Stripe node. Required parameters are determined by the selected resource and operation per the Stripe REST API contract:

| name | type | notes |
|------|------|-------|
| Resource/entity ID | string / expression | Required for get, update, delete operations targeting a single resource (e.g., charge ID `ch_xxx`, customer ID `cus_xxx`) |
| Request payload fields | varied | Entity-specific fields as defined by the Stripe API (amount, currency, source, email, name, description, metadata, etc.) |
| Pagination / query fields | collection | Optional for Get All operations: limit, starting_after, ending_before, created date range |
| Additional options | collection | Optional per-operation extras such as statement descriptor, shipping info, and expand fields |

## Runtime behavior

### Input

Each incoming item from `main[0]` is processed independently. Parameter values are resolved per item (expressions and `$fromAI()` calls evaluated) and sent as a single Stripe REST API request using the configured credential.

### Output

Emits one main output item per successful operation result. The item JSON contains the Stripe API response object for the executed operation, preserving all service-assigned identifiers and documented fields:

- **Single-resource operations (Create/Get/Update/Delete):** the full Stripe resource object (e.g., a charge object with `id: "ch_xxx"`, `object: "charge"`, `amount`, `currency`, `status`, etc.)
- **Collection operations (Get All):** the Stripe list object with `object: "list"`, `data` array of resource objects, and pagination metadata (`has_more`, `url`). Depending on the operation mode, items may be emitted individually or as a single list wrapper.
- **Delete:** the Stripe deleted-object response (`{ id, object, deleted: true }`).

Binary data is not produced.

### `$fromAI()` support

In AI agent tool mode, resource, operation, and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target Stripe resource and operation at runtime based on the agent's reasoning
- Populating request fields, identifiers, and query parameters from model-generated values
- Providing clear descriptions of each parameter to guide model selection

### Errors

- Missing credentials or invalid authentication fails with an actionable error message.
- Stripe API 4xx responses (invalid request, missing required fields, authentication failure, resource not found) surface their Stripe error message and type.
- Stripe API 5xx responses surface the HTTP status and available error context.
- When `continueOnFail` is enabled, failed items follow the runtime's standard error-item contract with the Stripe error detail preserved.

## Acceptance tests

### Test: model gets balance

**Given** a connected AI agent that decides to check the Stripe account balance.

**Parameters:** resource `Balance`, operation `Get`, no additional parameters.

**Expect:** a successful output item whose `json` contains `object: "balance"` and an `available` array of `{ amount, currency }` objects.

### Test: model creates a charge

**Given** a connected AI agent that decides to charge a customer $20.00 USD using a token.

**Parameters:** resource `Charge`, operation `Create`, amount `2000`, currency `"usd"`, source `"tok_visa"`.

**Expect:** output item `json.id` starts with `"ch_"` and `json.object` equals `"charge"`.

### Test: model gets a customer

**Given** a connected AI agent that decides to look up a customer by ID `"cus_xxxxxxxxxxxxx"`.

**Parameters:** resource `Customer`, operation `Get`, customerId `"cus_xxxxxxxxxxxxx"`.

**Expect:** output item `json.id` equals the input ID and `json.object` equals `"customer"`.

### Test: model creates a meter event

**Given** a connected AI agent that decides to record a meter event.

**Parameters:** resource `Meter Event`, operation `Create`, eventName `"api_requests"`, value `1`, customerId `"cus_xxxxxxxxxxxxx"`.

**Expect:** output item `json.object` equals `"meter_event"` and `json.event_name` equals `"api_requests"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string existence | Inferred from naming pattern | `n8n-nodes-base.stripeTool` is not present in the published npm package v2.15.1 as a separate node file. It may be a virtual alias or available in a later version. The spec models it as identical in behavior to the base Stripe node but with AI tool semantics |
| Operation list | Documented (public docs) | Matches the base Stripe node resource/operation list from n8n public docs |
| Parameter shapes | Inferred from Stripe API schema | Individual field names, defaults, and constraints follow the Stripe REST API (docs.stripe.com/api) |
| `$fromAI()` support pattern | Documented (public docs) | The `$fromAI()` function and tool parameter population mechanism are documented at docs.n8n.io |
| Response schemas | Inferred from Stripe API | Output shapes are raw Stripe API responses; spec describes at outcome level |
| Error handling | Inferred | Follows n8n tool node conventions; Stripe-specific error types are documented by Stripe |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.stripeTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
