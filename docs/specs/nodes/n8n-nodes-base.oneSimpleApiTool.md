---
type: n8n-nodes-base.oneSimpleApiTool
displayName: One Simple API Tool
category: Utility
versions: [1]
priority: medium
status: specced
---

# One Simple API Tool

## Sources

| URL | Source class |
|-----|-----|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.onesimpleapi/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/onesimpleapi/ | Public docs only |
| https://onesimpleapi.com/docs | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.oneSimpleApiTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `oneSimpleApiApi` (API token)

## Parameters

The node selects one resource, then one operation on that resource.

### Resource selector

| name | type | default | options |
|------|------|---------|---------|
| resource | fixed | `information` | `information`, `socialProfile`, `utility`, `website` |

### Operation selector (per resource)

| resource | operation name | required fields |
|----------|---------------|-----------------|
| `information` | `currencyConversion` | amount, fromCurrency (3-letter code), toCurrency (3-letter code) |
| `information` | `imageMetadata` | imageUrl |
| `socialProfile` | `instagramProfile` | instagramUsername |
| `socialProfile` | `spotifyArtist` | spotifyArtistId |
| `utility` | `expandUrl` | shortUrl |
| `utility` | `qrCode` | content/text to encode |
| `utility` | `emailValidation` | emailAddress |
| `website` | `pdfFromWebpage` | webpageUrl |
| `website` | `seoInfo` | webpageUrl |
| `website` | `screenshot` | webpageUrl |

### Common options

- **Additional fields** (per-operation, for optional query parameters): may include image size/format for QR codes, viewport dimensions for screenshots, PDF page options, etc. These are delegated to the One Simple API query parameters documented at https://onesimpleapi.com/docs.

All parameter names are abstracted above. The actual internal parameter property names may differ from the labels shown.

### Expression support

All user-supplied values (URLs, text content, amounts, usernames, IDs) support `$fromAI()` dynamic population and standard n8n expression syntax.

## Runtime behavior

### Input

Each input item is processed independently. The node reads the user-configured resource, operation, and required fields from the node parameters. If the parameters reference input item fields via expressions, those are resolved per item.

### Output

For each input item, the executor sends a GET or POST request to the One Simple API endpoint corresponding to the selected resource + operation. The API base URL is `https://onesimpleapi.com/api`.

The response body from the One Simple API is returned as the output item's JSON data. The exact response shape varies per operation and is defined by the external API at https://onesimpleapi.com/docs.

Each input item maps to one output item on output index `0`.

### Errors

- Network errors (timeout, DNS, connection refused) throw a NodeApiError so the workflow can handle them via error workflows or `continueOnFail`.
- HTTP error responses from the One Simple API (non-2xx) throw a NodeApiError with the HTTP status code and response body.
- When `continueOnFail` is enabled on the node, errors are suppressed and the item is passed through with an `error` property instead of halting execution.

### Expressions

All text/freeform parameter fields accept expression strings.

## Acceptance tests

### Test: currency conversion

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "information",
  "operation": "currencyConversion",
  "amount": 100,
  "fromCurrency": "USD",
  "toCurrency": "EUR"
}
```

**Expect** output[0]:
- Status is success (no thrown error)
- Output JSON contains a `result` (or equivalent) field with the converted value

### Test: QR code generation

**Given** input items:

```json
[{ "json": { "link": "https://example.com" } }]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "qrCode",
  "content": "={{ $json.link }}"
}
```

**Expect** output[0]:
- Status is success
- Output JSON includes a URL to the generated QR code image (or base64-encoded image data)

### Test: email validation

**Given** input items:

```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "emailValidation",
  "emailAddress": "={{ $json.email }}"
}
```

**Expect** output[0]:
- Output JSON contains a field indicating whether the email is valid (e.g. `is_valid`, `valid`, or similar boolean)

### Test: URL expansion

**Given** input items:

```json
[{ "json": { "url": "https://bit.ly/3xyz" } }]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "expandUrl",
  "shortUrl": "={{ $json.url }}"
}
```

**Expect** output[0]:
- Output JSON contains the original (unshortened) URL

### Test: website screenshot

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "website",
  "operation": "screenshot",
  "webpageUrl": "https://example.com"
}
```

**Expect** output[0]:
- Output JSON contains a URL or binary pointer to the screenshot image

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs only | All 10 operations are listed on the public n8n docs page and the One Simple API docs site |
| Credentials | Public docs only | API token from https://onesimpleapi.com/user/api-tokens |
| Exact API response shapes | Inferred from external service | Responses vary per endpoint; tests should validate existence of expected fields but not hard-code exact shapes |
| Tool variant specifics | Inferred from pattern | As a `*Tool` node, it exposes `$fromAI()` dynamic parameter population (standard AI tool pattern) |
| Optional/additional parameters | Inferred | Per-operation options (QR size, screenshot dimensions, etc.) follow the One Simple API query parameters documented at onesimpleapi.com/docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/oneSimpleApiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
