---
type: n8n-nodes-base.zendesk
displayName: Zendesk
category: Communication
versions: [1]
priority: medium
status: specced
---

# Zendesk

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zendesk.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zendesk.md | Public docs only |

The temporary corpus was used only to confirm the published type string and the
resource/operation inventory. No package implementation or schema source was
used.

## Wire format

- **Type string:** `n8n-nodes-base.zendesk`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one Zendesk credential using either API token authentication
  or OAuth2. API-token setup requires a Zendesk subdomain, login email, and API
  token. OAuth2 setup requires the Zendesk subdomain and an OAuth client.

## Parameters

The node exposes a resource selector and an operation selector. Operation-specific
fields should be presented only when relevant to the selected resource and
operation. Exact request fields are delegated to the corresponding Zendesk API
resource rather than modeled as a generic arbitrary HTTP node.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | option | API token | yes | always | Select API token or OAuth2 credentials. |
| resource | option | Ticket | yes | always | Ticket, Ticket Field, User, or Organization. |
| operation | option | resource-dependent | yes | selected resource | Choose one of the documented operations below. |
| resource identifier | string or expression | none | conditional | get/delete/update/count/data operations | Identifies the ticket, user, organization, or other selected resource where required. |
| request fields | object/collection | none | conditional | create/update/recover operations | Values supported by the selected Zendesk resource operation, including ticket, user, or organization data. |
| query and pagination controls | collection | service-dependent | no | get-all, search, and count operations | Filters, limits, and other collection-query controls supported by the operation. |

### Supported operations

The following operation inventory is documented publicly:

- **Ticket:** create, delete, get, get all, recover a suspended ticket, update.
- **Ticket Field:** get one field, get all system and custom fields.
- **User:** create, delete, get, get all, get a user's organizations, get user
  data, search, update.
- **Organization:** create, delete, count, get, get all, get organization data,
  update.

The node may be used as an AI tool, so supported operation parameters must also
be valid targets for expression or AI-provided values where OpenFlow exposes
those capabilities.

## Runtime behavior

### Input

The node consumes items from `main[0]`. For an item-scoped create, update,
delete, get, recover, or data operation, values are resolved for that item and
the selected Zendesk request is made using the configured credential. Collection
operations may use the item as the source of query values; if no item-specific
value is needed, one request is sufficient for the execution.

### Output

Each successful request produces an item on `main[0]` whose `json` value contains
the successful Zendesk result at the outcome level: a single resource for a
single-resource operation, a collection for a get-all/search operation, a count
for the organization count operation, or the service's successful result for a
mutation. The implementation must preserve meaningful fields returned by the
service and must not replace them with a generic request envelope. Empty
successful collections are valid outputs.

### Errors

- Missing credentials, an invalid credential, missing required identifiers, and
  invalid operation-specific data must fail the item before or during the
  request with an actionable execution error.
- Zendesk authentication, authorization, not-found, validation, rate-limit, and
  server failures must remain failures and include the service error context
  when available; they must not silently become empty results.
- When continue-on-fail behavior is enabled by the workflow runtime, the failed
  item may be represented using the runtime's standard error-item contract and
  processing may continue. The exact error-item envelope is an OpenFlow runtime
  concern, not a Zendesk response shape.

### Expressions

Operation-specific scalar values and request fields may be supplied by
expressions. Expressions are resolved against the current input item before the
request is sent. Resource and operation selection are configuration controls and
should not be changed per item unless the host runtime explicitly supports that
mode.

### Tag replacement

When updating a ticket with a complete tag list, Zendesk replaces the ticket's
existing tags with the supplied list. The executor must document and preserve
this behavior. Users who need additive tagging must first read and merge the
existing tags or use an API operation intended to add tags without replacement.

## Acceptance tests

### Test: create a ticket

**Given** input items:

```json
[{ "json": { "subject": "Printer offline", "description": "The third-floor printer is unavailable" } }]
```

**Parameters:** resource `Ticket`, operation `Create`, and request fields mapped
from the current item.

**Expect:** one successful output item containing a newly created ticket result;
the result has a service-assigned identifier and retains the submitted subject
and description.

### Test: retrieve and update a user

**Given** an input item containing a known user identifier and a new display
name.

**Parameters:** resource `User`, operation `Update`.

**Expect:** the output contains the updated user result, and the returned user
reflects the new display name.

### Test: get all ticket fields

**Given** an execution with valid credentials and no required item identifier.

**Parameters:** resource `Ticket Field`, operation `Get all`.

**Expect:** a successful output representing the returned system and custom
ticket-field collection. An empty collection is accepted when the account has no
matching fields.

### Test: organization count and not-found error

**Given** valid credentials, run the Organization `Count` operation and then run
an item-scoped `Get` with an identifier that does not exist.

**Expect:** count returns a successful count result; the missing organization
produces an execution error rather than an empty success item.

### Test: ticket tag replacement

**Given** a ticket currently tagged `old` and an Update operation whose complete
tag list is `urgent`.

**Expect:** the resulting ticket has `urgent` and no longer has `old`, unless
the caller explicitly included `old` in the replacement list.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, resources, operations | documented | Confirmed by the public node page and isolated descriptor metadata. |
| Authentication methods and credential prerequisites | documented | Confirmed by the public Zendesk credentials page. |
| Main input/output channels | documented | Confirmed by isolated public descriptor metadata; the public page focuses on operations. |
| Per-item request scheduling and output item wrapping | inferred | Follows the OpenFlow item contract and common operation-node behavior; exact service response envelope is intentionally not prescribed. |
| Required fields for each operation | partial | The public overview lists operations but does not enumerate every operation-specific field. Implementers must validate against the selected service operation without copying a third-party schema. |
| Error-item representation and retries | inferred | Delegated to OpenFlow runtime conventions. |
| Ticket tag replacement | documented | Explicit warning on the public Zendesk node page. |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/zendesk.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
