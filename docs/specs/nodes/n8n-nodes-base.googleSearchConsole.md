---
type: n8n-nodes-base.googleSearchConsole
displayName: Google Search Console
category: Core
versions: [1]
priority: medium
status: specced
---

# Google Search Console

## Sources

| URL | Source class |
|-----|----------------|
| https://developers.google.com/webmaster-tools/v1/api_reference_index | Public docs only |
| https://developers.google.com/webmaster-tools/v1/searchanalytics/query | Public docs only |
| https://developers.google.com/webmaster-tools/v1/sitemaps | Public docs only |
| https://developers.google.com/webmaster-tools/v1/sites | Public docs only |
| https://developers.google.com/webmaster-tools/v1/urlInspection.index/ | Public docs only |
| https://developers.google.com/identity/protocols/oauth2/scopes#webmasterstools | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleSearchConsole`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleOAuth2Api` (Google OAuth2) — requires one of the following scopes:
  - `https://www.googleapis.com/auth/webmasters` (read/write — full access)
  - `https://www.googleapis.com/auth/webmasters.readonly` (read-only access)

The node authenticates via Google OAuth2 using the standard `googleOAuth2Api` credential type shared by all Google API nodes in n8n. The token is passed as a Bearer token in the `Authorization` header of each API request.

## External API

The Google Search Console API (formerly Webmasters API) exposes four services:

| Service | Base URL | Auth scope |
|---------|----------|------------|
| Search Analytics | `https://www.googleapis.com/webmasters/v3` | `webmasters.readonly` |
| Sitemaps | `https://www.googleapis.com/webmasters/v3` | `webmasters` (write) or `webmasters.readonly` |
| Sites | `https://www.googleapis.com/webmasters/v3` | `webmasters` (write) or `webmasters.readonly` |
| URL Inspection | `https://searchconsole.googleapis.com/v1` | `webmasters.readonly` |

## Parameters

The node exposes four resources, each with one or more operations, following the Google Search Console API service layout.

### Resource: Search Analytics

#### Operation: Query

Requests traffic data from the Search Analytics API. See: `POST /sites/{siteUrl}/searchAnalytics/query`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The URL of the property as shown in Search Console (e.g. `sc_domain:example.com` or `https://www.example.com/`). Must be URL-encoded when sent to the API |
| startDate | string | — | yes | Start date in `YYYY-MM-DD` format, or relative like `7daysAgo`, `today` |
| endDate | string | — | yes | End date in `YYYY-MM-DD` format or relative |
| dimensions | array[string] | `[]` | no | List of dimension names to group by: `country`, `device`, `page`, `query`, `searchAppearance` |
| searchType | enum | `web` | no | Type of search: `web`, `image`, `video`, `news` |
| dimensionFilterGroups | array[object] | — | no | Groups of dimension filters (AND within a group, OR between groups). Each group has `filters[]` with `dimension`, `operator`, `expression`. Operators: `equals`, `notEquals`, `contains`, `notContains`, `includingRegex`, `excludingRegex` |
| aggregationType | enum | `auto` | no | How to aggregate results: `auto`, `byPage`, `bySite` |
| rowLimit | number | — | no | Maximum rows to return (API max 25000). If omitted the API defaults to 1000 |
| startRow | number | — | no | Row offset for pagination |
| returnAll | boolean | false | no | If true, paginates through all available data rows automatically (respecting rowLimit as a page size) |

### Resource: Sitemaps

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The Search Console property URL |

#### Operation: Get

`GET /sites/{siteUrl}/sitemaps/{feedpath}` — retrieve info about a single sitemap.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sitemapUrl | string | — | yes | The full URL of the sitemap to retrieve (e.g. `https://www.example.com/sitemap.xml`) |

#### Operation: List

`GET /sites/{siteUrl}/sitemaps` — list sitemaps submitted for the site.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sitemapIndex | string | — | no | If set, returns the sitemap index at this URL instead of the site's submitted sitemaps |

