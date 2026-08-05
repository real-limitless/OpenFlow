---
type: n8n-nodes-base.googleCustomSearch
displayName: Google Custom Search
category: Core
versions: [1]
priority: medium
status: specced
---

# Google Custom Search

## Sources

| URL | Source class |
|-----|----------------|
| https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list | Public docs only |
| https://developers.google.com/custom-search/v1/introduction | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleCustomSearch`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleApi` (API key)

The node authenticates via a Google API key credential (`googleApi`), not OAuth2. The API key is sent as the `key` query parameter on every request to `GET https://customsearch.googleapis.com/customsearch/v1`.

## Parameters

The node has a single operation (Search) that wraps the Google Custom Search JSON API `cse.list` endpoint. The search engine ID (`cx`) is provided by the user and identifies which Programmable Search Engine to query.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| cx | string | — | yes | Programmable Search Engine ID |
| query | string | — | yes | Search query (`q` parameter) |
| returnAll | boolean | false | no | If true, paginates through all available results (max 100 across pages) |
| limit | number | — | no | Max results to collect across all pages when returnAll is true |
| options.siteSearch | string | — | no | Restrict results to (or exclude from) this site; see siteSearchFilter |
| options.siteSearchFilter | enum | — | no | `e` (exclude) or `i` (include) — controls siteSearch behavior |
| options.searchType | enum | — | no | `image` to search images; omit for web search |
| options.num | number | 10 | no | Results per page (1–10). Ignored if returnAll is true since the node paginates automatically |
| options.start | number | 1 | no | Index of first result (1-based). Ignored if returnAll is true |
| options.lr | enum | — | no | Restrict to language: `lang_ar`, `lang_bg`, `lang_ca`, `lang_cs`, `lang_da`, `lang_de`, `lang_el`, `lang_en`, `lang_es`, `lang_et`, `lang_fi`, `lang_fr`, `lang_hr`, `lang_hu`, `lang_id`, `lang_is`, `lang_it`, `lang_iw`, `lang_ja`, `lang_ko`, `lang_lt`, `lang_lv`, `lang_nl`, `lang_no`, `lang_pl`, `lang_pt`, `lang_ro`, `lang_ru`, `lang_sk`, `lang_sl`, `lang_sr`, `lang_sv`, `lang_tr`, `lang_zh-CN`, `lang_zh-TW` |
| options.cr | string | — | no | Restrict to country (two-letter code). Accepts Boolean operators |
| options.gl | string | — | no | Geolocation of end user (two-letter country code) |
| options.hl | string | — | no | Interface language code (e.g., `en`, `ja`, `de`) |
| options.safe | enum | `off` | no | Search safety: `active` (SafeSearch on) or `off` (SafeSearch off) |
| options.filter | boolean | true | no | Duplicate content filter on/off |
| options.dateRestrict | string | — | no | Format: `dN` (N days), `wN` (N weeks), `mN` (N months), `yN` (N years) |
| options.sort | string | — | no | Sort expression, e.g., `date` |
| options.fileType | string | — | no | Restrict to file extension (e.g., `pdf`, `doc`) |
| options.exactTerms | string | — | no | Phrase all results must contain |
| options.excludeTerms | string | — | no | Word or phrase that must not appear |
| options.orTerms | string | — | no | Additional terms — each result must match at least one |
| options.rights | string | — | no | License filter: `cc_publicdomain`, `cc_attribute`, `cc_sharealike`, `cc_noncommercial`, `cc_nonderived` and combinations |
| options.imgSize | enum | — | no | Image search only: `huge`, `icon`, `large`, `medium`, `small`, `xlarge`, `xxlarge` |
| options.imgType | enum | — | no | Image search only: `clipart`, `face`, `lineart`, `stock`, `photo`, `animated` |
| options.imgColorType | enum | — | no | Image search only: `color`, `gray`, `mono`, `trans` |
| options.imgDominantColor | enum | — | no | Image search only: `black`, `blue`, `brown`, `gray`, `green`, `orange`, `pink`, `purple`, `red`, `teal`, `white`, `yellow` |
| options.highRange | string | — | no | Ending value for numeric range search |
| options.lowRange | string | — | no | Starting value for numeric range search |
| options.hq | string | — | no | Appends query terms (logical AND with original query) |
| options.linkSite | string | — | no | All results must contain a link to this URL |
| options.c2coff | boolean | false | no | Disable Simplified/Traditional Chinese search |

## Runtime behavior

### Input

Each input item is processed independently. The node reads parameters from the configured node settings, with support for expression-based values in query, cx, and all options fields. Input item data (`$json`) is accessible in expressions but is not consumed as a source of structured parameters — this node does not extract fields from incoming items for matching or transformation.

