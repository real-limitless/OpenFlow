---
type: n8n-nodes-base.dropcontactTool
displayName: Dropcontact
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Dropcontact (AI Tool)

An AI agent tool variant of the Dropcontact node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Enriches contact information via the Dropcontact API at `https://api.dropcontact.com/v1/`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropcontact.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/dropcontact.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.dropcontact.com/ | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.dropcontactTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `dropcontactApi` (required) — API key passed as `X-Access-Token` header

## Parameters

The node exposes an operation selector. Operation-specific fields appear based on the selected operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Operation (required)

| Value | Label | Description |
|-------|-------|-------------|
| `enrich` | Enrich | Submit contacts for enrichment (POST then optionally poll for results) |
| `fetchRequest` | Fetch Request | Retrieve results of a previously submitted enrichment by request ID |

### Enrich parameters

Shown when `operation = enrich`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `additionalFields` | object | no | — | Per-contact input fields: `email`, `first_name`, `last_name`, `full_name`, `phone`, `company`, `website`, `num_siren`, `siret`, `linkedin`, `company_linkedin`, `country`, `job` |
| `simplify` | boolean | no | false | Flatten response `data` array fields to top-level keys |
| `options.siren` | boolean | no | false | Request SIREN number, NAF code, VAT number, company address, company leader info |
| `options.language` | select | no | — | Response language: `en` or `fr` |
| `options.waitTime` | number | no | — | Milliseconds to wait before polling for results; omit for immediate POST-only mode |
| `options.customCallbackUrl` | string | no | — | Webhook URL for async result delivery |

### Fetch Request parameters

Shown when `operation = fetchRequest`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `requestId` | string | yes | — | The `request_id` returned by a previous enrich POST |

## Runtime behavior

### Input

Each input item may carry contact fields the agent or workflow wants to enrich. Parameters are resolved per item.

### Output

For **enrich** (with `waitTime` / polling) and **fetchRequest**:
- Output contains a `data` array of enriched contact objects with fields including `civility`, `first_name`, `last_name`, `full_name`, `email` (array of `{email, qualification}`), `phone`, `mobile_phone`, `company`, `website`, `linkedin`, `siren`, `siret`, `siret_address`, `siret_zip`, `siret_city`, `country`, `vat`, `nb_employees`, `employee_count`, `naf5_code`, `naf5_des`, `industry`, `company_linkedin`, `company_turnover`, `company_results`, `job`, `job_level`, `job_function`, `location`, `custom_fields`, plus per-contact `errors` and `warnings`.
- When `simplify` is enabled, fields from each `data` entry are promoted to top-level keys.

For **enrich** (without `waitTime` — immediate POST only):
- Output contains `request_id`, `success`, `credits_left`. No enrichment data.

### API endpoints

- Enrich submission: POST `https://api.dropcontact.com/v1/enrich/all`
- Poll/fetch results: GET `https://api.dropcontact.com/v1/enrich/all/{requestId}`

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target operation at inference time
- Populating contact fields, options, and `requestId` from model-generated values
- Providing clear descriptions for each parameter to guide model selection

### Errors

- 4xx/5xx HTTP responses from the Dropcontact API throw (or return empty output if `continueOnFail` is enabled).
- Per-contact `errors` and `warnings` from the API are included in output — they do not cause node failure.
- Missing or empty `requestId` for fetchRequest throws before making the HTTP call.
- Rate limiting (HTTP 429) may occur at 60 requests/second.

### Expressions

All string parameters accept expression strings. Boolean and numeric parameters accept expressions resolving to the correct type.

## Acceptance tests

### Test: agent enriches a single contact

**Given** a connected AI agent that decides to enrich an email address.

**Parameters:** operation `enrich`, additionalFields.email `peter.jackson@company.com`, options.waitTime `5000`, options.language `en`.

**Expect:** output[0] contains an item with enriched fields (`first_name`, `last_name`, `email` array, `company`, etc.) or the original input if enrichment yielded no match.

### Test: agent enriches without polling (immediate)

**Given** a connected AI agent that decides to submit contacts without waiting for results.

**Parameters:** operation `enrich`, additionalFields.email `test@example.com`, options `{}`.

**Expect:** output[0] contains one item with `request_id`, `success`, and `credits_left`. No enrichment body.

### Test: agent fetches a previous enrichment

**Given** a connected AI agent that has a `request_id` from a previous enrich.

**Parameters:** operation `fetchRequest`, requestId `abc123`.

**Expect:** output[0] contains enriched contact data matching the fetchRequest output shape.

### Test: agent decides operation at inference time

**Given** a connected AI agent with a `$fromAI()` compatible dropcontactTool node.

**Parameters:** operation and contact fields not set — left for the model to populate.

**Expect:** the agent selects an operation, fills required parameters, and the node produces a successful output.

### Test: continue on fail — invalid parameters

**Given** an input item with an empty requestId.

**Parameters:** operation `fetchRequest`, requestId `""`.

**Node config:** `continueOnFail = true`

**Expect:** output[0] contains an item with `{ error: ... }` instead of throwing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`dropcontactTool`) | inferred | Follows the `<base>Tool` naming convention for tool variants confirmed in other tool specs (hunterTool, zendeskTool, etc.) |
| Operations (2) | documented | Shared with base Dropcontact node: enrich, fetchRequest |
| Credentials | documented | `dropcontactApi` API-key credential confirmed by public n8n docs |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs |
| Parameters and response shape | documented | Shared with base Dropcontact node spec; all per-contact fields documented at developer.dropcontact.com |
| No dedicated docs page | inferred | The `dropcontactTool` type has no separate docs.n8n.io page — it's the base node exposed as tool with `usableAsTool: true` |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/dropcontactTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
