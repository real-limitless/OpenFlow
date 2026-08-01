---
type: n8n-nodes-base.payPal
displayName: PayPal
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# PayPal

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paypal.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/paypal/ | Public docs only |
| https://developer.paypal.com/api/rest/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.payPal`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `payPalApi` (Client ID + Secret, OAuth2 client credentials grant, Environment selector: Live or Sandbox)

## Parameters

The node uses a **resource** (the PayPal API entity) and **operation** (the action to perform) selector pattern. The API base URL is `https://api-m.paypal.com` (live) or `https://api-m.sandbox.paypal.com` (sandbox). All requests require a Bearer access token obtained via `POST /v1/oauth2/token` using client credentials.

| Resource | Operation | API endpoint method | Required inputs (abstracted) |
|----------|-----------|---------------------|------------------------------|
| Payout | create | `POST /v1/payments/payouts` | `senderBatchHeader` object with `emailSubject`, `emailMessage`, and `senderBatchId`; array of `items` each containing `recipientType` (`EMAIL`/`PHONE`/`PAYPAL_ID`), `amount` (with `value` and `currency`), and `receiver` (email/phone/ID depending on type) |
| Payout | get | `GET /v1/payments/payouts/{payout_batch_id}` | `payoutBatchId` (string) |
| Payout Item | cancel | `POST /v1/payments/payouts-item/{payout_item_id}/cancel` | `payoutItemId` (string) |
| Payout Item | get | `GET /v1/payments/payouts-item/{payout_item_id}` | `payoutItemId` (string) |

## Runtime behavior

### Input

Each incoming item is processed independently. The node constructs a PayPal REST API request from the selected resource/operation and configured parameters. For create operations, payout recipient details are resolved from the input items or parameter expressions.

### Output

Each output item contains the full PayPal API response for the executed operation as the `json` property:

- **Payout / create:** Returns the created payout batch object with `batch_header` containing `payout_batch_id` and status fields.
- **Payout / get:** Returns the batch details including `batch_header`, `items`, and status information.
- **Payout Item / cancel:** Returns the cancelled payout item object.
- **Payout Item / get:** Returns the payout item details including recipient, amount, and transaction status.

No binary output is used.

### Errors

- Missing credential, missing required identifier, or invalid parameter combination triggers validation failure before the API request.
- PayPal API errors (4xx/5xx) surface as thrown errors. The executor must respect `continueOnFail` to allow downstream nodes to handle failures gracefully.
- Authentication failures (invalid/expired token) should trigger credential refresh or clear error reporting.

### Expressions

All text, number, and string parameters accept expression strings (`{{ }}`). Resource and operation selectors may also be dynamic.

## Acceptance tests

### Test: create batch payout

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "payout",
  "operation": "create",
  "senderBatchHeader": {
    "emailSubject": "You have a payout",
    "senderBatchId": "batch-001"
  },
  "items": [
    {
      "recipientType": "EMAIL",
      "receiver": "recipient@example.com",
      "amount": { "value": "10.00", "currency": "USD" }
    }
  ]
}
```

**Expect** output[0] contains `json.batch_header.payout_batch_id` as a non-empty string and `json.batch_header.batch_status` equal to `"PENDING"`.

### Test: show batch payout details

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "payout",
  "operation": "get",
  "payoutBatchId": "PDDRAU4NA3P7Q"
}
```

**Expect** output[0] contains `json.batch_header.payout_batch_id` matching the input and `json.batch_header.batch_status` is a recognized status string.

### Test: cancel unclaimed payout item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "payoutItem",
  "operation": "cancel",
  "payoutItemId": "8XDGEWKQ4RHFE"
}
```

**Expect** output[0] contains `json.payout_item_id` matching the input.

### Test: show payout item details

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "payoutItem",
  "operation": "get",
  "payoutItemId": "8XDGEWKQ4RHFE"
}
```

**Expect** output[0] contains `json.payout_item_id` matching the input and `json.payout_item` with recipient and amount details.

### Test: missing required identifier

**Given** a configured credential but no `payoutBatchId` for resource `payout` / operation `get`.

**Expect** validation fails with an error indicating the missing required identifier.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | Public n8n docs list both resources and operations |
| Credential model | Documented | PayPal credentials page details Client ID + Secret + Environment |
| PayPal API endpoints | Documented (third-party) | PayPal REST API docs define all payout endpoints |
| Request body shapes | Documented (third-party) | PayPal API docs define sender_batch_header, items, amount structure; exact parameter casing may differ at the n8n node level |
| Response schemas | Documented (third-party) | Full payout batch and item response shapes are in PayPal API docs |
| Parameter naming convention (snake_case vs camelCase) | Inferred | n8n node may map between conventions; spec uses abstracted naming |
| Expression support scope | Inferred | All text parameters assumed to support expressions per OpenFlow convention |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.payPal.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only