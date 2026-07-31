---
type: n8n-nodes-base.microsoftEntra
displayName: Microsoft Entra ID
category: Development
versions: [1]
priority: medium
status: specced
---

# Microsoft Entra ID

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftentra.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentra.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftEntra`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftEntraOAuth2Api` (OAuth2, extends Microsoft OAuth2 API)

## Parameters

### Resource selector

Selects which Microsoft Entra resource type to operate on:

- `group` — Microsoft Entra groups
- `user` — Microsoft Entra users

### Group operations

| operation | description |
|-----------|-------------|
| `create` | Create a new group |
| `delete` | Delete an existing group by ID |
| `get` | Retrieve a single group by ID |
| `getAll` | List groups with optional filters |
| `update` | Update a group's properties |

### User operations

| operation | description |
|-----------|-------------|
| `create` | Create a new user |
| `delete` | Delete an existing user by ID |
| `get` | Retrieve a single user by ID |
| `getAll` | List users with optional filters |
| `update` | Update a user's properties |
| `addToGroup` | Add an existing user to a group |
| `removeFromGroup` | Remove a user from a group |

### Resource-specific parameters

**Group create/update:**
- `displayName` — required display name for the group
- `mailEnabled` — whether the group receives email (boolean)
- `mailNickname` — mail alias for the group
- `securityEnabled` — whether the group is security-enabled (boolean)
- `groupTypes` — array of group type strings (e.g. `Unified`)
- `mail` — email address of the group (read-only from API)
- `description` — group description
- `visibility` — group visibility: `Private` or `Public`
- `allowExternalSenders` — whether external users can send to the group (update only; requires delay after creation)
- `autoSubscribeNewMembers` — whether new members auto-subscribe (update only; requires delay after creation)

**User create/update:**
- `accountEnabled` — whether the user account is enabled (boolean)
- `displayName` — required display name
- `mailNickname` — mail alias for the user
- `passwordProfile` — object containing `password` (required on create) and `forceChangePasswordNextSignIn` (boolean)
- `userPrincipalName` — UPN in the format `user@domain`
- `givenName` — given (first) name
- `surname` — family (last) name
- `jobTitle` — job title
- `department` — department
- `mobilePhone` — mobile phone number
- `officeLocation` — office location
- `preferredLanguage` — ISO 639-1 language code
- `streetAddress` — street address
- `city` — city
- `state` — state or province
- `postalCode` — postal code
- `country` — country/region
- `businessPhones` — array of business phone numbers
- `usageLocation` — two-letter country code (required for license assignment)

**User addToGroup / removeFromGroup:**
- `groupId` — the ID of the target group (resolved via list search)
- `userId` — the ID of the target user (resolved via list search)

### Shared options

- `returnAll` — boolean; when true, returns all results (for `getAll` operations); when false, requires `limit`
- `limit` — maximum number of results to return (when `returnAll` is false)
- `resolve` — for `getAll`, whether to expand the group/user ID into display name/email (uses loadOptions)
- `additionalFields` — collection of additional API request body fields
- `filters` — collection of query filters (for `getAll` operations)

### List search / load options

The node provides dynamic resource resolution:
- `getGroups` — list search resolving group names to IDs
- `getUsers` — list search resolving user names/UPNs to IDs
- `getGroupProperties` — load options for group property names
- `getUserProperties` — load options for user property names

## Runtime behavior

### Input

Each input item is processed independently. For create/update/delete operations, one API call is made per input item. For `getAll` operations, a single API call is made using parameters from the first item.

### Output

Each output item receives the API response body in its `json` property. For `getAll` operations, the output is an array of items, one per API result. For `addToGroup`/`removeFromGroup`, the output is the API response (typically `204 No Content` with an empty body, so the node passes through the input item).

### Errors

- API errors (authentication, authorization, resource not found, validation) propagate as node errors.
- The `continueOnFail` option, when enabled, causes failed items to be output with a `{ json: { error: { message, code } } }` shape on the main output, rather than halting execution.
- Updating `allowExternalSenders` or `autoSubscribeNewMembers` immediately after group creation may fail. The user should insert a Wait node (at least 2 seconds) between creation and update.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: group create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "group",
  "operation": "create",
  "displayName": "Engineering Team",
  "mailNickname": "eng-team",
  "mailEnabled": false,
  "securityEnabled": true,
  "groupTypes": ["Unified"],
  "visibility": "Private"
}
```

**Expect** output[0] to contain a `json` object with `id`, `displayName`, `mailNickname`, `groupTypes`, `visibility`, and `securityEnabled` fields matching the input.

### Test: user create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "create",
  "accountEnabled": true,
  "displayName": "Jane Doe",
  "mailNickname": "jane.doe",
  "userPrincipalName": "jane.doe@example.com",
  "passwordProfile": {
    "password": "TempP@ss123",
    "forceChangePasswordNextSignIn": true
  }
}
```

**Expect** output[0] to contain a `json` object with `id`, `displayName`, `userPrincipalName`, and `accountEnabled` matching the input.

### Test: user add to group

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "addToGroup",
  "groupId": "{{ $json.groupId }}",
  "userId": "{{ $json.userId }}"
}
```

**With node input containing** `groupId` and `userId` values resolved from a previous node.

**Expect** output[0] to contain the original input item (pass-through on 204 response).

### Test: group getAll

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "group",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0..n] to contain an array of items, each with a `json` object containing at minimum `id` and `displayName`.

### Test: group update after delay

**Given** input items:

```json
[{ "json": { "groupId": "abc-123" } }]
```

**Parameters:**

```json
{
  "resource": "group",
  "operation": "update",
  "groupId": "{{ $json.groupId }}",
  "displayName": "Updated Team Name",
  "allowExternalSenders": true,
  "autoSubscribeNewMembers": true
}
```

**Expect** output[0] to contain the updated group with `displayName` changed. If run immediately after group creation, the node may error; a Wait node (2+ seconds) should precede this operation.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs (documented) | Full list from docs page |
| Group/User params | Public docs (documented) + descriptor metadata | High-level fields documented; exact default values inferred from Graph API |
| Credential type | Public docs (documented) | `microsoftEntraOAuth2Api` extends `microsoftOAuth2Api` |
| Auth scopes | Public docs (documented) | Full scope list documented on credentials page |
| Government cloud | Public docs (documented) | Base URL selection for US Gov, US Gov DOD, China |
| Group creation delay | Public docs (documented) | Common issues section documents the wait requirement |
| Load options / list search | Descriptor (inferred) | .d.ts confirms methods exist but exact option names/enums not in public docs |
| Output shape | Inferred | Standard Graph API response shape; exact field set depends on API version |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/microsoft-entra.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only