### Output

Per input item, the node produces one output item containing the raw Google Custom Search API response envelope. The output JSON follows the [Search type](https://developers.google.com/custom-search/v1/reference/rest/v1/Search) shape:

```json
{
  "kind": "customsearch#search",
  "url": { "type": "application/json", "template": "..." },
  "queries": { "request": [...], "nextPage": [...] },
  "context": { "title": "..." },
  "searchInformation": {
    "searchTime": 0.123,
    "formattedSearchTime": "0.12",
    "totalResults": "12345",
    "formattedTotalResults": "12,345"
  },
  "items": [
    {
      "kind": "customsearch#result",
      "title": "...",
      "htmlTitle": "...",
      "link": "https://...",
      "displayLink": "example.com",
      "snippet": "...",
      "htmlSnippet": "...",
      "pagemap": { ... },
      "mime": "text/html",
      "fileFormat": "text/html"
    }
  ]
}
```

When `searchType` is `image`, each item additionally includes a `pagemap` with `cse_image` and `cse_thumbnail` entries containing image URLs and dimensions.

When `returnAll` is true, the node paginates through all available result pages (up to the Google-imposed maximum of 100 total results across pages) and merges all `items` arrays into a single output.

### Errors

- **Missing credential:** throws `NodeOperationError` with message about missing API key.
- **Invalid CX:** the API returns a 400-level error; the node should throw with the API error message.
- **Rate limiting / quota exhausted:** propagate the API's 403 / 429 error.
- **`start + num > 100`:** the API returns an error; the node should surface it as-is.
- **Network errors:** standard timeout / DNS / TLS errors propagate.
- `continueOnFail`: when enabled, failed items are returned as error output rather than interrupting execution.

### Expressions

All parameter fields accept expression strings (`=...` syntax), allowing dynamic values from upstream node output (`{{ $json["field"] }}`), workflow variables, or environment data.

### Pagination

The node supports two modes:
1. **Single page** (default): returns the first page of results (up to 10 items) as determined by `num` and `start`.
2. **Return All**: automatically follows `nextPage` links from the API response until all available results are collected or the `limit` is reached. Google imposes a hard cap of 100 results total. Each page request counts toward the API quota.

## Acceptance tests

### Test: basic web search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "cx": "017576662512468239146:omuauf_lfve",
  "query": "quantum computing",
  "options": {}
}
```

**Expect** output[0]:

- `json.kind` equals `"customsearch#search"`
- `json.items` is a non-empty array
- Each item in `json.items` has `kind`, `title`, `link`, `displayLink`, `snippet`
- `json.searchInformation.totalResults` is a string of digits
- `json.queries.request` contains at least one entry with the original query

### Test: image search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "cx": "017576662512468239146:omuauf_lfve",
  "query": "aurora borealis",
  "options": {
    "searchType": "image",
    "imgSize": "large",
    "safe": "active"
  }
}
```

**Expect** output[0]:

- `json.searchType` is `"image"`
- `json.items` is a non-empty array
- At least one item has `pagemap.cse_image` with a non-empty `src` entry
- No items contain explicit adult content indicators

### Test: pagination with returnAll

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "cx": "017576662512468239146:omuauf_lfve",
  "query": "machine learning",
  "returnAll": true,
  "limit": 25
}
```

**Expect** output[0]:

- `json.items.length` is at least 11 and at most 25 (multiple pages merged)
- `json.queries.nextPage` may be absent if all results collected

### Test: site-restricted search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "cx": "017576662512468239146:omuauf_lfve",
  "query": "api reference",
  "options": {
    "siteSearch": "developers.google.com",
    "siteSearchFilter": "i"
  }
}
```

**Expect** output[0]:

- Every item in `json.items` has `displayLink` containing `"developers.google.com"` or `"google.com"`

### Test: graceful error on invalid CX

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "cx": "invalid:cx",
  "query": "test"
}
```

**Expect:** The node throws a `NodeOperationError` with the API error message. No items are returned on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential type | inferred | Not listed in Google OAuth2 compat table; uses `googleApi` API-key credential |
| Exact parameter names and UI grouping | inferred | The Google API parameter names (`q`, `cx`, `num`, etc.) are documented publicly; the node's UI mapping to these is reconstructed |
| `returnAll` / `limit` behavior | inferred from n8n convention | Many n8n nodes follow this pattern; exact implementation depends on executor |
| Error shape | inferred | Standard n8n error propagation expected |
| Image search pagination detail | inferred | Max 100 results, same as web search; confirmed by API docs |
| Exact UI labels and section grouping | unknown | May differ from the flat parameter list above; not documented on docs.n8n.io |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleCustomSearch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
