---
type: n8n-nodes-base.microsoftDynamicsCrm
displayName: Microsoft Dynamics CRM
category: Marketing, Sales
versions: [1]
priority: medium
status: specced
aliases: n8n-nodes-base.microsoftDynamicsCrmTool
---

# Microsoft Dynamics CRM

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftdynamicscrm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview | Public docs (Microsoft Dataverse Web API) |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftDynamicsCrm`
- **Aliases:** `n8n-nodes-base.microsoftDynamicsCrmTool`
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `microsoftDynamicsOAuth2Api` (extends `microsoftOAuth2Api`)

The credential requires: subdomain (the Dynamics 365 organization name), region (one of ~15 regional CRM hostnames such as `crm.dynamics.com`, `crm4.dynamics.com`, `crm5.dynamics.com`, etc.), and derives the OAuth2 scope from `subdomain.region/.default`. The node authenticates via OAuth2 bearer tokens (`id_token` property) against the Microsoft identity platform.

The node can function as an AI Agent tool (via `usableAsTool: true`), supporting `$fromAI()` dynamic parameter population, with the same behavior and parameters as the regular node.

## Parameters

### Resource

Always `account`. This is the single supported entity type.

### Operation

| Operation | ID | Account ID required | Notes |
|-----------|----|-------------------|-------|
| Create | `create` | No | Must supply `Name` |
| Delete | `delete` | Yes | |
| Get | `get` | Yes | Supports optional expand fields |
| Get Many | `getAll` | No | Paginated; configurable limit or return-all |
| Update | `update` | Yes | Mutates specified fields only |

### Per-operation parameters

**Create**
- `name` (string, required) — Company or business name.
- `additionalFields` (collection) — Optional entity attributes including: account category, account rating, addresses (fixedCollection with multiple address blocks containing addresstypecode, line1/2/3, city, stateorprovince, country, name, postalcode, primarycontactname, telephone1/2, fax), business type, customer size, customer type, description, email addresses (1/2/3), fax, FTP site URL, industry, credit limit, number of employees, payment terms, preferred appointment day/time, preferred contact method, primary Satori/Twitter ID, revenue, shares outstanding, shipping method, SIC code, stage ID, stock exchange, telephones (1/2/3), territory, ticker symbol, website URL, yomi name. Enum-typed fields (category, rating, business type, customer size/type, industry, payment terms, appointment day/time, contact method, shipping method, territory) are populated dynamically from the Dynamics instance via picklist metadata queries.
- `options` (collection) — `returnFields` (multi-select from dynamic field list).

**Get**
- `accountId` (string, required) — The Dynamics CRM account GUID.
- `options` (collection) — `returnFields`, `expandFields` (both multi-select from dynamic field lists).

**Get All**
- `returnAll` (boolean, default false) — Return all matching results or limit.
- `limit` (number, default 5, max 10) — Maximum results when `returnAll` is false.
- `filters` (collection) — `query` (string) — an OData `$filter` expression against the Dynamics Web API. See [filter results docs](https://learn.microsoft.com/en-us/powerapps/developer/data-platform/webapi/query-data-web-api#filter-results).
- `options` (collection) — `returnFields`, `expandFields`.

**Update**
- `accountId` (string, required).
- `updateFields` (collection) — Same field set as `additionalFields` in Create.
- `options` (collection) — `returnFields`.

**Delete**
- `accountId` (string, required).

### Dynamic option loading

The node defines several `loadOptions` methods that query the Dynamics metadata service:
- `getAccountFields` / `getExpandableAccountFields` — fetches the entity's attribute definitions.
- `getAccountCategories`, `getAccountRatingCodes`, `getAddressTypes`, `getBusinessTypes`, `getCustomerSizeCodes`, `getCustomerTypeCodes`, `getIndustryCodes`, `getPaymentTermsCodes`, `getPreferredAppointmentDayCodes`, `getPreferredAppointmentTimeCodes`, `getPreferredContactMethodCodes`, `getShippingMethodCodes`, `getTerritoryCodes` — each queries the EntityDefinitions metadata endpoint for picklist option sets and returns label/value pairs.

## Runtime behavior

### Input processing

Each incoming item is processed independently. The node reads parameters from the current item's node parameters (not per-item data unless expression-referenced).

### API calls

All API calls target the Dataverse Web API v9.2 at:
`https://{subdomain}.{region}/api/data/v9.2`

