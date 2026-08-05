---
type: n8n-nodes-base.bitlyTool
displayName: Bitly Tool
category: Utility
versions: [1]
priority: medium
status: specced
---

# Bitly Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitly.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bitly.md | Public docs only |
| https://dev.bitly.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bitlyTool`
- **Parent alias:** `n8n-nodes-base.bitly` — the tool variant shares the same node definition with `usableAsTool: true`
- **Aliases:** (none)
- **Inputs:** `main` × 1; also accepts `ai_tool` input when invoked by an AI agent
- **Outputs:** `main` × 1
- **Credentials:** `bitlyApi` (API access token) or `bitlyOAuth2Api` (OAuth2)
- **Auth selection parameter:** `authentication` — enum: `accessToken`, `oAuth2`
- **AI tool semantics:** When invoked by an AI agent, all string, number, and collection parameters accept `$fromAI()` expressions dynamically resolved at call time. Tool execution defaults to `executeOnce: true` (process first item only).

## Parameters

The node exposes a single **Link** resource with three operations. All parameters (except the resource/operation selectors) support `$fromAI()` population when the node runs in AI agent tool mode:

| Resource | Operation | Parameter name | type | required | notes |
|----------|-----------|----------------|------|----------|-------|
| Link | Create | longUrl | string | yes | Destination URL to shorten |
| Link | Create | domain | string, optional | no | Custom back-half domain (e.g. `bit.ly`, `j.mp`). Defaults to `bit.ly`. |
| Link | Create | group | string, optional | no | Bitly group GUID owning the link |
| Link | Create | tags | string[] | optional | Tags to apply to the link |
| Link | Create | title | string, optional | no | Human-readable title |
| Link | Create | deeplinks | Deeplink[] | optional | Deep-link configs: each entry has `appId`, `appUriPath`, `installType`, `installUrl` |
| Link | Get | id | string | yes | Bitlink ID (e.g. `bit.ly/abc123`) or full shortened URL |
| Link | Update | id | string | yes | Bitlink ID or shortened URL to modify |
| Link | Update | archived | boolean, optional | no | Whether to archive the link |
| Link | Update | tags | string[] | optional | Replacement tags |
| Link | Update | title | string, optional | no | Replacement title |
| Link | Update | longUrl | string, optional | no | Replacement destination URL |
| Link | Update | group | string, optional | no | Move link to a different group |
| Link | Update | deeplinks | Deeplink[] | optional | Replacement deep-link configurations |

## Runtime behavior

### Input

When invoked by an AI agent, parameters are supplied by the model via `$fromAI()` expressions. The agent tool does not iterate over workflow items — it processes once (`executeOnce: true`). When invoked outside an AI agent (e.g. in standard workflow mode), the node behaves identically to `n8n-nodes-base.bitly`: each input item produces one API call.

### Output

Each output item carries the input JSON merged with the Bitly API response under `json`. Response fields for all three operations include:

- `id` — bitlink ID (e.g. `bit.ly/abc123`)
- `link` — full shortened URL
- `long_url` — original destination URL
- `created_at` — ISO-8601 timestamp
- `archived` — boolean
- `tags` — array of tag strings
- `references` — object with related resource URLs

In AI agent mode, the tool response is optimized for consumption by the calling model: the output is typically a single item with the Bitly API response fields.

### Errors

API errors (invalid auth, nonexistent bitlink, rate limiting, malformed request) cause the node to throw. Respects `continueOnFail` — when enabled, error objects are returned as output items instead of halting execution.

### Expressions

All string, number, boolean, and collection parameters accept expression strings (`=...` syntax). In AI agent tool mode, parameters additionally accept `$fromAI()` expressions resolved by the calling model at runtime.

## Acceptance tests

### Test: AI agent shortens a URL

**Given** AI agent supplies parameters via `$fromAI()`:

**Parameters:**
```json
{
  "resource": "Link",
  "operation": "Create",
  "longUrl": "={{ $fromAI('longUrl') }}",
  "tags": "={{ $fromAI('tags') }}"
}
```

**Expect** output[0] to contain `json.link` matching `https://bit.ly/` followed by a short slug, and `json.long_url` to be the long URL supplied by the model.

### Test: retrieve link details by ID (standard mode)

**Given** input items:
```json
[{ "json": { "bitlinkId": "bit.ly/abc123" } }]
```

**Parameters:**
```json
{ "resource": "Link", "operation": "Get", "id": "={{ $json.bitlinkId }}" }
```

**Expect** output[0] to have `json.id` equal to `"bit.ly/abc123"` and `json.long_url` a non-empty URL.

### Test: update link with archived flag

**Parameters:**
```json
{ "resource": "Link", "operation": "Update", "id": "bit.ly/abc123", "archived": true }
```

**Expect** output[0] to contain `json.archived` equal to `true`.

### Test: continue on fail with invalid bitlink

**Parameters:**
```json
{ "resource": "Link", "operation": "Get", "id": "bit.ly/nonexistent999", "options": { "continueOnFail": true } }
```

**Expect** output[0] to contain an error indicator under `json.error` or `_error`, without aborting.

### Test: create with deeplinks

**Parameters:**
```json
{
  "resource": "Link",
  "operation": "Create",
  "longUrl": "https://example.com",
  "deeplinks": [{ "appId": "com.example.app", "appUriPath": "/path", "installType": "system", "installUrl": "https://example.com/app" }]
}
```

**Expect** output[0] `json.link` matches a shortened URL pattern, and the API response acknowledges deeplink configuration (Bitly API returns `deeplinks` in the response body).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type string | documented | Corpus manifest confirms `n8n-nodes-base.bitlyTool` |
| Operations (Create/Get/Update) | documented | Public n8n Bitly docs; shared with base `bitly` node |
| Parameters | documented | Same as base `bitly` node; confirmed in published type definitions |
| AI tool semantics | documented | Standard n8n AI-tool mechanism (`$fromAI()`, `usableAsTool: true`) |
| Deeplink structure | inferred | Not mentioned in public n8n docs; confirmed from published type definitions |
| Tool-specific options | inferred | No separate tool-only parameters; all base parameters support `$fromAI()` |
| Credential types | documented | `bitlyApi` and `bitlyOAuth2Api` on n8n credentials page |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.bitlyTool.ts` — thin wrapper around the base `bitly` executor adding `ai_tool` input handling and `$fromAI()` expression resolution
- **SDK:** `defineNode` + native `ExecutionContext` only
