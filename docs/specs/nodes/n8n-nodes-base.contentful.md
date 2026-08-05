---
type: n8n-nodes-base.contentful
displayName: Contentful
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Contentful

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.contentful.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/contentful.md | Public docs only |
| https://www.contentful.com/developers/docs/references/content-delivery-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.contentful`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `contentfulApi`

### Credential requirements

The credential holds:
- **Space ID** — the Contentful space identifier; used as a path segment in all API requests.
- **Content Delivery API Access Token** — delivery token for reading published content (CDA).
- **Content Preview API Access Token** — preview token for reading draft/unpublished content (CPA).

The node selects CDA or CPA based on the selected API (Delivery vs Preview) at runtime. Every API call is directed to `https://cdn.contentful.com` (CDA) or `https://preview.contentful.com` (CPA) using the space ID and the appropriate token.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `entry` | yes | — | One of: `entry`, `asset`, `contentType`, `locale`, `space` |
| operation | options | varies | yes | depends on resource | See Resources table below |
| environmentId | string | `master` | no | all resources except space | The Contentful environment ID |
| returnAll | boolean | false | no | operation = `getAll` | Fetch all matching items vs a single page |
| limit | number | 100 | no | `getAll` + `returnAll = false` | Max items per page (1–500) |
| entryId | string | — | yes (for entry→get) | resource=entry, operation=get | The entry sys.id |
| assetId | string | — | yes (for asset→get) | resource=asset, operation=get | The asset sys.id |
| contentTypeId | string | — | yes (for contentType→get) | resource=contentType, operation=get | The content type ID |
| additionalFields | collection | {} | no | varies | Resource-specific optional filters |

### Resource / operation matrix

| Resource | Operations |
|----------|------------|
| Entry | Get, Get Many |
| Asset | Get, Get Many |
| Content Type | Get |
| Locale | Get Many |
| Space | Get |

### Additional fields for Entry → Get Many and Asset → Get Many

| name | type | notes |
|------|------|-------|
| equal (filter string) | string | Exact match filter: `{attribute}={value}` (e.g. `fields.title=n8n`) |
| notEqual | string | Negated match: `{attribute}[ne]={value}` |
| include | string | Inclusion filter: `{attribute}[in]={value1},{value2}` |
| exclude | string | Exclusion filter: `{attribute}[nin]={value1},{value2}` |
| exist | string | Existence filter: `{attribute}[exists]=true\|false` |
| query | string | Full-text search (case-insensitive, min 2 characters) |
| order | string | Sort by sys or field property (e.g. `sys.createdAt`, `-fields.title`) |
| select | string | Field projection: comma-separated field paths |
| content_type | string | Filter entries by content type ID |
| rawData | boolean | Return the raw API response instead of parsed item list |

### Additional fields for Entry → Get and Content Type → Get

| name | type | notes |
|------|------|-------|
| rawData | boolean | Return the raw API response |

### Search parameters (generic)

A `search_parameters` fixed collection allows passing arbitrary URL query parameters as key-value pairs. This serves as an escape hatch for any Contentful API query parameter not covered by the named additional fields above.

## Runtime behavior

### Input

Each input item is processed independently. The node makes one API call per resource/operation combination against the Contentful CDA or CPA.

### Output

**Single-item operations** (Get, Space → Get) produce one output item per API response. The response body is placed on the item JSON. When `rawData` is false (default), list-operation (`getAll`) responses are flattened: each item in the API response's `items` array produces one output item. When `rawData` is true, the full API response object (including `items`, `includes`, `total`, `skip`, `limit`, `errors`) is placed on a single output item under the key `raw`.

### Errors

- A failed API request (network error, 4xx, 5xx) throws a `NodeApiError` and halts the branch unless `continueOnFail` is enabled on the node.
- If `rawData` is false and the API returns an `errors` array (unresolvable links), the node emits the items that were resolved without raising errors for unresolved references. The errors array is not forwarded to output items.

### Expressions

All string parameters (environmentId, entryId, assetId, contentTypeId, filter strings, search_parameters values, query, order, select) accept expressions. The resource and operation selectors also accept expressions.

## Acceptance tests

### Test: Get a single entry

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "entry",
  "operation": "get",
  "environmentId": "master",
  "entryId": "my-entry-id"
}
```

**Expect** output[0] to contain one item whose `.json` has a `sys.id` and a `fields` object matching the Contentful Entry shape.

### Test: Get Many entries with filters

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "entry",
  "operation": "getAll",
  "environmentId": "master",
  "returnAll": false,
  "limit": 10,
  "additionalFields": {
    "query": "n8n",
    "order": "sys.createdAt"
  }
}
```

**Expect** output[0] to contain up to 10 items, each with a `sys.id` and `fields` object. Items are ordered by `sys.createdAt` ascending.

### Test: Get all locales (no additional fields)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "locale",
  "operation": "getAll",
  "environmentId": "master",
  "returnAll": true
}
```

**Expect** output[0] to contain one item per locale, each with locale metadata (`name`, `code`, `default`, etc.).

### Test: Get Space (no parameters beyond resource/operation)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "space",
  "operation": "get"
}
```

**Expect** output[0] to contain one item whose `.json` has the space name and system properties.

### Test: Get Entry with rawData enabled

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "entry",
  "operation": "getAll",
  "environmentId": "master",
  "returnAll": false,
  "limit": 5,
  "additionalFields": {
    "rawData": true
  }
}
```

**Expect** output[0] to contain a single item with a `.json.raw` property containing the full API response envelope (`items`, `total`, `skip`, `limit`, `includes`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource list and operations | Public docs | Documented on n8n's Contentful node page |
| Credential shape | Public docs | Documented on n8n's Contentful credentials page |
| Parameter names and defaults | Inferred from corpus | Confirmed by public docs + n8n published JSON descriptor |
| Filter semantics (equal, include, exclude, exist, notEqual) | Inferred from corpus | These map to Contentful CDA query parameter patterns documented by Contentful |
| Raw data mode behavior | Inferred from corpus | Common pattern across n8n's app nodes |
| Contentful API endpoints | Public docs | CDA/CPA documented by Contentful |
| Error handling for unresolved links | Inferred from specification | Standard Contentful CDA behavior for unresolvable references |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/contentful.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
