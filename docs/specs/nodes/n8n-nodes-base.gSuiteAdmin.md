---
type: n8n-nodes-base.gSuiteAdmin
displayName: Google Workspace Admin
category: Utility
versions: [1]
priority: medium
status: specced
---

# Google Workspace Admin

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gsuiteadmin.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.gSuiteAdmin`
- **Aliases:** `["Workspaces"]`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `gSuiteAdminOAuth2Api` (extends `googleOAuth2Api`, scopes: `admin.directory.group`, `admin.directory.user`, `admin.directory.domain.readonly`, `admin.directory.userschema.readonly`, `admin.directory.device.chromeos`, `admin.directory.orgunit.readonly`)

## Parameters

The node is driven by a `resource` parameter (ChromeOS Device / Group / User) and an `operation` parameter whose options depend on the selected resource.

### Resource: ChromeOS Device (`device`)

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get | `deviceId` | resourceLocator (list/byId) | yes | Search method `searchDevices` |
| Get Many | `returnAll` | boolean | — | default false |
| Get Many | `limit` | number | when `returnAll=false` | min 1, max 500, default 100 |
| Get Many | `projection` | options (basic/full) | yes | Field subset control |
| Get Many | `includeChildOrgunits` | boolean | — | default false |
| Get Many | `filter` | collection | — | `orgUnitPath` (loadOptions `getOrgUnits`), `query` (Admin SDK query syntax) |
| Get Many | `sort` | fixedCollection | — | `orderBy` (annotatedLocation/annotatedUser/lastSync/notes/serialNumber/status), `sortOrder` (ascending/descending) |
| Update | `deviceId` | resourceLocator (list/byId) | yes | |
| Update | `updateOptions` | collection | — | `orgUnitPath`, `annotatedUser`, `annotatedLocation`, `annotatedAssetId`, `notes` |
| Change Status | `deviceId` | resourceLocator (list/byId) | yes | |
| Change Status | `action` | options (reenable/disable) | yes | `reenable`=Enabled, `disable`=Disabled |

### Resource: Group (`group`)

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create | `name` | string | — | Group display name |
| Create | `email` | string | yes | Unique email address |
| Create | `additionalFields.description` | string | — | Extended description |
| Delete | `groupId` | resourceLocator (list/byId) | yes | Search method `searchGroups` |
| Get | `groupId` | resourceLocator (list/byId) | yes | |
| Get Many | `returnAll` | boolean | — | default false |
| Get Many | `limit` | number | when `returnAll=false` | min 1, max 500, default 100 |
| Get Many | `filter` | collection | — | `customer`, `domain`, `query` (Admin SDK syntax), `userId` (email or immutable ID) |
| Get Many | `sort` | fixedCollection | — | `orderBy` (email), `sortOrder` (ASCENDING/DESCENDING) |
| Update | `groupId` | resourceLocator (list/byId) | yes | |
| Update | `updateFields` | collection | — | `description`, `email`, `name` |

### Resource: User (`user`)

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create | `firstName` | string | yes | |
| Create | `lastName` | string | yes | |
| Create | `password` | password string | yes | 8–100 chars |
| Create | `username` | string | — | Local part before @domain |
| Create | `domain` | options (loadOptions `getDomains`) | yes | |
| Create | `additionalFields.changePasswordAtNextLogin` | boolean | — | default false |
| Create | `additionalFields.phoneUi` | fixedCollection | — | phone values with type (21 options), value, primary |
| Create | `additionalFields.emailUi` | fixedCollection | — | secondary emails with type (home/work/other), address |
| Create | `additionalFields.roles` | multiOptions | — | 11 admin roles (directorySyncAdmin, groupsAdmin/Editor/Reader, helpDeskAdmin, inventoryReportingAdmin, mobileAdmin, servicesAdmin, storageAdmin, superAdmin, userManagement) |
| Create | `additionalFields.customFields` | fixedCollection | — | schemaName (loadOptions `getSchemas`), fieldName, value |
| Delete | `userId` | resourceLocator (list/byEmail/byId) | yes | |
| Get | `userId` | resourceLocator (list/byEmail/byId) | yes | |
| Get | `output` | options (simplified/raw/select) | yes | default simplified |
| Get | `fields` | multiOptions | when `output=select` | creationTime, isAdmin, kind, lastLoginTime, name, primaryEmail, suspended |
| Get | `projection` | options (basic/custom/full) | yes | Custom field inclusion |
| Get | `customFieldMask` | multiOptions (loadOptions `getSchemas`) | yes | when `projection=custom` |
| Get Many | `returnAll` | boolean | — | default false |
| Get Many | `limit` | number | when `returnAll=false` | min 1, max 500, default 100 |
| Get Many | `output` | options (simplified/raw/select) | yes | default simplified |
| Get Many | `fields` | multiOptions | when `output=select` | same as Get |
| Get Many | `projection` | options (basic/custom/full) | yes | |
| Get Many | `customFieldMask` | multiOptions (loadOptions `getSchemas`) | yes | when `projection=custom` |
| Get Many | `filter` | collection | — | `customer`, `domain`, `query` (Admin SDK syntax), `showDeleted` |
| Get Many | `sort` | fixedCollection | — | `orderBy` (email/familyName/givenName), `sortOrder` (ASCENDING/DESCENDING) |
| Add to Group | `userId` | resourceLocator (list/byEmail/byId) | yes | |
| Add to Group | `groupId` | resourceLocator (list/byId) | yes | Adds existing user to group |
| Remove From Group | `userId` | resourceLocator (list/byEmail/byId) | yes | |
| Remove From Group | `groupId` | resourceLocator (list/byId) | yes | |
| Update | `userId` | resourceLocator (list/byEmail/byId) | yes | |
| Update | `updateFields` | collection | — | `archived`, `suspendUi` (boolean), `changePasswordAtNextLogin`, `firstName`, `lastName`, `password`, `phoneUi`, `emailUi`, `customFields` |

## Runtime behavior

### Input

The node consumes items from a single `main` input. Each item is processed independently. Parameters that accept expressions (most string/boolean/number fields) are evaluated per-item.

### Output

Each operation produces a single output item on `main` containing the API response data. For list operations (`getAll`), multiple output items may be produced (one per result). The output shape depends on the API endpoint and the `output`/`projection` parameter:

- **User get/getAll simplified:** `kind`, `id`, `primaryEmail`, `name` (object with `familyName`, `fullName`, `givenName`), `isAdmin`, `lastLoginTime`, `creationTime`, `suspended`
- **User get/getAll raw:** Full API response body
- **Group get/getAll:** `adminCreated`, `description`, `email`, `etag`, `id`, `kind`, `name`, `directMembersCount`, `nonEditableAliases` (array), `aliases` (array for getAll)
- **Device get/getAll:** ChromeOS device properties from Admin SDK Directory API

### Errors

- API errors (authentication, authorization, not found, rate limiting) should propagate as node errors
- `continueOnFail` outputs a single `{ json: { error } }` item on the main output branch instead of throwing
- Required parameter validation errors should surface before API calls

### Expressions

All string, number, boolean, and option parameters accept expression strings. The `resourceLocator` fields accept expressions for the `value` sub-field.

## Acceptance tests

### Test: user create

**Given** an input item:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "firstName": "Jane",
  "lastName": "Doe",
  "password": "TempPass123!",
  "username": "jane.doe",
  "domain": "example.com"
}
```

