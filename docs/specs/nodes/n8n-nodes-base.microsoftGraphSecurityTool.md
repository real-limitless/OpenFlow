---
type: n8n-nodes-base.microsoftGraphSecurityTool
displayName: Microsoft Graph Security
category: Development
versions: [1]
priority: low
status: specced
---

# Microsoft Graph Security

Use the Microsoft Graph Security node to query and update Microsoft Secure Score data. This is an action node (not a trigger) that wraps two Microsoft Graph API resources: **Secure Score** and **Secure Score Control Profile**.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftgraphsecurity/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/securescore?view=graph-rest-1.0 | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/securescorecontrolprofile?view=graph-rest-1.0 | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftGraphSecurity` (the `Tool` suffix is an alias)
- **Aliases:** `n8n-nodes-base.microsoftGraphSecurityTool`
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `microsoftGraphSecurityOAuth2Api` (extends Microsoft OAuth2)

The credential uses the Microsoft OAuth2 flow with Azure AD app registration. It supports Global, US Government, US Government DOD, and China cloud environments via the credential's "Microsoft Graph API Base URL" setting. For government clouds, authorization and token URLs may also need adjustment to government endpoints.

## Parameters

| name                                     | type             | default                                                | required | notes |
|------------------------------------------|------------------|--------------------------------------------------------|----------|-------|
| resource                                 | string (pick)    | `secureScore`                                          | true     | `secureScore` or `secureScoreControlProfile` |
| operation                                | string (pick)    | `get`                                                  | true     | Depends on resource |
| secureScoreId                            | string           | —                                                      | see note | Required when operation is `get` for secureScore |
| secureScoreControlProfileId              | string           | —                                                      | see note | Required when operation is `get` or `update` for secureScoreControlProfile |
| returnAll                                | boolean          | false                                                  | false    | GetAll operations: true = fetch all pages, false = use limit |
| limit                                    | number           | 50                                                     | false    | Max results (only when returnAll is false) |
| filters.filter                           | string           | —                                                      | false    | OData `$filter` query parameter string |
| filters.includeControlScores             | boolean          | false                                                  | false    | secureScore GetAll only: include nested control scores |
| provider                                 | string           | —                                                      | see note | Required for secureScoreControlProfile Update |
| vendor                                   | string           | —                                                      | see note | Required for secureScoreControlProfile Update |
| updateFields.state                       | string (pick)    | `Default`                                              | false    | `Default` / `Ignored` / `ThirdParty` |

All string parameters accept expression strings for dynamic values.

### Resource: Secure Score

| Operation | Description | Key parameters |
|-----------|-------------|----------------|
| Get       | Retrieve a single secure score by ID | `secureScoreId` |
| Get All   | List secure scores with optional filtering | `returnAll`, `limit`, `filters.filter`, `filters.includeControlScores` |

### Resource: Secure Score Control Profile

| Operation | Description | Key parameters |
|-----------|-------------|----------------|
| Get       | Retrieve a single control profile by ID | `secureScoreControlProfileId` |
| Get All   | List control profiles with optional filtering | `returnAll`, `limit`, `filters.filter` |
| Update    | Update the analyst-assigned state of a control profile | `secureScoreControlProfileId`, `provider`, `vendor`, `updateFields.state` |

## Runtime behavior

### Input

Each input item is processed independently. For GetAll operations, pagination is handled automatically across all pages when `returnAll` is true.

### Output

Produces one output item per API response. For Get, the output is the single secure score or control profile object. For GetAll, each result becomes one output item. The output shape mirrors the Microsoft Graph API response for the corresponding resource:

- **SecureScore:** id, azureTenantId, activeUserCount, createdDateTime, currentScore, enabledServices, licensedUserCount, maxScore, averageComparativeScores, controlScores, vendorInformation
- **SecureScoreControlProfile:** id, azureTenantId, controlDomainReferences, controlName, controlCategory, maxScore, maxScore, remediation, actionUrl, ... (full Microsoft Graph schema)

### Errors

- Missing required operation parameters (e.g., `secureScoreId` for Get) should produce a clear validation error before any API call.
- Microsoft Graph API errors (HTTP 4xx/5xx) should propagate as workflow errors.
- `continueOnFail` behavior: when enabled, the node should return an error item instead of failing the workflow.

### Expressions

All string parameters support n8n expression syntax (`{{ }}`).

## Acceptance tests

### Test: secureScore Get by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "secureScore",
  "operation": "get",
  "secureScoreId": "{{ $json.scoreId }}"
}
```

**Expect** the node to perform `GET /v1.0/security/secureScores/{scoreId}` against Microsoft Graph and emit one output item containing the secure score object with a `currentScore` number field.

### Test: secureScore GetAll with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "secureScore",
  "operation": "getAll",
  "returnAll": true,
  "filters": {
    "filter": "createdDateTime ge 2025-01-01"
  }
}
```

**Expect** the node to perform `GET /v1.0/security/secureScores?$filter=createdDateTime ge 2025-01-01`, paginate all results, and emit one output item per secure score. Each item must contain `currentScore` and `maxScore` number fields.

### Test: secureScoreControlProfile Update state

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "secureScoreControlProfile",
  "operation": "update",
  "secureScoreControlProfileId": "{{ $json.profileId }}",
  "provider": "SecureScore",
  "vendor": "Microsoft",
  "updateFields": {
    "state": "Ignored"
  }
}
```

**Expect** the node to perform `PATCH /v1.0/security/secureScoreControlProfiles/{profileId}` with body `{ vendorInformation: { provider: "SecureScore", vendor: "Microsoft" }, state: "Ignored" }` and emit one output item with the updated control profile object.

### Test: Missing required parameter validation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "secureScore",
  "operation": "get"
}
```

**Expect** the node to fail validation with an error indicating that `secureScoreId` is required.

### Test: continueOnFail

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "secureScore",
  "operation": "get",
  "secureScoreId": "nonexistent-id",
  "continueOnFail": true
}
```

**Expect** the node to return an error item (not throw), allowing downstream nodes to process the error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | Documented | Public n8n docs list 2 resources with 5 total operations |
| Parameters | Inferred from corpus schema | The schema derived from published npm package confirms param names, defaults, and option enums |
| Exact Graph API endpoints | Documented | Microsoft Graph API docs confirm v1.0 secureScores and secureScoreControlProfiles endpoints |
| Credential type | Documented | Public docs confirm `microsoftGraphSecurityOAuth2Api` |
| Tool variant identity | Inferred | The `Tool` suffix alias maps to the same base node type without UI differences; no separate docs page exists |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/microsoftGraphSecurityExecutor.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
