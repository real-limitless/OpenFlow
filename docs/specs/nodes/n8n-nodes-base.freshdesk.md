---
type: n8n-nodes-base.freshdesk
displayName: Freshdesk
category: Communication
versions: [1]
priority: medium
status: specced
---

# Freshdesk

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshdesk.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/freshdesk.md | Public docs only |
| https://developers.freshdesk.com/api/ | Public docs only |

The temporary corpus was used only to confirm the published type string and the
resource/operation inventory and to discover parameter names and option enums
that are also documented in the public Freshdesk API reference. No
implementation source was used.

## Wire format

- **Type string:** `n8n-nodes-base.freshdesk`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Freshdesk API credential using an API key and a Freshdesk
  subdomain (domain). Authentication uses HTTP Basic with the API key as the
  username and the literal `X` as the password, against
  `https://{domain}.freshdesk.com/api/v2/`.

## Parameters

The node exposes a resource selector (Contact or Ticket) and an operation
selector within each resource. Operation-specific fields should be presented
only when relevant to the selected resource and operation.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | option | ticket | yes | always | Contact or Ticket. |
| operation | option | create | yes | selected resource | One of: create, delete, get, getAll, update. |
| resource identifier | string or expression | none | conditional | get/delete/update | The ID of the contact or ticket. |
| request fields | collection | none | conditional | create/update | Values supported by the selected Freshdesk resource operation (see below). |
| query and pagination controls | collection | none | conditional | getAll | Filters, sorting, and limit/returnAll controls. |

### Contact operations

**Create** — Creates a new contact in Freshdesk. Accepts a top-level `name`
and `email` plus a nested `additionalFields` map supporting: address,
company_id, customFields (free-form object), description, job_title, language,
mobile, other_companies, other_emails, phone, tags, time_zone, twitter_id,
unique_external_id, view_all_tickets.

**Get** — Retrieves a single contact by contactId.

**Get All** — Lists contacts with optional filter fields: company_id, email,
mobile, phone, state (blocked/deleted/unverified/verified), updated_since.

**Update** — Updates an existing contact identified by contactId; accepts the
same additionalFields as Create.

**Delete** — Soft-deletes a contact by contactId.

### Ticket operations

**Create** — Creates a new ticket. Accepts:
- `requester` — identification method: email, facebookId, phone, requesterId,
  twitterId, uniqueExternalId
- `requesterIdentificationValue` — the value for the chosen method
- `status` — open, pending, resolved, closed
- `priority` — low, medium, high, urgent
- `source` — email, portal, phone, chat, feedbackWidget, mobileHelp,
  OutboundEmail
- `options` — nested map including: agent, ccEmails, company, description,
  dueBy, emailConfigId, frDueBy, group, name, product, subject, tags, type
  (Feature Request / Incident / Problem / Question / Refund)

**Get** — Retrieves a single ticket by ticketId.

**Get All** — Lists tickets with:
- `returnAll` / `limit` — pagination control
- `options`: companyId, include (array: company/description/requester/stats),
  order (asc/desc), orderBy (createdAt/dueBy/updatedAt), requesterEmail,
  requesterId, updatedSince

**Update** — Updates a ticket identified by ticketId. Accepts `updateFields`
nested map supporting: agent, ccEmails, company, dueBy, emailConfigId,
frDueBy, group, name, product, priority, requester,
requesterIdentificationValue, status, source, tags, type.

**Delete** — Deletes a ticket by ticketId.

### Freshdesk API endpoint mapping

| Resource | Operation | HTTP method | Freshdesk endpoint |
|----------|-----------|-------------|--------------------|
| Contact | create | POST | /api/v2/contacts |
| Contact | get | GET | /api/v2/contacts/{id} |
| Contact | getAll | GET | /api/v2/contacts |
| Contact | update | PUT | /api/v2/contacts/{id} |
| Contact | delete | DELETE | /api/v2/contacts/{id} |
| Ticket | create | POST | /api/v2/tickets |
| Ticket | get | GET | /api/v2/tickets/{id} |
| Ticket | getAll | GET | /api/v2/tickets |
| Ticket | update | PUT | /api/v2/tickets/{id} |
| Ticket | delete | DELETE | /api/v2/tickets/{id} |

