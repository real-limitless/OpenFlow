---
type: n8n-nodes-base.paddleTool
displayName: Paddle Tool
category: Sales
versions: [1]
priority: medium
status: specced
---

# Paddle Tool

AI agent tool variant of the Paddle node. Wraps Paddle Classic API read and write operations so an AI agent can manage coupons, payments, plans, products, and user records via natural-language parameter population (`$fromAI()`).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paddle/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/paddle/ | Public docs only |
| https://developer.paddle.com/classic/api-reference/1384a288aca7a-api-reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.paddleTool`
- **Aliases:** (none — the base node `n8n-nodes-base.paddle` is the non-tool sibling)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `paddleApi` (Vendor Auth Code + Vendor ID + sandbox toggle)

## Parameters

### Resource selector

**name:** `resource`  
**type:** fixed-collection-style dropdown  
**required:** yes  
Determines which Paddle API resource class the operation targets.

| value | label |
|-------|-------|
| coupon | Coupon |
| payment | Payment |
| plan | Plan |
| product | Product |
| user | User |

### Operation selector (per resource)

**name:** `operation`  
**type:** fixed-collection-style dropdown  
**required:** yes  
The action to perform on the selected resource.

| resource | operations |
|----------|-----------|
| coupon | create, getAll, update |
| payment | getAll, reschedule |
| plan | get, getAll |
| product | getAll |
| user | getAll |

### Resource-specific parameters

When the AI agent populates parameters via `$fromAI()`, the following fields may be required depending on resource and operation:

- **Coupon**
  - `couponId` (string, required for update) — the ID of the coupon to modify
  - Additional fields that the Classic API coupon endpoints accept (e.g., discount amount, recurring limits, expiration dates) are passed as free-form additional fields / options

- **Payment**
  - `paymentId` (string, required for reschedule) — the ID of the payment to reschedule
  - `date` (string, required for reschedule) — the new scheduled payment date

- **Plan**
  - `planId` (string, required for get) — the ID of the plan to retrieve

- **Product**
  - No per-operation parameters beyond resource selection for getAll

- **User**
  - No per-operation parameters beyond resource selection for getAll

### Options / additional fields

An `additionalFields` or `options` group may be present, containing API-specific configuration keys that the Paddle Classic API accepts for each operation (e.g., pagination limits, status filters, coupon type, group/subscription filters). The exact set of keys mirrors the Paddle Classic API query/body parameters for each endpoint.

## Runtime behavior

### Input

Each input item is processed independently. When the AI agent uses this tool, parameters are populated by the agent via `$fromAI()`. The node passes through the original input item and appends the Paddle API response under the `json` key.

### Output

For every input item, the node produces exactly one output item on `output[0]`. The output shape depends on the operation:

- **getAll** operations return an array of resource objects under a `results` or `items` key (the array shape is defined by the Paddle Classic API response for that resource).
- **get** operations return a single resource object.
- **create** / **update** / **reschedule** return the API response object, usually containing a `result` or success indicator along with the affected resource.
- Binary data is not produced.

The output wraps the API response so that downstream nodes receive `{ json: <response_data> }`.

### Errors

- Network errors (timeout, DNS, HTTP 4xx/5xx) throw a `NodeApiError` with the HTTP status and response body message.
- Missing required parameters (e.g., `couponId` for update) throw a `NodeOperationError`.
- `continueOnFail` (if enabled per-node) causes the node to return an empty item for the failing input rather than halting execution.

### Expressions

All string and number parameters accept n8n expression syntax (`{{ }}`). In AI agent context, the `$fromAI()` function allows the LLM to dynamically populate parameters based on the user's natural-language request.

## Acceptance tests

### Test: coupon — create

**Given** input items:
```json
[{ "json": {} }]
```

**Resource:** `coupon`  
**Operation:** `create`  
**Credentials:** `paddleApi` (sandbox mode)

**Expect** output[0] to contain:
```json
[{ "json": { "success": true, "response": { "coupon": { "id": "<string>" } } } }]
```

The specific coupon fields in the response follow the Paddle Classic API shape.

### Test: payment — getAll

**Given** input items:
```json
[{ "json": {} }]
```

**Resource:** `payment`  
**Operation:** `getAll`

**Expect** output[0] to contain a non-null json object with a key representing the payments collection (e.g., `response` or `payments`), consistent with the Paddle Classic API list response.

### Test: plan — get

**Given** input items:
```json
[{ "json": { "planId": "12345" } }]
```

**Resource:** `plan`  
**Operation:** `get`  
**Parameters:** `planId` from input

**Expect** output[0] to contain a single plan object under the json key with attributes matching the Paddle plan schema (id, name, billing_type, etc.).

### Test: user — getAll

**Given** input items:
```json
[{ "json": {} }]
```

**Resource:** `user`  
**Operation:** `getAll`

**Expect** output[0] to contain a non-null json object with a key holding a list of user records.

### Test: payment — reschedule (missing parameter, error case)

**Given** input items:
```json
[{ "json": { "paymentId": "" } }]
```

**Resource:** `payment`  
**Operation:** `reschedule`  
**Parameters:** (paymentId empty)

**Expect** a `NodeOperationError` to be thrown explaining that `paymentId` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs | Full coverage via docs.n8n.io |
| Credential shape | Public docs | Vendor Auth Code + Vendor ID + sandbox toggle |
| Exact Paddle API field names | Public (Paddle Classic API reference) | The Paddle Classic API docs define request/response shapes per endpoint |
| $fromAI() behavior | Public docs | Standard AI tool pattern used across all n8n Tool nodes |
| Internal parameter nesting | Inferred from package descriptor | The exact UI nesting of additionalFields/options is not critical at the spec level; the executor should flatten them per Paddle API docs |
| nodeVersion | inferred from descriptor | v1.0 |
| category | inferred from descriptor | Sales |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.paddleTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