#### Operation: Submit

`PUT /sites/{siteUrl}/sitemaps/{feedpath}` — submit a new sitemap.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sitemapUrl | string | — | yes | The sitemap URL to submit |

#### Operation: Delete

`DELETE /sites/{siteUrl}/sitemaps/{feedpath}` — remove a sitemap.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sitemapUrl | string | — | yes | The sitemap URL to delete |

### Resource: Sites

#### Operation: Get

`GET /sites/{siteUrl}` — retrieve information about a specific site.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The property URL to retrieve info about |

#### Operation: List

`GET /sites` — list all Search Console properties the user has access to. No additional parameters.

#### Operation: Add

`PUT /sites/{siteUrl}` — add a new property to the user's Search Console account. Requires `webmasters` scope (write).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The property URL to add (e.g. `sc_domain:example.com` or `https://www.example.com/`) |

#### Operation: Delete

`DELETE /sites/{siteUrl}` — remove a property from the user's Search Console account. Requires `webmasters` scope (write).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The property URL to delete |

### Resource: URL Inspection

#### Operation: Inspect

`POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` — inspect the Google index status of a specific URL.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| siteUrl | string | — | yes | The Search Console property the page belongs to |
| inspectionUrl | string | — | yes | The full URL to inspect |
| languageCode | string | — | no | Language code for inspection results (e.g. `en-US`) |

## Runtime behavior

### Input

Each input item is processed independently. The node reads parameters from configured node settings, with expression support in all string, number, and boolean fields. Input item data (`$json`) is accessible in expressions but not consumed as a structured data source.

### Output

**Search Analytics → Query:** produces one output item containing the raw API response envelope:

```json
{
  "responseAggregationType": "auto",
  "rows": [
    {
      "keys": ["united-states", "desktop"],
      "clicks": 1234,
      "impressions": 56789,
      "ctr": 2.17,
      "position": 4.5
    }
  ],
  "totalRows": 1500
}
```

The `keys` array order corresponds to the requested `dimensions` order. The output also wraps the API response: the node emits the full API response body (`responseAggregationType`, `rows`, `totalRows`).

**Sitemaps → Get/List:** returns the sitemap resource representation from the API:

```json
{
  "path": "https://www.example.com/sitemap.xml",
  "lastSubmitted": "2024-01-15T10:00:00Z",
  "isPending": false,
  "isSitemapsIndex": false,
  "type": "xml",
  "lastDownloaded": "2024-01-15T10:00:10Z",
  "warnings": 0,
  "errors": 0,
  "contents": [
    {
      "type": "web",
      "submitted": 150,
      "indexed": 142
    }
  ]
}
```

List returns an array `{ "sitemap": [...] }`.

**Sitemaps → Submit/Delete:** returns the API response on success (empty body for success). The node should confirm a 2xx status code.

**Sites → Get:** returns the site resource:

```json
{
  "siteUrl": "sc_domain:example.com",
  "permissionLevel": "siteFullUser"
}
```

**Sites → List:** returns `{ "siteEntry": [...] }` with site resources.

**Sites → Add/Delete:** confirms a 2xx status code; no body returned.

**URL Inspection → Inspect:** returns the inspection result:

```json
{
  "inspectionResult": {
    "indexStatusResult": {
      "verdict": "PASS",
      "coverageState": "Submitted and indexed",
      "crawling": "Allowed",
      "indexing": "Allowed",
      "robotsTxtState": "Allowed",
      "pageFetchState": "Successful",
      "googleCanonical": "https://www.example.com/mypage",
      "userCanonical": "https://www.example.com/mypage"
    },
    "inspectionUrl": "https://www.example.com/mypage"
  }
}
```

### Errors

