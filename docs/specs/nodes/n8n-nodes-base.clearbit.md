---
type: n8n-nodes-base.clearbit
displayName: Clearbit
category: Sales
versions: [1]
priority: medium
status: specced
---

# Clearbit

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clearbit/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clearbit/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.clearbit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clearbitApi` (required) — API Key authentication

## Parameters

### Resource (required)

Select the Clearbit API resource to target.

| Value | Label | Description |
|-------|-------|-------------|
| `company` | Company | Look up a company by their domain |
| `person` | Person | Retrieve social information associated with an email address |

### Operation (required)

Determines the action to perform on the selected resource.

| Resource | Value | Label | Description |
|----------|-------|-------|-------------|
| company | `enrich` | Enrich | Look up person and company data based on an email or domain |
| company | `autocomplete` | Autocomplete | Auto-complete company names and retrieve logo and domain |
| person | `enrich` | Enrich | Look up a person and company data based on an email or domain |

### Company → Enrich parameters

Shown when `resource = company` and `operation = enrich`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `domain` | string | yes | — | The company domain to look up (e.g., "stripe.com") |
| `additionalFields.companyName` | string | no | — | The name of the company |
| `additionalFields.facebook` | string | no | — | The Facebook URL for the company |
| `additionalFields.linkedin` | string | no | — | The LinkedIn URL for the company |
| `additionalFields.twitter` | string | no | — | The Twitter handle for the company |

### Company → Autocomplete parameters

Shown when `resource = company` and `operation = autocomplete`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `name` | string | yes | — | Partial company name to autocomplete |

### Person → Enrich parameters

Shown when `resource = person` and `operation = enrich`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `email` | string | yes | — | The email address to look up |
| `additionalFields.company` | string | no | — | The name of the person's employer |
| `additionalFields.companyDomain` | string | no | — | The domain for the person's employer |
| `additionalFields.facebook` | string | no | — | The Facebook URL for the person |
| `additionalFields.familyName` | string | no | — | Last name of the person (strongly recommended to improve match rates) |
| `additionalFields.givenName` | string | no | — | First name of the person |
| `additionalFields.ipAddress` | string | no | — | IP address of the person (strongly recommended to improve match rates) |
| `additionalFields.location` | string | no | — | City or country where the person resides |
| `additionalFields.linkedIn` | string | no | — | The LinkedIn URL for the person |
| `additionalFields.twitter` | string | no | — | The Twitter handle for the person |

## Runtime behavior

### Input

The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially, making one API call per item.

### Output

The node produces items on the `main` output. Output shape depends on the resource/operation combination:

#### Company → Enrich

Returns a combined person+company envelope from the Clearbit Combined API. The response includes a `person` object (name, email, location, employment, social profiles, etc.) and a `company` object (name, domain, description, category, location, metrics, social profiles, etc.). The raw Clearbit API response is passed through as-is.

#### Company → Autocomplete

Returns an array of autocomplete suggestions, each containing at minimum a company `name` and `domain`, plus optionally a `logo` URL.

#### Person → Enrich

Returns a person object from the Clearbit Person API. Includes the person's full name, email, location, employment history (company, title, role, seniority), social profiles (Twitter, LinkedIn, GitHub, etc.), and contact info (phone, email).

### Errors

- **Authentication errors** (invalid/missing API key): Thrown as `NodeApiError`; not caught by `continueOnFail`.
- **Rate limiting (HTTP 429):** Thrown; implementers should consider retry logic.
- **Not found / invalid parameters:** Returned in response body; node surfaces via `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, failed items emit an output item with `{ error: <message> }` instead of throwing. Successful items continue normal output.

### Expressions

All string parameters accept expression strings. Boolean and collection parameters accept expressions resolving to the correct types.

## Acceptance tests

### Test: Company → Enrich basic

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "company",
  "operation": "enrich",
  "domain": "stripe.com"
}
```
**Expect** output[0] contains a single object with `person` and `company` top-level keys. `person` includes `name`, `email`, `employment`. `company` includes `name`, `domain`, `description`.

### Test: Company → Enrich with additional fields

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "company",
  "operation": "enrich",
  "domain": "stripe.com",
  "additionalFields": {
    "twitter": "stripe"
  }
}
```
**Expect** output[0] is an enriched company/person result from the Clearbit Combined API. The `company` object contains a `twitter` handle.

### Test: Company → Autocomplete

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "company",
  "operation": "autocomplete",
  "name": "Strip"
}
```
**Expect** output[0] contains an array of autocomplete results, each with `name` and `domain` fields. At least one result matches "Stripe".

### Test: Person → Enrich

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "person",
  "operation": "enrich",
  "email": "alex@stripe.com"
}
```
**Expect** output[0] is a person object with `name`, `email`, `employment` (containing `domain` and `name`), and social profile fields.

### Test: Continue on fail

**Given** input items:
```json
[{ "json": { "email": "nonexistent@invalid.nonexistent" } }, { "json": { "email": "alex@stripe.com" } }]
```
**Parameters:**
```json
{
  "resource": "person",
  "operation": "enrich",
  "email": "={{ $json.email }}"
}
```
**Node config:** `continueOnFail = true`
**Expect** output[0] contains two items: first has `{ error: <message> }`, second is a valid person object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | documented | Public n8n docs confirm Company and Person resources with enrich/autocomplete operations |
| Parameter names/enums | inferred from corpus | Parameters, defaults, and displayOptions from CORPUS_DIR; consistent with public docs |
| Company enrich output shape | inferred | Clearbit Combined API returns `person` + `company` envelope; no explicit n8n docs on exact fields |
| Person enrich output shape | inferred | Clearbit Person API returns person with employment, social profiles, location |
| Autocomplete response shape | inferred | Returns array of name/domain/logo suggestions |
| Credential auth method | documented | Public credential docs confirm API Key authentication |
| Rate limits | external | Clearbit enforces plan-based rate limits; not configurable in node |
| Tool mode (`usableAsTool`) | documented | Node JSON declares `usableAsTool: true`; follows standard OpenFlow tool semantics |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.clearbit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
