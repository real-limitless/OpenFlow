---
type: n8n-nodes-base.hubspotTool
displayName: HubSpot (AI Tool)
category: AI Tool
versions: [2, 2.1, 2.2]
priority: high
status: specced
---

# HubSpot (AI Tool)

A reduced-surface AI agent tool variant of the HubSpot node, corresponding to HubSpot V2 (which declares `usableAsTool: true`). When connected to an AI Agent, the model can dynamically populate parameters using `$fromAI()`. Supports **Contact**, **Contact List**, **Company**, **Deal**, **Engagement**, and **Ticket** resources against the HubSpot CRM API v3 with a focused set of operations suitable for agent-driven workflows. The full Form resource (available in the V1 base node) is not part of this tool variant.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hubspot/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/hubspot.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.hubspot.com/docs/api/overview | External API docs |
| CORPUS_DIR (npm package descriptor metadata, /tmp only) | Used to confirm type string, resource/operation enums, credential class names, and `usableAsTool` flag |

## Wire format

- **Type string:** `n8n-nodes-base.hubspotTool`
- **Aliases:** (none; the base type is `n8n-nodes-base.hubspot` V2 with `usableAsTool: true`)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `hubspotAppToken` (Service Key / App Token, recommended), `hubspotOAuth2Api` (OAuth2), or `hubspotApi` (API Key, deprecated by HubSpot)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `apiKey` | no | `apiKey` (legacy), `appToken` (recommended Service Key), or `oAuth2` (OAuth2 public app) |

### Resource and operation selection

The user selects a resource which determines available operations:

| Resource | Operations |
|----------|------------|
| Contact | Upsert (Create or Update by email), Delete, Get, Get Many, Get Recently Created/Updated, Search |
| Contact List | Add Contact (by ID or email), Remove Contact (by ID or email) |
| Company | Create, Delete, Get, Get All, Get Recently Created, Get Recently Modified, Search by Domain, Update |
| Deal | Create (with pipeline/stage selection), Delete, Get, Get All, Get Recently Created, Get Recently Modified, Search, Update |
| Engagement | Create (with type, metadata, associations), Delete, Get, Get All |
| Ticket | Create (with pipeline/stage), Delete, Get, Get All, Update |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Resource locators (company IDs, deal pipelines, owners, properties) are backed by load-options methods that query the HubSpot API
- The surface is a focused subset of full node operations suited for autonomous agent use
- Binary file uploads are not supported in this tool variant

## Runtime behavior

### Input

Consumes items from `main` input. For write operations, field values can be supplied via expressions or AI-populated parameters. Each item triggers one API call using the resolved parameters and the configured credential.

The external service contract is the HubSpot CRM API v3 at `https://api.hubapi.com/crm/v3/` (for Contact, Company, Deal, Ticket, and Contact List) and `https://api.hubapi.com/engagements/v1/` (for Engagements). Authentication uses the selected credential type.

### Output

**Output[0]** — main result:
- Get/Create/Update/Upsert operations return the HubSpot object data (single item)
- List operations return arrays of objects with pagination metadata
- Delete operations return a success confirmation containing the deleted object ID
- Upsert returns `{ vid, isNew, error? }` for contacts
- Engagement create returns `{ engagement, associations, attachments, metadata }`

### Errors

- API errors (auth failures, rate limits, invalid IDs, missing required fields) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Rate limiting: HubSpot API returns HTTP 429 on rate limit; automatic retry is not implemented

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string and number fields accept standard n8n expressions. Resource locator fields (Company ID, Deal ID, etc.) accept expressions that resolve to valid HubSpot IDs.

## Acceptance tests

### Test: Upsert a contact via AI agent

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (populated by AI model via `$fromAI()`):
```json
{
  "resource": "contact",
  "operation": "upsert",
  "email": "jane@example.com",
  "additionalFields": {
    "firstname": "Jane",
    "lastname": "Doe",
    "phone": "+12025551234"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "vid": 123456,
    "isNew": true
  }
}]
```

