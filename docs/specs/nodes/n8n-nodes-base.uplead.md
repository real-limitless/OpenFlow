---
type: n8n-nodes-base.uplead
displayName: UpLead
category: Sales
versions: [1]
priority: medium
status: specced
---

# UpLead

Enrich company and person records via the UpLead REST API (https://api.uplead.com/v2).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uplead/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/uplead/ | Public docs only |
| https://docs.uplead.com/#overview | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.uplead`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `upleadApi` (API key — via `Authorization` header)

## Parameters

### Resource selector

The node exposes two mutually exclusive resources:

| name | type | required | notes |
|------|------|----------|-------|
| Resource | string | yes | `Company` or `Person` |
| Operation | string | yes | Only `Enrich` for both resources |

### Company: Enrich

Look up company data by domain name or company name.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Operation | string | `Enrich` | yes | Fixed to `Enrich` |
| By | string | `domain` | yes | `domain` or `companyName` — selects the lookup key |
| Domain | string | — | conditional | Required when By = `domain`. Company website domain (e.g. `amazon.com`) |
| Company Name | string | — | conditional | Required when By = `companyName`. Company legal name |

Sends GET/POST to `https://api.uplead.com/v2/company-search` with `?domain=...` query or `{ "domain": "..." }` / `{ "company": "..." }` body depending on mode.

Returns a single output item containing the full company object under `data`, plus `userInfo.availableCredits`.

### Person: Enrich

Look up a person by email address, or by domain + first name + last name.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Operation | string | `Enrich` | yes | Fixed to `Enrich` |
| By | string | `email` | yes | `email`, or `nameAndDomain` |
| Email | string | — | conditional | Required when By = `email` |
| First Name | string | — | conditional | Required when By = `nameAndDomain` |
| Last Name | string | — | conditional | Required when By = `nameAndDomain` |
| Domain | string | — | conditional | Required when By = `nameAndDomain` |

Sends GET/POST to `https://api.uplead.com/v2/person-search` with the appropriate query or body parameters.

Returns a single output item containing the full person object under `data`, plus `userInfo.availableCredits`.

## Runtime behavior

### Input

Each input item is processed independently. Expressions on parameters (e.g. `Domain`, `Email`) can reference the incoming item's `json` properties.

### Output

For each input item, the node emits one output item on `output[0]` with the following envelope:

```json
{
  "json": {
    "data": { ... },
    "userInfo": { "availableCredits": <number> }
  }
}
```

- **Company Enrich** produces the company record fields: `id`, `company_name`, `domain`, `address`, `city`, `state`, `zip`, `country`, `county`, `phone_number`, `fax_number`, `employees`, `revenue`, `industry`, `sic_code`, `sic_description`, `naics_code`, `naics_description`, `description`, `year_founded`, `logo`, `linkedin_url`, `twitter_url`, `facebook_url`, `youtube_url`, `crunchbase_url`, `yelp_url`, `instagram_url`, `type`, `ticker`, `exchange`, `alexa_rank`.
- **Person Enrich** produces the person record fields: `id`, `first_name`, `last_name`, `title`, `job_function`, `job_sub_function`, `management_level`, `gender`, `email`, `email_status`, `phone_number`, `mobile_directdial`, `city`, `state`, `county`, `country`, `linkedin_url`, `industry`, `domain`, `company_name`.

### Errors

- **4xx errors** (400, 401, 403, 429) — throw a node-level error; respects `continueOnFail`.
- **5xx errors** — throw a node-level error; respects `continueOnFail`.
- The UpLead API returns `{ "error": { "type": "...", "message": "..." } }` on failure.

### Expressions

All string parameters (Domain, Company Name, Email, First Name, Last Name) accept expressions.

## Acceptance tests

### Test: Company enrich by domain

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `Company`
- Operation: `Enrich`
- By: `domain`
- Domain: `amazon.com`

**Expect** output[0] to contain exactly one item where:
- `json.data` has a `company_name` property
- `json.data.domain` equals `amazon.com`
- `json.data.id` is a non-empty string (UUID format)
- `json.userInfo.availableCredits` is a number

### Test: Company enrich by company name

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `Company`
- Operation: `Enrich`
- By: `companyName`
- Company Name: `Amazon`

**Expect** output[0] to contain exactly one item where:
- `json.data` has non-empty `company_name` and `domain` properties
- `json.data.id` is a non-empty UUID

### Test: Person enrich by email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `Person`
- Operation: `Enrich`
- By: `email`
- Email: `user@example.com`

**Expect** output[0] to contain exactly one item where:
- `json.data` has `first_name`, `last_name`, and `email` properties
- `json.data.email` is a string (may differ from input if the API normalizes)
- `json.data.email_status` is one of `valid`, `invalid`, `unknown`, `accept_all`

### Test: Person enrich by name + domain

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `Person`
- Operation: `Enrich`
- By: `nameAndDomain`
- First Name: `Marc`
- Last Name: `Benioff`
- Domain: `salesforce.com`

**Expect** output[0] to contain exactly one item where:
- `json.data` has `first_name`, `last_name`, `email`, `domain` properties
- `json.data.company_name` is a non-empty string
- `json.data.email_status` is one of `valid`, `invalid`, `unknown`, `accept_all`

### Test: Error on missing lookup key

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `Company`
- Operation: `Enrich`
- By: `domain`
- Domain: `` (empty string)

**Expect** execution to fail with an error indicating insufficient lookup parameters.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Authentication | Fully documented | n8n credential docs + public UpLead API docs. API key in `Authorization` header. |
| Company lookup parameters | Fully documented | UpLead API docs specify `domain`, `company`, and `id`; n8n exposes `domain` and `companyName` (maps to API `company`). The `id` path is not exposed in n8n. |
| Person lookup parameters | Fully documented | UpLead API docs specify `email`, `first_name + last_name + domain`, and `id`; n8n exposes `email` and `nameAndDomain` modes. The `id` path is not exposed. |
| Response shape | Documented (UpLead API) | Full attribute tables published in UpLead API docs. |
| Rate limiting | Documented (UpLead API) | 500 requests/minute; 429 response. |
| Email verification | Documented (UpLead API) | `email_status` field: valid, invalid, unknown, accept_all. Billing only for valid/accept_all. |
| Parameter naming | Derived from corpus | Corpus confirms operation names `Enrich` (not `enrichCompany`/`enrichPerson` as sub-operations) and the `By` parameter for lookup mode selection. |

## OpenFlow mapping

- **Definition group:** `core` | `sales`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.uplead.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
