---
type: n8n-nodes-base.whatsAppTrigger
displayName: WhatsApp Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# WhatsApp Trigger

Webhook-based trigger that starts a workflow when events occur on a WhatsApp Business account, using Meta's WhatsApp Cloud API webhook delivery. The node subscribes to one or more Cloud API webhook fields, validates each delivery (verification handshake + HMAC signature), and emits one workflow item per delivered event.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.whatsapptrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/whatsapp.md | Public docs only (credentials) |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp.md | Public docs only (related app node) |
| https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks | Public docs only (WhatsApp Cloud API) |
| https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ | Public docs only (Meta webhook handshake & signature) |

## Wire format

- **Type string:** `n8n-nodes-base.whatsAppTrigger`
- **Aliases:** (none)
- **Node version:** 1
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — `whatsAppTriggerApi` (OAuth2)

### Credential: `whatsAppTriggerApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| clientId | string | (empty) | yes | Meta App ID, used as the OAuth2 client ID |
| clientSecret | string (password) | (empty) | yes | Meta App Secret, used as the OAuth2 client secret and as the HMAC-SHA256 key for webhook signature validation |

OAuth2 obtains a Meta app access token via the `client_credentials` grant. Setting this up requires a Meta developer account, a Meta business portfolio, and a Meta business app with the WhatsApp product enabled. The WhatsApp app node uses a separate API-key credential (`whatsAppApi`); the trigger specifically uses the OAuth2 variant.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multi-select from event list | (see below) | yes | — | One or more WhatsApp Cloud API webhook fields to subscribe to; only subscribed events are emitted |
| options | collection | `{}` | no | — | Advanced settings, including the Verify Token that must match the value configured in the Meta App Dashboard |

### Event types

The selectable events mirror the Cloud API webhook fields the node subscribes to (public n8n docs enumerate ten):

- Account Review Update
- Account Update
- Business Capability Update
- Message Template Quality Update
- Message Template Status Update
- Messages
- Phone Number Name Update
- Phone Number Quality Update
- Security
- Template Category Update

Each maps to a Meta Cloud API webhook field (e.g. `messages`, `account_update`, `phone_number_name_update`, `security`); the trigger only emits events for the fields the user subscribes to.

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** the node registers the runtime's public HTTPS webhook URL with Meta for the WhatsApp Business Account (via the Graph API webhook subscriptions mechanism, object `whatsapp_business_account`). HTTPS is required; Meta rejects self-signed certificates.
2. **On deactivation:** the node removes the webhook registration for the account.
3. **Single webhook per app:** WhatsApp only allows one webhook URL registered per app. Switching between a testing URL and a production URL (e.g. testing a workflow that is also published) overwrites the earlier registration, so only one endpoint receives events at a time.

### Verification handshake (GET)

When the Callback URL or Verify Token is set in the Meta App Dashboard, Meta sends a `GET` request with query parameters `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. The node accepts the request only if `hub.mode` equals `subscribe` and `hub.verify_token` matches the configured Verify Token; it must then reply `HTTP 200` with the `hub.challenge` value as plain text. On a mismatch it replies with a non-200 status, and Meta keeps the endpoint unverified.

### Event delivery (POST)

Event notifications arrive as `HTTP POST` with `Content-Type: application/json` and an `X-Hub-Signature-256` header of the form `sha256=<hex>` — an HMAC-SHA256 of the **raw request body** keyed by the App Secret (credential `clientSecret`). The node validates the signature on every POST and rejects deliveries whose signature is missing or does not match.

The Cloud API payload is a `whatsapp_business_account` object containing an `entry` array; each entry carries a `changes` array where each change has a `field` (the subscribed webhook field) and a `value` (the event payload).

### Output

One output item is emitted per delivered event (per change present in the entry). Each item's `json` holds the event data as delivered by the Cloud API for that field:

- `messages` events carry the message payload (sender `wa_id`, message `id`, `type`, and type-specific content such as `text.body`, as well as contact profile data and phone-number metadata).
- Account, template, phone-number, capability, and security events carry their respective field payloads.

The executor does not rename or restructure the Cloud API fields; event data is passed through at the outcome level. Only changes whose `field` is present in the configured `events` list are emitted; others are silently dropped.

### Manual trigger

In manual (test) mode the node listens for a single delivered event, emits it, then completes. In active production mode it continues emitting indefinitely.

### Errors

- **Signature validation failure** (missing, malformed, or mismatched `X-Hub-Signature-256`): reject the request with a non-200 status and produce no output.
- **Verification handshake mismatch:** respond non-200; the endpoint is not considered verified.
- **Malformed/undeliverable payload:** reject without emitting output.
- **Webhook registration/de-registration failures** (Meta API errors, invalid credentials, non-HTTPS URL): surface the Meta API error; activation fails unless `continueOnFail` is set.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: messages event emitted

**Given** Meta delivers a validly signed POST whose body is:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "display_phone_number": "16505551111", "phone_number_id": "123456789" },
            "contacts": [{ "profile": { "name": "Ada" }, "wa_id": "15551234567" }],
            "messages": [{ "from": "15551234567", "id": "wamid.ABC123", "timestamp": "1700000000", "type": "text", "text": { "body": "hello" } }]
          }
        }
      ]
    }
  ]
}
```

