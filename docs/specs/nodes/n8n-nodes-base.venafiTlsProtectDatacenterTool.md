---
type: n8n-nodes-base.venafiTlsProtectDatacenterTool
displayName: Venafi TLS Protect Datacenter Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# Venafi TLS Protect Datacenter Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.venafitlsprotectdatacenter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/venafitlsprotectdatacenter.md | Public docs only |
| https://docs.venafi.com/Docs/current/TopNav/Content/SDK/WebSDK/c-sdk-AboutThisGuide.php | Public docs only |
| https://docs.venafi.com/Docs/26.1API/index.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.venafiTlsProtectDatacenterTool`
- **Aliases:** (none; the base node `n8n-nodes-base.venafiTlsProtectDatacenter` has `usableAsTool: true`, so this is a dedicated tool variant registration)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `venafiTlsProtectDatacenterApi` (API integration — OAuth2 client_credentials with Domain + Client ID + Username + Password + Allow Self-Signed Certs)

## Parameters

The Tool variant exposes the same operations as the base Venafi TLS Protect Datacenter node, accessible from the AI Agent's Tools panel. All parameters support `$fromAI()` dynamic population.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `certificate`, `policy` | `certificate` | no | — | |
| operation | options: see below | varies | no | show on resource | see per-resource table |
| policyDn | string | — | yes | Policy: get | Distinguished Name of the policy folder |
| additionalFields (Policy) | collection | `{}` | no | Policy: get | see Policy additional fields |
| certificateId | string | — | yes | Certificate: delete, download, get | |
| returnAll | boolean | false | no | Certificate: getMany | |
| limit | number | 50 | no | Certificate: getMany, returnAll=false | |
| filters (subject etc.) | collection | `{}` | no | Certificate: getMany | sub-string match on subject |
| additionalFields (Certificate create) | collection | `{}` | no | Certificate: create | see Subject DN and key fields |
| options (Certificate create/renew) | collection | `{}` | no | Certificate: create, renew | validity period etc. |
| additionalFields (Certificate download) | collection | `{}` | no | Certificate: download | chain order, format, keystore |
| downloadItem | options: `certificate`, `keystore` | `certificate` | no | Certificate: download | |
| keystoreType | options: `PEM`, `JKS` | `PEM` | no | Certificate: download, downloadItem=keystore | |
| certificateLabel | string | — | yes | Certificate: download, downloadItem=keystore | |
| privateKeyPassphrase | string | — | yes | Certificate: download, downloadItem=keystore | |
| keystorePassphrase | string | — | yes | Certificate: download, downloadItem=keystore, keystoreType=JKS | |
| binaryProperty | string | `data` | yes | Certificate: download | output binary field name |
| existingCertificateId | string | — | no | Certificate: renew | |

### Certificate resource operations

| operation | parameters |
|-----------|------------|
| create | policyDn, additionalFields (Subject DN: commonName, organization, organizationalUnit, locality, state, country; Key: keyAlgorithm, keySize, subjectAltNames), options (validityPeriod, etc.) |
| delete | certificateId |
| download | certificateId, downloadItem, keystoreType?, certificateLabel?, privateKeyPassphrase?, keystorePassphrase?, binaryProperty, additionalFields |
| get | certificateId |
| getMany | returnAll, limit?, filters? |
| renew | certificateId, policyDn, additionalFields?, options? |

### Policy resource operations

| operation | parameters |
|-----------|------------|
| get | policyDn, additionalFields (PKCS10 string?) |

### Policy additional fields

| name | type | notes |
|------|------|-------|
| PKCS10 | string | A PKCS#10 CSR string; if provided, Subject DN and key fields in the request are ignored |

### Certificate create additional fields

| name | type | notes |
|------|------|-------|
| commonName | string | Subject CN |
| organization | string | Subject O |
| organizationalUnit | string | Subject OU |
| locality | string | Subject L |
| state | string | Subject ST |
| country | string | Subject C (2-letter ISO) |
| keyAlgorithm | options: `RSA`, `EC` | |
| keySize | number | RSA bit length (e.g. 2048, 4096) |
| subjectAltNames | string (comma-separated) | SAN DNS entries |

## Runtime behavior

### Input

Each input item is processed independently. For single-item operations (create, delete, get, download, renew), one output item per input. For list operations (getMany), multiple output items per input.

### Output

- **Certificate / Policy objects:** JSON with the full object properties returned by the Venafi Web SDK API, placed in the item `json` property.
- **Download (certificate format):** The certificate payload (PEM/DER) is written as a binary attachment named by `binaryProperty`. Original input JSON is preserved.
- **Download (keystore format):** The keystore binary is written as a binary attachment. Metadata (certificateLabel, etc.) included in JSON output.
- **getMany:** Array of certificate records in `json`.

### AI agent integration

As a Tool variant, this node is exposed in the AI Agent's tool selection panel. Parameters may be populated dynamically by the LLM via `$fromAI()`. The tool description and parameter descriptions should be written to allow the LLM to select appropriate operations autonomously. The node does not expose a separate dedicated credentials page — it shares `venafiTlsProtectDatacenterApi` credentials with the base node.

### Errors

- Venafi API errors throw with the API error message from the Venafi response.
- If `continueOnFail` is enabled, errored items go to the error output branch.
- Network/timeout errors propagate as generic execution errors.

### Expressions

All string, number, and boolean parameters accept expression strings.

## Acceptance tests

### Test: delete a certificate

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "delete",
  "certificateId": "{{ $json.certId }}"
}
```

**Expect** the executor sends `DELETE /vedsdk/certificates/{certificateId}` (or equivalent Web SDK path) and returns the API response JSON as output[0].

### Test: download a certificate as PEM

**Given** input items:

```json
[{ "json": { "certId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "download",
  "certificateId": "{{ $json.certId }}",
  "downloadItem": "certificate"
}
```

**Expect** the executor sends a GET to the certificate retrieve/download endpoint, retrieves the PEM certificate, and writes it to `binary.data` with mime type `application/x-pem-file`.

### Test: provision a new certificate

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "create",
  "additionalFields": {
    "commonName": "example.com",
    "organization": "Example Corp",
    "keyAlgorithm": "RSA",
    "keySize": 2048
  }
}
```

**Expect** the executor posts to the certificate request/provision endpoint, creates a certificate with the given Subject DN and key parameters, and returns the resulting certificate object on output[0].

### Test: get a policy

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "policy",
  "operation": "get",
  "policyDn": "\\VED\\Policy\\MyFolder"
}
```

**Expect** the executor sends a GET (or Config/ReadPolicy POST) to retrieve the policy folder and returns the policy object on output[0].

### Test: AI agent tool — get many certificates

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "getMany",
  "returnAll": true
}
```

**Expect** the executor retrieves all certificates (pagination via `_links[0].Next` pointers in responses) and returns them as an array on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | Documented in public n8n docs | Clear from base node docs page |
| Credential shape (Domain + Client ID + Username + Password) | Documented in public n8n credentials docs | OAuth2 client_credentials flow |
| Exact parameter names, defaults, nested collection structures | Inferred from published package descriptor | Datacenter VEDSDK API surface is well-known; exact displayOptions validated |
| Venafi VEDSDK API endpoint patterns | Documented by Venafi public docs | Base URL = credential domain; paths under `/vedsdk/` |
| Certificate download binary output | Inferred | Same pattern as Cloud variant |
| AI agent $fromAI() support | Known n8n Tool convention | Standard across all Tool variants |
| Error handling | Standard n8n node convention | Not Venafi-specific |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/venafiTlsProtectDatacenterTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
