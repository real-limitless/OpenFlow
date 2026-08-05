---
type: n8n-nodes-base.gSuiteAdminTool
displayName: Google Workspace Admin
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Workspace Admin (AI Tool)

A tool variant of the Google Workspace Admin node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports ChromeOS Device (get/getMany/update/changeStatus), Group (create/delete/get/getMany/update), and User (create/delete/get/getMany/update/addToGroup/removeFromGroup) operations against the Google Admin SDK Directory API v1.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gsuiteadmin/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://developers.google.com/admin-sdk/directory/reference/rest | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.gSuiteAdminTool`
- **Aliases:** `Google Workspace Admin`, `Workspaces`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gSuiteAdminOAuth2Api` (extends `googleOAuth2Api`; scopes include `admin.directory.group`, `admin.directory.user`, `admin.directory.device.chromeos`, `admin.directory.domain.readonly`, `admin.directory.userschema.readonly`, `admin.directory.orgunit.readonly`)

## Parameters

The node is driven by a `resource` parameter (ChromeOS Device / Group / User) and an `operation` parameter whose options depend on the selected resource. All parameters accept `$fromAI()` dynamic values when the node is used as an AI agent tool.

### Resource: ChromeOS Device (`device`)

| Operation | Key parameters |
|-----------|----------------|
| Get | `deviceId` (resourceLocator: list/byId) |
| Get Many | `returnAll`, `limit` (default 100, max 500), `projection` (basic/full), `includeChildOrgunits`, `filter` (orgUnitPath, query), `sort` (orderBy, sortOrder) |
| Update | `deviceId` (resourceLocator), `updateOptions` (orgUnitPath, annotatedUser, annotatedLocation, annotatedAssetId, notes) |
| Change Status | `deviceId` (resourceLocator), `action` (reenable/disable) |

### Resource: Group (`group`)

| Operation | Key parameters |
|-----------|----------------|
| Create | `name`, `email` (required), `additionalFields.description` |
| Delete | `groupId` (resourceLocator: list/byId) |
| Get | `groupId` (resourceLocator: list/byId) |
| Get Many | `returnAll`, `limit` (default 100, max 500), `filter` (customer, domain, query, userId), `sort` (orderBy, sortOrder) |
| Update | `groupId` (resourceLocator), `updateFields` (description, email, name) |

### Resource: User (`user`)

| Operation | Key parameters |
|-----------|----------------|
| Create | `firstName` (required), `lastName` (required), `password` (required, 8–100 chars), `username`, `domain` (loadOptions `getDomains`), `additionalFields` (changePasswordAtNextLogin, phoneUi, emailUi, roles, customFields) |
| Delete | `userId` (resourceLocator: list/byEmail/byId) |
| Get | `userId` (resourceLocator), `output` (simplified/raw/select), `fields` (multiOptions when output=select), `projection` (basic/custom/full), `customFieldMask` (when projection=custom) |
| Get Many | `returnAll`, `limit` (default 100, max 500), `output`, `fields`, `projection`, `customFieldMask`, `filter` (customer, domain, query, showDeleted), `sort` (orderBy, sortOrder) |
| Update | `userId` (resourceLocator), `updateFields` (archived, suspendUi, changePasswordAtNextLogin, firstName, lastName, password, phoneUi, emailUi, customFields) |
| Add to Group | `userId` (resourceLocator), `groupId` (resourceLocator) |
| Remove From Group | `userId` (resourceLocator), `groupId` (resourceLocator) |

Load options methods: `getDomains`, `getSchemas`, `getOrgUnits`, `searchDevices`, `searchGroups`, `searchUsers`.

## Runtime behavior

### Input

The node consumes items from a single `main` input. Each item is processed independently. When used as an AI agent tool, the agent model supplies parameter values dynamically via `$fromAI()`.

### Output

Each operation produces output items on `main` containing the Admin SDK Directory API response:

- **User get/getMany simplified:** `kind`, `id`, `primaryEmail`, `name` (`familyName`, `fullName`, `givenName`), `isAdmin`, `lastLoginTime`, `creationTime`, `suspended`
- **User get/getMany raw:** Full API response body
- **Group get/getMany:** `adminCreated`, `description`, `email`, `etag`, `id`, `kind`, `name`, `directMembersCount`, `nonEditableAliases`, `aliases`
- **Device get/getMany:** ChromeOS device properties from Admin SDK Directory API
- **Create/Update:** Returns the created or updated resource
- **Delete/RemoveFromGroup:** Returns API success confirmation
- **AddToGroup:** Returns the membership resource (`id`, `email`, `role`, `type`, `status`)

For list operations (`getAll`), multiple output items may be produced (one per result page or item).

### Errors

- API errors (authentication, authorization, not found, rate limiting, quota exceeded) propagate as node errors.
- `continueOnFail` outputs a single `{ json: { error } }` item instead of throwing.
- Required parameter validation errors surface before API calls.

### Expressions

All string, number, boolean, and option parameters accept expression strings. `resourceLocator` fields accept expressions for the `value` sub-field. In AI agent tool mode, parameters can be populated dynamically via `$fromAI()`.

## Acceptance tests

### Test: user create via AI tool

**Given** an input item:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "firstName": "={{$fromAI()}}",
  "lastName": "={{$fromAI()}}",
  "password": "={{$fromAI()}}",
  "username": "={{$fromAI()}}",
  "domain": "={{$fromAI()}}"
}
```