- **Missing credential:** throws `NodeOperationError` with a message indicating the Google OAuth2 credential is required.
- **Invalid siteUrl:** the Search Console API returns a 404 if the site is not verified for the authenticated user. The node should surface the HTTP error message.
- **OAuth token expired:** a 401 response triggers OAuth token refresh via the credential system.
- **Insufficient scope (write operation with readonly scope):** the API returns a 403 Forbidden.
- **Rate limiting:** the API returns a 429 with Retry-After header; the node should propagate the error.
- `continueOnFail`: when enabled, the node returns zero output items for the failed input item rather than interrupting execution.

### Expressions

All string, number, and enum parameter fields accept expression strings (`=...` syntax). Array parameters (e.g. `dimensions`, `dimensionFilterGroups`) accept expression-returned arrays.

### Pagination

**Search Analytics → Query** with `returnAll: true`: the executor paginates by incrementing `startRow` by `rowLimit` (or the API default of 1000) until `startRow >= totalRows` or the number of collected rows reaches a reasonable limit. Each page is a separate API call.

## Acceptance tests

### Test: search analytics query

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "searchAnalytics",
  "operation": "query",
  "siteUrl": "sc_domain:example.com",
  "startDate": "7daysAgo",
  "endDate": "today",
  "dimensions": ["country", "device"],
  "searchType": "web",
  "rowLimit": 10
}
```

**Expect** output[0]:

- `json.rows` is a non-empty array
- Each row has `keys` (array of strings), `clicks` (number), `impressions` (number), `ctr` (number), `position` (number)
- `json.rows[0].keys.length` is 2, matching the requested dimensions
- `json.totalRows` is a number >= 0

### Test: sitemaps list

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sitemaps",
  "operation": "list",
  "siteUrl": "sc_domain:example.com"
}
```

**Expect** output[0]:

- `json.sitemap` is an array of objects
- Each object has at least `path` (string) and `type` (string)

### Test: sites list

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sites",
  "operation": "list"
}
```

**Expect** output[0]:

- `json.siteEntry` is an array of objects
- Each entry has `siteUrl` (string) and `permissionLevel` (string)
- At least one entry matches the authenticated user's verified properties

### Test: URL inspection

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "urlInspection",
  "operation": "inspect",
  "siteUrl": "sc_domain:example.com",
  "inspectionUrl": "https://www.example.com/",
  "languageCode": "en-US"
}
```

**Expect** output[0]:

- `json.inspectionResult` is an object
- `json.inspectionResult.inspectionUrl` equals the input `inspectionUrl`
- `json.inspectionResult.indexStatusResult.verdict` is one of `"PASS"`, `"PARTIAL"`, `"FAIL"`, or `"NEUTRAL"`

### Test: error on invalid siteUrl

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sites",
  "operation": "get",
  "siteUrl": "https://nonexistent.example/"
}
```

**Expect:** The node throws a `NodeOperationError` with the API error message. No items are returned on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact resource/operation naming | Inferred | The Google Search Console API has four services (searchAnalytics, sitemaps, sites, urlInspection); exact n8n UI resource/operation structure may differ from the flat API |
| Credential type | Inferred | Uses `googleOAuth2Api` per n8n convention for all Google API nodes; scope `webmasters` or `webmasters.readonly` |
| URL encoding of siteUrl | Inferred | The API requires URL-encoded siteUrl in path; the node likely handles this automatically |
| `returnAll` / `rowLimit` pagination | Inferred from n8n convention | Common n8n pagination pattern; exact page size and max pages depend on executor |
| Search Analytics query parameter names | inferred from API docs | n8n UI may group them differently (e.g. under "Filters" or "Options") |
| Sitemap Submit/Delete return shape | Inferred | API returns empty 2xx body on success; node may wrap this as a success message |
| URL Inspection endpoint version | Inferred | Uses v1 endpoint `searchconsole.googleapis.com/v1` as documented by Google; differs from webmasters v3 base |
| Error handling detail | Inferred | Standard n8n error propagation expected |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleSearchConsole.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
