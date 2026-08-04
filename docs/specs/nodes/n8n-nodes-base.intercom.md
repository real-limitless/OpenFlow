---
type: n8n-nodes-base.intercom
displayName: Intercom
category: Communication
versions: [1]
priority: medium
status: specced
---

# Intercom

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.intercom/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/intercom/ | Public docs only |
| https://developers.intercom.com/docs/references/introduction/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.intercom`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `intercomApi` (API key / access token)

## Parameters

The node exposes three resources (Company, Lead, User) with the following operations and parameters:

### Company — Create / Update

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create / Update | Company ID | string, optional | no | External `company_id` for identification |
| Create / Update | Name | string, optional | no | Company name |
| Create / Update | Plan | string, optional | no | Subscription plan name |
| Create / Update | Monthly Spend | number, optional | no | Monthly spend amount |
| Create / Update | Size | number, optional | no | Number of employees |
| Create / Update | Website | string, optional | no | Company website URL |
| Create / Update | Industry | string, optional | no | Industry classification |
| Create / Update | Custom Attributes | key-value pairs, optional | no | Arbitrary custom data; accepts JSON or UI key-value list |

### Company — Get

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get | Select By | enum: `companyId`, `id`, `name` | yes | How to identify the company |
| Get | Value | string | yes | The identifier value |

### Company — Get All

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get All | Return All | boolean | no | When false, `limit` is required |
| Get All | Limit | number | conditional | Max items to return |
| Get All | Filter by Segment ID | string, optional | no | Segment identifier |
| Get All | Filter by Tag ID | string, optional | no | Tag identifier |

### Company — List Users

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Users | List By | enum: `id`, `companyId` | yes | How to identify the company |
| Users | Value | string | yes | The identifier value |
| Users | Return All | boolean | no | When false, `limit` is required |
| Users | Limit | number | conditional | Max items to return |

### Lead — Create / Update

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create / Update | Email | string, optional | no | Primary email address |
| Create / Update | Name | string, optional | no | Lead's full name |
| Create / Update | Phone | string, optional | no | Phone number |
| Create / Update | Avatar | string, optional | no | URL to avatar image |
| Create / Update | Companies | string[], optional | no | List of company IDs to associate |
| Create / Update | Unsubscribed from Emails | boolean, optional | no | Email opt-out flag |
| Create / Update | Update Last Request At | boolean, optional | no | Whether to update the last_request_at timestamp |
| Create / Update | UTM Source | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Medium | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Campaign | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Term | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Content | string, optional | no | UTM tracking parameter |
| Create / Update | Custom Attributes | key-value pairs, optional | no | Arbitrary custom data |

For **Update**, the lead must be identified via `Update By` (`userId` or `id`) plus a `Value`.

### Lead — Delete

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Delete | Delete By | enum: `id`, `userId` | yes | How to identify the lead |
| Delete | Value | string | yes | The identifier value |

### Lead — Get

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get | Select By | enum: `email`, `id`, `userId`, `phone` | yes | How to identify the lead |
| Get | Value | string | yes | The identifier value |

### Lead — Get All

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get All | Return All | boolean | no | When false, `limit` is required |
| Get All | Limit | number | conditional | Max items to return |
| Get All | Filter by Email | string, optional | no | Email filter |
| Get All | Filter by Phone | string, optional | no | Phone filter |

### User — Create / Update

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create | Identifier Type | enum: `userId`, `email` | conditional | How to identify the user for upsert |
| Create | ID Value | string | conditional | The identifier value |
| Create / Update | Email | string, optional | no | Primary email |
| Create / Update | Name | string, optional | no | User's full name |
| Create / Update | Phone | string, optional | no | Phone number |
| Create / Update | User ID | string, optional | no | External `user_id` |
| Create / Update | Avatar | string, optional | no | URL to avatar image |
| Create / Update | Companies | string[], optional | no | List of company IDs to associate |
| Create / Update | Session Count | number, optional | no | Number of sessions |
| Create / Update | Unsubscribed from Emails | boolean, optional | no | Email opt-out flag |
| Create / Update | Update Last Request At | boolean, optional | no | Whether to update last_request_at |
| Create / Update | UTM Source | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Medium | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Campaign | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Term | string, optional | no | UTM tracking parameter |
| Create / Update | UTM Content | string, optional | no | UTM tracking parameter |
| Create / Update | Custom Attributes | key-value pairs, optional | no | Arbitrary custom data |