**Expect** output[0] to contain `primaryEmail` matching the domain and username pattern supplied by the AI, and `name.givenName` matching the supplied first name.

### Test: user get many with query

**Given** an input item:

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
  "filter": { "query": "name:Jane*" },
  "output": "simplified",
  "projection": "basic"
}
```

**Expect** output[0] to be an array of items each with `primaryEmail`, `name`, and `id` fields.

### Test: group create

**Given** an input item:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "group",
  "operation": "create",
  "name": "={{$fromAI()}}",
  "email": "={{$fromAI()}}"
}
```

**Expect** output[0] to contain `email` and `name` matching the values supplied by the AI.

### Test: chromeos device get many

**Given** an input item:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "device",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5,
  "projection": "basic",
  "includeChildOrgunits": false
}
```

**Expect** output[0] to be an array of items with ChromeOS device properties (deviceId, serialNumber, status, model, etc.).

### Test: add user to group

**Given** an input item:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "addToGroup",
  "userId": { "mode": "userEmail", "value": "={{$fromAI()}}" },
  "groupId": { "mode": "groupId", "value": "={{$fromAI()}}" }
}
```

**Expect** output[0] to be a success response (no error). The user is now a member of the group.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation values | documented | Public docs and npm descriptor confirm resource/operation names matching the non-Tool variant |
| Credential type and scopes | documented | `gSuiteAdminOAuth2Api` extends `googleOAuth2Api` with Admin SDK Directory scopes |
| AI tool integration | documented | `usableAsTool: true` confirmed in descriptor; `$fromAI()` pattern documented in public n8n docs |
| Parameter names and defaults | inferred from descriptor | All param names, defaults, and displayOptions confirmed from non-Tool node descriptor; Tool variant uses same schema |
| Output schema shapes | inferred from descriptor | Based on Admin SDK Directory API response shapes |
| Load options methods | documented | `getDomains`, `getSchemas`, `getOrgUnits`, `searchDevices`, `searchGroups`, `searchUsers` confirmed |
| Alias | documented | `["Workspaces"]` confirmed in non-Tool node descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/g-suite-admin-tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** The Tool variant shares the same underlying Google Admin SDK Directory API operations as the non-Tool variant (`n8n-nodes-base.gSuiteAdmin`). The executor should accept the same parameter schema but include optional `$fromAI()` expression support for AI agent integration.