The response must contain the upserted contact data from the HubSpot API.

### Test: Create a deal with pipeline and stage

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "deal",
  "operation": "create",
  "stage": "appointmentscheduled",
  "additionalFields": {
    "dealname": "New Deal from AI",
    "amount": 5000
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "dealId": 98765,
    "portalId": 12345,
    "isDeleted": false
  }
}]
```

### Test: Search contacts by query

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "search",
  "filterGroupsUi": {
    "filterGroupValues": [
      {
        "filters": [
          {
            "propertyName": "email",
            "operator": "EQ",
            "value": "jane@example.com"
          }
        ]
      }
    ]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": [
    {
      "vid": 123456,
      "properties": {
        "email": { "value": "jane@example.com" },
        "firstname": { "value": "Jane" },
        "lastname": { "value": "Doe" }
      }
    }
  ]
}]
```

### Test: Get all companies with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "company",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] is an array of company objects, length <= 5, each containing `companyId`, `portalId`, `isDeleted`, and `properties`.

### Test: Create an engagement (note) associated with a contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "engagement",
  "operation": "create",
  "type": "NOTE",
  "metadata": {
    "body": "Follow-up call scheduled"
  },
  "additionalFields": {
    "contactIds": [123456]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "engagement": {
      "id": 78901,
      "type": "NOTE"
    },
    "associations": {
      "contactIds": [123456]
    }
  }
}]
```

### Test: Error on invalid contact ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "nonexistent-id-99999"
}
```

**Expect:** Execution fails with an error identifying the invalid contact ID or a 404 from the HubSpot API. With `continueOnFail`, the item appears as an error item per the SDK contract.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string `n8n-nodes-base.hubspotTool` | High | Confirmed by MANIFEST.json in CORPUS_DIR; corresponds to base node `n8n-nodes-base.hubspot` V2 with `usableAsTool: true` |
| Resource/operation list | High | Confirmed from V2 node descriptor and public docs; Form excluded from tool variant (V2 only) |
| Credential types & auth flow | High | Public credentials docs confirm three auth methods |
| AI tool wrapping pattern | High | Consistent with other `*Tool` variants (`slackTool`, `gmailTool`, `highLevelTool`) |
| Exact parameter names and defaults | Medium | Tool variant reduces surface; exact parameter names inferred from V2 descriptor |
| `$fromAI()` field coverage | Medium | All string parameters accept expressions; resource locators use load-options |
| Binary upload support | Not supported | Intentionally excluded from this tool variant |
| Engagement metadata sub-types | Low | NOTE, TASK, EMAIL, MEETING, CALL have different metadata schemas defined by HubSpot |

**Intentionally excluded from this AI Tool variant (available in full `n8n-nodes-base.hubspot` V1):**
- Form resource (getAllFields, submit operations)
- Cross-object association details for engagements beyond contact/deal IDs
- Binary file attachments on engagements

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.hubspotTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.hubspotTool', ...)` |
| **Credential aliases** | `hubspotApi` -> `hubspotApiKey`, `hubspotAppToken` -> `hubspotServiceKey`, `hubspotOAuth2Api` -> `hubspotOAuth2` |

---

## Clean-Room Citation

This spec was produced without reading n8n source implementation. All behavioral details derived from:
1. Public n8n documentation (docs.n8n.io)
2. HubSpot API docs (developers.hubspot.com)
3. CORPUS_DIR used **only** for: type string confirmation, `usableAsTool: true` flag verification, resource/operation enumeration, and credential class names.
4. Existing `n8n-nodes-base.hubspot` spec consulted for base-level HubSpot API surface details.
5. Tool pattern established by `n8n-nodes-base.highLevelTool` spec for AI tool variant structure.

No implementation algorithms, nested parameter schemas, or internal utility functions were copied.
