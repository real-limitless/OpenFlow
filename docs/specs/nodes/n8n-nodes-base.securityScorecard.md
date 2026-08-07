---
type: n8n-nodes-base.securityScorecard
displayName: SecurityScorecard
category: Analytics
versions: [1]
priority: medium
status: specced
---

# SecurityScorecard

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.securityscorecard/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/securityscorecard/ | Public docs only |
| https://securityscorecard.readme.io/reference/introduction | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.securityScorecard`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (except Report Download which writes binary output back to the input item)
- **Credentials:** `securityScorecardApi` (API key)

### Credential fields

| name | type | required | notes |
|------|------|----------|-------|
| apiKey | string | yes | Bearer token sent as `Authorization: Token {apiKey}` header against `https://api.securityscorecard.io/` |

## Parameters

The node exposes a **Resource** selector (6 options) and an **Operation** selector per resource.

| Resource | Operations |
|----------|-----------|
| Company | Get Information and Scorecard (`getScorecard`), Get Factor Scores (`getFactor`), Get Historical Factor Scores (`getFactorHistorical`), Get Historical Scores (`getHistoricalScore`), Get Score Plan (`getScorePlan`) |
| Industry | Get Score (`getScore`), Get Factor Scores (`getFactor`), Get Historical Factor Scores (`getFactorHistorical`) |
| Invite | Create (`create`) |
| Portfolio | Create (`create`), Delete (`delete`), Get Many (`getAll`), Update (`update`) |
| Portfolio Company | Add (`add`), Get Many (`getAll`), Remove (`remove`) |
| Report | Generate (`generate`), Download (`download`), Get Many (`getAll`) |

### Company

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| scorecardIdentifier | string | yes | all company operations | Primary identifier, e.g. domain |
| score | number | yes | getScorePlan | Target score for improvement plan |
| returnAll | boolean | no | getFactor, getFactorHistorical, getHistoricalScore, getScorePlan | Pagination toggle |
| limit | number | no | same as returnAll (when returnAll=false) | Max results (1-100, default 100) |
| simple | boolean | no | getFactorHistorical, getHistoricalScore | Flatten factor score arrays into `{date, factorName: score}` objects |
| filters | collection | no | getFactor | severity (string), severity_in (comma-separated string) |
| options | collection | no | getFactorHistorical, getHistoricalScore | date_from (dateTime), date_to (dateTime), timing (daily/weekly/monthly, default daily) |

### Industry

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| industry | options | yes | all | Enum: food, healthcare, manofacturing, retail, technology |
| returnAll | boolean | no | getFactor, getFactorHistorical | Pagination toggle |
| limit | number | no | same as returnAll (when false) | Max results (1-100, default 100) |
| simple | boolean | no | getFactor, getFactorHistorical | Flatten factor score arrays |
| options | collection | no | getFactorHistorical | from (dateTime), to (dateTime) |

### Invite

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| email | string | yes | create | Invitee email |
| firstName | string | yes | create | |
| lastName | string | yes | create | |
| message | string | yes | create | Invitation message |
| additionalFields | collection | no | create | days_to_resolve_issue (number), domain (string), grade_to_maintain (string), is_organization_point_of_contact (boolean), issue_desc (string), issue_title (string), issue_type (string), sendme_copy (boolean), target_url (string) |

### Portfolio

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| portfolioId | string | yes | delete, update | |
| name | string | yes | create, update | Portfolio name |
| description | string | no | create, update | |
| privacy | options | no | create, update | private, shared (default), team |
| returnAll | boolean | no | getAll | Pagination toggle |
| limit | number | no | getAll (when returnAll=false) | Max results (1-100, default 100) |

### Portfolio Company

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| portfolioId | string | yes | add, getAll, remove | |
| domain | string | yes | add, remove | Company domain name |
| returnAll | boolean | no | getAll | Pagination toggle |
| limit | number | no | getAll (when returnAll=false) | Max results (1-100, default 100) |
| filters | collection | no | getAll | grade (string), industry (string), issueType (string), status (active/inactive), vulnerability (string/CVE) |

### Report

| parameter | type | required | applies to | notes |
|-----------|------|----------|------------|-------|
| report | options | yes | generate | detailed, events-json, full-scorecard-json, issues, partnership, portfolio, scorecard-footprint, summary |
| scorecardIdentifier | string | yes* | generate | Required when report is NOT "portfolio" |
| portfolioId | string | yes* | generate | Required when report IS "portfolio" |
| branding | options | no | generate (detailed, summary) | securityscorecard (default), company_and_securityscorecard, company |
| date | dateTime | yes | generate (events-json) | Date for events report |
| options.format | options | no | generate (issues, portfolio) | pdf (default), csv |
| options | collection | no | generate (scorecard-footprint) | countries (string[]), format (pdf/csv), ips (string[]), subdomains (string[]) |
| url | string | yes | download | URL to a generated report |
| binaryPropertyName | string | yes | download | Binary field name for the downloaded file (default "data") |
| returnAll | boolean | no | getAll | Pagination toggle |
| limit | number | no | getAll (when returnAll=false) | Max results (1-100, default 100) |

