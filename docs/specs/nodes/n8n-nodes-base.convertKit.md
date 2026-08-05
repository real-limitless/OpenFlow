---
type: n8n-nodes-base.convertKit
displayName: ConvertKit
category: Marketing
versions: [1]
priority: medium
status: implemented
---

# ConvertKit

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.convertkit.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/convertkit.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.convertkittrigger.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.convertKit`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `convertKitApi` (API Secret / API Key)

Also provides `n8n-nodes-base.convertKitTrigger` for webhook-based event triggering.

## Parameters

| Resource | Operation | Key parameters | Notes |
|----------|-----------|----------------|-------|
| Custom Field | Create | field label (required) | POST to custom fields endpoint |
| Custom Field | Delete | field ID (required) | DELETE by custom field ID |
| Custom Field | Get All | (none) | List all custom fields |
| Custom Field | Update | field ID (required), updated label | PATCH by field ID |
| Form | Add Subscriber | form ID (required), email (required), optional tags | Subscribe an email to a ConvertKit form |
| Form | Get All | (none) | List all forms |
| Form | List Subscriptions | form ID (required) | Subscriber data for a given form |
| Sequence | Add Subscriber | sequence ID (required), email (required), optional tags | Subscribe an email to a sequence |
| Sequence | Get All | (none) | List all sequences |
| Sequence | List Subscriptions | sequence ID (required) | Subscriber data for a given sequence |
| Tag | Create | tag name (required), optional email (subscriber count) | Create a new tag |
| Tag | Get All | (none) | List all tags |
| Tag Subscriber | Add | email (required), tag ID (required) | Tag a single subscriber |
| Tag Subscriber | List Subscriptions | tag ID (required) | Subscriber data for a given tag |
| Tag Subscriber | Remove | email (required), tag ID (required) | Remove a tag from a subscriber |

All operation-specific parameters accept expressions.

### Trigger parameters (convertKitTrigger)

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Event | dropdown | yes | One of: Form subscribe, Link click, Product purchase, Purchase created, Purchase complete, Sequence complete, Sequence subscribe, Subscriber activated, Subscriber unsubscribe, Tag add, Tag Remove |

The trigger registers a webhook on the ConvertKit API at activation and tears it down at deactivation.

## Runtime behavior

### Input (action node)

Each input item may supply parameters via expressions. The node performs the ConvertKit API call independently per item.

### Output (action node)

One output item per API call. The response body from ConvertKit is placed on the item's `json` property under a resource-specific key (e.g. `{ customField: { ... } }`, `{ subscriber: { ... } }`, `{ tag: { ... } }`, `{ forms: [...] }`).

### Output (trigger node)

One item per webhook event received. The entire ConvertKit webhook payload is placed on the item's `json` property. The trigger event type is added as the `event` field.

### Errors

When the ConvertKit API returns a non-2xx status, the node throws an error. If `continueOnFail` is enabled, the error is suppressed and the item does not appear on the output.

### Expressions

All resource, operation, and field parameters accept expressions.

## Acceptance tests

### Test: create tag

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "create",
  "name": "newsletter-2024"
}
```

**Expect** output[0] contains `json.tag` with name matching the input.

### Test: subscribe to form

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "form",
  "operation": "addSubscriber",
  "formId": "12345",
  "email": "={{ $json.email }}"
}
```

**Expect** output[0] contains `json.subscriber` with the subscribed email.

### Test: list tags (getAll)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "getAll"
}
```

**Expect** output[0] contains `json.tags` as an array of tag objects.

### Test: trigger receives form-subscribe event

**Given** a ConvertKit webhook delivering a form-subscribe payload.

**Parameters:**
```json
{
  "event": "form_subscribe"
}
```

**Expect** output[0] provides `json.event === "form_subscribe"` and `json.subscriber` with email and name.

### Test: remove tag from subscriber

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "tagSubscriber",
  "operation": "remove",
  "email": "={{ $json.email }}",
  "tagId": "1"
}
```

**Expect** output[0] contains a success response from the ConvertKit API.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact API request/response shapes | Public docs + ConvertKit API docs | ConvertKit API v3/v4 docs referenced from n8n public page; response shapes are standard REST |
| Trigger webhook payload structure | Public docs | ConvertKit webhook payloads include subscriber, form/sequence/tag, and event metadata |
| Credential fields | Public docs | API Secret required; obtained from ConvertKit account settings |
| Parameter names (formId, tagId, etc.) | Inferred | Higher-level abstraction used in this spec; actual parameter keys may differ |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/convertKit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
