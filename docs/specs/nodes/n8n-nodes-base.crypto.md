---
type: n8n-nodes-base.crypto
displayName: Crypto
category: Development
versions: [1, 2]
priority: medium
status: specced
---

# Crypto

Perform cryptographic operations in workflows: decrypt, encrypt, generate a
random string, hash a text or file, HMAC a text or file, and sign a string
using a private key.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.crypto.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/crypto.md | Public docs only (credentials) |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, v1/v2 `.schema.js`) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.crypto`
- **Aliases:** `Encrypt`, `SHA`, `Hash` (palette / codex search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** optional — type `crypto`. Required only for actions that
  need key material: **Hmac** (Hmac Secret), **Sign** (Private Key), **Encrypt**
  / **Decrypt** (Encryption Passphrase for symmetric; Encryption Public Key +
  Encryption Private Key for asymmetric). All credential fields are optional —
  configure only the field the action needs (**documented**).
- **AI tool:** This node can be used as an AI tool; many parameters may be set
  automatically by an agent (**documented**).

### Credential fields (`crypto`)

| Field | Used by | Notes (**documented**) |
|-------|---------|------------------------|
| Hmac Secret | Hmac | Secret for HMAC |
| Private Key | Sign | Private key (PEM) for signing |
| Encryption Passphrase | Encrypt / Decrypt (symmetric) | ≥16 random chars or strong passphrase |
| Encryption Public Key | Encrypt (asymmetric) | RSA public key, PEM / SPKI |
| Encryption Private Key | Decrypt (asymmetric) | RSA private key, PEM / PKCS#8 |

## Parameters

`action` selects the operation. Parameter visibility is governed by
`displayOptions` on `action` (and, for `generate`, on `encodingType`; for
`hash`/`hmac`, on `binaryData`).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| action | options | `hash` | yes | — | `generate` \| `hash` \| `hmac` \| `sign` (+ `encrypt` \| `decrypt` per docs; not in v2.15.1 schema) (**documented**; wire enum **descriptor**) |
| value | string \| expression | | yes* | action ∈ hash, hmac, sign; binaryData=false | Value to hash / HMAC / sign (**documented**; wire name **descriptor**) |
| type | options | | yes* | action ∈ hash, hmac | Hash algorithm: `MD5` \| `SHA256` \| `SHA3-256` \| `SHA3-384` \| `SHA3-512` \| `SHA384` \| `SHA512` (**documented** + **descriptor**) |
| binaryData | boolean | `false` | no | action ∈ hash, hmac | True = hash/HMAC bytes from a binary property (**documented**; default **descriptor**) |
| binaryPropertyName | string \| expression | | yes* | action ∈ hash, hmac; binaryData=true | Name of input binary property to read (**documented** label; wire name **descriptor**) |
| dataPropertyName | string \| expression | | yes* | action ∈ hash, hmac, sign, generate | Output property name to write the result to (**documented**; wire name **descriptor**) |
| encoding | options | | yes* | action ∈ hash, hmac, sign | Output encoding: `base64` \| `hex` (**documented** + **descriptor**) |
| algorithm | options \| expression | | yes* | action = sign | Sign algorithm, e.g. `RSA-SHA256`, `sha256`, `sha512`, … (full enum below) (**documented**; wire enum **descriptor**) |
| encodingType | options | `uuid` | yes* | action = generate | `ascii` \| `base64` \| `hex` \| `uuid` (**documented**; default inferred from descriptor defaults context) |
| stringLength | number \| expression | `32` | no | action = generate; encodingType ∈ ascii, base64, hex | Length of generated string; ignored for `uuid` (**documented** default = 32) |
| mode | options | | yes* | action ∈ encrypt, decrypt | `symmetric` (Passphrase) \| `asymmetric` (RSA) (**documented**; wire name **inferred** — not in v2.15.1 schema) |
| cipher | options | | yes* | action ∈ encrypt, decrypt; mode = symmetric | `AES-256-GCM` \| `AES-192-GCM` \| `AES-128-GCM` \| `ChaCha20-Poly1305` (**documented**; wire name **inferred**) |

\*Required when the action’s `displayOptions` show the field.

**Sign `algorithm` enum (descriptor):** `RSA-MD5`, `RSA-RIPEMD160`,
`RSA-SHA1`, `RSA-SHA1-2`, `RSA-SHA224`, `RSA-SHA256`, `RSA-SHA3-224`,
`RSA-SHA3-256`, `RSA-SHA3-384`, `RSA-SHA3-512`, `RSA-SHA384`, `RSA-SHA512`,
`RSA-SHA512/224`, `RSA-SHA512/256`, `RSA-SM3`, `blake2b512`, `blake2s256`,
`id-rsassa-pkcs1-v1_5-with-sha3-224`, `…-sha3-256`, `…-sha3-384`,
`…-sha3-512`, `md5`, `md5-sha1`, `md5WithRSAEncryption`, `ripemd`,
`ripemd160`, `ripemd160WithRSA`, `rmd160`, `sha1`, `sha1WithRSAEncryption`,
`sha224`, `sha224WithRSAEncryption`, `sha256`, `sha256WithRSAEncryption`,
`sha3-224`, `sha3-256`, `sha3-384`, `sha3-512`, `sha384`,
`sha384WithRSAEncryption`, `sha512`, `sha512-224`, `sha512-224WithRSAEncryption`,
`sha512-256`, `sha512-256WithRSAEncryption`, `sha512WithRSAEncryption`,
`shake128`, `shake256`, `sm3`, `sm3WithRSAEncryption`, `ssl3-md5`,
`ssl3-sha1`.

### Version differences

- **v1** (`CryptoV1`): `hmac` reads the secret from an inline `secret`
  parameter; `sign` reads the key from an inline `privateKey` parameter
  (**descriptor**).
- **v2** (`CryptoV2`, current): `hmac` reads the Hmac Secret from `crypto`
  credentials; `sign` reads the Private Key from `crypto` credentials.
  `secret` / `privateKey` inline parameters are removed (**descriptor** +
  **documented**).
- **encrypt / decrypt** are documented but absent from the v2.15.1 package
  schema; treat as current-doc behavior with inferred wire names (see Gaps).

## Runtime behavior

### Input

- One cryptographic operation per input item (standard item loop) (**inferred**).
- For `hash` / `hmac` with `binaryData=true`, the bytes to process are read
  from `item.binary[binaryPropertyName]` (**documented** + **descriptor**).
- Otherwise the UTF-8 bytes of the `value` string are processed (**documented**).
- `encrypt` / `decrypt` operate on the `value` string; `decrypt` expects the
  base64 string produced by `encrypt` (**documented**).

### Output

| action | Output shape |
|--------|--------------|
| **hash** | Same item count as input; result written to `item.json[dataPropertyName]` in the chosen `encoding`. |
| **hmac** | Same; HMAC digest written to `dataPropertyName`. |
| **sign** | Same; signature written to `dataPropertyName`. |
| **generate** | Same; random string written to `dataPropertyName`. |
| **encrypt** | Same; ciphertext written to `dataPropertyName` as a **base64** string (symmetric: authenticated-cipher output including IV/tag; asymmetric: RSA-encrypted) (**documented**). |
| **decrypt** | Same; plaintext written to `dataPropertyName` (**documented**). |

The node does not add a new item or change item count; it augments each item’s
JSON (**inferred** from “write the result to a property” semantics).

### Encrypt / Decrypt details

- **Symmetric (Passphrase):** uses an authenticated cipher selected by `cipher`
  (`AES-256-GCM`, `AES-192-GCM`, `AES-128-GCM`, `ChaCha20-Poly1305`) keyed from
  the **Encryption Passphrase** credential. The same cipher must be used to
  decrypt. Output is base64; `decrypt` consumes that base64 (**documented**).
- **Asymmetric (RSA):** `encrypt` uses the **Encryption Public Key**; `decrypt`
  uses the **Encryption Private Key**. RSA can only encrypt small payloads
  (~190 bytes with a 2048-bit key); use symmetric mode for larger data
  (**documented**).

### Errors

- Action requiring a credential but none configured / field empty → fail
  (**inferred** standard credential resolution).
- `decrypt` with a cipher/mode that does not match the value’s encryption, or a
  malformed/base64 value, or wrong passphrase/key → authentication-tag / decrypt
  failure → fail (**inferred** from authenticated-cipher semantics).
- `generate` with `uuid` ignores `stringLength`; a non-numeric `stringLength` for
  other types → fail (**inferred**).
- Missing required `value` / `dataPropertyName` for the selected action → fail
  (**inferred**).
- `continueOnFail`: failed item yields an error on the item / empty output per
  engine policy (**inferred**).

### Expressions

`value`, `binaryPropertyName`, `dataPropertyName`, `type`, `encoding`,
`algorithm`, `encodingType`, `stringLength`, and `binaryData` accept expression
strings (`{{ … }}`) where the UI allows expressions (**descriptor** — all are
`stringOrExpression` / `numberOrExpression` / `booleanOrExpression`).
`algorithm` may alternatively be specified by ID via an expression
(**documented**).

## Acceptance tests

### Test: hash a string (SHA256, hex)

**Given** input items:

```json
[{ "json": { "message": "hello" } }]
```

**Parameters:**

```json
{
  "action": "hash",
  "type": "SHA256",
  "value": "hello",
  "dataPropertyName": "hash",
  "encoding": "hex"
}
```

**Expect** output[0]:

```json
[{ "json": { "message": "hello", "hash": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" } }]
```

### Test: generate UUID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "action": "generate",
  "encodingType": "uuid",
  "dataPropertyName": "token"
}
```

**Expect** output[0].json.token is a 36-char UUID
(`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`); `stringLength` is ignored for `uuid`.

### Test: HMAC with credential (SHA256, hex)

**Given** input items:

```json
[{ "json": { "message": "hello" } }]
```

**Parameters:**

```json
{
  "action": "hmac",
  "type": "SHA256",
  "value": "hello",
  "dataPropertyName": "hmac",
  "encoding": "hex"
}
```

**Credentials:** `crypto` with Hmac Secret = `mysecret`.

**Expect** output[0]:

```json
[{ "json": { "message": "hello", "hmac": "f09399f0c446d84b31a080e57ec483392d41e6f512f3e7ada5027abbcd358c2a" } }]
```

### Test: hash a binary property

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": { "data": "aGVsbG8=", "mimeType": "application/octet-stream" }
  }
}]
```

**Parameters:**

```json
{
  "action": "hash",
  "type": "SHA256",
  "binaryData": true,
  "binaryPropertyName": "data",
  "dataPropertyName": "hash",
  "encoding": "hex"
}
```

**Expect** output[0].json.hash = `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`
(SHA256 of the bytes `hello`).

### Test: encrypt then decrypt round-trip (symmetric AES-256-GCM)

**Given** input items:

```json
[{ "json": { "secret": "top secret" } }]
```

**Encrypt parameters:**

```json
{
  "action": "encrypt",
  "mode": "symmetric",
  "cipher": "AES-256-GCM",
  "value": "top secret",
  "dataPropertyName": "cipher"
}
```

**Credentials:** `crypto` with Encryption Passphrase = `strong-passphrase-1234`.

**Expect** output[0].json.cipher is a non-empty base64 string (non-deterministic
due to random IV). Feeding that base64 back into `decrypt` with the same
passphrase and cipher must yield the original `top secret` in
`dataPropertyName` (**documented** round-trip contract).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Actions generate/hash/hmac/sign + params/enums/defaults | documented + descriptor | Confirmed by v2.15.1 `.schema.js` |
| Actions encrypt/decrypt | documented (docs), absent from v2.15.1 schema | Docs ahead of package snapshot; wire names `mode`/`cipher` inferred from labels |
| Sign `algorithm` full enum | descriptor | Long enum from `.schema.js`; docs say “choose from list or expression ID” |
| v1 inline `secret`/`privateKey` → v2 credentials | descriptor + documented | v2 moves key material to `crypto` credential |
| Output item-count / augmentation semantics | inferred | Docs say “write the result to a property”; exact retained-field set inferred |
| Default `type` (hash/hmac) and `encoding` | gap | Not stated in docs or schema defaults |
| Default `action` | inferred (hash) | Descriptor defaults context uses `action:"hash"` |
| KDF / key-derivation from passphrase (symmetric) | gap | Docs say “authenticated cipher”; exact KDF (PBKDF2 iterations, salt handling) not documented |
| RSA key sizes / padding scheme | gap | Only ~190-byte @ 2048-bit payload limit documented |
| Exact error message strings | inferred | |
| `stringLength` default = 32 | documented | UUID ignores it |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/crypto.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Use the platform’s native crypto (Node `crypto` / WebCrypto) behind
  the executor; never load third-party workflow node packages. Resolve `crypto`
  credential fields per action. Symmetric encrypt/decrypt must use an
  authenticated AEAD cipher and emit IV+tag in the base64 payload so decrypt is
  self-describing.