Requests carry:
- `Content-Type: application/json`
- `accept: application/json`
- `Prefer: return=representation` (ensures the created/updated entity is returned in the response)

**Create** — `POST /accounts` with the field payload. Returns the created account representation.

**Get** — `GET /accounts({accountId})` with optional `$select` (returnFields) and `$expand` (expandFields). Returns the account object.

**Get All** — `GET /accounts` with optional `$filter` (from query parameter), `$select`, `$expand`, and `$top` (limit/100 for paging). Automatically pages through `@odata.nextLink` when `returnAll` is true. Returns an array of account objects under the `value` property.

**Update** — `PATCH /accounts({accountId})` with the update field payload. Returns the updated account representation.

**Delete** — `DELETE /accounts({accountId})`. Returns empty body on success.

### Output shape

Each operation outputs one item per result:
- **Create** — `{ accountid, name, ...otherFields }` plus any requested return fields.
- **Get** — `{ accountid, name, ...otherFields }` with optional expanded navigation properties.
- **Get All** — Array of account objects; each object is one output item.
- **Update** — `{ accountid, name, ...updatedFields }` with optional return fields.
- **Delete** — The original input item (pass-through).

The response always includes the `@odata.context` metadata reference and entity fields use the standard OData JSON format (logical names as keys, values typed per Dataverse schema).

### Error handling

- API errors (4xx/5xx) throw `NodeApiError` with the upstream error details.
- Supports `continueOnFail`: when enabled, failed items produce an error output instead of halting.
- Missing required parameters (`accountId` for get/update/delete, `name` for create) produce a validation error before any API call.

### Expressions

All parameter values accept n8n expressions. Enum-type fields populated by `loadOptions` also accept raw values via expression syntax.

## Acceptance tests

### Test: create account with minimal fields

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "create",
  "name": "Test Company Inc"
}
```

**Expect** output[0] contains:
```json
[{ "json": { "name": "Test Company Inc", "accountid": "{{ guid }}" } }]
```
The response must include the auto-generated `accountid` GUID and the `name` field matching the input.

### Test: get account by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "get",
  "accountId": "00000000-0000-0000-0000-000000000001"
}
```

**Expect** a single item with the account entity fields at the top level, including `accountid` and `name`.

### Test: get all accounts with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "getAll",
  "returnAll": true,
  "filters": { "query": "startswith(name, 'Test')" }
}
```

**Expect** output[0] to be an array of items (potentially spanning multiple API pages via `@odata.nextLink`), each containing account fields with `accountid` and `name`.

### Test: update account name

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "update",
  "accountId": "00000000-0000-0000-0000-000000000001",
  "updateFields": { "name": "Updated Company Name" }
}
```

**Expect** output[0]: `{ "name": "Updated Company Name", "accountid": "00000000-0000-0000-0000-000000000001" }` with the `Prefer: return=representation` header ensuring the mutated entity is returned.

### Test: delete account

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "delete",
  "accountId": "00000000-0000-0000-0000-000000000001"
}
```

**Expect** output[0] matches the input item (pass-through). No API response body.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations & resource | Public docs + corpus | Confirmed single Account resource with 5 CRUD operations |
| Account field set | Corpus (schema + GenericFunctions) | 40+ entity attributes match Dataverse Account entity schema; exact list is public knowledge |
| Dynamic picklist loading | Corpus | Methods query `/EntityDefinitions(...)/Attributes(...)/Microsoft.Dynamics.CRM.PicklistAttributeMetadata`. This is documented Microsoft Dataverse metadata API behavior |
| Credential subdomain/region | Corpus | The 15 regional crm*.dynamics.com hosts are documented by Microsoft |
| Tool vs regular node | Public docs pattern | The node has `usableAsTool: true` and no separate Tool variant exists. It behaves identically in both contexts |
| Error handling | Standard n8n pattern | No documented deviations from standard NodeApiError behavior |
| API base URL & version | Public Microsoft docs | Dataverse Web API v9.2 at `{subdomain}.{region}/api/data/v9.2` |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.microsoftDynamicsCrm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
