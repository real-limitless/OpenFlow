---
type: n8n-nodes-base.zohoCrm
displayName: Zoho CRM
category: App
versions: [1]
priority: high
status: specced
---

# Zoho CRM

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zohocrm.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zoho.md | Public docs only |
| https://www.zoho.com/crm/developer/docs/api/v8/get-records.html | Third-party service API docs |
| https://www.zoho.com/crm/developer/docs/api/v8/insert-records.html | Third-party service API docs |
| https://www.zoho.com/crm/developer/docs/api/v8/update-records.html | Third-party service API docs |
| https://www.zoho.com/crm/developer/docs/api/v8/delete-records.html | Third-party service API docs |

The node documentation and credential documentation were used as the primary
sources. The Zoho API pages define the external REST contract. No third-party
node implementation or package source was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.zohoCrm`
- **Aliases:** none required
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Zoho OAuth2 credential (`ZohoOAuth2Api`); the credential uses OAuth2 and a region-specific Zoho authorization/token endpoint.
- **AI tool use:** The public node documentation identifies this node as usable by an AI agent. This changes how parameter values may be supplied, not the CRM operation contract.

## Parameters

Parameters are exposed at a level that lets a workflow select a CRM module and
operation without requiring a copy of Zoho's complete module schema. Field
names and values in record data must use the API names supported by the chosen
Zoho module.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| module | string/selection | none | yes | all operations | One of the modules exposed by the node: Account, Contact, Deal, Invoice, Lead, Product, Purchase Order, Quote, Sales Order, or Vendor. |
| operation | selection | none | yes | all operations | Create, upsert, delete, get, get all, or update. Lead also supports getting field metadata. |
| recordId | string | none | for single-record get, update, and delete | operation requires one record | The Zoho record identifier. Delete may accept multiple IDs where the external API supports it. |
| recordData | object or list of objects | none | for create, upsert, and update | write operations | Data to send to Zoho, using module field API names. Batch writes preserve the input order in Zoho's response. |
| retrievalOptions | object | none | no | get all | Optional fields, page/page token, page size, custom view, sorting, and related retrieval filters supported by Zoho. Mutually exclusive combinations must be rejected by Zoho or the node before the request. |
| deleteOptions | object | none | no | delete | Optional control for whether CRM workflow automation is triggered during deletion. |
| operationOptions | object | none | no | create/update/upsert | Optional service-level controls such as workflow/approval/blueprint triggers, layout or validation-rule execution, and skipping supported automations. These are passed only when supported by the selected operation. |

Expressions are allowed for values supplied through normal OpenFlow parameter
resolution, including module, record identifiers, retrieval options, and record
data. The node must resolve expressions before constructing the Zoho request.

## Runtime behavior

### Input

The node consumes `main` items. Each item supplies values for the selected
operation, either directly through node parameters or through expressions. A
record write may contain one record or a service-supported batch. The executor
must not invent field names or silently reshape arbitrary module data.

The selected module is translated to its Zoho module API name. The selected
operation determines the corresponding service action:

- Create sends new record data.
- Upsert creates a record or updates an existing record according to Zoho's
  duplicate/unique-field rules.
- Get retrieves one record by ID.
- Get all retrieves a page or pages of records using the supplied retrieval
  options.
- Update changes one or more existing records and requires each target ID.
- Delete removes one or more records by ID.
- Get lead fields retrieves field metadata for the Lead module.

### Output

For a successful service call, emit `main` items containing JSON-compatible
Zoho result data. The result must retain enough information for downstream
nodes to identify created, updated, retrieved, or deleted records, including
record IDs when Zoho supplies them. A list retrieval must preserve the records
and pagination information needed to continue a paged query. For a batch
request, result entries remain correlated with the corresponding input record
by position.

The specification intentionally does not require a byte-for-byte copy of
Zoho's response envelope. It does require preserving service success/error
status and the useful record or metadata payload.

### Errors

Fail the item or execution when credentials are absent/invalid, the selected
module or operation is unsupported, a required ID or field is missing, the
request violates Zoho validation or pagination rules, or Zoho returns an
authentication, authorization, rate/limit, or server error. Preserve Zoho's
error code/message and HTTP status when available.

For a Zoho multi-status response, preserve the per-record success or failure
results in input order rather than treating the whole batch as uniformly
successful. `continueOnFail` follows the OpenFlow execution convention: when
enabled, an item-level service failure is represented as an error item and
processing may continue; otherwise the error stops the node according to the
engine's normal failure policy.

## Acceptance tests

### Test: create a contact

**Given** input items:

```json
[{ "json": { "email": "ada@example.test" } }]
```

**Parameters:**

```json
{
  "module": "Contact",
  "operation": "create",
  "recordData": { "Last_Name": "Lovelace", "Email": "={{$json.email}}" }
}
```

**Expect** output[0] to contain a successful Zoho result with the newly
created record identifier and success status.

### Test: retrieve one lead

**Given** a known Zoho lead ID `LEAD_ID`.

**Parameters:**

```json
{
  "module": "Lead",
  "operation": "get",
  "recordId": "LEAD_ID"
}
```

**Expect** one successful result containing the lead record data and its ID.

### Test: list accounts with pagination

**Parameters:**

```json
{
  "module": "Account",
  "operation": "getAll",
  "retrievalOptions": { "fields": ["Account_Name"], "page": 1, "perPage": 2 }
}
```

**Expect** at most two account records plus pagination state when Zoho reports
that more records are available.

### Test: update and delete a product

**Parameters:**

```json
{
  "module": "Product",
  "operation": "update",
  "recordId": "PRODUCT_ID",
  "recordData": { "Product_Name": "Updated product" }
}
```

**Expect** a successful update result identifying `PRODUCT_ID`. A subsequent
delete with the same module and ID must return a successful deletion result;
using an unknown ID must instead preserve Zoho's error code and message.

### Test: invalid credentials

**Parameters:**

```json
{ "module": "Lead", "operation": "get", "recordId": "LEAD_ID" }
```

**Expect** the node to fail with an authentication/authorization error and not
emit a successful lead result.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node type, supported modules, and operation families | documented | Taken from the public Zoho CRM node page; the page lists the ten module groups and their operations. |
| OAuth2 credential and regional token endpoint selection | documented | Taken from the public Zoho credential page. |
| REST verbs, IDs, field API names, pagination, batch limits, and service errors | documented | Taken from Zoho CRM V8 API documentation. |
| Per-input-item execution and OpenFlow item conversion | inferred | Required by the OpenFlow wire contract and common node execution model; exact original batching details are intentionally unspecified. |
| Exact UI parameter names, defaults, and display conditions | intentionally unspecified | They are not needed to satisfy the external service contract and are not reconstructed from package metadata. |
| Current API version and module availability | medium confidence | Zoho's public API pages are versioned and may evolve; the executor should use the configured/current service endpoint rather than hard-code undocumented behavior. |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/zoho-crm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
