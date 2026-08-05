---
type: n8n-nodes-base.getResponse
displayName: GetResponse
category: Communication
versions: [1]
priority: medium
status: specced
---

# GetResponse

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.getresponse/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/getresponse/ | Public docs only |
| https://apidocs.getresponse.com/v3 | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.getResponse`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `getResponseApi` (API key via `X-Auth-Token` header) or `getResponseOAuth2Api` (OAuth2)

## Parameters

The node exposes a single **Contact** resource with five operations.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | Contact | always | — | Only Contact is supported |
| operation | fixed | Create | always | — | One of: Create, Update, Delete, Get, GetAll |
| email | string | — | Create, Update, Get, Delete | when operation in (Create, Update, Get, Delete) | Contact email address; used as lookup key for Get/Delete/Update |
| campaignId | string | — | Create, Update | when operation in (Create, Update) | Target campaign that the contact belongs to; fetched dynamically from API |
| contactId | string | — | Get, Delete, Update | when operation in (Get, Delete, Update) | Contact resource ID from GetResponse; alternative to email lookup |
| name | string | — | no | when operation = Create | Contact name |
| dayOfCycle | number | — | no | when operation = Create | Autoresponder cycle day |
| source | string | — | no | when operation = Create | Origin/source of the contact (e.g. "other", "www") |
| tags | collection | — | no | when operation = Create | List of tag objects with `tagId`; fetched dynamically |
| customFieldValues | collection | — | no | when operation in (Create, Update) | Array of `{customFieldId, value}` pairs for extra fields |
| ipAddress | string | — | no | when operation = Create | Contact's IP address (for geolocation) |
| timeZone | string | — | no | when operation = Create | Time zone identifier |
| returnAll | boolean | false | no | when operation = GetAll | If true, paginate through all results; if false, use limit |
| limit | number | 100 | no | when operation = GetAll | Max items to return (capped at API maximum) |
| addTags | collection | — | no | when operation = Update | Tags to add via `{tagId}` objects |
| removeTags | collection | — | no | when operation = Update | Tags to remove via `{tagId}` objects |
| additionalFields | collection | — | no | when operation = Update | Optional contact fields to update (mutable properties) |
| options | collection | — | no | GetAll | Additional query options like sorting, filtering by campaign |

### Expression support

All string, number, and collection parameters accept expressions.

## Runtime behavior

### Input

The node processes each input item independently. For **Create**, **Update**, and **Delete** operations, only the first input item is typically needed (although each item is processed individually).

### Output

Each output item is the original input item merged with a top-level `json` property containing the API response:

- **Create:** Returns the created contact object (contactId, campaign, email, name, createdOn, etc.)
- **Get:** Returns the full contact representation including all fields returned by the GetResponse API
- **GetAll:** Returns an array of contact objects (the outer array is spread into individual output items)
- **Update:** Returns the updated contact object
- **Delete:** Returns success confirmation (`{ success: true }`) or raises on failure

The output shape for a single contact includes (at minimum) `contactId`, `email`, `campaign` (object with campaignId, name, href), `createdOn`, `changedOn`, `href`, `origin`, `ipAddress`, `timeZone`, `note`, `tags`, `customFieldValues`, and `geolocation`.

### Errors

- API errors (4xx/5xx) throw an n8n `NodeApiError` with the message from the GetResponse error envelope
- Missing required parameters (e.g. no email for Create) throw a `NodeOperationError`
- When `continueOnFail` is enabled, the node returns the error item instead of throwing, allowing downstream error handling
- 404 on Get/Delete/Update when contact does not exist is surfaced as a thrown error

### API mapping

All operations call the GetResponse REST API v3 at `https://api.getresponse.com/v3`:

| Operation | HTTP method | Endpoint |
|-----------|-------------|----------|
| Create | POST | /contacts |
| Get | GET | /contacts/{contactId} |
| GetAll | GET | /contacts |
| Update | POST | /contacts/{contactId} |
| Delete | DELETE | /contacts/{contactId} |

Authentication is via the `X-Auth-Token` header: `api-key <key>` for API-key credential, or a Bearer OAuth2 token for OAuth2 credential.

## Acceptance tests

### Test: create a contact

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Contact",
  "operation": "Create",
  "email": "test@example.com",
  "campaignId": "ABC123",
  "name": "Test User",
  "dayOfCycle": 0
}
```

**Expect** output[0] to contain a `json` property with at least `contactId`, `email` matching the input, and a `campaign` object with `campaignId` matching the parameter.

### Test: get a contact by email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Contact",
  "operation": "Get",
  "email": "existing@example.com"
}
```

**Expect** output[0] to contain a `json` property with `contactId`, `email`, `createdOn`, and the full contact representation from the API.

### Test: get all contacts with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Contact",
  "operation": "GetAll",
  "returnAll": false,
  "limit": 50
}
```

**Expect** output to contain 50 or fewer items, each with a `json` property containing `contactId` and `email`.

### Test: update a contact name

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Contact",
  "operation": "Update",
  "contactId": "CONTACT_ID",
  "additionalFields": {
    "name": "Updated Name"
  }
}
```

**Expect** output[0] to contain a `json` property with the updated `name` field.

### Test: delete a contact

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Contact",
  "operation": "Delete",
  "email": "delete@example.com"
}
```

**Expect** output[0] to contain `{ "json": { "success": true } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Contact operations | documented | Full public docs confirm Create/Delete/Get/GetAll/Update |
| Dynamic option loading (campaigns, tags) | inferred | Common pattern for n8n nodes referencing external list resources — likely uses the GetResponse campaigns/tags API endpoints |
| Exact parameter names for additional fields | inferred | Parameter names abstracted from the Contact resource structure visible in public docs |
| OAuth2 flow details | documented | Public credential docs confirm both API key and OAuth2 auth |
| Email vs contactId precedence for Get/Delete/Update | inferred | Standard n8n pattern where one or the other is accepted as the resource identifier |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/getResponse.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
