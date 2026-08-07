---
type: n8n-nodes-base.venafiTlsProtectCloudTool
displayName: Venafi TLS Protect Cloud Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# Venafi TLS Protect Cloud Tool

AI agent tool variant of the Venafi TLS Protect Cloud node. Shares the same two-resource (Certificate, Certificate Request) operations against the Venafi TLS Protect Cloud (now CyberArk Certificate Manager - SaaS) REST API, but is designed to be populated by AI via `$fromAI()` expressions. The base app node has `usableAsTool: true`, so the Tool variant exposes the identical parameter surface without a separate implementation.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.venafitlsprotectcloud.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/venafitlsprotectcloud.md | Public docs only |
| https://docs.venafi.cloud/api/vaas-rest-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.venafiTlsProtectCloudTool`
- **Aliases:** (none — base type `n8n-nodes-base.venafiTlsProtectCloud` is `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `venafiTlsProtectCloudApi` (required)

### Credential fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| region | options | `US` | yes | `US` or `EU` |
| apiKey | string | — | yes | Obtained from Venafi Console (avatar > Preferences > API Keys); also obtainable via VCert |

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `certificateRequest` | yes | (always shown, noDataExpression) | `certificate` or `certificateRequest` |

### Certificate operations

Shown when `resource === "certificate"`.

#### Operation selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `delete` | yes | resource=certificate | `delete`, `download`, `get`, `getMany`, `renew` |

#### Common: Certificate ID

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| certificateId | string | `""` | yes | operation in (get, delete) | The Venafi certificate ID |
| certificateId | string | `""` | yes | operation=download | Same field name reused |

#### Download-specific

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| downloadItem | options | `certificate` | yes | operation=download, resource=certificate | `certificate` or `keystore` |
| binaryProperty | string | `data` | yes | operation=download, resource=certificate | Name of the binary output field |
| keystoreType | options | `PEM` | yes | downloadItem=keystore | `JKS`, `PKCS12`, `PEM` |
| certificateLabel | string | `""` | yes | downloadItem=keystore | Label for the certificate in the keystore |
| privateKeyPassphrase | string | `""` | yes | downloadItem=keystore | Passphrase for the private key |
| keystorePassphrase | string | `""` | yes | keystoreType=JKS | Only required for JKS keystores |

#### Download options collection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| chainOrder | options | `ROOT_FIRST` | no | operation=download | `EE_FIRST`, `EE_ONLY`, `ROOT_FIRST` |
| format | options | `PEM` | no | operation=download | `PEM` or `DER` |

#### Get Many fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | false | no | operation=getMany | Paginate through all results |
| limit | number | 50 | no | returnAll=false | Max 500 |
| filters | collection | `{}` | no | operation=getMany | Contains optional `subject` (string) filter |

#### Renew fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| applicationId | options (dynamic) | `""` | no | operation=renew | Loaded via `getApplications` |
| existingCertificateId | string | `""` | no | operation=renew | |
| certificateIssuingTemplateId | options (dynamic) | `""` | no | operation=renew | Loaded via `getCertificateIssuingTemplates` |
| certificateSigningRequest | string | `""` | no | operation=renew | PEM-encoded CSR |
| options.validityPeriod | options | `P1Y` | no | operation=renew | `P1Y`, `P10D`, `PT12H` |

### Certificate Request operations

Shown when `resource === "certificateRequest"`.

#### Operation selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | resource=certificateRequest | `create`, `get`, `getMany` |

#### Create fields

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| applicationId | options (dynamic) | `""` | no | operation=create | Loaded via `getApplications` |
| certificateIssuingTemplateId | options (dynamic) | `""` | no | operation=create | Depends on `applicationId` |
| generateCsr | boolean | false | no | operation=create | If true, node generates CSR internally; if false, user supplies CSR PEM |
| commonName | string | `n8n.io` | required if generateCsr | operation=create, generateCsr=true | CN for the certificate |
| certificateSigningRequest | string | `""` | required if !generateCsr | operation=create, generateCsr=false | PEM-encoded CSR |
| additionalFields | collection | `{}` | no | operation=create, generateCsr=true | See below |
| options | collection | `{}` | no | operation=create | Contains `validityPeriod` (string, ISO8601, default `P1Y`) |

#### Additional fields (CSR generation)

| name | type | default | notes |
|------|------|---------|-------|
| keyType | options | `RSA` | `RSA` or `EC` |
| keyCurve | options | `ED25519` | `ED25519`, `P256`, `P384`, `P521`, `UNKNOWN` (only when keyType=EC) |
| keyLength | number | 2048 | Bits for RSA key generation |
| organization | string | `""` | O field |
| organizationalUnits | multi-options string | `""` | OU field(s) |
| locality | string | `""` | L field |
| state | string | `""` | ST field |
| country | string | `""` | 2-letter country code |
| SubjectAltNamesUi | fixedCollection | `{}` | DNS SAN entries by `Typename` (dnsNames) + `name` |

#### Get / Get Many (certificate requests)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| certificateRequestId | string | `""` | yes | operation=get | |
| returnAll | boolean | false | no | operation=getMany | |
| limit | number | 50 | no | operation=getMany, returnAll=false | Max 500 |

## Runtime behavior

### Input

Each input item is processed independently. For Create/Download operations that emit binary data, the binary field name is configurable via `binaryProperty` (default `data`). For Get Many operations, the node may paginate through the Venafi API.

### Output

- **Delete:** Returns the API response confirmation (typically `{ "id": "..." }`).
- **Download (certificate):** Outputs one item per certificate with `json.certificateId` and the certificate content written to `binary.<binaryProperty>`.
- **Download (keystore):** Outputs one item with `json.certificateId`, `json.keystoreType`, `json.certificateLabel`, and keystore binary data.
- **Get:** Returns the full Venafi certificate/request object as JSON.
- **Get Many:** Returns an array of certificate/request objects as multiple output items.
- **Renew:** Returns the renewed certificate object from the Venafi API.
- **Create (certificate request):** Returns the created certificate request object with status, ID, and related metadata.

### Errors

API errors (non-2xx responses from Venafi REST API) are surfaced with the HTTP status and error body. `continueOnFail` behavior is standard: on error, the item is passed to the error output if enabled.

### Expressions

All string and option parameters accept n8n expressions. The `$fromAI()` expression is the primary mechanism for AI agents to populate this Tool node's parameters dynamically.

## Acceptance tests

### Test: create certificate request with AI-generated CSR

**Given** input items:

```json
[{ "json": { "cn": "example.com", "org": "ACME Inc" } }]
```

**Parameters:**

```json
{
  "resource": "certificateRequest",
  "operation": "create",
  "applicationId": "app-123",
  "certificateIssuingTemplateId": "template-456",
  "generateCsr": true,
  "commonName": "={{ $json.cn }}",
  "additionalFields": {
    "organization": "={{ $json.org }}",
    "keyType": "RSA",
    "keyLength": 2048,
    "SubjectAltNamesUi": {
      "SubjectAltNamesValues": [
        { "Typename": "dnsNames", "name": "www.example.com" }
      ]
    }
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "certificateRequestId": "cr-...",
    "status": "PENDING",
    "applicationId": "app-123",
    "commonName": "example.com"
  }
}]
```

The `certificateRequestId` and `status` values are dynamic API responses; the shape must include at minimum an identifier and status.

### Test: download certificate as binary

**Given** input items:

```json
[{ "json": { "certId": "cert-abc-123" } }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "download",
  "certificateId": "={{ $json.certId }}",
  "downloadItem": "certificate",
  "binaryProperty": "certData",
  "options": { "chainOrder": "ROOT_FIRST", "format": "PEM" }
}
```

**Expect** output[0]:

```json
[{
  "json": { "certificateId": "cert-abc-123" },
  "binary": {
    "certData": "<PEM-encoded certificate data>"
  }
}]
```

### Test: list certificates with subject filter

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
  "limit": 10,
  "filters": { "subject": "example.com" }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "certificateId": "cert-...",
    "subject": "CN=example.com",
    "issuer": "...",
    "validityStart": "...",
    "validityEnd": "...",
    "status": "ACTIVE"
  }
}, {
  "json": { "...": "..." }
}]
```

Array of certificate objects; at minimum each has a `certificateId` and `subject`.

### Test: AI agent populates via $fromAI()

**Given** no input items:

```json
[]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "get",
  "certificateId": "={{ $fromAI('Which certificate ID?') }}"
}
```

**Expect** output[0]: The execution succeeds if the AI populates `certificateId` with a valid ID from the conversation context.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and parameters | Public docs + corpus | Public n8n docs list Certificate (delete/download/get/getMany/renew) and Certificate Request (create/get/getMany); corpus confirms exact parameter names, types, defaults, and displayOptions |
| Credential shape | Public docs | Region (US/EU) + API Key — fully documented |
| Venafi API endpoints | Inferred | Node constructs requests to `https://api.venafi.cloud/v1/` or `https://api.eu.venafi.cloud/v1/` based on region; exact endpoint paths derived from the Venafi VaaS REST API documentation |
| $fromAI() behavior | Inferred (standard pattern) | Tool variant pattern is standard across all `*Tool` nodes — parameters accept expressions; no evidence of special wrapping |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/venafiTlsProtectCloud.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
