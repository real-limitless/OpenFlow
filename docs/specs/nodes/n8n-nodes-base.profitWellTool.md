---
type: n8n-nodes-base.profitWellTool
displayName: ProfitWell Tool
category: Analytics
versions: [1]
priority: low
status: specced
---

# ProfitWell Tool

AI agent tool variant of the ProfitWell analytics node. Wraps the same Company and Metric operations as the base `profitWell` node but is accessible from the AI Agent's Tools panel. Supports `$fromAI()` dynamic parameter population for AI agents.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.profitwell.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/profitwell.md | Public docs only |
| https://profitwellapiv2.docs.apiary.io/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.profitWellTool`
- **Aliases:** (none standalone; the base `n8n-nodes-base.profitWell` node has `usableAsTool: true` and is exposed in the AI Agent tool panel under this type)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `profitWellApi` (API token via Authorization header)

## Parameters

The tool shares the same parameters as the base ProfitWell node. Parameters are identical in name, type, and constraints. All parameters accept `$fromAI()` expressions when populated by an AI agent.

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed options | metric | yes | — | Choices: `company`, `metric` |

### Operation: Company → Get Settings

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed options | getSetting | yes | resource = company | Action: Get settings for your company |

Calls `GET /v2/company/settings/`. Returns the company account settings object.

### Operation: Metric → Get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed options | get | yes | resource = metric | Action: Get a metric |
| type | fixed options | — | yes | resource = metric, operation = get | `daily` or `monthly`. Daily requires a month parameter |
| month | string (YYYY-MM) | — | yes (daily only) | type = daily | Current or previous month only |
| simple | boolean | true | no | resource = metric, operation = get | Return simplified response instead of raw API data |
| options | collection | {} | no | resource = metric, operation = get | See below |

### Options collection (Metric → Get)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| plan_id | string (dynamic options) | — | no | — | Filter by plan; loaded via `getPlanIds` loadOptionsMethod from `GET /v2/metrics/plans/` |
| dailyMetrics | multiOptions | [] | no | type = daily | Comma-separated metric trends for daily endpoint |
| monthlyMetrics | multiOptions | [] | no | type = monthly | Comma-separated metric trends for monthly endpoint |

Available daily metrics: `active_customers`, `churned_customers`, `churned_recurring_revenue`, `cumulative_net_new_mrr`, `cumulative_new_trialing_customers`, `downgraded_customers`, `downgraded_recurring_revenue`, `future_churn_mrr`, `new_customers`, `new_recurring_revenue`, `reactivated_customers`, `reactivated_recurring_revenue`, `recurring_revenue`, `upgraded_customers`, `upgraded_recurring_revenue`.

Available monthly metrics: `active_customers`, `active_trialing_customers`, `average_revenue_per_user`, `churned_customers`, `churned_customers_cancellations`, `churned_customers_delinquent`, `churned_recurring_revenue`, `churned_recurring_revenue_cancellations`, `churned_recurring_revenue_delinquent`, `churned_trialing_customers`, `converted_customers`, `converted_recurring_revenue`, `customers_churn_cancellations_rate`, `customers_churn_delinquent_rate`, `customers_churn_rate`, `customer_conversion_rate`, `customers_retention_rate`, `downgraded_customers`, `downgrade_rate`, `downgraded_recurring_revenue`, `existing_customers`, `existing_recurring_revenue`, `existing_trialing_customers`, `growth_rate`, `lifetime_value`, `new_customers`, `new_recurring_revenue`, `new_trialing_customers`, `plan_change_rate`, `plan_changed_recurring_revenue`, `reactivated_customers`, `reactivated_recurring_revenue`, `recurring_revenue`, `revenue_churn_cancellations_rate`, `revenue_churn_delinquent_rate`, `revenue_churn_rate`, `revenue_retention_rate`, `upgrade_rate`, `upgraded_customers`, `upgraded_recurring_revenue`.

## Runtime behavior

### Input

Items are consumed for credential resolution and expression context only. No per-item data is required. When called from an AI Agent, parameters may be dynamically populated by the LLM via `$fromAI()`.

### Output

#### Company → Get Settings

Output[0] contains one item with the company settings response body:

```json
{
  "id": "<company_id>",
  "name": "<company_name>",
  "timezone": "<IANA timezone>",
  "currency": "<ISO 4217 currency code>"
}
```

#### Metric → Get (Daily)

When `simple` is true, returns a simplified object with `data` mapping metric names to `{ date, value }` arrays:

```json
{
  "data": {
    "recurring_revenue": [
      { "date": "2024-01-01", "value": 55000.0 }
    ]
  }
}
```

When `simple` is false, returns the raw API response from `GET /v2/metrics/daily/`.

#### Metric → Get (Monthly)

Returns monthly aggregated metrics, either simplified (single-object structure with metric keys mapped to numeric values per month) or raw API response from `GET /v2/metrics/monthly/`.

### Errors

- Non-200 HTTP status propagates as a node error.
- `continueOnFail` returns the error as the output item.
- 400 indicates invalid month, unknown metric names, or bad parameters.
- 401 indicates a missing or invalid API token.

### Expressions

All parameters (`plan_id`, `month`, `dailyMetrics`, `monthlyMetrics`) accept expression strings. When used in an AI Agent, `$fromAI()` populates these dynamically.

## Acceptance tests

### Test: get company settings (via AI tool)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (populated by AI agent via `$fromAI()`):
```json
{
  "resource": "company",
  "operation": "getSetting"
}
```

**Expect** output[0] to contain exactly one item whose `json` has the keys `id`, `name`, `timezone`, `currency`.

### Test: get daily metrics for a specific month (all metrics)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters**:
```json
{
  "resource": "metric",
  "operation": "get",
  "type": "daily",
  "month": "2024-01"
}
```

**Expect** output[0] to contain exactly one item whose `json.data` is an object where each key is a metric name and each value is an array of `{ date, value }` objects.

### Test: get daily metrics filtered by plan and specific metrics

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters**:
```json
{
  "resource": "metric",
  "operation": "get",
  "type": "daily",
  "month": "2024-01",
  "options": {
    "plan_id": "plan_foo",
    "dailyMetrics": ["recurring_revenue", "new_customers"]
  }
}
```

**Expect** output[0] to contain exactly one item whose `json.data` has only the keys `recurring_revenue` and `new_customers`.

### Test: get monthly metrics

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters**:
```json
{
  "resource": "metric",
  "operation": "get",
  "type": "monthly"
}
```

**Expect** output[0] to contain exactly one item whose `json` contains monthly metric data.

### Test: invalid API token returns 401

**Given** a credential with an invalid token and any valid operation. **Expect** the node to throw an authentication error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| tool alias exists as `n8n-nodes-base.profitWellTool` | inferred | No dedicated docs page — confirmed via corpus; the base node has `usableAsTool: true`, making it available as a tool alias |
| Parameters identical to base node | inferred | Tool variant shares the base node's full parameter schema |
| `$fromAI()` support | documented | Per n8n tool conventions, all parameters accept `$fromAI()` dynamic population |
| Output shapes identical to base node | documented | Same API endpoints, same response processing |
| Monthly type parameter | inferred from corpus | Base spec only described daily; corpus reveals both daily and monthly types with separate metric option lists |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/profitWellTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
