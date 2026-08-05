---
type: n8n-nodes-base.hunterTool
displayName: Hunter
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Hunter (AI Tool)

An AI agent tool variant of the Hunter node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Exposes email prospecting operations from the Hunter API v2 against the `https://api.hunter.io/v2/` endpoint.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hunter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/hunter.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://hunter.io/api-documentation/v2 | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.hunterTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `hunterApi` (required) — API key authentication

## Parameters

The node exposes an operation selector. Operation-specific fields appear based on the selected operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Operation (required)

| Value | Label | Description |
|-------|-------|-------------|
| `domainSearch` | Domain Search | Get every email address found on the internet using a given domain name, with sources |
| `emailFinder` | Email Finder | Generate or retrieve the most likely email address from a domain name, a first name and a last name |
| `emailVerifier` | Email Verifier | Verify the deliverability of an email address |

### Domain Search parameters

Shown when `operation = domainSearch`. Accepts `$fromAI()` for all fields.

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

Shown when `operation = emailFinder`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `domain` | string | yes | — | Domain name from which to find the email address (e.g., "stripe.com") |
| `firstname` | string | yes | — | The person's first name |
| `lastname` | string | yes | — | The person's last name |

### Email Verifier parameters

Shown when `operation = emailVerifier`. Accepts `$fromAI()` for all fields.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `email` | string | yes | — | The email address to verify |

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped operations, parameter values are resolved per item and sent as a Hunter API request using the configured credential.

### Output

Successful requests produce items on `main[0]`. The output shape follows the Hunter API v2 response:

- **Domain Search (`domainSearch`):** When `onlyEmails = true` — array of email objects each with `value`, `type`, `confidence`, and optional metadata fields. When `onlyEmails = false` — a single object with company metadata and an `emails` array.
- **Email Finder (`emailFinder`):** Single object with `email`, `score`, `domain`, `first_name`, `last_name`, `position`, `company`, `sources`.
- **Email Verifier (`emailVerifier`):** Single object with `email`, `result` (deliverable/undeliverable/risky/unknown), `score`, and verification flags.

The implementation must not replace the service response with a generic envelope — the Hunter API response shape is the output contract.

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target operation at inference time
- Populating domain, name, email, and filter parameters from model-generated values
- Providing clear descriptions for each parameter to guide model selection

### Errors

- Missing or invalid credentials: thrown as `NodeApiError` with descriptive context; not caught by `continueOnFail`.
- Rate limiting (HTTP 429): thrown; implementers should consider retry or backoff.
- Invalid parameters (HTTP 400) or resource not found (HTTP 404): surfaced via `NodeApiError` with the API error details.
- When `continueOnFail` is enabled, failed items emit an output item with `{ error: <message> }` instead of throwing.

### Expressions

All string parameters accept expression strings. Boolean and numeric parameters accept expressions resolving to the correct type. Filter arrays accept expressions resolving to arrays.

## Acceptance tests

### Test: agent performs domain search

**Given** a connected AI agent that decides to find email addresses for "stripe.com".

**Parameters:** operation `domainSearch`, domain `stripe.com`, onlyEmails `true`, limit `10`.

**Expect:** output[0] contains an array of email objects each with `value`, `type`, `confidence`. Length ≤ 10.

### Test: agent performs email finder

**Given** a connected AI agent that decides to find an email for a person at a company.

**Parameters:** operation `emailFinder`, domain `stripe.com`, firstname `John`, lastname `Doe`.

**Expect:** output[0] contains an object with `email`, `score`, `domain`, `first_name`, `last_name`, `sources`.

### Test: agent performs email verification

**Given** a connected AI agent that decides to verify an email address.

**Parameters:** operation `emailVerifier`, email `john.doe@stripe.com`.

**Expect:** output[0] contains an object with `email`, `result` (one of deliverable/undeliverable/risky/unknown), `score`.

### Test: continue on fail — partial success

**Given** input items where one domain is invalid and one is valid.

**Parameters:** operation `domainSearch`, domain expression per item, limit `5`.

**Node config:** `continueOnFail = true`

**Expect:** output[0] contains two items: first has `{ error: ... }`, second has array of email objects.

### Test: agent decides operation at inference time

**Given** a connected AI agent with a `$fromAI()` compatible hunterTool node.

**Parameters:** operation, domain, and other fields not set — left for the model to populate.

**Expect:** the agent selects an operation, fills required parameters, and the node produces a successful output matching the operation's response shape.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`hunterTool`) | inferred | Follows the `<base>T` naming convention for tool variants confirmed in other tool specs (zendeskTool, slackTool, etc.) |
| Operations (3) | documented | Public n8n docs confirm Domain Search, Email Finder, Email Verifier. Tool variant shares same operation inventory. |
| Credentials | documented | `hunterApi` API-key credential confirmed by public n8n docs. |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs. |
| Hunter API v2 response shape | external | Hunter API reference describes all response fields; not duplicated here to avoid mirroring third-party schema. |
| Rate limit handling | inferred | Standard HTTP 429 behavior; no node-level configuration for rate limits. |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/hunterTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
