---
type: n8n-nodes-base.paddle
displayName: Paddle
category: Sales
versions: [1]
priority: medium
status: specced
---

# Paddle

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paddle/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/paddle/ | Public docs only |
| https://developer.paddle.com/classic/api-reference/ | Public docs only |
| https://developer.paddle.com/classic/api-reference/api-authentication | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.paddle`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `paddleApi` (Vendor Auth Code + Vendor ID + sandbox toggle)

## Credentials — `paddleApi`

Authenticates against the Paddle Classic vendor API. Accepts three fields:

| name | type | required | notes |
|------|------|----------|-------|
| Vendor Auth Code | string | yes | Auth code generated in Paddle dashboard (Developer Tools > Authentication) |
| Vendor ID | string | yes | Numeric vendor ID displayed alongside the auth code |
| Use Sandbox Environment API | boolean | no | When enabled, requests target `https://sandbox-vendors.paddle.com/api/2.0/` instead of `https://vendors.paddle.com/api/2.0/` |

The credential applies HTTP basic auth using the Vendor ID as the username and the Vendor Auth Code as the password, or sends both as POST body fields `vendor_id` and `vendor_auth_code` per the Paddle Classic API v2.0 convention. The authorization is the same for all resources and operations — no scoped sub-credentials are needed.

## Resources / Operations

The node exposes five resources, each with one or more operations. Selection is via a two-level parameter: Resource (which group) then Operation (which action).

### Coupon

| Operation | Behavior |
|-----------|----------|
| Create | Creates a new coupon code in Paddle. Requires coupon parameters (discount type and value, coupon code, optional restrictions on product/plan, expiration, recurring vs one-time). |
| Get All | Lists all coupons on the vendor account. Supports optional pagination/filtering by coupon code prefix or status. |
| Update | Updates an existing coupon's properties (discount value, restrictions, expiration, status). |

### Payment

| Operation | Behavior |
|-----------|----------|
| Get All | Lists payments (transactions) received by the vendor. Supports optional date range and pagination. |
| Reschedule Payment | Changes the scheduled collection date for a specific payment by its ID. |

### Plan

| Operation | Behavior |
|-----------|----------|
| Get | Retrieves a single subscription plan by its Paddle plan ID. |
| Get All | Lists all subscription plans on the vendor account. |

### Product

| Operation | Behavior |
|-----------|----------|
| Get All | Lists all one-time products on the vendor account. |

### User

| Operation | Behavior |
|-----------|----------|
| Get All | Lists all users (customers) who have subscribed or purchased. Supports pagination. |

## Parameters

| name | type | required | notes |
|------|------|----------|-------|
| Resource | picklist | yes | One of: Coupon, Payment, Plan, Product, User |
| Operation | picklist | yes | Determined by the selected resource (see table above) |
| Coupon ID / Plan ID / Payment ID | string | depends | Required for single-item operations (Coupon update, Plan get, Payment reschedule) |
| Additional Fields | structured map | no | Per-operation extra parameters: coupon discount type/value, product/plan restrictions, date filters, pagination limit/page |

Detailed option lists (discount types, currency codes, coupon statuses, etc.) should be provided as static enums derived from the Paddle Classic API parameter definitions.

## Runtime behavior

### Input

Each input item is processed independently. For list operations (Get All) that accept optional filters, parameters are read from the item's JSON once (execute once semantics — all items share the same filter parameters). For single-item operations, the resource ID is typically drawn from a node parameter.

### Output

For each successfully processed input item, one output item is produced on `main[0]`. The output JSON contains the Paddle API response fields at the top level, typically under a `response` wrapper or flattened depending on the operation:

- **List operations:** outputs an array of records under a key such as `products`, `plans`, `coupons`, `users`, `payments`, plus a `total` count.
- **Single-item operations:** outputs the individual record (e.g. a single plan object for Plan → Get).
- **Payment reschedule:** outputs a success confirmation with updated payment details.

### Errors

- If the Paddle API returns an error (HTTP 4xx/5xx with `error` field in JSON body), the node throws a `NodeApiError` with the Paddle error message.
- If `continueOnFail` is enabled, the failing item is returned on the error output branch instead.
- Network errors (timeout, DNS failure) are surfaced as generic `NodeApiError` instances.
- Missing required IDs (e.g. Coupon ID for Update without a value) produce a validation error before any API call.

### Expressions

All parameter values accept n8n expression strings (`=...` syntax).

## Acceptance tests

### Test: Get all products (read-only query)

**Given** valid Paddle Classic credentials (vendor ID + auth code).

**Parameters:**
```json
{ "resource": "Product", "operation": "Get All" }
```

**Expect** output[0] to contain a `products` array. Each entry has at minimum an `id` and `name` field. No items are modified on the upstream service.

### Test: Get all plans (read-only query)

**Given** valid Paddle Classic credentials.

**Parameters:**
```json
{ "resource": "Plan", "operation": "Get All" }
```

**Expect** output[0] to contain a `plans` array. Each entry has an `id` and `name`. The total number of items matches the configured pagination.

### Test: Get a single plan by ID

**Given** valid credentials and a known plan ID.

**Parameters:**
```json
{ "resource": "Plan", "operation": "Get", "planId": "12345" }
```

**Expect** output[0] to contain a single plan object with an `id` matching the requested ID.

### Test: Create and later update a coupon (stateful round-trip)

**Given** valid credentials and a unique coupon code.

**Step 1 — Create:**
```json
{ "resource": "Coupon", "operation": "Create", "couponCode": "TEST-OF-10", "discountType": "percentage", "discountValue": 10, "couponType": "single" }
```

**Expect** output[0] coupon `id` to be returned. Record the ID.

**Step 2 — Update** (using the ID from step 1):
```json
{ "resource": "Coupon", "operation": "Update", "couponId": "<id>", "discountValue": 20 }
```

**Expect** output[0] to reflect the updated discount value of 20.

**Teardown:** The test should deactivate the coupon via the same Update operation or delete it if the API supports it.

### Test: List all users (paginated)

**Given** valid credentials.

**Parameters:**
```json
{ "resource": "User", "operation": "Get All" }
```

**Expect** output[0] to contain a `users` array. If the account has no users, the array may be empty but the response should still include a `total` field.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation names | Documented (n8n docs) | Confirmed from: Product → Get All, Plan → Get/Get All, Coupon → Create/Get All/Update, Payment → Get All/Reschedule, User → Get All |
| Credential shape | Documented (n8n credential docs) | Vendor Auth Code + Vendor ID + sandbox toggle documented at https://docs.n8n.io/integrations/builtin/credentials/paddle/ |
| API base URL | Inferred | Paddle Classic API v2.0 uses `vendors.paddle.com/api/2.0/`; sandbox variant is `sandbox-vendors.paddle.com/api/2.0/`. Confirmed from Paddle Classic auth docs. |
| Parameter detail for Coupon / Payment operations | Inferred | Exact field names, defaults, and option enums (discount types, coupon types, currency lists) are not enumerated in public n8n docs; they should be drawn from the Paddle Classic API reference. |
| Output shapes | Inferred | Examples not published in public docs; shape follows Paddle Classic API v2.0 JSON response envelope (`success`, `response`). |
| Error handling | Inferred | Follows standard n8n `NodeApiError` pattern for API errors and `continueOnFail` for graceful degradation. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Paddle.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
