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
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only (respond-mode partner) |
| https://docs.n8n.io/integrations/builtin/credentials/webhook.md | Public docs only (auth credentials) |
| Public node descriptor metadata (categories, aliases) + public output schema descriptor | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.webhook`
- **Aliases:** `HTTP`, `API`, `Build`, `WH` (**documented** in public descriptor metadata)
- **Categories:** `Development`, `Core Nodes` (subcategory `Helpers`) (**documented** in descriptor metadata)
- **Inputs:** none (trigger node — starts a workflow)
- **Outputs:** `main` × 1
- **Credentials:** optional — Basic auth / Header auth / JWT auth webhook credentials, or `none` (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| httpMethod | options | GET | yes | — | `DELETE`, `GET`, `HEAD`, `PATCH`, `POST`, `PUT` (**documented**) |
| path | string | random | yes | — | URL path; may include `:param` route segments (**documented**) |
| authentication | options | none | no | — | `none`, `basic`, `header`, `jwt` (**documented**) |
| responseMode | options | immediately | no | — | Immediately / When Last Node Finishes / Using 'Respond to Webhook' Node / Streaming response (**documented** UI labels; wire enum strings inferred) |
| responseCode | number | 200 | no | any Respond mode **except** Using 'Respond to Webhook' Node | HTTP status returned on success (**documented**; default inferred) |
| responseData | options | allEntries | no | Respond > When Last Node Finishes | `All Entries` / `First Entry JSON` / `First Entry Binary` / `No Response Body` (**documented**) |
| options.allowedOrigins | string | `*` | no | any | CORS — comma-separated list of allowed origins (**documented**) |
| options.binaryPropertyName (Binary Property) | string | — | no | httpMethod ∈ {POST, PATCH, PUT} | Name of binary property to write received file data to (**documented**) |
| options.ignoreBots | boolean | false | no | any | Drop requests from bots/crawlers/link previewers (**documented**) |
| options.ipWhitelist | string | — | no | any | Comma-separated allowed IPs; non-whitelisted IP → 403 (**documented**) |
| options.rawBody | boolean | false | no | any | Receive body in raw form (e.g. JSON/XML) (**documented**) |
| options.noResponseBody | boolean | false | no | Respond > Immediately | Omit response body (**documented**) |
| options.responseCode | number | — | no | any except Using 'Respond to Webhook' Node | Override response code at option level (**documented** as option) |
| options.responseHeaders | fixedCollection | — | no | any | Extra headers in the webhook response (**documented**) |
| options.responseContentType | options | — | no | Respond > When Last Node Finishes AND responseData > First Entry JSON | Format for the webhook body (**documented**) |
| options.responseData | string | — | no | Respond > Immediately | Custom data sent with the response (distinct from the `responseData` parameter) (**documented**) |
| options.propertyName | string | — | no | Respond > When Last Node Finishes AND responseData > First Entry JSON | Return only the value of a specific JSON key (**documented**) |
| webhookId | string | — | no | — | Stable webhook id present in workflow exports (**inferred** from public workflow JSON) |

**Max payload:** 16 MB default; self-hosted instances configure via `N8N_PAYLOAD_SIZE_MAX` (**documented**).

**Path route formats (documented):** `/:variable`, `/path/:variable`, `/:variable/path`, `/:variable1/path/:variable2`, `/:variable1/:variable2`.

## Runtime behavior

### Trigger registration

The node exposes two webhook URLs — **test** and **production** — both shown at the top of the node panel (**documented**):

- **Test URL:** registered when the user selects **Listen for Test Event** (or executes the workflow while it is inactive). Incoming data is displayed in the editor.
- **Production URL:** registered when the workflow is published/active. Incoming data is not shown in the editor; runs are viewable under the workflow's **Executions** tab.

### Input

An inbound HTTP request starts the workflow. The request is mapped to a single output item whose `json` contains (**documented** capability; key set confirmed by public output schema descriptor):

```json
{
  "headers": { "content-type": "application/json", "..." : "..." },
  "params":  { "variable": "value" },
  "query":   { "x": "1" },
  "body":    { "name": "alice" },
  "webhookUrl": "https://host/webhook/<path>",
  "executionMode": "production"
}
```

- `headers` — request headers (object).
- `params` — route parameters extracted from `:variable` path segments (object).
- `query` — URL query-string parameters (object; values are strings).
- `body` — parsed request body (object for JSON; raw when `rawBody` is set).
- `webhookUrl` — full URL that received the request (string).
- `executionMode` — `test` or `production` (string).

When **Binary Property** is set (POST/PATCH/PUT), the received file is written to the named binary property on the item (**documented**).

### HTTP response

Determined by **Respond** (`responseMode`) (**documented**):

- **Immediately:** returns the response code and the message `Workflow got started`. `noResponseBody` may suppress the body.
- **When Last Node Finishes:** returns the response code and data from the last node executed, shaped by the `responseData` parameter (All Entries → array; First Entry JSON → object; First Entry Binary → binary file; No Response Body → no body). `propertyName` restricts First Entry JSON to a single key's value; `responseContentType` sets the body format.
- **Using 'Respond to Webhook' Node:** the response is deferred and fully defined by a downstream **Respond to Webhook** node.
- **Streaming response:** streams data back in real time as the workflow processes; requires streaming-capable nodes (e.g. AI Agent) in the workflow.

### Security

- **Auth failure** (basic/header/JWT) and **IP not on whitelist** → `403` (**documented**).
- **Ignore Bots** silently drops requests from bots/crawlers/link previewers (**documented**).
- **HTML response sandboxing:** from product version 1.103.0, HTML responses are automatically wrapped in sandboxed `<iframe>` tags. Consequences: top-level window/localStorage access fails; auth headers are unavailable inside the iframe; relative URLs do not work (use absolute URLs) (**documented**).

### Errors

Auth failure or non-whitelisted IP → `403`. Bot requests are dropped (no execution). Payload exceeding the max size is rejected. As a trigger, the node does not consume upstream items and does not surface `continueOnFail` semantics.

### Expressions

Path and static configuration are typically fixed at design time. The `options.responseData` (custom response data, Immediately mode) and response headers may use expressions (**inferred**).

## Acceptance tests

### Test: POST JSON body maps to item json

**Request:** `POST /webhook/orders?ref=abc` with body `{ "order": 7, "total": 12.5 }`

**Parameters:**

```json
{
  "httpMethod": "POST",
  "path": "orders",
  "responseMode": "immediately",
  "responseCode": 200
}
```

**Expect** output[0].json (shape; values reflect the request):

```json
{
  "headers": { "content-type": "application/json" },
  "params": {},
  "query": { "ref": "abc" },
  "body": { "order": 7, "total": 12.5 },
  "webhookUrl": "https://host/webhook/orders",
  "executionMode": "test"
}
```

### Test: route parameter extraction

**Request:** `GET /webhook/user/42/profile`

**Parameters:**

```json
{
  "httpMethod": "GET",
  "path": "user/:id/profile",
  "responseMode": "immediately"
}
```

**Expect** output[0].json.params:

```json
{ "id": "42" }
```

### Test: IP whitelist reject

**Parameters:** `options.ipWhitelist` = `10.0.0.5`

**Request:** from IP `198.51.100.7`

**Expect:** HTTP `403`; no workflow execution starts (**documented**).

### Test: respond immediately

**Parameters:**

```json
{
  "httpMethod": "POST",
  "path": "ping",
  "responseMode": "immediately",
  "responseCode": 200
}
```

**Expect** HTTP response: status `200`, body `Workflow got started` (**documented**).

### Test: respond when last node finishes — First Entry JSON

**Parameters:**

```json
{
  "httpMethod": "POST",
  "path": "api",
  "responseMode": "whenLastNode",
  "responseData": "firstEntryJson"
}
```

Last node outputs one item: `{ "json": { "ok": true, "count": 3 } }`.

**Expect** HTTP response body (JSON object):

```json
{ "ok": true, "count": 3 }
```

With `options.propertyName` = `count`, the body becomes `3` (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output item JSON key set | documented (descriptor) | `headers`, `params`, `query`, `body`, `webhookUrl`, `executionMode` confirmed by public output schema descriptor |
| responseMode wire enum strings | inferred | UI labels documented; exact wire strings (e.g. `onReceived`/`whenLastNode`) not in permitted sources — implementers should treat UI labels as canonical |
| responseData wire enum strings | inferred | UI labels documented; exact wire strings not in permitted sources |
| responseCode default (200) | inferred | Docs say "customize"; 200 is the conventional default |
| Version count ([1, 2]) | inferred | Descriptor `nodeVersion` 1.0; a v2.0.0 schema directory exists in public descriptor metadata |
| Test vs production URL | documented | Registration triggers and editor visibility differ by URL |
| HTML iframe sandboxing | documented | Product version 1.103.0+ |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/webhook.ts` (+ server webhook route registration)
- **SDK:** `defineNode` + native `ExecutionContext` only