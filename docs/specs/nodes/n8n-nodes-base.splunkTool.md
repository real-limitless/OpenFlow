---
type: n8n-nodes-base.splunkTool
displayName: Splunk (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Splunk (AI Tool)

AI agent tool variant of the Splunk node. The base `n8n-nodes-base.splunk` node (v2) has `usableAsTool: true`, making it directly available as a tool within an AI Agent without requiring a separate tool-only type. Wraps Alert, Report, Search, and User resources against the Splunk Enterprise REST API. Supports `$fromAI()` dynamic parameter population for AI agents.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.splunk/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/splunk/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTprolog | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.splunk`
- **Aliases:** `Splunk`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `splunkApi` (base URL + auth token + optional allow-self-signed)

## Parameters

### Resource selection

The user selects one of four resources (Alert, Report, Search, User) which determines the available operations. All parameters mirror the full Splunk node; the tool variant adds AI-agent metadata via `$fromAI()`.

### Alert resource

| Operation | Key parameters |
|-----------|----------------|
| Get Fired Alerts | — (no additional parameters) |
| Get Metrics | — (no additional parameters) |

### Report resource

| Operation | Key parameters |
|-----------|----------------|
| Create From Search | `searchJobId` (resource locator: from list by ID), `name` (report name) |
| Delete | `reportId` (resource locator: from list by ID) |
| Get | `reportId` (resource locator: from list by ID) |
| Get Many | `returnAll` (boolean), `limit` (number, default 50); options: `add_orphan_field`, `listDefaultActionArgs` |

### Search resource

| Operation | Key parameters |
|-----------|----------------|
| Create | `search` (SPL query string, required, multi-line), `additionalFields`: `adhoc_search_level` (fast/smart/verbose), `auto_cancel`, `auto_finalize_ec`, `auto_pause`, `earliest_time`, `latest_time`, `earliest_index`, `latest_index`, `exec_mode` (blocking/normal/oneshot), `max_time`, `namespace`, `reduce_freq`, `remote_server_list`, `reuse_max_seconds_ago`, `rf`, `search_mode` (normal/realtime), `status_buckets`, `timeout`, `workload_pool`, `indexedRealtimeOffset` |
| Delete | `searchJobId` (resource locator) |
| Get | `searchJobId` (resource locator) |
| Get Many | `returnAll`, `limit` (default 50); sort options: `sort_dir` (asc/desc), `sort_key` (field name), `sort_mode` (auto/alpha/alpha_case/num) |
| Get Result | `searchJobId` (resource locator), `returnAll`, `limit` (default 50); filters: key-value match; options: `add_summary_to_metadata` |

### User resource

| Operation | Key parameters |
|-----------|----------------|
| Create | `name` (login name, required), `roles` (multi-select, from dynamic list, default `["user"]`), `password` (required); additional: `email`, `realname` |
| Delete | `userId` (resource locator: from list by ID) |
| Get | `userId` (resource locator) |
| Get Many | `returnAll`, `limit` (default 50) |
| Update | `userId` (resource locator); update fields: `email`, `realname`, `password`, `roles` |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- Resource locator parameters (search jobs, reports, users) offer dynamic list loading from the connected Splunk instance

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions.

### Output

**Output[0]** — one item per input item containing the Splunk API response:

- **Alert (Get Fired Alerts):** fired alerts report data
- **Alert (Get Metrics):** metrics data from the Splunk instance
- **Report (Create):** created report metadata including ID
- **Report (Delete/Get):** report object or confirmation
- **Report (Get Many):** array of saved search/report objects with ID, name, owner, permissions
- **Search (Create):** search job object with `sid` (search ID), `dispatchState`, `eventCount`, `resultCount`
- **Search (Delete):** search job deletion confirmation
- **Search (Get):** search job object with status, progress, and result-count metadata
- **Search (Get Many):** array of search job objects with sort options applied
- **Search (Get Result):** array of result rows as key-value paired objects; optionally includes field summary statistics in metadata
- **User (Create/Update):** user object with `id`, `name`, `roles`, `realname`, `email`
- **User (Get):** user object
- **User (Get Many):** paginated array of user objects
- **User (Delete):** user deletion confirmation

### Errors

- Splunk API errors (authentication, permissions, not-found, invalid SPL, server errors) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Missing required parameters (search query, user name, password) throw before API calls
- Splunk REST API returns structured error responses with status codes and messages

### Expressions

All string/number/boolean/enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource/operation selectors are typically static.

## Acceptance tests

### Test: Create a search job

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "search",
  "operation": "create",
  "search": "search index=_internal | stats count by source",
  "additionalFields": {
    "exec_mode": "blocking",
    "max_time": 60
  }
}
```

**Expect** output[0].json to contain `sid` (non-empty search ID string), `dispatchState` of `DONE` or `RUNNING`, and `eventCount`.

### Test: Get search results

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "search",
  "operation": "getResult",
  "searchJobId": { "mode": "id", "value": "1718944376.178" },
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain an array of up to 10 result objects, each with key-value field pairs from the search results.

### Test: Create and get a user

**Given** input items:
```json
[{ "json": {} }, { "json": {} }]
```

**Parameters** (item 0):
```json
{
  "resource": "user",
  "operation": "create",
  "name": "testuser",
  "password": "changeme123",
  "roles": ["user"],
  "additionalFields": {
    "email": "test@example.com"
  }
}
```

**Expect** output[0].json to contain `name` equal to `testuser` and `roles` containing `user`.

**Parameters** (item 1):
```json
{
  "resource": "user",
  "operation": "get",
  "userId": { "mode": "id", "value": "testuser" }
}
```

**Expect** output[1].json to contain `name` equal to `testuser`.

### Test: Get fired alerts report

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "alert",
  "operation": "getReport"
}
```

**Expect** output[0].json to contain an object or array representing fired alerts data from the Splunk instance.

### Test: Create report from search

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "report",
  "operation": "create",
  "searchJobId": { "mode": "id", "value": "1718944376.178" },
  "name": "Test Report"
}
```

**Expect** output[0].json to contain `name` equal to `"Test Report"` and a non-empty ID.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | documented | Public docs list Alert (getReport/getMetrics), Report (create/delete/get/getAll), Search (create/delete/get/getAll/getResult), User (create/delete/get/getAll/update) |
| v2 vs v1 parameter differences | inferred | v2 consolidates search/searchResult into single Search resource with getResult operation; v1 separates searchJob/searchResult |
| Exact Splunk REST API endpoints | inferred | Calls are made against the Splunk Enterprise REST API at `{baseUrl}/services/...` |
| Dynamic list loading methods | inferred | Resource locators use searchListMethod/searchReports/searchUsers for dropdown population |
| `usableAsTool` flag | confirmed from corpus | v2 node descriptor has `"usableAsTool":true` — no separate splunkTool type exists |
| Credential type | documented | `splunkApi` with base URL + auth token + allow-self-signed |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.splunkTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
