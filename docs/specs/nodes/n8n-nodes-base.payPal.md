---
type: n8n-nodes-base.payPal
displayName: PayPal
category: Payments
versions: [1]
priority: medium
status: specced
---

# PayPal

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paypal/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/paypal | Public docs only |

The node is an action node, not a trigger. It requires a configured PayPal credential and communicates with the PayPal API. It does not define a special binary channel.

## Wire format
- **Type string:** `n8n-nodes-base.payPal`
- **Aliases:** none known
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** PayPal credential (type: `payPal` as defined in n8n credentials)

## Parameters
### Operation
| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | selection | `createBatchPayout` | yes | `operation=createBatchPayout` or `operation=showBatchPayoutDetails` or `operation=cancelPayoutItem` or `operation=showPayoutItemDetails` | The specific PayPal action to perform. |
| batchHeader | object | - | conditional | `operation=createBatchPayout` or `operation=showBatchPayoutDetails` | Contains `batch_status` and `payout_batch_id`. |
| senderBatchHeader | object | - | conditional | same as above | Optional sender batch identifier. |
| payoutItemId | string | - | conditional | `operation=cancelPayoutItem` or `operation=showPayoutItemDetails` | Identifier of the payout item to cancel or retrieve. |
| documentId | string | - | conditional | `operation=cancelPayoutItem` or `operation=showPayoutItemDetails` | Identifier of the payout item (if separate from batch). |
| operationOptions | collection | - | conditional | varies | Additional operation‑specific options (e.g., `useAppend`, `cellFormat`). |

*Notes:* Parameter names are abstracted; concrete field names are implementation details. The node uses the selected operation and any required identifiers to target the PayPal API endpoint.

## Runtime behavior
### Input
The node consumes items from `main[0]`. Input JSON may supply values for operation‑specific identifiers via expressions, but primary identifiers (e.g., batch ID, item ID) are resolved from the node configuration or expressions.

For operation‑based nodes, each input item typically triggers the selected PayPal action. If the operation requires a collection read (e.g., retrieving multiple payouts), the node may emit multiple output items.

### Output
Successful outcomes emit items on `main[0]`. The shape of the emitted item depends on the operation:

- **Create a batch payout:** emit a result containing the created batch identifier and status.
- **Show batch payout details:** emit the retrieved batch details.
- **Cancel an unclaimed payout item:** emit a result indicating success or failure of the cancellation.
- **Show payout item details:** emit the item details.

No binary output is required.

### Errors
- Missing credential, missing required identifier, or invalid parameter combination triggers validation failure before the API request.
- Authentication failures, permission errors, and other non‑success API responses result in an error item on the output stream that includes the service error message when available.
- With `continueOnFail=true`, a failing input produces an error item on the output branch rather than aborting unrelated inputs.

### Expressions
Operation‑specific identifiers and some optional parameters support n8n expressions (`{{ $json.field }}`). Expressions are resolved per input item before validation and the API request.

## Acceptance tests
### Test: Create a batch payout
Given input items:
```json
[ { "json": {} } ]
```
Parameters:
```json
{
  "operation": "createBatchPayout",
  "batchHeader": { "batch_status": "completed" }
}
```
Expect: exactly one successful item on `main[0]` containing the mocked batch creation response with a batch identifier.

### Test: Show batch payout details
Given input items:
```json
[ { "json": { "batchId": "batch-123" } } ]
```
Parameters:
```json
{
  "operation": "showBatchPayoutDetails",
  "batchHeader": { "payout_batch_id": "={{ $json.batchId }}" }
}
```
Expect: one output item containing the mocked batch details for batch `batch-123`.

### Test: Cancel an unclaimed payout item
Given input items:
```json
[ { "json": { "itemId": "item-456" } } ]
```
Parameters:
```json
{
  "operation": "cancelPayoutItem",
  "payoutItemId": "={{ $json.itemId }}"
}
```
Expect: one output item indicating successful cancellation of item `item-456`.

### Test: Show payout item details
Given input items:
```json
[ { "json": { "itemId": "item-789" } } ]
```
Parameters:
```json
{
  "operation": "showPayoutItemDetails",
  "payoutItemId": "={{ $json.itemId }}"
}
```
Expect: one output item with the mocked details of payout item `item-789`.

### Test: Invalid operation (missing identifier)
Given a configured credential but no `batchHeader` or `payoutItemId` for the selected operation.
Expect: validation fails with an error indicating the missing required identifier.

## Gaps / confidence
| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list and basic action semantics | documented | Directly listed on the PayPal node page. |
| Credential model | documented | References PayPal credential documentation. |
| Parameter names and exact payload schema | inferred | Specific field names (e.g., `batch_header`) come from internal descriptor metadata; the spec avoids copying those details. |
| Input‑output channel semantics | documented by descriptor metadata | Confirmed as `main` input and `main` output; descriptor used only for high‑level wire facts. |
| Error handling specifics (e.g., error codes, retry policy) | gap | Public docs do not specify retry or detailed error codes; spec outlines generic OpenFlow error contract. |
| Version differences (e.g., v1 vs v2 API) | inferred | The node package descriptor indicates a single available version; spec does not differentiate. |

Confidence is high for the node identity, credential requirement, operation list, and basic wire format. Confidence is limited for exact parameter nomenclature and detailed response schemas.

## OpenFlow mapping
- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.payPal.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only