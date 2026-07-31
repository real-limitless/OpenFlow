---
type: n8n-nodes-base.googleAnalytics
displayName: Google Analytics
category: Analytics
versions: [1, 2]
priority: medium
status: specced
---

# Google Analytics

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleanalytics/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleAnalytics`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleAnalyticsOAuth2Api` (extends Google OAuth2 single-service credential)

## Parameters

This is a **versioned node** with two discrete versions (V1, V2). V2 adds GA4 property support alongside the existing Universal Analytics (UA) reporting path. The node exposes two resources: **Report** and **User Activity**.

### Version model

| Version | Property types | Key differences |
|---------|----------------|-----------------|
| V1 | Universal Analytics only | View-based (viewId); legacy `getViews`/`getDimensions` loadOptions |
| V2 | GA4 + Universal Analytics | `propertyType` selector (ga4/universal); GA4 uses `propertyId` resourceLocator; UA uses `viewId` resourceLocator; GA4 filter expressions via GA4 Data API |

### Resource: Report — Operation: Get

**Property type GA4** (V2 only):

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| propertyType | options | `ga4` | yes | `ga4` or `universal`; determines which sub-parameters are shown |
| propertyId | resourceLocator | — | yes | Google Analytics 4 Property; list/URL/ID modes; list mode calls `searchProperties` |
| dateRange | options | `last7days` | yes | `today`, `yesterday`, `last7days`, `last30days`, `lastCalendarWeek`, `lastCalendarMonth`, `custom` |
| startDate | dateTime | 7 days ago | only if custom | start of custom date range |
| endDate | dateTime | today | only if custom | end of custom date range |
| metricsGA4 | fixedCollection | `[{totalUsers}]` | no | multi-value; each entry selects a GA4 metric (predefined list or custom expression) |
| dimensionsGA4 | fixedCollection | `[{date}]` | no | multi-value; each entry selects a GA4 dimension (predefined list or custom) |
| returnAll | boolean | false | no | paginate all results vs limit |
| limit | number | 50 | only if !returnAll | max 1000 |
| simple | boolean | true | no | simplified output vs raw API response |
| additionalFields | collection | {} | no | currencyCode, dimensionFilters, metricAggregations, metricsFilter, keepEmptyRows, orderBy, returnPropertyQuota |

**Property type Universal** (V1 + V2):

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| propertyType | options | — | yes | `universal` (V1 has no propertyType; V2 shows it) |
| viewId | resourceLocator | — | yes | Universal Analytics View; list/URL/ID modes; list mode calls `searchViews` |
| dateRange | options | `last7days` | yes | same options as GA4 |
| startDate | dateTime | — | only if custom | — |
| endDate | dateTime | — | only if custom | — |
| metricsUA | fixedCollection | `[{ga:users}]` | no | multi-value; predefined list of UA metrics (ga:*) or custom expression |
| dimensionsUA | fixedCollection | `[{ga:date}]` | no | multi-value; predefined list of UA dimensions (ga:*) or custom |
| returnAll | boolean | false | no | — |
| limit | number | 50 | only if !returnAll | max 1000 |
| simple | boolean | true | no | simplified output vs raw API response |
| additionalFields | collection | {} | no | dimensionFilters, hideTotals, hideValueRanges, includeEmptyRows, useResourceQuotas |

### Resource: User Activity — Operation: Search

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| viewId | options | — | yes | loaded via `getViews` loadOptions |
| userId | string | — | yes | user ID to search |
| returnAll | boolean | false | no | — |
| limit | number | 100 | only if !returnAll | max 500 |
| additionalFields | collection | {} | no | activityTypes (multiOptions: ECOMMERCE, EVENT, GOAL, PAGEVIEW, SCREENVIEW) |

## Runtime behavior

### Input

Each input item is processed independently. The node executes one Google Analytics API request per item. Parameters that accept expressions are evaluated per-item.

### Output

Each input item produces one output item. The output shape depends on the `simple` flag:

- **Simple mode (default):** Returns a flattened array of data rows. Each row object contains dimension values as keys and metric values as values. For GA4, the simplification collapses the nested `dimensionValues`/`metricValues` arrays into flat key-value pairs.
- **Raw mode:** Returns the full API response body. For UA Report, the response follows the `reports.batchGet` shape with `reports[].data.rows[].dimensions[]/metrics[]`. For GA4, the response follows the `runReport` shape with `dimensionHeaders[]/metricHeaders[]/rows[]`.

### API endpoints

| Operation | Version | API endpoint |
|-----------|---------|-------------|
| Report (GA4) | V2 | `POST /v1beta/properties/{propertyId}:runReport` |
| Report (UA) | V1, V2 | `POST /v4/reports:batchGet` |
| User Activity | V1, V2 | `POST /v4/userActivity:search` |

