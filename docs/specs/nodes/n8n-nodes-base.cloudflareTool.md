---
type: n8n-nodes-base.cloudflareTool
displayName: Cloudflare Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# Cloudflare Tool

The Cloudflare Tool is the AI-agent tool variant of the standard Cloudflare node (`n8n-nodes-base.cloudflare`).
It exposes Zone Certificate management operations as callable tool functions for AI agents via the Cloudflare API.
In tool mode, parameters can be populated dynamically via `$fromAI()` expressions.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cloudflare/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cloudflare/ | Public docs only |
| https://developers.cloudflare.com/api/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.cloudflareTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1, `ai_tool` × 1
- **Outputs:** `main` × 1
- **Credentials:** `cloudflareApi` (API token)

The node definition has `usableAsTool: true`, which n8n treats as a Tool variant.
In OpenFlow, this should be a separate executor with an `ai_tool` input alongside `main`.

## Parameters

All parameters are identical to the base Cloudflare node (`n8n-nodes-base.cloudflare`).

### Resource: Zone Certificate

| name | type | default | required | display options | notes |
|------|------|---------|----------|-----------------|-------|
| resource | hidden | `zoneCertificate` | yes | — | Fixed to Zone Certificate |
| operation | options | `upload` | yes | resource = zoneCertificate | Delete / Get / Get Many / Upload |
| zoneId | options | — | yes | all operations | Zone name or ID; options loaded dynamically from Cloudflare API |
| certificate | string | — | yes | operation = upload | PEM-encoded leaf certificate content |
| privateKey | string | — | yes | operation = upload | PEM-encoded private key |
| certificateId | string | — | yes | operation = get, delete | ID of the zone certificate to retrieve or remove |
| returnAll | boolean | false | no | operation = getMany | Return all matching records vs limit |
| limit | number | 25 | no | operation = getMany, returnAll = false | Max results (1–50) |
| filters | collection | {} | no | operation = getMany | Filter by status (active / expired / deleted / pending) |

## Runtime behavior

### Input

- Standard `main` input: accepts items from upstream nodes; per-item execution.
- `ai_tool` input: receives tool-call arguments from the calling AI agent. The agent may supply any subset of parameters dynamically via `$fromAI()`.

### Output

Each operation emits one output item per input item with the Cloudflare API response body.

- **Delete:** `{ "success": true }` on success.
- **Get:** The zone certificate object including `id`, `hostnames`, `expires_on`, `status`, `certificate`, `private_key`.
- **Get Many:** Array of zone certificate objects under the `results` key; paginated via `returnAll`/`limit`.
- **Upload:** The created zone certificate object including `id`, `hostnames`, `expires_on`, `status`.

### Errors

- Invalid or missing credentials: throw `NodeOperationError`.
- API errors (invalid zone, certificate format, quota): throw `NodeApiError` with the Cloudflare API error message.
- `continueOnFail`: standard behavior — item is not output on error unless enabled.
- In tool mode, errors should be returned to the AI agent as structured tool error responses.

### Expressions

All parameters support `$fromAI()` for dynamic agent-driven population.
Standard expression syntax (`$json`, `$()`) also works on both `main` and `ai_tool` inputs.

## Acceptance tests

### Test: upload-zone-certificate

**Given** input items:
```json
[{
  "json": {
    "resource": "zoneCertificate",
    "operation": "upload",
    "zoneId": "example.com",
    "certificate": "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"
  }
}]
```

**Expect** output[0]:
```json
[{
  "json": {
    "success": true,
    "result": {
      "id": "zone-cert-123",
      "status": "pending"
    }
  }
}]
```

### Test: get-many-certificates

**Given** input items:
```json
[{
  "json": {
    "resource": "zoneCertificate",
    "operation": "getMany",
    "zoneId": "example.com",
    "returnAll": false,
    "limit": 10,
    "filters": { "status": "active" }
  }
}]
```

**Expect** output[0]:
```json
[{
  "json": {
    "success": true,
    "result": {
      "certificates": [
        { "id": "zone-cert-123", "status": "active" }
      ]
    }
  }
}]
```

### Test: get-single-certificate

**Given** input items:
```json
[{
  "json": {
    "resource": "zoneCertificate",
    "operation": "get",
    "zoneId": "example.com",
    "certificateId": "zone-cert-123"
  }
}]
```

**Expect** output[0]:
```json
[{
  "json": {
    "success": true,
    "result": {
      "id": "zone-cert-123",
      "status": "active",
      "hostnames": ["example.com"],
      "expires_on": "2027-08-05"
    }
  }
}]
```

### Test: delete-certificate

**Given** input items:
```json
[{
  "json": {
    "resource": "zoneCertificate",
    "operation": "delete",
    "zoneId": "example.com",
    "certificateId": "zone-cert-123"
  }
}]
```

**Expect** output[0]:
```json
[{
  "json": {
    "success": true,
    "result": null
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Zone Certificate operations | documented | 4 operations confirmed in public n8n docs: Delete, Get, Get Many, Upload |
| Parameter shapes | inferred from corpus | `zoneId` (dynamic zone list), `certificate`, `privateKey`, `certificateId`, `returnAll`, `limit`, `filters.status` — extracted at high level; names match common Cloudflare API conventions |
| Credential type | documented | `cloudflareApi` — API token |
| Tool-specific behavior | inferred | Follows the established pattern: `usableAsTool: true`, `$fromAI()` support, `ai_tool` input |
| Cloudflare API endpoint | documented | Zone-level authenticated origin pulls API at `api.cloudflare.com` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/cloudflareTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
