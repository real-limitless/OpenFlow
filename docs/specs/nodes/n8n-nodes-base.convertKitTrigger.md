---
type: n8n-nodes-base.convertKitTrigger
displayName: ConvertKit Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# ConvertKit Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.convertkittrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/convertkit/ | Public docs only |
| https://developers.kit.com/v4 | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.convertKitTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger — no input items)
- **Outputs:** `main` × 1
- **Credentials:** `convertKitApi` — API Secret key (obtained from ConvertKit account Settings > Advanced)

## Parameters

| name | type | default | required | description |
|------|------|---------|----------|-------------|
| Event | dropdown | — | yes | The ConvertKit event to subscribe to |

The **Event** parameter selects which webhook event type the node listens for. Accepted values:

- Form subscribe
- Link click
- Product purchase
- Purchase created
- Purchase complete
- Sequence complete
- Sequence subscribe
- Subscriber activated
- Subscriber unsubscribe
- Tag add
- Tag Remove

All parameters accept expression strings.

## Runtime behavior

### Activation

On node activation, the trigger registers a webhook with the ConvertKit API for the chosen event. The ConvertKit API delivers POST callbacks to the workflow's webhook URL. On deactivation, the webhook is deregistered.

### Output

Each incoming webhook payload is emitted as one output item. The output item's `json` property contains the full ConvertKit webhook body. The payload shape varies by event type but includes:

- `event` (string) — the event type key (e.g. `form_subscribe`, `tag_add`)
- `subscriber` (object) — subscriber data (id, email, name, etc.)
- Event-specific objects — e.g. `form` (form data for form_subscribe), `tag` (tag data for tag_add), `link` (for link_click), `product` (for product_purchase), `purchase` (for purchase events), `sequence` (for sequence events)

### Errors

If the webhook registration or deregistration against the ConvertKit API fails, the node throws. During runtime, malformed or unparseable webhook bodies produce an error. If `continueOnFail` is enabled, these errors are suppressed and the item does not appear on the output.

### Expressions

The `Event` parameter accepts expression strings.

## Acceptance tests

### Test: form subscribe event received

**Given** a ConvertKit webhook POST with body:

```json
{
  "event": "form_subscribe",
  "subscriber": { "id": 1, "email": "a@b.com", "name": "Alice" },
  "form": { "id": 42, "name": "Newsletter" }
}
```

**Parameters:**
```json
{ "event": "form_subscribe" }
```

**Expect** output[0]:
```json
{
  "json": {
    "event": "form_subscribe",
    "subscriber": { "id": 1, "email": "a@b.com", "name": "Alice" },
    "form": { "id": 42, "name": "Newsletter" }
  }
}
```

### Test: tag add event

**Given** a ConvertKit webhook POST with body:

```json
{
  "event": "tag_add",
  "subscriber": { "id": 2, "email": "b@c.com", "name": "Bob" },
  "tag": { "id": 7, "name": "VIP" }
}
```

**Parameters:**
```json
{ "event": "tag_add" }
```

**Expect** output[0] contains `json.event === "tag_add"` and `json.tag.name === "VIP"`.

### Test: sequence complete event

**Given** a ConvertKit webhook POST with body:

```json
{
  "event": "sequence_complete",
  "subscriber": { "id": 3, "email": "c@d.com", "name": "Charlie" },
  "sequence": { "id": 5, "name": "Onboarding" }
}
```

**Parameters:**
```json
{ "event": "sequence_complete" }
```

**Expect** output[0] contains `json.event === "sequence_complete"` and `json.sequence.id === 5`.

### Test: subscriber unsubscribe event

**Given** a ConvertKit webhook POST with body:

```json
{
  "event": "subscriber_unsubscribe",
  "subscriber": { "id": 4, "email": "d@e.com", "name": "Diana" }
}
```

**Parameters:**
```json
{ "event": "subscriber_unsubscribe" }
```

**Expect** output[0] contains `json.event === "subscriber_unsubscribe"`.

### Test: purchase created event

**Given** a ConvertKit webhook POST with body:

```json
{
  "event": "purchase_created",
  "subscriber": { "id": 5, "email": "e@f.com", "name": "Eve" },
  "purchase": { "id": 99, "amount": 2999, "currency": "USD" }
}
```

**Parameters:**
```json
{ "event": "purchase_created" }
```

**Expect** output[0] contains `json.event === "purchase_created"` and `json.purchase.amount === 2999`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | Public docs | All 11 events listed in n8n public documentation |
| Credential fields | Public docs | API Secret only; ConvertKit docs confirm |
| Webhook payload shape | Inferred | Shape derived from ConvertKit API v3/v4 webhook conventions; exact field names may vary slightly |
| Activation/deactivation lifecycle | Public docs | Described as standard webhook registration pattern |
| Webhook URL management | Inferred | n8n manages public endpoint and registration; no user-facing parameter |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/convertKitTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
