---
type: n8n-nodes-base.oneSimpleApi
displayName: One Simple API
category: Transform
versions: [1]
priority: low
status: specced
---

# One Simple API

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.onesimpleapi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/onesimpleapi.md | Public docs only |
| https://onesimpleapi.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.oneSimpleApi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `oneSimpleApi` (API token)

## Parameters

The node uses a two-level resource/operation selector followed by operation-specific fields.

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `information`, `socialProfile`, `utility`, `website` | `website` | yes | Selects the API domain |

### Operation selector (depends on resource)

**Information** (`resource=information`):

| operation value | display name | required fields | API endpoint |
|----------------|--------------|----------------|--------------|
| `exchangeRate` | Exchange Rate | `value` (string), `fromCurrency` (string, placeholder USD), `toCurrency` (string, placeholder EUR) | GET /exchange_rate |
| `imageMetadata` | Image Metadata | `link` (string, URL to image) | GET /image_info |

**Social Profile** (`resource=socialProfile`):

| operation value | display name | required fields | API endpoint |
|----------------|--------------|----------------|--------------|
| `instagramProfile` | Instagram | `profileName` (string) | GET /instagram_profile |
| `spotifyArtistProfile` | Spotify | `artistName` (string) | GET /spotify_profile |

**Utility** (`resource=utility`):

| operation value | display name | required fields | API endpoint |
|----------------|--------------|----------------|--------------|
| `expandURL` | Expand URL | `link` (string) | GET /unshorten |
| `qrCode` | Generate QR Code | `message` (string, QR content), `download` (boolean, default false), `output` (string, default `data`, when download=true) | GET /qr_code |
| `validateEmail` | Validate Email | `emailAddress` (string) | GET /email |

**Website** (`resource=website`):

| operation value | display name | required fields | API endpoint |
|----------------|--------------|----------------|--------------|
| `pdf` | Generate PDF | `link` (string, webpage URL), `download` (boolean, default false), `output` (string, default `data`, when download=true) | GET /pdf |
| `seo` | Get SEO Data | `link` (string, webpage URL) | GET /page_info |
| `screenshot` | Take Screenshot | `link` (string, webpage URL), `download` (boolean, default false), `output` (string, default `data`, when download=true) | GET /screenshot |

### Options collections

**PDF options** (resource=website, operation=pdf): `page` (enum: A0-A6, Ledger, Legal, Letter, Tabloid), `force` (boolean, default false — bypasses cached PDF).

**Screenshot options** (resource=website, operation=screenshot): `screen` (enum: phone, phone-landscape, retina, tablet, tablet-landscape), `force` (boolean, default false), `fullpage` (boolean, default false).

**SEO options** (resource=website, operation=seo): `headers` (boolean, default false — include HTTP response headers).

**QR code options** (resource=utility, operation=qrCode): `size` (enum: Small, Medium, Large; default Small), `format` (enum: PNG, SVG; default PNG).

## Runtime behavior

### Input

The node accepts any input items. All parameters are set on the node configuration (statically or via expressions); no input-item data fields are consumed implicitly.

### Output

The node iterates over every input item. For each item it makes one API call to the One Simple API service and emits one output item containing the API response as the `json` property.

For operations that support downloading binary data (pdf, screenshot, qrCode with `download=true`), the output item additionally contains a `binary` property with the downloaded file data keyed by the `output` field name.

When `download` is false, the API response is returned as-is (typically containing a `url` property pointing to the generated asset).

### Errors

If the upstream One Simple API returns an error (invalid token, invalid parameters, rate limiting), the node should throw. When `continueOnFail` is enabled, the node emits `{ error: errorMessage }` for that item instead.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: currency conversion sends POST to /api/currency and returns result

**Given** input items:

```json
[{ "json": { "amount": "100", "from": "USD", "to": "EUR" } }]
```

**Parameters:**

```json
{
  "resource": "information",
  "operation": "exchangeRate",
  "value": "={{ $json.amount }}",
  "fromCurrency": "={{ $json.from }}",
  "toCurrency": "={{ $json.to }}"
}
```

**Expect** output[0] to contain a `json` object (pass-through of the One Simple API /exchange_rate response) with a numeric conversion result.

### Test: QR code generation sends POST to /api/qr-code and returns result

**Given** input items:

```json
[{ "json": { "text": "https://example.com" } }]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "qrCode",
  "message": "={{ $json.text }}",
  "download": false
}
```

**Expect** output[0] to contain a `json` object with a QR-code image URL (pass-through of the One Simple API /qr_code response).

### Test: email validation sends POST to /api/email-validate and returns result

**Given** input items:

```json
[{ "json": { "addr": "test@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "validateEmail",
  "emailAddress": "={{ $json.addr }}"
}
```

**Expect** output[0] to contain a `json` object (pass-through of the One Simple API /email response).

### Test: website screenshot sends POST to /api/screenshot and returns result

**Given** input items:

```json
[{ "json": { "page": "https://example.com" } }]
```

**Parameters:**

```json
{
  "resource": "website",
  "operation": "screenshot",
  "link": "={{ $json.page }}",
  "download": false
}
```

**Expect** output[0] to contain a `json` object with a screenshot image URL (pass-through of the One Simple API /screenshot response).

### Test: multi-item input produces one output per input

**Given** input items:

```json
[
  { "json": { "page": "https://example.com" } },
  { "json": { "page": "https://example.org" } }
]
```

**Parameters:**

```json
{
  "resource": "website",
  "operation": "screenshot",
  "link": "={{ $json.page }}",
  "download": false
}
```

**Expect** output[0] to contain exactly 2 items, one per input item.

### Test: processes multiple items

**Given** input items:

```json
[
  { "json": { "text": "https://example.com/a" } },
  { "json": { "text": "https://example.com/b" } }
]
```

**Parameters:**

```json
{
  "resource": "utility",
  "operation": "qrCode",
  "message": "={{ $json.text }}",
  "download": false
}
```

**Expect** output[0] to contain 2 items, each with a `json` object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact API response shapes | Inferred | One Simple API responses vary by endpoint; spec treats as pass-through |
| Available currency codes | Inferred | Service-defined set not enumerated |
| Instagram/Spotify profile result shape | Inferred | n8n docs list operations but not response fields |
| QR code output format (URL vs base64) | Inferred | n8n docs do not specify; executor should pass through whatever the API returns |
| Pagination / batching | Not applicable | All operations are single-request, single-item |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/oneSimpleApi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
