---
type: n8n-nodes-base.customerIoTool
displayName: Customer.io Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Customer.io Tool

An AI agent tool variant of the Customer.io app node, wrapping the Customer.io Track API and App API for use by AI agents. When connected to an AI Agent root node, the model can dynamically populate parameters via `$fromAI()` or the "let model fill" toggle. Supports Customer, Event, Campaign, and Segment resources.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.customerio/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/customerio/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://customer.io/docs/api/track/ | External API docs |
| https://customer.io/docs/api/app/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.customerIoTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `customerIoApi` — API key-based credential requiring both a Tracking API Key (with Tracking Site ID) and an App API Key. Region selection (Global or EU) adjusts the API subdomain (`track`/`track-eu` and `api`/`api-eu`).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `customer` | yes | — | One of: `customer`, `event`, `campaign`, `segment` |
| operation | options | — | yes | — | Varies by resource (see runtime behavior) |

### Resource-specific parameters

The following fields appear conditionally based on the selected resource and operation. All accept expression strings and `$fromAI()`.

**Customer (Create/Update):**
- `id` (string) — customer identifier (required)
- `email` (string) — email address
- `customerAttributes` (object / collection) — custom attributes as key-value pairs

**Customer (Delete):**
- `id` (string) — customer identifier (required)

**Event (Track Customer Event):**
- `customerId` (string) — identifier of the customer on whom to record the event (required)
- `eventName` (string) — name of the event (required)
- `eventAttributes` (object / collection) — key-value pairs describing event properties

**Event (Track Anonymous Event):**
- `eventName` (string) — name of the event (required)
- `eventAttributes` (object / collection) — key-value pairs describing event properties
- `anonymousId` (string) — identifier for the anonymous actor (required)

**Campaign (Get / Get All):**
- `campaignId` (string) — campaign identifier (required for Get, optional for Get All)

**Campaign (Get Metrics):**
- `campaignId` (string) — campaign identifier (required)
- `metricField` (options) — specific metric type if supported

**Segment (Add / Remove Customer):**
- `segmentId` (string) — segment identifier (required)
- `customerId` (string) — customer identifier (required)

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be static, expression-based, or dynamically supplied by the AI model.

### Output

One output item per input item. Each result contains the API response data:

- **Customer / Event / Segment operations:** Typically returns the API response object (e.g., `{ id, ... }` or action confirmation).
- **Campaign Get / Get All / Get Metrics:** Returns the campaign object(s) or metric payload from the Customer.io App API.

For `$fromAI()` tool mode, the response is automatically optimized for agent consumption — only the essential result data is forwarded.

### Errors

API errors (authentication failure, missing required fields, rate limiting, 4xx/5xx) propagate as node-level errors. The standard `continueOnFail` toggle controls whether failed items halt execution or pass through.

### Expressions

All parameter fields support expression strings. The AI agent can populate parameters through `$fromAI()` dynamic resolution.

## Acceptance tests

### Test: Create/Update customer

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "customer",
  "operation": "upsert",
  "id": "{{ $json.customerId }}",
  "email": "user@example.com",
  "customerAttributes": {
    "plan": "premium",
    "signupDate": "2026-01-15"
  }
}
```

**Expect** output[0] to contain a JSON object with the created/updated customer ID and a status indicating success.

### Test: Track a customer event

**Given** input items:

```json
[{ "json": { "customerId": "123", "event": "purchase_completed" } }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "track",
  "customerId": "{{ $json.customerId }}",
  "eventName": "{{ $json.event }}",
  "eventAttributes": {
    "value": 49.99,
    "currency": "USD"
  }
}
```

**Expect** output[0] to contain a success confirmation from the Track API.

### Test: Get campaign metrics

**Given** input items:

```json
[{ "json": { "campaignId": "1" } }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getMetrics",
  "campaignId": "{{ $json.campaignId }}"
}
```

**Expect** output[0] to contain a JSON object with campaign metrics fields (sent, delivered, opened, clicked, bounced, etc.).

### Test: Add customer to segment

**Given** input items:

```json
[{ "json": { "customerId": "123", "segmentId": "seg_456" } }]
```

**Parameters:**

```json
{
  "resource": "segment",
  "operation": "add",
  "segmentId": "{{ $json.segmentId }}",
  "customerId": "{{ $json.customerId }}"
}
```

**Expect** output[0] to contain a success confirmation object.

### Test: $fromAI() tool invocation

**Given** an AI agent with a connected Customer.io Tool, and the model decides to look up a campaign:

```json
[{ "json": { "campaignId": "camp_789" } }]
```

**Parameters (model-supplied via $fromAI()):**

```json
{
  "resource": "campaign",
  "operation": "get",
  "campaignId": "{{ $json.campaignId }}"
}
```

**Expect** output[0] to contain the campaign object data. The response should be representative of the Customer.io App API campaign payload shape.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant existence | Inferred from n8n Tool naming convention | No separate `customerIoTool` docs page exists — the tool variant reuses the base `customerIo` node's operations with `$fromAI()` support. The type string `n8n-nodes-base.customerIoTool` is confirmed by the n8n node-type listing. |
| Exact parameter names | Inferred from public docs operation descriptions | The public docs page lists high-level operations (Create/Update, Delete, Track, Get All, etc.) but does not enumerate every parameter name. Specific identifiers within those operations are documented by the Customer.io Track API and App API. |
| Campaign Get Metrics detail | Inferred | Campaign metrics fields are determined by the Customer.io App API response shape. |
| `$fromAI()` behavior | Public docs | Refer to the AI parameter population documentation linked in sources. |
| Credential shape | Public docs | Customer.io credentials require both a Tracking API Key + Site ID and an App API Key, with optional region selection. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/CustomerIoTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