with an `X-Hub-Signature-256` header computed from the raw body using the configured App Secret.

**Parameters:**
```json
{ "events": ["Messages"], "options": {} }
```

**Expect** output[0] contains exactly one item whose `json` preserves the delivered message event: `value.messages[0].text.body` is `"hello"`, `value.messages[0].from` is `"15551234567"`, and `value.metadata.phone_number_id` is `"123456789"`.

### Test: event filtering

**Parameters:**
```json
{ "events": ["Security"], "options": {} }
```

Deliver a validly signed POST whose only change has `field` = `"messages"`.

**Expect** zero output items.

### Test: signature validation rejects forged deliveries

Deliver a POST whose `X-Hub-Signature-256` header is missing or does not match the HMAC-SHA256 of the body keyed by the App Secret.

**Expect** the request is rejected with a non-200 status and zero items are emitted.

### Test: verification handshake

Send a `GET` with query parameters:

```
hub.mode=subscribe&hub.verify_token=<configured token>&hub.challenge=1158201444
```

**Expect** `HTTP 200` whose body is exactly `1158201444`.

Send the same `GET` with a `hub.verify_token` that does not match the configured value.

**Expect** a non-200 response and the challenge is not returned.

### Test: multiple events in one delivery

**Parameters:**
```json
{ "events": ["Messages"], "options": {} }
```

Deliver a validly signed POST whose `entry[0].changes` contains two changes, both with `field` = `"messages"` (two distinct inbound messages).

**Expect** two output items, one per change, each preserving its own message payload.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event list (10 events) | documented | Public docs page enumerates all selectable events |
| OAuth2 credential (Client ID / Client Secret) | documented | Public WhatsApp credentials page: OAuth2 used by the trigger node |
| Credential type name `whatsAppTriggerApi` | inferred | Interoperability fact from package descriptor; public docs only say "OAuth2" |
| Webhook verification handshake (hub.* params) | documented | Meta Graph API / Cloud API webhook docs specify GET handshake + challenge response |
| HMAC-SHA256 signature validation | documented | Meta webhook docs: `X-Hub-Signature-256` over raw body keyed by App Secret |
| Single webhook per app constraint | documented | Public n8n common-issues page |
| Registration/unregistration via Graph API on activate/deactivate | inferred | Public docs' wording ("register a single webhook per app", "overwrites the registered webhook URL") implies programmatic registration; exact mechanism not detailed |
| Output = one item per Cloud API event, pass-through of event payload | inferred | Not described in public n8n docs; outcome abstracted from the Cloud API webhook data contract |
| Event display name → Cloud API field mapping | inferred | Display names documented; exact wire field strings follow Meta's webhook field reference |
| Verify Token parameter location/shape | inferred | Handshake requirement documented by Meta; exact node parameter name not in public n8n docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/whatsapp-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Webhook trigger. The executor must implement the trigger lifecycle (activate = register the runtime's public HTTPS webhook URL with Meta for the WhatsApp Business Account, deactivate = unregister, manual = single-shot listen) and the two webhook handlers: the `GET` verification handshake (validate `hub.verify_token`, echo `hub.challenge`) and the `POST` event handler (validate `X-Hub-Signature-256` over the raw body using the App Secret, then emit one item per subscribed change). Reuses the `whatsAppTriggerApi` OAuth2 credential type (distinct from the `whatsAppApi` key used by the WhatsApp app node).
