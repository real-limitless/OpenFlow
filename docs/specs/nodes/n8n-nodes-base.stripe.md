---
type: n8n-nodes-base.stripe
displayName: Stripe
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Stripe

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.stripe.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/stripe/ | Public docs only |
| https://docs.stripe.com/api | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.stripe`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `stripeApi` (Secret key + optional Signature Secret for webhook verification)

## Parameters

The node uses a **resource** (the Stripe API entity) and **operation** (the action to perform) selector pattern. All API credentials are sourced from the attached Stripe credential.

| Resource | Operation | Required inputs (abstracted) |
|----------|-----------|------------------------------|
| Balance | Get | None |
| Charge | Create | Amount (integer, in smallest currency unit), Currency (3-letter code), Source (token or source ID) |
| Charge | Get | Charge ID |
| Charge | Get All | Optional pagination params (limit, starting_after/ending_before, created date range) |
| Charge | Update | Charge ID + fields to modify |
| Coupon | Create | Duration (forever/once/repeating), optional Percent off or Amount off |
| Coupon | Get All | Optional pagination params |
| Customer | Create | Optional email, description, name, phone, payment_method, metadata |
| Customer | Delete | Customer ID |
| Customer | Get | Customer ID |
| Customer | Get All | Optional pagination params, email filter |
| Customer | Update | Customer ID + fields to modify |
| Customer Card | Add | Customer ID, Source (token or card source ID), optional metadata |
| Customer Card | Get | Customer ID, Card ID |
| Customer Card | Remove | Customer ID, Card ID |
| Meter Event | Create | Event name (string), Value (integer), optional Timestamp (Unix epoch) |
| Source | Create | Type (ach_debit, alipay, bancontact, card, ideal, sepa_debit, sofort, wechat), optional Amount, Currency, metadata, owner |
| Source | Delete | Source ID |
| Source | Get | Source ID |
| Token | Create | Type (card or bank_account), object details per type |

The node also provides dynamic dropdown loaders for customer selection and currency codes.

## Runtime behavior

### Input

Each incoming item is processed independently. The node constructs a Stripe REST API request from the selected resource/operation and configured parameters.

### Output

Each output item contains the full Stripe API response for the executed operation as the `json` property. For list operations (Get All), the response is a Stripe list object with a `data` array of result objects.

### Errors

HTTP errors from the Stripe API surface as thrown errors in the workflow. The executor should respect `continueOnFail` to allow downstream nodes to handle failures gracefully. API 4xx/5xx responses should be reported with the Stripe error message and type.

### Expressions

All text, number, and string parameters accept expression strings (`{{ }}`). Operation and resource selectors may also be dynamic.

## Acceptance tests

### Test: get balance

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "balance", "operation": "get" }
```

**Expect** output[0] is a single item whose `json` contains `object: "balance"` and `available` is an array of `{ amount, currency }` objects.

### Test: create charge

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "charge",
  "operation": "create",
  "amount": 2000,
  "currency": "usd",
  "source": "tok_visa"
}
```

**Expect** output[0] contains `json.id` starting with `ch_` and `json.object` equals `"charge"`.

### Test: get customer by id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "customer",
  "operation": "get",
  "customerId": "cus_xxxxxxxxxxxxx"
}
```

**Expect** output[0] contains `json.id` matching the input and `json.object` equals `"customer"`.

### Test: create meter event

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "meterEvent",
  "operation": "create",
  "eventName": "api_requests",
  "value": 1
}
```

**Expect** output[0] contains `json.object` equals `"meter_event"` and `json.event_name` equals `"api_requests"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Documented (public docs) | Public n8n docs enumerate all resource/operation pairs |
| Parameter shapes | Inferred from Stripe API schema | Individual parameter names (e.g. `amount`, `currency`, `customerId`) follow Stripe REST API conventions |
| Response schemas | Inferred from Stripe API schema | Output shapes are Stripe API response objects; spec describes at outcome level |
| Pagination | Inferred | Get All operations use Stripe cursor-based pagination; exact parameter names abstracted |
| Error detail level | Inferred | Stripe returns typed errors; node surfaces them as workflow errors |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.stripe.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only