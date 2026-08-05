---
type: n8n-nodes-base.awsCertificateManager
displayName: AWS Certificate Manager
category: Development
versions: [1]
priority: medium
status: specced
---

# AWS Certificate Manager

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awscertificatemanager.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws.md | Public docs only |
| https://docs.aws.amazon.com/acm/latest/APIReference/API_Operations.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsCertificateManager`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (IAM access key) or `awsAssumeRole` (Assume Role)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | string | `iam` | yes | — | `iam` or `assumeRole` |
| resource | string | `certificate` | yes | — | Always `certificate` (single resource) |
| operation | string | `renew` | yes | resource=certificate | `delete`, `get`, `getMany`, `getMetadata`, `renew` |
| certificateArn | string | — | yes | operation in (renew, get, delete, getMetadata) | The full ARN of the ACM certificate, e.g. `arn:aws:acm:region:account:certificate/uuid` |
| returnAll | boolean | `false` | no | operation=getMany | When true, fetches all matching certificates (pagination handled internally); when false, respects `limit` |
| limit | number | `100` | no | operation=getMany, returnAll=false | Maximum number of certificates to return (1–500) |
| options | object | `{}` | no | operation=getMany | Collection of optional filter fields (see below) |

### options sub-parameters (getMany only)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| certificateStatuses | string[] | `[]` | no | Filter by one or more statuses: `EXPIRED`, `FAILED`, `INACTIVE`, `ISSUED`, `PENDING_VALIDATION`, `REVOKED`, `VALIDATION_TIMED_OUT` |
| extendedKeyUsage | string[] | `[]` | no | Filter by extended key usage values (e.g. `ANY`, `CODE_SIGNING`, `TLS_WEB_SERVER_AUTHENTICATION`, etc.) |
| keyTypes | string[] | `["RSA_2048"]` | no | Include only certificates matching these key algorithm types: `EC_prime256v1`, `EC_secp384r1`, `EC_secp521r1`, `RSA_1024`, `RSA_2048`, `RSA_4096` |
| keyUsage | string[] | `[]` | no | Filter by key usage extension values (e.g. `DIGITAL_SIGNATURE`, `KEY_ENCIPHERMENT`, `CERTIFICATE_SIGNING`, etc.) |

## Runtime behavior

### Input

Each input item is processed independently. The node authenticates via the selected AWS credential variant and calls the ACM API for the configured operation.

### Output

One output item per input item. The output shape varies by operation:

- **delete:** The raw ACM API response (typically `{}` on success).
- **get:** Returns the full certificate detail object from `DescribeCertificate`, including `CertificateArn`, `DomainName`, `Subject`, `Issuer`, `NotBefore`, `NotAfter`, `Status`, `Type`, `KeyAlgorithm`, `SignatureAlgorithm`, `SubjectAlternativeNames`, and other ACM certificate attributes.
- **getMetadata:** Same as `get` but returns only the metadata subset (the output of `DescribeCertificate` without the certificate body/chain).
- **getMany:** Returns an array of certificate summary objects, each containing `CertificateArn`, `DomainName`, `Status`, `Type`, `KeyAlgorithm`, `SubjectAlternativeNameSummaries`, etc.
- **renew:** The raw `RenewCertificate` API response (typically `{}` on success).

### Errors

- The node throws if the certificate ARN is invalid, the certificate does not exist, or the caller lacks sufficient IAM permissions.
- If `continueOnFail` is enabled, the failing item is passed through with an `error` property instead of stopping execution.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: get certificate by ARN

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "get",
  "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

**Expect** output[0]:
```json
[{ "json": { "CertificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "DomainName": "example.com", "Status": "ISSUED", "Type": "AMAZON_ISSUED", "KeyAlgorithm": "RSA-2048", "SignatureAlgorithm": "SHA256WITHRSA", "NotBefore": "2025-01-01T00:00:00Z", "NotAfter": "2026-01-01T00:00:00Z", "Subject": "CN=example.com", "SubjectAlternativeNames": ["example.com"] } }]
```

### Test: list certificates with status filter

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "getMany",
  "returnAll": false,
  "limit": 50,
  "options": {
    "certificateStatuses": ["ISSUED"]
  }
}
```

**Expect** output[0] to contain an array of certificate summary objects, each with `CertificateArn`, `DomainName`, `Status`, and `KeyAlgorithm` fields.

### Test: delete a certificate

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "delete",
  "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

**Expect** output[0] to contain the ACM API response for a successful deletion.

### Test: renew a certificate

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "renew",
  "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

**Expect** output[0] to contain the `RenewCertificate` API success response.

### Test: get certificate metadata

**Parameters:**

```json
{
  "resource": "certificate",
  "operation": "getMetadata",
  "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

**Expect** output[0] to contain the certificate metadata (DescribeCertificate response without the certificate body/chain).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation set | documented | Public n8n docs confirm 5 operations: Delete, Get, Get Many, Get Metadata, Renew |
| Credential type | documented | AWS IAM (access key + secret) or Assume Role, standard for all AWS nodes |
| Parameters | documented + inferred | `certificateArn` confirmed via public n8n docs; filter options (`certificateStatuses`, `extendedKeyUsage`, `keyTypes`, `keyUsage`) inferred from ACM ListCertificates API |
| Return All / Limit | inferred from n8n pattern | Standard pagination pattern shared across all n8n AWS list operations |
| UI organization | not applicable | Spec describes functional parameters, not UI groupings |
| The corpus shows spurious `bucketName`/`certificateKey` fields under operation `delete` — likely a packaging defect in the corpus (S3 fields bleeding into ACM descriptor). Public docs confirm ACM Delete only requires a Certificate ARN. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/AwsCertificateManager.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
