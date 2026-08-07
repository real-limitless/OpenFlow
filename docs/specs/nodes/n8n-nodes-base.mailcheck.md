---
type: n8n-nodes-base.mailcheck
displayName: Mailcheck
category: Utility
versions: [1]
priority: medium
status: specced
---

# Mailcheck

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailcheck/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailcheck/ | Public docs only |
| https://mailcheck.co/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailcheck`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailcheckApi` (required) — API-key Bearer token via `Authorization: Bearer <apiKey>`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | email | yes | — | Fixed to `email` (single resource) |
| operation | options | check | yes | resource:email | Fixed to `check` (single operation) |
| email | string | (empty) | yes | resource:email, operation:check | Email address to validate |

## Runtime behavior

### Input

Each input item is processed independently. The `email` parameter is read per-item, allowing different addresses per input row.

### Output

One output item per input item. Each item receives the API response from `POST /v1/singleEmail:check` merged into `json`. The response shape is determined by the Mailcheck API and includes at minimum a verdict on whether the email is valid/risky/invalid plus a trust-rate score. Input item data is carried through unchanged.

### Errors

On API error, behaviour follows the standard `continueOnFail` flag:
- If `continueOnFail` is true, the item is emitted with an `error` property and processing continues.
- If `continueOnFail` is false, execution halts and the error propagates.

### Expressions

The `email` parameter accepts expression strings.

## Acceptance tests

### Test: basic email check

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": "test@example.com"
}
```

**Expect** output[0] to contain one item whose `json` object carries the Mailcheck API response fields (e.g., `exists`, `trustRate`, `isDisposable`, `isCatchAll`) alongside the original input data.

### Test: multiple emails

**Given** input items:

```json
[
  { "json": {} },
  { "json": {} }
]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": "={{ $json.email }}"
}
```

Assume the input items each have an `email` field. The node calls the API once per item and returns the same number of output items.

### Test: invalid email format

The Mailcheck API is expected to handle malformed email addresses without crashing. The node should forward the API response, which may indicate syntax-level invalidity.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation selection | documented | Single resource (Email) and single operation (Check) confirmed in public n8n docs |
| API endpoint | inferred | `POST /v1/singleEmail:check` with body `{ email }` — not published on docs.n8n.io |
| Response shape | inferred | Mailcheck.co homepage shows sample response fields: exists, trustRate, isDisposable, isCatchAll — exact schema varies by API version |
| Credential auth | documented | Bearer token with API Key from Mailcheck dashboard |
| AI tool usage | documented | Node supports `usableAsTool: true` for AI Agent tools |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/mailcheck.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
