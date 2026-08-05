---
type: n8n-nodes-base.uptimeRobot
displayName: UptimeRobot
category: Development
versions: [1]
priority: medium
status: specced
---

# UptimeRobot

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uptimerobot/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/uptimerobot/ | Public docs only |
| https://uptimerobot.com/api/legacy/ | Public docs only |
| https://uptimerobot.com/api/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.uptimeRobot`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `uptimeRobotApi` (API key)

## Parameters

The node exposes operations grouped by resource (Account, Alert Contact, Maintenance Window, Monitor, Public Status Page). Resource and operation are selected first, then operation-specific parameters appear.

### Resource: Account

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Resource | fixedString | Account | yes | |
| Operation | fixedString | Get | yes | Returns account details (email, monitor limits, up/down/paused counts) |

### Resource: Alert Contact

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Resource | fixedString | Alert Contact | yes | |
| Operation | options | (none) | yes | Create, Delete, Get, Get All, Update |
| ID | string | — | depends | Required for Delete, Get, Update (the alert contact's numeric ID) |
| Alert Contact Type | options | — | depends | Required for Create: SMS (1), Email (2), Twitter DM (3), Webhook (4), Pushbullet (5), Zapier (6), Slack (7), Telegram (8), Pushover (9), Line Notify (11), Splunk (13), Google Chat (15), Microsoft Teams (16) |
| Alert Contact Value | string | — | depends | Required for Create: the destination address (email, phone, webhook URL, etc.) |
| Status | options | — | depends | For Update / filter: active (1), paused (2) |
| Update fields | collection | — | no | For Update: Change status, value, or alert contact type from current values |

### Resource: Maintenance Window

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Resource | fixedString | Maintenance Window | yes | |
| Operation | options | (none) | yes | Create, Delete, Get, Get All, Update |
| ID | string | — | depends | Required for Delete, Get, Update |
| Type | options | — | depends | Required for Create: Once (1), Daily (2), Weekly (3), Monthly (4) |
| Start Time | dateTime | — | depends | Required for Create: scheduled start as a Unix timestamp or date-time value |
| Duration | number | — | depends | Required for Create: duration in minutes |
| Value | string | — | no | For weekly windows: day of week; for monthly: day of month |
| Status | options | — | no | For Update / filter: active (1), paused (2) |
| Update fields | collection | — | no | For Update: modify individual fields of an existing maintenance window |

### Resource: Monitor

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Resource | fixedString | Monitor | yes | |
| Operation | options | (none) | yes | Create, Delete, Get, Get All, Reset, Update |
| ID | string | — | depends | Required for Delete, Get, Reset, Update |
| Friendly Name | string | — | depends | Required for Create; human-readable label |
| URL | string | — | depends | Required for Create (except Heartbeat type); target to monitor |
| Monitor Type | options | HTTP (1) | depends | Required for Create: HTTP(s) (1), Keyword (2), Ping (3), Port (4), Heartbeat (99), SSL (5), Domain Expiry (6) |
| Sub Type | options | — | no | Required when type=Port: HTTP (1), HTTPS (2), FTP (3), SMTP (4), POP3 (5), IMAP (6), Custom Port (7) |
| Port | number | — | no | Required when Sub Type = Custom Port |
| Keyword Type | options | — | no | Required when type=Keyword: Exists (1), Not Exists (2) |
| Keyword Case Type | options | — | no | Case-sensitive (1) or case-insensitive (2); keyword matching |
| Keyword Value | string | — | no | The string to search for on the page |
| Interval | options | 300 | no | Monitoring frequency in seconds (60, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400) |
| HTTP Method | options | GET | no | GET (1), POST (2), PUT (3), PATCH (4), DELETE (5), HEAD (6), OPTIONS (7) |
| HTTP Auth Type | options | — | no | Basic HTTP authentication (HTTP Basic Auth / Digest Auth) |
| HTTP Username | string | — | no | Username for HTTP auth |
| HTTP Password | string | — | no | Password for HTTP auth |
| Custom HTTP Headers | collection | — | no | Key-value pairs to include as HTTP headers |
| Custom HTTP Statuses | string | — | no | Comma-separated list of HTTP statuses (e.g. 200,201,301) to treat as up |
| Alert Contact GUIDs | string | — | no | Colon-separated list of alert-contact-to-notification-type (e.g. `3485_0-3486_5`) for the monitor |
| Status | options | — | no | For Update / filter: paused (0), not checked (1), up (2), seems down (8), down (9) |

**Get All filter parameters** (Monitor resource, Get All operation):

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Monitor IDs | string | — | no | Dash-separated list of IDs to filter by |
| Types | string | — | no | Dash-separated list of type codes to filter by |
| Statuses | string | — | no | Dash-separated list of status codes to filter by |
| Custom Uptime Ratios | string | — | no | Days to compute uptime ratio for (e.g. 7-30-45) |
| Offset | number | 0 | no | Pagination offset |
| Limit | number | 50 | no | Max records per page (max 50) |
| Search | string | — | no | Keyword search within url and friendly_name |
| Include Logs | boolean | false | no | Include alert logs per monitor |
| Include Response Times | boolean | false | no | Include response-time data |
| Include Alert Contacts | boolean | false | no | Include alert-contact assignments |
| Include Maintenance Windows | boolean | false | no | Include maintenance window associations |
| Include SSL Info | boolean | false | no | Include SSL certificate details |

### Resource: Public Status Page

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Resource | fixedString | Public Status Page | yes | |
| Operation | options | (none) | yes | Create, Delete, Get, Get All |
| ID | string | — | depends | Required for Delete, Get |
| Friendly Name | string | — | depends | Required for Create |
| Status Page URL | string | — | depends | Required for Create: the desired subdomain or custom domain |
| Monitor IDs | string | — | no | Comma-separated list of monitor IDs to include on the page |
| Password | string | — | no | Optional password to protect the status page |
| Sort | options | — | no | Default ordering of monitors on the page |
| Custom CSS | string | — | no | Optional custom CSS |
| Status | options | — | no | Active (1), paused (2) |

## Runtime behavior

### Input

Each input item is processed independently. For Create operations, one API entity is created per item when batching is enabled, or a single entity is created from the first item's parameters. For Get All / List operations, the fetched collection is mapped to output items (one item per entity). For Delete / Update / Get, the operation is performed per input item using the specified ID.

### Output

Each item in the output array represents the result of one API call. On success:
- **Create / Update** operations return the created or modified entity including its API-assigned identifier.
- **Get** returns the requested entity.
- **Get All** returns one output item per entity in the collection.
- **Delete** returns a confirmation object with the deleted entity's ID.
- **Reset** returns confirmation that the monitor's uptime/status counters have been reset.

The top-level API response envelope (`stat`, `pagination`) is stripped; only the entity data is passed through.

### Errors

Standard UptimeRobot API errors (invalid API key, daily limit, rate limit, invalid parameters) result in the node throwing. The node respects `continueOnFail`: if enabled, errored items produce an empty output item with the error attached to the `_error` property instead of failing the workflow.

### Expressions

All string, number, and boolean parameters accept expression strings.

## Acceptance tests

### Test: get all monitors

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Monitor",
  "operation": "Get All",
  "limit": 10
}
```

**Expect** output[0] to be an array of monitor objects where each object has at minimum `id`, `friendly_name`, `url`, `type`, `status`. Only the first 10 or fewer results are returned.

### Test: create an HTTP monitor

**Given** input items:
```json
[{ "json": { "siteUrl": "https://example.com" } }]
```

**Parameters:**
```json
{
  "resource": "Monitor",
  "operation": "Create",
  "friendlyName": "Example Site",
  "url": "={{ $json.siteUrl }}",
  "monitorType": 1,
  "interval": 300
}
```

**Expect** output[0] to contain a single object with a numeric `id` confirming the monitor was created.

### Test: get account details

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Account",
  "operation": "Get"
}
```

