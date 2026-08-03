---
type: n8n-nodes-base.hunter
displayName: Hunter
category: Sales
versions: [1]
priority: medium
status: specced
---

# Hunter

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hunter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/hunter.md | Public docs only |
| https://hunter.io/api-documentation/v2 | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.hunter`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `hunterApi` (required) — API Key authentication

## Parameters

### Operation (required)
Select the Hunter API operation to perform.

| Value | Label | Description |
|-------|-------|-------------|
| `domainSearch` | Domain Search | Get every email address found on the internet using a given domain name, with sources |
| `emailFinder` | Email Finder | Generate or retrieve the most likely email address from a domain name, a first name and a last name |
| `emailVerifier` | Email Verifier | Verify the deliverability of an email address |

### Domain Search parameters
Shown when `operation = domainSearch`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `domain` | string | yes | — | Domain name from which to find email addresses (e.g., "stripe.com") |
| `onlyEmails` | boolean | no | `true` | Whether to return only the found email addresses (true) or include full company/email metadata (false) |
| `returnAll` | boolean | no | `false` | Whether to return all results (paginated) or only up to a given limit |
| `limit` | number | no* | `100` | Max number of results to return (1–100). Required when `returnAll = false`. |
| `filters.type` | options | no | — | Filter by email type: `personal` or `generic` |
| `filters.seniority` | multiOptions | no | — | Filter by seniority: `junior`, `senior`, `executive` |
| `filters.department` | multiOptions | no | — | Filter by department: `communication`, `executive`, `finance`, `hr`, `it`, `legal`, `management`, `marketing`, `sales`, `support` |

### Email Finder parameters
Shown when `operation = emailFinder`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `domain` | string | yes | — | Domain name from which to find the email address (e.g., "stripe.com") |
| `firstname` | string | yes | — | The person's first name |
| `lastname` | string | yes | — | The person's last name |

### Email Verifier parameters
Shown when `operation = emailVerifier`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `email` | string | yes | — | The email address to verify |

## Runtime behavior

### Input
The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially.

### Output
The node produces items on the `main` output. Output shape depends on the operation:

#### Domain Search (`domainSearch`)
- **When `onlyEmails = true`:** Array of email objects, each containing at minimum `value` (the email address), `type` (personal/generic), `confidence` (score), and optionally `first_name`, `last_name`, `position`, `seniority`, `department`, `linkedin`, `twitter`, `phone_number`, `company`, `sources`.
- **When `onlyEmails = false`:** Single object with company metadata (`domain`, `organization`, `country`, `industry`, `company_type`, `linkedin`, `twitter`, `phone`, `technologies`) and an `emails` array with full email objects as above.
- **When `returnAll = true`:** All pages are fetched and combined. If `onlyEmails = false`, company info appears once with all emails merged.

#### Email Finder (`emailFinder`)
Single object containing the found email data: `email` (the predicted address), `score` (confidence 0–100), `domain`, `first_name`, `last_name`, `position`, `company`, `sources` (array of source objects with `domain`, `uri`, `extracted_on`, `last_seen_on`, `still_on_page`).

#### Email Verifier (`emailVerifier`)
Single object with verification result: `email`, `result` (`deliverable`, `undeliverable`, `risky`, `unknown`), `score` (0–100), `regexp` (boolean), `gibberish` (boolean), `disposable` (boolean), `webmail` (boolean), `mx_records` (boolean), `smtp_server` (boolean), `smtp_check` (boolean), `accept_all` (boolean), `block` (boolean), `sources` (array of source objects).

### Errors
- **Authentication errors** (invalid/missing API key): Thrown as `NodeApiError`; not caught by `continueOnFail`.
- **Rate limiting (HTTP 429):** Thrown; implementers should consider retry logic.
- **Not found / invalid parameters:** Returned in response body; node surfaces via `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, failed items emit an output item with `{ error: <message> }` instead of throwing. Successful items continue normal output.

### Expressions
All string parameters (`domain`, `firstname`, `lastname`, `email`) accept expression strings. Boolean and numeric parameters accept expressions that resolve to the correct type. Filter arrays accept expressions resolving to arrays.

## Acceptance tests

### Test: Domain Search — basic (only emails)
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "domainSearch",
  "domain": "stripe.com",
  "onlyEmails": true,
  "returnAll": false,
  "limit": 10
}
```
**Expect** output[0] contains an array of email objects, each with `value`, `type`, `confidence` fields. Length ≤ 10.

### Test: Domain Search — full metadata
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "domainSearch",
  "domain": "stripe.com",
  "onlyEmails": false,
  "returnAll": false,
  "limit": 5
}
```
**Expect** output[0] is a single object with `domain`, `organization`, `emails` array. Each email in `emails` has `value`, `type`, `confidence`, `first_name`, `last_name`, `position`, `seniority`, `department`, `sources`.

### Test: Domain Search — with filters
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "domainSearch",
  "domain": "stripe.com",
  "onlyEmails": true,
  "returnAll": false,
  "limit": 20,
  "filters": {
    "type": "personal",
    "seniority": ["senior", "executive"],
    "department": ["engineering", "sales"]
  }
}
```
**Expect** output[0] contains only personal emails with seniority senior/executive and department engineering/sales (as provided by API).

### Test: Email Finder — basic
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "emailFinder",
  "domain": "stripe.com",
  "firstname": "John",
  "lastname": "Doe"
}
```
**Expect** output[0] contains an object with `email`, `score`, `domain`, `first_name`, `last_name`, `sources` array.

### Test: Email Verifier — basic
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "emailVerifier",
  "email": "john.doe@stripe.com"
}
```
**Expect** output[0] contains an object with `email`, `result` (one of: deliverable/undeliverable/risky/unknown), `score`, `regexp`, `gibberish`, `disposable`, `webmail`, `mx_records`, `smtp_server`, `smtp_check`, `accept_all`, `block`, `sources`.

### Test: Continue on fail
**Given** input items:
```json
[{ "json": { "domain": "invalid" } }, { "json": { "domain": "stripe.com" } }]
```
**Parameters:**
```json
{
  "operation": "domainSearch",
  "domain": "={{ $json.domain }}",
  "onlyEmails": true,
  "returnAll": false,
  "limit": 5
}
```
**Node config:** `continueOnFail = true`
**Expect** output[0] contains two items: first has `{ error: <message> }`, second has array of email objects.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations (3) | documented | Public n8n docs + Hunter API v2 docs confirm all three |
| Domain Search filters | documented | Parameter names/enums from CORPUS_DIR; filter behavior described in Hunter API docs |
| Pagination (`returnAll`) | documented | CORPUS_DIR shows `hunterApiRequestAllItems` with offset/limit; `meta.results` pagination |
| `onlyEmails` output merge logic | inferred | CORPUS_DIR shows merge logic for company info when `onlyEmails=false` + `returnAll=true`; abstracted to "company info appears once" |
| Email Finder response shape | documented | Hunter API v2 docs describe response fields |
| Email Verifier response shape | documented | Hunter API v2 docs describe all verification fields |
| Rate limits / quotas | external | Hunter API enforces plan-based limits; not exposed in node config |
| Tool mode (`usableAsTool`) | documented | Node JSON declares `usableAsTool: true`; behavior follows standard OpenFlow tool semantics |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.hunter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only