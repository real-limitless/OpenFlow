---
type: n8n-nodes-base.dhlTool
displayName: DHL Tool
category: Integration
versions: [1]
priority: low
status: specced
---

# DHL Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dhl/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/dhl/ | Public docs only |
| https://developer.dhl.com/ (Shipment Tracking - Unified API) | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dhlTool`
- **Aliases:** `Shipping` (display alias)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `dhlApi` — API-key credential (single field: API Key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | hidden | `"shipment"` | yes | — | Always `shipment`; only resource defined |
| operation | options | `"get"` | yes | resource = `shipment` | Only operation: `get` (Get Tracking Details) |
| trackingNumber | string | `""` | yes | resource = `shipment`, operation = `get` | The DHL tracking number to look up; can be populated by `$fromAI()` when used as a tool |
| options.recipientPostalCode | string | `""` | no | resource = `shipment`, operation = `get` | Recipient's postal code; when supplied DHL returns more detailed shipment information |

All parameters support expression values.

## Runtime behavior

### Input

Consumes items from the `main` input. Each item is processed independently through a loop; all items share the same `resource` and `operation` parameters. The `trackingNumber` and `options` values are resolved per-item from the node parameters (expressions evaluated per item index).

When configured as an AI agent tool, `$fromAI()` supplies `trackingNumber` dynamically from the model's generated arguments. The executor treats `$fromAI()` as a normal expression resolution.

### Output

Emits one output item per shipment found in the API response. The API returns a `shipments` array; each element of that array is spread into individual output items (i.e. the node flattens the array across items). The output shape is the raw DHL Shipment Tracking API response object for each shipment (status, estimated delivery, events, etc.).

When `continueOnFail` is enabled and an individual item throws, a single `{ error: error.description }` item is pushed to the output array and processing continues to the next input item.

### Errors

- If the DHL API returns a non-2xx status, a `NodeApiError` is thrown, stopping execution for the current item. With `continueOnFail` the error is caught and converted to an error output item.
- The credential test performs a GET against `/track/shipments?trackingNumber=123` and returns `OK` for any non-401 response; a 401 produces a specific error message.

### Expressions

`trackingNumber`, `recipientPostalCode` accept expression strings, including `$fromAI()`.

## Acceptance tests

### Test: AI-tool shipment tracking — single tracking number

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": "={{ $fromAI() }}"
}
```

**Expect** the executor resolves `$fromAI()` to the model-supplied tracking number, performs a GET to the DHL Shipment Tracking API, and emits one output item per shipment entry from the `shipments` array.

### Test: AI-tool shipment tracking — with postal code

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": "={{ $fromAI() }}",
  "options": { "recipientPostalCode": "={{ $fromAI() }}" }
}
```

**Expect** both `trackingNumber` and `recipientPostalCode` are populated by the AI model. The executor sends both query parameters to DHL. Output contains enriched shipment details.

### Test: static shipment tracking

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

### Test: missing tracking number (tool validation)

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

### Test: continueOnFail

**Given** input items:

```json
[
  { "json": { "trackingNumber": "invalid" } },
  { "json": { "trackingNumber": "1234567890" } }
]
```

**Parameters:**

```json
{
  "resource": "shipment",
  "operation": "get",
  "trackingNumber": "={{ $json.trackingNumber }}",
  "continueOnFail": true
}
```

**Expect** output[0] to contain two items: `{ error: ... }` for the invalid call and the valid shipment data for the successful call.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant existence | Confirmed from corpus | `dhlTool` is the AI agent tool variant of the base `dhl` node |
| Dedicated docs page | Not found | `docs.n8n.io` returns 404 for the tool variant URL; shares base node docs |
| Parameters | Inferred from base node | Identical to `n8n-nodes-base.dhl`; only difference is `usableAsTool: true` |
| `$fromAI()` support | Confirmed | Tool variants support `$fromAI()` for dynamic model population |
| Credential type | Documented | API-key only (DHL API) |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.dhl.ts` (shared executor with base DHL node)
- **SDK:** `defineNode` + native `ExecutionContext` only
