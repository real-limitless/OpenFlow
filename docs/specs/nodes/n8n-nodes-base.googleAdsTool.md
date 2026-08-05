---
type: n8n-nodes-base.googleAdsTool
displayName: Google Ads
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Ads (AI Tool)

An AI agent tool variant of the Google Ads app node. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Exposes Campaign read operations (Get All, Get) against the Google Ads API. Supports manager-account (MCC) cross-client queries via `managerCustomerId` and `clientCustomerId`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleads.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/google-ads/api/docs/start | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleAdsTool`
- **Aliases:** `Google Ads`, `Ads`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleAdsOAuth2Api` (OAuth2 single-service) — OAuth only; no service account support

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| credential | credential | — | yes | Google Ads OAuth2 credential |

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `campaign` | yes | Only `campaign` |
| operation | options | `getAll` | yes | `getAll` or `get` |

### Cross-account fields (both operations)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| managerCustomerId | string | — | no | Manager (MCC) customer ID when querying across child accounts |
| clientCustomerId | string | — | no | Target client customer ID for the specific Google Ads account |

### Campaign → Get All

Retrieves all campaigns accessible to the authenticated Google Ads account.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | no | When false, `limit` controls max results |
| limit | number | 50 | no | Maximum results to return when `returnAll` is false |
| dateRange | options | — | no | Filter by predefined date range: `allTime`, `TODAY`, `YESTERDAY`, `LAST_7_DAYS`, `LAST_BUSINESS_WEEK`, `THIS_MONTH`, `LAST_MONTH`, `LAST_14_DAYS`, `LAST_30_DAYS` |
| campaignStatus | options | — | no | Filter by campaign status: `all`, `ENABLED`, `PAUSED`, `REMOVED` |

### Campaign → Get

Retrieves a single campaign by its resource name or ID.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| campaignId | string | — | yes | Google Ads campaign ID or resource name |

### Request options (both operations)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| proxy | string | — | no | HTTP proxy URL for the API request |
| timeout | number | — | no | Request timeout in milliseconds |
| allowUnauthorizedCerts | boolean | false | no | Skip TLS certificate verification |

## Runtime behavior

### Input

The node passes through all input items unchanged except as modified by the chosen operation. Input item data may be used to populate parameters via expressions or `$fromAI()`.

### Campaign → Get All

Calls the Google Ads API to list campaigns. The Google Ads API uses GAQL (Google Ads Query Language) for querying; the node translates the get-all request into a `SELECT` query against the `campaign` resource. When `managerCustomerId` is set, the query runs in the context of a manager (MCC) account and can target child accounts via `clientCustomerId`.

**Output shape** (per item):

```json
{
  "campaigns": [
    {
      "id": "1234567890",
      "name": "My Campaign",
      "status": "ENABLED",
      "campaignBudget": "customers/123/campaignBudgets/456",
      "campaignGroup": null,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "servingStatus": "SERVING",
      "advertisingChannelType": "SEARCH",
      "advertisingChannelSubType": "SEARCH_STANDARD"
    }
  ]
}
```

### Campaign → Get

Calls the Google Ads API to retrieve a single campaign by its numeric ID. The node constructs a GAQL query filtering on `campaign.id`.

**Output shape** (per item):

```json
{
  "campaign": {
    "id": "1234567890",
    "name": "My Campaign",
    "status": "ENABLED",
    "campaignBudget": "customers/123/campaignBudgets/456",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "servingStatus": "SERVING",
    "advertisingChannelType": "SEARCH",
    "advertisingChannelSubType": "SEARCH_STANDARD"
  }
}
```

### Errors

- Invalid or missing `campaignId` results in a Google Ads API error (campaign not found).
- OAuth token expiration causes a 401 Unauthorized; the system should refresh the token if a refresh token is available.
- Insufficient permissions (missing Google Ads scopes or developer token not approved) returns a 403 Forbidden.
- `continueOnFail`: when enabled, the node outputs an empty output array for the failed item instead of throwing; otherwise the workflow execution stops with an error.

### Expressions

All string and number parameters accept expression strings.

## Acceptance tests

### Test: campaign — get all

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] contains a `campaigns` array with at most 10 items, each having `id`, `name`, and `status` fields.

### Test: campaign — get by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "get",
  "campaignId": "1234567890"
}
```

**Expect** output[0] contains a `campaign` object with `id` = `"1234567890"` and a `name` string.

### Test: campaign — get with date range filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "dateRange": "LAST_30_DAYS",
  "campaignStatus": "ENABLED"
}
```

**Expect** output[0] contains a `campaigns` array of only enabled campaigns from the last 30 days.

### Test: campaign — cross-account query via manager

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "managerCustomerId": "1234567890",
  "clientCustomerId": "9876543210"
}
```

**Expect** output[0] contains campaigns from the client account queried through the MCC.

### Test: campaign — missing ID on get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "get",
  "campaignId": ""
}
```

**Expect** execution fails with an error indicating that the campaign ID is required.

### Test: AI tool — $fromAI() parameter resolution

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "limit": "={{ $fromAI('limit', 'Maximum number of campaigns to return') }}"
}
```

**Expect** The AI agent can supply a value for `limit`. The node sends a valid API request when the parameter resolves to a concrete numeric value.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | Documented | Zod schema confirms resource defaults, operation defaults, and optional fields |
| Additional options (dateRange, campaignStatus) | Documented | Corpus schema shows exact option enums for date range presets and campaign status |
| Cross-account (managerCustomerId, clientCustomerId) | Documented | Both fields present in both operation schemas |
| Request options (proxy, timeout, allowUnauthorizedCerts) | Documented | Corpus schema confirms these are available on both operations |
| Exact GAQL query construction | Inferred | Node likely constructs `SELECT campaign.* FROM campaign` with optional `WHERE campaign.id = X`, status/date filters, and `LIMIT` clauses |
| AI tool variant behavior | Documented | n8n docs confirm the node "can be used as an AI tool" with `$fromAI()` support |
| Credential type | Documented | Google Ads requires OAuth2; listed as OAuth-only (no service account) |
| Available campaign fields in output | Inferred | Campaign fields documented in Google Ads API reference; node returns a standard subset |

## OpenFlow mapping

- **Definition group:** `ai-tools`
- **Executor file:** `src/lib/engine/executors/googleAdsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
