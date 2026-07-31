---
type: n8n-nodes-base.googleContacts
displayName: Google Contacts
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# Google Contacts

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecontacts/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleContacts`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleContactsOAuth2Api` (Google OAuth2 single-service, supports Managed OAuth2 on n8n Cloud)

## Parameters

### Resource
- **Resource:** Contact — only resource

### Operation
One of: `create`, `delete`, `get`, `getAll`, `update`

### Create parameters
| name | type | required | notes |
|------|------|----------|-------|
| contactId | string | no | Parent resource name for the contact |
| givenName | string | no | Contact's first name |
| familyName | string | no | Contact's last name |
| phoneNumbers | fixedCollection | no | Array of phone numbers; each entry has `type` (home, work, mobile, main, homeFax, workFax, otherFax, pager, other, callback, carPhone, companyMain, isdn, main, other, radioTelescope, telex, ttyTdd) and `value` |
| emailAddresses | fixedCollection | no | Array of email addresses; each entry has `type` (home, work, other) and `value` |
| addresses | fixedCollection | no | Array of physical addresses; each entry has `type` (home, work, other) and `streetAddress`, `city`, `region`, `postalCode`, `country` |
| organizations | fixedCollection | no | Array of organizations; each entry has `name`, `title`, `domain` |
| additionalFields | collection | no | Catch-all for other People API contact fields |

### Delete parameters
| name | type | required | notes |
|------|------|----------|-------|
| contactId | string | yes | Resource name of the contact to delete |

### Get parameters
| name | type | required | notes |
|------|------|----------|-------|
| contactId | string | yes | Resource name of the contact to retrieve |

### GetAll parameters
| name | type | default | notes |
|------|------|---------|-------|
| returnAll | boolean | false | Whether to return all results |
| limit | number | 50 | Max results to return (when returnAll=false) |
| useQuery | boolean | false | Whether to filter by text query |
| query | string | — | Free-text search query (matched against names, emails, etc.) |
| sortOrder | string | LAST_MODIFIED_DESCENDING | Sort order: `LAST_MODIFIED_ASCENDING` or `LAST_MODIFIED_DESCENDING` |

### Update parameters
| name | type | required | notes |
|------|------|----------|-------|
| contactId | string | yes | Resource name of the contact to update |
| givenName | string | no | Updated first name |
| familyName | string | no | Updated last name |
| phoneNumbers | fixedCollection | no | Updated phone numbers (same shape as create) |
| emailAddresses | fixedCollection | no | Updated email addresses (same shape as create) |
| addresses | fixedCollection | no | Updated addresses (same shape as create) |
| organizations | fixedCollection | no | Updated organizations (same shape as create) |
| updatePerson | fixedCollection | no | Determines merge strategy: `personFields` (comma-separated list of field masks) controls which fields to update |

### Expression support
All string and number fields accept expression syntax `{{ }}`.

## Runtime behavior

### Input
Each input item is processed independently. For GetAll, a single input item triggers one list request.

### Output
Each output item contains the People API contact resource object. The output shape mirrors the Google People API `Person` resource:
- `resourceName` (string) — unique identifier
- `etag` (string) — version tag
- `names[]` — array of name objects with `displayName`, `givenName`, `familyName`, `displayNameLastFirst`
- `emailAddresses[]` — array with `value`, `type`, `formattedType`
- `phoneNumbers[]` — array with `value`, `type`, `formattedType`, `canonicalForm`
- `addresses[]` — array with `streetAddress`, `city`, `region`, `postalCode`, `country`, `type`
- `organizations[]` — array with `name`, `title`, `domain`, `current`
- `photos[]` — array with `url`, `default`
- `memberships[]` — array with `contactGroupMembership`

### Errors
- Missing required `contactId` on get/delete/update throws a parameter validation error
- Invalid resource name returns a People API 404, surfaced as a node error
- Network/auth failures propagate as node errors
- `continueOnFail`: when enabled, failed items produce `[{ json: { error: message } }]` on the output

## Acceptance tests

### Test: create contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "givenName": "Alice",
  "familyName": "Smith",
  "phoneNumbers": {
    "phoneNumberValues": [
      { "type": "mobile", "value": "+1-555-0100" }
    ]
  },
  "emailAddresses": {
    "emailValues": [
      { "type": "work", "value": "alice@example.com" }
    ]
  }
}
```

**Expect** output[0] to contain one item with `json.names[0].givenName` = "Alice", `json.names[0].familyName` = "Smith", `json.emailAddresses[0].value` = "alice@example.com".

### Test: get contact by ID

**Given** input items:
```json
[{ "json": { "contactId": "people/c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0] to contain one item with `json.resourceName` set (starting with "people/").

### Test: getAll contacts

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] to be an array of contact items, each with a `resourceName` field.

### Test: update contact name

**Given** input items:
```json
[{ "json": { "contactId": "people/c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "update",
  "contactId": "={{ $json.contactId }}",
  "givenName": "Alice",
  "familyName": "Johnson"
}
```

**Expect** output[0] to contain one item with updated name fields.

### Test: delete contact

**Given** input items:
```json
[{ "json": { "contactId": "people/c12345" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "delete",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0] to contain one item confirming deletion (empty success response from API).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter enums (phone type, email type) | Inferred from descriptor schemas | Google People API standard types; stable across versions |
| Additional fields collection structure | Inferred | Catch-all pattern common to n8n Google nodes |
| People API version used | Inferred from output shape | v1 People API contacts; confirmed by `resourceName` pattern |
| Sort order enum values | Inferred from descriptor schema | Standard People API `personFields` sort order |
| Delete response shape | Inferred | Standard People API delete returns empty body |
| Update field mask behavior | Inferred | `updatePerson.personFields` controls merge behavior per People API spec |

## OpenFlow mapping

- **Definition group:** `core` (app node using standard action pattern)
- **Executor file:** `src/lib/engine/executors/google-contacts.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only