**Expect** output[0] to contain an account object with `email`, `monitor_limit`, `up_monitors`, `down_monitors`, `paused_monitors`.

### Test: delete an alert contact

**Given** input items:
```json
[{ "json": { "alertContactId": 12345 } }]
```

**Parameters:**
```json
{
  "resource": "Alert Contact",
  "operation": "Delete",
  "id": "={{ $json.alertContactId }}"
}
```

**Expect** output[0] to contain a confirmation object with `id` matching 12345.

### Test: create a public status page

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Public Status Page",
  "operation": "Create",
  "friendlyName": "My Status",
  "statusPageUrl": "mystatus"
}
```

**Expect** output[0] to contain a status page object with a numeric `id`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact UptimeRobot API v3 endpoints vs v2 | documented | The UptimeRobot v2 legacy API is fully documented. v3 uses the same method names and parameters but with a different base URL. The node likely abstracts this. |
| Parameter-level validation rules | inferred | Monitor type 1 requires URL, type 2 additionally requires keyword settings, type 4 requires port/subtype; these constraints come from the API spec. |
| Per-operation collection field names | inferred | The node likely uses collection parameters for optional fields (custom headers, update fields) consistent with other n8n API nodes. |
| Response shape mapping | inferred | The node likely unwraps the API `stat`/pagination envelope and passes entity data through, consistent with n8n API node conventions. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/uptimeRobot.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
