---
type: n8n-nodes-base.mailcheckTool
displayName: Mailcheck Tool
category: Utility
versions: [1]
priority: medium
status: specced
---

# Mailcheck Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailcheck.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailcheck.md | Public docs only |
| https://app.mailcheck.co/docs | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailcheckTool`
- **Aliases:** (none — the base node `n8n-nodes-base.mailcheck` is marked `usableAsTool:true`, making this an alias that exposes the same API under the Tool type)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailcheckApi` (API-key credential: API Key from Mailcheck.co dashboard)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `email` | `email` | yes | — | Single option; fixed at `email` (no meaningful selection) |
| operation | options: `check` | `check` | yes | resource=`email` | Single operation; fixed at `check` |
| email | string | — | yes | resource=`email`, operation=`check` | Email address to validate. Accepts expressions / `$fromAI()` |

All parameters accept expression strings and may be populated dynamically by the AI agent via `$fromAI()`.

## Runtime behavior

### Input

Each input item is processed independently. The `email` parameter may reference fields on the input item or be set statically.

### Output

The node calls the Mailcheck.co email verification API (POST `/api/v1/email/check` or equivalent) with the provided email address and the configured API key. The API response is returned as a JSON object attached to the output item under the field `emailCheck` (or equivalent top-level key).

The output item carries all original input item data plus the verification result.

Typical response fields include (outcome level — exact names may vary):

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | The email address that was checked |
| `result` | string | Overall verdict (e.g. `deliverable`, `undeliverable`, `risky`, `unknown`) |
| `score` | number | 0–1 confidence score (1 = highest confidence) |
| `syntax_valid` | boolean | Whether the email has valid syntax |
| `domain` | string | The domain portion of the email |
| `did_you_mean` | string or null | Suggested correction if typos are detected |
| `disposable` | boolean | Whether the email is from a disposable/temporary address provider |
| `role_account` | boolean | Whether the email is a role-based account (e.g. `admin@`, `info@`) |
| `reason` | array of strings | List of reasons for the verdict |

The node may also generate a `continueOnFail` path: if the API returns an error or the request fails, the node either throws (default) or returns an empty output item with an explicit error field, depending on the `continueOnFail` setting.

### Errors

- Missing or invalid API key → credential error; node throws
- Network or API timeout → node throws unless `continueOnFail` is enabled
- Malformed email (empty, non-string) → node should produce a result with `result: "undeliverable"` or `syntax_valid: false`

### Expressions

`email` accepts expression strings. AI agent mode populates all parameters dynamically.

## Acceptance tests

### Test: valid email via AI agent expression

**Given** input items:

```json
[{ "json": { "email": "user@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": "={{ $json.email }}"
}
```

**Expect** output[0] to contain a non-empty `json` object with an `emailCheck` (or result) key that includes `result`, `score`, and `syntax_valid` fields. The value of `email` in the result must match `"user@example.com"`.

### Test: disposable email detected

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": "test@mailinator.com"
}
```

**Expect** output[0] to contain a result object where `disposable` is `true` (or equivalent field indicates the email is from a disposable provider).

### Test: syntax-invalid email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": "not-an-email"
}
```

**Expect** output[0] to contain a result object where `syntax_valid` is `false` and `result` is not `"deliverable"`.

### Test: missing email throws error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "check",
  "email": ""
}
```

**Expect** the node to throw an error (or produce an error output if `continueOnFail`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact API URL | inferred | Mailcheck.co API docs available at app.mailcheck.co; endpoint details not fully captured in n8n docs |
| Response field names | inferred | Exact JSON keys may vary; tested outcome-level assertions |
| `$fromAI()` support | documented | Confirmed by n8n AI tool parameters documentation |
| Credential type | documented | `mailcheckApi` from n8n credentials docs |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/mailcheckTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
