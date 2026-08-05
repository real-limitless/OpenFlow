---
type: n8n-nodes-base.mailchimpTrigger
displayName: Mailchimp Trigger
category: triggers
versions: [1]
priority: medium
status: specced
---

# Mailchimp Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailchimptrigger.md | Public docs only (stub page) |
| https://docs.n8n.io/integrations/builtin/credentials/mailchimp.md | Public docs only |
| https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/ | Public docs only |
| https://mailchimp.com/developer/marketing/api/list-webhooks/add-webhook/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailchimpTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node — no input)
- **Outputs:** `main` × 1
- **Credentials:** `mailchimpApi` (API key) or `mailchimpOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiSelect | -- | yes | — | One or more Mailchimp webhook event types to subscribe to; see Runtime behavior for the supported event set |
| listId | string | — | yes | — | The Mailchimp audience/list ID to install the webhook on; resolved via resource locator or expression |
| options.resolveEvents | boolean | false | no | — | When true, pool all events into a single output item per firing instead of one item per event |
| options.onlyFollowUp | boolean | false | no | — | When true, only emit events that occur after a given follow-up event |
| options.secret | string | — | no | — | Optional signing secret for HMAC-SHA256 webhook signature verification |

## Runtime behavior

### Activation / webhook registration

On activation the node uses the Mailchimp Marketing API (Lists > Webhooks > Add Webhook endpoint) to register a callback URL (the n8n/OpenFlow webhook receiver) on the chosen audience/list, firing only the selected event types. On deactivation it calls Delete Webhook to remove the registration.

### Events

Mailchimp list webhooks support the following event types, each of which fires an HTTP POST to the registered callback URL:

- **subscribe** — a new subscriber joins the audience
- **unsubscribe** — a subscriber leaves or is removed from the audience
- **cleaned** — an email address bounces or is cleaned from the audience
- **upemail** — a subscriber changes their email address
- **campaign** — a campaign is sent, completed, or otherwise changes status
- **profile** — a subscriber's profile data (merge fields) is updated

### Output

The webhook body is delivered as `application/x-www-form-urlencoded` and the node parses it into a structured JSON object per event. Each received webhook produces one item on output `main[0]` (unless `options.resolveEvents` aggregates multiple events).

The output shape follows the Mailchimp webhook payload contract:

```json
{
  "type": "subscribe",
  "fired_at": "2009-03-26 21:35:57",
  "data": {
    "id": "8a25ff1d98",
    "list_id": "a6b5da1054",
    "email": "api@mailchimp.com",
    "email_type": "html",
    "ip_opt": "10.20.10.30",
    "ip_signup": "10.20.10.30",
    "merges": {
      "EMAIL": "api@mailchimp.com",
      "FNAME": "Mailchimp",
      "LNAME": "API",
      "INTERESTS": "Group1,Group2"
    }
  }
}
```

The `data` sub-object is event-type-dependent. For `unsubscribe` events it also includes `action` (unsub/delete), `reason`, and `campaign_id`. For `upemail` it includes `old_email` and `new_email`.

### Signature verification

When `options.secret` is provided, the node verifies each incoming delivery's `X-Mailchimp-Signature` header using HMAC-SHA256 with the configured secret. The header format is `t={timestamp},v1={hex_signature}`. Deliveries whose signature does not match or whose timestamp is more than 300 seconds old are rejected with a 4xx response without producing output items.

### Errors

- Webhook registration failures (invalid API key, nonexistent list ID) raise a configuration error and prevent activation.
- Webhook delivery signature mismatch is silently rejected (no item produced, 400 returned).
- Network timeouts during webhook callback respond with a 5xx; Mailchimp retries up to 75 minutes with increasing intervals.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: subscribe event

**Given** webhook receives a subscribe payload:

```json
{
  "type": "subscribe",
  "fired_at": "2009-03-26 21:35:57",
  "data": {
    "id": "8a25ff1d98",
    "list_id": "a6b5da1054",
    "email": "test@example.com",
    "email_type": "html",
    "merges": { "EMAIL": "test@example.com", "FNAME": "Test", "LNAME": "User" }
  }
}
```

**Expect** output[0] contains one item with `json.type === "subscribe"` and `json.data.email === "test@example.com"`.

### Test: unsubscribe event

**Given** webhook receives an unsubscribe payload:

```json
{
  "type": "unsubscribe",
  "fired_at": "2009-03-26 21:40:57",
  "data": {
    "action": "unsub",
    "reason": "manual",
    "id": "8a25ff1d98",
    "list_id": "a6b5da1054",
    "email": "unsub@example.com",
    "campaign_id": "cb398d21d2",
    "merges": { "EMAIL": "unsub@example.com" }
  }
}
```

**Expect** output[0] contains one item with `json.type === "unsubscribe"` and `json.data.action === "unsub"`.

### Test: signature verification rejects tampered payload

**Given** `options.secret` set to `"test-secret"` and a delivery with a forged `X-Mailchimp-Signature` header.

**Expect** the node returns HTTP 400 and produces zero output items.

### Test: activation registers webhook on list

**Given** valid credentials and a valid `listId`.

**Expect** the node calls the Mailchimp Add Webhook API endpoint for that list before polling begins.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | Public Mailchimp webhook docs | The Mailchimp developer guide documents subscribe, unsubscribe, cleaned, upemail, campaign, and profile events |
| Payload shape | Public Mailchimp webhook docs | Sample payloads documented in the Sync Audience Data guide |
| HMAC verification | Public Mailchimp webhook docs | Detailed in the same guide with code samples |
| n8n trigger parameter names | Inferred from n8n public docs patterns + standard webhook trigger conventions | The n8n docs page is a stub; parameter names follow the same patterns as other n8n webhook triggers |
| OAuth2 vs API key auth | Public n8n credential docs | Both methods documented at n8n credentials/mailchimp.md |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mailchimpTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
