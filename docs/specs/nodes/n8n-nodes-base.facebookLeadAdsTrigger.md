---
type: n8n-nodes-base.facebookLeadAdsTrigger
displayName: Facebook Lead Ads Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Facebook Lead Ads Trigger

Webhook-based trigger node that starts a workflow when a new lead submission arrives via Facebook Lead Ads. The node registers a webhook with the Facebook Graph API on activation, receives lead-event payloads from Meta, and emits one workflow item per new lead.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebookleadadstrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/facebookleadads.md | Public docs only (credentials) |
| https://developers.facebook.com/docs/marketing-api/guides/lead-ads/ | Public docs only (Facebook Lead Ads API) |

## Wire format

- **Type string:** `n8n-nodes-base.facebookLeadAdsTrigger`
- **Aliases:** (none)
- **Node version:** 1
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — `facebookLeadAdsOAuth2Api` (OAuth2)

### Credential: `facebookLeadAdsOAuth2Api`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| clientId | string | (empty) | yes | Meta App ID, used as the OAuth2 client ID |
| clientSecret | string (password) | (empty) | yes | Meta App Secret, used as the OAuth2 client secret |

The credential uses Meta OAuth2. Setting it up requires a Meta for Developers account, a Meta app with the Facebook Login for Business product, a publicly-accessible Privacy Policy URL, and the app must be toggled to **Live** mode. Refer to the Meta documentation for the full app-creation and review process.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none — fixed event) | — | — | — | — | This trigger subscribes only to the `New lead` event; no event selector is exposed |

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** the node registers the runtime's public HTTPS webhook URL with the Facebook Graph API for the connected Meta app's lead ads integration. Only one webhook URL can be registered per Meta app; registering a new URL overwrites any previous registration.
2. **On deactivation:** the node does not unregister the webhook (the single-webhook-per-app constraint makes cleanup non-trivial; Meta's endpoint persists the last registered URL).
3. **Testing vs. production:** Because a single Meta app supports only one webhook URL, switching between test and production environments overwrites the registered URL. To test without disrupting a published workflow, unpublish the production workflow first.

### Event delivery

Meta sends lead event notifications as `HTTP POST` requests to the registered webhook URL. The payload follows the Facebook Graph API lead-ads webhook format and includes lead data such as the lead's field values, the ad ID, the form ID, and timestamps.

The node does not filter or transform the payload beyond extracting the lead event. No signature verification is performed (unlike WhatsApp webhook triggers).

### Output

One output item is emitted per received lead event. The item's `json` contains the raw event payload as delivered by the Facebook Graph API for lead ads. The executor passes the lead data through without renaming or restructuring fields.

Typical output fields (delivered by the Facebook API) include:
- `leadgen_id` — the ID of the new lead
- `created_time` — timestamp of the lead submission
- `page_id` — the Facebook Page that owns the ad
- `form_id` — the ID of the Lead Ads form that was submitted
- `ad_id` — the ID of the ad that generated the lead
- `adgroup_id` — the ad set ID
- `field_data` — array of form-field question/answer pairs submitted by the user

### Manual trigger

In manual (test) mode, the node listens for a single delivered lead event, emits it, then completes. In active (production) mode, it continues emitting events indefinitely as they arrive.

### Errors

- **OAuth2 failure:** If the credential token is expired, missing, or lacks the required scopes, the webhook registration fails and the node reports a configuration error on activation.
- **Webhook registration failure:** If the webhook URL cannot be registered (network error, invalid token, invalid callback URL), activation fails with an error message.
- **Delivery failure:** If Meta cannot reach the callback URL (e.g., network interruption, invalid SSL), lead events are dropped. The node does not retry or buffer undelivered events.

### Expressions

Because the trigger has no user-configurable parameters beyond credentials, there are no expression fields on this node.

## Acceptance tests

### Test: basic lead event emission

**Given** the Facebook Graph API delivers a lead event:

```json
{
  "entry": [{
    "changes": [{
      "field": "leadgen",
      "value": {
        "leadgen_id": "123456789012345",
        "created_time": 1700000000,
        "page_id": "987654321098765",
        "form_id": "111111111111111",
        "ad_id": "222222222222222",
        "adgroup_id": "333333333333333",
        "field_data": [
          { "name": "full_name", "values": ["Jane Doe"] },
          { "name": "email", "values": ["jane@example.com"] },
          { "name": "phone", "values": ["+12223334444"] }
        ]
      }
    }]
  }]
}
```

**Parameters:** (none; fixed event type)

**Expect** output[0] to contain a single item whose `json` matches the delivered `value` object:

```json
{
  "leadgen_id": "123456789012345",
  "created_time": 1700000000,
  "page_id": "987654321098765",
  "form_id": "111111111111111",
  "ad_id": "222222222222222",
  "adgroup_id": "333333333333333",
  "field_data": [
    { "name": "full_name", "values": ["Jane Doe"] },
    { "name": "email", "values": ["jane@example.com"] },
    { "name": "phone", "values": ["+12223334444"] }
  ]
}
```

### Test: multiple leads in one payload

**Given** a payload with two changes in a single entry:

```json
{
  "entry": [{
    "changes": [
      { "field": "leadgen", "value": { "leadgen_id": "1", "field_data": [] } },
      { "field": "leadgen", "value": { "leadgen_id": "2", "field_data": [] } }
    ]
  }]
}
```

**Expect** output[0] to contain two items, one per change, with `leadgen_id` values `"1"` and `"2"` respectively.

### Test: non-leadgen events are dropped

**Given** a payload containing a non-leadgen change:

```json
{
  "entry": [{
    "changes": [
      { "field": "some_other_event", "value": {} }
    ]
  }]
}
```

**Expect** output[0] to be empty (no items emitted).

### Test: manual mode fires once

**Given** the workflow is executed in manual (test) mode and a lead event arrives.

**Expect** exactly one item to be emitted, after which execution completes.

### Test: activation requires valid OAuth2

**Given** invalid or expired OAuth2 credentials.

**Expect** activation to fail with an error indicating the credential or app access token is invalid.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook event structure | documented | The `leadgen` field and the `entry[]`/`changes[]` envelope are public Meta Graph API webhook behavior |
| Parameters for app/page selection | inferred | Public n8n docs show no event selector or page/app parameter — the node uses the connected Meta app/page associated with the OAuth2 credential |
| Field-level filtering | documented | Only the `leadgen` event is subscribed to; there is no event-type selector UI |
| Webhook signature validation | documented | Unlike WhatsApp, Meta Lead Ads do not require HMAC signature validation (no `X-Hub-Signature-256` documented for leadgen webhooks) |
| Single-webhook-per-app constraint | documented | Called out explicitly in public n8n docs common-issues section |
| Exact OAuth2 scopes required | inferred | The credential uses Facebook Login for Business; required scopes include `pages_manage_ads` and `leads_retrieval` per Facebook API docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/facebookLeadAdsTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
