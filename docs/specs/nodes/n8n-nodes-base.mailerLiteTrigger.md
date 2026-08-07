---
type: n8n-nodes-base.mailerLiteTrigger
displayName: MailerLite Trigger
category: Communication
versions: [1, 2]
priority: medium
status: specced
---

# MailerLite Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailerlitetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailerlite/ | Public docs only |
| https://developers.mailerlite.com/api/webhooks | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailerLiteTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0
- **Outputs:** `main` × 1
- **Credentials:** `mailerLiteApi`

The node exists as two versioned implementations (V1 and V2) that share the same type string. Version 1 targets the MailerLite Classic API (`https://api.mailerlite.com/api/v2/webhooks`); version 2 targets the modern MailerLite API (`https://connect.mailerlite.com/api/webhooks`). Version selection is automatic based on which account the credential authenticates to.

The credential accepts an API Key string plus a boolean `classic` toggle. When `classic` is `true`, requests target the Classic API endpoint; otherwise they target the modern API.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiSelect:options | — | yes | always | One or more MailerLite webhook event types to subscribe to |

The **events** parameter presents the user with a static list of event strings that correspond to MailerLite's webhook event types. The list differs slightly between V1 (Classic API) and V2 (modern API), but both map to the MailerLite event names.

Available events (V1 — Classic API):

- campaign.sent
- subscriber.added_to_group
- subscriber.automation_completed
- subscriber.automation_triggered
- subscriber.bounced
- subscriber.created
- subscriber.spam_reported (V1: subscriber.complained)
- subscriber.removed_from_group
- subscriber.unsubscribed
- subscriber.updated

Available events (V2 — modern API only, additional):

- subscriber.active
- campaign.open
- campaign.click
- subscriber.deleted

## Runtime behavior

### Activation (webhook registration)

On workflow activation, the node calls the MailerLite Webhooks API to create a new webhook. The webhook URL is constructed from the workflow's public-facing webhook callback URL. The request contains:

- `url`: the n8n-generated HTTPS callback URL
- `events`: the array of selected event type strings
- `name`: a human-readable label (auto-generated)

The node first checks whether a webhook with the same callback URL already exists (via GET /api/webhooks) to avoid duplicates. If one exists at the same URL with the same event set, creation is skipped.

On deactivation, the node deletes the webhook by ID (DELETE /api/webhooks/{id}) to clean up.

### Input

No input items are consumed (trigger nodes produce output, they do not receive input items).

### Output

Each incoming MailerLite webhook POST is emitted as one output item. The JSON body of the webhook payload becomes the item's `json` property. Payload shapes vary by event type:

- **Simple subscriber events** (created, updated, unsubscribed, bounced, spam_reported, active): Payload is a flat object with subscriber fields (`id`, `email`, `status`, `source`, `sent`, `opens_count`, `clicks_count`, `open_rate`, `click_rate`, `ip_address`, `subscribed_at`, `unsubscribed_at`, `created_at`, `updated_at`, `deleted_at`, `forget_at`, `fields` as object with `name`/`last_name`/`company`/`country`/`city`/`phone`/`state`/`zip`, `opted_in_at`, `optin_ip`) plus `event` string and `account_id`.

- **Group events** (added_to_group, removed_from_group): Payload has `type` string plus nested `subscriber` and `group` objects.

- **Automation events** (automation_triggered, automation_completed): Payload has `type` string plus nested `subscriber` and `automation` objects.

- **Campaign.sent**: Payload has `id`, `name`, `total_recipients`, `preview_url`, `date`, `event`, `account_id`.

- **Campaign.open / campaign.click**: Payload has `type` string, nested `subscriber` object, nested `campaign` object, and for click events also `link_url`.

- **Batchable events** (campaign.open, campaign.click, subscriber.deleted): Payload wrapped in `{ "events": [...], "total": N }`. Each event in the array is emitted as a separate output item.

### Errors

On API errors during webhook creation/deletion (authentication failure, network error, non-2xx response), the node throws a `NodeApiError` and workflow activation fails.

On incoming webhook delivery failures (non-2xx response, timeout > 3 seconds), MailerLite retries the webhook up to 3 additional times with increasing delay (10s, 100s, 1000s).

### Expressions

The **events** parameter accepts expression strings for dynamic event selection.

### Signature verification (optional)

The node may optionally verify the HMAC-SHA256 `Signature` header of incoming webhook payloads using the webhook's `secret` value returned at creation time. If verification is enabled and a signature mismatch is detected, the request should be rejected with a non-2xx response.

## Acceptance tests

### Test: V2 subscriber.created webhook

**Given** a MailerLite Trigger node configured with V2 (modern API) credentials and events `["subscriber.created"]`.

**When** a new subscriber is added in MailerLite, the MailerLite API sends a POST to the trigger's callback URL.

**Expect** output[0] to contain one item with:

```json
{
  "json": {
    "id": "100000000000000000",
    "email": "john.doe@example.com",
    "status": "active",
    "source": "ecommerce",
    "fields": {
      "name": "",
      "last_name": ""
    },
    "event": "subscriber.created",
    "account_id": 0
  }
}
```

### Test: V2 subscriber.added_to_group webhook

**Given** a MailerLite Trigger node with events `["subscriber.added_to_group"]`.

**When** a subscriber is assigned to a group in MailerLite.

**Expect** output[0] to contain one item with a `json.type` of `"subscriber.added_to_group"`, a nested `json.subscriber` object containing the subscriber's `id` and `email`, and a nested `json.group` object containing the group's `id` and `name`.

### Test: V2 campaign.sent webhook

**Given** a MailerLite Trigger node with events `["campaign.sent"]`.

**When** a campaign is sent in MailerLite.

**Expect** output[0] to contain one item with `json.event` equal to `"campaign.sent"`, `json.name` as a non-empty string, `json.total_recipients` as a positive integer, and `json.preview_url` as a valid URL string.

### Test: V2 batchable campaign.click webhook

**Given** a MailerLite Trigger node with events `["campaign.click"]` and the webhook's `batchable` flag set to `true`.

**When** a subscriber clicks a link in a campaign.

**Expect** output to contain one item per click event with a `json.type` of `"campaign.click"`, a nested `json.subscriber` object, a nested `json.campaign` object, and a `json.link_url` string.

### Test: V1 subscriber.bounced webhook

**Given** a MailerLite Trigger node configured with V1 Classic API credentials and events `["subscriber.bounced"]`.

**When** a subscriber email bounces.

**Expect** output[0] to contain one item with `json.event` equal to `"subscriber.bounced"` and subscriber fields including `id`, `email`, and `status`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event list (V1 vs V2) | publicly documented | Differs between Classic and modern API; V2 has additional `subscriber.active`, `campaign.open`, `campaign.click`, `subscriber.deleted` events |
| Webhook lifecycle (create/check/delete) | publicly documented | Matches MailerLite Webhooks API (POST/GET/DELETE /api/webhooks) |
| Payload shapes | publicly documented | Full per-event payload schemas published in MailerLite developer docs |
| Batched payload handling | publicly documented | Batchable events wrap in `{ events: [...], total: N }` |
| Signature verification | publicly documented | HMAC-SHA256 with webhook secret |
| Retry policy | publicly documented | 3 retries at 10s / 100s / 1000s intervals |
| Activation check for duplicate webhooks | inferred from n8n patterns | Common clean-room pattern for trigger nodes |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/mailerLiteTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
