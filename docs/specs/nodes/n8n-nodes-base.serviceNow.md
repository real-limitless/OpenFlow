---
type: n8n-nodes-base.serviceNow
displayName: ServiceNow
category: Productivity, Communication
versions: [1]
priority: medium
status: specced
---

# ServiceNow

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.servicenow/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/servicenow/ | Public docs only |
| https://developer.servicenow.com/dev.do#!/reference/api/washingtondc/rest/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.serviceNow`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `serviceNowBasicApi` (Basic auth: user, password, subdomain) or `serviceNowOAuth2Api` (OAuth2: clientId, clientSecret, subdomain)

The **subdomain** is the unique prefix from the ServiceNow instance URL (`https://<subdomain>.service-now.com/`). The node constructs the base API URL as `https://<subdomain>.service-now.com/api/now`.

## Parameters

### Resource selection

A top-level **Resource** parameter chooses the ServiceNow domain object to operate on, with **Operation** selecting the action within that resource.

| Resource | Operations | Notes |
|----------|-----------|-------|
| Attachment | (not in public docs — inferred from corpus, operations TBD) | Binary file upload/download against `/api/now/attachment` |
| Business Service | Get All | Read-only list from `cmdb_ci_service` |
| Configuration Item | Get All | Read-only list from `cmdb_ci` |
| Department | Get All | Read-only list from `cmn_department` |
| Dictionary | Get All | Read-only list of table/column metadata from `sys_dictionary` |
| Incident | Create, Delete, Get, Get All, Update | Full CRUD against the `incident` table |
| Table Record | Create, Delete, Get, Get All, Update | Generic CRUD against any user-specified table |
| User | Create, Delete, Get, Get All, Update | Full CRUD against the `sys_user` table |
| User Group | Get All | Read-only list from `sys_user_group` |
| User Role | Get All | Read-only list from `sys_user_role` |

### Resource-specific fields

**Business Service / Configuration Item / Department / Dictionary / User Group / User Role (Get All operations):**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | * | When false, limit is used |
| limit | number | 50 | * | Max records to return (required when returnAll=false) |

**Incident (shared CRUD fields):**

| name | type | default | required | operations | notes |
|------|------|---------|----------|------------|-------|
| shortDescription | string | — | create | create, update | Incident short description |
| description | string | — | — | create, update | Full description |
| state | options | — | — | create, update | Loaded dynamically from the instance: 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed |
| assignmentGroup | options | — | — | create, update | Loaded dynamically from `sys_user_group` |
| assignedTo | options | — | — | create, update | Loaded dynamically from `sys_user` |
| category | options | — | — | create, update | Loaded dynamically from `sys_choice` for `incident.category` |
| subcategory | options | — | — | create, update | Dependent on category selection |
| impact | options | — | — | create, update | 1=High, 2=Medium, 3=Low |
| urgency | options | — | — | create, update | 1=High, 2=Medium, 3=Low |
| priority | options | — | — | create, update | 1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning |
| callerId | options | — | create | create, update | Loaded dynamically from `sys_user` |
| resolutionCode | options | — | — | update | Loaded dynamically; used when closing/resolving |
| resolutionNotes | string | — | — | update | Free-text resolution notes |
| holdReason | options | — | — | update | Loaded dynamically; used when state=On Hold |
| incidentId (sys_id) | string | — | * | get, delete, update | The ServiceNow `sys_id` for the incident |

**Additional incident options (fields that accept expression strings):** `sys_id`, `number`, and any additional field names provided as a JSON object or additional fields parameter.

**User (shared CRUD fields):**

| name | type | default | required | operations | notes |
|------|------|---------|----------|------------|-------|
| userName | string | — | create | create, update | User login name |
| firstName | string | — | — | create, update | |
| lastName | string | — | — | create, update | |
| email | string | — | — | create, update | |
| active | boolean | true | — | create, update | |
| source | string | — | — | create, update | User source (e.g. "ldap", "import") |
| roles | options | — | — | create | Loaded dynamically from `sys_user_role` |
| userId (sys_id) | string | — | * | get, delete, update | The ServiceNow `sys_id` |

**Table Record (generic CRUD):**

