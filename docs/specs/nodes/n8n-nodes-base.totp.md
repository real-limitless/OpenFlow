---
type: n8n-nodes-base.totp
displayName: TOTP
category: Transform
versions: [1]
priority: low
status: specced
---

# TOTP

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.totp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/totp.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.totp`
- **Aliases:** `2FA`, `MFA`, `authentication`, `Security`, `OTP`, `password`, `multi`, `factor`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `totpApi` (TOTP credential — see credentials doc)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed | `generateSecret` | yes | — | Only operation. Computes the current TOTP code from the credential secret. |
| algorithm | string | `SHA1` | no | — | HMAC algorithm. Accepted values include SHA1, SHA256, SHA512. |
| digits | number | `6` | no | — | Length of the generated one-time code. |
| period | number | `30` | no | — | Validity window in seconds for each generated code. |

### Credential: totpApi

- **secret** (string, required): Base32-encoded shared secret key (e.g. `BVDRSBXQB2ZEL5HE`).
- **label** (string, required): URI-encoded account identifier (e.g. `GitHub:john-doe`), used for display only.

## Runtime behavior

### Input

Each input item is processed independently. The input JSON is passed through unchanged; the node does not consume or modify incoming fields.

### Output

For each input item, the node produces one output item containing:

- **All original input properties** (passthrough).
- A field named `totpCode` (or equivalent) containing the computed time-based one-time password as a string.

The code is derived by applying the configured HMAC algorithm to the credential's shared secret and the current Unix time divided by the period, then truncating to the configured digit count.

### Errors

- If no credential is attached or the credential lacks a valid `secret`, the node throws an error.
- Invalid `algorithm` values cause a validation error.
- Non-numeric `digits` or `period` values cause a parameter validation error.

### Expressions

All option parameters (`algorithm`, `digits`, `period`) accept expression strings.

## Acceptance tests

### Test: basic SHA1 6-digit 30s

**Given** a TOTP credential with a known secret `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` (base32).

**Parameters:**
```json
{}
```

**Expect** output[0] to contain:
```json
{
  "totpCode": "<6-digit numeric string>"
}
```

Passthrough fields from the input item are preserved.

### Test: custom algorithm (SHA256)

**Given** the same TOTP credential.

**Parameters:**
```json
{
  "algorithm": "SHA256",
  "digits": 8,
  "period": 30
}
```

**Expect** output[0]:
```json
{
  "totpCode": "<8-digit numeric string>"
}
```

The code value differs from the SHA1 test for the same secret and time window.

### Test: custom period

**Parameters:**
```json
{
  "period": 60
}
```

**Expect** output[0]:
```json
{
  "totpCode": "<6-digit numeric string>"
}
```

The code remains stable for 60 seconds and changes less frequently than the default 30s window.

### Test: no credential errors

**Given** no credential configured.

**Parameters:**
```json
{}
```

**Expect** the node throws an error (no output items on any branch).

### Test: multi-item passthrough

**Given** input items:
```json
[
  { "json": { "userId": 1 } },
  { "json": { "userId": 2 } }
]
```

**Parameters:**
```json
{}
```

**Expect** output[0] to contain two items:
```json
[
  { "totpCode": "<code>", "userId": 1 },
  { "totpCode": "<code>", "userId": 2 }
]
```

Both items share the same TOTP code (same credential + same time window) but preserve their original `userId`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact output field name | Inferred | Public docs specify the node "generates a TOTP" but do not name the output property. The descriptor confirms a "Generate Secret" operation. |
| Accepted algorithm list | Inferred | Docs say "SHA1" is default. SHA256 and SHA512 are standard HMAC variants available in similar nodes. |
| TOTP computation internals | Inferred | Standard RFC 6238 TOTP algorithm (HMAC-SHA-*/time-step truncation). Exact algorithm details per library are an implementation concern. |
| Credential schema | Documented | Public credential docs specify secret (Base32) and label fields. |
| AI tool metadata | Documented | Node is marked as usable as an AI tool. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/totp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only