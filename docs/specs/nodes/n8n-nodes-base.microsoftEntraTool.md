---
type: n8n-nodes-base.microsoftEntraTool
displayName: Microsoft Entra ID
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Microsoft Entra ID (AI Tool)

An AI agent tool variant of the Microsoft Entra ID node for managing directory users and groups via the Microsoft Graph API. When connected to an AI Agent, the agent model dynamically populates parameters via `$fromAI()` expressions or the "let model fill" toggle. Wraps two resources (Group, User) with CRUD and membership operations against the Microsoft Graph v1.0 `/users` and `/groups` endpoints.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftentra.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentra.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/identity-network-access-overview | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftEntraTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftOAuth2Api` — Microsoft OAuth2 with scopes: `openid`, `offline_access`, `AccessReview.ReadWrite.All`, `Directory.ReadWrite.All`, `NetworkAccessPolicy.ReadWrite.All`, `DelegatedAdminRelationship.ReadWrite.All`, `EntitlementManagement.ReadWrite.All`, `User.ReadWrite.All`, `Directory.AccessAsUser.All`, `Sites.FullControl.All`, `GroupMember.ReadWrite.All`. Supports custom scopes, government cloud base URL selection (Global/US Government/US Government DOD/China), and certificate-based auth (`private_key_jwt`).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | — | yes | — | `user` or `group` |
| operation | options | — | yes | depends on resource | see below |

### Resource: User

| operation | required parameters | notes |
|-----------|-------------------|-------|
| `create` | displayName, userPrincipalName, mailNickname, password, accountEnabled | Additional fields: aboutMe, ageGroup, birthday, businessPhones, city, companyName, consentProvidedForMinor, country, department, employeeId, employeeType, employeeHireDate, employeeLeaveDateTime, employeeOrgData (costCenter, division), givenName, forceChangePassword (nextSignIn/nextSignInWithMfa), interests, jobTitle, surname, mail, mobilePhone, mySite, officeLocation, onPremisesImmutableId, otherMails, passwordPolicies, pastProjects, postalCode, preferredLanguage, responsibilities, schools, skills, state, streetAddress, usageLocation, userType |
| `get` | user (resourceLocator) | Output mode: simplified (id,displayName,userPrincipalName,mail,mailNickname,securityIdentifier,createdDateTime), raw (full Graph response), or selected fields |
| `getAll` | — | returnAll (boolean) + limit if not returnAll. Filter ($filter OData), Output mode (simplified/raw/selected fields). Pagination via `@odata.nextLink` |
| `update` | user (resourceLocator) | UpdateFields collection matching create AdditionalFields plus accountEnabled, displayName |
| `delete` | user (resourceLocator) | — |
| `addToGroup` | user (resourceLocator), group (resourceLocator) | Adds user to specified group |
| `removeFromGroup` | user (resourceLocator), group (resourceLocator) | Removes user from specified group |

### Resource: Group

| operation | required parameters | notes |
|-----------|-------------------|-------|
| `create` | displayName, mailNickname, mailEnabled, securityEnabled | Additional: groupTypes, description, visibility |
| `get` | group (resourceLocator) | — |
| `getAll` | — | returnAll + limit, filter ($filter OData) |
| `update` | group (resourceLocator) | updatable fields: displayName, description, visibility, mailEnabled, securityEnabled, groupTypes |
| `delete` | group (resourceLocator) | — |

Resource locators support mode switching: "From List" (dynamic search via `getUsers`/`getGroups` methods) or "By ID" (direct Graph object ID string).

Request-level options: batching (itemsPerBatch + batchInterval), ignore SSL issues, proxy, timeout.

## Runtime behavior

### External API

All operations target the Microsoft Graph API v1.0 at `https://graph.microsoft.com/v1.0/` (or the configured government cloud base URL). User endpoints: `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `DELETE /users/{id}`, `GET /users`, `POST /users/{id}/memberOf/$ref`, `DELETE /users/{id}/memberOf/{groupId}/$ref`. Group endpoints: `POST /groups`, `GET /groups/{id}`, `PATCH /groups/{id}`, `DELETE /groups/{id}`, `GET /groups`. Query parameters `$select`, `$filter`, `$top` are used for field selection, filtering, and pagination. Paginated responses carry an `@odata.nextLink` URL.

