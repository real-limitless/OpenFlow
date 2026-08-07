---
type: n8n-nodes-base.tapfiliate
displayName: Tapfiliate
category: Sales
versions: [1]
priority: medium
status: specced
---

# Tapfiliate

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.tapfiliate/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/tapfiliate/ | Public docs only |
| https://tapfiliate.com/docs/rest/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.tapfiliate`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `tapfiliateApi` (API Key — sent as `X-Api-Key` header)

## Parameters

### Resource: Affiliate

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | literal | `affiliate` | yes | — | Selects the Affiliate resource |
| operation | literal | `create` / `get` / `getAll` / `delete` | yes | — | |
| email | string | — | no | operation=create | Affiliate email address |
| firstname | string | — | no | operation=create | Affiliate first name |
| lastname | string | — | no | operation=create | Affiliate last name |
| additionalFields | object | — | no | operation=create | Container for optional create fields |
| additionalFields.addressUi | object | — | no | operation=create | Address sub-fields (street, city, etc.) |
| additionalFields.companyName | string | — | no | operation=create | Company name |
| affiliateId | string | — | yes | operation=get or delete | Affiliate ID to retrieve or delete |
| returnAll | boolean | false | no | operation=getAll | Return all results instead of paginated |
| limit | number | 50 | no | operation=getAll, returnAll=false | Max items to return |
| filters | object | — | no | operation=getAll | Collection of filter criteria |
| filters.affiliate_group_id | string | — | no | operation=getAll | Filter by affiliate group ID |
| filters.click_id | string | — | no | operation=getAll | Filter by click ID |
| filters.email | string | — | no | operation=getAll | Filter by email address |
| filters.parentId | string | — | no | operation=getAll | Filter by parent affiliate ID |
| filters.referral_code | string | — | no | operation=getAll | Filter by referral code |
| filters.source_id | string | — | no | operation=getAll | Filter by source ID |

### Resource: Affiliate Metadata

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | literal | `affiliateMetadata` | yes | — | |
| operation | literal | `add` / `remove` / `update` | yes | — | |
| affiliateId | string | — | yes | all operations | Affiliate to attach metadata to |
| metadataUi | object | — | no | operation=add | Key-value pairs container |
| metadataUi.metadataValues | array | — | no | operation=add | Array of {key, value} objects |
| key | string | — | yes | operation=remove or update | Metadata key to target |
| value | string | — | yes | operation=update | New value for the key |

### Resource: Program Affiliate

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | literal | `programAffiliate` | yes | — | |
| operation | literal | `add` / `approve` / `disapprove` / `get` / `getAll` | yes | — | |
| programId | string | — | yes | all operations | Program ID (string slug, loaded dynamically from API) |
| affiliateId | string | — | yes | all operations | Affiliate ID |
| additionalFields | object | — | no | operation=add | Container for optional add fields |
| additionalFields.approved | boolean | — | no | operation=add | Auto-approve the affiliate on add |
| additionalFields.coupon | string | — | no | operation=add | Coupon code for the affiliate |
| returnAll | boolean | false | no | operation=getAll | Return all results |
| limit | number | 50 | no | operation=getAll, returnAll=false | Max items to return |
| filters | object | — | no | operation=getAll | Collection of filter criteria |
| filters.affiliate_group_id | string | — | no | operation=getAll | Filter by affiliate group ID |
| filters.email | string | — | no | operation=getAll | Filter by email |
| filters.parentId | string | — | no | operation=getAll | Filter by parent affiliate ID |
| filters.source_id | string | — | no | operation=getAll | Filter by source ID |

## Runtime behavior

### Input

The node accepts any incoming items. Input data is not directly consumed — all values come from the node's own parameter configuration (or expressions referencing upstream data). For Affiliate create, input data keys can map to field parameters via expressions.

### Output

**Affiliate — create:** Returns the created affiliate object from the Tapfiliate API (`POST /1.6/affiliates/`). Shape includes `id`, `firstname`, `lastname`, `email`, `referral_code`, `meta_data`, and related fields.

**Affiliate — get:** Returns a single affiliate object (`GET /1.6/affiliates/{id}/`).

**Affiliate — getAll:** Returns an array of affiliate objects (`GET /1.6/affiliates/`). Supports pagination via `returnAll`/`limit`. Filter parameters are sent as query string fields.

**Affiliate — delete:** Returns a 204 success status (`DELETE /1.6/affiliates/{id}/`). Outputs the input item unmodified.