For **Update**, the user must be identified via `Update By` (`id`, `email`, or `userId`) plus a `Value`.

### User — Delete

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Delete | ID | string | yes | Intercom ID of the user |

### User — Get

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get | Select By | enum: `id`, `userId` | yes | How to identify the user |
| Get | Value | string | yes | The identifier value |

### User — Get All

| Operation | Parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get All | Return All | boolean | no | When false, `limit` is required |
| Get All | Limit | number | conditional | Max items to return |
| Get All | Filter by Company ID | string, optional | no | Company identifier |
| Get All | Filter by Email | string, optional | no | Email filter |
| Get All | Filter by Segment ID | string, optional | no | Segment identifier |
| Get All | Filter by Tag ID | string, optional | no | Tag identifier |

## Runtime behavior

### Input

Each input item is processed independently. The node maps parameter values to the corresponding Intercom REST API endpoint and sends one request per input item. All parameters support expression-based values from the input item data.

### Output

Each output item carries the input JSON merged with the Intercom API response under `json`. The response typically contains the full Intercom resource object returned by the API (Company, Lead, or User) including Intercom-internal `id`, `created_at`, `updated_at`, and resource-specific fields.

For **Get All** / **List Users** operations, the output is an array of items, one per result entity.

For **Delete** operations, the response usually mirrors the deleted object or returns a success confirmation.

### Errors

The node throws on invalid authentication, nonexistent resources, rate limiting, or malformed request bodies. Respects `continueOnFail` for graceful degradation — when enabled, an error object replaces the expected output for the failing item.

### Expressions

All parameter values accept n8n expression strings (`={{ }}` syntax). This includes resource identifiers, field values, and custom attribute entries.

## Acceptance tests

### Test: create a user

**Given** input items:

```json
[{ "json": { "userEmail": "test@example.com", "userName": "Test User" } }]
```

**Parameters:**

```json
{ "resource": "user", "operation": "create", "identifierType": "email", "idValue": "={{ $json.userEmail }}", "additionalFields": { "name": "={{ $json.userName }}", "email": "={{ $json.userEmail }}" } }
```

**Expect** output[0] to contain `json.email` equal to `"test@example.com"` and `json.name` equal to `"Test User"`.

### Test: get a company by external ID

**Given** input items:

```json
[{ "json": { "companyId": "acme_corp_123" } }]
```

**Parameters:**

```json
{ "resource": "company", "operation": "get", "selectBy": "companyId", "value": "={{ $json.companyId }}" }
```

**Expect** output[0] to contain `json.company_id` equal to `"acme_corp_123"`.

### Test: list all leads with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "lead", "operation": "getAll", "returnAll": false, "limit": 10 }
```

**Expect** output[0] to be an array of lead objects with at most 10 items, each containing `id` and `type` fields.

### Test: delete a lead by ID

**Given** input items:

```json
[{ "json": { "leadId": "abc123" } }]
```

**Parameters:**

```json
{ "resource": "lead", "operation": "delete", "deleteBy": "id", "value": "={{ $json.leadId }}" }
```

**Expect** output[0] to contain a response indicating the lead was deleted (e.g. `json.id` matching the deleted lead ID and `json.type` equal to `"contact"`).

### Test: update user custom attributes

**Given** input items:

```json
[{ "json": { "userId": "usr_123", "planTier": "premium" } }]
```

**Parameters:**

```json
{ "resource": "user", "operation": "update", "updateBy": "id", "value": "={{ $json.userId }}", "additionalFields": {}, "customAttributesUi": { "customAttributesValues": [{ "name": "plan_tier", "value": "={{ $json.planTier }}" }] } }
```

**Expect** output[0] to contain `json.custom_attributes.plan_tier` equal to `"premium"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available resources and operations | documented | Public n8n docs list Company, Lead, User with Create/Get/GetAll/Update plus Company:List Users, Lead:Delete, User:Delete |
| Parameter names per operation | inferred from schema snapshot | Exact parameter names (e.g. `selectBy`, `updateBy`, `companyId`, `identifierType`) come from the node definition schema; public docs only list operations |
| Response shape | inferred from Intercom API docs | Standard Intercom REST API response shapes for contacts, companies, and users |
| Credential type | documented | Intercom API access token via IntercomApi credentials |
| Expression behavior | documented | Standard n8n expression behavior applies |
| Custom attributes (JSON vs UI) | inferred from schema snapshot | Two input modes: raw JSON or key-value UI pairs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.intercom.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