## Runtime behavior

### API base

All requests go to `https://api.securityscorecard.io/` with `Authorization: Token {apiKey}` header. JSON request/response format.

### Input

The node processes each item independently (per-item loop). All paginated operations (getAll / getFactor / getFactorHistorical / getHistoricalScore / getScorePlan) return the raw `entries` array from the SecurityScorecard API and optionally truncate when `returnAll` is false.

### Output

- **Company** (getScorecard): single API response object pushed as one output item.
- **Company/Industry** (getFactor, getFactorHistorical, getHistoricalScore, getScorePlan): multiple items from the `entries` array, one per entry.
- **Portfolio** (create, update, delete): single response or `{success: true}` object.
- **Portfolio** (getAll): items from `entries` array.
- **Portfolio Company** (add, remove): response object or `{success: true}`.
- **Portfolio Company** (getAll): items from `entries` array (with optional filter params passed as query string).
- **Invite** (create): response object.
- **Report** (generate): response object; for json-type reports (`events-json`, `full-scorecard-json`), params are nested under a `params` wrapper in the request body.
- **Report** (getAll): items from `reports/recent` entries array.
- **Report** (download): input item preserved with binary data added to the specified `binaryPropertyName` field. The binary data is fetched from the report URL via GET with `encoding: null` and `resolveWithFullResponse: true`.

### Simplify mode

For `getFactorHistorical` and `getHistoricalScore` (both Company and Industry), when `simple` is true, the raw factor-array entries are flattened into `{date, factorName: score}` objects.

### Errors

API errors are thrown as `NodeApiError` with the upstream error message. Standard `continueOnFail` behavior applies: if enabled on the node, errors for individual items are surfaced as `error` property on the output item rather than halting execution.

### Expressions

All parameters accept expression strings. Boolean parameters accept `{{true}}` / `{{false}}` expression resolution.

## Acceptance tests

### Test: company get scorecard

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "getScorecard",
  "scorecardIdentifier": "example.com"
}
```

**Expect** the node to make GET `https://api.securityscorecard.io/companies/example.com` and output one item containing the API response JSON.

### Test: portfolio create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "portfolio",
  "operation": "create",
  "name": "My Portfolio",
  "description": "Test portfolio",
  "privacy": "private"
}
```

**Expect** the node to POST `{"name":"My Portfolio","description":"Test portfolio","privacy":"private"}` to `https://api.securityscorecard.io/portfolios` and output the response object.

### Test: report download binary

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "operation": "download",
  "url": "https://api.securityscorecard.io/reports/abc123/download",
  "binaryPropertyName": "reportData"
}
```

**Expect** the node to GET the report URL with `encoding: null`, store the response body in binary field `reportData` on the input item, and return the items array (not JSON-array-wrapped).

### Test: company factor scores with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "getFactor",
  "scorecardIdentifier": "example.com",
  "returnAll": false,
  "limit": 10
}
```

**Expect** the node to GET `https://api.securityscorecard.io/companies/example.com/factors`, extract `entries` from response, truncate to 10, and output one item per entry.

### Test: invite with additional fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "invite",
  "operation": "create",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "message": "Join our scorecard",
  "additionalFields": {
    "domain": "example.com",
    "sendme_copy": true
  }
}
```

**Expect** the node to POST `{"email":"user@example.com","first_name":"John","last_name":"Doe","message":"Join our scorecard","domain":"example.com","sendme_copy":true}` to `https://api.securityscorecard.io/invitations` and output the response.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public n8n docs list all resources and operations |
| API endpoints | inferred | Mapped from executor source (corpus): `/companies/{id}`, `/companies/{id}/factors`, `/companies/{id}/history/factors/score`, `/companies/{id}/score-plans/by-target/{score}`, `/industries/{industry}/score`, `/industries/{industry}/history/factors`, `/portfolios`, `/portfolios/{id}`, `/portfolios/{id}/companies/{domain}`, `/reports/{type}`, `/reports/recent`, `/invitations` |
| Report branch formats | inferred from corpus | Detailed JSON body composition logic per report type (branding, format, date, params wrapper, scorecard-footprint options) |
| Simplify mode | documented | Public docs confirm "simplified version" option for historical factor data |
| Credential auth | documented | Public n8n creds page and executor confirm `Authorization: Token {apiKey}` header |
| Error handling | documented | Standard NodeApiError wrapping per n8n SDK pattern |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/securityScorecard.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
