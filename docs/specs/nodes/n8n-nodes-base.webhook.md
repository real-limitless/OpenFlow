---
type: n8n-nodes-base.webhook
displayName: Webhook
category: Triggers
versions: [1, 2]
priority: high
status: specced
---

# Webhook

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only (respond mode partner) |

## Wire format

- **Type string:** `n8n-nodes-base.webhook`
- **Aliases:** (none)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** optional basic / header / JWT webhook auth (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| httpMethod | options | GET | yes | — | DELETE, GET, HEAD, PATCH, POST, PUT (**documented**) |
| path | string | random | yes | — | URL path; may include `:param` routes (**documented**) |
| authentication | options | none | no | — | none, basic, header, jwt (**documented**) |
| responseMode | options | | no | — | Immediately / When Last Node Finishes / Using Respond to Webhook / Streaming (**documented** as Respond) |
| responseCode | number | 200 | no | not respond-to-webhook mode | (**documented**) |
| responseData | options | | no | last node finishes | All Entries / First Entry JSON / First Entry Binary / No Response Body (**documented**) |
| options.allowedOrigins | string | `*` | no | — | CORS (**documented**) |
| options.binaryPropertyName | string | | no | POST/PATCH/PUT | Receive binary (**documented**) |
| options.ignoreBots | boolean | | no | — | (**documented**) |
| options.ipWhitelist | string | | no | — | comma-separated; else 403 (**documented**) |
| options.rawBody | boolean | | no | — | (**documented**) |
| options.responseHeaders | fixedCollection | | no | — | (**documented**) |
| options.noResponseBody | boolean | | no | immediately | (**documented**) |
| webhookId | string | | no | — | Stable id in exports (**inferred** from public workflow JSON) |

Max payload 16MB default on reference product; self-host configurable (**documented**).

## Runtime behavior

### Input

HTTP request starts workflow. Request body/query/headers/params become item JSON (**inferred** shape from public usage; docs describe receiving data).

### Output

One or more items representing the request payload on main 0.

### HTTP response

Depends on **Respond** mode:

- Immediately: code + message that workflow started (**documented**)
- Last node finishes: body from last node per Response Data (**documented**)
- Respond to Webhook node: deferred (**documented**)
- Streaming: real-time when supported nodes present (**documented**)

### Errors

Auth failure; IP not whitelisted → 403 (**documented**). Bot ignore drops request (**documented**).

### Expressions

Path/static config usually fixed; response custom data may use expressions (**inferred**).

## Acceptance tests

### Test: register path + method

**Parameters:**

```json
{
  "httpMethod": "POST",
  "path": "openflow-test",
  "responseMode": "onReceived",
  "responseCode": 200
}
```

**Expect:** active workflow accepts POST on that path; execution starts with body mapped into item json (**inferred** mapping details)

### Test: IP whitelist reject

**options.ipWhitelist** set; request from other IP

**Expect:** 403 (**documented**)

### Test: respond last node

**responseMode** whenLastNode; last node outputs `{ "ok": true }`

**Expect:** HTTP JSON body reflects configured Response Data mode (**documented**)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact item JSON keys (headers, query, body) | inferred | Docs describe capability not schema |
| responseMode wire enums | inferred | UI labels documented |
| Test vs production URL | documented | Product-specific hosting |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/webhook.ts` (+ server webhook routes)
- **SDK:** `defineNode` + native `ExecutionContext` only
