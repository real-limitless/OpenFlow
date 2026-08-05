---
type: n8n-nodes-base.googleAnalyticsTool
displayName: Google Analytics
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Analytics (AI Tool)

An AI agent tool variant of the Google Analytics node. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Exposes Report (Get) and User Activity (Search) operations against the Google Analytics Data API and User Activity API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleanalytics.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/analytics/devguides/reporting/data/v1 | External API docs |
| https://developers.google.com/analytics/devguides/collection/ga4 | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleAnalyticsTool`
- **Aliases:** `GA`, `Analytics`, `Google Analytics`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleAnalyticsOAuth2Api` (OAuth2 single-service) — requires scopes for the Google Analytics Data API and User Activity API

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |
| credential | credential | — | yes | Google Analytics OAuth2 credential |

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `report` | yes | `report` or `userActivity` |

### Report → Get

Fetches a customized analytics report via the Google Analytics Data API (`properties.runReport`).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| propertyId | string | — | yes | Google Analytics 4 property ID (numeric); passed as path parameter to the Data API |
| dateRanges | array | — | yes | List of date range objects, each with `startDate` and `endDate` (string, format `YYYY-MM-DD`, `today`, `yesterday`, `NdaysAgo`) |
| metrics | array | — | yes | List of metric objects, each with `name` (string, e.g. `activeUsers`, `eventCount`, `sessions`) |
| dimensions | array | — | no | List of dimension objects, each with `name` (string, e.g. `country`, `date`, `eventName`, `pageTitle`) |
| dimensionFilter | FilterExpression | — | no | Optional Google Analytics Data API filter expression (AND/OR of string/numeric/between filters) |
| metricFilter | FilterExpression | — | no | Optional metric-level filter expression |
| orderBys | array | — | no | List of ordering specifications: `metric` (metric name + desc/asc) or `dimension` (dimension name + desc/asc) |
| limit | number | — | no | Maximum number of rows to return |
| offset | number | — | no | Starting row offset for pagination |
| keepEmptyRows | boolean | false | no | Whether to include rows with all metrics = 0 |
| returnPropertyQuota | boolean | false | no | Whether to return quota usage info in the response |

### User Activity → Search

Searches for user-level activity data. Makes a request to the Google Analytics User Activity API.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| propertyId | string | — | yes | Google Analytics 4 property ID (numeric) |
| userId | string | — | yes* | User identifier whose activity to retrieve |
| clientId | string | — | yes* | Client ID whose activity to retrieve |
| activityTypes | array | — | no | Filter by activity types (e.g. `PAGE_VIEW`, `EVENT`, `ECOMMERCE`, `GOAL`) |
| activityDateRange | object | — | no | Date range for activity search (`startDate`, `endDate`) |
| pageSize | number | — | no | Maximum number of activity records per page |
| pageToken | string | — | no | Token for paginated results |

## Runtime behavior

### Input

The node passes through all input items unchanged except as modified by the chosen operation. Input item data may be used to populate parameters via expressions or `$fromAI()`.

### Report → Get

Calls `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport` with the configured dimensions, metrics, date ranges, filters, and ordering.

**Output shape** (per item):

```json
{
  "report": {
    "rows": [
      {
        "dimensionValues": [{ "value": "United States" }],
        "metricValues": [{ "value": "1234" }]
      }
    ],
    "rowCount": 1,
    "metadata": { "dataLossFromOtherRow": false }
  }
}
```

The `dimensionHeaders` and `metricHeaders` arrays from the API response describe column names and types; dimension values appear in the same order as the corresponding headers.

### User Activity → Search

Calls the User Activity API to fetch activity records for a given user or client.

**Output shape** (per item):

```json
{
  "userActivity": {
    "activities": [
      {
        "activityType": "EVENT",
        "activityTimestamp": "2024-01-15T10:30:00Z",
        "activityName": "purchase",
        "event": { "eventName": "purchase", "eventParams": {} }
      }
    ],
    "nextPageToken": "..."
  }
}
```

### Errors

- Invalid or missing `propertyId` results in a 400 Bad Request from the Google Analytics API.
- OAuth token expiration causes a 401 Unauthorized; the system should refresh the token if a refresh token is available.
- Insufficient permissions (missing scopes or Analytics access) returns a 403 Forbidden.
- Invalid metric/dimension names return a 400 with validation details.
- `continueOnFail`: when enabled, the node outputs an empty output array for the failed item instead of throwing; otherwise the workflow execution stops with an error.

### Expressions

All string and number parameters accept expression strings. The `dateRanges`, `metrics`, `dimensions`, `orderBys`, `dimensionFilter`, and `metricFilter` parameters accept expression-returned arrays/objects.

## Acceptance tests

### Test: report — basic

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "propertyId": "123456789",
  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "today" }],
  "metrics": [{ "name": "activeUsers" }, { "name": "sessions" }],
  "dimensions": [{ "name": "country" }],
  "limit": 10
}
```

