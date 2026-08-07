---
type: n8n-nodes-base.peekalink
displayName: Peekalink
category: Development
versions: [1]
priority: medium
status: specced
---

# Peekalink

Link preview enrichment via the Peekalink API. Given a URL, returns structured metadata (title, description, image, icon, site name) or confirms whether a preview is available. Two operations share a single required URL parameter.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.peekalink/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/peekalink/ | Public docs only |
| https://docs.peekalink.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.peekalink`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `peekalinkApi` — API key authentication (X-API-Key header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | preview | yes | — | `preview` — return full link preview metadata; `check` — return only availability boolean |
| url | string | — | yes | — | The URL to resolve. Accepts an expression string referencing workflow data. |

No additional options or nested configuration fields are surfaced.

## Runtime behavior

### Input

One or more input items pass through the node. Each item should contain a URL referenced via expression in the `url` parameter (e.g. `{{ $json.someUrl }}`). Items with no URL supplied will produce an empty output or error depending on `continueOnFail`.

### Output

One output item per input item, enriched with the Peekalink response under the `json` property.

- **Operation `preview`:** The output item `json` property contains the full Peekalink preview object. Expected fields (from the external API): `url`, `title`, `description`, `image`, `icon`, `logo`, `contentType`, `contentTypeId`, `domain`, `isSafe`, `mimeType`, `statusCode`, `timestamp`. Shape is determined by the Peekalink API response.
- **Operation `check`:** The output item `json` property contains a simple object with a boolean `available` field indicating whether a preview can be generated for the supplied URL.
- Input item properties not consumed by the expression are passed through unchanged alongside the preview result.

### Errors

- Missing or empty URL: an error is thrown with a message indicating the URL is required.
- Peekalink API returns a non-2xx status (invalid URL, rate limit, auth failure): an error is thrown with the API error message.
- `continueOnFail`: when enabled, errored items produce empty output for that item rather than halting execution.

### Expressions

The `url` parameter accepts expression strings.

## Acceptance tests

### Test: preview a URL

**Given** input items:

```json
[{ "json": { "targetUrl": "https://example.com" } }]
```

**Parameters:**

```json
{
  "operation": "preview",
  "url": "={{ $json.targetUrl }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "targetUrl": "https://example.com",
    "url": "https://example.com",
    "title": "Example Domain",
    "description": "This domain is for use in illustrative examples...",
    "image": { "url": "...", "width": 1200, "height": 630 },
    "icon": { "url": "...", "width": 32, "height": 32 },
    "domain": "example.com",
    "isSafe": true,
    "contentType": "website"
  }
}]
```

(The above is illustrative — the exact response shape is determined by the Peekalink API.)

### Test: check preview availability

**Given** input items:

```json
[{ "json": { "u": "https://example.com" } }]
```

**Parameters:**

```json
{
  "operation": "check",
  "url": "={{ $json.u }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "u": "https://example.com",
    "available": true
  }
}]
```

### Test: missing URL throws error

**Parameters:**

```json
{
  "operation": "preview",
  "url": ""
}
```

**Expect:** node throws `NodeOperationError` with message containing "URL".
When `continueOnFail` is true, the errored item produces an empty output item instead.

### Test: multiple items

**Given** input items:

```json
[
  { "json": { "link": "https://example.com" } },
  { "json": { "link": "https://github.com" } }
]
```

**Parameters:**

```json
{
  "operation": "preview",
  "url": "={{ $json.link }}"
}
```

**Expect** output[0] to contain 2 items, each enriched with Peekalink preview data for its respective URL.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (preview, check) | documented (n8n docs) | Public n8n docs describe exactly 2 operations. |
| Credentials (API key) | documented (n8n docs) | API key from Peekalink dashboard; sent as X-API-Key header. |
| URL parameter | documented (n8n docs) | Required for both operations. |
| Response shape | inferred | The exact fields of the preview response are determined by the external Peekalink API. The spec above lists commonly returned fields from the Peekalink API docs. |
| continueOnFail | inferred from n8n platform | Standard n8n error handling behavior. |
| Aliases / Tool variant | inferred (not found) | No Peekalink Tool variant is documented or present in the package descriptor. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/peekalink.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
