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
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitly.html | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bitly.html | Public docs only |
| https://dev.bitly.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bitly`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bitlyApi` (Generic OAuth2 API) or `bitlyOAuth2Api` (OAuth2)

## Parameters

The node exposes a single **Link** resource with three operations. High-level parameters:

| Resource | Operation | Parameter name | type | required | notes |
|----------|-----------|----------------|------|----------|-------|
| Link | Create | Long URL | string | yes | The URL to shorten. Expression-capable. |
| Link | Create | Domain | string, optional | no | Custom back-half domain (e.g. `bit.ly`, `j.mp`). Defaults to account default. |
| Link | Create | Group GUID | string, optional | no | Bitly group to own the link. Defaults to primary group. |
| Link | Create | Tags | string[], optional | no | Free-form tags applied to the link. |
| Link | Create | Title | string, optional | no | Human-readable title for the shortened link. |
| Link | Get | Link / Bitlink ID | string | yes | The shortened link or its ID to retrieve details for. |
| Link | Update | Link / Bitlink ID | string | yes | The shortened link or ID to modify. |
| Link | Update | Archived | boolean, optional | no | Whether the link is archived. |
| Link | Update | Tags | string[], optional | no | Replace existing tags. |
| Link | Update | Title | string, optional | no | Replace existing title. |
| Link | Update | Long URL | string, optional | no | Replace the destination URL (updates `long_url`). |

## Runtime behavior

### Input

Each input item is processed independently. The node sends one Bitly API request per input item and collects the responses. All parameters may be set via expression against the input item data.

### Output

Each output item carries the input JSON merged with the Bitly API response under `json`. The response shape for **Create** / **Get** / **Update** includes:

- `id` — the bitlink ID (e.g. `bit.ly/abc123`)
- `link` — the full shortened URL
- `long_url` — the destination URL
- `created_at` — ISO-8601 timestamp of creation
- `archived` — boolean
- `tags` — array of tag strings
- `references` — object with related resource URLs (e.g. `group`)

**Error handling:** If the API returns a non-2xx status, the node throws an error unless `continueOnFail` is enabled. On `continueOnFail`, an error object is returned in place of the expected output.

### Errors

Throw on invalid authentication, nonexistent bitlink, rate limiting, or malformed request body. Respect `continueOnFail` for graceful degradation.

### Expressions

All parameter values accept expression strings (`=...` syntax). This includes the long URL, bitlink ID, tags arrays, and optional fields.

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
| Parameters per operation | partially inferred | Public docs only give operation names; parameter details from Bitly API docs and schema snapshot |
| Response shape | inferred from Bitly API schema | The `create.json` schema in the corpus confirms the response fields |
| Credential types | documented | API token and OAuth2 both documented on n8n credentials page |
| Expression behavior | documented | Standard n8n expression behavior applies |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.bitly.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
