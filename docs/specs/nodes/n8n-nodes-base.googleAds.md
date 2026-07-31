---
type: n8n-nodes-base.googleAds
displayName: Google Ads
category: Analytics
versions: [1]
priority: medium
status: specced
---

# Google Ads

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleads/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://developers.google.com/google-ads/api/docs/start | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleAds`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleAdsOAuth2Api` (OAuth2 only; Service Account not supported)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `campaign` | yes | — | Fixed to `campaign` (single resource) |
| operation | options | `getAll` | yes | show: resource=campaign | `getAll` or `get` |
| clientCustomerId | string | — | yes | show: operation in (getAll, get) | Google Ads client customer ID, hyphens stripped for API call |
| managerCustomerId | string | — | yes | show: operation in (getAll, get) | Login customer ID (manager account), sent as `login-customer-id` header |
| campaignId | string | — | yes | show: operation=get | Numeric campaign ID for single-campaign retrieval |
| additionalOptions.dateRange | options | `allTime` | no | show: operation in (getAll, get) | Options: `allTime`, `TODAY`, `YESTERDAY`, `LAST_7_DAYS`, `LAST_BUSINESS_WEEK`, `THIS_MONTH`, `LAST_MONTH`, `LAST_14_DAYS`, `LAST_30_DAYS`, `THIS_WEEK_SUN_TODAY`, `THIS_WEEK_MON_TODAY`, `LAST_WEEK_SUN_SAT`, `LAST_WEEK_MON_SUN`. Appended to GAQL as `segments.date DURING <range>` |
| additionalOptions.campaignStatus | options | `all` | no | show: operation in (getAll, get) | GAQL filter: `ENABLED`, `PAUSED`, `REMOVED` |

## Runtime behavior

### Input

Each input item is processed independently. The node makes a single GAQL search request per item via `POST /v20/customers/{customerId}/googleAds:search` to `https://googleads.googleapis.com`.

### Output

Output items contain the campaign data returned by the Google Ads API. Each campaign in the API response becomes one output item with the shape of the `googleAdsRow` resource (including `campaign`, `campaign_budget`, `metrics` fields as selected in the query). The node selects a fixed set of campaign fields: `campaign.id`, `campaign.name`, `campaign_budget.amount_micros`, `campaign_budget.period`, `campaign.status`, `campaign.optimization_score`, `campaign.advertising_channel_type`, `campaign.advertising_channel_sub_type`, `metrics.impressions`, `metrics.interactions`, `metrics.interaction_rate`, `metrics.average_cost`, `metrics.cost_micros`, `metrics.conversions`, `metrics.cost_per_conversion`, `metrics.conversions_from_interactions_rate`, `metrics.video_views`, `metrics.average_cpm`, `metrics.ctr`.

For `get` operation, the campaign is filtered by `campaign.id = <campaignId>` and expects a single result.

### Errors

The Google Ads API returns errors in the standard Google API error format. The node should surface these as thrown errors. If `continueOnFail` is set, the node should output an error item instead of throwing.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: get all campaigns

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "clientCustomerId": "123-456-7890",
  "managerCustomerId": "987-654-3210",
  "additionalOptions": {
    "dateRange": "LAST_30_DAYS",
    "campaignStatus": "ENABLED"
  }
}
```

**Expect** output[0] to contain one or more items, each with `campaign.id`, `campaign.name`, `campaign.status`, and `metrics.impressions` among the returned fields.

### Test: get single campaign

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "get",
  "clientCustomerId": "123-456-7890",
  "managerCustomerId": "987-654-3210",
  "campaignId": "123456789",
  "additionalOptions": {
    "dateRange": "allTime"
  }
}
```

**Expect** output[0] to contain exactly one item with the campaign data matching the requested ID.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "clientCustomerId": "",
  "managerCustomerId": "",
  "options": {
    "continueOnFail": true
  }
}
```

**Expect** output[0] to contain a single error item `[{ "json": { "error": "..." } }]` rather than a thrown exception.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs | Docs confirm Campaign resource with Get Many and Get operations |
| Credential type | Public docs + public descriptor metadata | `googleAdsOAuth2Api`, OAuth2 only, no Service Account |
| GAQL query fields | Inferred from public descriptor metadata | Fixed SELECT list of campaign + metrics fields |
| additionalOptions enums | Inferred from public descriptor metadata | dateRange and campaignStatus options confirmed |
| API version | Inferred from public descriptor metadata | v20 endpoint |
| Developer token | Inferred from public descriptor metadata | Sent as `developer-token` header from credential |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/google-ads.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only