**Affiliate Metadata — add:** Sends key-value pairs to `PUT /1.6/affiliates/{affiliateId}/meta-data/` (replaces all metadata). Returns the full metadata object.

**Affiliate Metadata — remove:** Sends `DELETE /1.6/affiliates/{affiliateId}/meta-data/{key}/`. Returns 204 with input item unmodified.

**Affiliate Metadata — update:** Sends `PUT /1.6/affiliates/{affiliateId}/meta-data/{key}/` with `{"value": <value>}`. Returns the updated metadata.

**Program Affiliate — add:** Sends `POST /1.6/programs/{programId}/affiliates/` with `{affiliate: affiliateId}` plus optional approved/coupon. Returns the program-affiliate relationship object.

**Program Affiliate — approve:** Sends `PUT /1.6/programs/{programId}/affiliates/{affiliateId}/approve/`. Returns approval confirmation.

**Program Affiliate — disapprove:** Sends `DELETE /1.6/programs/{programId}/affiliates/{affiliateId}/approve/`. Returns 204.

**Program Affiliate — get:** Sends `GET /1.6/programs/{programId}/affiliates/{affiliateId}/`. Returns the program-affiliate relationship object.

**Program Affiliate — getAll:** Sends `GET /1.6/programs/{programId}/affiliates/`. Returns paginated array of program-affiliate relationships.

### Errors

API errors (4xx/5xx) are surfaced as node errors. The `continueOnFail` option, when enabled, passes the error object as output instead of throwing. Rate-limit responses (429) and authentication failures (401) are thrown as node exceptions with descriptive messages.

### Expressions

All string, number, and boolean parameters accept expressions (`=...` syntax). The programId parameter supports dynamic option loading from the Tapfiliate API via a `getPrograms` load-options method.

## Acceptance tests

### Test: create affiliate

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "affiliate",
  "operation": "create",
  "email": "test@example.com",
  "firstname": "Jane",
  "lastname": "Doe"
}
```

**Expect** a POST to `https://api.tapfiliate.com/1.6/affiliates/` with body containing email/firstname/lastname, and output[0] containing the API response with an `id` and `referral_code`.

### Test: get affiliate by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "affiliate",
  "operation": "get",
  "affiliateId": "janejameson"
}
```

**Expect** GET to `/1.6/affiliates/janejameson/` and output[0] containing the affiliate object with `id: "janejameson"`.

### Test: list affiliates with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "affiliate",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "filters": { "email": "test@example.com" }
}
```

**Expect** GET to `/1.6/affiliates/` with query params `email=test@example.com&page=1`, output[0] containing an array of matching affiliates.

### Test: add affiliate to program and approve

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters (add):**
```json
{
  "resource": "programAffiliate",
  "operation": "add",
  "programId": "my-program",
  "affiliateId": "janejameson"
}
```

**Followed by parameters (approve):**
```json
{
  "resource": "programAffiliate",
  "operation": "approve",
  "programId": "my-program",
  "affiliateId": "janejameson"
}
```

**Expect** POST to `/1.6/programs/my-program/affiliates/` followed by PUT to `/1.6/programs/my-program/affiliates/janejameson/approve/`.

### Test: manage affiliate metadata

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters (add metadata):**
```json
{
  "resource": "affiliateMetadata",
  "operation": "add",
  "affiliateId": "janejameson",
  "metadataUi": {
    "metadataValues": [{ "key": "region", "value": "EMEA" }]
  }
}
```

**Expect** PUT to `/1.6/affiliates/janejameson/meta-data/` with body `{"region":"EMEA"}`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API base URL | Documented | `https://api.tapfiliate.com/1.6/` confirmed in Tapfiliate REST API docs |
| Authentication | Documented | `X-Api-Key` header, confirmed in Tapfiliate docs and n8n credential definition |
| Affiliate resources & operations | Documented | Confirmed in both n8n docs page and Tapfiliate REST API reference |
| Affiliate create body fields | Inferred from schema | email, firstname, lastname, addressUi (street etc.), companyName |
| Metadata API | Documented | PUT (replace-all), GET (by-key), DELETE (by-key) confirmed in Tapfiliate API |
| Program affiliate endpoints | Documented | Full CRUD + approve/disapprove confirmed in Tapfiliate API reference |
| Pagination defaults | Documented | 25 per page in Tapfiliate API; n8n node adds returnAll/limit abstraction |
| Dynamic program loading | Inferred from type declarations | The node exposes a `getPrograms` load-options method for programId dropdown |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/tapfiliate.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
