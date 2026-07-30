---
type: n8n-nodes-base.jwt
displayName: JWT
category: Development
versions: [1]
priority: medium
status: specced
---

# JWT

Work with JSON Web Tokens in workflows: **sign**, **verify**, and **decode**
tokens. Signing builds a JWT from claims using key material from a JWT
credential; verify checks a token's signature and time claims; decode reads a
token's payload without checking the signature.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.jwt.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jwt.md | Public docs only (credentials) |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` + `dist/types/credentials.json`) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.jwt`
- **Aliases:** `Token`, `Key`, `JSON`, `Payload`, `Sign`, `Verify`, `Decode`
  (palette / codex search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `jwtAuth` — **required** (**descriptor** + **documented**).
  The node always requires a JWT credential, even for **decode** (which does
  not use the key material) (**inferred** from `required: true` on the
  descriptor).
- **AI tool:** `usableAsTool: true` — this node can be used as an AI tool;
  many parameters may be set automatically by an agent (**documented** +
  **descriptor**).

### Credential fields (`jwtAuth`)

| Field | name | type | default | show when | Notes (**documented**) |
|-------|------|------|---------|-----------|------------------------|
| Key Type | `keyType` | options | `passphrase` | — | `passphrase` \| `pemKey` |
| Secret | `secret` | string (password) | `""` | `keyType=passphrase` | HMAC secret used to sign/verify HMAC algorithms |
| Private Key | `privateKey` | string (password) | `""` | `keyType=pemKey` | PEM private key for signing (RSA/ECDSA) |
| Public Key | `publicKey` | string (password) | `""` | `keyType=pemKey` | PEM public key for verifying (RSA/ECDSA) |
| Algorithm | `algorithm` | options | `HS256` | — | `HS256` \| `HS384` \| `HS512` \| `RS256` \| `RS384` \| `RS512` \| `ES256` \| `ES384` \| `ES512` \| `PS256` \| `PS384` \| `PS512` \| `none` |

**Key type → algorithm pairing (**documented**):**
- **Passphrase** → HMAC algorithms (`HS256`/`HS384`/`HS512`); the `secret` is
  the shared key for both sign and verify.
- **PEM Key** → RSA / ECDSA / RSASSA-PSS algorithms (`RS*`, `ES*`, `PS*`);
  signing uses `privateKey`, verifying uses `publicKey`.

The `jwtAuth` credential is also shared by `webhook`, `respondToWebhook`, and
`wait` nodes (**descriptor** `supportedNodes`).

## Parameters

`operation` selects the action. Parameter visibility is governed by
`displayOptions` on `operation` (and, for sign, on `useJson`; for options, on
`/operation`).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `sign` | yes | — | `decode` \| `sign` \| `verify` (**documented** + **descriptor**); `noDataExpression` |
| useJson | boolean | `false` | no | operation = `sign` | When on, build claims from `claimsJson`; when off, use the `claims` collection (**documented** + **descriptor**) |
| claims | collection | `{}` | no | operation = `sign`; useJson = `false` | Registered-claim collection (see below) (**documented** + **descriptor**) |
| claimsJson | json | `{\n  "my_field_1": "value 1",\n  "my_field_2": "value 2"\n}\n` | no | operation = `sign`; useJson = `true` | Arbitrary JSON object used as the token payload; `validateType: object`, `ignoreValidationDuringExecution: true` (**documented** + **descriptor**) |
| token | string (password) | `""` | yes | operation ∈ `verify`, `decode` | The token to verify or decode; `validateType: jwt` (**documented** + **descriptor**) |
| options | collection | `{}` | no | — | Node options (see below) (**documented** + **descriptor**) |

### `claims` collection fields (sign, useJson = false)

Each maps to a standard RFC 7519 registered claim (**documented**).

| Field | name | type | default | RFC claim | Notes |
|------|------|------|---------|-----------|-------|
| Audience | `audience` | string | `""` | `aud` | Identifies the intended recipients |
| Expires In | `expiresIn` | number | `3600` | `exp` | Lifetime of the token in **seconds** (min 0) |
| Issuer | `issuer` | string | `""` | `iss` | Identifies the principal that issued the JWT |
| JWT ID | `jwtid` | string | `""` | `jti` | Unique identifier for the JWT |
| Not Before | `notBefore` | number | `0` | `nbf` | Seconds before which the JWT must not be accepted (min 0) |
| Subject | `subject` | string | `""` | `sub` | Identifies the subject of the JWT |

With `useJson=false` only these six registered claims can be set. To include
custom/private claims, use `useJson=true` and provide them in `claimsJson`
(**documented**).

### `options` collection fields

| Field | name | type | default | show when (`/operation`) | Notes |
|------|------|------|---------|--------------------------|-------|
| Return Additional Info | `complete` | boolean | `false` | `verify`, `decode` | On = return full decoded token (header + payload + signature); off = payload only (**documented**) |
| Ignore Expiration | `ignoreExpiration` | boolean | `false` | `verify` | Skip the `exp` claim check (**documented**) |
| Ignore Not Before Claim | `ignoreNotBefore` | boolean | `false` | `verify` | Skip the `nbf` claim check (**documented**) |
| Clock Tolerance | `clockTolerance` | number | `0` | `verify` | Seconds of tolerance when checking `nbf` and `exp` (min 0) (**documented**) |
| Key ID | `kid` | string | `""` | `sign` | Optional `kid` JOSE header claim, used to signal the key for validation (**documented** + **descriptor**) |
| Override Algorithm | `algorithm` | options | `HS256` | `sign`, `verify` | Algorithm for sign/verify; overrides the credential's algorithm (**documented** + **descriptor**) |

**`options.algorithm` enum (descriptor):** `ES256`, `ES384`, `ES512`, `HS256`,
`HS384`, `HS512`, `PS256`, `PS384`, `PS512`, `RS256`, `RS384`, `RS512`.

> Note: the credential `algorithm` enum also includes `none`, but the node's
> `options.algorithm` override does **not** list `none` (**descriptor**).

## Runtime behavior

### Input

- One operation per input item (standard item loop) (**inferred**).
- **sign:** payload is built from `claims` (useJson=false) or `claimsJson`
  (useJson=true). Registered claims are mapped to their RFC 7519 short names
  (`aud`, `exp`, `iss`, `jti`, `nbf`, `sub`) (**documented**).
- **verify / decode:** the token is read from the `token` parameter
  (**documented**).

### Claim time semantics (sign)

- `expiresIn` (seconds) → `exp` = sign time + `expiresIn` (**documented** as
  "lifetime of the token in seconds"; **inferred** that it is an offset from
  now).
- `notBefore` (seconds) → `nbf` = sign time + `notBefore` (**inferred** offset
  from now, mirroring `expiresIn`; default `0` = immediately valid).
- A claim left at its empty/zero default is omitted from the payload rather
  than emitted as an empty string (**inferred**).

### Output

| operation | Output shape |
|-----------|--------------|
| **sign** | The signed JWT string is written to the output item. The exact JSON key is **not documented**; inferred to be placed under `item.json.token` (mirroring the `token` input parameter), with other input fields preserved (**inferred**). |
| **decode** (complete=false) | The decoded **payload** (claims object) is returned (**documented**). |
| **decode** (complete=true) | The full decoded token is returned: `{ header, payload, signature }` (**documented** + **inferred** shape from JOSE complete-decode convention). |
| **verify** (complete=false) | The decoded **payload** is returned after the signature and time claims pass (**documented**). |
| **verify** (complete=true) | The full decoded token `{ header, payload, signature }` is returned after verification (**documented** + **inferred** shape). |

The node does not change item count; it transforms each item (**inferred**).

### Verify details

- The signature is checked against the credential key material (HMAC secret for
  `HS*`; public key for `RS*`/`ES*`/`PS*`) (**documented** key-type pairing).
- `exp` is enforced unless `ignoreExpiration=true`; `nbf` is enforced unless
  `ignoreNotBefore=true`; `clockTolerance` (seconds) leeway applies to both
  (**documented**).
- `options.algorithm` overrides the credential algorithm and must match the
  token's `alg` header (**documented** + **inferred**).

### Decode details

- **Decode does not verify the signature** — it only reads the payload
  (**documented**: "only returns the payload" / "complete decoded token").
- A malformed token (wrong number of segments, invalid base64url) → fail
  (**inferred**).

### Errors

- **verify** with a bad signature, wrong key, or failed `exp`/`nbf` check (when
  not ignored) → fail (**inferred** from verify semantics).
- **sign** with a key type / algorithm mismatch (e.g. `pemKey` + `HS256`, or
  missing private key) → fail (**inferred**).
- Missing required `token` for verify/decode → fail (**inferred**).
- `continueOnFail`: a failed item yields an error on the item / empty output
  per engine policy (**inferred**).

### Expressions

`token`, `claimsJson`, the `claims` string fields (`audience`, `issuer`,
`jwtid`, `subject`), the `claims` number fields (`expiresIn`, `notBefore`),
`options.kid`, and `options.clockTolerance` accept expression strings
(`{{ … }}`) where the UI allows expressions (**inferred** — descriptor types
are plain `string`/`number`/`json`/`boolean`, which n8n evaluates as
expressions when wrapped). `operation`, `useJson`, `options.complete`,
`options.ignoreExpiration`, `options.ignoreNotBefore`, and
`options.algorithm` are `noDataExpression` / fixed-option selects and are not
expression-driven (**inferred** from descriptor).

## Acceptance tests

### Test: decode a token (payload only)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "decode",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}
```

**Expect** output[0].json:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

### Test: decode a token (complete)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "decode",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  "options": { "complete": true }
}
```

**Expect** output[0].json:

```json
{
  "header": { "alg": "HS256", "typ": "JWT" },
  "payload": { "sub": "1234567890", "name": "John Doe", "iat": 1516239022 },
  "signature": "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}
```

### Test: verify a valid token (HS256, correct secret)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "verify",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}
```

**Credentials:** `jwtAuth` with `keyType=passphrase`, `secret=your-256-bit-secret`,
`algorithm=HS256`.

**Expect** output[0].json:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

### Test: sign a token (HS256, JSON payload)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "sign",
  "useJson": true,
  "claimsJson": {
    "sub": "1234567890",
    "name": "John Doe"
  }
}
```

**Credentials:** `jwtAuth` with `keyType=passphrase`, `secret=your-256-bit-secret`,
`algorithm=HS256`.

**Expect** output[0].json.token is a three-segment base64url JWT string
(`header.payload.signature`). Decoding its header yields
`{"alg":"HS256","typ":"JWT"}`; decoding its payload yields an object containing
`sub="1234567890"` and `name="John Doe"`; the signature verifies against
`your-256-bit-secret` with HS256. (The exact token is non-deterministic because
signing injects an `iat`/timestamp.)

### Test: verify rejects a bad signature

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "verify",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
}
```

**Credentials:** `jwtAuth` with `keyType=passphrase`, `secret=wrong-secret`,
`algorithm=HS256`.

**Expect** the node fails (invalid signature). With `continueOnFail=true`, the
item carries an error and no payload is emitted (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations decode/sign/verify + params/enums/defaults | documented + descriptor | Confirmed by `dist/types/nodes.json` (v2.15.1) |
| Registered-claim → RFC short-name mapping | documented | Docs cite RFC 7519 §4.1.x for each claim |
| `expiresIn` / `notBefore` are second offsets from now | inferred | Docs say "lifetime in seconds" / "time before which…"; offset-from-now semantics inferred (mirrors `jsonwebtoken`) |
| Sign output JSON key (`token`) | inferred | No output-property parameter; key name inferred from the `token` input parameter |
| Decode/verify complete output shape `{ header, payload, signature }` | inferred | Docs say "complete decoded token with header and signature"; exact field names inferred from JOSE convention |
| Decode does not require key material but credential is still required | inferred | Descriptor marks `jwtAuth` `required: true` globally |
| Default-omitted claims (empty string / 0) are not emitted | inferred | Not stated in docs |
| `options.algorithm` omits `none` while credential includes it | descriptor | Intentional restriction at node level |
| Exact error message strings | inferred | |
| `kid` header claim emitted only on sign | documented + descriptor | Shown for `sign` only |
| Algorithm / key-type mismatch failure behavior | inferred | |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/jwt.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Implement sign/verify/decode using the platform's native JOSE/JWT
  support (e.g. Node `crypto` or a WebCrypto-based JOSE library bundled with
  OpenFlow); never load the third-party `n8n-nodes-base` package. Resolve the
  `jwtAuth` credential by `keyType`: HMAC algorithms use `secret`; RSA/ECDSA/PSS
  algorithms use `privateKey` (sign) / `publicKey` (verify). `options.algorithm`
  overrides the credential algorithm when set. Decode must not verify the
  signature. Verify must enforce `exp`/`nbf` with `clockTolerance` leeway unless
  the corresponding ignore flag is set.