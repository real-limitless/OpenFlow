---
type: n8n-nodes-base.cryptoTool
displayName: Crypto Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Crypto Tool (AI Tool)

A tool variant of the Crypto node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()`. Provides cryptographic operations: encryption, decryption, hashing, HMAC signing, digital signing, and random string generation.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.crypto/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/crypto/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.cryptoTool`
- **Aliases:** (none; underlying node also registered as `n8n-nodes-base.crypto`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `crypto` (conditional per action)

### Credential fields (Crypto credentials)

| field | type | used by |
|-------|------|---------|
| hmacSecret | string | Hmac |
| privateKey | string (PEM) | Sign |
| encryptionPassphrase | string | Encrypt / Decrypt (symmetric mode) |
| encryptionPublicKey | string (PEM, SPKI) | Encrypt (asymmetric mode) |
| encryptionPrivateKey | string (PEM, PKCS#8) | Decrypt (asymmetric mode) |

## Parameters

All parameters accept n8n expression strings. When used as an AI tool, parameters marked with `$fromAI()` may be populated dynamically by the LLM.

### Action selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| action | options | — | true | One of: `generate`, `hash`, `hmac`, `sign`, `encrypt`, `decrypt`. Determines which parameter group applies. |

### Generate action

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the random value to |
| `generate.type` | options | — | true | Encoding: `ascii`, `base64`, `hex`, `uuid` |
| `generate.length` | number | 32 | only for ascii/base64/hex | Character length of generated string |

### Hash action

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the hash to |
| `hash.type` | options | — | true | Algorithm: `md5`, `sha256`, `sha384`, `sha512`, `sha3-256`, `sha3-384`, `sha3-512` |
| `hash.encoding` | options | — | true | Output encoding: `base64` or `hex` |
| `hash.binaryMode` | boolean | false | — | If true, input data comes from a binary property instead of inline text |
| `hash.value` | string | — | only when binaryMode=false | The text to hash |
| `hash.binaryPropertyName` | string | — | only when binaryMode=true | Name of the binary property containing data to hash |

### HMAC action

Requires the `hmacSecret` credential field.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the HMAC to |
| `hmac.type` | options | — | true | Algorithm: same set as Hash action |
| `hmac.encoding` | options | — | true | Output encoding: `base64` or `hex` |
| `hmac.binaryMode` | boolean | false | — | If true, input data comes from a binary property |
| `hmac.value` | string | — | only when binaryMode=false | The text to HMAC |
| `hmac.binaryPropertyName` | string | — | only when binaryMode=true | Name of the binary property |

### Sign action

Requires the `privateKey` credential field.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the signature to |
| `sign.value` | string | — | true | The value to sign |
| `sign.algorithm` | options | — | true | Signing algorithm (list of known algorithms; also accepts a custom OID) |
| `sign.encoding` | options | — | true | Output encoding: `base64` or `hex` |

### Encrypt action

Requires `encryptionPassphrase` (symmetric) or `encryptionPublicKey` (asymmetric) credential fields.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the encrypted (base64) string to |
| `encrypt.mode` | options | — | true | `symmetricPassphrase` or `asymmetricRsa` |
| `encrypt.cipher` | options | — | only in symmetric mode | Authenticated cipher: `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm`, `chacha20-poly1305` |
| `encrypt.value` | string | — | true | The plaintext value to encrypt |

### Decrypt action

Requires `encryptionPassphrase` (symmetric) or `encryptionPrivateKey` (asymmetric) credential fields.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| outputPropertyName | string | — | true | Output property to write the decrypted value to |
| `decrypt.mode` | options | — | true | `symmetricPassphrase` or `asymmetricRsa` |
| `decrypt.cipher` | options | — | only in symmetric mode | Must match the cipher used during encryption (same options as Encrypt) |
| `decrypt.value` | string | — | true | Base64-encoded ciphertext to decrypt |

## Runtime behavior

### Input

Consumes one item from the `main` input. Parameter values may reference expression data from the input item's `json` or `binary` properties. Binary mode for Hash and HMAC reads from a named binary property on the input item.

### Output

Produces one output item. The result is written to the property named by `outputPropertyName` on the item's `json` data. The action result is always a string (hex, base64, or plaintext depending on the action and encoding).

For **Encrypt**, the output is a base64-encoded ciphertext string. For **Decrypt**, the output is the original plaintext. For **Generate**, the output is a random string in the chosen encoding. For **Hash**, **HMAC**, and **Sign**, the output is the cryptographic result in the chosen encoding.

### Errors

- If required credential fields are missing for the selected action, the node throws.
- If an RSA payload exceeds the key size limit (~190 bytes for 2048-bit key), the node throws.
- If decryption fails (wrong passphrase, wrong cipher, corrupted ciphertext), the node throws.
- If the signing algorithm name is invalid, the node throws.
- On error, the workflow stops unless `continueOnFail` is enabled (empty output item produced instead).

### Expressions

All action-specific parameters (value, property name, algorithm, length, etc.) accept n8n expression strings. Credential field values do not accept runtime expressions (configured statically).

### Tool-only behavior

When used as an AI agent tool (connected to an AI Agent node), the node exposes its parameters to the LLM for dynamic population via `$fromAI()`. The agent model selects the action and fills parameters. Only the parameters relevant to the selected action are shown to the agent.

## Acceptance tests

### Test: generate a random hex string

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "action": "generate",
  "generate": {
    "type": "hex",
    "length": 16
  },
  "outputPropertyName": "randomValue"
}
```

**Expect** output[0].json.randomValue to be a non-empty hex string of 32 characters.

### Test: hash a text value with SHA256

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "action": "hash",
  "hash": {
    "type": "sha256",
    "encoding": "hex",
    "binaryMode": false,
    "value": "hello world"
  },
  "outputPropertyName": "hashResult"
}
```

**Expect** output[0].json.hashResult to equal the SHA-256 hex digest of "hello world" (`b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9`).

### Test: encrypt and then decrypt a string symmetrically

**Given** input items (two passes — first encrypt, then decrypt):
```json
[{ "json": {} }]
```

**Step 1 — Encrypt parameters:**
```json
{
  "action": "encrypt",
  "encrypt": {
    "mode": "symmetricPassphrase",
    "cipher": "aes-256-gcm",
    "value": "secret data"
  },
  "outputPropertyName": "encrypted"
}
```

**Expect** output[0].json.encrypted to be a non-empty base64 string.

**Step 2 — Decrypt with same passphrase and cipher:**
```json
{
  "action": "decrypt",
  "decrypt": {
    "mode": "symmetricPassphrase",
    "cipher": "aes-256-gcm",
    "value": "={{ $json.encrypted }}"
  },
  "outputPropertyName": "decrypted"
}
```

**Expect** output[0].json.decrypted to equal "secret data".

### Test: SHA256 HMAC

**Given** input items (with Hmac Secret credential configured):
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "action": "hmac",
  "hmac": {
    "type": "sha256",
    "encoding": "hex",
    "binaryMode": false,
    "value": "message"
  },
  "outputPropertyName": "hmacResult"
}
```

**Expect** output[0].json.hmacResult to be a 64-character hex string (non-empty, valid HMAC-SHA256 digest).

### Test: missing credential throws

**Given** input items with no Crypto credentials configured:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "action": "sign",
  "sign": {
    "value": "data to sign",
    "algorithm": "sha256",
    "encoding": "hex"
  },
  "outputPropertyName": "signature"
}
```

**Expect** the node to throw an error (no output items produced) because the `privateKey` credential field is not configured.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Action list and parameters | documented | Full action list and per-action parameters confirmed in public docs |
| Credential fields | documented | Five credential fields confirmed in public docs |
| Symmetric cipher list | documented | AES-256/192/128-GCM and ChaCha20-Poly1305 confirmed |
| RSA payload size limit | documented | ~190 bytes for 2048-bit key confirmed in public docs |
| Hash and HMAC algorithm list | documented | MD5, SHA256/384/512, SHA3-256/384/512 confirmed |
| Generate type options | documented | ASCII, BASE64, HEX, UUID with default length 32 confirmed |
| Sign algorithm selection | documented | Algorithm list exists; exact available options not enumerated in public docs |
| Output property naming pattern | inferred | Consistent with n8n convention for output property parameters |
| Tool-specific $fromAI() support | documented | Common pattern across all n8n tool nodes, confirmed in public tool docs |
| Binary mode for Hash/HMAC | documented | Binary mode toggle with binary property name confirmed in public docs |
| Credential per-action display conditions | documented | HMAC requires hmacSecret, Sign requires privateKey, Encrypt/Decrypt require encryption keys |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/cryptoTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only