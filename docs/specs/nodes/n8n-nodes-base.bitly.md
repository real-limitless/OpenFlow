---
type: n8n-nodes-base.bitly
displayName: Bitly
category: Utility
versions: [1]
priority: medium
status: specced
---

# Bitly

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitly.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bitly.md | Public docs only |
| https://dev.bitly.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bitly`
- **Aliases:** `n8n-nodes-base.bitlyTool`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bitlyApi` (API access token) or `bitlyOAuth2Api` (OAuth2)
- **Auth selection parameter:** `authentication` — enum: `accessToken`, `oAuth2` (default determined by credential presence)
- **AI tool:** `usableAsTool: true` — the same node definition is registered as a tool variant for AI agents under the `bitlyTool` type string. When used by an AI agent, all string/collection parameters accept `$fromAI()` expressions that the model supplies dynamically at call time.

## Parameters

The node exposes a single **Link** resource with three operations. High-level parameters. When used as an AI agent tool, all parameters (except resource/operation selectors) support `$fromAI()` population by the calling model:

| Resource | Operation | Parameter name | type | required | notes |
|----------|-----------|----------------|------|----------|-------|
| Link | Create | longUrl | string | yes | The URL to shorten. Expression-capable. |
| Link | Create | domain | string, optional | no | Custom back-half domain (e.g. `bit.ly`, `j.mp`). Defaults to `bit.ly`. |
| Link | Create | group | string, optional | no | Bitly group to own the link. Accepts group GUID via dropdown or expression. |
| Link | Create | tags | string[], optional | no | Free-form tags applied to the link. |
| Link | Create | title | string, optional | no | Human-readable title for the shortened link. |
| Link | Create | deeplinks | Deeplink[], optional | no | Array of deep link configurations, each with appId, appUriPath, installType, installUrl. |
| Link | Get | id | string | yes | The bitlink ID (e.g. `bit.ly/abc123`) or full shortened URL. |
| Link | Update | id | string | yes | The bitlink ID or shortened URL to modify. |
| Link | Update | archived | boolean, optional | no | Whether the link is archived. Defaults to false. |
| Link | Update | tags | string[], optional | no | Replace existing tags. |
| Link | Update | title | string, optional | no | Replace existing title. |
| Link | Update | longUrl | string, optional | no | Replace the destination URL. |
| Link | Update | group | string, optional | no | Move the link to a different group. |
| Link | Update | deeplinks | Deeplink[], optional | no | Array of deep link configurations, same shape as Create. |

## Runtime behavior

### Input

Each input item is processed independently. The node sends one Bitly API request per input item and collects the responses. All parameters may be set via expression against the input item data. In AI agent tool mode, parameters are populated by the model via `$fromAI()` expressions rather than from workflow items; when `executeOnce` is true (tool mode default), only the first item is processed.

### Output

Each output item carries the input JSON merged with the Bitly API response under `json`. The response shape for **Create** / **Get** / **Update** includes:

- `id` — the bitlink ID (e.g. `bit.ly/abc123`)
- `link` — the full shortened URL
- `long_url` — the destination URL
- `created_at` — ISO-8601 timestamp of creation
- `archived` — boolean
- `tags` — array of tag strings
- `references` — object with related resource URLs (e.g. `group`)

The Deeplink parameter accepts an array of objects with fields: `appId` (app store app ID), `appUriPath` (URI path for deep linking), `installType` (installation type), `installUrl` (fallback install URL). Only applicable to Create and Update operations.

**Error handling:** If the API returns a non-2xx status, the node throws an error unless `continueOnFail` is enabled. On `continueOnFail`, an error object is returned in place of the expected output.

### Errors

Throw on invalid authentication, nonexistent bitlink, rate limiting, or malformed request body. Respect `continueOnFail` for graceful degradation.

### Expressions

All parameter values accept expression strings (`=...` syntax). This includes the long URL, bitlink ID, tags arrays, and optional fields. When used as an AI agent tool, all string and collection parameters additionally accept `$fromAI()` expressions that resolve to values supplied by the calling AI model at runtime.

## Acceptance tests

### Test: shorten a URL

**Given** input items:

```json
[{ "json": { "url": "https://example.com/very/long/path" } }]
```

**Parameters:**

```json
{ "resource": "Link", "operation": "Create", "longUrl": "={{ $json.url }}" }
```

**Expect** output[0] to contain `json.link` matching the pattern `https://bit.ly/` followed by a short slug, and `json.long_url` equal to `https://example.com/very/long/path`.

### Test: retrieve link details by ID

**Given** input items:

```json
[{ "json": { "bitlinkId": "bit.ly/abc123" } }]
```

**Parameters:**

```json
{ "resource": "Link", "operation": "Get", "bitlinkId": "={{ $json.bitlinkId }}" }
```

**Expect** output[0] to have `json.id` equal to `"bit.ly/abc123"` and `json.long_url` to be a non-empty URL string.

### Test: update link title and tags

**Given** input items:

```json
[{ "json": { "bitlinkId": "bit.ly/abc123" } }]
```

**Parameters:**

```json
{ "resource": "Link", "operation": "Update", "bitlinkId": "={{ $json.bitlinkId }}", "title": "Updated Title", "tags": ["tag1", "tag2"] }
```

**Expect** output[0] to contain `json.title` equal to `"Updated Title"` and `json.tags` containing `"tag1"` and `"tag2"`.

### Test: continue on fail with invalid link

**Given** input items:

```json
[{ "json": { "bitlinkId": "bit.ly/nonexistent999" } }]
```

**Parameters:**

```json
{ "resource": "Link", "operation": "Get", "bitlinkId": "={{ $json.bitlinkId }}", "options": { "continueOnFail": true } }
```

**Expect** output[0] to contain `json.error` or `_error` indicating the request failure, without aborting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available operations | documented | Public n8n docs list Create/Get/Update for Link resource |
| Parameters per operation | documented | Parameter names confirmed from published type descriptors; aligns with Bitly REST API |
| Response shape | documented | Bitly REST API response shape for create/get/update endpoints |
| Credential types | documented | API token and OAuth2 both documented on n8n credentials page |
| Deeplinks support | inferred | Not mentioned in public n8n docs; confirmed from published type definitions |
| Expression behavior | documented | Standard n8n expression behavior applies |
| Tool alias (bitlyTool) | documented | Corpus confirms `usableAsTool: true` on the bitly node definition; `bitlyTool` is registered as an alias of this same node for AI agent usage |
| `$fromAI()` behavior | documented | Standard n8n AI-tool mechanism documented at docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md |
| AI tool-specific parameters | inferred | No separate Tool-only parameters exist; all base parameters support `$fromAI()` when used in tool mode |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file (base):** `src/lib/engine/executors/n8n-nodes-base.bitly.ts`
- **Executor file (tool):** `src/lib/engine/executors/n8n-nodes-base.bitlyTool.ts` — thin wrapper around the base executor adding `ai_tool` input handling and `$fromAI()` expression support
- **SDK:** `defineNode` + native `ExecutionContext` only
