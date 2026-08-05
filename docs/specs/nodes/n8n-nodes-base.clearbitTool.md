---
type: n8n-nodes-base.clearbitTool
displayName: Clearbit (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Clearbit (AI Tool)

An AI agent tool variant of the Clearbit app node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Exposes the same Clearbit API v1 operations (Company enrich/autocomplete, Person enrich) against the Clearbit REST API at `https://api.clearbit.com/`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clearbit/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clearbit/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://clearbit.com/docs | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.clearbitTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clearbitApi` (required) — API Key authentication

## Parameters

The tool variant shares the same resource/operation structure as the base Clearbit node but supports AI-agent-driven parameter population. Parameters are documented at the functional-outcome level; exact name/default/enum values match the base `n8n-nodes-base.clearbit` spec.

### Resource (required)

Select the Clearbit API resource.

| Value | Label | Purpose |
|-------|-------|---------|
| `company` | Company | Look up a company by domain |
| `person` | Person | Retrieve social information associated with an email address |

### Operation per resource

| Resource | Value | Label | Purpose |
|----------|-------|-------|---------|
| company | `enrich` | Enrich | Look up person and company data based on an email or domain |
| company | `autocomplete` | Autocomplete | Auto-complete company names and retrieve logo and domain |
| person | `enrich` | Enrich | Look up a person and company data based on an email or domain |

### Company → Enrich

Shown when `resource = company` and `operation = enrich`.

| name | type | required | purpose |
|------|------|----------|---------|
| `domain` | string | yes | The company domain to look up |
| `additionalFields.companyName` | string | no | The name of the company |
| `additionalFields.facebook` | string | no | The Facebook URL for the company |
| `additionalFields.linkedin` | string | no | The LinkedIn URL for the company |
| `additionalFields.twitter` | string | no | The Twitter handle for the company |

### Company → Autocomplete

Shown when `resource = company` and `operation = autocomplete`.

| name | type | required | purpose |
|------|------|----------|---------|
| `name` | string | yes | Partial company name to autocomplete |

### Person → Enrich

Shown when `resource = person` and `operation = enrich`.

| name | type | required | purpose |
|------|------|----------|---------|
| `email` | string | yes | The email address to look up |
| `additionalFields.company` | string | no | The name of the person's employer |
| `additionalFields.companyDomain` | string | no | The domain for the person's employer |
| `additionalFields.facebook` | string | no | The Facebook URL for the person |
| `additionalFields.familyName` | string | no | Last name of the person (improves match rates) |
| `additionalFields.givenName` | string | no | First name of the person |
| `additionalFields.ipAddress` | string | no | IP address of the person (improves match rates) |
| `additionalFields.location` | string | no | City or country where the person resides |
| `additionalFields.linkedIn` | string | no | The LinkedIn URL for the person |
| `additionalFields.twitter` | string | no | The Twitter handle for the person |

### AI-agent parameter mode

When used as an AI agent tool, the agent model may supply any subset of parameters dynamically via `$fromAI()`. The "let model fill" toggle further relaxes parameter requirements — the model determines values at run time based on the user's natural language request.

## Runtime behavior

### Input

Accepts items on `main`. When used as a tool within an AI Agent, the agent provides parameter values dynamically. Each input item triggers one Clearbit API call.

### Output

Produces items on `main`. Output shapes match the base Clearbit node:

- **Company → Enrich:** Combined API response envelope with `person` object (name, email, location, employment, social profiles) and `company` object (name, domain, description, category, metrics, social profiles).
- **Company → Autocomplete:** Array of suggestions, each with `name`, `domain`, and optionally `logo`.
- **Person → Enrich:** Person object with full name, email, location, employment history, social profiles, and contact info.

### Errors

- **Authentication (invalid/missing API key):** Thrown as `NodeApiError`; not suppressed by `continueOnFail`.
- **Rate limiting (HTTP 429):** Thrown; implementers may add retry logic.
- **Not found/invalid input:** Surfaces via `NodeApiError`.
- **`continueOnFail`:** When enabled, failed items produce `{ error: <message> }` output items instead of throwing.

### Expressions

All string parameters accept expression strings. In tool mode, `$fromAI()` expressions can be used to delegate parameter values to the AI agent model.

## Acceptance tests

### Test: Company → Enrich via tool

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

### Test: Person → Enrich via $fromAI() expression

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "person",
  "operation": "enrich",
  "email": "={{ $fromAI() }}"
}
```
**Expect** the tool returns a person enrichment result. The `$fromAI()` expression is resolved by the AI agent model at execution time.

### Test: Continue on fail in tool mode

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
**Expect** output[0] contains two items: first has `{ error: <message> }`, second is a valid person enrichment object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | documented | Public n8n docs confirm Company (enrich/autocomplete) and Person (enrich) operations |
| Parameter names/enums | documented | Identical to base Clearbit node documented on docs.n8n.io |
| Tool-mode semantics | documented | Follows standard n8n AI tool pattern — `$fromAI()` dynamic parameter population, `usableAsTool` flag |
| Credential auth | documented | `clearbitApi` API Key — documented at docs.n8n.io/integrations/builtin/credentials/clearbit/ |
| Output shapes | inferred | Same as base Clearbit node — Combined API envelope for company enrich, person object for person enrich |
| Error handling | inferred | Standard n8n HTTP node error behavior applies |
| Rate limits | external | Clearbit enforces plan-based rate limits; not configurable in node |

## OpenFlow mapping

- **Definition group:** `core` (AI tool variant of an app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.clearbitTool.ts` (or reuse base clearbit executor with tool-mode flag)
- **SDK:** `defineNode` + native `ExecutionContext` only
