# Factory job — SPEC (clean-room half A)

**Model:** `xai/grok-4.5`  
**Node type:** `n8n-nodes-base.nocodb`  
**Batch:** `queue`  
**Cycle:** `1` of `4`

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nocodb
- https://docs.nocodb.com/

## Wire format
- **Type string:** `n8n-nodes-base.nocodb`
- **Inputs:** supports operations: Create, Delete, Get, Get Many, Update a row
- **Outputs:** For Get / Get Many returns rows; other operations return success status
- **Credentials:** NocoDB credentials (url, username, password / API token)

## Parameters
- **Table name:** The target database table (string)
- **Operation:** One of Create, Delete, Get, Get Many, Update
- **Filter (for Get):** Query parameters to select rows (object)
- **Update data (for Update):** Fields to update (object)
- **Credentials:** As above

## Runtime behavior
- Creates a new row in the specified table when operation is Create
- Deletes rows matching filter when operation is Delete
- Retrieves rows matching filter when operation is Get or Get Many
- Updates rows matching filter with provided data when operation is Update
- Errors are propagated as execution failures; error handling follows n8n generic error handling

## Acceptance tests
1. Create a row with given data and verify row exists with same attributes
2. Retrieve the row and verify returned fields match input
3. Update the row with new data and verify fields are updated
4. Delete the row and verify it no longer exists
5. Attempt to Get on non-existent row and verify proper error is returned

## Gaps / confidence
- Exact parameter schema (field names, types) not publicly documented; behavior inferred from typical n8n node patterns and NocoDB API documentation
- Default values and validation rules are unknown

## OpenFlow mapping
- **Definition group:** `n8n-nodes-base.nocodb`
- **Intended executor filename:** `nodes/nocodb/Executor.ts`