**Expect** output[0] to contain `primaryEmail` matching `jane.doe@example.com` and `name.givenName` equal to `"Jane"`.

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
  "name": "Sales Team",
  "email": "sales@example.com",
  "additionalFields": { "description": "Sales department group" }
}
```

**Expect** output[0] to contain `email` equal to `"sales@example.com"` and `name` equal to `"Sales Team"`.

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
  "userId": { "mode": "userEmail", "value": "jane.doe@example.com" },
  "groupId": { "mode": "groupId", "value": "0123kx3o1habcdf" }
}
```

**Expect** output[0] to be a success response (no error). The user is now a member of the group.

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

**Expect** output[0] to be an array of items with ChromeOS device properties.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation values | documented | Public docs and descriptor confirm resource/operation names |
| Credential type and scopes | documented | `gSuiteAdminOAuth2Api` extends `googleOAuth2Api` with Admin SDK Directory scopes confirmed in credential descriptor |
| Load options methods | documented | `getDomains`, `getSchemas`, `getOrgUnits`, `searchDevices`, `searchGroups`, `searchUsers` confirmed in `defined.json` methods |
| Output schema shapes | inferred from descriptor | Output schemas for user/group/device read from `__schema__` JSON files under corpus |
| Parameter names and defaults | documented | All param names, defaults, and displayOptions confirmed from node descriptor |
| Alias | documented | `["Workspaces"]` confirmed in node.json |
| AI tool capability | documented | `usableAsTool: true` confirmed in descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/g-suite-admin.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only