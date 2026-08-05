---
type: n8n-nodes-base.mautic
displayName: Mautic
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Mautic

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mautic.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mautic.md | Public docs only |
| https://devdocs.mautic.org/en/5.x/rest_api/contacts.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/companies.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/campaigns.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/segments.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/emails.html | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.mautic`
- **Aliases:** (none documented)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Mautic credentials with two authentication methods: Basic auth (URL + username + password) or OAuth2 (URL + client ID + client secret). The Mautic instance must have the API enabled in Configuration > API Settings.

## Parameters

The node exposes a two-level resource/operation selection followed by the fields required by the selected operation. OpenFlow should present these as ordinary typed configuration rather than reproducing the original UI nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | selection | — | yes | always | One of: Campaign Contact, Company, Company Contact, Contact, Contact Segment, Segment Email. |
| `operation` | selection | — | yes | resource-dependent | Campaign Contact: add or remove. Company: create, delete, get, getAll, update. Company Contact: add or remove. Contact: create, delete, edit points, manage DNC (add/remove don't contact), get, getAll, send email, update. Contact Segment: add or remove. Segment Email: send. |
| resource identifier(s) | string / expression | — | action-dependent | operation-dependent | Contact ID, Company ID, Campaign ID, Segment ID, Email ID, or point delta as needed by the selected operation. |
| request fields | typed values / expressions | — | action-dependent | operation-dependent | Contact/company field values by alias (e.g. firstname, lastname, email, companyname, companycity) and options like ipAddress, owner, overwriteWithBlank, or tags as needed by the selected Mautic API operation. |
| pagination / query controls | typed values / expression | service default | optional | getAll / get list operations | search filter, start offset, limit, orderBy, orderByDir, and publishedOnly as supported by the selected resource's list endpoint. |

Expressions are allowed for values sent to the service, including identifiers and field values. The node resolves expressions per input item.

## Runtime behavior

### Input

For each incoming item, execute the configured Mautic action using the item's resolved expressions and the configured credential. When no input fields carry meaningful data (static-only configuration), the node still performs one action per incoming item based on the fixed node parameters.

Authentication and the base URL come from the credential. All resource/operation choices map to Mautic's REST API endpoints under `/api/`. The executor must not silently substitute a different resource or operation.

### Output

Return one OpenFlow item for each successfully processed input item. The `json` value contains the service response at the outcome level:

- **Create / update / get:** the full contact, company, campaign, or segment object returned by the Mautic API.
- **getAll / list:** the collection object containing `total` and the array or dictionary of entities.
- **Delete:** the deleted entity object returned by the Mautic API.
- **Add / remove contact (campaign, company, segment):** the success confirmation object (e.g. `{ "success": true }`).
- **Edit points:** the success confirmation object.
- **Manage DNC:** the updated contact object or success confirmation.
- **Send email (contact):** the success confirmation object.
- **Segment Email send:** the result object containing `success`, `sentCount`, and `failedCount`.

Preserve item order for per-item execution. For list operations the single output item carries the full collection response; the node does not split a collection into individual items.

### Errors

Authentication failures, invalid configuration, rejected requests, missing resources, rate limits, and service errors fail the item or node with an actionable error. Do not convert an HTTP/API error into an empty successful result. If `continueOnFail` is enabled per the OpenFlow SDK contract, return an item-level error representation; otherwise propagate the error and stop normal execution.

### Expressions

Resolve expressions in identifiers, request fields, query controls, and other configurable values against the current input item. Static values must remain valid when no expression is used. Do not evaluate arbitrary code as part of this node.

## Acceptance tests

### Test: create and retrieve a contact

**Given** one input item and valid Basic auth credentials, configure the Contact create operation with firstname, lastname, and email.

**Expect:** exactly one output item whose JSON contains the Mautic API response identifying the newly created contact, including the contact's id, fields, and points. Then configure Contact get using the returned contact ID and verify the output contains the same contact data.

### Test: list contacts with search and pagination

**Given** valid credentials and a Contact getAll operation configured with a search filter (e.g. email domain) and a limit.

**Expect:** one output item containing the Mautic list response with `total` count and a `contacts` object whose entries match the search criteria and respect the limit.

### Test: add contact to a campaign and verify membership

**Given** valid contact ID and campaign ID, configure Campaign Contact add operation.

**Expect:** output is a success confirmation object. Then verify using an HTTP-based read (or Contact get campaigns) that the contact is listed as a member of the campaign.

### Test: manage DNC status

**Given** a valid contact ID, configure Contact manage DNC to add the contact to the don't contact list for the email channel.

**Expect:** a successful response. Then remove the contact from DNC and expect the subsequent response also confirms success.

### Test: edit points

**Given** a valid contact ID and a positive point delta, configure Contact edit points.

**Expect:** output is `{ "success": true }`. The contact's point total should be increased by the delta on the server.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation inventory | documented | Full list from the public n8n Mautic node page under "Operations". |
| External API contract | documented | Mautic REST API developer docs are authoritative for endpoint paths, parameters, and response shapes. |
| Credential types | documented | Basic auth and OAuth2 documented on the n8n credentials page. |
| Input/output channels | inferred | Standard action-node mapping; the public page does not specify channel metadata. |
| Exact parameter names, defaults, and display conditions | not specified | Intentionally abstracted; the exact UI parameter names from the original node are not reconstructed. The Mautic API docs define the wire-level parameter names. |
| Per-item execution and output itemization | inferred | Follows the OpenFlow item contract and normal action-node behavior. |
| Response shapes for all operations | documented | The Mautic API docs define response schemas for contacts, companies, campaigns, segments, and emails. |

Confidence is high for the resource/action inventory, authentication boundary, and external API contract. Confidence is medium for the exact internal parameter structure because the n8n node's UI configuration is not reconstructed from source.

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/mautic.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
