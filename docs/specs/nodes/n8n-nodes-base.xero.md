# n8n-nodes-base.xero

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.xero.md (Public docs only)
- https://docs.n8n.io/integrations/builtin/credentials/xero.md (Public docs only)

## Wire format
- **Type string:** `n8n-nodes-base.xero`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Xero OAuth2 credential (see Credentials section)

## Parameters
This node works with Xero business objects such as contacts and invoices.  The main configuration is the **Operation** selector, which chooses the desired Xero API action (for example, creating a contact, retrieving an invoice, listing all invoices, updating a contact, etc.).  The **Resource** selector indicates the target object type (`contact` or `invoice`).  Optional **Custom fields** can be used to pass through any additional key‑value pairs that the Xero API permits.  **Filters / Query parameters** allow standard Xero query options (such as `status`, `fromDate`, `toDate`) to be applied when listing resources.

## Runtime behavior
### Input
An incoming item must carry a payload that contains the data required for the selected Xero operation.  The node does not transform the payload; it passes it directly to the Xero API.

### Output
The node returns the raw response from Xero, wrapped in an item.  For create, get, or list actions the response typically contains a `data` field with the affected resource.  For update actions the response contains the updated resource.  When an error occurs the item is marked as failed unless `continueOnFail` is enabled.

### Error handling
By default, a failed Xero API call results in a failed item, stopping further processing of the current workflow branch.  A configuration option can enable `continueOnFail`, allowing the node to emit an error record and continue with subsequent items.

### Expressions
Some parameter values support expression syntax, enabling dynamic construction of values (for instance, building a reference to a previously received item field to use as a reference identifier in the Xero request).

## Acceptance tests
Below are sample test cases that verify correct functional behavior.

### Test: createContact
**Given** an item with payload:
```json
{
  "json": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com"
  }
}
```
**When** the node executes `createContact` on the `contact` resource.
**Then** the output contains an item with a `data` object that includes the newly created contact's identifier and core fields.

### Test: getContact
**Given** an item holding the identifier of an existing contact (e.g., `"1234"`).
**When** the node executes `getContact` on the `contact` resource.
**Then** the output must contain the matching contact record with fields that reflect the input.

### Test: listInvoicesPaginated
**Given** multiple invoice items in the workflow.
**When** the node runs `listInvoices` without additional filter parameters.
**Then** the output items each contain invoice data structures returned by Xero, and the count of output items corresponds to the number of input items (subject to Xero pagination limits).

(Any additional test cases can be added to cover update and error scenarios.)

## Gaps / confidence
| Topic | Documented / Inferred | Notes |
|-------|----------------------|-------|
| Complete list of supported Xero actions | Documented for core contact and invoice operations (create, get, list, update) | Additional specialized actions may exist but are not covered here. |
| Exact JSON shape of request and response bodies | Partially documented in Xero API reference; inferred for generic constructs | Implementation must align with official Xero request/response contracts. |
| Default handling of optional fields | Inferred as empty or optional | Clear default behavior must be defined during implementation. |
| Detailed error response format | Generally described; must map Xero error payloads to OpenFlow error contracts | Implementation should preserve error codes and messages where relevant. |
| Pagination mechanism details | Documented for list endpoints | Pagination parameters must be passed through as query options. |

## OpenFlow mapping
- **Definition group:** `core` | `xero` | `trigger` | `transform`
- **Executor file:** `src/lib/engine/executors/xeroNode.ts`
- **SDK usage:** `defineNode` with native `ExecutionContext` only

(Any implementation must follow the above mapping but is not part of this specification.)