**Expect** output[0] contains a `report` object with `rows` (array), `rowCount`, and `metadata`. Each row has `dimensionValues` and `metricValues` arrays whose lengths match the requested dimensions and metrics.

### Test: report — with filter and ordering

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "propertyId": "123456789",
  "dateRanges": [{ "startDate": "2024-01-01", "endDate": "2024-01-31" }],
  "metrics": [{ "name": "eventCount" }],
  "dimensions": [{ "name": "eventName" }],
  "dimensionFilter": {
    "filter": {
      "fieldName": "eventName",
      "stringFilter": { "value": "purchase", "matchType": "EXACT" }
    }
  },
  "orderBys": [{ "metric": { "metricName": "eventCount", "desc": true } }],
  "limit": 5
}
```

**Expect** output[0] contains `report.rows` with at most 5 rows, sorted by `eventCount` descending. All rows have `eventName` = `"purchase"`.

### Test: user activity — search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "userActivity",
  "propertyId": "123456789",
  "userId": "user-abc-123",
  "activityTypes": ["EVENT"]
}
```

**Expect** output[0] contains a `userActivity` object with an `activities` array. Each activity has `activityType`, `activityTimestamp`, and an `event` or other activity-specific payload.

### Test: missing property ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "propertyId": "",
  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "today" }],
  "metrics": [{ "name": "activeUsers" }]
}
```

**Expect** execution fails with an error indicating that the property ID is required.

### Test: AI tool — $fromAI() parameter resolution

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "propertyId": "={{ $fromAI('propertyId', 'The Google Analytics 4 property ID') }}",
  "dateRanges": "={{ $fromAI('dateRanges', 'Date ranges for the report', 'json') }}",
  "metrics": "={{ $fromAI('metrics', 'Metrics for the report', 'json') }}",
  "dimensions": ["country"]
}
```

**Expect** The AI agent is able to supply values for `propertyId`, `dateRanges`, and `metrics`. The node sends a valid API request when all required parameters resolve to concrete values.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and structure | Inferred | Public n8n docs list Report → Get and User Activity → Search as operations; internal parameter schemas inferred from GA4 Data API contract (properties.runReport) |
| Exact User Activity API endpoint | Inferred | Public n8n docs confirm "User Activity → Search" operation; endpoint path inferred from Google Analytics User Activity API documentation |
| AI tool variant behavior | Documented | n8n docs confirm the node "can be used as an AI tool" with `$fromAI()` support |
| Credential type | Documented | `googleAnalyticsOAuth2Api` credential exists in node JSON descriptor; OAuth2 single-service docs confirmed |
| Metric/dimension enumeration | Inferred | The API dynamically returns available dimensions and metrics; the user specifies by name string — no static enum in the node |
| Pagination behavior | Inferred | Common practice — limit/offset for reports, pageToken/pageSize for user activity; confirmed by GA4 Data API pagination docs |

## OpenFlow mapping

- **Definition group:** `ai-tools`
- **Executor file:** `src/lib/engine/executors/googleAnalyticsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
