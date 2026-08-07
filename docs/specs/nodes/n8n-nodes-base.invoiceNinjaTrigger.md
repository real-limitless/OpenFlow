---
type: n8n-nodes-base.invoiceNinjaTrigger
displayName: Invoice Ninja Trigger
category: Finance & Accounting
versions: [1, 2]
priority: medium
status: specced
---

# Invoice Ninja Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.invoiceninjatrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/invoiceninja/ | Public docs only |
| https://invoice-ninja.readthedocs.io/en/latest/api.html | External API (v4) |
| https://api-docs.invoicing.co/ | External API (v5) |

## Wire format

- **Type string:** `n8n-nodes-base.invoiceNinjaTrigger`
- **Aliases:** (none)
- **Inputs:** (none) — trigger node, no incoming main connection
- **Outputs:** `main` × 1
- **Credentials:** `invoiceNinjaApi` (API-key auth: URL + API Token + optional Secret for v5)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| apiVersion | string (`v4` / `v5`) | — | no | — | Selects the Invoice Ninja API version the target instance is running |
| event | string | — | yes | — | The webhook event to subscribe to. One of: `create_client`, `create_invoice`, `create_payment`, `create_quote`, `create_vendor`. Also accepts expression strings. |

## Runtime behavior

### Activation / deactivation

On workflow activation, the trigger node registers a webhook with the Invoice Ninja instance using the configured credentials. The node creates a new webhook subscription targeting the public workflow webhook URL. On deactivation, the corresponding webhook subscription is deleted from the Invoice Ninja instance. Before creating, the node checks whether a webhook for this workflow already exists to avoid duplicates.

### Input

This is a webhook-based trigger node. It accepts no incoming main connections. The node listens for HTTP POST requests from the Invoice Ninja instance at the n8n-generated webhook URL.

### Output

Each incoming webhook payload from the Invoice Ninja instance is emitted as a single output item. The output JSON structure matches the event body sent by the Invoice Ninja webhook system, which typically includes the entity data under a `data` key and event metadata. The exact shape depends on the Invoice Ninja API version (v4 vs v5) and the event type.

Items are emitted as they arrive, in real time.

### Errors

- If webhook registration fails at activation, the node throws and the workflow fails to activate.
- If an incoming webhook payload is malformed or unparseable, the item is discarded with a logged warning.
- If `continueOnFail` is enabled, malformed payloads produce an empty error output item instead of halting.

### Expressions

The `apiVersion` and `event` parameters accept expression strings.

## Acceptance tests

### Test: subscribe to create_invoice event

**Given** no input items.

**Parameters:**
```json
{
  "apiVersion": "v5",
  "event": "create_invoice"
}
```

**Expect** that on activation, the node registers a webhook with the Invoice Ninja instance. When the Invoice Ninja instance sends a `create_invoice` webhook POST to the node's webhook URL, the output emits one item per webhook call, containing the invoice payload.

### Test: subscribe to create_client event

**Given** no input items.

**Parameters:**
```json
{
  "apiVersion": "v4",
  "event": "create_client"
}
```

**Expect** that on activation, a webhook is registered for client creation events. An incoming `create_client` webhook from Invoice Ninja produces one output item with the client data.

### Test: expression-driven event selection

**Given** no input items.

**Parameters:**
```json
{
  "apiVersion": "v5",
  "event": "={{ $json.eventType }}"
}
```

**Expect** the node to accept an expression string for the `event` parameter and subscribe to the event value resolved at activation time.

### Test: deactivation cleans up webhook

**Given** the workflow is active with an Invoice Ninja Trigger subscribed to `create_payment`.

**When** the workflow is deactivated, the node deletes the previously registered webhook subscription from the Invoice Ninja instance. Re-activating the same workflow creates a fresh webhook subscription.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | inferred from corpus | 5 event values confirmed via Zod schemas (v1 and v2): create_client, create_invoice, create_payment, create_quote, create_vendor |
| Webhook lifecycle | inferred from type declarations | Type signatures show checkExists/create/delete webhook methods on IHookFunctions |
| API version parameter | inferred from corpus | Both schema versions define apiVersion with v4/v5 literals |
| Credential schema | documented | URL + API Token + optional Secret (v5) — same as Invoice Ninja app node |
| Output payload shape | inferred | No public doc describes the envelope; implementors should forward webhook POST body as-is |
| Deactivation behavior | inferred | Standard n8n trigger pattern — webhook delete on deactivation, checkExists before create |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/invoiceNinjaTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