### Input

Consumes items from `main` input. Entity IDs, display names, and field values may reference item data. User creation requires passwordProfile.password in the body.

### Output

- **Create / Get / Update:** the Graph resource object returned by the API (user or group with Graph properties)
- **Get Many:** one output item per resource, unwrapped from the API `value` array; follows `@odata.nextLink` for complete pagination
- **Delete:** `204 No Content` — input item passed through unchanged
- **Add/Remove Group:** the API returns `204 No Content` — input item passed through unchanged

Simplified output mode limits user responses to a curated subset: `id, createdDateTime, displayName, userPrincipalName, mail, mailNickname, securityIdentifier`.

### Errors

API errors (4xx/5xx, auth failures, resource-not-found, insufficient permissions) propagate as node errors. `continueOnFail` emits an error item instead of throwing. Known issue: updating AllowExternalSenders/AutoSubscribeNewMembers on a newly created group fails if attempted immediately — a 2-second delay is needed.

### Expressions

Parameters tagged as AI-populatable accept `$fromAI()`. All string fields accept standard n8n `{{ }}` expressions.

## Acceptance tests

### Test: Create a user

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "displayName": "Jane Doe",
  "userPrincipalName": "jane.doe@contoso.com",
  "mailNickname": "jane.doe",
  "password": "P@ssw0rd123!",
  "accountEnabled": true,
  "additionalFields": {
    "jobTitle": "Engineer",
    "department": "Engineering"
  }
}
```

**Expect** output[0] — `{ json: { id: "…", displayName: "Jane Doe", userPrincipalName: "jane.doe@contoso.com", … } }` (the created Graph user object).

### Test: List users with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "filter": "startswith(displayName, 'A')",
  "output": "simple"
}
```

**Expect** output[0] — up to 10 items, each with `{ id, displayName, userPrincipalName, mail }`. The executor sends `$filter=startswith(displayName, 'A')` and `$top=10` in the Graph query.

### Test: Add user to group

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "addToGroup",
  "user": { "mode": "id", "value": "user-id-123" },
  "group": { "mode": "id", "value": "group-id-456" }
}
```

**Expect** output[0] — input item passed through (Graph returns `204 No Content`).

### Test: AI agent populates parameters via $fromAI()

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "displayName": "= $fromAI('displayName')",
  "userPrincipalName": "= $fromAI('userPrincipalName')",
  "mailNickname": "= $fromAI('mailNickname')",
  "password": "= $fromAI('password')",
  "accountEnabled": true
}
```

**Expect** — the executor does not throw when `$fromAI()` is present. Actual resolution is handled by the AI agent framework, not by this node.

### Test: Delete a group

**Given** input items:
```json
[{ "json": { "groupId": "02bd9fd6-8f93-4758-87c3-1fb73740a315" } }]
```

**Parameters:**
```json
{
  "resource": "group",
  "operation": "delete",
  "group": { "mode": "id", "value": "{{ $json.groupId }}" }
}
```

**Expect** output[0] — input item passed through (Graph returns `204 No Content`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources + operations | documented | Group (create/delete/get/getAll/update) and User (create/delete/get/getAll/update/addToGroup/removeFromGroup) — confirmed in public n8n docs |
| Graph API endpoints | documented | Microsoft Graph v1.0 `/users`, `/groups`, membership `$ref` endpoints |
| Credentials | documented | `microsoftOAuth2Api` with Entra-specific scopes listed in credential docs |
| Group operation details (create fields, update fields) | inferred from package descriptor | Group create requires mailEnabled, securityEnabled, displayName, mailNickname. Additional fields from corpus (not enumerable in public docs alone) |
| Simplified output fields | inferred from package descriptor | Curated `$select` fields for user get/getAll |
| Pagination via @odata.nextLink | documented | Standard Graph pagination |
| Tool-mode parameter population | documented | `$fromAI()` support documented in public n8n AI docs |
| Batching/request options | inferred from package descriptor | itemsPerBatch, batchInterval, proxy, timeout — common HTTP node options |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.microsoftEntraTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftOAuth2Api`
- **Canonical reference:** `docs/specs/nodes/n8n-nodes-base.microsoftEntra.md`
