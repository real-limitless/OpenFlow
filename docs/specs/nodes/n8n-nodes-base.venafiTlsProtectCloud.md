---
type: n8n-nodes-base.venafiTlsProtectCloud
displayName: Venafi TLS Protect Cloud
category: Development
versions: [1]
priority: medium
status: specced
---

# Venafi TLS Protect Cloud

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.venafitlsprotectcloud.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/venafitlsprotectcloud.md | Public docs only |
| https://docs.venafi.cloud/api/vaas-rest-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.venafiTlsProtectCloud`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `venafiTlsProtectCloudApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `certificate`, `certificateRequest` | `certificateRequest` | no | — | |
| operation | options: see below | varies | no | show on resource | see per-resource table |
| certificateId | string | — | yes | Certificate: delete, download, get | |
| downloadItem | options: `certificate`, `keystore` | `certificate` | no | Certificate: download | |
| keystoreType | options: `PEM`, `JKS` | `PEM` | no | Certificate: download, downloadItem=keystore | |
| certificateLabel | string | — | yes | Certificate: download, downloadItem=keystore | |
| privateKeyPassphrase | string | — | yes | Certificate: download, downloadItem=keystore | |
| keystorePassphrase | string | — | yes | Certificate: download, downloadItem=keystore, keystoreType=JKS | |
| binaryProperty | string | `data` | yes | Certificate: download | output binary field name |
| returnAll | boolean | false | no | getMany contexts | |
| limit | number | 50 | no | getMany, returnAll=false | |
| filters.subject | string (in filters collection) | — | no | Certificate: getMany | substring match |
| applicationId | options (dynamic) | — | no | Certificate: renew; CertificateRequest: create | loaded from Venafi API |
| existingCertificateId | string | — | no | Certificate: renew | |
| certificateIssuingTemplateId | options (dynamic) | — | no | Certificate: renew; CertificateRequest: create | loaded from Venafi API |
| certificateSigningRequest | string | — | no | Certificate: renew; CertificateRequest: create, generateCsr=false | PEM-encoded CSR |
| generateCsr | boolean | false | no | CertificateRequest: create | when true, node generates CSR internally |
| commonName | string | `n8n.io` | yes | CertificateRequest: create, generateCsr=true | |
| additionalFields | collection | — | no | CertificateRequest: create, generateCsr=true | see Additional fields below |
| certificateRequestId | string | — | yes | CertificateRequest: get | |
| options (download) | collection | — | no | Certificate: download | chain order + format |
| options (renew/create) | collection | — | no | Certificate: renew; CertificateRequest: create | validity period |

### Additional fields (for create with generateCsr=true)

| name | type | default | notes |
|------|------|---------|-------|
| keyType | options: `RSA`, `EC` | `RSA` | |
| keyCurve | options: `ED25519`, `P256`, `P384`, `P521` | `ED25519` | EC-only |
| keyLength | number | `2048` | RSA-only |
| organization | string | — | O field |
| organizationalUnits | string (multi-value) | — | OU field(s) |
| locality | string | — | L field |
| state | string | — | ST field |
| country | string | — | C field (2-letter ISO) |
| SubjectAltNamesUi | fixedCollection of `dnsNames` entries | — | each entry: Typename=`dnsNames`, name=string |

### Certificate resource operations

| operation | parameters |
|-----------|------------|
| delete | certificateId |
| download | certificateId, downloadItem, keystoreType?, certificateLabel?, privateKeyPassphrase?, keystorePassphrase?, binaryProperty, options |
| get | certificateId |
| getMany | returnAll, limit?, filters? |
| renew | applicationId, existingCertificateId, certificateIssuingTemplateId, certificateSigningRequest?, options |

### Certificate Request resource operations

| operation | parameters |
|-----------|------------|
| create | applicationId, certificateIssuingTemplateId, generateCsr, commonName?, additionalFields?, certificateSigningRequest?, options |
| get | certificateRequestId |
| getMany | returnAll, limit? |

### Download options

| name | type | default | notes |
|------|------|---------|-------|
| chainOrder | options: `ROOT_FIRST`, `EE_FIRST`, `EE_ONLY` | `ROOT_FIRST` | |
| format | options: `PEM`, `DER` | `PEM` | |

