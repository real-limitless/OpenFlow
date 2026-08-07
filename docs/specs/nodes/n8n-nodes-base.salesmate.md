---
type: n8n-nodes-base.salesmate
displayName: Salesmate
category: Sales
versions: [1]
priority: medium
status: specced
---

# Salesmate

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesmate.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/salesmate.md | Public docs only |
| https://apidocs.salesmate.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.salesmate`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `salesmateApi` (session token + domain URL)

Credentials require two fields: a **Session Token** (the user's Access Key, generated under My Account > Access Key in Salesmate) and a **URL** (the Salesmate domain/host, e.g. `n8n.salesmate.io`). The URL is used to construct the base API endpoint at `https://{domain}/v1/`.

## Parameters

The node exposes a two-level resource/operation selector followed by operation-specific fields.

### Resource: Activity — operations: create, update, get, getAll, delete

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| resource | literal `activity` | yes | selects the Activity resource |
| operation | enum: create, update, get, getAll, delete | yes | target operation |
| activityType | string | create | type of activity (e.g. call, meeting, email, note, task) |
| title | string | create, update | activity subject/title |
| owner | string (owner ID) | create | assigned user ID |
| date | string (ISO 8601) | create | activity date/time |
| description | string | no | free-text description |
| attendees | string (comma-separated IDs) | no | participant user IDs |
| additionalFields | object | no | extra modifiable fields (currency, outcome, location, teamIds, etc.) |
| activityId | string | get, update, delete | the ID of the target activity |
| returnAll | boolean | getAll | if true, fetch all matching results (ignores limit) |
| limit | number | getAll | max results when returnAll is false (default 20) |
| jsonParameters | boolean | getAll, update | if true, pass filters/fields as raw JSON string |
| options | object | getAll | sortBy, sortOrder (asc/desc), fields (projection) |
| filters / filtersJson | object / string | getAll | structured filter conditions or raw JSON |

### Resource: Company — operations: create, update, get, getAll, delete

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| resource | literal `company` | yes | selects the Company resource |
| operation | enum: create, update, get, getAll, delete | yes | target operation |
| name | string | create | company name |
| owner | string (owner ID) | create | assigned user ID |
| rawData | boolean | no | return raw API response |
| additionalFields | object | no | website, phone, otherPhone, facebookHandle, googlePlusHandle, linkedInHandle, skypeId, twitterHandle, currency, billingAddressLine1, billingAddressLine2, billingCity, billingZipCode, billingState, description, tags |
| companyId | string | get, update, delete | the ID of the target company |
| returnAll | boolean | getAll | if true, fetch all results |
| limit | number | getAll | max results (default 20) |
| jsonParameters | boolean | getAll | if true, filters as raw JSON |
| options | object | getAll | fields (projection), sortBy, sortOrder (asc/desc) |
| filters / filtersJson | object / string | getAll | structured conditions or raw JSON |

### Resource: Deal — operations: create, update, get, getAll, delete

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| resource | literal `deal` | yes | selects the Deal resource |
| operation | enum: create, update, get, getAll, delete | yes | target operation |
| title | string | create | deal title/name |
| owner | string (owner ID) | create | assigned user ID |
| primaryContact | string (contact ID) | no | primary contact associated |
| rawData | boolean | no | return raw API response |
| additionalFields | object | no | dealValue, currency, pipeline, status, stage, dealSource, probability, expectedCloseDate, dealType, description, tags, companyName, companyId, contactIds, teamIds, custom fields |
| dealId | string | get, update, delete | the ID of the target deal |
| returnAll | boolean | getAll | if true, fetch all results |
| limit | number | getAll | max results (default 20) |
| jsonParameters | boolean | getAll | if true, filters as raw JSON |
| options | object | getAll | fields (projection), sortBy, sortOrder (asc/desc) |
| filters / filtersJson | object / string | getAll | structured conditions or raw JSON |

## Runtime behavior

### Input

The node processes each input item independently. Expressions in any string parameter can reference the incoming item's JSON data (e.g. `{{ $json.companyName }}`).

### Output

Each operation produces one output item per result emitted.

- **Create:** returns the created object with its assigned Salesmate ID and all server-set fields. If `rawData` is true, the full API response is passed through.
- **Get:** returns a single matching object identified by ID.
- **GetAll:** returns an array of matching objects (paginated if limit is set, all results if returnAll is true). Each matching record is emitted as a separate output item.
- **Update:** returns the updated object after applying field changes.
- **Delete:** returns the API response confirming deletion (typically a success message).

### Errors

The node throws a `NodeOperationError` with the status code and error message from the Salesmate API when the request fails (e.g. 400 bad request, 401 auth failure, 404 not found, 500 server error). When `continueOnFail` is enabled on the node, failed items produce an `error` property on the output item instead of halting execution.

### Expressions

All string, number, and boolean parameters accept n8n expressions (the `{{ }}` syntax). This includes `additionalFields` sub-fields, filters, sort parameters, and IDs.

## Acceptance tests

### Test: Create a company

**Given** input items:

```json
[{ "json": { "companyName": "Acme Corp", "website": "https://acme.example.com" } }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "create",
  "name": "Acme Corp",
  "additionalFields": { "website": "https://acme.example.com", "phone": "+1-555-0100" }
}
```

**Expect** output[0] contains a JSON object with:
- an `id` or similar unique identifier string
- `name` equal to `"Acme Corp"`
- `website` equal to `"https://acme.example.com"`
- `phone` equal to `"+1-555-0100"`
- server-set fields like `createdAt`, `createdBy`

### Test: Get a company by ID

**Given** input items:

```json
[{ "json": { "companyId": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "get",
  "companyId": "12345"
}
```

**Expect** output[0] contains a JSON object with `id` equal to `"12345"` and standard company fields.

### Test: Create an activity

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "create",
  "activityType": "call",
  "title": "Follow-up call with lead",
  "owner": "user_001"
}
```

**Expect** output[0] contains a JSON object with:
- an activity ID
- `title` equal to `"Follow-up call with lead"`
- `activityType` equal to `"call"`
- `owner` equal to `"user_001"`

### Test: List deals with filters

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "deal",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "options": { "sortBy": "createdAt", "sortOrder": "desc" }
}
```

**Expect** output[0] contains a JSON object with deal fields. Up to 10 output items are produced, one per deal, sorted by creation date descending.

### Test: Delete a company

**Given** input items:

```json
[{ "json": { "companyId": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "company",
  "operation": "delete",
  "companyId": "12345"
}
```

**Expect** output[0] contains a JSON object with a success indicator (e.g. `{ "success": true }` or similar confirmation).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| n8n operations list | documented (public docs) | Full list of resources and operations confirmed from n8n docs page |
| Credential shape | documented (public docs) | Session Token + URL, confirmed from n8n credentials docs |
| API base URL format | inferred (public credentials) | Builds `https://{domain}/v1/` from credential URL field |
| Operation parameter names | inferred (corpus schema descriptors) | Parameter names (e.g. activityType, owner, rawData, additionalFields) confirmed from schema files under corpus |
| Filter structure detail | inferred | Supports structured filter conditions (field, operator, value) or raw JSON |
| Pagination defaults | inferred | Default page limit is typically 20 records; API returns paginated results with total count |
| Error response shapes | inferred | Standard Salesmate API error codes and messages wrapped into NodeOperationError |

## OpenFlow mapping

- **Definition group:** `sales`
- **Executor file:** `src/lib/executors/salesmate.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
