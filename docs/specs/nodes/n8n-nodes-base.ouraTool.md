---
type: n8n-nodes-base.oura
displayName: Oura
category: Productivity
versions: [1]
priority: low
status: missing
---

# Oura

## Sources

| URL | Source class |
|-----|---------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.oura/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/oura/ | Public docs only |
| https://cloud.ouraring.com/v2/docs | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.oura`
- **Aliases:** `n8n-nodes-base.ouraTool`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `ouraApi` — requires a personal access token from https://cloud.ouraring.com/personal-access-tokens, sent as a Bearer token in the `Authorization` header against `https://api.ouraring.com`

## Parameters

The node exposes two resource types — Profile and Summary — each with a single operation.

### Resource: Profile

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `profile`, `summary` | `profile` | yes | — | Top-level resource selector |
| operation | options: `get` | `get` | yes | `resource: profile` | Retrieves the authenticated user's personal information |

### Resource: Summary

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `profile`, `summary` | `profile` | yes | — | Top-level resource selector |
| operation | options: `getActivity`, `getReadiness`, `getSleep` | `getActivity` | yes | `resource: summary` | Retrieves the user's daily summary for the selected domain. The returned data covers the day indicated by the `day` field in the response body. |

No additional parameters or options collections are needed — the Oura V2 Personal Access Token authenticates all requests.

## Runtime behavior

### Input

The node passes input items through as the basis for expression evaluation. The Oura API call is made once per execution (not once per item). Input data is not directly sent to the API.

### Output

The response from the Oura V2 API is placed into the `json` property of each output item. The response shape for each operation:

- **Profile → Get:** Returns the user's personal info (`id`, `age`, `weight`, `height`, `biological_sex`, `email`).
- **Summary → Get Activity:** Returns daily activity summary including `score`, `active_calories`, `steps`, `total_calories`, `meters_to_target`, `equivalent_walking_distance`, `inactivity_alerts`, activity time breakdowns (sedentary/low/medium/high), MET data, `non_wear_time`, `resting_time`, `target_calories`, `target_meters`, `class_5_min`, `average_met_minutes`, `contributors`, `day`, `id`, `timestamp`.
- **Summary → Get Readiness:** Returns daily readiness summary including `score`, `temperature_deviation`, `contributors` (activity_balance, body_temperature, previous_night, recovery_index, resting_heart_rate), `day`, `id`, `timestamp`.
- **Summary → Get Sleep:** Returns daily sleep summary including `score`, `contributors` (deep_sleep, efficiency, latency, rem_sleep, restfulness, timing, total_sleep), `day`, `id`, `timestamp`.

All API responses are returned as-is from the Oura V2 API. The node does not transform or simplify the response.

### Errors

- HTTP errors from the Oura API (4xx, 5xx) are thrown as node errors.
- `continueOnFail` follows the standard n8n convention — when enabled, errored items are returned with an `error` property instead of halting execution.
- Invalid or missing Personal Access Token results in a 401 error from the Oura API.

### API endpoints used

All requests go to `https://api.ouraring.com/v2/usercollection/`:

| Operation | HTTP method | Path |
|-----------|-------------|------|
| Profile → Get | GET | `/v2/usercollection/personal_info` |
| Summary → Get Activity | GET | `/v2/usercollection/daily_activity` |
| Summary → Get Readiness | GET | `/v2/usercollection/daily_readiness` |
| Summary → Get Sleep | GET | `/v2/usercollection/daily_sleep` |

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: get profile

**Given** a valid Oura Personal Access Token credential.

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "get"
}
```

**Expect** output[0] to contain one item whose `json` property has the following shape:

```json
{
  "id": "string",
  "age": 0,
  "weight": 0.0,
  "height": 0.0,
  "biological_sex": "string",
  "email": "string"
}
```

### Test: get activity summary

**Parameters:**

```json
{
  "resource": "summary",
  "operation": "getActivity"
}
```

**Expect** output[0] to contain one item whose `json` property includes `id`, `day`, `score`, `steps`, `active_calories`, `total_calories`, and `contributors` (an object with `meet_daily_targets`, `move_every_hour`, `recovery_time`, `stay_active`, `training_frequency`, `training_volume` integer fields).

### Test: get readiness summary

**Parameters:**

```json
{
  "resource": "summary",
  "operation": "getReadiness"
}
```

**Expect** output[0] to contain one item whose `json` property includes `id`, `day`, `score`, `temperature_deviation`, and `contributors` (an object with `activity_balance`, `body_temperature`, `previous_night`, `recovery_index`, `resting_heart_rate` integer fields).

### Test: get sleep summary

**Parameters:**

```json
{
  "resource": "summary",
  "operation": "getSleep"
}
```

**Expect** output[0] to contain one item whose `json` property includes `id`, `day`, `score`, and `contributors` (an object with `deep_sleep`, `efficiency`, `latency`, `rem_sleep`, `restfulness`, `timing`, `total_sleep` integer fields).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation names | Public n8n docs + corpus type registry | Confirmed from n8n docs page and JSON node descriptor |
| Credential type | Public n8n docs | `ouraApi` with Personal Access Token via Bearer auth |
| API base URL | Public Oura docs | `https://api.ouraring.com/v2/usercollection/` per Oura API docs referenced in n8n credential page |
| Response shapes | Corpus schema JSON files | Schema files `profile/get.json`, `summary/getActivity.json`, `summary/getSleep.json`, `summary/getReadiness.json` describe response contract |
| Exact endpoint paths | Inferred from operation purpose + Oura API pattern | Follows Oura V2 collection API pattern (`/v2/usercollection/{endpoint}`). The node uses Oura V2 API but the exact paths are derived from schema naming. |
| Tool variant (ouraTool) | Inferred from Alias field in node.json | The JSON descriptor shows a single `n8n-nodes-base.oura` node type; the Tool variant is an alias — no separate `-Tool` descriptor exists |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Oura.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
