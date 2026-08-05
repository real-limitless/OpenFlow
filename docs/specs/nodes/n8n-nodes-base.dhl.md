---
type: n8n-nodes-base.dhl
displayName: DHL
category: Integration
versions: [1]
priority: low
status: specced
---

# DHL

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dhl.html | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/dhl.html | Public docs only |
| https://developer.dhl.com/ (Shipment Tracking - Unified API) | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dhl`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `dhlApi` — API-key credential (single field: API Key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | hidden | `"shipment"` | yes | — | Always `shipment`; only resource defined |
| operation | options | `"get"` | yes | resource = `shipment` | Only operation: `get` (Get Tracking Details) |
| trackingNumber | string | `""` | yes | resource = `shipment`, operation = `get` | The DHL tracking number to look up |
| options.recipientPostalCode | string | `""` | no | resource = `shipment`, operation = `get` | Recipient's postal code; when supplied DHL returns more detailed shipment information |

All parameters support expression values.

## Runtime behavior

### Input

Consumes items from the `main` input. Each item is processed independently through a loop; all items share the same `resource` and `operation` parameters. The `trackingNumber` and `options` values are resolved per-item from the node parameters (expressions evaluated per item index).

### Output

Emits one output item per shipment found in the API response. The API returns a `shipments` array; each element of that array is spread into individual output items (i.e. the node flattens the array across items). The output shape is the raw DHL Shipment Tracking API response object for each shipment (status, estimated delivery, events, etc.).

When `continueOnFail` is enabled and an individual item throws, a single `{ error: error.description }` item is pushed to the output array and processing continues to the next input item.

### Errors

- If the DHL API returns a non-2xx status, a `NodeApiError` is thrown, stopping execution for the current item. With `continueOnFail` the error is caught and converted to an error output item.
- The credential test performs a GET against `/track/shipments?trackingNumber=123` and returns `OK` for any non-401 response; a 401 produces a specific error message.

### Expressions

`trackingNumber`, `recipientPostalCode` accept expression strings.

## Acceptance tests

### Test: get tracking details — single shipment

**Given** input items:

```json
[{ "json": { "trackingNumber": "1234567890" } }]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": "1234567890"
}
```

**Expect** output[0] to contain one item per shipment entry from the API `shipments` array, with the DHL shipment status object at the top level of `json`.

### Test: get tracking details — missing tracking number

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": ""
}
```

**Expect** the executor to throw a validation error because `trackingNumber` is required, unless `continueOnFail` is set, in which case output[0] contains an `{ error }` item.

### Test: get tracking details — with optional recipient postal code

**Given** input items:

```json
[{ "json": { "trackingNumber": "1234567890", "zip": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": "1234567890",
  "options": { "recipientPostalCode": "12345" }
}
```

**Expect** the query string sent to DHL includes both `trackingNumber=1234567890` and `recipientPostalCode=12345`. Output items reflect the enriched response.

### Test: AI-tool usage

**Given** the node is configured as an AI tool with `$fromAI()` supplying the `trackingNumber` parameter.

**Expect** the executor resolves the expression to the model-supplied value and proceeds identically to the basic get-tracking-details path.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Supported operations | Documented | Only `Shipment → Get Tracking Details` |
| Parameters | Documented + validated against published package | `trackingNumber` required, `recipientPostalCode` optional |
| Credential type | Documented | API-key only (DHL API, not OAuth2) |
| API base URL | Inferred from descriptor | `https://api-eu.dhl.com` — may vary by region |
| Response shape | Inferred | The node spreads the `shipments` array from the API response as individual output items |
| `usableAsTool` | Confirmed from descriptor | Works as AI agent tool with `$fromAI()` |
| Region-specific base URL | Inferred | The hardcoded `api-eu.dhl.com` may not cover non-EU regions |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.dhl.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
