---
type: n8n-nodes-base.Brandfetch
displayName: Brandfetch
category: Utility
versions: [1]
priority: medium
status: specced
---

# Brandfetch

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.brandfetch/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/brandfetch/ | Public docs only |
| https://docs.brandfetch.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.Brandfetch`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `brandfetchApi` (API key, required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | logo | true | — | Company/Color/Font/Industry/Logo |
| domain | string | "" | true | — | The company domain to query (e.g. `n8n.io`) |
| download | boolean | false | true | operation = logo | When true, write downloaded image(s) to binary data |
| imageTypes | multiOptions | ["logo","icon"] | true | operation=logo, download=true | Which asset types to download: Icon, Logo |
| imageFormats | multiOptions | ["png"] | true | operation=logo, download=true | Image format: PNG, SVG |

### Operations

Each operation maps to a distinct Brandfetch API endpoint on the same company domain:

- **Company** — Return the full company data object (description, name, legal name, social links, location, etc.)
- **Color** — Return the brand color palette (primary, secondary, accent hex values)
- **Font** — Return the brand font stack (font family names and CSS URLs)
- **Industry** — Return the company industry classification
- **Logo** — Return logo and icon URLs; optionally download them as binary attachments

## Runtime behavior

### Input

Each input item is processed independently. The `domain` parameter (required expression/string) identifies the company to look up. Other items on the input are passed through unchanged.

### Output

- For **Company**, **Color**, **Font**, **Industry** operations: returns the API response body as JSON under the `json` property of each output item. Input item metadata (`binary`, `pairedItem`) is preserved.
- For **Logo** operation without download: returns an object with URLs for logo and icon image assets under `json`.
- For **Logo** operation with `download=true`: downloads the selected asset types (`imageTypes`) in the selected formats (`imageFormats`). Each downloaded image is placed in `binary.<imageType>_<format>` (e.g., `logo_png`, `icon_svg`) as binary data with appropriate MIME type. The JSON portion contains the same URL data as the non-download version.

### Errors

- Missing or invalid `domain`: node throws an error.
- API returns non-2xx (e.g., domain not found, rate limited): node throws with the HTTP error message.
- `continueOnFail` option (general n8n mechanism) can be used to suppress errors and continue with an empty output item.

### Expressions

The `domain` parameter accepts expression strings. All other parameters are typically static but may also accept expressions where n8n permits.

## Acceptance tests

### Test: basic company lookup

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "company",
  "domain": "n8n.io"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "name": "n8n",
    "description": "...",
    "links": ["..."],
    "social": { "linkedin": "...", "twitter": "..." }
  }
}]
```

The exact shape mirrors the Brandfetch `/v2/company` response for the given domain.

### Test: color palette retrieval

**Parameters:** `{ "operation": "color", "domain": "n8n.io" }`

**Expect** output[0].json contains a `colors` array with hex values for primary, secondary, and accent colors.

### Test: logo download as binary

**Parameters:** `{ "operation": "logo", "domain": "n8n.io", "download": true, "imageTypes": ["logo", "icon"], "imageFormats": ["png"] }`

**Expect:**
- output[0].json contains `logo` and `icon` objects with URL fields
- output[0].binary contains `logo_png` and `icon_png` entries with `mimeType` set to `image/png` and valid binary data

### Test: industry classification

**Parameters:** `{ "operation": "industry", "domain": "n8n.io" }`

**Expect** output[0].json contains an `industry` string (e.g. `"Computer Software"`).

### Test: font retrieval

**Parameters:** `{ "operation": "font", "domain": "n8n.io" }`

**Expect** output[0].json contains a `fonts` object or array describing the brand's font family names and source URLs.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Documented (n8n docs page) | 5 operations: Company, Color, Font, Industry, Logo |
| Credential type | Documented | `brandfetchApi` API key |
| Wire format | Inferred from published JSON descriptor | Type string, inputs/outputs, property schema |
| Logo download behavior | Inferred from published JSON descriptor | `download`, `imageTypes`, `imageFormats` parameters |
| Exact API response shapes | Inferred from Brandfetch public API docs | Spec uses abstract outcome shapes, not exact field names |
| Brandfetch API base URL | Inferred | Likely `https://api.brandfetch.com/v2/` |

## OpenFlow mapping

- **Definition group:** `utility`
- **Executor file:** `src/lib/engine/executors/Brandfetch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
