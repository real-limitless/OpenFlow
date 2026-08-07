---
type: n8n-nodes-base.profitWell
displayName: ProfitWell
category: Analytics
versions: [1]
priority: low
status: specced
---

# ProfitWell

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.profitwell.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/profitwell.md | Public docs only |
| https://profitwellapiv2.docs.apiary.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.profitWell`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `profitWellApi` (API token in Authorization header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | — | yes | — | Choice between `company` and `metric` |
| operation | fixed | — | yes | — | Depends on resource (see below) |

### Resource: Company

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed | — | yes | resource = company | Only operation: `getSettings` |

### Resource: Metric

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed | — | yes | resource = metric | Only operation: `daily` |
| planId | string (dynamic) | — | no | resource = metric, operation = daily | Optionally filter by plan; loads from `GET /v2/metrics/plans/` via loadOptions |
| month | string (date) | — | yes | resource = metric, operation = daily | Target month in YYYY-MM format; restricted to current or previous month |
| metrics | string | — | no | resource = metric, operation = daily | Comma-separated list of metric trend names to return (default: all) |

## Runtime behavior

### Input

Items are consumed only for credential resolution and expression context. No per-item data is required.

### Output

#### Company → Get settings

Output[0] contains one item per execution with shape:

```json
{
  "id": "<company_id>",
  "name": "<company_name>",
  "timezone": "<IANA timezone>",
  "currency": "<ISO 4217 currency code>"
}
```

#### Metric → Daily

Output[0] contains one item per execution. The `data` key maps metric trend names to an array of `{ date, value }` records, where date is `YYYY-MM-DD` and value is a number (or `null` for unavailable rates).

```json
{
  "data": {
    "recurring_revenue": [
      { "date": "2024-01-01", "value": 55000.0 },
      { "date": "2024-01-02", "value": 55200.0 }
    ]
  }
}
```

The wrapped API (`GET /v2/metrics/daily/`) returns the response body directly.

### Errors

- Non-200 HTTP status from the API propagates as a node error.
- If `continueOnFail` is enabled, the error is returned as the output item with the failed input and the error details attached under a standard `error` key.
- A 400 response indicates invalid month format, unknown metric names, or unknown query parameters.
- A 401 response indicates a missing or invalid API token.

### Expressions

All user-facing parameters (`planId`, `month`, `metrics`) accept expression strings.

## Acceptance tests

### Test: get company settings

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "getSettings"
}
```

**Expect** output[0] to contain exactly one item whose `json` has the keys `id`, `name`, `timezone`, `currency`.

### Test: get daily metrics for a specific month (all metrics)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "metric",
  "operation": "daily",
  "month": "2024-01"
}
```

**Expect** output[0] to contain exactly one item whose `json.data` is an object where each key is a metric name and each value is an array of `{ date, value }` objects.

### Test: get daily metrics filtered by plan and specific metrics

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "metric",
  "operation": "daily",
  "month": "2024-01",
  "planId": "plan_foo",
  "metrics": "recurring_revenue,new_customers"
}
```

**Expect** output[0] to contain exactly one item whose `json.data` has only the keys `recurring_revenue` and `new_customers`.

### Test: unknown metric name returns 400

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "metric",
  "operation": "daily",
  "month": "2024-01",
  "metrics": "nonexistent_metric"
}
```

**Expect** the node to throw an error (or produce an error item under `continueOnFail`).

### Test: invalid API token returns 401

**Given** a credential with an invalid token and any valid operation. **Expect** the node to throw an authentication error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| node structure (resources × operations) | documented | n8n public docs confirm Company (getSettings) and Metric (daily) |
| credential type | documented | profitWellApi, API token via Authorization header |
| daily metrics parameters | documented | month, planId, metrics — all confirmed in ProfitWell API v2 docs |
| planId dynamic loading | inferred from corpus | Type signature shows `getPlanIds` loadOptions; confirmed by `GET /v2/metrics/plans/` in ProfitWell API docs |
| monthly metrics endpoint used | inferred | n8n docs say "current month or last" for daily; monthly endpoint (`/v2/metrics/monthly/`) exists in API but n8n docs only describe daily breakdown |
| output shape exactly mirrors API | documented | API v2 response shown in Apiary docs for /v2/metrics/daily/ and /v2/company/settings/ |
| API base URL | documented | https://api.profitwell.com/ |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/profitWell.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