### Create/Renew options

| name | type | default | notes |
|------|------|---------|-------|
| validityPeriod | options (ISO8601): `P1Y`, `P10D`, `PT12H` | `P1Y` | for create only |

## Runtime behavior

### Input

Each input item is processed independently. For single-item operations (create, delete, get, download, renew), exactly one output item is produced per input. For list operations (getMany), multiple output items may be produced per input.

### Output

- **Certificate / Certificate Request objects:** JSON objects with the full certificate or certificate request properties returned by the Venafi API, placed in the item `json` property.
- **Download (certificate format):** The certificate payload (PEM/DER) is written to a binary attachment field named by `binaryProperty`. The original input JSON is preserved on the output item.
- **Download (keystore format):** The keystore binary is written as a binary attachment. Additional metadata fields (`certificateLabel`, `keystorePassphrase`) are included in JSON output.
- **getMany:** Array of certificate or certificate request records in `json`.

### Errors

- API errors (authentication failure, invalid certificate ID, etc.) throw a `NodeApiError` with the Venafi API error message.
- If `continueOnFail` is enabled, the item is handed to the error output branch instead of halting execution.
- Network or timeout errors propagate as generic execution errors.

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

**Expect** the executor sends `DELETE /v1/certificates/{certificateId}` to the Venafi API and returns the API response JSON as output[0].

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
  "downloadItem": "certificate",
  "options": { "format": "PEM", "chainOrder": "ROOT_FIRST" }
}
```

**Expect** the executor sends `GET /v1/certificates/{certificateId}` (or download endpoint), retrieves the PEM chain, and writes it to `binary.data` with mime type `application/x-pem-file`.

### Test: create a certificate request with auto-generated CSR

**Given** input items:

```json
[{ "json": { "appId": "app-uuid", "templateId": "tmpl-uuid" } }]
```

**Parameters:**

```json
{
  "resource": "certificateRequest",
  "operation": "create",
  "applicationId": "{{ $json.appId }}",
  "certificateIssuingTemplateId": "{{ $json.templateId }}",
  "generateCsr": true,
  "commonName": "example.com",
  "additionalFields": {
    "keyType": "RSA",
    "keyLength": 2048,
    "organization": "Example Corp",
    "country": "US"
  }
}
```

**Expect** the executor generates a CSR (2048-bit RSA, CN=example.com, O=Example Corp, C=US), posts `POST /v1/certificaterequests`, and returns the created certificate request JSON on output[0].

### Test: list certificates with filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "getMany",
  "returnAll": false,
  "limit": 25,
  "filters": { "subject": "example.com" }
}
```

**Expect** the executor sends `GET /v1/certificates?limit=25&subject=example.com` and returns up to 25 certificate records on output[0].

### Test: renew a certificate

**Given** input items:

```json
[{ "json": { "existingCertId": "cert-uuid", "appId": "app-uuid", "templateId": "tmpl-uuid" } }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "renew",
  "existingCertificateId": "{{ $json.existingCertId }}",
  "applicationId": "{{ $json.appId }}",
  "certificateIssuingTemplateId": "{{ $json.templateId }}"
}
```

**Expect** the executor sends `POST /v1/certificates/{existingCertId}/renew` with the application and template references, and returns the renewed certificate JSON on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | Documented in public n8n docs | Clear from docs page |
| Credential shape (Region + API Key) | Documented in public n8n credentials docs | Region US→cloud, EU→eu |
| Parameter names, defaults, displayOptions | Inferred from published package descriptor | Parameter API surface is well-known; exact UI nesting (displayOptions) is confirmed |
| Venafi API endpoint patterns | Documented by Venafi public API docs | Base URL: `https://api.venafi.{region}/v1/`; specific paths inferred from parameter names |
| SAN fixedCollection sub-structure | Inferred from published descriptor | Typename always `dnsNames` |
| Certificate download binary output format | Documented in public n8n docs | PEM/DER/keystore |
| Error handling principles | Standard n8n node convention | Not Venafi-specific |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/venafiTlsProtectCloud.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
