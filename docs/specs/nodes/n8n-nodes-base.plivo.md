---
type: n8n-nodes-base.plivo
displayName: Plivo
category: Communication
versions: [1]
priority: medium
status: specced
---

# Plivo

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.plivo.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/plivo.md | Public docs only |
| https://www.plivo.com/docs/voice/api/overview/ | Public docs only |
| https://www.plivo.com/docs/voice/api/calls | Public docs only |
| https://www.plivo.com/docs/messaging/api/messages | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.plivo`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `plivoApi` (required) — Basic auth with Auth ID (username) + Auth Token (password)

## Parameters

### Resource selection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `sms` | yes | — | One of: `call`, `mms`, `sms` |

### Call · Make a voice call (`resource: call`, `operation: make`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `make` | yes | Fixed to `make` |
| from | string | — | yes | Caller ID in E.164 format |
| to | string | — | yes | Destination phone number |
| answer_url | string | — | yes | URL returning Plivo XML to execute when call is answered |
| answer_method | options | `POST` | yes | HTTP verb: `GET` or `POST` |

Maps to `POST /v1/Account/{auth_id}/Call/` with body `{ from, to, answer_url, answer_method }`.

### SMS · Send an SMS (`resource: sms`, `operation: send`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `send` | yes | Fixed to `send` |
| from | string | — | yes | Plivo phone number (sender ID) |
| to | string | — | yes | Recipient phone number |
| message | string | — | yes | SMS text content |

Maps to `POST /v1/Account/{auth_id}/Message/` with body `{ src, dst, text }`.

### MMS · Send an MMS (`resource: mms`, `operation: send`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `send` | yes | Fixed to `send` |
| from | string | — | yes | Plivo phone number (sender ID) |
| to | string | — | yes | Recipient phone number |
| message | string | — | no | Text body (optional for MMS) |
| media_urls | string | — | no | Comma-separated media attachment URLs |

Maps to `POST /v1/Account/{auth_id}/Message/` with body `{ src, dst, text, type: 'mms', media_urls }`.

## Runtime behavior

### Input

Each input item is processed independently. For every item, the executor reads the resource-specific parameters from that item's context. In case of API error, `NodeApiError` is thrown (respects `continueOnFail`).

### Output

Each successful API call produces one output item. The raw Plivo API response envelope is returned — for SMS/MMS this is `{ api_id, message, message_uuid[] }`; for Call this is `{ api_id, message, request_uuid }`.

### Errors

HTTP errors from the Plivo API (4xx/5xx) are wrapped in `NodeApiError`. Standard n8n `continueOnFail` handling applies.

### Expressions

All string parameters (from, to, message, answer_url, media_urls, answer_method) accept expression strings.

## Acceptance tests

### Test: SMS send

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "+14156667777",
  "to": "+14156667778",
  "message": "Hello from Plivo"
}
```

**Expect** executor to call `POST /v1/Account/{auth_id}/Message/` with body `{ src: "+14156667777", dst: "+14156667778", text: "Hello from Plivo" }`. Output contains the Plivo API response.

### Test: MMS send with media

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "mms",
  "operation": "send",
  "from": "+14156667777",
  "to": "+14156667778",
  "message": "Check this out",
  "media_urls": "https://example.com/image.png"
}
```

**Expect** executor to call `POST /v1/Account/{auth_id}/Message/` with body `{ src: "+14156667777", dst: "+14156667778", text: "Check this out", type: "mms", media_urls: "https://example.com/image.png" }`.

### Test: Call make

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "call",
  "operation": "make",
  "from": "+14156667777",
  "to": "+14156667778",
  "answer_url": "https://example.com/answer.xml",
  "answer_method": "GET"
}
```

**Expect** executor to call `POST /v1/Account/{auth_id}/Call/` with body `{ from: "+14156667777", to: "+14156667778", answer_url: "https://example.com/answer.xml", answer_method: "GET" }`. Output contains the Plivo API response with `message: "call fired"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| SMS and MMS operation parameters | Documented — both in n8n public docs and Plivo public API docs | Full confidence |
| Call operation parameters | Documented — n8n public docs and Plivo Voice API docs | Full confidence |
| Credential format | Documented — n8n credentials page | Full confidence |
| Plivo API response shapes | Public Plivo API docs | Not spec-constrained; acceptance tests check URL/method/body, not exact response envelope |
| Advanced options (machine detection, SIP headers, callbacks, DLT tags) | Not exposed in n8n node | Deliberately not included — node only exposes the core parameters |
| Plivo API rate limits | Plivo docs: 300 req/5s | Not modeled in node; handled by Plivo API (returns 429) |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/Plivo.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