| name | type | default | required | operations | notes |
|------|------|---------|----------|------------|-------|
| tableName | options | — | * | all | Loaded dynamically from `sys_db_object`; identifies the target table |
| tableId (sys_id) | string | — | * | get, delete, update | The `sys_id` of the record |
| fields | json | — | create, update | — | Key-value pairs of column values to write; the node auto-resolves field names via `sys_dictionary` |
| returnAll | boolean | false | — | get all | When false, limit is used |
| limit | number | 50 | — | get all | Max records (required when returnAll=false) |
| matchType | options | any | — | get all | Match type for filter conditions: `any` or `all` |
| conditions | fixed-collection | — | — | get all | Array of filter conditions; each row: field (options from `sys_dictionary`), operator (options: `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `STARTSWITH`, `ENDSWITH`, `CONTAINS`, `DOES NOT CONTAIN`, `IS EMPTY`, `IS NOT EMPTY`), value (string) |

**Attachment:**

| name | type | default | required | operations | notes |
|------|------|---------|----------|------------|-------|
| tableName | options | — | * | all | Loaded dynamically; the table the attachment belongs to |
| tableSysId | string | — | * | all | sys_id of the record the attachment is on |
| attachmentId | string | — | * | delete, get, download | sys_id of the attachment |
| inputBinaryField | string | — | * | upload | Name of the incoming binary field to upload |

### Return All / Limit behavior

All read-only resources (Business Service, Configuration Item, Department, Dictionary, User Group, User Role) and the Get All operations for Incident, User, and Table Record share a `returnAll` (boolean) + `limit` (number, default 50) pair. When `returnAll` is `true`, the node pages through all matching records. When `false`, only up to `limit` records are returned.

### Options (shared across resources)

| name | type | default | notes |
|------|------|---------|-------|
| additionalFields | json | — | Arbitrary key-value pairs sent as query parameters for Get All or as body fields for Create/Update |

## Runtime behavior

### Input

Each incoming item is processed independently. The resource and operation determine which parameters are required.

### Output

For single-record operations (Create, Get, Update, Delete), the node emits one output item per input item, with the ServiceNow API response body nested under the `json` key.

For list operations (Get All), the node emits one output item per returned record. Pagination is handled internally when `returnAll=true`; otherwise the result is truncated to `limit`.

The output shape follows the ServiceNow REST API response envelope: `{ result: { ...fields } }`. The node unwraps the `result` field so each output item contains the record's field-value pairs directly.

Error output: when an API error occurs and `continueOnFail` is enabled, the node emits the original input item with an `error` property added.

### Errors

- Authentication failures (401/403) are fatal — throw immediately.
- Resource-not-found (404) on Get/Delete/Update operations throws by default.
- Invalid field names in Create/Update throw by default.
- `continueOnFail` causes errors to be surfaced as `error` properties on output items instead of throwing.

### Expressions

All string fields accept expression strings. The `additionalFields` JSON and Table Record `conditions` value fields also accept expressions.

## Acceptance tests

### Test: incident — create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "incident",
  "operation": "create",
  "shortDescription": "Test incident from n8n",
  "callerId": { "__type": "optionsLookup", "value": "user-sys-id" },
  "impact": "2",
  "urgency": "2"
}
```

**Expect** output[0] contains a JSON object with at minimum `sys_id`, `number`, `short_description`, `caller_id`, `impact`, `urgency`, and `sys_created_on` fields. The `number` field must match the pattern `INC\d+`.

### Test: incident — get all with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "incident",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] contains exactly 5 items, each with a `sys_id` and `number` field.

### Test: table record — create and get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters (first execution):**

```json
{
  "resource": "tableRecord",
  "operation": "create",
  "tableName": "incident",
  "fields": {
    "short_description": "Table record test",
    "description": "Created via generic table record operation"
  }
}
```

**Expect** output[0] contains `sys_id`, `short_description`, and `description` matching the input.

**Parameters (second execution using the sys_id from output):**

```json
{
  "resource": "tableRecord",
  "operation": "get",
  "tableName": "incident",
  "tableId": "{{ $json.sys_id }}"
}
```

**Expect** output[0] contains the same `sys_id` and matching `short_description`.

### Test: user — get all (returnAll)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] contains one item per user record. Each item must include at minimum `sys_id`, `user_name`, and `active`.

### Test: get business services

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "businessService",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] contains one item per business service record, each with a `sys_id` and `name`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | Public n8n docs list all 9 resources and their operations |
| Incident field names | partially documented | Short description, description, state, category, subcategory, impact, urgency, priority, assignment group, assigned to, caller are known; exact field labels and option values are inferred from corpus `.d.ts` loadOptions method names |
| User field names | partially documented | userName, firstName, lastName, email, active, source, roles are inferred from corpus; SysUser table API is well-known externally |
| Table Record conditions model | inferred | Fixed-collection filter with field/operator/value is typical n8n pattern; the operator list is inferred |
| Attachment resource | inferred | Exists in corpus but not in public docs; external ServiceNow Attachment API is well-documented |
| Dynamic option loaders | documented | Public docs confirm getTables, getColumns, getBusinessServices, getUsers, getAssignmentGroups, getUserRoles, getConfigurationItems, getIncidentCategories, getIncidentSubcategories, getIncidentStates, getIncidentResolutionCodes, getIncidentHoldReasons are loaded at runtime |
| Return All / Limit pattern | documented | Standard n8n pagination pattern; confirmed by corpus |
| Additional fields pattern | inferred | Common n8n app-node pattern; the ServiceNow REST API accepts arbitrary query parameters |
| Exact API endpoint mapping | inferred | The `mapEndpoint` function maps resource+operation to REST API paths; exact mapping is extrapolated from known ServiceNow REST API conventions (`/table/{tableName}`, `/attachment`, etc.) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/serviceNow.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
