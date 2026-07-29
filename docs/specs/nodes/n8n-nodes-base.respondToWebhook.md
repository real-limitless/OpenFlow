---
type: n8n-nodes-base.respondToWebhook
displayName: Respond to Webhook
category: Actions
versions: [1.1]
priority: high
status: specced
---

# Respond to Webhook

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only |

## Parameters

| respondWith | firstIncomingItem / allIncomingItems / json / text / noData / redirect |
| responseBody | json or text |
| redirectURL | redirect |
| options.responseCode | HTTP status |

## Runtime behavior

Stores response on execution id for the webhook HTTP handler. Passes input items through on main output. Pair with Webhook `responseMode=responseNode`.

## Acceptance tests

### JSON body

respondWith=json, responseBody={"ok":true}, __executionId set → getWebhookResponse returns body.

### First item

Default respondWith uses first input json.

## OpenFlow mapping

- `src/lib/engine/executors/respond-to-webhook.ts`