### Errors

- API errors (invalid credentials, quota exceeded, invalid parameters) are thrown as node errors.
- If `continueOnFail` is enabled, the node returns an error item instead of throwing.
- Missing required parameters (viewId, propertyId, userId) produce a parameter validation error in the UI.

### Expressions

All string, number, and boolean parameters accept expression strings. Loaded options (dimensions, metrics, views, properties) also accept expressions for custom values not in the dropdown.

## Acceptance tests

### Test: UA report get with simple output

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "report",
  "operation": "get",
  "propertyType": "universal",
  "viewId": { "mode": "id", "value": "12345678" },
  "dateRange": "last7days",
  "metricsUA": { "metricValues": [{ "listName": "ga:users" }] },
  "dimensionsUA": { "dimensionValues": [{ "listName": "ga:date" }] },
  "returnAll": false,
  "limit": 10,
  "simple": true
}
```

**Expect** output[0] to contain a `json` array of objects with flat key-value pairs (e.g. `{ "date": "20260724", "ga:users": 42 }`).

### Test: GA4 report get with custom date range

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "report",
  "operation": "get",
  "propertyType": "ga4",
  "propertyId": { "mode": "id", "value": "123456" },
  "dateRange": "custom",
  "startDate": "2026-07-01T00:00:00Z",
  "endDate": "2026-07-07T00:00:00Z",
  "metricsGA4": { "metricValues": [{ "listName": "totalUsers" }, { "listName": "sessions" }] },
  "dimensionsGA4": { "dimensionValues": [{ "listName": "date" }, { "listName": "country" }] },
  "returnAll": false,
  "limit": 5,
  "simple": true
}
```

**Expect** output[0] to contain a `json` array of objects with `date`, `country`, `totalUsers`, `sessions` keys.

### Test: User activity search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "userActivity",
  "operation": "search",
  "viewId": "12345678",
  "userId": "user_abc_123",
  "returnAll": false,
  "limit": 50,
  "additionalFields": { "activityTypes": ["PAGEVIEW", "EVENT"] }
}
```

**Expect** output[0] to contain a `json` array of session objects, each with activity data.

### Test: GA4 report with additional fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "report",
  "operation": "get",
  "propertyType": "ga4",
  "propertyId": { "mode": "id", "value": "123456" },
  "dateRange": "last30days",
  "metricsGA4": { "metricValues": [{ "listName": "eventCount" }] },
  "dimensionsGA4": { "dimensionValues": [{ "listName": "deviceCategory" }] },
  "returnAll": true,
  "simple": false,
  "additionalFields": {
    "keepEmptyRows": true,
    "metricAggregations": ["TOTAL"]
  }
}
```

**Expect** output[0] to contain a `json` array of raw GA4 API response rows with `dimensionValues` and `metricValues` arrays plus `totals` array.

### Test: V1 node compatibility (UA report)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters** (V1 node version — no propertyType, uses viewId as string):
```json
{
  "resource": "report",
  "operation": "get",
  "viewId": "12345678",
  "dateRange": "yesterday",
  "metricsUA": { "metricValues": [{ "listName": "ga:sessions" }] },
  "dimensionsUA": { "dimensionValues": [{ "listName": "ga:sourceMedium" }] },
  "returnAll": false,
  "limit": 25,
  "simple": true
}
```

**Expect** output[0] to contain a `json` array of simplified rows with `ga:sourceMedium` and `ga:sessions` keys.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node version model | Documented (V1/V2) | Versioned node type with V1 (legacy UA) and V2 (GA4+UA) |
| Resource/operation structure | Public docs + descriptor metadata | 2 resources, 2 report get variants + 1 user activity search |
| GA4 report parameters | Descriptor metadata | propertyId, metricsGA4, dimensionsGA4, filters, orderBy, metricAggregations |
| UA report parameters | Public docs + descriptor metadata | viewId, metricsUA, dimensionsUA, dimensionFilters, hideTotals, hideValueRanges, includeEmptyRows |
| User activity parameters | Descriptor metadata | viewId, userId, activityTypes |
| Credential type | Public docs + descriptor metadata | googleAnalyticsOAuth2Api extends Google OAuth2 single-service |
| Simplify output shape | Descriptor metadata | Simplified output collapses nested dimension/metric arrays into flat key-value pairs |
| GA4 filter expression details | Descriptor metadata | String filter, in-list filter, numeric filter, and between filter types with andGroup/orGroup |
| Icon/displayName | Inferred | Standard Google Analytics icon; display name "Google Analytics" |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/google-analytics.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only