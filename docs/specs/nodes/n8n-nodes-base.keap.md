---
type: n8n-nodes-base.keap
displayName: Keap
category: CRM
versions: [1]
priority: medium
status: specced
---

# Keap

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.keap.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/keap.md | Public docs only |
| https://developer.keap.com/docs/restv2/ | Third-party service API docs |
| https://developer.keap.com/getting-started-oauth-keys/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.keap`
- **Aliases:** (none documented)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Keap OAuth2 credentials. OAuth2 uses the Authorization Code grant at `https://accounts.infusionsoft.com/app/oauth/authorize` with `scope=full`, then exchanges the code at `https://api.infusionsoft.com/token`. Refresh tokens are rotated on each use. API requests use `https://api.infusionsoft.com/crm/rest/v2/` as the base URL with Bearer token auth.

## Parameters

The node exposes a resource/operation selection followed by fields required for the chosen action. OpenFlow should present these as ordinary typed configuration.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | selection | — | yes | always | One of: Company, Contact, Contact Note, Contact Tag, Ecommerce Order, Ecommerce Product, Email, File. |
| `operation` | selection | — | yes | resource-dependent | See per-resource operations below. |
| resource identifier(s) | string / expression | none | action-dependent | operation-dependent | ID or lookup params identifying the entity to act on, e.g. contactId, orderId, productId, fileId, noteId. |
| request fields | typed values / expressions | none | action-dependent | operation-dependent | Attributes needed to create or update the selected entity, or to specify the email/file payload. |
| pagination / query controls | typed values / expressions | service default | optional | get-many / list operations | Limit, offset, and filter params for collection queries. |

### Per-resource operations

**Company**
- Create — POST a new company with provided attributes; returns the created company.
- Retrieve All — GET a paginated list of companies; accepts optional query filters.

**Contact**
- Create/Update — Upsert a contact by email or other identifier; returns the contact record. Accepts standard contact fields (given_name, family_name, email_addresses, phone_numbers, addresses, etc.).
- Delete — Remove a contact by ID; returns confirmation.
- Retrieve — GET a single contact by ID; returns the contact record.
- Retrieve All — GET a paginated list of contacts with optional filters (email, given_name, family_name, etc.).

**Contact Note**
- Create — POST a note body associated with a contact ID; returns the created note.
- Delete — Remove a note by ID (scoped to a contact).
- Get — GET a single note by ID; returns the note text/metadata.
- Retrieve All — GET all notes for a contact with pagination.
- Update — PUT updated note body for a given note ID.

**Contact Tag**
- Add Tags — POST a list of tag IDs to apply to a contact; returns the applied tags.
- Delete Tag — Remove a specific tag from a contact.
- Retrieve All Tags — GET all tags currently applied to a contact.

**Ecommerce Order**
- Create — POST a new ecommerce order with line items, totals, contact info, etc.; returns the created order.
- Get — GET a single order by ID.
- Delete — Remove an order by ID.
- Retrieve All — GET a paginated list of orders with optional date/status filters.

**Ecommerce Product**
- Create — POST a new product with name, price, description, etc.; returns the created product.
- Delete — Remove a product by ID.
- Get — GET a single product by ID.
- Retrieve All — GET a paginated list of products.

**Email**
- Create Record — POST a record of an email sent to a contact (for logging external sends).
- Retrieve All Sent — GET a paginated list of sent email records.
- Send Email — POST to send an email via Keap's email system; requires recipient, subject, and body.

**File**
- Delete — Remove a file by ID.
- Retrieve All — GET a paginated list of files with optional filters.
- Upload — POST a file to Keap's file storage; accepts file content and metadata; returns the created file record.

Expressions are allowed for identifiers, request fields, query controls, and file upload metadata. The node must resolve expressions per input item.

## Runtime behavior

### Input

For each incoming item, execute the configured Keap action using the item's resolved expressions and the configured OAuth2 credential. The node authenticates against `https://api.infusionsoft.com/crm/rest/v2/` with the Bearer token. Resource and operation choices must map to supported Keap v2 REST API endpoints.

### Output

Return one OpenFlow item for each successfully processed input item. The `json` value contains the service response data at the outcome level: the created/updated entity for write actions, the requested entity for get actions, a paginated collection for list actions, and a confirmation result for deletes and sends.

For collection listings (Retrieve All), include any pagination metadata returned by the API (e.g. `next`, `count`). Preserve item order for per-item execution.

### Errors

Authentication failures (bad/expired OAuth2 token), invalid configuration (missing required fields), rejected requests (validation errors), missing resources (404), rate limits, and service errors fail the item/node with an actionable error. Do not convert an HTTP/API error into an empty successful result. If the workflow's `continueOnFail` behavior is enabled, return an item-level error representation according to the OpenFlow SDK contract; otherwise propagate the error and stop normal execution.

### Expressions

Resolve expressions in identifiers, request fields, query controls, and file metadata against the current input item. Static values must remain valid when no expression is used.

## Acceptance tests

### Test: create and retrieve a contact

**Given** one input item with `{ given_name: "Alice", family_name: "Smith" }` and valid OAuth2 credentials, configure the Contact Create/Update operation.

**Expect:** one successful output item whose `json` contains the Keap service result identifying the created contact (including its `id`, `given_name`, `family_name`). Then configure Contact Retrieve using the returned ID.

**Expect:** the second call returns the same contact record.

### Test: create a note on an existing contact

**Given** a known contact ID in the input item and a note body `{ body: "Follow up call completed" }`, configure Contact Note Create.

**Expect:** one successful output item whose `json` includes the created note with the note body and associated contact ID.

### Test: add and list tags on a contact

**Given** a known contact ID and a list of tag IDs `{ tagIds: [1, 2, 3] }`, configure Contact Tag Add Tags.

**Expect:** one successful output item whose `json` confirms the tags were applied. Then configure Contact Tag Retrieve All Tags.

**Expect:** the returned tag list includes the applied tags.

### Test: paginated listing of companies

**Given** valid credentials and a Company Retrieve All operation with a page limit of 10.

**Expect:** one successful output item whose `json` contains a collection of companies and any pagination metadata. The response shape is the service's native collection format.

### Test: credential and API error

**Given** an invalid OAuth2 token or a request referencing a non-existent contact ID.

**Expect:** execution fails with an error that identifies the authentication/request failure. With `continueOnFail`, the failed input is represented as an error item according to the SDK contract.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Listed on the public n8n Keap node page. |
| Credential type and OAuth2 flow | documented | Keap credentials page + Keap's OAuth2 getting-started guide. |
| Exact parameter field names, nested structures, option enums | inferred | Not documented in public n8n docs at the field level; the spec describes at the functional level. An implementation would need to consult the Keap v2 REST API docs for exact request body schemas. |
| Trigger node | documented | Keap Trigger exists but its public docs page states only that it exists; no operation details are documented. This spec covers only the action node. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.keap.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
