---
type: n8n-nodes-base.dropcontact
displayName: Dropcontact
category: Sales
versions: [1]
priority: medium
status: specced
---

# Dropcontact

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropcontact.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/dropcontact.md | Public docs only |
| https://developer.dropcontact.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dropcontact`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `dropcontactApi` (API key passed as `X-Access-Token` header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed | `enrich` | yes | — | `enrich` or `fetchRequest` |
| simplify | boolean | false | no | operation=enrich | When true, flatten the response `data` array fields to top-level keys instead of nesting under `data` |
| requestId | string | — | no | operation=fetchRequest | The `request_id` returned by a previous enrich POST, used to poll results |
| additionalFields | object | — | no | operation=enrich | Per-contact input fields sent inside the `data` array: `email`, `first_name`, `last_name`, `full_name`, `phone`, `company`, `website`, `num_siren`, `siret`, `linkedin`, `company_linkedin`, `country`, `job` |
| options.siren | boolean | false | no | operation=enrich | When true, request SIREN number, NAF code, VAT number, company address, and company leader info |
| options.language | select | — | no | operation=enrich | Response language: `en`, `fr`, or expression |
| options.waitTime | number | — | no | operation=enrich | Milliseconds to wait before polling the GET endpoint for results |
| options.customCallbackUrl | string | — | no | operation=enrich | Webhook URL for async result delivery; included as `custom_callback_url` in the POST body |

## Runtime behavior

### Input

Each input item may carry contact fields the user wants to enrich. Per-contact fields (`email`, `first_name`, `last_name`, `full_name`, `phone`, `company`, `website`, `num_siren`, `siret`, `linkedin`, `company_linkedin`, `country`, `job`, `custom_fields`) are collected from the item and bundled into a `data` array in the POST body. Global options (`siren`, `language`, `custom_callback_url`) are added at the top level of the POST body.

For the **enrich** operation:
- The node sends a POST to `https://api.dropcontact.com/v1/enrich/all` with a JSON body containing `data` (array of per-contact objects), plus optional `siren` (boolean), `language` (string), and `custom_callback_url` (string).
- Each data object may contain any subset of the per-contact fields listed above. At minimum, one of these must be present per object: `email`, or `first_name + last_name + company` (or `full_name + company`), or `linkedin`.
- Up to 250 contacts per request. Each contact object must be under 15 kB.
- The POST response returns `{ request_id, success, credits_left, error }` immediately. If `waitTime` is set, the node delays then sends a GET request. Without `waitTime`, the node returns the POST metadata (`request_id`, `credits_left`) as output.

For the **fetchRequest** operation:
- Sends a GET to `https://api.dropcontact.com/v1/enrich/all/{requestId}` with optional query parameter `forceResults=true`.
- When `forceResults=true`, contacts not yet processed are returned unchanged (input data preserved).

### Output

For **enrich** (with waitTime / polling) and **fetchRequest**:
- Output contains a `data` array of enriched contact objects. Each object includes any subset of: `civility`, `first_name`, `last_name`, `full_name`, `email` (array of `{email, qualification}`), `phone`, `mobile_phone`, `company`, `website`, `linkedin`, `siren`, `siret`, `siret_address`, `siret_zip`, `siret_city`, `country`, `vat`, `nb_employees`, `employee_count`, `naf5_code`, `naf5_des`, `industry`, `company_linkedin`, `company_turnover`, `company_results`, `job`, `job_level`, `job_function`, `location`, `custom_fields`, plus per-contact `errors` and `warnings` objects.
- Email qualification is returned as `local_qualification@domain_qualification` (e.g. `nominative@pro`).
- If the API cannot find or verify an email, the original input data is returned without modification.
- When `simplify` is enabled, fields from each `data` entry are promoted to top-level keys on the output item (the `data` wrapper is removed).

For **enrich** (without waitTime / immediate POST only):
- Output contains `request_id` (string), `success` (boolean), `credits_left` (integer). No enrichment data.

### Errors

- 4xx/5xx HTTP responses from the Dropcontact API cause the node to throw (or return empty output if `continueOnFail` is enabled).
- Per-contact `errors` and `warnings` objects from the API are included in the output — they do not cause node failure.
- Missing or empty `requestId` for fetchRequest should throw before making the HTTP call.
- Rate limiting (HTTP 429) may occur at 60 requests/second.

### Expressions

`simplify`, `additionalFields.*`, `options.*`, and `requestId` all accept expression strings.

## Acceptance tests

### Test: enrich with polling — single contact

**Given** input items:
```json
[{ "json": { "email": "peter.jackson@company.com" } }]
```

**Parameters:**
```json
{
  "operation": "enrich",
  "additionalFields": { "email": "peter.jackson@company.com" },
  "options": { "waitTime": 5000, "siren": false, "language": "en" }
}
```

**Expect** output[0] contains a single item whose JSON includes enriched fields (`first_name`, `last_name`, `email` array, `company`, etc.) or the original input if enrichment yielded no email. Each output item maps to one contact in the API `data` array.

### Test: enrich without polling (immediate)

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "operation": "enrich",
  "additionalFields": { "email": "test@example.com" },
  "options": {}
}
```

**Expect** output[0] contains one item with `request_id` (string), `success` (true), and `credits_left` (integer >= 0). No enrichment data body is included.

### Test: fetchRequest with requestId

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "fetchRequest",
  "requestId": "abc123"
}
```

**Expect** output[0] contains enriched contact data in the same shape as the enrich-with-polling case. The HTTP GET targets `/v1/enrich/all/abc123`.

### Test: simplify flattens response

**Given** input items:
```json
[{ "json": { "email": "peter.jackson@company.com" } }]
```

**Parameters:**
```json
{
  "operation": "enrich",
  "additionalFields": { "email": "peter.jackson@company.com" },
  "simplify": true,
  "options": { "waitTime": 5000 }
}
```

**Expect** each output[0] item has enriched fields (`first_name`, `last_name`, `email`, etc.) at the top level of `json`, not nested under a `data` wrapper.

### Test: empty requestId throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "fetchRequest",
  "requestId": ""
}
```

**Expect** the node throws before making any HTTP call.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| resource/operation enum values | Public docs + corpus descriptor | Single `contact` resource; operations `enrich` and `fetchRequest` |
| additionalFields shape | Public Dropcontact API docs | 14 per-contact fields documented at developer.dropcontact.com |
| options shape | Corpus descriptor + public API docs | `siren`, `language`, `waitTime` from n8n node; `customCallbackUrl` from API docs |
| API async POST -> GET pattern | Public Dropcontact API docs | Clearly documented at developer.dropcontact.com |
| Response fields | Public Dropcontact API docs | Full field list including `civility`, `siret_zip`, `siret_city`, `country`, `employee_count`, `location` |
| simplify behavior | Inferred from n8n pattern | n8n generic output option; not Dropcontact API specific |
| forceResults on GET | Public Dropcontact API docs | `forceResults=true` query parameter documented |
| credential type | Public n8n docs | `dropcontactApi` with API key via `X-Access-Token` header |
| custom_callback_url | Public Dropcontact API docs | Webhook URL for async delivery |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/dropcontact.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