## Runtime behavior

### Input

The node consumes items from `main[0]`. For item-scoped create, update, delete,
or get operations, values are resolved per item and the selected Freshdesk
request is made using the configured credential. Collection operations (getAll)
may use the first item or a single request; pagination parameters control the
response set.

### Output

Each successful request produces one output item on `main[0]` whose `json`
value contains the successful Freshdesk result at the outcome level: a single
resource object for single-resource operations, an array of objects for
getAll, or the service's successful result body for mutations. The
implementation must preserve meaningful fields returned by the service (id,
name, email, subject, status, priority, description, timestamps, custom_fields,
tags, etc.) and must not replace them with a generic request envelope. Empty
successful collections are valid outputs.

### Errors

- Missing credentials, an invalid credential, missing required identifiers, and
  invalid operation-specific data must fail the item with an actionable
  execution error.
- Freshdesk returns standard HTTP error codes: 400 (validation), 401 (auth),
  403 (access denied), 404 (not found), 405 (wrong method), 409 (conflict),
  415 (unsupported content type), 429 (rate limit), 500 (server error). These
  must remain failures and include the service error context when available;
  they must not silently become empty results.
- When continue-on-fail behavior is enabled, the failed item may be represented
  using the runtime's standard error-item contract and processing may continue.

### Expressions

Operation-specific scalar values and request/additional/update fields may be
supplied by expressions. Expressions are resolved against the current input
item before the request is sent. Resource and operation selection are
configuration controls and should not change per item unless the host runtime
explicitly supports that mode.

## Acceptance tests

### Test: create a contact

**Given** input items:

```json
[{ "json": { "name": "Jane Doe", "email": "jane@example.com" } }]
```

**Parameters:** resource `Contact`, operation `Create`.

**Expect:** one successful output item containing a newly created contact
result; the result has a service-assigned identifier and retains the supplied
name and email.

### Test: get, update, and re-get a ticket

**Given** an input item containing a known ticketId and a new priority value.

**Parameters:** resource `Ticket`, operation `Update`, `updateFields` with
`priority: "urgent"`.

**Expect:** the output contains the updated ticket result with priority
reflecting the new value. A subsequent Get by the same ticketId returns a
ticket whose priority matches the updated value.

### Test: list all contacts filtered by email

**Given** an execution with valid credentials and a known email address.

**Parameters:** resource `Contact`, operation `Get All`, filter `email` set to
the known address.

**Expect:** a successful output containing an array of contacts. At least one
contact in the result matches the supplied email.

### Test: delete and not-found error

**Given** a known contactId.

**Parameters:** resource `Contact`, operation `Delete`.

**Expect:** delete succeeds (204 No Content). A subsequent Get with the same
contactId produces an execution error (404) rather than an empty success item.

### Test: paginated ticket listing

**Given** valid credentials and a support account with more than 10 tickets.

**Parameters:** resource `Ticket`, operation `Get All`, `returnAll` false,
`limit` 5.

**Expect:** a successful output containing at most 5 ticket objects.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Confirmed by the public node page and isolated corpus. |
| Authentication (API key + subdomain) | documented | Confirmed by public Freshdesk credentials page and the Freshdesk API authentication docs. |
| Main input/output channels | documented | Confirmed by isolated public descriptor metadata. |
| HTTP endpoint mapping per operation | documented | Freshdesk API reference publicly documents every endpoint. |
| Error contract and status codes | documented | Freshdesk API reference publicly documents error codes. |
| Per-item request scheduling and output item wrapping | inferred | Follows the OpenFlow item contract and common operation-node behavior. |
| Exact required fields per operation | partial | The public pages list operations at a high level; the corpus schemas confirm optionality. Implementers must validate against the Freshdesk API itself. |
| Error-item representation and retries | inferred | Delegated to OpenFlow runtime conventions. |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/freshdesk.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
